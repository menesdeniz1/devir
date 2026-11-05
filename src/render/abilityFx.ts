import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { abilityTexture, BOAR_RIG, OX_RIG, prewarmAbilityArt } from '../art/abilityArt';
import { clamp01, easeOutCubic, lerp, TAU } from '../art/anim';
import { AGE_KIT, BACK_LIMB_TINT, INK, TEAM } from '../art/palette';
import { ABILITIES } from '../data/abilities';
import { WORLD } from '../data/world';
import type { AbilityZoneState, PendingStrikeState, SideId } from '../sim/types';
import { UNIT_FEET_Y } from './constants';

// ---- Yetenek efekti çizim sabitleri (denge değil; yalnız görünüm, ms ve mantıksal px) ----
const FX = {
  groundY: UNIT_FEET_Y,
  /** Aynı anda en çok anlık efekt (sürü, kubbe, sahipsiz patlama); fazlasında en eski düşer. */
  maxTransient: 8,
  /** Havuzda bekletilen en çok sprite. */
  poolMax: 160,

  // Sürü Hücumu
  herdSpeed: 0.55,
  herdGap: 38,
  herdPerPx: 1 / 50,
  herdMin: 2,
  herdMax: 6,
  herdFadePx: 34,
  herdLead: 20,
  boarStrideMs: 210,
  oxStrideMs: 270,
  legSwing: 0.75,
  dustEveryMs: 55,
  dustLifeMs: 460,
  dustCount: 12,
  impactAtMs: 230,
  impactMs: 300,
  impactJoltPx: 5,

  // Ateş Hendeği
  flameSpacing: 20,
  flameMax: 12,
  lipSpacing: 34,
  lipMax: 7,
  emberCount: 6,
  emberLifeMs: 900,
  emberRisePx: 70,
  igniteMs: 260,
  zoneFadeMs: 380,
  /** Sürenin bu son payında alevler söner. */
  dyingShare: 0.3,
  flareMs: 320,
  flameSwapMs: 230,

  // Çivi Kapanı
  caltropSpacing: 13,
  caltropMin: 4,
  caltropMax: 22,
  scatterMs: 280,
  scatterStaggerMs: 14,
  glintEveryMs: 520,
  glintMs: 320,
  zoneHalfDepth: 17,
  barInset: 14,
  barY: 24,
  barH: 6,

  // Baraj Ateşi
  shellSpacing: 55,
  shellMin: 2,
  shellMax: 6,
  fallMs: 380,
  fallHeight: 520,
  fallDx: 150,
  landStaggerMs: 30,
  /** Uyarının yanıp sönme sıklığı (Hz); en çok 3 (PRD GR-06 ile aynı sınırın altında, yerel). */
  blinkHzMin: 2,
  blinkHzMax: 3,
  signLift: 150,
  reticleStartScale: 1.7,
  burstMs: 260,
  smokeMs: 800,
  scorchMs: 1500,
  warnFadeMs: 160,

  // Durağanlık Alanı
  domeMaxH: 150,
  domeHRatio: 0.55,
  domeRiseMs: 260,
  domeEndMs: 380,
  glossPeriodMs: 1500,
  domePulseMs: 1600,
  sparkCount: 6,
  sparkLifeMs: 1300,
} as const;

const COLOR_HAZARD = 0xffd23f;
const COLOR_SCORCHED = 0x3b2418;
const COLOR_PIT = 0x24150f;
const COLOR_PIT_GLOW = 0xff8a2a;
const COLOR_PIT_EMBER = 0xffd35a;
const COLOR_TRACK = 0x2a2438;
const COLOR_NEON = AGE_KIT[5].glow.shade;
const COLOR_NEON_HI = AGE_KIT[5].glow.base;
const COLOR_HEX = 0xe9b8ff;

type FxKind = 'stampede' | 'trench' | 'caltrops' | 'barrage' | 'stasis';
/** Çağ → efekt (GDD §7: çağ başına bir yetenek). Kimlik değişse de çağ üzerinden eşlenir. */
const KIND_BY_AGE: Readonly<Record<number, FxKind>> = { 1: 'stampede', 2: 'trench', 3: 'caltrops', 4: 'barrage', 5: 'stasis' };

function abilityDef(id: string) {
  return ABILITIES.find((a) => a.id === id);
}

function fxKind(id: string): FxKind | undefined {
  const def = abilityDef(id);
  return def === undefined ? undefined : KIND_BY_AGE[def.age];
}

const MS_PER_TICK = 1000 / WORLD.tickRate;

/** Kararlı sözde rastgele [0,1) (yerleşim her karede aynı kalsın). */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function setTexture(s: Sprite, tex: Texture): void {
  if (s.texture === tex) return;
  s.texture = tex;
  s.anchor.set(tex.defaultAnchor?.x ?? 0, tex.defaultAnchor?.y ?? 0);
}

/** Paylaşılan sprite havuzu: efektler bitince sprite'lar geri döner (karede nesne üretimi yok). */
class SpritePool {
  private readonly free: Sprite[] = [];

  take(tex: Texture, parent: Container): Sprite {
    const s = this.free.pop() ?? new Sprite();
    s.texture = tex;
    s.anchor.set(tex.defaultAnchor?.x ?? 0, tex.defaultAnchor?.y ?? 0);
    s.position.set(0, 0);
    s.scale.set(1);
    s.rotation = 0;
    s.alpha = 1;
    s.tint = 0xffffff;
    s.visible = true;
    parent.addChild(s);
    return s;
  }

  give(s: Sprite): void {
    s.removeFromParent();
    if (this.free.length < FX.poolMax) this.free.push(s);
    else s.destroy();
  }

  get size(): number {
    return this.free.length;
  }

  destroy(): void {
    for (const s of this.free) s.destroy();
    this.free.length = 0;
  }
}

interface FxEnv {
  pool: SpritePool;
  front: Container;
  ground: Container;
}

type Layer = 'front' | 'ground';

/** Tek efektin ortak işleri: iki katman (zemin: birliklerin altı, ön: üstü), sprite/Graphics sahipliği. */
abstract class Fx {
  readonly front = new Container();
  readonly ground = new Container();
  protected clock = 0;
  private readonly sprites: Sprite[] = [];
  private readonly graphics: Graphics[] = [];

  constructor(
    protected readonly env: FxEnv,
    readonly side: SideId,
    readonly abilityId: string,
    readonly x0: number,
    readonly x1: number,
  ) {
    env.ground.addChild(this.ground);
    env.front.addChild(this.front);
  }

  protected get dir(): 1 | -1 {
    return this.side === 0 ? 1 : -1;
  }

  protected get width(): number {
    return Math.max(1, this.x1 - this.x0);
  }

  protected get cx(): number {
    return (this.x0 + this.x1) / 2;
  }

  protected sprite(name: string | Texture, layer: Layer | Container): Sprite {
    const parent = layer === 'front' ? this.front : layer === 'ground' ? this.ground : layer;
    const s = this.env.pool.take(typeof name === 'string' ? abilityTexture(name) : name, parent);
    this.sprites.push(s);
    return s;
  }

  protected gfx(layer: Layer | Container): Graphics {
    const g = new Graphics();
    (layer === 'front' ? this.front : layer === 'ground' ? this.ground : layer).addChild(g);
    this.graphics.push(g);
    return g;
  }

  matches(side: SideId, abilityId: string, x0: number, x1: number): boolean {
    return this.side === side && this.abilityId === abilityId && this.x0 === x0 && this.x1 === x1;
  }

  get spriteCount(): number {
    return this.sprites.length + this.graphics.length;
  }

  /** dtMs ilerletir; false: efekt bitti. */
  abstract step(dtMs: number): boolean;

  dispose(): void {
    for (const s of this.sprites) this.env.pool.give(s);
    this.sprites.length = 0;
    for (const g of this.graphics) g.destroy();
    this.graphics.length = 0;
    this.front.destroy({ children: true });
    this.ground.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Sürü Hücumu (İlkel): domuz ve yaban öküzü sürüsü alanın içinden yetenek sahibinin yönünde geçer.
// Takım ipucu: koşu yönü (oyuncu sağa, rakip sola), böğürde amblem, takım renginde savaş boyası.

interface Animal {
  root: Container;
  body: Sprite;
  /** Uzak ön, uzak arka, yakın ön, yakın arka. */
  legs: Sprite[];
  shadow: Sprite;
  big: boolean;
  off: number;
  depth: number;
  phase: number;
}

interface Puff {
  s: Sprite;
  age: number;
  vx: number;
}

class HerdFx extends Fx {
  private readonly animals: Animal[] = [];
  private readonly puffs: Puff[] = [];
  private puffIdx = 0;
  private nextPuffMs = 0;
  private readonly impacts: Sprite[] = [];
  private hits = -1;
  private impactClock = -1;
  private readonly startX: number;
  private readonly runMs: number;

  constructor(env: FxEnv, side: SideId, abilityId: string, x0: number, x1: number) {
    super(env, side, abilityId, x0, x1);
    const n = Math.max(FX.herdMin, Math.min(FX.herdMax, Math.round(this.width * FX.herdPerPx)));
    const depths = [0, 11, -9, 6, -5, 13];
    // Toz önce eklenir: hayvanlar tozun önünde koşar.
    for (let i = 0; i < FX.dustCount; i++) {
      const s = this.sprite('dust', 'front');
      s.visible = false;
      this.puffs.push({ s, age: Infinity, vx: 0 });
    }
    const specs = Array.from({ length: n }, (_, i) => ({
      big: i % 3 === 0,
      off: -i * FX.herdGap - hash01(x0 + i * 31) * 8,
      depth: depths[i % depths.length]!,
      phase: hash01(x1 + i * 17) * TAU,
    }));
    specs.sort((a, b) => a.depth - b.depth);
    for (const sp of specs) {
      const root = new Container();
      this.front.addChild(root);
      const shadow = this.sprite('shadow', root);
      shadow.scale.set(sp.big ? 1.7 : 1.15, 1);
      const legTex = sp.big ? 'ox.leg' : 'boar.leg';
      const legs = [this.sprite(legTex, root), this.sprite(legTex, root)];
      for (const l of legs) l.tint = BACK_LIMB_TINT;
      const body = this.sprite(`${sp.big ? 'ox' : 'boar'}.body.${side}`, root);
      legs.push(this.sprite(legTex, root), this.sprite(legTex, root));
      root.scale.x = this.dir;
      this.animals.push({ root, body, legs, shadow, ...sp });
    }
    const edgeStart = this.dir > 0 ? x0 : x1;
    this.startX = edgeStart - this.dir * FX.herdLead;
    const travel = this.width + FX.herdFadePx + FX.herdLead * 2 + (n - 1) * FX.herdGap + 10;
    this.runMs = travel / FX.herdSpeed;
  }

  hit(hits: number): void {
    this.hits = hits;
  }

  step(dtMs: number): boolean {
    this.clock += dtMs;
    const dir = this.dir;
    const edgeStart = dir > 0 ? this.x0 : this.x1;
    const edgeEnd = dir > 0 ? this.x1 : this.x0;
    const leadX = this.startX + dir * FX.herdSpeed * Math.min(this.clock, this.runMs);
    const running = this.clock < this.runMs;

    // Vuruş anı: sürü alana girince "güm" çizgileri ve yer tozu (vuruş yoksa yalnız toz).
    if (this.impactClock < 0 && this.clock >= FX.impactAtMs && this.hits !== -1) this.startImpact();
    if (this.impactClock >= 0) this.impactClock += dtMs;
    const jolt = this.impactClock >= 0 && this.impactClock < FX.impactMs ? Math.sin((this.impactClock / FX.impactMs) * Math.PI * 3) * (1 - this.impactClock / FX.impactMs) : 0;

    for (const a of this.animals) {
      const x = leadX + dir * a.off;
      const fromStart = (x - edgeStart) * dir;
      const toEnd = (edgeEnd - x) * dir;
      const alpha = running ? clamp01((fromStart + FX.herdFadePx) / FX.herdFadePx) * clamp01((toEnd + FX.herdFadePx) / FX.herdFadePx) : 0;
      a.root.visible = alpha > 0.01;
      if (!a.root.visible) continue;
      a.root.alpha = alpha;
      a.root.position.set(x, FX.groundY + a.depth);
      const rig = a.big ? OX_RIG : BOAR_RIG;
      const ph = (this.clock / (a.big ? FX.oxStrideMs : FX.boarStrideMs)) * TAU + a.phase;
      const bob = -Math.abs(Math.sin(ph)) * (a.big ? 4 : 3) + jolt * FX.impactJoltPx;
      a.body.y = bob;
      a.body.rotation = Math.sin(ph) * 0.05;
      const swing = FX.legSwing;
      const angles = [Math.sin(ph + 0.5) * swing, Math.sin(ph + Math.PI + 0.5) * swing, Math.sin(ph) * swing, Math.sin(ph + Math.PI) * swing];
      const xs = [rig.shoulderX + rig.legSpread, rig.hipX + rig.legSpread, rig.shoulderX, rig.hipX];
      a.legs.forEach((l, i) => {
        l.position.set(xs[i]!, rig.jointY + bob);
        l.rotation = angles[i]!;
      });
      a.shadow.alpha = 1 + bob * 0.04;
    }

    // Toz: koşan hayvanların arkasından.
    if (running && this.clock >= this.nextPuffMs) {
      this.nextPuffMs = this.clock + FX.dustEveryMs;
      const a = this.animals[Math.floor(this.clock / FX.dustEveryMs) % this.animals.length]!;
      if (a.root.visible && a.root.alpha > 0.3) this.emitPuff(a.root.x - dir * (a.big ? 30 : 18), FX.groundY + a.depth - 3, -dir * 0.03);
    }
    let puffsAlive = false;
    for (const p of this.puffs) {
      if (!Number.isFinite(p.age)) continue;
      p.age += dtMs;
      const t = p.age / FX.dustLifeMs;
      if (t >= 1) {
        p.age = Infinity;
        p.s.visible = false;
        continue;
      }
      puffsAlive = true;
      p.s.x += p.vx * dtMs;
      p.s.y -= 0.022 * dtMs;
      p.s.scale.set(0.5 + 0.9 * t);
      p.s.alpha = 0.85 * (1 - t);
    }

    let impactAlive = false;
    if (this.impactClock >= 0) {
      const t = this.impactClock / FX.impactMs;
      impactAlive = t < 1;
      this.impacts.forEach((s, i) => {
        s.visible = t < 1;
        s.scale.set(0.55 + 0.6 * easeOutCubic(clamp01(t * 2)));
        s.alpha = 1 - clamp01((t - 0.5) / 0.5);
        s.rotation = (i % 2 === 0 ? -1 : 1) * 0.08;
      });
    }
    return running || puffsAlive || impactAlive || (this.hits !== -1 && this.impactClock < 0);
  }

  private emitPuff(x: number, y: number, vx: number): void {
    const p = this.puffs[this.puffIdx]!;
    this.puffIdx = (this.puffIdx + 1) % this.puffs.length;
    p.age = 0;
    p.vx = vx;
    p.s.visible = true;
    p.s.position.set(x, y);
    p.s.scale.set(0.5);
  }

  private startImpact(): void {
    this.impactClock = 0;
    const k = Math.max(2, Math.min(4, Math.round(this.width / 90)));
    for (let i = 0; i < k; i++) {
      const x = lerp(this.x0, this.x1, (i + 0.5) / k);
      if (this.hits > 0) {
        const s = this.sprite('impact', 'front');
        s.position.set(x + (hash01(this.x0 + i) - 0.5) * 20, FX.groundY + 6 + hash01(this.x1 + i) * 6);
        this.impacts.push(s);
      }
      this.emitPuff(x - 10, FX.groundY + 4, -0.05);
      this.emitPuff(x + 10, FX.groundY + 4, 0.05);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Süreli alanlar: durum her karede `bind` ile gelir; alan durumdan çıkınca `expire` ile söner.

abstract class ZoneFx extends Fx {
  protected life = 1;
  protected expiredAt = -1;
  private readonly totalTicks: number;
  seenFrame = -1;

  constructor(env: FxEnv, readonly zoneId: number, side: SideId, abilityId: string, x0: number, x1: number) {
    super(env, side, abilityId, x0, x1);
    const sec = abilityDef(abilityId)?.zone?.durationSec ?? 1;
    this.totalTicks = Math.max(1, sec * WORLD.tickRate);
  }

  bind(zone: AbilityZoneState): void {
    this.life = clamp01(zone.ticksLeft / this.totalTicks);
  }

  expire(): void {
    if (this.expiredAt < 0) this.expiredAt = this.clock;
  }

  get expired(): boolean {
    return this.expiredAt >= 0;
  }

  /** Bitiş solması (1 → 0). */
  protected endFade(): number {
    return this.expiredAt < 0 ? 1 : 1 - clamp01((this.clock - this.expiredAt) / FX.zoneFadeMs);
  }

  protected finished(): boolean {
    return this.expiredAt >= 0 && this.clock - this.expiredAt >= FX.zoneFadeMs;
  }

  abstract flare(hits: number): void;
}

/** Bölge sınır kazıkları (iki uç, flama düşmana doğru). */
function placePennants(fx: { x0: number; x1: number }, take: () => Sprite, dir: 1 | -1, y: number): Sprite[] {
  return [fx.x0, fx.x1].map((x) => {
    const s = take();
    s.position.set(x, y);
    s.scale.set(dir * 0.9, 0.9);
    return s;
  });
}

// Ateş Hendeği (Antik): alan boyunca kömürleşmiş hendek, arkada yüksek alevler (birliklerin altında),
// önde alçak alev dudakları (diz altı), yükselen közler. Son %30'da söner. Takım ipucu: uç kazıklarında flama.

interface Flame {
  s: Sprite;
  base: number;
  phase: number;
  alt: boolean;
}

class TrenchFx extends ZoneFx {
  private readonly char: Graphics;
  private readonly glow: Graphics;
  private readonly flames: Flame[] = [];
  private readonly lips: Flame[] = [];
  private readonly embers: Sprite[] = [];
  private readonly pennants: Sprite[];
  private flareClock = Infinity;
  private readonly texA = abilityTexture('flame.a');
  private readonly texB = abilityTexture('flame.b');

  constructor(env: FxEnv, zoneId: number, side: SideId, abilityId: string, x0: number, x1: number) {
    super(env, zoneId, side, abilityId, x0, x1);
    const gy = FX.groundY;
    const w = this.width;
    this.char = this.gfx('ground');
    this.char.roundRect(x0 - 4, gy - 11, w + 8, 26, 12).fill({ color: COLOR_SCORCHED, alpha: 0.5 });
    if (w > 12) this.char.roundRect(x0 + 4, gy - 5, w - 8, 13, 6).fill(COLOR_PIT).stroke({ width: 2, color: INK });
    this.glow = this.gfx('ground');
    if (w > 20) {
      this.glow.roundRect(x0 + 8, gy - 1, w - 16, 5, 2.5).fill(COLOR_PIT_GLOW);
      for (let x = x0 + 12; x < x1 - 14; x += 14) this.glow.rect(x, gy, 6, 2).fill(COLOR_PIT_EMBER);
    }
    this.pennants = placePennants(this, () => this.sprite(`pennant.${side}`, 'ground'), this.dir, gy - 12);
    const n = Math.max(2, Math.min(FX.flameMax, Math.floor(w / FX.flameSpacing)));
    for (let i = 0; i < n; i++) {
      const s = this.sprite('flame.a', 'ground');
      s.position.set(x0 + ((i + 0.5) * w) / n + (hash01(x0 + i * 3) - 0.5) * 8, gy - 2 - hash01(x1 + i) * 4);
      this.flames.push({ s, base: 0.75 + hash01(i * 7 + x0) * 0.3, phase: hash01(i * 13 + x1) * TAU, alt: i % 2 === 1 });
    }
    const m = Math.max(1, Math.min(FX.lipMax, Math.floor(w / FX.lipSpacing)));
    for (let i = 0; i < m; i++) {
      const s = this.sprite('flame.lip', 'front');
      s.position.set(x0 + ((i + 0.5) * w) / m, gy + 10);
      this.lips.push({ s, base: 0.7 + hash01(i * 5 + x1) * 0.2, phase: hash01(i * 3 + x0) * TAU, alt: false });
    }
    for (let i = 0; i < FX.emberCount; i++) this.embers.push(this.sprite('ember', 'front'));
  }

  flare(hits: number): void {
    if (hits > 0) this.flareClock = 0;
  }

  step(dtMs: number): boolean {
    this.clock += dtMs;
    this.flareClock += dtMs;
    const ignite = easeOutCubic(clamp01(this.clock / FX.igniteMs));
    const dying = this.life >= FX.dyingShare ? 1 : 0.2 + 0.8 * (this.life / FX.dyingShare);
    const end = this.endFade();
    const k = ignite * dying * end;
    const flare = 1 + 0.3 * (1 - clamp01(this.flareClock / FX.flareMs));
    const t = this.clock;

    for (const f of this.flames) {
      const flick = 0.86 + 0.14 * Math.sin(t / 120 + f.phase) + 0.06 * Math.sin(t / 53 + f.phase * 1.7);
      f.s.scale.set(f.base * (0.92 + 0.08 * Math.sin(t / 150 + f.phase)), f.base * k * flick * flare);
      const swap = Math.floor((t + f.phase * 100) / FX.flameSwapMs) % 2 === 0;
      setTexture(f.s, swap !== f.alt ? this.texA : this.texB);
      f.s.alpha = clamp01(k * 1.6);
    }
    for (const f of this.lips) {
      f.s.scale.set(f.base * (1 + 0.1 * Math.sin(t / 170 + f.phase)), f.base * k * (0.85 + 0.15 * Math.sin(t / 90 + f.phase)) * flare);
      f.s.alpha = clamp01(k * 1.6) * 0.95;
    }
    this.embers.forEach((s, i) => {
      const life = (t + (i * FX.emberLifeMs) / this.embers.length) / FX.emberLifeMs;
      const cycle = Math.floor(life);
      const p = life - cycle;
      const x = lerp(this.x0 + 8, this.x1 - 8, hash01(cycle * 7 + i * 19 + this.x0));
      s.position.set(x + Math.sin(p * 5 + i) * 5, FX.groundY - 6 - p * FX.emberRisePx);
      s.alpha = k * (1 - p);
      s.scale.set(0.8 + 0.4 * (1 - p));
    });
    this.glow.alpha = k;
    this.char.alpha = end * (0.5 + 0.5 * ignite);
    for (const p of this.pennants) p.alpha = end;
    return !this.finished();
  }
}

// Çivi Kapanı (Orta): yere saçılan demir çiviler (yetenek sahibinin tarafından atılmış gibi düşer),
// alan sınırında takım renginde kesikli uyarı çizgisi, uç kazıkları ve önde kalan süre çubuğu.

interface Caltrop {
  s: Sprite;
  x: number;
  y: number;
  delay: number;
}

function dashed(g: Graphics, ax: number, ay: number, bx: number, by: number, dash: number, gap: number): void {
  const len = Math.hypot(bx - ax, by - ay);
  if (len <= 0) return;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    g.moveTo(ax + ux * d, ay + uy * d).lineTo(ax + ux * e, ay + uy * e);
  }
}

class CaltropsFx extends ZoneFx {
  private readonly border: Graphics;
  private readonly track: Graphics | null;
  private readonly bar: Sprite | null;
  private readonly barW: number;
  private readonly caltrops: Caltrop[] = [];
  private readonly glints: Sprite[] = [];
  private readonly glintBorn: number[] = [];
  private readonly pennants: Sprite[];
  private glintClock = 0;
  private glintCount = 0;

  constructor(env: FxEnv, zoneId: number, side: SideId, abilityId: string, x0: number, x1: number) {
    super(env, zoneId, side, abilityId, x0, x1);
    const gy = FX.groundY;
    const w = this.width;
    const hd = FX.zoneHalfDepth;
    const team = TEAM[side].cloth.base;
    this.border = this.gfx('ground');
    const drawBorder = (width: number, color: number): void => {
      dashed(this.border, x0, gy - hd, x1, gy - hd, 10, 7);
      dashed(this.border, x0, gy + hd, x1, gy + hd, 10, 7);
      dashed(this.border, x0 + 4, gy - hd, x0 - 4, gy + hd, 8, 5);
      dashed(this.border, x1 + 4, gy - hd, x1 - 4, gy + hd, 8, 5);
      this.border.stroke({ width, color, cap: 'round' });
    };
    drawBorder(5, INK);
    drawBorder(2.6, team);
    this.pennants = placePennants(this, () => this.sprite(`pennant.${side}`, 'ground'), this.dir, gy - hd);

    const n = Math.max(FX.caltropMin, Math.min(FX.caltropMax, Math.floor(w / FX.caltropSpacing)));
    const specs = Array.from({ length: n }, (_, i) => ({
      x: lerp(x0 + 6, x1 - 6, (i + 0.15 + hash01(x0 + i * 7) * 0.7) / n),
      y: gy - 12 + hash01(x1 + i * 11) * 26,
      i,
    }));
    specs.sort((a, b) => a.y - b.y);
    for (const sp of specs) {
      const s = this.sprite(hash01(sp.i * 5 + x0) < 0.5 ? 'caltrop.a' : 'caltrop.b', 'ground');
      s.scale.set((hash01(sp.i * 3 + x1) < 0.5 ? -1 : 1) * (0.9 + hash01(sp.i) * 0.25), 0.9 + hash01(sp.i) * 0.25);
      this.caltrops.push({ s, x: sp.x, y: sp.y, delay: (hash01(sp.i * 17 + x0) * n * FX.scatterStaggerMs) | 0 });
    }
    for (let i = 0; i < 2; i++) {
      const g = this.sprite('glint', 'ground');
      g.visible = false;
      this.glints.push(g);
      this.glintBorn.push(0);
    }

    this.barW = w - FX.barInset * 2;
    if (this.barW > 10) {
      this.track = this.gfx('ground');
      this.track.roundRect(x0 + FX.barInset, gy + FX.barY, this.barW, FX.barH, FX.barH / 2).fill(COLOR_TRACK).stroke({ width: 2, color: INK });
      this.bar = this.sprite(Texture.WHITE, 'ground');
      this.bar.anchor.set(0.5);
      this.bar.tint = team;
      this.bar.position.set(this.cx, gy + FX.barY + FX.barH / 2);
    } else {
      this.track = null;
      this.bar = null;
    }
  }

  flare(hits: number): void {
    if (hits > 0) this.glintClock = FX.glintEveryMs;
  }

  step(dtMs: number): boolean {
    this.clock += dtMs;
    const end = this.endFade();
    for (const c of this.caltrops) {
      const p = clamp01((this.clock - c.delay) / FX.scatterMs);
      const q = 1 - p;
      c.s.visible = this.clock >= c.delay;
      c.s.position.set(c.x - this.dir * 24 * q, c.y - 40 * q * q + (p > 0.7 && p < 1 ? -Math.sin(((p - 0.7) / 0.3) * Math.PI) * 4 : 0));
      c.s.alpha = end;
    }
    // Pırıltı: rastgele bir çivide kısa parlama (vuruşta hemen).
    this.glintClock += dtMs;
    if (this.glintClock >= FX.glintEveryMs && this.expiredAt < 0) {
      this.glintClock = 0;
      const gi = this.glintCount % this.glints.length;
      const g = this.glints[gi]!;
      const c = this.caltrops[Math.floor(hash01(this.glintCount * 7 + this.x0) * this.caltrops.length)]!;
      this.glintCount++;
      g.visible = true;
      g.position.set(c.x - 2, c.y - 8);
      this.glintBorn[gi] = this.clock;
    }
    for (let gi = 0; gi < this.glints.length; gi++) {
      const g = this.glints[gi]!;
      if (!g.visible) continue;
      const p = (this.clock - this.glintBorn[gi]!) / FX.glintMs;
      if (p >= 1) {
        g.visible = false;
        continue;
      }
      g.scale.set(Math.sin(p * Math.PI) * 0.8);
      g.rotation = p * 0.8;
      g.alpha = end;
    }
    if (this.bar !== null && this.track !== null) {
      this.bar.width = Math.max(0, (this.barW - 3) * this.life);
      this.bar.height = FX.barH - 2;
      this.bar.alpha = end;
      this.track.alpha = end;
    }
    this.border.alpha = end;
    for (const p of this.pennants) p.alpha = end;
    return !this.finished();
  }
}

// ---------------------------------------------------------------------------------------------
// Baraj Ateşi (Endüstri): gecikme boyunca zeminde takım renkli hedef bandı ve halkası yanıp söner (≤ 3 Hz),
// alanın üstünde uyarı levhası; son anda mermiler yetenek sahibinin tarafından eğik düşer ve patlar.

interface Shell {
  x: number;
  depth: number;
  landAt: number;
  s: Sprite | null;
  burst: Sprite | null;
  smoke: Sprite[];
  scorch: Sprite | null;
  boomClock: number;
}

class StrikeFx extends Fx {
  seenFrame = -1;
  private readonly band: Graphics;
  private readonly reticle: Sprite;
  private readonly sign: Sprite;
  private readonly shells: Shell[] = [];
  private readonly totalMs: number;
  private remainingMs: number;
  private lastTicks = -1;
  private sinceTick = 0;
  private blinkPhase = 0;
  private detonatedAt = -1;

  constructor(
    env: FxEnv,
    readonly strikeId: number,
    side: SideId,
    abilityId: string,
    x0: number,
    x1: number,
    detonated: boolean,
  ) {
    super(env, side, abilityId, x0, x1);
    this.totalMs = Math.max(1, (abilityDef(abilityId)?.delaySec ?? 1) * 1000);
    this.remainingMs = this.totalMs;
    const gy = FX.groundY;
    const w = this.width;
    const hd = FX.zoneHalfDepth;
    const team = TEAM[side].cloth.base;
    this.band = this.gfx('ground');
    this.band.rect(x0, gy - hd, w, hd * 2).fill({ color: team, alpha: 0.16 });
    dashed(this.band, x0, gy - hd, x1, gy - hd, 12, 6);
    dashed(this.band, x0, gy + hd, x1, gy + hd, 12, 6);
    this.band.stroke({ width: 4.6, color: INK });
    dashed(this.band, x0, gy - hd, x1, gy - hd, 12, 6);
    dashed(this.band, x0, gy + hd, x1, gy + hd, 12, 6);
    this.band.stroke({ width: 2.2, color: team });
    // Uçlarda sarı-siyah tehlike şeritleri.
    for (const [bx, sgn] of [
      [x0, 1],
      [x1, -1],
    ] as const) {
      const left = sgn > 0 ? bx : bx - 9;
      this.band.rect(left, gy - hd, 9, hd * 2).fill(COLOR_HAZARD).stroke({ width: 2, color: INK });
      for (let y = gy - hd; y < gy + hd - 2; y += 8) this.band.poly([left, y + 4, left + 9, y, left + 9, y + 4, left, y + 8]).fill(INK);
    }
    this.reticle = this.sprite(`reticle.${side}`, 'ground');
    this.reticle.position.set(this.cx, gy);
    this.sign = this.sprite(`warn.${side}`, 'front');
    this.sign.position.set(this.cx, gy - FX.signLift);

    const n = Math.max(FX.shellMin, Math.min(FX.shellMax, Math.round(w / FX.shellSpacing)));
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => hash01(a * 13 + x0) - hash01(b * 13 + x0));
    for (let i = 0; i < n; i++) {
      this.shells.push({
        x: x0 + ((i + 0.5) * w) / n + (hash01(x1 + i * 5) - 0.5) * 16,
        depth: (hash01(x0 + i * 9) - 0.5) * 16,
        landAt: order.indexOf(i) * FX.landStaggerMs,
        s: null,
        burst: null,
        smoke: [],
        scorch: null,
        boomClock: -1,
      });
    }
    if (detonated) this.detonate();
  }

  bind(strike: PendingStrikeState): void {
    if (strike.ticksLeft !== this.lastTicks) {
      this.lastTicks = strike.ticksLeft;
      this.sinceTick = 0;
    }
    this.remainingMs = Math.max(0, strike.ticksLeft * MS_PER_TICK - this.sinceTick);
  }

  get detonated(): boolean {
    return this.detonatedAt >= 0;
  }

  /** Vuruş anı (abilityImpact) ya da bekleyen vuruş durumdan çıktı: düşmemiş mermiler hemen patlar. */
  detonate(): void {
    if (this.detonatedAt >= 0) return;
    this.detonatedAt = this.clock;
    this.remainingMs = 0;
  }

  step(dtMs: number): boolean {
    this.clock += dtMs;
    this.sinceTick = Math.min(MS_PER_TICK, this.sinceTick + dtMs);
    if (this.detonatedAt < 0 && this.lastTicks >= 0) this.remainingMs = Math.max(0, this.lastTicks * MS_PER_TICK - this.sinceTick);
    const progress = 1 - clamp01(this.remainingMs / this.totalMs);
    const hz = lerp(FX.blinkHzMin, FX.blinkHzMax, progress);
    this.blinkPhase += (dtMs / 1000) * hz * TAU;
    const pulse = 0.5 + 0.5 * Math.cos(this.blinkPhase);
    const warn = this.detonatedAt < 0 ? 1 : 1 - clamp01((this.clock - this.detonatedAt) / FX.warnFadeMs);
    this.band.alpha = (0.55 + 0.45 * pulse) * warn;
    this.reticle.alpha = (0.6 + 0.4 * pulse) * warn;
    this.reticle.scale.set(lerp(FX.reticleStartScale, 1, easeOutCubic(progress)));
    this.sign.alpha = (0.75 + 0.25 * pulse) * warn;
    this.sign.y = FX.groundY - FX.signLift + Math.sin(this.clock / 300) * 3;
    this.reticle.visible = this.band.visible = this.sign.visible = warn > 0;

    let busy = this.detonatedAt < 0;
    const vx = this.dir * FX.fallDx;
    const vy = FX.fallHeight;
    for (const sh of this.shells) {
      if (sh.boomClock < 0) {
        const t = this.detonatedAt >= 0 ? 1 : 1 - (this.remainingMs - sh.landAt) / FX.fallMs;
        if (t >= 1) {
          this.boom(sh);
        } else if (t > 0) {
          if (sh.s === null) {
            sh.s = this.sprite(`shell.${this.side}`, 'front');
            sh.s.rotation = -Math.atan2(vx, vy);
          }
          sh.s.position.set(sh.x - vx * (1 - t), FX.groundY + sh.depth - vy * (1 - t));
        }
      }
      if (sh.boomClock >= 0) {
        sh.boomClock += dtMs;
        this.animateBoom(sh);
        if (sh.boomClock < FX.scorchMs) busy = true;
      } else {
        busy = true;
      }
    }
    return busy;
  }

  private boom(sh: Shell): void {
    sh.boomClock = 0;
    if (sh.s !== null) sh.s.visible = false;
    const y = FX.groundY + sh.depth;
    sh.scorch = this.sprite('scorch', 'ground');
    sh.scorch.position.set(sh.x, y);
    for (let k = 0; k < 2; k++) {
      const s = this.sprite('smoke', 'front');
      s.visible = false;
      sh.smoke.push(s);
    }
    sh.burst = this.sprite('burst', 'front');
    sh.burst.position.set(sh.x, y - 18);
    sh.burst.rotation = hash01(sh.x) * TAU;
  }

  private animateBoom(sh: Shell): void {
    const y = FX.groundY + sh.depth;
    if (sh.burst !== null) {
      const p = sh.boomClock / FX.burstMs;
      sh.burst.visible = p < 1;
      sh.burst.scale.set(0.35 + 0.9 * easeOutCubic(clamp01(p * 1.6)));
      sh.burst.alpha = 1 - clamp01((p - 0.45) / 0.55);
    }
    sh.smoke.forEach((s, k) => {
      const p = (sh.boomClock - 40 - k * 60) / FX.smokeMs;
      s.visible = p > 0 && p < 1;
      if (!s.visible) return;
      s.position.set(sh.x + (k === 0 ? -1 : 1) * (6 + 12 * p), y - 12 - 38 * easeOutCubic(p) - k * 6);
      s.scale.set(0.8 + 1.1 * p);
      s.alpha = 0.9 * (1 - p);
    });
    if (sh.scorch !== null) sh.scorch.alpha = 1 - clamp01((sh.boomClock - FX.scorchMs * 0.5) / (FX.scorchMs * 0.5));
  }
}

// ---------------------------------------------------------------------------------------------
// Durağanlık Alanı (Gelecek): eflatun enerji kubbesi (düşük dolgu, altıgen ağ, neon kenar), iki uçta takım
// renkli projektör direkleri ve zeminde takım renkli taban halkası; kubbede gezen parıltı ve yükselen kıvılcımlar.
// Donmuş birliklerin buz tonu ve kristalleri UnitView'dadır.

class DomeFx extends Fx {
  private readonly dome = new Container();
  private readonly gloss: Sprite;
  private readonly sparks: Sprite[] = [];
  private readonly rx: number;
  private readonly ry: number;
  private readonly totalMs: number;

  constructor(env: FxEnv, side: SideId, abilityId: string, x0: number, x1: number) {
    super(env, side, abilityId, x0, x1);
    const gy = FX.groundY;
    this.totalMs = Math.max(FX.domeRiseMs + FX.domeEndMs, (abilityDef(abilityId)?.status?.durationSec ?? 4) * 1000);
    this.rx = this.width / 2;
    this.ry = Math.min(FX.domeMaxH, this.width * FX.domeHRatio);
    const rx = this.rx;
    const ry = this.ry;
    const team = TEAM[side].trim.base;

    for (const x of [x0 + 4, x1 - 4]) {
      const p = this.sprite(`pylon.${side}`, 'ground');
      p.position.set(x, gy + 3);
      p.scale.x = this.dir;
    }
    this.dome.position.set(this.cx, gy);
    this.front.addChild(this.dome);
    const g = this.gfx(this.dome);
    const arc: number[] = [];
    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (i / steps) * Math.PI;
      arc.push(Math.cos(a) * rx, Math.sin(a) * ry);
    }
    g.poly(arc, true).fill({ color: COLOR_NEON, alpha: 0.1 });
    // Altıgen ağ (yalnız kubbe içinde kalan hücreler).
    const hs = 14;
    const hexW = hs * Math.sqrt(3);
    let any = false;
    for (let row = 0; row * hs * 1.5 < ry; row++) {
      const cy = -6 - row * hs * 1.5;
      const off = row % 2 === 0 ? 0 : hexW / 2;
      for (let cxh = -rx + off; cxh <= rx; cxh += hexW) {
        const nx = cxh / rx;
        const ny = cy / ry;
        if (nx * nx + ny * ny > 0.78) continue;
        const pts: number[] = [];
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          pts.push(cxh + Math.cos(a) * hs * 0.82, cy + Math.sin(a) * hs * 0.82);
        }
        g.poly(pts, true);
        any = true;
      }
    }
    if (any) g.stroke({ width: 1.2, color: COLOR_HEX, alpha: 0.3 });
    g.poly(arc, false).stroke({ width: 5, color: INK, alpha: 0.5 });
    g.poly(arc, false).stroke({ width: 3, color: COLOR_NEON });
    g.poly(arc, false).stroke({ width: 1.2, color: COLOR_NEON_HI });
    // Taban halkası: takım renginde.
    g.ellipse(0, 0, rx, 11).stroke({ width: 5, color: INK, alpha: 0.6 });
    g.ellipse(0, 0, rx, 11).stroke({ width: 2.6, color: team });

    this.gloss = this.sprite(Texture.WHITE, this.dome);
    this.gloss.anchor.set(0.5, 1);
    this.gloss.tint = COLOR_NEON_HI;
    for (let i = 0; i < FX.sparkCount; i++) {
      const s = this.sprite('glint', this.dome);
      s.tint = COLOR_HEX;
      this.sparks.push(s);
    }
  }

  step(dtMs: number): boolean {
    this.clock += dtMs;
    const t = this.clock;
    const rise = easeOutCubic(clamp01(t / FX.domeRiseMs));
    const endStart = this.totalMs - FX.domeEndMs;
    const q = clamp01((t - endStart) / FX.domeEndMs);
    const pulse = 0.88 + 0.12 * Math.sin((t / FX.domePulseMs) * TAU);
    this.dome.scale.set(1 + 0.06 * q, rise);
    this.dome.alpha = rise * (1 - q) * pulse;
    this.ground.alpha = 1 - q;

    const u = (t % FX.glossPeriodMs) / FX.glossPeriodMs;
    const gx = lerp(-this.rx * 0.85, this.rx * 0.85, u);
    const nx = gx / this.rx;
    this.gloss.position.set(gx, 0);
    this.gloss.width = 6;
    this.gloss.height = this.ry * Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.94;
    this.gloss.alpha = 0.22 * Math.sin(u * Math.PI);

    this.sparks.forEach((s, i) => {
      const life = (t + (i * FX.sparkLifeMs) / this.sparks.length) / FX.sparkLifeMs;
      const cycle = Math.floor(life);
      const p = life - cycle;
      const x = (hash01(cycle * 11 + i * 23 + this.x0) - 0.5) * this.rx * 1.4;
      const top = this.ry * Math.sqrt(Math.max(0, 1 - (x / this.rx) ** 2));
      s.position.set(x, -6 - p * top * 0.8);
      s.scale.set(0.5 * Math.sin(p * Math.PI));
      s.alpha = Math.sin(p * Math.PI);
    });
    return t < this.totalMs;
  }
}

// ---------------------------------------------------------------------------------------------

/**
 * Aşama 5 sözleşmesi (lead): özel yetenek görsel efektleri. Renderer bunu kurar ve çağırır.
 * Konteyner dünya koordinatındadır; renderer onu birlik katmanının üstüne ekler.
 *
 * - onCast: 'abilityCast' olayında (alan x0..x1). Anlık yeteneklerde vuruş efekti burada veya onImpact'te başlar.
 * - onImpact: 'abilityImpact' olayında (anlık vuruş, gecikmeli vuruşun patlaması veya alanın saniyelik hasarı).
 * - sync: her kare; etkin alanlar ve bekleyen vuruşlar durumdan çizilir (süre göstergesi, uyarı işareti).
 * - clear: yeniden oynamada tüm efektleri siler.
 *
 * Katmanlar: `ground` (hendek, çiviler, hedef bandı, kazıklar) birliklerin altında, ön katman (alev dudakları,
 * sürü, mermiler, kubbe) üstünde çizilmek üzere tasarlandı. `ground` varsayılan olarak `container`ın ilk
 * çocuğudur (sözleşme tek konteynerle de çalışır); renderer isterse onu birlik katmanının altına taşır:
 * `world.addChildAt(fx.ground, world.getChildIndex(units))` — taşıma `container`dan otomatik ayırır.
 *
 * Tam ekran parlama yoktur (PRD GR-06): tüm efektler alanla sınırlıdır; uyarı yanıp sönmesi ≤ 3 Hz.
 * Performans: sprite'lar ortak havuzdan; parçalar tek atlasta (art.abilities); alan başına bir kez çizilen
 * birkaç Graphics. Üst sınırlar: sürü ≤ 6 hayvan × 6 + 12 toz, hendek ≤ 12 + 7 alev + 6 kor, çivi ≤ 22,
 * baraj ≤ 6 × 5, kubbe ≈ 10.
 */
export class AbilityFx {
  readonly container = new Container();
  /** Zemin katmanı (birliklerin altına taşınabilir; bkz. sınıf açıklaması). */
  readonly ground = new Container();
  private readonly front = new Container();
  private readonly pool = new SpritePool();
  private readonly env: FxEnv;
  private readonly effects: Fx[] = [];
  private readonly zones = new Map<number, ZoneFx>();
  private readonly strikes = new Map<number, StrikeFx>();
  private frame = 0;

  constructor() {
    this.container.addChild(this.ground, this.front);
    this.env = { pool: this.pool, front: this.front, ground: this.ground };
    // Tarayıcıda atlası şimdi pişir: ilk yetenekte takılma olmasın (düğüm ortamındaki testlerde atlanır).
    if (typeof document !== 'undefined') prewarmAbilityArt();
  }

  onCast(side: SideId, abilityId: string, x0: number, x1: number): void {
    const kind = fxKind(abilityId);
    if (kind === 'stampede') this.addTransient(new HerdFx(this.env, side, abilityId, x0, x1));
    else if (kind === 'stasis') this.addTransient(new DomeFx(this.env, side, abilityId, x0, x1));
    // Hendek, çivi ve baraj durumdan (sync) çizilir.
  }

  onImpact(side: SideId, abilityId: string, x0: number, x1: number, hits: number): void {
    const kind = fxKind(abilityId);
    if (kind === 'stampede') {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const fx = this.effects[i]!;
        if (fx instanceof HerdFx && fx.matches(side, abilityId, x0, x1)) {
          fx.hit(hits);
          return;
        }
      }
      const herd = new HerdFx(this.env, side, abilityId, x0, x1);
      herd.hit(hits);
      this.addTransient(herd);
    } else if (kind === 'trench' || kind === 'caltrops') {
      for (const fx of this.zones.values()) if (!fx.expired && fx.matches(side, abilityId, x0, x1)) fx.flare(hits);
    } else if (kind === 'barrage') {
      for (const fx of this.strikes.values()) {
        if (!fx.detonated && fx.matches(side, abilityId, x0, x1)) {
          fx.detonate();
          return;
        }
      }
      this.addTransient(new StrikeFx(this.env, -1, side, abilityId, x0, x1, true));
    }
  }

  sync(zones: readonly AbilityZoneState[], strikes: readonly PendingStrikeState[], animMs: number): void {
    const frame = ++this.frame;
    for (const z of zones) {
      let fx = this.zones.get(z.id);
      if (fx === undefined) {
        const kind = fxKind(z.abilityId);
        if (kind === 'trench') fx = new TrenchFx(this.env, z.id, z.side, z.abilityId, z.x0, z.x1);
        else if (kind === 'caltrops') fx = new CaltropsFx(this.env, z.id, z.side, z.abilityId, z.x0, z.x1);
        else continue;
        this.zones.set(z.id, fx);
        this.effects.push(fx);
      }
      fx.seenFrame = frame;
      fx.bind(z);
    }
    for (const fx of this.zones.values()) if (fx.seenFrame !== frame) fx.expire();

    for (const s of strikes) {
      let fx = this.strikes.get(s.id);
      if (fx === undefined) {
        if (fxKind(s.abilityId) !== 'barrage') continue;
        fx = new StrikeFx(this.env, s.id, s.side, s.abilityId, s.x0, s.x1, false);
        this.strikes.set(s.id, fx);
        this.effects.push(fx);
      }
      fx.seenFrame = frame;
      if (!fx.detonated) fx.bind(s);
    }
    for (const fx of this.strikes.values()) if (fx.seenFrame !== frame) fx.detonate();

    const dt = Math.max(0, animMs);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]!;
      if (fx.step(dt)) continue;
      this.remove(i);
    }
  }

  clear(): void {
    for (let i = this.effects.length - 1; i >= 0; i--) this.remove(i);
  }

  /** Etkin efekt sayısı (test/hata ayıklama). */
  get effectCount(): number {
    return this.effects.length;
  }

  /** Etkin efektlerin kullandığı sprite + Graphics sayısı (performans denetimi). */
  get displayObjectCount(): number {
    return this.effects.reduce((n, fx) => n + fx.spriteCount, 0);
  }

  destroy(): void {
    this.clear();
    this.pool.destroy();
    if (this.ground.parent !== this.container) this.ground.destroy({ children: true });
    this.container.destroy({ children: true });
  }

  private addTransient(fx: Fx): void {
    let transient = 0;
    for (const e of this.effects) if (!(e instanceof ZoneFx) && !(e instanceof StrikeFx && e.strikeId >= 0)) transient++;
    if (transient >= FX.maxTransient) {
      const i = this.effects.findIndex((e) => !(e instanceof ZoneFx) && !(e instanceof StrikeFx && e.strikeId >= 0));
      if (i >= 0) this.remove(i);
    }
    this.effects.push(fx);
  }

  private remove(i: number): void {
    const fx = this.effects[i]!;
    this.effects.splice(i, 1);
    if (fx instanceof ZoneFx && this.zones.get(fx.zoneId) === fx) this.zones.delete(fx.zoneId);
    if (fx instanceof StrikeFx && this.strikes.get(fx.strikeId) === fx) this.strikes.delete(fx.strikeId);
    fx.dispose();
  }
}
