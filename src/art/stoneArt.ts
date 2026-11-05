import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { clamp01, easeOutCubic } from './anim';
import { buildAtlas, mustTexture, type PartSpec } from './atlas';
import { circle, detail, ellipse, line, shape, soft, stroke, type Ctx } from './paint';
import { EMBLEM_FILL, GROUND_SHADOW, INK, TEAM, type ArtSide, type Tone } from './palette';

/**
 * Sınır Taşı (GDD §8): koridor ortasında oyma dikili taş. (0,0) taşın tabanı (zemin çizgisi).
 * Taşın göğsünde oyma bir yuva vardır: tarafsızken boş oyma işaret, sahipliğe geçince sahibin amblemi
 * (oyuncu daire / rakip elmas) kendi renginde yanar ve taşın ardında bir hale parlar. Yuvayı saran halka
 * ele geçirme ilerlemesini (|sayaç| / sayaçMax) gösterir: oyuncuya doğru mavi ve tepeden sola (oyuncu
 * tarafına), rakibe doğru turuncu ve tepeden sağa (rakip tarafına) dolar. Bölge sınırlarında zemin işaretleri.
 * Taş ve işaretler takım ayrımını yalnız renge bırakmaz: amblem şekli + halkanın dönüş yönü.
 */

export const STONE_ART_RESOLUTION = 2;

const STONE: Tone = { base: 0xa7a59c, shade: 0x7f7d75 };
const MOSS: Tone = { base: 0x7f9a55, shade: 0x627c40 };
const CARVE = 0x5f5d57;
const MARKER: Tone = { base: 0xf3e9cf, shade: 0xcdbf9c };
const RING_TRACK = 0x2a2438;
const RING_NEUTRAL = 0xd8d2c0;

/** Yuva merkezi (taş yerelinde) ve halka ölçüsü. */
export const STONE_SOCKET = { x: 1, y: -74 } as const;
const RING = { r: 25, width: 6, track: 9 } as const;
const GLOW_SCALE = 2.4;
const BREATHE_MS = 2600;
const CAPTURE_POP_MS = 600;

function bodyDraw(c: Ctx): void {
  c.save();
  c.globalAlpha = GROUND_SHADOW.alpha;
  shape(c, ellipse(2, 2, 40, 7), GROUND_SHADOW.color, { line: 0, shadeOffset: null });
  c.restore();
  // Taban taşları.
  shape(c, ellipse(-26, 0, 9, 5), STONE, { shadeOffset: [1.5, 1.5], line: 2.4 });
  shape(c, ellipse(28, 1, 8, 4.5), STONE, { shadeOffset: [1.5, 1.5], line: 2.4 });
  // Dikili taş gövdesi.
  const body = soft([-24, 3, 26, 3, 29, -44, 22, -104, 7, -132, -10, -127, -21, -96, -28, -42], 9);
  shape(c, body, STONE, { shadePath: soft([10, -130, 22, -104, 29, -44, 26, 3, 12, 3, 17, -50, 15, -104], 6) });
  // Yosun.
  shape(c, soft([-27, -30, -18, -38, -12, -30, -14, -18, -24, -14], 4), MOSS, { shadeOffset: [1, 1.5], line: 2 });
  shape(c, soft([12, -124, 19, -116, 13, -110, 6, -118], 3), MOSS, { shadeOffset: [1, 1], line: 2 });
  // Oyma desenler: spiral ve çentikler.
  const spiral = (p: CanvasRenderingContext2D): void => {
    for (let i = 0; i <= 28; i++) {
      const a = i * 0.42;
      const r = 1 + i * 0.32;
      const x = -4 + Math.cos(a) * r;
      const y = -24 + Math.sin(a) * r;
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
  };
  detail(c, spiral, CARVE, 2);
  for (const y of [-112, -106, -100]) detail(c, line([-6, y, 8, y - 2]), CARVE, 2);
  detail(c, line([18, -60, 22, -40, 18, -20]), CARVE, 1.8);
  // Yuva: koyu oyuk + iç oyma halka + tarafsız işaret (üç çentik).
  shape(c, circle(STONE_SOCKET.x, STONE_SOCKET.y, 17), STONE.shade, { line: 2.4, shadeOffset: [-2, -2] });
  detail(c, circle(STONE_SOCKET.x, STONE_SOCKET.y, 13), CARVE, 1.6);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    detail(c, line([STONE_SOCKET.x + Math.cos(a) * 3, STONE_SOCKET.y + Math.sin(a) * 3, STONE_SOCKET.x + Math.cos(a) * 9, STONE_SOCKET.y + Math.sin(a) * 9]), CARVE, 2.4);
  }
}

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

let atlas: Map<string, Texture> | null = null;

function textures(markerTop: number, markerBottom: number): Map<string, Texture> {
  const parts: PartSpec[] = [
    { name: 'stone.body', x0: -42, y0: -134, x1: 42, y1: 9, draw: bodyDraw },
    { name: 'stone.emblem.0', x0: -14, y0: -14, x1: 14, y1: 14, draw: emblemDraw(0) },
    { name: 'stone.emblem.1', x0: -15, y0: -17, x1: 15, y1: 17, draw: emblemDraw(1) },
    { name: 'stone.glow', x0: -30, y0: -30, x1: 30, y1: 30, draw: glowDraw },
    { name: 'stone.marker', x0: -6, y0: markerTop - 16, x1: 9, y1: markerBottom + 3, draw: markerDraw(markerTop, markerBottom) },
  ];
  atlas ??= buildAtlas('art.stone', parts, STONE_ART_RESOLUTION, 256);
  return atlas;
}

export interface StoneLayout {
  /** Bölge yarı genişliği (işaretler ±bu kadar uzakta). */
  halfWidth: number;
  /** Yürüme yolunun taş yerelindeki üst/alt kenarı (işaretler bu aralığı keser). */
  pathTop: number;
  pathBottom: number;
}

export class StoneRig {
  readonly root = new Container();
  private readonly glow: Sprite;
  private readonly emblems: [Sprite, Sprite];
  private readonly markers: [Sprite, Sprite];
  private readonly ring = new Graphics();
  private clockMs = 0;
  private popMs = Infinity;
  private lastCounter = Number.NaN;
  private lastOwner: ArtSide | null | undefined = undefined;

  constructor(layout: StoneLayout) {
    const map = textures(layout.pathTop, layout.pathBottom);
    const tex = (n: string): Texture => mustTexture(map, n);
    this.markers = [new Sprite(tex('stone.marker')), new Sprite(tex('stone.marker'))];
    this.markers[0].x = -layout.halfWidth;
    this.markers[1].x = layout.halfWidth;
    this.markers[1].scale.x = -1;
    this.glow = new Sprite(tex('stone.glow'));
    this.glow.anchor.set(0.5);
    this.glow.position.set(STONE_SOCKET.x, STONE_SOCKET.y);
    this.glow.scale.set(GLOW_SCALE);
    this.glow.visible = false;
    const body = new Sprite(tex('stone.body'));
    this.emblems = [new Sprite(tex('stone.emblem.0')), new Sprite(tex('stone.emblem.1'))];
    for (const e of this.emblems) {
      e.position.set(STONE_SOCKET.x, STONE_SOCKET.y);
      e.visible = false;
    }
    this.ring.position.set(STONE_SOCKET.x, STONE_SOCKET.y);
    this.root.addChild(this.markers[0], this.markers[1], this.glow, body, this.ring, this.emblems[0], this.emblems[1]);
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
    // Boşta: hale nefes alır, amblem hafifçe salınır; ele geçirilince kısa büyüme.
    const breathe = 0.5 + 0.5 * Math.sin((this.clockMs / BREATHE_MS) * Math.PI * 2);
    const pop = Number.isFinite(this.popMs) ? 1 - easeOutCubic(clamp01(this.popMs / CAPTURE_POP_MS)) : 0;
    this.glow.alpha = 0.32 + 0.22 * breathe + 0.45 * pop;
    this.glow.scale.set(GLOW_SCALE * (1 + 0.06 * breathe + 0.35 * pop));
    if (owner !== null) {
      const e = this.emblems[owner];
      e.scale.set(1 + 0.04 * breathe + 0.3 * pop);
      e.y = STONE_SOCKET.y + Math.sin((this.clockMs / BREATHE_MS) * Math.PI * 2 + 1) * 0.8;
    }
  }

  private applyOwner(owner: ArtSide | null): void {
    this.emblems[0].visible = owner === 0;
    this.emblems[1].visible = owner === 1;
    this.glow.visible = owner !== null;
    const tint = owner === null ? 0xffffff : TEAM[owner].trim.base;
    if (owner !== null) this.glow.tint = TEAM[owner].cloth.base;
    this.markers[0].tint = tint;
    this.markers[1].tint = tint;
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
