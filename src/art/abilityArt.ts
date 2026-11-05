import type { Texture } from 'pixi.js';
import { buildAtlas, mustTexture, type PartSpec } from './atlas';
import { circle, detail, ellipse, emblem, eye, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { AGE_KIT, GROUND_SHADOW, INK, MAT, TEAM, type ArtSide, type Tone } from './palette';

/**
 * Özel yetenek efektleri ve birlik durum işaretleri için parça atlası (GDD §7, §14).
 * Aynı "kesik kâğıt" dili: iki ton + koyu kontur. Parçalar ilk kullanımda bir kez pişirilir; efektler
 * yalnızca sprite'larla (ve alan başına bir kez çizilen Graphics ile) kurulur, karede yeniden çizim yoktur.
 * Takım renkli parçalar taraf başına ayrı pişirilir (ad sonu `.0` / `.1`).
 *
 * Parçalar sağa bakar (rakip için dışarıdan aynalanır). (0,0): hayvanlarda ayak tabanı merkezi, bacaklarda
 * kalça/omuz eklemi, alevlerde ve kazıklarda zemin noktası, mermide burun, patlamada merkez.
 */

export const ABILITY_ART_RESOLUTION = 2;

// ---- Malzemeler (yalnız görünüm) ----
const BOAR_FUR: Tone = { base: 0x7d5c45, shade: 0x5a3f2e };
const BOAR_MANE: Tone = { base: 0x4a3326, shade: 0x2f2019 };
const SNOUT: Tone = { base: 0xe0a294, shade: 0xb7766a };
const OX_HIDE: Tone = { base: 0x5e4030, shade: 0x41291d };
const OX_MUZZLE: Tone = { base: 0xc9a27c, shade: 0x9f7a55 };
const OX_STRIPE = 0xc49a66;
const HOOF: Tone = { base: 0x3a2a22, shade: 0x241913 };
const DUST: Tone = { base: 0xe9d9b4, shade: 0xc8b28a };
const SMOKE: Tone = { base: 0xb8b2bd, shade: 0x8c8696 };
const FLAME_OUTER: Tone = { base: 0xf26b2a, shade: 0xc9441c };
const FLAME_MID = 0xffb340;
const FLAME_CORE = 0xfff1b0;
const IRON: Tone = { base: 0x8d94a2, shade: 0x5a6070 };
const IRON_HI = 0xdfe4ee;
const HAZARD: Tone = { base: 0xffd23f, shade: 0xe0a91c };
const SHELL_BODY: Tone = AGE_KIT[4].metal;
const SHELL_NOSE: Tone = AGE_KIT[4].trim;
const PYLON_BASE: Tone = { base: 0x445079, shade: 0x2c3456 };
const PYLON_COLUMN: Tone = AGE_KIT[5].limb;
const NEON: Tone = AGE_KIT[5].glow;
const ICE: Tone = { base: 0xe4dbff, shade: 0xa994f2 };
const STAKE: Tone = MAT.wood;

/** Hayvan iskeleti eklem yerleri (efekt bunları kullanır; parça çizimleriyle birlikte tutulur). */
export const BOAR_RIG = { hipX: -14, shoulderX: 12, jointY: -13, legSpread: 4 } as const;
export const OX_RIG = { hipX: -24, shoulderX: 20, jointY: -21, legSpread: 6 } as const;

/** Bir şeklin içine kırpılmış çizim (savaş boyası, bant). */
function clipped(c: Ctx, path: PathFn, draw: () => void): void {
  c.save();
  c.beginPath();
  path(c);
  c.clip();
  draw();
  c.restore();
}

function shadowDraw(c: Ctx): void {
  c.save();
  c.globalAlpha = GROUND_SHADOW.alpha;
  shape(c, ellipse(0, 0, 20, 5), GROUND_SHADOW.color, { line: 0, shadeOffset: null });
  c.restore();
}

// ---- Sürü Hücumu: yaban domuzu ve yaban öküzü ----

function boarBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Kuyruk (kıvrık).
    stroke(c, line([-24, -27, -29, -30, -30, -25, -27, -24]), 4.6, INK);
    stroke(c, line([-24, -27, -29, -30, -30, -25, -27, -24]), 2, BOAR_FUR.shade);
    const body = soft([-27, -16, -25, -29, -15, -36, 0, -38, 12, -35, 20, -29, 22, -16, 10, -11, -15, -11], 8);
    shape(c, body, BOAR_FUR, { shadeOffset: [3, 3.5] });
    // Savaş boyası: takımın vurgu renginde iki şerit (omuz).
    clipped(c, body, () => {
      for (const sx of [2, 9]) shape(c, soft([sx, -40, sx + 4, -40, sx - 1, -10, sx - 5, -10], 1.5), team.trim, { line: 0, shadeOffset: null });
    });
    stroke(c, body, 3);
    // Sırt yelesi (diken diken).
    const mane: number[] = [-18, -32];
    for (let i = 0; i <= 8; i++) {
      const x = -16 + i * 4;
      mane.push(x, i % 2 === 0 ? -41 - (i === 4 ? 2 : 0) : -36);
    }
    mane.push(16, -31, 0, -34);
    shape(c, soft(mane, 1), BOAR_MANE, { shadeOffset: [1, 1.5], line: 2.4 });
    // Baş.
    shape(c, soft([15, -31, 29, -27, 37, -19, 37, -13, 29, -10, 16, -14], 4), BOAR_FUR, { shadeOffset: [2, 2.5] });
    shape(c, soft([18, -31, 21, -40, 26, -30], 1.5), BOAR_FUR, { line: 2.4, shadeOffset: [1, 1] });
    shape(c, ellipse(37, -15.5, 3.2, 4.2), SNOUT, { line: 2.2, shadeOffset: [1, 1] });
    shape(c, circle(37.6, -16.6, 0.8), INK, { line: 0 });
    shape(c, circle(37.6, -14, 0.8), INK, { line: 0 });
    // Diş.
    shape(c, soft([29.5, -13, 32.5, -13.5, 35.5, -21, 33.5, -21.5], 1), MAT.bone, { line: 1.8, shadeOffset: null });
    eye(c, 27, -23, 1.8);
    // Böğürde amblem (oyuncu daire, rakip elmas).
    emblem(c, side, -8, -24, 4.2, 2);
  };
}

function boarLeg(c: Ctx): void {
  shape(c, rr(-3.2, -2, 6.4, 13.5, 3), BOAR_FUR, { shadeOffset: [1.5, 1] });
  shape(c, ellipse(0.8, 12, 3.8, 2.3), HOOF, { line: 2, shadeOffset: null });
}

function oxBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Kuyruk ve püskül.
    stick(c, [-36, -40, -41, -32, -42, -24], 2.4, OX_HIDE, 2);
    shape(c, ellipse(-42, -22, 3, 4.5), OX_HIDE, { line: 2, shadeOffset: null });
    const body = soft([-39, -22, -37, -41, -25, -49, -2, -51, 14, -58, 27, -51, 32, -37, 30, -22, 14, -18, -25, -18], 10);
    shape(c, body, OX_HIDE, { shadeOffset: [3.5, 4] });
    clipped(c, body, () => {
      // Sırt şeridi (yaban öküzü işareti) ve takım renginde el boyası çizgileri.
      detail(c, line([-34, -44, -12, -50, 4, -54, 18, -57]), OX_STRIPE, 3.4);
      for (const sx of [-24, -17, -10]) shape(c, soft([sx, -45, sx + 4.5, -45, sx + 1, -22, sx - 3.5, -22], 1.6), team.trim, { line: 0, shadeOffset: null });
    });
    stroke(c, body, 3);
    // Uzak boynuz (koyu).
    shape(c, soft([28, -45, 33, -47, 39, -56, 41, -62, 38.5, -62, 33, -54, 28.5, -49], 2), MAT.bone.shade, { line: 2.2, shadeOffset: null });
    // Eğik baş.
    shape(c, soft([25, -47, 39, -41, 48, -29, 47, -21, 38, -18, 29, -27], 5), OX_HIDE, { shadeOffset: [2, 2.5] });
    shape(c, ellipse(45.5, -23, 4.6, 4.2), OX_MUZZLE, { line: 2.2, shadeOffset: [1, 1] });
    shape(c, circle(48, -24, 0.9), INK, { line: 0 });
    // Ön boynuz: ileri-yukarı kıvrık.
    shape(c, soft([31, -44, 36, -46, 43, -55, 47, -63, 44.5, -63.5, 38.5, -55, 32, -48.5], 2), MAT.bone, { line: 2.4, shadeOffset: [1, 1] });
    shape(c, soft([26, -43, 30, -48, 33, -42], 1.5), OX_HIDE, { line: 2.2, shadeOffset: null });
    eye(c, 37, -35, 1.9);
    emblem(c, side, 4, -36, 6, 2.4);
  };
}

function oxLeg(c: Ctx): void {
  shape(c, rr(-4, -2, 8, 21.5, 4), OX_HIDE, { shadeOffset: [1.5, 1] });
  shape(c, ellipse(1, 20.5, 4.6, 2.6), HOOF, { line: 2, shadeOffset: null });
}

function puff(tone: Tone) {
  return (c: Ctx): void => {
    const cluster: PathFn = (p) => {
      p.arc(-6, 2, 5.5, 0, Math.PI * 2);
      p.moveTo(6 + 5.5, 2);
      p.arc(6, 2, 5.5, 0, Math.PI * 2);
      p.moveTo(7, -1);
      p.arc(0, -1, 7, 0, Math.PI * 2);
    };
    stroke(c, cluster, 4.4, INK);
    shape(c, circle(-6, 2, 5.5), tone, { line: 0, shadeOffset: [1, 1.5] });
    shape(c, circle(6, 2, 5.5), tone, { line: 0, shadeOffset: [1, 1.5] });
    shape(c, circle(0, -1, 7), tone, { line: 0, shadeOffset: [1.5, 2] });
  };
}

/** Çizgi roman "güm" çizgileri: vuruş anı (sarsıntı hissi, ekran sarsıntısı yerine). */
function impactLines(c: Ctx): void {
  const rays: ReadonlyArray<readonly [number, number, number]> = [
    [-Math.PI / 2, 9, 22],
    [-Math.PI / 2 - 0.75, 10, 20],
    [-Math.PI / 2 + 0.75, 10, 20],
    [-Math.PI + 0.25, 11, 18],
    [-0.25, 11, 18],
  ];
  for (const [a, r0, r1] of rays) {
    const pts = [Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1];
    stroke(c, line(pts), 6, INK);
    stroke(c, line(pts), 2.8, 0xfff3c4);
  }
}

// ---- Ateş Hendeği ----

function flame(points: readonly number[], mid: readonly number[], core: readonly number[]) {
  return (c: Ctx): void => {
    shape(c, soft(points, 4), FLAME_OUTER, { line: 2.4, shadeOffset: [-2, 2] });
    shape(c, soft(mid, 3), FLAME_MID, { line: 0 });
    shape(c, soft(core, 2), FLAME_CORE, { line: 0 });
  };
}

const flameA = flame(
  [-11, 0, -12, -12, -6, -24, -7, -34, 0, -46, 5, -32, 10, -26, 12, -12, 11, 0],
  [-7, 0, -8, -10, -3, -20, -1, -30, 4, -19, 8, -10, 7, 0],
  [-4, 0, -4, -7, 0, -15, 4, -7, 4, 0],
);
const flameB = flame(
  [-12, 0, -13, -10, -9, -22, -12, -38, -3, -27, 2, -40, 6, -29, 11, -20, 12, 0],
  [-8, 0, -9, -9, -5, -18, -2, -24, 2, -17, 7, -9, 7, 0],
  [-4, 0, -4, -6, 0, -13, 3, -6, 4, 0],
);
const flameLip = flame(
  [-15, 0, -14, -6, -9, -10, -5, -8, 0, -16, 4, -9, 9, -12, 14, -6, 15, 0],
  [-10, 0, -9, -4, -4, -6, 0, -11, 4, -5, 9, -5, 10, 0],
  [-5, 0, -2, -4, 2, -6, 5, 0],
);

function ember(c: Ctx): void {
  shape(c, circle(0, 0, 2.6), MAT.flame, { line: 1.2, shadeOffset: [0.6, 0.6] });
  shape(c, circle(-0.5, -0.5, 1), FLAME_CORE, { line: 0 });
}

/** Bölge kazığı: ahşap kazık + takım renginde flama ve amblem; flama düşmana doğru dalgalanır. */
function pennant(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, ellipse(0, 0, 6, 2.2), MAT.stone, { line: 2, shadeOffset: null });
    stick(c, [0, 1, 0, -48], 3, STAKE, 2.4);
    shape(c, soft([1.5, -48, 25, -42, 21, -38.5, 25, -35, 1.5, -33], 2), team.cloth, { shadeOffset: [1.5, 1.5], line: 2.4 });
    emblem(c, side, 9.5, -40.5, 3.3, 1.8);
    shape(c, circle(0, -49.5, 2.2), MAT.rope, { line: 1.8, shadeOffset: null });
  };
}

// ---- Çivi Kapanı ----

function caltrop(rot: number) {
  return (c: Ctx): void => {
    c.save();
    c.rotate(rot);
    const spikes: ReadonlyArray<readonly number[]> = [
      [-1.8, -2, 0, -12, 1.8, -2],
      [-2, -1, -10.5, 2.5, -1, 1.6],
      [2, -1.4, 10, 1.4, 1, 1.6],
      [-1.4, 0.5, 1.5, 6.5, 2, 0],
    ];
    for (const s of spikes) shape(c, soft(s, 0.6), IRON, { line: 1.8, shadeOffset: [0.8, 0.8] });
    shape(c, circle(0, -0.5, 2.6), IRON, { line: 1.8, shadeOffset: [0.8, 0.8] });
    shape(c, circle(-0.6, -5.5, 0.9), IRON_HI, { line: 0 });
    c.restore();
  };
}

/** Dört köşeli parıltı (çivi pırıltısı, donma kristali parıltısı; tint ile renklenir). */
function glint(c: Ctx): void {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 9 : 2.2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape(c, soft(pts, 0.8), { base: 0xffffff, shade: 0xe6e6f2 }, { line: 1.4, shadeOffset: [0.6, 0.6] });
}

// ---- Baraj Ateşi ----

/** Hedef halkası (zeminde, perspektifle basık): takım renginde, ortada amblem. */
function reticle(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    const ring = ellipse(0, 0, 34, 12);
    stroke(c, ring, 7, INK);
    stroke(c, ring, 3.6, team.cloth.base);
    for (const [x0, y0, x1, y1] of [
      [-44, 0, -28, 0],
      [28, 0, 44, 0],
      [0, -17, 0, -8],
      [0, 8, 0, 17],
    ] as const) {
      stroke(c, line([x0, y0, x1, y1]), 6, INK);
      stroke(c, line([x0, y0, x1, y1]), 2.6, HAZARD.base);
    }
    emblem(c, side, 0, 0, 3.6, 1.8);
  };
}

/** Uyarı levhası: sarı üçgen, takım renginde çerçeve, altında takım amblemi. */
function warnSign(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    stick(c, [0, -2, 0, 12], 2, MAT.rope, 1.8);
    emblem(c, side, 0, 14, 4.4, 2);
    shape(c, soft([0, -40, 23, 0, -23, 0], 5), team.cloth, { shadeOffset: [2, 2], line: 3 });
    shape(c, soft([0, -31, 15.5, -4.5, -15.5, -4.5], 3), HAZARD, { shadeOffset: [1.5, 1.5], line: 2 });
    shape(c, rr(-2.2, -25, 4.4, 12, 2), INK, { line: 0 });
    shape(c, circle(0, -8.5, 2.3), INK, { line: 0 });
  };
}

/** Düşen mermi: burun (0,0) aşağıda; üstünde hız izi. Takım renginde bant. */
function shell(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    c.save();
    c.globalAlpha = 0.55;
    shape(c, soft([-3.4, -30, 3.4, -30, 0.8, -96, -0.8, -96], 0.6), 0xfffbea, { line: 0 });
    c.restore();
    shape(c, soft([-3, -36, 0, -31, 3, -36, 5.5, -40, 5.5, -30, -5.5, -30, -5.5, -40], 1), SHELL_BODY, { line: 2, shadeOffset: null });
    const body = soft([-5.5, -31, 5.5, -31, 5.5, -11, 3.5, -4, 0, 0, -3.5, -4, -5.5, -11], 2);
    shape(c, body, SHELL_BODY, { shadeOffset: [1.5, 1.5], line: 0 });
    clipped(c, body, () => {
      shape(c, rr(-7, -12, 14, 14, 0), SHELL_NOSE, { line: 0, shadeOffset: null });
      shape(c, rr(-7, -22, 14, 5, 0), team.cloth.base, { line: 0, shadeOffset: null });
    });
    stroke(c, body, 2.4);
  };
}

function burst(c: Ctx): void {
  const star = (r0: number, r1: number, n: number, rot: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + rot;
      const r = i % 2 === 0 ? r0 : r1;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return pts;
  };
  shape(c, soft(star(36, 19, 11, 0.1), 2), FLAME_OUTER, { line: 3, shadeOffset: [-2.5, 2.5] });
  shape(c, soft(star(22, 12, 9, 0.35), 1.5), FLAME_MID, { line: 0 });
  shape(c, circle(0, 0, 8), FLAME_CORE, { line: 0 });
}

function scorch(c: Ctx): void {
  c.save();
  c.globalAlpha = 0.42;
  shape(c, ellipse(0, 0, 30, 7.5), 0x2a1d12, { line: 0, shadeOffset: null });
  c.globalAlpha = 0.5;
  shape(c, ellipse(1, 0.5, 17, 4), 0x1a120c, { line: 0, shadeOffset: null });
  c.restore();
}

// ---- Durağanlık Alanı ----

/** Kubbe projektörü: koyu lacivert direk, takım renginde ışık halkası ve amblem, eflatun yayıcı. */
function pylon(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, soft([-10, 1, 10, 1, 8, -6, -8, -6], 1.5), PYLON_BASE, { line: 2.4, shadeOffset: [1, 1] });
    shape(c, rr(-4.5, -28, 9, 24, 2), PYLON_COLUMN, { line: 2.4, shadeOffset: [1.5, 1] });
    shape(c, rr(-5.5, -15, 11, 3.6, 1.6), team.trim, { line: 1.6, shadeOffset: null });
    emblem(c, side, 0, -22, 2.6, 1.5);
    shape(c, ellipse(0, -30.5, 7, 3.4), NEON, { line: 2.2, shadeOffset: [0.8, 0.8] });
    shape(c, ellipse(0, -31, 3, 1.4), 0xffffff, { line: 0 });
  };
}

// ---- Durum işaretleri (birlik üstünde) ----

function statusStar(c: Ctx): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 6.8 : 2.9;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape(c, soft(pts, 0.9), MAT.spark, { line: 1.8, shadeOffset: [0.8, 0.8] });
}

/** Donma kristalleri: ayakları saran buz/enerji kümesi. Zemin merkezi (0,0). */
function statusCrystal(c: Ctx): void {
  const shards: ReadonlyArray<readonly number[]> = [
    [-17, 1, -19, -8, -12, -16, -8, -6, -8, 1],
    [8, 1, 9, -9, 15, -18, 20, -7, 18, 1],
    [-6, 1, -7, -15, 0, -26, 6.5, -15, 5.5, 1],
  ];
  for (const s of shards) {
    shape(c, soft(s, 1.2), ICE, { line: 2, shadeOffset: [1.5, 1] });
  }
  detail(c, line([0, -24, -1, -4]), 0xffffff, 1.4);
  detail(c, line([14.5, -16, 13, -3]), 0xffffff, 1.2);
  detail(c, line([-12.5, -14, -12, -3]), 0xffffff, 1.2);
}

/** Atlas parçaları. */
export function abilityParts(): PartSpec[] {
  const parts: PartSpec[] = [
    { name: 'shadow', x0: -21, y0: -6, x1: 21, y1: 6, draw: shadowDraw },
    { name: 'boar.leg', x0: -5, y0: -4, x1: 6, y1: 16, draw: boarLeg },
    { name: 'ox.leg', x0: -6, y0: -4, x1: 7, y1: 25, draw: oxLeg },
    { name: 'dust', x0: -14, y0: -10, x1: 14, y1: 10, draw: puff(DUST) },
    { name: 'smoke', x0: -14, y0: -10, x1: 14, y1: 10, draw: puff(SMOKE) },
    { name: 'impact', x0: -25, y0: -25, x1: 25, y1: 2, draw: impactLines },
    { name: 'flame.a', x0: -15, y0: -49, x1: 15, y1: 2, draw: flameA },
    { name: 'flame.b', x0: -16, y0: -42, x1: 15, y1: 2, draw: flameB },
    { name: 'flame.lip', x0: -18, y0: -19, x1: 18, y1: 2, draw: flameLip },
    { name: 'ember', x0: -4, y0: -4, x1: 4, y1: 4, draw: ember },
    { name: 'caltrop.a', x0: -13, y0: -14, x1: 13, y1: 10, draw: caltrop(0) },
    { name: 'caltrop.b', x0: -13, y0: -14, x1: 13, y1: 10, draw: caltrop(0.5) },
    { name: 'glint', x0: -11, y0: -11, x1: 11, y1: 11, draw: glint },
    { name: 'burst', x0: -39, y0: -39, x1: 39, y1: 39, draw: burst },
    { name: 'scorch', x0: -31, y0: -8, x1: 31, y1: 8, draw: scorch },
    { name: 'status.star', x0: -8, y0: -8, x1: 8, y1: 8, draw: statusStar },
    { name: 'status.crystal', x0: -22, y0: -29, x1: 22, y1: 3, draw: statusCrystal },
  ];
  for (const side of [0, 1] as const) {
    parts.push(
      { name: `boar.body.${side}`, x0: -32, y0: -44, x1: 40, y1: -8, draw: boarBody(side) },
      { name: `ox.body.${side}`, x0: -46, y0: -66, x1: 51, y1: -15, draw: oxBody(side) },
      { name: `pennant.${side}`, x0: -7, y0: -53, x1: 28, y1: 4, draw: pennant(side) },
      { name: `reticle.${side}`, x0: -47, y0: -20, x1: 47, y1: 20, draw: reticle(side) },
      { name: `warn.${side}`, x0: -26, y0: -44, x1: 26, y1: 21, draw: warnSign(side) },
      { name: `shell.${side}`, x0: -8, y0: -98, x1: 8, y1: 2, draw: shell(side) },
      { name: `pylon.${side}`, x0: -12, y0: -36, x1: 12, y1: 3, draw: pylon(side) },
    );
  }
  return parts;
}

let atlas: Map<string, Texture> | null = null;

/** Yetenek atlasını pişirir (ilk kullanımda tembel; açılışta çağrılırsa ilk yetenekte takılma olmaz). */
export function prewarmAbilityArt(): void {
  atlas ??= buildAtlas('art.abilities', abilityParts(), ABILITY_ART_RESOLUTION, 512);
}

export function abilityTexture(name: string): Texture {
  prewarmAbilityArt();
  return mustTexture(atlas!, name);
}

/** Atlas doku boyutu (rapor/hata ayıklama); pişirilmediyse null. */
export function abilityAtlasStats(): { width: number; height: number } | null {
  const src = atlas?.values().next().value?.source;
  return src === undefined ? null : { width: src.pixelWidth, height: src.pixelHeight };
}
