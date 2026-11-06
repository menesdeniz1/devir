import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { clamp01, easeInOut, easeOutCubic, lerp, TAU } from './anim';
import { buildAtlas, mustTexture, type PartSpec } from './atlas';
import { circle, ellipse, line, shape, soft, stroke, type Ctx } from './paint';
import { EMBLEM_FILL, INK, TEAM, type ArtAge, type ArtSide, type Tone } from './palette';
import { LAMP_NEUTRAL_TINT, STONE_VARIANTS, type StoneVariant } from './stoneVariants';

/**
 * Sınır Taşı (GDD §8): koridor ortasında, savaş alanının çağına (oyuncunun çağı, arka planla aynı) göre biçim
 * değiştiren sınır taşı. (0,0) taşın tabanı (zemin çizgisi). Çağ görünümleri `stoneVariants.ts`'te: İlkel dikili
 * taş, Antik dikilitaş, Orta armalı sınır taşı, Endüstri fener direği, Gelecek süzülen kristal.
 * Taşın yuvasında tarafsızken oyma işaret, sahipliğe geçince sahibin amblemi (oyuncu daire / rakip elmas) kendi
 * renginde yanar ve taşın ardında bir hale parlar (getiri çağla arttığından hale de çağla biraz güçlenir).
 * Yuvayı saran halka ele geçirme ilerlemesini (|sayaç| / sayaçMax) gösterir: oyuncuya doğru mavi ve tepeden sola
 * (oyuncu tarafına), rakibe doğru turuncu ve tepeden sağa (rakip tarafına) dolar. Bölge sınırlarında zemin
 * işaretleri. Takım ayrımı yalnız renge bırakılmaz: amblem şekli + halkanın dönüş yönü.
 * Çağ değişimi yumuşak geçiştir: eski taş hafifçe şişerek söner, yenisi küçükten büyüyerek belirir.
 */

export const STONE_ART_RESOLUTION = 2;

const MARKER: Tone = { base: 0xf3e9cf, shade: 0xcdbf9c };
const RING_TRACK = 0x2a2438;
const RING_NEUTRAL = 0xd8d2c0;

const RING = { r: 25, width: 6, track: 9 } as const;
const BREATHE_MS = 2600;
const CAPTURE_POP_MS = 600;
/** Çağ geçişi süresi (ms) ve ölçek "puf"u. */
export const STONE_SWAP_MS = 650;
const SWAP_IN_SCALE = 0.88;
const SWAP_OUT_SCALE = 1.08;
const SWAP_SWELL = 0.12;

const AGES: readonly ArtAge[] = [1, 2, 3, 4, 5];

/** Sahip amblemi: takım renginde dış şekil + krem iç şekil (oyuncu daire, rakip elmas). */
function emblemDraw(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    if (side === 0) {
      shape(c, circle(0, 0, 13), team.cloth, { line: 2.6, shadeOffset: [2, 2] });
      shape(c, circle(0, 0, 6.5), EMBLEM_FILL, { line: 2.2 });
    } else {
      shape(c, soft([0, -16, 13.5, 0, 0, 16, -13.5, 0], 2), team.cloth, { line: 2.6, shadeOffset: [2, 2] });
      shape(c, soft([0, -8, 6.8, 0, 0, 8, -6.8, 0], 1), EMBLEM_FILL, { line: 2.2 });
    }
  };
}

/** Yumuşak beyaz hale (renk tint ile verilir). */
function glowDraw(c: Ctx): void {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 30, 0, Math.PI * 2);
  c.fill();
}

/** Bölge sınırı işareti: yolu enine kesen ince yassı taş dizisi + arkada küçük kazık taş. `top`..`bottom` yerel y. */
function markerDraw(top: number, bottom: number) {
  return (c: Ctx): void => {
    shape(c, soft([-3.5, top + 2, 3.5, top + 2, 3, top - 12, 0, top - 15, -3, top - 12], 1.5), MARKER, { shadeOffset: [1, 1.5], line: 2.2 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const y = top + 8 + k * (bottom - top - 10);
      shape(c, ellipse(k * 3, y, 5, 2), MARKER, { shadeOffset: [0.8, 0.8], line: 1.6 });
    }
    stroke(c, line([0, top + 4, 3, bottom - 2]), 1, MARKER.shade);
  };
}

/** Parça adları (atlas ve test dokuları aynı adları kullanır). */
export function stonePartNames(age: ArtAge): { body: string; float: string | null; lamp: string | null } {
  const v = STONE_VARIANTS[age];
  return { body: `stone.body.${age}`, float: v.float ? `stone.float.${age}` : null, lamp: v.lamp ? `stone.lamp.${age}` : null };
}

/** Çağdan bağımsız tüm taş sanatı tek atlasta, ilk taşta bir kez pişirilir (karede yeniden çizim yok). */
let artAtlas: Map<string, Texture> | null = null;
/** Bölge işaretleri yürüme yolunun yüksekliğine bağlıdır: yerleşim başına bir küçük atlas. */
const markerAtlases = new Map<string, Map<string, Texture>>();

function artParts(): PartSpec[] {
  const parts: PartSpec[] = [
    { name: 'stone.emblem.0', x0: -14, y0: -14, x1: 14, y1: 14, draw: emblemDraw(0) },
    { name: 'stone.emblem.1', x0: -15, y0: -17, x1: 15, y1: 17, draw: emblemDraw(1) },
    { name: 'stone.glow', x0: -30, y0: -30, x1: 30, y1: 30, draw: glowDraw },
  ];
  for (const age of AGES) {
    const v = STONE_VARIANTS[age];
    const n = stonePartNames(age);
    parts.push({ name: n.body, ...v.body });
    if (v.float && n.float) parts.push({ name: n.float, ...v.float });
    if (v.lamp && n.lamp) parts.push({ name: n.lamp, ...v.lamp });
  }
  return parts;
}

function defaultTextures(layout: StoneLayout): (name: string) => Texture {
  const art = (artAtlas ??= buildAtlas('art.stone', artParts(), STONE_ART_RESOLUTION, 512));
  const key = `${layout.pathTop}|${layout.pathBottom}`;
  let marker = markerAtlases.get(key);
  if (marker === undefined) {
    const { pathTop: top, pathBottom: bottom } = layout;
    marker = buildAtlas('art.stone.marker', [{ name: 'stone.marker', x0: -6, y0: top - 16, x1: 9, y1: bottom + 3, draw: markerDraw(top, bottom) }], STONE_ART_RESOLUTION, 32);
    markerAtlases.set(key, marker);
  }
  const markers = marker;
  return (name) => mustTexture(name === 'stone.marker' ? markers : art, name);
}

export interface StoneLayout {
  /** Bölge yarı genişliği (işaretler ±bu kadar uzakta). */
  halfWidth: number;
  /** Yürüme yolunun taş yerelindeki üst/alt kenarı (işaretler bu aralığı keser). */
  pathTop: number;
  pathBottom: number;
}

export interface StoneRigOptions {
  /** Başlangıç çağı (geçişsiz). Varsayılan 1. */
  age?: ArtAge;
  /** Doku kaynağı; varsayılan taş atlası. Testler sahte doku verir (düğümde tuval yok). */
  texture?: (name: string) => Texture;
}

interface VariantLayer {
  root: Container;
  /** Süzülen parça (yoksa null): çağın `bob` genliğiyle iner-kalkar. */
  float: Container | null;
  lamp: Sprite | null;
}

function part(tex: Texture, label: string): Sprite {
  const s = new Sprite(tex);
  s.label = label;
  return s;
}

export class StoneRig {
  readonly root = new Container();
  private readonly aura: Sprite;
  private readonly emblems: [Sprite, Sprite];
  private readonly markers: [Sprite, Sprite];
  private readonly ring = new Graphics();
  /** Çağ gövdeleri (geçişte iki tanesi görünür). */
  private readonly bodies = new Container();
  /** Halka + amblemler: çağın yuvasında, gövdenin önünde. */
  private readonly socket = new Container();
  private readonly layers = new Map<ArtAge, VariantLayer>();
  private readonly tex: (name: string) => Texture;
  private current: ArtAge;
  private previous: ArtAge | null = null;
  private previousAlpha = 1;
  private swapMs = Infinity;
  private builds = 0;
  private clockMs = 0;
  private popMs = Infinity;
  private lastCounter = Number.NaN;
  private lastOwner: ArtSide | null | undefined = undefined;

  constructor(layout: StoneLayout, options: StoneRigOptions = {}) {
    this.tex = options.texture ?? defaultTextures(layout);
    this.markers = [part(this.tex('stone.marker'), 'stone.marker'), part(this.tex('stone.marker'), 'stone.marker')];
    this.markers[0].x = -layout.halfWidth;
    this.markers[1].x = layout.halfWidth;
    this.markers[1].scale.x = -1;
    this.aura = part(this.tex('stone.glow'), 'stone.aura');
    this.aura.anchor.set(0.5);
    this.aura.visible = false;
    this.emblems = [part(this.tex('stone.emblem.0'), 'stone.emblem.0'), part(this.tex('stone.emblem.1'), 'stone.emblem.1')];
    for (const e of this.emblems) e.visible = false;
    this.ring.label = 'stone.ring';
    this.socket.label = 'stone.socket';
    this.bodies.label = 'stone.bodies';
    this.socket.addChild(this.ring, this.emblems[0], this.emblems[1]);
    this.root.addChild(this.markers[0], this.markers[1], this.aura, this.bodies, this.socket);
    this.current = options.age ?? 1;
    this.layerOf(this.current).root.visible = true;
    this.place();
  }

  /** Şu an gösterilen (geçişte hedef) çağ. */
  get age(): ArtAge {
    return this.current;
  }

  /** Çağ geçişi sürüyor mu. */
  get swapping(): boolean {
    return Number.isFinite(this.swapMs);
  }

  /** Kurulmuş çağ görünümü sayısı (her çağ en fazla bir kez kurulur; testler için). */
  get variantBuildCount(): number {
    return this.builds;
  }

  /** Hedef çağ taşının tepesi (taş yerelinde, negatif). Kazanç işareti bunun üstünden doğar. */
  get topY(): number {
    return STONE_VARIANTS[this.current].top;
  }

  /**
   * Taşın çağını değiştirir. Aynı çağda hiçbir şey yapmaz (yeniden kurma yok). `animate` false ise (yeni maç)
   * geçişsiz atlar; aksi hâlde eski taş söner, yenisi büyüyerek belirir.
   */
  setAge(age: ArtAge, animate = true): void {
    if (age === this.current) return;
    const next = this.layerOf(age);
    const old = this.layers.get(this.current)!;
    for (const [a, l] of this.layers) l.root.visible = a === age || (animate && a === this.current);
    if (animate) {
      // Süren geçiş kesilirse: o anki saydamlığından sönmeye devam eder (sıçrama yok).
      this.previousAlpha = old.root.alpha;
      this.previous = this.current;
      this.swapMs = 0;
    } else {
      this.previous = null;
      this.swapMs = Infinity;
      old.root.alpha = 1;
      old.root.scale.set(1);
    }
    this.current = age;
    this.bodies.addChild(next.root);
    if (this.lastOwner !== undefined) this.tintLamp(next, this.lastOwner);
    this.place();
  }

  /** counter: −max (rakip) … +max (oyuncu); owner: sahip taraf veya null. */
  update(counter: number, owner: ArtSide | null, counterMax: number, animMs: number): void {
    this.clockMs += animMs;
    if (owner !== this.lastOwner) {
      if (owner !== null && this.lastOwner !== undefined) this.popMs = 0;
      this.lastOwner = owner;
      this.applyOwner(owner);
    }
    if (counter !== this.lastCounter) {
      this.lastCounter = counter;
      this.drawRing(counter, counterMax);
    }
    if (Number.isFinite(this.popMs)) {
      this.popMs += animMs;
      if (this.popMs >= CAPTURE_POP_MS) this.popMs = Infinity;
    }
    if (Number.isFinite(this.swapMs)) {
      this.swapMs += animMs;
      if (this.swapMs >= STONE_SWAP_MS) this.finishSwap();
    }
    this.place();
    // Boşta: hale nefes alır, amblem hafifçe salınır; ele geçirilince kısa büyüme.
    const breathe = 0.5 + 0.5 * Math.sin((this.clockMs / BREATHE_MS) * TAU);
    const pop = Number.isFinite(this.popMs) ? 1 - easeOutCubic(clamp01(this.popMs / CAPTURE_POP_MS)) : 0;
    const swell = Number.isFinite(this.swapMs) ? SWAP_SWELL * Math.sin(Math.PI * clamp01(this.swapMs / STONE_SWAP_MS)) : 0;
    const aura = this.auraNow();
    this.aura.alpha = aura.alpha + 0.22 * breathe + 0.45 * pop + swell;
    this.aura.scale.set(aura.scale * (1 + 0.06 * breathe + 0.35 * pop));
    if (owner !== null) {
      const e = this.emblems[owner];
      e.scale.set(1 + 0.04 * breathe + 0.3 * pop);
      e.y = Math.sin((this.clockMs / BREATHE_MS) * TAU + 1) * 0.8;
    }
  }

  /** Çağ görünümü: ilk istendiğinde bir kez kurulur ve saklanır. */
  private layerOf(age: ArtAge): VariantLayer {
    const have = this.layers.get(age);
    if (have !== undefined) return have;
    const names = stonePartNames(age);
    const root = new Container();
    root.label = `stone.variant.${age}`;
    root.visible = false;
    root.addChild(part(this.tex(names.body), 'stone.body'));
    let float: Container | null = null;
    if (names.float !== null) {
      float = new Container();
      float.label = 'stone.float';
      float.addChild(part(this.tex(names.float), 'stone.float.part'));
      root.addChild(float);
    }
    let lamp: Sprite | null = null;
    if (names.lamp !== null) {
      lamp = part(this.tex(names.lamp), 'stone.lamp');
      lamp.tint = LAMP_NEUTRAL_TINT;
      root.addChild(lamp);
    }
    const layer: VariantLayer = { root, float, lamp };
    this.layers.set(age, layer);
    this.bodies.addChild(root);
    this.builds += 1;
    return layer;
  }

  private finishSwap(): void {
    this.swapMs = Infinity;
    if (this.previous !== null) {
      const old = this.layers.get(this.previous)!;
      old.root.visible = false;
      old.root.alpha = 1;
      old.root.scale.set(1);
    }
    this.previous = null;
  }

  private bobOf(v: StoneVariant): number {
    return v.bob.amp === 0 ? 0 : v.bob.amp * Math.sin((this.clockMs / v.bob.periodMs) * TAU);
  }

  /** Geçiş ilerlemesi (0..1); geçiş yoksa 1. */
  private swapT(): number {
    return Number.isFinite(this.swapMs) && this.previous !== null ? clamp01(this.swapMs / STONE_SWAP_MS) : 1;
  }

  private auraNow(): { scale: number; alpha: number } {
    const cur = STONE_VARIANTS[this.current].aura;
    if (this.previous === null) return cur;
    const prev = STONE_VARIANTS[this.previous].aura;
    const k = easeInOut(this.swapT());
    return { scale: lerp(prev.scale, cur.scale, k), alpha: lerp(prev.alpha, cur.alpha, k) };
  }

  /** Gövde saydamlık/ölçekleri, süzülme ve yuvanın konumu (geçişte iki çağ arası). */
  private place(): void {
    const cv = STONE_VARIANTS[this.current];
    const cl = this.layers.get(this.current)!;
    const t = this.swapT();
    const k = easeInOut(t);
    const m = easeOutCubic(t);
    const curBob = this.bobOf(cv);
    if (cl.float !== null) cl.float.y = curBob;
    let sx = cv.socket.x;
    let sy = cv.socket.y + curBob;
    if (this.previous !== null && t < 1) {
      const pv = STONE_VARIANTS[this.previous];
      const pl = this.layers.get(this.previous)!;
      const prevBob = this.bobOf(pv);
      if (pl.float !== null) pl.float.y = prevBob;
      cl.root.alpha = k;
      cl.root.scale.set(lerp(SWAP_IN_SCALE, 1, m));
      // Eski taş yenisinin ardında daha geç söner: ortada iki yarı saydam hayalet görünmez.
      pl.root.alpha = this.previousAlpha * (1 - k * k);
      pl.root.scale.set(lerp(1, SWAP_OUT_SCALE, m));
      sx = lerp(pv.socket.x, sx, m);
      sy = lerp(pv.socket.y + prevBob, sy, m);
    } else {
      cl.root.alpha = 1;
      cl.root.scale.set(1);
    }
    this.socket.position.set(sx, sy);
    this.aura.position.set(sx, sy);
  }

  private tintLamp(layer: VariantLayer, owner: ArtSide | null): void {
    if (layer.lamp !== null) layer.lamp.tint = owner === null ? LAMP_NEUTRAL_TINT : TEAM[owner].cloth.base;
  }

  private applyOwner(owner: ArtSide | null): void {
    this.emblems[0].visible = owner === 0;
    this.emblems[1].visible = owner === 1;
    this.aura.visible = owner !== null;
    const tint = owner === null ? 0xffffff : TEAM[owner].trim.base;
    if (owner !== null) this.aura.tint = TEAM[owner].cloth.base;
    this.markers[0].tint = tint;
    this.markers[1].tint = tint;
    for (const l of this.layers.values()) this.tintLamp(l, owner);
  }

  private drawRing(counter: number, counterMax: number): void {
    const g = this.ring;
    g.clear();
    g.circle(0, 0, RING.r).stroke({ width: RING.track, color: INK });
    g.circle(0, 0, RING.r).stroke({ width: RING.width, color: RING_TRACK });
    const f = counterMax > 0 ? clamp01(Math.abs(counter) / counterMax) : 0;
    if (f <= 0) {
      // Tarafsız: tepede küçük nötr çentik (halkanın başlangıç noktası).
      g.moveTo(0, -RING.r - 4).lineTo(0, -RING.r + 4).stroke({ width: 3, color: RING_NEUTRAL, cap: 'round' });
      return;
    }
    const side: ArtSide = counter > 0 ? 0 : 1;
    const color = TEAM[side].cloth.base;
    const start = -Math.PI / 2;
    // Oyuncu: tepeden sola (saat yönü tersine); rakip: tepeden sağa (saat yönü).
    const end = side === 0 ? start - f * Math.PI * 2 : start + f * Math.PI * 2;
    g.moveTo(Math.cos(start) * RING.r, Math.sin(start) * RING.r);
    g.arc(0, 0, RING.r, start, end, side === 0).stroke({ width: RING.width, color, cap: f < 1 ? 'round' : 'butt' });
    // İlerleme ucu: açık nokta (yönü gösterir).
    if (f < 1) g.circle(Math.cos(end) * RING.r, Math.sin(end) * RING.r, 2.2).fill(EMBLEM_FILL);
  }
}
