import type { Texture } from 'pixi.js';
import { buildAtlas, mustTexture, type PartSpec } from './atlas';
import { circle, detail, ellipse, line, rr, shape, soft, stick, stroke, type Ctx } from './paint';
import { AGE_KIT, GLOW_CORE, INK, MAT, type Tone } from './palette';

/**
 * Mermi ve çarpma etkisi dokuları (GDD §14: çağa özgü mermiler; vuruş kıvılcımı, toz). Tek küçük atlas,
 * ilk kullanımda tembel pişirilir. Her mermi +x yönüne bakar; (0,0) merminin ağırlık merkezi (iz başı).
 * Mermiler küçük ama yüksek kontrastlıdır: kalın mürekkep kontur + açık uç.
 */

export const FX_ART_RESOLUTION = 2;

const BRONZE = AGE_KIT[2].metal;
const IRON = AGE_KIT[3].metal;
const CAST = AGE_KIT[4].metal;
const BRASS = AGE_KIT[4].trim;
const GLOW = AGE_KIT[5].glow;
const FEATHER: Tone = { base: 0xf4ecd6, shade: 0xcdbf9c };
const FIRE: Tone = { base: 0xffcf5a, shade: 0xf06a26 };
const OIL: Tone = { base: 0x3b3640, shade: 0x231f28 };

/** Yumuşak ışıma (kontursuz, merkezden kenara solan). */
function glowBlob(c: Ctx, r: number, color: number, alpha: number): void {
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  const rgb = `${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff}`;
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.45, `rgba(${rgb},${alpha * 0.55})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
}

function fletch(c: Ctx, x: number, len: number, h: number, tone: Tone): void {
  shape(c, soft([x, 0, x - len, -h, x - len - 3, -h, x - len + 1, 0], 0.8), tone, { line: 1.6, shadeOffset: null });
  shape(c, soft([x, 0, x - len, h, x - len - 3, h, x - len + 1, 0], 0.8), tone, { line: 1.6, shadeOffset: null });
}

// ---- Birlik mermileri ----

function spear(c: Ctx): void {
  shape(c, soft([-24, -3.4, -18, -1, -18, 1, -24, 3.4], 1), MAT.bone, { line: 2 });
  stick(c, [-22, 0, 13, 0], 2.6, MAT.wood, 2.2);
  shape(c, soft([11, -4.2, 23, 0, 11, 4.2], 1.3), MAT.stone, { shadeOffset: [1, 1.2] });
}

function arrow(c: Ctx): void {
  stick(c, [-15, 0, 9, 0], 1.6, AGE_KIT[2].wood, 1.8);
  fletch(c, -10, 6, 3.6, FEATHER);
  shape(c, soft([7, -3.4, 15, 0, 7, 3.4, 8.5, 0], 0.8), BRONZE, { line: 1.8, shadeOffset: null });
}

function bolt(c: Ctx): void {
  stick(c, [-10, 0, 6, 0], 2.4, AGE_KIT[3].wood, 1.8);
  shape(c, soft([-11, 0, -16, -4, -12, -4, -7, 0, -12, 4, -16, 4], 0.8), AGE_KIT[3].leather, { line: 1.6, shadeOffset: null });
  shape(c, soft([4, -3.2, 12, -1.6, 13.5, 0, 12, 1.6, 4, 3.2], 0.8), IRON, { line: 1.8, shadeOffset: null });
}

function bullet(c: Ctx): void {
  glowBlob(c, 7, 0xffe7a0, 0.75);
  shape(c, soft([-3.5, -2, 2, -2, 4.5, 0, 2, 2, -3.5, 2], 1.2), BRASS, { line: 1.6, shadeOffset: null });
  shape(c, circle(1, -0.6, 0.8), 0xfff6d6, { line: 0 });
}

function rail(c: Ctx): void {
  glowBlob(c, 12, GLOW.shade, 0.7);
  shape(c, soft([-9, -2.4, 6, -2.4, 11, 0, 6, 2.4, -9, 2.4], 1.4), GLOW, { line: 1.8, shadeOffset: null });
  stroke(c, line([-7, 0, 8, 0]), 1.4, GLOW_CORE);
}

function rock(c: Ctx): void {
  shape(c, soft([-9, -3, -4.5, -9, 4.5, -9.5, 9.5, -2.5, 8, 6.5, -1, 9, -8.5, 5.5], 3.4), MAT.stone, { shadeOffset: [2, 2.5] });
  detail(c, line([-2, -4, 0.5, 0, -1.5, 3.5]), MAT.stone.shade, 1.5);
  shape(c, circle(-3.5, -4, 2), 0xd6d4ce, { line: 0 });
}

function ballista(c: Ctx): void {
  stick(c, [-24, 0, 16, 0], 3.2, AGE_KIT[2].wood, 2.2);
  shape(c, soft([-25, 0, -32, -6, -26, -6, -20, 0, -26, 6, -32, 6], 1), AGE_KIT[2].fabric, { line: 1.8, shadeOffset: null });
  shape(c, soft([13, -5, 27, 0, 13, 5, 16, 0], 1), BRONZE, { line: 2, shadeOffset: null });
  shape(c, rr(9, -2.6, 4, 5.2, 1), BRONZE, { line: 1.4 });
}

function catapult(c: Ctx): void {
  const S = AGE_KIT[3].stone;
  shape(c, soft([-12, -4, -7, -11.5, 3, -12.5, 11, -6, 12, 4, 5, 11.5, -6, 11, -12, 5], 4), S, { shadeOffset: [2.5, 3] });
  detail(c, line([-5, -6, -1, -1, -4, 5]), S.shade, 1.6);
  detail(c, line([4, -8, 6, -2]), S.shade, 1.4);
  shape(c, circle(-5, -6, 2.4), 0xd4d4d0, { line: 0 });
}

function cannonball(c: Ctx): void {
  shape(c, circle(0, 0, 7.5), { base: 0x3a3b42, shade: 0x1f2024 }, { shadeOffset: [2, 2] });
  shape(c, circle(-2.6, -2.6, 2.2), 0x8a8f99, { line: 0 });
}

function plasmaOrb(c: Ctx): void {
  glowBlob(c, 16, GLOW.shade, 0.75);
  shape(c, circle(0, 0, 6.5), GLOW, { line: 2, shadeOffset: [1.5, 1.5] });
  shape(c, circle(-1.6, -1.6, 2.6), GLOW_CORE, { line: 0 });
}

// ---- Kule mermileri ----

function sling(c: Ctx): void {
  shape(c, soft([-4.5, -1, -2, -4.5, 3, -4.5, 5, 0, 2.5, 4, -3, 3.8], 2), MAT.stone, { shadeOffset: [1.2, 1.5], line: 2.2 });
  shape(c, circle(-1.5, -2, 1.1), 0xd6d4ce, { line: 0 });
}

function laser(c: Ctx): void {
  glowBlob(c, 11, 0xff6fbf, 0.65);
  shape(c, rr(-10, -2, 20, 4, 2), { base: 0xff8fd0, shade: 0xd24a9a }, { line: 1.6, shadeOffset: null });
  stroke(c, line([-8, 0, 8, 0]), 1.3, GLOW_CORE);
}

function sand(c: Ctx): void {
  glowBlob(c, 13, 0xffa63a, 0.55);
  const grains: Array<[number, number, number]> = [
    [0, 0, 4.6],
    [-5, -3, 3],
    [4.5, -3.5, 2.8],
    [-3.5, 4, 2.6],
    [4, 3.8, 2.4],
    [-7.5, 1.5, 1.8],
    [7.5, 0.5, 1.8],
  ];
  for (const [x, y, r] of grains) shape(c, circle(x, y, r), FIRE, { line: 1.6, shadeOffset: [0.8, 0.8] });
  shape(c, circle(-1, -1, 1.6), 0xfff4c8, { line: 0 });
}

function oil(c: Ctx): void {
  // Alev dili geriye (-x) uzanır; damla önde.
  shape(c, soft([2, -6, -8, -8, -20, -2, -10, 0, -20, 3, -8, 7, 2, 6], 2.4), FIRE, { line: 1.8, shadeOffset: [1, 1] });
  shape(c, soft([0, -3, -9, -3.5, -13, 0, -9, 2.5, 0, 3], 1.4), 0xfff1b0, { line: 0 });
  shape(c, ellipse(4, 0, 7.5, 6), OIL, { shadeOffset: [1.5, 1.5] });
  shape(c, circle(6, -2.4, 1.6), 0x8a8494, { line: 0 });
}

function mortar(c: Ctx): void {
  shape(c, soft([-9, -3.6, -13, -6.5, -13, 6.5, -9, 3.6], 1), CAST, { line: 1.8, shadeOffset: null });
  shape(c, soft([-10, -4.5, 5, -4.5, 11, 0, 5, 4.5, -10, 4.5], 2.4), CAST, { shadeOffset: [1.2, 1.5] });
  shape(c, rr(-1, -4.6, 3, 9.2, 1), BRASS, { line: 1.4 });
  detail(c, line([-8, -2.6, 4, -2.6]), 0xa9afba, 1.2);
}

function plasmaBall(c: Ctx): void {
  glowBlob(c, 20, GLOW.shade, 0.7);
  shape(c, circle(0, 0, 8.5), { base: 0xf3c8ff, shade: 0xc65cff }, { line: 2.2, shadeOffset: [2, 2] });
  stroke(c, (p) => p.arc(0, 0, 5, -2.4, -0.6), 1.4, GLOW_CORE);
  shape(c, circle(-2, -2, 3), GLOW_CORE, { line: 0 });
}

// ---- Etkiler ----

/** Iz: başta (sağ uç, x=0) dolu, kuyruğa (x=-64) doğru solar. Yükseklik 6; renklendirilerek kullanılır. */
function streak(c: Ctx): void {
  const g = c.createLinearGradient(-64, 0, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-64, 0);
  c.quadraticCurveTo(-20, -3, 0, -2.6);
  c.arc(0, 0, 2.6, -Math.PI / 2, Math.PI / 2);
  c.quadraticCurveTo(-20, 3, -64, 0);
  c.fill();
}

function puff(c: Ctx): void {
  shape(c, circle(0, 0, 6), { base: 0xf1e4c4, shade: 0xd6c39b }, { line: 2, shadeOffset: [1.2, -1.5] });
}

/** Renklendirilebilir yumuşak duman (kontursuz, beyaz). */
function smoke(c: Ctx): void {
  glowBlob(c, 9, 0xffffff, 0.9);
}

function sparkBurst(c: Ctx): void {
  const pts: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? 11 : 3.6;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape(c, soft(pts, 1), MAT.spark, { line: 1.8, shadeOffset: null });
  shape(c, circle(0, 0, 2.6), 0xffffff, { line: 0 });
}

function zap(c: Ctx): void {
  glowBlob(c, 16, GLOW.shade, 0.6);
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = i % 2 === 0 ? 12 : 4.5;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape(c, soft(pts, 1), GLOW, { line: 1.8, shadeOffset: null });
  shape(c, circle(0, 0, 3), GLOW_CORE, { line: 0 });
}

/** Alan halkası (yarıçap 64; ölçeklenerek kullanılır). */
function ring(c: Ctx): void {
  stroke(c, ellipse(0, 0, 64, 64), 6, INK);
  stroke(c, ellipse(0, 0, 64, 64), 3.4, 0xffffff);
}

/** Damla/kırıntı (renklendirilir). */
function chip(c: Ctx): void {
  shape(c, soft([-3, -2, 1, -3.5, 3.5, 0, 1, 3, -3, 2], 1.2), 0xffffff, { line: 1.6, shadeOffset: null });
}

/** Birlik vuruş parlaması: gövde çevresinde yumuşak açık hale (birliğin arkasında). */
function halo(c: Ctx): void {
  glowBlob(c, 32, 0xffffff, 1);
}

export function fxParts(): PartSpec[] {
  return [
    { name: 'p.spear', x0: -25, y0: -5, x1: 24, y1: 5, draw: spear },
    { name: 'p.arrow', x0: -17, y0: -5, x1: 16, y1: 5, draw: arrow },
    { name: 'p.bolt', x0: -17, y0: -5, x1: 14, y1: 5, draw: bolt },
    { name: 'p.bullet', x0: -7, y0: -7, x1: 7, y1: 7, draw: bullet },
    { name: 'p.rail', x0: -12, y0: -12, x1: 12, y1: 12, draw: rail },
    { name: 'p.rock', x0: -10, y0: -10, x1: 10, y1: 10, draw: rock },
    { name: 'p.ballista', x0: -33, y0: -7, x1: 28, y1: 7, draw: ballista },
    { name: 'p.catapult', x0: -13, y0: -13, x1: 13, y1: 13, draw: catapult },
    { name: 'p.cannonball', x0: -8, y0: -8, x1: 8, y1: 8, draw: cannonball },
    { name: 'p.plasmaOrb', x0: -16, y0: -16, x1: 16, y1: 16, draw: plasmaOrb },
    { name: 'p.sling', x0: -6, y0: -6, x1: 6, y1: 6, draw: sling },
    { name: 'p.laser', x0: -11, y0: -11, x1: 11, y1: 11, draw: laser },
    { name: 'p.sand', x0: -13, y0: -13, x1: 13, y1: 13, draw: sand },
    { name: 'p.oil', x0: -21, y0: -9, x1: 12, y1: 8, draw: oil },
    { name: 'p.mortar', x0: -14, y0: -7, x1: 12, y1: 7, draw: mortar },
    { name: 'p.plasmaBall', x0: -20, y0: -20, x1: 20, y1: 20, draw: plasmaBall },
    { name: 'fx.streak', x0: -64, y0: -3, x1: 3, y1: 3, draw: streak },
    { name: 'fx.puff', x0: -7, y0: -7, x1: 7, y1: 7, draw: puff },
    { name: 'fx.smoke', x0: -9, y0: -9, x1: 9, y1: 9, draw: smoke },
    { name: 'fx.spark', x0: -12, y0: -12, x1: 12, y1: 12, draw: sparkBurst },
    { name: 'fx.zap', x0: -16, y0: -16, x1: 16, y1: 16, draw: zap },
    { name: 'fx.ring', x0: -67, y0: -67, x1: 67, y1: 67, draw: ring },
    { name: 'fx.chip', x0: -4, y0: -4, x1: 4, y1: 4, draw: chip },
    { name: 'fx.halo', x0: -32, y0: -32, x1: 32, y1: 32, draw: halo },
  ];
}

let atlas: Map<string, Texture> | null = null;

/** Atlası şimdi pişirir (ilk mermide takılma olmasın). */
export function prewarmFxArt(): void {
  atlas ??= buildAtlas('art.fx', fxParts(), FX_ART_RESOLUTION, 512);
}

export function fxTexture(name: string): Texture {
  prewarmFxArt();
  return mustTexture(atlas!, name);
}

/** Pişirilmiş atlasın boyutu (rapor). */
export function fxAtlasStats(): Array<{ width: number; height: number }> {
  if (atlas === null) return [];
  const src = atlas.values().next().value?.source;
  return src === undefined ? [] : [{ width: src.pixelWidth, height: src.pixelHeight }];
}
