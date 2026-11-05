import type { PartSpec } from './atlas';
import { css, type Ctx } from './paint';
import { INK } from './palette';

/**
 * Üs hasar katmanları (GDD §14: çatlaklar %75 / %50 / %25). Her düzey bir öncekini içerir (birikimli):
 * 1 ince çatlaklar; 2 daha çok çatlak, kopuk parçalar ve is lekeleri; 3 kalın yarıklar, büyük delikler, yanık.
 * Çizim üssün siluetine kırpılır (atlas maskesi): her çağın üssünde kendi biçimine oturur. Taraf farkı yoktur
 * (iki tarafın üs silueti aynıdır; rakip dışarıda aynalanır).
 */

/** Üs yerel çizim bölgesi (yapı gövdesi; zemin lekesinin üstü). */
const REGION = { x0: 4, x1: 172, y0: -205, y1: -18 } as const;
const CRACK_EDGE = 0xfff1d6;
const SOOT = 0x241b1b;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rand = () => number;

function polyline(c: Ctx, pts: readonly number[], width: number, color: number, alpha = 1): void {
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.lineWidth = width;
  c.strokeStyle = css(color);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
  c.restore();
}

/** Kırık çizgi çatlak + bir dal; açık kenar çizgisi kâğıt yırtığı gibi görünür. */
function crack(c: Ctx, rand: Rand, width: number, segments: number): void {
  let x = REGION.x0 + rand() * (REGION.x1 - REGION.x0);
  let y = REGION.y0 + 30 + rand() * (REGION.y1 - REGION.y0 - 40);
  let a = Math.PI / 2 + (rand() - 0.5) * 2.2;
  const main: number[] = [x, y];
  const branchAt = 2 + Math.floor(rand() * (segments - 3));
  let branch: number[] | null = null;
  for (let i = 0; i < segments; i++) {
    a += (rand() - 0.5) * 1.2;
    const len = 6 + rand() * 8;
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    main.push(x, y);
    if (i === branchAt) branch = [x, y];
  }
  const all: number[][] = [main];
  if (branch !== null) {
    let bx = branch[0]!;
    let by = branch[1]!;
    let ba = a + (rand() > 0.5 ? 1 : -1) * (0.7 + rand() * 0.6);
    for (let i = 0; i < 3; i++) {
      ba += (rand() - 0.5) * 0.8;
      bx += Math.cos(ba) * (5 + rand() * 5);
      by += Math.sin(ba) * (5 + rand() * 5);
      branch.push(bx, by);
    }
    all.push(branch);
  }
  for (const pts of all) polyline(c, pts.map((v, i) => v + (i % 2 === 0 ? 1.2 : 1.4)), width * 0.7, CRACK_EDGE, 0.75);
  for (const [i, pts] of all.entries()) polyline(c, pts, i === 0 ? width : width * 0.7, INK);
}

/** Kopuk parça: düzensiz koyu delik, açık kırık kenarlı. */
function hole(c: Ctx, rand: Rand, r: number): void {
  const cx = REGION.x0 + 8 + rand() * (REGION.x1 - REGION.x0 - 16);
  const cy = REGION.y0 + 40 + rand() * (REGION.y1 - REGION.y0 - 50);
  const n = 7;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const rr = r * (0.6 + rand() * 0.55);
    pts.push(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.8);
  }
  const path = (): void => {
    c.beginPath();
    c.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
    c.closePath();
  };
  c.save();
  c.translate(1.5, 1.5);
  path();
  c.fillStyle = css(CRACK_EDGE, 0.7);
  c.fill();
  c.restore();
  path();
  c.fillStyle = css(0x2d2430);
  c.fill();
  c.lineWidth = 2.2;
  c.strokeStyle = css(INK);
  c.lineJoin = 'round';
  c.stroke();
}

/** Is/yanık lekesi: yumuşak koyu leke. */
function soot(c: Ctx, rand: Rand, r: number, alpha: number): void {
  const cx = REGION.x0 + rand() * (REGION.x1 - REGION.x0);
  const cy = REGION.y0 + 30 + rand() * (REGION.y1 - REGION.y0 - 30);
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, css(SOOT, alpha));
  g.addColorStop(0.6, css(SOOT, alpha * 0.55));
  g.addColorStop(1, css(SOOT, 0));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
  c.fill();
}

/** Düzey 1..3 hasar çizimi (birikimli; aynı tohumla aynı çatlaklar). */
export function drawBaseDamage(level: 1 | 2 | 3) {
  return (c: Ctx): void => {
    const r1 = seeded(911);
    for (let i = 0; i < 9; i++) crack(c, r1, 2.4, 6);
    if (level < 2) return;
    const r2 = seeded(4242);
    for (let i = 0; i < 4; i++) soot(c, r2, 22 + r2() * 14, 0.4);
    for (let i = 0; i < 8; i++) crack(c, r2, 2.6, 7);
    for (let i = 0; i < 4; i++) hole(c, r2, 6 + r2() * 3);
    if (level < 3) return;
    const r3 = seeded(77);
    for (let i = 0; i < 5; i++) soot(c, r3, 30 + r3() * 18, 0.55);
    for (let i = 0; i < 9; i++) crack(c, r3, 3.4, 8);
    for (let i = 0; i < 6; i++) hole(c, r3, 9 + r3() * 4);
  };
}

/** Üs atlasına eklenecek hasar katmanları: `base.dmg.1..3`, `mask` üssün çizimi (taraf 0). */
export function baseDamageParts(baseDraw: (c: Ctx) => void): PartSpec[] {
  return ([1, 2, 3] as const).map((level) => ({
    name: `base.dmg.${level}`,
    x0: -12,
    y0: -232,
    x1: 180,
    y1: 7,
    draw: drawBaseDamage(level),
    mask: baseDraw,
  }));
}
