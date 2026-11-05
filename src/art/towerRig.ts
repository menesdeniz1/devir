import { Container, Sprite, type Texture } from 'pixi.js';
import { DEFENSE, TOWERS } from '../data/towers';
import { clamp01, easeInOut, easeInQuad, easeOutCubic, lerp, TAU } from './anim';
import { buildAtlas, mustTexture } from './atlas';
import type { ArtAge, ArtSide } from './palette';
import { hasLoad, TOWER_STYLE, towerParts, type Pt, type TowerKind, type TowerStyle } from './towerParts';

/**
 * Kule yuvası iskeleti: platform (üssün çağı) + kilit kapağı + kule (kendi çağı: gövde, silah, yük, parlama)
 * + toz bulutu = 7 sprite. Her çağın kule atlası ilk kullanımda (ya da `prewarmTowerArt`) pişirilir.
 * Durum değişimi (`set`) algılanır: kurulumda yerden yaylanarak belirme, satışta çökerek sökülme, kilit
 * açılınca kapağın fırlaması. Üs çağ değiştirirken yuva yeni bağlama noktasına kayar, kule görünür kalır.
 * Kök sağa bakar; rakip, üs kabıyla birlikte aynalanır.
 */

export const TOWER_ART_RESOLUTION = 2;
/** Yuva başına sprite (rapor/test): platform, kilit, gövde, silah, yük, parlama, toz. */
export const SPRITES_PER_SLOT = 7;

/**
 * Yuva bağlama noktaları (üs yerel: (0,0) üs tabanının arka-alt köşesi, x 0…160, sağa bakar; y yukarı eksi).
 * Güvertenin üst-orta noktasıdır. Kademeli: alt yuva önde, üsttekiler geriye ve yukarı basamaklanır.
 */
export const SLOT_ANCHORS: Record<ArtAge, readonly Pt[]> = {
  1: [
    { x: 190, y: -76 },
    { x: 186, y: -150 },
    { x: 176, y: -224 },
  ],
  2: [
    { x: 188, y: -80 },
    { x: 176, y: -154 },
    { x: 160, y: -228 },
  ],
  3: [
    { x: 190, y: -76 },
    { x: 182, y: -150 },
    { x: 166, y: -224 },
  ],
  4: [
    { x: 188, y: -84 },
    { x: 176, y: -158 },
    { x: 160, y: -232 },
  ],
  5: [
    { x: 190, y: -76 },
    { x: 180, y: -154 },
    { x: 162, y: -230 },
  ],
};
/** Yuva çiziminin ölçeği (kule ≈ birlik boyunun 1,1 katı; 1366 px'te okunur kalsın). */
export const SLOT_SCALE = 1.2;

const TIMING = {
  buildMs: 340,
  sellMs: 320,
  unlockMs: 380,
  puffMs: 460,
  /** Üs yeniden inşasıyla eş: kayma yükselişle başlar; platform eski yapı çökünce değişir. */
  moveStartMs: 260,
  moveEndMs: 1000,
  platformSwapMs: 380,
  snapMs: 170,
  burstMs: 230,
  beamMs: 170,
  recoilHitMs: 50,
  recoilMs: 480,
  tipUpMs: 150,
  tipHoldMs: 290,
  tipEndMs: 720,
  fastReloadMs: 230,
  heavyReloadMs: 950,
  reloadPopMs: 170,
  flashMs: 85,
  heavyFlashMs: 180,
  swayMs: 2600,
  hoverMs: 1700,
} as const;

const atlases = new Map<ArtAge, Map<string, Texture>>();

function textures(age: ArtAge): Map<string, Texture> {
  let map = atlases.get(age);
  if (map === undefined) {
    map = buildAtlas(`art.towers.age${age}`, towerParts(age), TOWER_ART_RESOLUTION, 512);
    atlases.set(age, map);
  }
  return map;
}

function tex(age: ArtAge, name: string): Texture {
  return mustTexture(textures(age), name);
}

/** Dokuyu değiştirir ve eksen noktasını dokunun yerel (0,0)'ına alır (sonradan atanan dokuda defaultAnchor uygulanmaz). */
function setTex(sprite: Sprite, texture: Texture): void {
  sprite.texture = texture;
  if (texture.defaultAnchor !== undefined) sprite.anchor.copyFrom(texture.defaultAnchor);
}

/** Bir çağın kule/yuva atlasını şimdi pişirir. */
export function prewarmTowerArt(age: ArtAge): void {
  textures(age);
}

/** Pişirilmiş kule atlaslarının doku boyutları (rapor/hata ayıklama). */
export function towerAtlasStats(): Array<{ age: ArtAge; width: number; height: number }> {
  const out: Array<{ age: ArtAge; width: number; height: number }> = [];
  for (const [age, map] of atlases) {
    const src = map.values().next().value?.source;
    if (src !== undefined) out.push({ age, width: src.pixelWidth, height: src.pixelHeight });
  }
  return out.sort((a, b) => a.age - b.age);
}

export interface TowerInfo {
  readonly age: ArtAge;
  readonly kind: TowerKind;
}

const PREFIX_AGE: Readonly<Record<string, ArtAge>> = { primitive: 1, ancient: 2, medieval: 3, industrial: 4, future: 5 };
const INFO = new Map<string, TowerInfo>(TOWERS.map((t) => [t.id, { age: Math.min(5, Math.max(1, Math.round(t.age))) as ArtAge, kind: t.kind }]));

/** Kule kimliğinden çizim çağı ve türü. Bilinmeyen kimlik önekten/sonekten çıkarılır. */
export function towerInfo(id: string): TowerInfo {
  const known = INFO.get(id);
  if (known !== undefined) return known;
  return { age: PREFIX_AGE[id.split('_')[0] ?? ''] ?? 1, kind: id.includes('heavy') ? 'heavy' : 'fast' };
}

function rotate(p: Pt, a: number): Pt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function easeOutBack(t: number): number {
  const s = 1.70158;
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/** Dinlenme pozunda çıkış noktası (kule yerel). */
function restMuzzle(st: TowerStyle): Pt {
  const m = rotate(st.muzzle, st.aim);
  return { x: st.pivot.x + m.x, y: st.pivot.y + m.y };
}

interface Shown {
  readonly id: string;
  readonly info: TowerInfo;
  readonly style: TowerStyle;
  readonly hasLoad: boolean;
}

export class TowerSlot {
  readonly root = new Container();
  private readonly side: ArtSide;
  private readonly index: number;
  private readonly platform: Sprite;
  private readonly hatch: Sprite;
  private readonly tower = new Container();
  private readonly body: Sprite;
  private readonly gun: Sprite;
  private readonly load: Sprite;
  private readonly flash: Sprite;
  private readonly puff: Sprite;
  private baseAge: ArtAge;
  private wantType: string | null = null;
  private wantUnlocked: boolean;
  private shown: Shown | null = null;
  /** false: sonraki `set` animasyonsuz uygulanır (ilk çağrı, yeni maç). */
  private initialized = false;
  private clockMs = 0;
  private fireMs = Infinity;
  private buildMs = Infinity;
  private sellMs = Infinity;
  private unlockMs = Infinity;
  private puffMs = Infinity;
  private moveMs = Infinity;
  private from: Pt = { x: 0, y: 0 };
  private platformPending = false;

  constructor(side: ArtSide, index: number, baseAge: ArtAge) {
    this.side = side;
    this.index = index;
    this.baseAge = baseAge;
    this.wantUnlocked = (DEFENSE.slotUnlockCosts[index] ?? 1) === 0;
    this.platform = new Sprite(tex(baseAge, `platform.${side}`));
    this.hatch = new Sprite(tex(baseAge, 'locked'));
    this.body = new Sprite();
    this.gun = new Sprite();
    this.load = new Sprite();
    this.flash = new Sprite();
    this.puff = new Sprite(tex(baseAge, 'puff'));
    this.puff.visible = false;
    this.tower.addChild(this.body, this.gun, this.load, this.flash);
    this.tower.visible = false;
    this.root.addChild(this.platform, this.tower, this.hatch, this.puff);
    this.root.position.copyFrom(this.anchor(baseAge));
    this.root.scale.set(SLOT_SCALE);
    this.clockMs = index * 700;
    this.pose();
  }

  private anchor(age: ArtAge): Pt {
    return SLOT_ANCHORS[age][this.index] ?? SLOT_ANCHORS[age][0]!;
  }

  /** Yalnız vitrin: platformu gizler (kule silueti denetimi). */
  setPlatformVisible(visible: boolean): void {
    this.platform.visible = visible;
  }

  /** Sonraki `set` çağrısı animasyonsuz uygulanır (yeni maç). */
  snap(): void {
    this.initialized = false;
  }

  /** Yuva durumunu uygular; değişmediyse bir şey yapmaz. */
  set(type: string | null, unlocked: boolean): void {
    if (this.initialized && type === this.wantType && unlocked === this.wantUnlocked) return;
    const animate = this.initialized;
    this.initialized = true;
    const prevType = this.wantType;
    const prevUnlocked = this.wantUnlocked;
    this.wantType = type;
    this.wantUnlocked = unlocked;

    if (!animate) {
      this.unlockMs = Infinity;
      this.buildMs = Infinity;
      this.sellMs = Infinity;
      this.puffMs = Infinity;
      this.fireMs = Infinity;
      this.shown = null;
      if (type !== null) this.show(type);
      this.pose();
      return;
    }
    if (unlocked && !prevUnlocked) {
      this.unlockMs = 0;
      this.puffMs = 0;
    } else if (!unlocked) {
      this.unlockMs = Infinity;
    }
    if (type !== prevType) {
      if (type === null) {
        if (this.shown !== null) {
          this.sellMs = 0;
          this.buildMs = Infinity;
          this.puffMs = 0;
        }
      } else {
        this.show(type);
        this.sellMs = Infinity;
        this.buildMs = 0;
        this.puffMs = 0;
      }
    }
    this.pose();
  }

  /** Atış animasyonu. Kule yoksa bir şey yapmaz. */
  fire(): void {
    if (this.shown !== null && !Number.isFinite(this.sellMs)) this.fireMs = 0;
  }

  /** Üssün çağı değişti: yeni bağlama noktasına kay (animate), platform/kapak yeni çağla çizilir. */
  setBaseAge(age: ArtAge, animate: boolean): void {
    if (age === this.baseAge) return;
    this.baseAge = age;
    if (animate) {
      this.from = { x: this.root.x, y: this.root.y };
      this.moveMs = 0;
      this.platformPending = true;
    } else {
      this.moveMs = Infinity;
      this.root.position.copyFrom(this.anchor(age));
      this.swapPlatform();
    }
  }

  /** Mermi çıkışı (üs yerel, dinlenme pozu). Kule yoksa güvertenin biraz üstü. */
  launchPoint(): Pt {
    const anchor = Number.isFinite(this.moveMs) ? { x: this.root.x, y: this.root.y } : this.anchor(this.baseAge);
    if (this.shown === null) return { x: anchor.x, y: anchor.y - 30 * SLOT_SCALE };
    const m = restMuzzle(this.shown.style);
    return { x: anchor.x + m.x * SLOT_SCALE, y: anchor.y + m.y * SLOT_SCALE };
  }

  update(animMs: number): void {
    this.clockMs += animMs;
    const step = (v: number): number => (Number.isFinite(v) ? v + animMs : v);
    this.fireMs = step(this.fireMs);
    this.buildMs = step(this.buildMs);
    this.sellMs = step(this.sellMs);
    this.unlockMs = step(this.unlockMs);
    this.puffMs = step(this.puffMs);
    this.moveMs = step(this.moveMs);
    this.pose();
  }

  private swapPlatform(): void {
    setTex(this.platform, tex(this.baseAge, `platform.${this.side}`));
    setTex(this.hatch, tex(this.baseAge, 'locked'));
    setTex(this.puff, tex(this.baseAge, 'puff'));
    this.platformPending = false;
  }

  private show(type: string): void {
    const info = towerInfo(type);
    const style = TOWER_STYLE[info.age][info.kind];
    const load = hasLoad(info.age, info.kind);
    const k = info.kind;
    setTex(this.body, tex(info.age, `${k}.body.${this.side}`));
    setTex(this.gun, tex(info.age, `${k}.gun.${this.side}`));
    setTex(this.flash, tex(info.age, `${k}.flash`));
    if (load) setTex(this.load, tex(info.age, `${k}.load.${this.side}`));
    this.shown = { id: type, info, style, hasLoad: load };
    this.fireMs = Infinity;
  }

  private pose(): void {
    const T = TIMING;
    // Çağ geçişi: bağlama noktasına kayma + platform değişimi.
    if (Number.isFinite(this.moveMs)) {
      const to = this.anchor(this.baseAge);
      const k = easeInOut(clamp01((this.moveMs - T.moveStartMs) / (T.moveEndMs - T.moveStartMs)));
      this.root.position.set(lerp(this.from.x, to.x, k), lerp(this.from.y, to.y, k));
      if (this.platformPending && this.moveMs >= T.platformSwapMs) this.swapPlatform();
      if (this.moveMs >= T.moveEndMs) this.moveMs = Infinity;
    }
    // Platform, değişim anında kısa bir yaylanma.
    const sw = Number.isFinite(this.moveMs) ? clamp01((this.moveMs - T.platformSwapMs) / 200) : 1;
    this.platform.scale.set(1, sw < 1 ? 0.6 + 0.4 * easeOutBack(sw) : 1);

    // Kilit kapağı.
    if (Number.isFinite(this.unlockMs)) {
      const k = clamp01(this.unlockMs / T.unlockMs);
      this.hatch.visible = true;
      this.hatch.position.set(-6 * k, -22 * easeOutCubic(k) + 30 * easeInQuad(k));
      this.hatch.rotation = -0.9 * k;
      this.hatch.alpha = 1 - easeInQuad(k);
      if (k >= 1) this.unlockMs = Infinity;
    } else {
      this.hatch.visible = !this.wantUnlocked;
      this.hatch.position.set(0, 0);
      this.hatch.rotation = 0;
      this.hatch.alpha = 1;
    }

    // Toz bulutu.
    if (Number.isFinite(this.puffMs) && this.puffMs < T.puffMs) {
      const k = this.puffMs / T.puffMs;
      this.puff.visible = true;
      this.puff.position.set(0, -6 - 8 * k);
      this.puff.scale.set(0.6 + 0.9 * easeOutCubic(k), 0.5 + 0.6 * easeOutCubic(k));
      this.puff.alpha = (1 - k) * 0.9;
    } else {
      this.puff.visible = false;
      this.puffMs = Infinity;
    }

    const shown = this.shown;
    if (shown === null) {
      this.tower.visible = false;
      return;
    }
    // Kurulum (yaylanarak belirme) / satış (çökerek sökülme).
    let sx = 1;
    let sy = 1;
    let rot = 0;
    let alpha = 1;
    if (Number.isFinite(this.buildMs)) {
      const k = clamp01(this.buildMs / T.buildMs);
      sy = Math.max(0, easeOutBack(k));
      sx = lerp(0.55, 1, easeOutCubic(k));
      alpha = clamp01(k * 5);
      if (k >= 1) this.buildMs = Infinity;
    } else if (Number.isFinite(this.sellMs)) {
      const k = clamp01(this.sellMs / T.sellMs);
      sy = 1 - easeInQuad(k);
      sx = 1 + 0.18 * k;
      rot = -0.14 * Math.sin(k * Math.PI);
      alpha = 1 - 0.6 * k;
      if (k >= 1) {
        this.sellMs = Infinity;
        this.shown = null;
        this.tower.visible = false;
        return;
      }
    }
    this.tower.visible = true;
    this.tower.scale.set(sx, sy);
    this.tower.rotation = rot;
    this.tower.alpha = alpha;
    this.poseWeapon(shown);
  }

  private poseWeapon(shown: Shown): void {
    const T = TIMING;
    const st = shown.style;
    const t = this.fireMs;
    const fired = Number.isFinite(t);
    let back = 0;
    let dRot = 0;
    let flash = 0;
    let flashScale = 1;
    let squash = 0;
    let bob = 0;
    let reloadAt = Infinity;
    const sway = Math.sin(((this.clockMs % T.swayMs) / T.swayMs) * TAU);
    switch (st.motion) {
      case 'snap': {
        const p = fired && t < T.snapMs ? 1 - easeOutCubic(t / T.snapMs) : 0;
        back = st.kick * p;
        dRot = -0.12 * p + 0.025 * sway;
        flash = fired && t < T.flashMs ? 1 - t / T.flashMs : 0;
        flashScale = 0.8 + 0.4 * (1 - flash);
        reloadAt = T.fastReloadMs;
        break;
      }
      case 'burst': {
        if (fired && t < T.burstMs) {
          const ph = (t / T.burstMs) * 3;
          const f = ph - Math.floor(ph);
          back = st.kick * (1 - f);
          flash = f < 0.45 ? 1 : 0;
          flashScale = 0.8 + 0.35 * (Math.floor(ph) % 2);
        }
        dRot = 0.02 * sway;
        break;
      }
      case 'beam': {
        const p = fired && t < T.snapMs ? 1 - easeOutCubic(t / T.snapMs) : 0;
        back = st.kick * p;
        flash = fired && t < T.beamMs ? 1 - (t / T.beamMs) ** 2 : 0;
        flashScale = 0.7 + 0.6 * (fired ? clamp01(t / T.beamMs) : 0);
        bob = Math.sin(((this.clockMs % T.hoverMs) / T.hoverMs) * TAU) * 1.6;
        dRot = 0.02 * sway;
        break;
      }
      case 'recoil': {
        let p = 0;
        if (fired && t < T.recoilMs) p = t < T.recoilHitMs ? t / T.recoilHitMs : 1 - easeInOut((t - T.recoilHitMs) / (T.recoilMs - T.recoilHitMs));
        back = st.kick * p;
        squash = 0.06 * p;
        flash = fired && t < T.heavyFlashMs ? 1 - t / T.heavyFlashMs : 0;
        flashScale = 0.75 + 0.5 * (1 - flash);
        reloadAt = T.heavyReloadMs;
        break;
      }
      case 'tip': {
        let p = 0;
        if (fired) {
          if (t < T.tipUpMs) p = easeOutCubic(t / T.tipUpMs);
          else if (t < T.tipHoldMs) p = 1;
          else if (t < T.tipEndMs) p = 1 - easeInOut((t - T.tipHoldMs) / (T.tipEndMs - T.tipHoldMs));
        }
        dRot = st.kick * p;
        const fs = T.tipUpMs * 0.6;
        flash = fired && t > fs && t < T.tipHoldMs + 60 ? 1 - (t - fs) / (T.tipHoldMs + 60 - fs) : 0;
        flashScale = 0.7 + 0.5 * (1 - flash);
        reloadAt = T.heavyReloadMs;
        break;
      }
    }
    // Gövde: ağır atışta kısa basılma (ayak tabanı sabit).
    this.body.scale.set(1 + squash * 0.5, 1 - squash);
    const rotNow = st.aim + dRot;
    const gx = st.pivot.x - back * Math.cos(st.aim);
    const gy = st.pivot.y - back * Math.sin(st.aim) + bob + st.pivot.y * squash * -1;
    this.gun.position.set(gx, gy);
    this.gun.rotation = rotNow;

    // Yük: atışla kaybolur, dolum anında yaylanarak döner.
    if (shown.hasLoad && st.load !== null) {
      let ls = 1;
      if (fired) {
        const hideAt = st.motion === 'tip' ? T.tipUpMs * 0.7 : 0;
        if (t >= hideAt && t < reloadAt) ls = 0;
        else if (t >= reloadAt) ls = Math.max(0, easeOutBack(clamp01((t - reloadAt) / T.reloadPopMs)));
      }
      const lp = rotate(st.load, rotNow);
      this.load.visible = ls > 0;
      this.load.position.set(gx + lp.x, gy + lp.y);
      this.load.rotation = rotNow;
      this.load.scale.set(ls);
    } else {
      this.load.visible = false;
    }

    // Parlama: çıkış noktasında (oluk ucu sabit; diğerlerinde silahla döner).
    this.flash.visible = flash > 0;
    if (flash > 0) {
      const m = st.fixedMuzzle ? restMuzzle(st) : (() => {
        const r = rotate(st.muzzle, rotNow);
        return { x: gx + r.x, y: gy + r.y };
      })();
      this.flash.position.set(m.x, m.y);
      this.flash.rotation = st.motion === 'tip' && !st.fixedMuzzle ? st.aim + 0.5 : st.aim;
      this.flash.alpha = flash;
      this.flash.scale.set(flashScale);
    }
  }
}
