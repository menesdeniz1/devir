import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { AGE_BASE_FX, ageBaseParts } from './ageBases';
import { clamp01, easeInQuad, easeOutCubic } from './anim';
import { buildAtlas, mustTexture, setSpriteTexture, type PartSpec } from './atlas';
import { baseDamageParts } from './baseDamage';
import { GLOW_CORE, type ArtAge, type ArtSide } from './palette';
import { PRIMITIVE_BASE_FX, primitiveBaseParts, type BaseFx } from './primitiveBase';
import { SLOT_ANCHORS, TowerSlot } from './towerRig';

/**
 * Üs iskeleti: çağa göre giydirilmiş sabit doku + alev/ışık + duman/zerre + vuruş silueti.
 * Çağ değişince 1 sn'lik "yeniden inşa": eski yapı yere çöker, yenisi yerden yükselir, beyaz siluet
 * parlar ve yatay bir ışık dalgası yayılır (GDD §14). Her çağın atlası ilk kullanımda pişirilir.
 * Kök sağa bakar; rakip aynalanır (dışarıda).
 */

export const BASE_ART_RESOLUTION = 2;

const SMOKE_PUFFS = 5;
const SMOKE_LIFE_MS = 2800;
const FLAME_FLICKER_MS = 90;
const PULSE_MS = 1400;

/** Çağ geçişi zamanlaması (ms). */
const REBUILD = {
  totalMs: 1000,
  collapseMs: 380,
  riseStartMs: 260,
  glowPeakMs: 620,
  waveMs: 700,
  /** Efektler yeni yapı oturunca döner. */
  fxBackMs: 760,
} as const;
/** Işık dalgası: üs ortasında yatay elips. */
const WAVE = { x: 80, y: -70, rx: 120, ry: 40, width: 7 } as const;
const GLOW_MAX_ALPHA = 0.85;
/** Hasar dumanı (düzey 2'de bir, 3'te üç kaynak): üs yerel konumları ve renk. */
const DAMAGE_SMOKE = [
  { x: 60, y: -120, from: 2 },
  { x: 128, y: -84, from: 3 },
  { x: 30, y: -70, from: 3 },
] as const;
const DAMAGE_SMOKE_TINT = 0x5b5452;
const DAMAGE_SMOKE_LIFE_MS = 1900;

const atlases = new Map<ArtAge, Map<string, Texture>>();

function textures(age: ArtAge): Map<string, Texture> {
  let map = atlases.get(age);
  if (map === undefined) {
    map = buildAtlas(`art.base.age${age}`, baseParts(age), BASE_ART_RESOLUTION, 1024);
    atlases.set(age, map);
  }
  return map;
}

function baseParts(age: ArtAge): PartSpec[] {
  return age === 1 ? primitiveBaseParts() : ageBaseParts(age);
}

/** Hasar katmanı atlası çözünürlüğü: ince çatlaklar için 1× yeterli (bellek: çağ başına ≈1 MB). */
export const BASE_DAMAGE_RESOLUTION = 1;
const damageAtlases = new Map<ArtAge, Map<string, Texture>>();

/** Hasar katmanları ayrı, küçük bir atlastadır ve üs ilk kez hasar görünce (tembel) pişirilir. */
function damageTextures(age: ArtAge): Map<string, Texture> {
  let map = damageAtlases.get(age);
  if (map === undefined) {
    // Çatlaklar üssün kendi siluetine kırpılır (iki tarafın silueti aynı).
    const draw = baseParts(age).find((p) => p.name === 'base.0')!.draw;
    map = buildAtlas(`art.baseDamage.age${age}`, baseDamageParts(draw), BASE_DAMAGE_RESOLUTION, 1024);
    damageAtlases.set(age, map);
  }
  return map;
}

function fxOf(age: ArtAge): BaseFx {
  return age === 1 ? PRIMITIVE_BASE_FX : AGE_BASE_FX[age];
}

/** Pişirilmiş üs atlaslarının doku boyutları (rapor/hata ayıklama). */
export function baseAtlasStats(): Array<{ age: ArtAge; width: number; height: number }> {
  const out: Array<{ age: ArtAge; width: number; height: number }> = [];
  for (const [age, map] of atlases) {
    const src = map.values().next().value?.source;
    if (src !== undefined) out.push({ age, width: src.pixelWidth, height: src.pixelHeight });
  }
  return out.sort((a, b) => a.age - b.age);
}

/** Pişirilmiş hasar atlaslarının doku boyutları (rapor). */
export function baseDamageAtlasStats(): Array<{ age: ArtAge; width: number; height: number }> {
  const out: Array<{ age: ArtAge; width: number; height: number }> = [];
  for (const [age, map] of damageAtlases) {
    const src = map.values().next().value?.source;
    if (src !== undefined) out.push({ age, width: src.pixelWidth, height: src.pixelHeight });
  }
  return out.sort((a, b) => a.age - b.age);
}

interface Puff {
  sprite: Sprite;
  offsetMs: number;
}

export class BaseRig {
  readonly root = new Container();
  /** Vuruş parlaması (beyaz siluet). Çağ değişince dokusu değişir; nesne aynı kalır. */
  readonly flash: Sprite;
  private readonly side: ArtSide;
  private readonly puffs: Puff[] = [];
  private readonly old: Sprite;
  private readonly base: Sprite;
  /** Hasar katmanı (çatlaklar); düzey 0'da gizli. Çağ geçişinde düzeyi korunur. */
  private readonly damage: Sprite;
  private readonly damageSmoke: Sprite[] = [];
  private damageLevel = 0;
  private readonly flame: Sprite;
  private readonly glow: Sprite;
  private readonly wave = new Graphics();
  /** Kule yuvaları (index = yuva). Üst yuvalar arkada çizilir. */
  private readonly slots: TowerSlot[] = [];
  private age: ArtAge;
  private fx: BaseFx;
  private clockMs = 0;
  /** Geçiş başlangıcından beri geçen süre; geçiş yoksa Infinity. */
  private rebuildMs = Infinity;

  constructor(side: ArtSide, age: ArtAge = 1) {
    this.side = side;
    this.age = age;
    this.fx = fxOf(age);
    const tex = this.lookup(age);
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const s = new Sprite(tex('smoke'));
      this.root.addChild(s);
      this.puffs.push({ sprite: s, offsetMs: (i * SMOKE_LIFE_MS) / SMOKE_PUFFS });
    }
    this.old = new Sprite(tex(`base.${side}`));
    this.old.visible = false;
    this.base = new Sprite(tex(`base.${side}`));
    this.damage = new Sprite();
    this.damage.visible = false;
    for (let i = 0; i < DAMAGE_SMOKE.length * 2; i++) {
      const sp = new Sprite(tex('smoke'));
      sp.tint = DAMAGE_SMOKE_TINT;
      sp.visible = false;
      this.damageSmoke.push(sp);
    }
    this.flame = new Sprite(tex('flame'));
    this.glow = new Sprite(tex(`base.flash.${side}`));
    this.glow.visible = false;
    this.flash = new Sprite(tex(`base.flash.${side}`));
    this.flash.alpha = 0;
    this.wave.ellipse(0, 0, WAVE.rx, WAVE.ry).stroke({ width: WAVE.width, color: GLOW_CORE });
    this.wave.position.set(WAVE.x, WAVE.y);
    this.wave.visible = false;
    const slotLayer = new Container();
    for (let i = 0; i < SLOT_ANCHORS[age].length; i++) this.slots.push(new TowerSlot(side, i, age));
    for (let i = this.slots.length - 1; i >= 0; i--) slotLayer.addChild(this.slots[i]!.root);
    // Kuleler üs siluetinin (vuruş/inşa parlaması) üstünde: çağ geçişinde görünür kalırlar.
    this.root.addChild(this.old, this.base, this.damage, ...this.damageSmoke, this.flame, this.glow, this.flash, slotLayer, this.wave);
    this.placeFx();
  }

  get currentAge(): ArtAge {
    return this.age;
  }

  /** Çağı değiştirir; aynı çağ için bir şey yapmaz. `animate` false ise geçiş oynatılmaz. */
  setAge(age: ArtAge, animate = true): void {
    if (age === this.age) return;
    const prevTex = this.base.texture;
    this.age = age;
    this.fx = fxOf(age);
    const tex = this.lookup(age);
    setSpriteTexture(this.base, tex(`base.${this.side}`));
    setSpriteTexture(this.glow, tex(`base.flash.${this.side}`));
    setSpriteTexture(this.flash, tex(`base.flash.${this.side}`));
    setSpriteTexture(this.flame, tex('flame'));
    for (const p of this.puffs) setSpriteTexture(p.sprite, tex('smoke'));
    for (const sp of this.damageSmoke) setSpriteTexture(sp, tex('smoke'));
    if (this.damageLevel > 0) this.showDamage();
    this.placeFx();
    for (const s of this.slots) s.setBaseAge(age, animate);
    if (animate) {
      setSpriteTexture(this.old, prevTex);
      this.rebuildMs = 0;
    } else {
      this.rebuildMs = Infinity;
    }
    this.poseRebuild();
  }

  update(animMs: number): void {
    this.clockMs += animMs;
    if (Number.isFinite(this.rebuildMs)) {
      this.rebuildMs += animMs;
      if (this.rebuildMs >= REBUILD.totalMs) this.rebuildMs = Infinity;
    }
    this.poseRebuild();
    for (const s of this.slots) s.update(animMs);
    const t = this.clockMs;
    const fxOn = !(this.rebuildMs < REBUILD.fxBackMs);
    const fx = this.fx;
    this.flame.visible = fxOn;
    if (fx.flicker === 'flame') {
      const step = Math.floor(t / FLAME_FLICKER_MS);
      const flick = ((step * 7919) % 13) / 13;
      this.flame.scale.set(0.9 + flick * 0.25, 0.85 + (((step * 104729) % 11) / 11) * 0.45);
      this.flame.skew.x = (flick - 0.5) * 0.25;
      this.flame.alpha = 1;
    } else {
      const k = 0.5 + 0.5 * Math.sin((t / PULSE_MS) * Math.PI * 2);
      this.flame.scale.set(0.85 + 0.3 * k);
      this.flame.skew.x = 0;
      this.flame.alpha = 0.7 + 0.3 * k;
    }
    for (const p of this.puffs) {
      const k = ((t + p.offsetMs) % SMOKE_LIFE_MS) / SMOKE_LIFE_MS;
      const e = easeOutCubic(k);
      p.sprite.visible = fxOn;
      p.sprite.position.set(fx.smoke.x + e * fx.drift + Math.sin(k * 6 + p.offsetMs) * 4, fx.smoke.y - k * fx.rise);
      p.sprite.scale.set((0.45 + k * 1.1) * fx.puffScale);
      p.sprite.alpha = clamp01(k * 6) * (1 - k) * 0.85;
    }
    // Hasar dumanı: düzey 2'den itibaren koyu, yavaş yükselen puflar (kaynak başına iki puf).
    for (let i = 0; i < this.damageSmoke.length; i++) {
      const src = DAMAGE_SMOKE[i >> 1]!;
      const sp = this.damageSmoke[i]!;
      const on = fxOn && this.damageLevel >= src.from;
      sp.visible = on;
      if (!on) continue;
      const k = ((t + (i & 1) * DAMAGE_SMOKE_LIFE_MS * 0.5 + i * 211) % DAMAGE_SMOKE_LIFE_MS) / DAMAGE_SMOKE_LIFE_MS;
      sp.position.set(src.x - k * 18 + Math.sin(k * 5 + i) * 3, src.y - k * 70);
      sp.scale.set(0.5 + k * 1.1);
      sp.alpha = clamp01(k * 5) * (1 - k) * 0.8;
    }
  }

  /** Hasar düzeyi 0..3 (GDD §14: %75 / %50 / %25 altı). Aynı düzey için bir şey yapmaz. */
  setDamage(level: number): void {
    const l = Math.max(0, Math.min(3, Math.round(level)));
    if (l === this.damageLevel) return;
    this.damageLevel = l;
    this.damage.visible = l > 0;
    if (l > 0) this.showDamage();
  }

  /** Hasar dokusunu çağa ve düzeye göre atar. Sprite dokusuz kurulduğu için eksen noktası da dokudan alınır. */
  private showDamage(): void {
    setSpriteTexture(this.damage, mustTexture(damageTextures(this.age), `base.dmg.${this.damageLevel}`));
  }

  get damageLevelShown(): number {
    return this.damageLevel;
  }

  /** Yuva sayısı (bağlama noktaları). */
  get slotCount(): number {
    return this.slots.length;
  }

  /** Yuvayı çizer: kilitli, boş ya da kurulu kule (kimlik). Değişmediyse bir şey yapmaz. */
  setTowerSlot(slot: number, towerType: string | null, unlocked: boolean): void {
    this.slots[slot]?.set(towerType, unlocked);
  }

  fireTower(slot: number): void {
    this.slots[slot]?.fire();
  }

  /** Kule mermi çıkışı (kök yerel). */
  towerLaunch(slot: number): { x: number; y: number } {
    return (this.slots[slot] ?? this.slots[0]!).launchPoint();
  }

  /** Yeni maç: yuvaların sonraki durumu animasyonsuz uygulanır. */
  snapTowers(): void {
    for (const s of this.slots) s.snap();
  }

  private lookup(age: ArtAge): (name: string) => Texture {
    const map = textures(age);
    return (n) => mustTexture(map, n);
  }

  private placeFx(): void {
    this.flame.position.set(this.fx.flame.x, this.fx.flame.y);
  }

  /** Yeniden inşa pozu: eski yapı çöker, yenisi yükselir (hafif taşma), siluet parlar, dalga yayılır. */
  private poseRebuild(): void {
    const t = this.rebuildMs;
    if (!Number.isFinite(t)) {
      this.old.visible = false;
      this.glow.visible = false;
      this.wave.visible = false;
      this.base.scale.set(1);
      this.base.alpha = 1;
      this.damage.scale.set(1);
      this.damage.alpha = 1;
      return;
    }
    const c = clamp01(t / REBUILD.collapseMs);
    this.old.visible = c < 1;
    this.old.scale.set(1 + 0.04 * c, 1 - easeInQuad(c));
    this.old.alpha = 1 - c * 0.6;

    const r = clamp01((t - REBUILD.riseStartMs) / (REBUILD.totalMs - REBUILD.riseStartMs));
    // Geri sekmeli yükseliş (easeOutBack).
    const s = 1.70158;
    const u = r - 1;
    const rise = r <= 0 ? 0 : 1 + (s + 1) * u * u * u + s * u * u;
    this.base.scale.set(1 - 0.03 * (1 - r), Math.max(0, rise));
    this.base.alpha = r <= 0 ? 0 : 1;
    this.damage.scale.copyFrom(this.base.scale);
    this.damage.alpha = this.base.alpha;

    const g = t < REBUILD.glowPeakMs ? clamp01((t - REBUILD.riseStartMs) / (REBUILD.glowPeakMs - REBUILD.riseStartMs)) : 1 - clamp01((t - REBUILD.glowPeakMs) / (REBUILD.totalMs - REBUILD.glowPeakMs));
    this.glow.visible = g > 0;
    this.glow.scale.copyFrom(this.base.scale);
    this.glow.alpha = g * GLOW_MAX_ALPHA;

    const w = clamp01((t - (REBUILD.glowPeakMs - REBUILD.waveMs / 2)) / REBUILD.waveMs);
    this.wave.visible = w > 0 && w < 1;
    this.wave.scale.set(0.15 + 1.1 * easeOutCubic(w), 0.15 + 0.9 * easeOutCubic(w));
    this.wave.alpha = (1 - w) * 0.9;
  }
}
