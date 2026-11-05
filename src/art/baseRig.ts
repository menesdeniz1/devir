import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { AGE_BASE_FX, ageBaseParts } from './ageBases';
import { clamp01, easeInQuad, easeOutCubic } from './anim';
import { buildAtlas, mustTexture } from './atlas';
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

const atlases = new Map<ArtAge, Map<string, Texture>>();

function textures(age: ArtAge): Map<string, Texture> {
  let map = atlases.get(age);
  if (map === undefined) {
    map = buildAtlas(`art.base.age${age}`, age === 1 ? primitiveBaseParts() : ageBaseParts(age), BASE_ART_RESOLUTION, 1024);
    atlases.set(age, map);
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
    this.root.addChild(this.old, this.base, this.flame, this.glow, this.flash, slotLayer, this.wave);
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
    this.base.texture = tex(`base.${this.side}`);
    this.glow.texture = tex(`base.flash.${this.side}`);
    this.flash.texture = tex(`base.flash.${this.side}`);
    this.flame.texture = tex('flame');
    for (const p of this.puffs) p.sprite.texture = tex('smoke');
    this.placeFx();
    for (const s of this.slots) s.setBaseAge(age, animate);
    if (animate) {
      this.old.texture = prevTex;
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
