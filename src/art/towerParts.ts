import type { PartSpec } from './atlas';
import { HULL, MARBLE, STONE_GREY } from './ageBases';
import { circle, detail, ellipse, emblem, lashing, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { AGE_KIT, GLOW_CORE, INK, MAT, TEAM, type ArtAge, type ArtSide, type Tone } from './palette';

/**
 * Kuleler ve yuvalar (GDD §6, §14). Yerel koordinat: (0,0) yuva güvertesinin üst-orta noktası, kule sağa
 * (koridora) bakar, y yukarı eksi. Rakip, üs ile birlikte aynalanır.
 * Her kule üç parçadır: gövde (takım rengi + amblem), silah (eksen noktasında döner/geri teper) ve isteğe bağlı
 * yük (çakıl, ok, kaya, kum, yağ, plazma); ayrıca takımdan bağımsız atış parlaması.
 * Siluet kuralı: hızlı kule (A) ince ve uzun, ince yatay silah; ağır kule (B) geniş ve alçak, iri hazne/namlu.
 * Yuva platformu ve kilit kapağı üssün çağıyla, kule kendi çağıyla çizilir.
 */

export type TowerKind = 'fast' | 'heavy';
/**
 * Atış hareketi: `snap` yay/sapan (kısa sıçrama), `burst` makineli (üçlü titreme), `beam` lazer (ışık nabzı),
 * `recoil` havan/plazma (büyük geri tepme), `tip` oluk/kazan (öne devrilip döker).
 */
export type TowerMotion = 'snap' | 'burst' | 'beam' | 'recoil' | 'tip';

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface TowerStyle {
  readonly motion: TowerMotion;
  /** Silah ekseni (kule yerel). */
  readonly pivot: Pt;
  /** Dinlenme açısı (radyan; eksi = namlu yukarı). */
  readonly aim: number;
  /** Silah yerelinde mermi çıkış noktası. */
  readonly muzzle: Pt;
  /** Çıkış noktası gövdeye sabit (oluk ucu): devrilirken yerinde kalır. */
  readonly fixedMuzzle?: boolean;
  /** Silah yerelinde yük konumu; null: yük yok. */
  readonly load: Pt | null;
  /** Geri tepme (px) ya da dökme açısı (radyan, `tip`). */
  readonly kick: number;
}

const K2 = AGE_KIT[2];
const K3 = AGE_KIT[3];
const K4 = AGE_KIT[4];
const K5 = AGE_KIT[5];
const IRON: Tone = { base: 0x55596a, shade: 0x3a3d4b };
const SAND_GLOW: Tone = { base: 0xffd35a, shade: 0xf0782a };
const OIL: Tone = { base: 0xe9b03a, shade: 0xa8701c };
const DUST: Tone = { base: 0xe6d6b6, shade: 0xc4ae88 };

export const TOWER_STYLE: Record<ArtAge, Record<TowerKind, TowerStyle>> = {
  1: {
    fast: { motion: 'snap', pivot: { x: 0, y: -43 }, aim: 0, muzzle: { x: 4, y: -17 }, load: { x: -11, y: -11 }, kick: 3 },
    heavy: { motion: 'tip', pivot: { x: -17, y: -30 }, aim: 0.2, muzzle: { x: 45, y: -4 }, load: { x: 14, y: -15 }, kick: 0.32 },
  },
  2: {
    fast: { motion: 'snap', pivot: { x: 1, y: -47 }, aim: -0.06, muzzle: { x: 26, y: 0 }, load: { x: -5, y: 0 }, kick: 3 },
    heavy: { motion: 'tip', pivot: { x: 17, y: -36 }, aim: 0, muzzle: { x: 2, y: -6 }, load: { x: -16, y: -4 }, kick: 0.72 },
  },
  3: {
    fast: { motion: 'snap', pivot: { x: 0, y: -47 }, aim: -0.04, muzzle: { x: 22, y: -1 }, load: { x: 0, y: -1 }, kick: 3.5 },
    heavy: { motion: 'tip', pivot: { x: 8, y: -26 }, aim: 0, muzzle: { x: 30, y: 11 }, fixedMuzzle: true, load: { x: -12, y: -17 }, kick: 0.62 },
  },
  4: {
    fast: { motion: 'burst', pivot: { x: -2, y: -47 }, aim: 0, muzzle: { x: 31, y: 0 }, load: null, kick: 2.4 },
    heavy: { motion: 'recoil', pivot: { x: 5, y: -19 }, aim: -0.95, muzzle: { x: 30, y: 0 }, load: null, kick: 7 },
  },
  5: {
    fast: { motion: 'beam', pivot: { x: 0, y: -49 }, aim: 0, muzzle: { x: 27, y: 0 }, load: null, kick: 1.6 },
    heavy: { motion: 'recoil', pivot: { x: 6, y: -22 }, aim: -0.7, muzzle: { x: 28, y: 0 }, load: { x: 27, y: 0 }, kick: 5 },
  },
};

// ---- Ortak yardımcılar ----

function glowDisk(c: Ctx, x: number, y: number, r: number, tone: Tone): void {
  c.save();
  c.globalAlpha = 0.35;
  shape(c, circle(x, y, r * 1.7), tone.shade, { line: 0, shadeOffset: null });
  c.restore();
  shape(c, circle(x, y, r), tone, { line: 2, shadeOffset: [r * 0.25, r * 0.25] });
  shape(c, circle(x - r * 0.25, y - r * 0.25, r * 0.4), GLOW_CORE, { line: 0 });
}

/** Sivri ışık patlaması; ileri (+x) doğru uzar. */
function burst(c: Ctx, r: number, tone: Tone, points: number, stretch = 1.5): void {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const rr0 = i % 2 === 0 ? r : r * 0.45;
    const sx = Math.cos(a) > 0 ? stretch : 1;
    pts.push(Math.cos(a) * rr0 * sx, Math.sin(a) * rr0);
  }
  shape(c, soft(pts, 1), tone, { line: 2, shadeOffset: null });
  shape(c, circle(r * 0.15, 0, r * 0.32), GLOW_CORE, { line: 0 });
}

function sandbag(c: Ctx, x: number, y: number, w: number, h: number): void {
  shape(c, rr(x, y, w, h, h / 2), K4.fabric, { shadeOffset: [1.5, 2], line: 2.4 });
  detail(c, line([x + w / 2, y + 1.5, x + w / 2, y + h - 1.5]), K4.fabric.shade, 1.2);
}

function stoneBlocks(c: Ctx, x: number, y: number, w: number, h: number): void {
  for (let yy = y + 9, row = 0; yy < y + h - 2; yy += 9, row++) {
    detail(c, line([x + 2, yy, x + w - 2, yy]), STONE_GREY.shade, 1.1);
    for (let xx = x + (row % 2 === 0 ? 7 : 13); xx < x + w - 3; xx += 12) detail(c, line([xx, yy - 9, xx, yy]), STONE_GREY.shade, 1.1);
  }
}

function hexPanels(c: Ctx, clip: PathFn, x0: number, y0: number, cols: number, rows: number, tone: Tone): void {
  c.save();
  c.beginPath();
  clip(c);
  c.clip();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const hx = x0 + col * 11 + (row % 2) * 5.5;
      const hy = y0 - row * 9;
      const hex: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        hex.push(hx + Math.cos(a) * 5.5, hy + Math.sin(a) * 5.2);
      }
      detail(c, soft(hex, 0.8), tone.shade, 1);
    }
  }
  c.restore();
}

/** Kalın ok/cıvata: sap + uç + takım renkli tüy. */
function bolt(c: Ctx, side: ArtSide, len: number, head: Tone, shaft: Tone): void {
  const team = TEAM[side];
  shape(c, soft([-1, -3.2, 4, -1, 4, 1, -1, 3.2], 0.8), team.trim, { line: 1.8 });
  stick(c, [0, 0, len, 0], 1.8, shaft, 1.6);
  shape(c, soft([len - 1, -2.6, len + 5, 0, len - 1, 2.6], 0.6), head, { line: 1.8 });
}

// ---- 1 İlkel: Sapan Direği (A) · Kaya Oluğu (B) ----

function slingBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    stick(c, [-15, 0, -4, -38], 3.6, MAT.wood);
    stick(c, [15, 0, 4, -38], 3.6, MAT.wood);
    stick(c, [0, 0, 0, -40], 5, MAT.wood);
    stick(c, [-11, -8, 11, -8], 3, MAT.wood);
    lashing(c, 0, -12, 7, 7, MAT.rope, 2);
    // Takım sancağı (deri) + amblem.
    shape(c, soft([-11, -37, 11, -37, 11, -21, 0, -15, -11, -21], 2), team.cloth, { shadeOffset: [2, 2] });
    stroke(c, line([-10, -24, -5, -22, 0, -19, 5, -22, 10, -24]), 2.2, team.trim.base);
    emblem(c, side, 0, -29, 5.2, 2.2);
    // Gözcü tahtası.
    shape(c, rr(-14, -44, 28, 6, 2.5), MAT.woodCut, { shadeOffset: [1.5, 1.5] });
    lashing(c, -9, -44, 4, 6, MAT.rope, 1);
    lashing(c, 9, -44, 4, 6, MAT.rope, 1);
  };
}

function slingGun(c: Ctx): void {
  stick(c, [0, 0, 1, -7], 4, MAT.wood);
  stick(c, [1, -7, -4, -19], 3.2, MAT.wood);
  stick(c, [1, -7, 9, -18], 3.2, MAT.wood);
  // Gerili deri şerit: çatal uçlarından geriye, kesedeki çakıla.
  const band = line([-4, -19, -11, -11, 9, -18]);
  stroke(c, band, 4.2, INK);
  stroke(c, band, 2, MAT.hide.base);
  shape(c, ellipse(-11, -11, 4.6, 3.4, -0.5), MAT.hide, { line: 2 });
}

function pebble(c: Ctx): void {
  shape(c, circle(0, 0, 2.8), MAT.stone, { line: 1.8, shadeOffset: [0.8, 0.8] });
}

function chuteBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Kütük kafes.
    stick(c, [-18, -16, -17, -31], 5, MAT.wood);
    stick(c, [17, -16, 19, -23], 4, MAT.wood);
    shape(c, rr(-27, -9, 54, 9, 4.5), MAT.wood, { shadeOffset: [2, 2] });
    shape(c, rr(-23, -18, 46, 9, 4.5), MAT.wood, { shadeOffset: [2, 2] });
    for (const [x, y] of [
      [-22.5, -4.5],
      [22.5, -4.5],
      [-18.5, -13.5],
      [18.5, -13.5],
    ] as const) {
      shape(c, circle(x, y, 3), MAT.woodCut, { line: 1.8, shadeOffset: null });
      detail(c, circle(x, y, 1.2), MAT.woodCut.shade, 1);
    }
    // Takım derisi örtü + amblem.
    shape(c, soft([-9, -21, 13, -21, 15, -4, 2, 1, -11, -4], 2), team.cloth, { shadeOffset: [2, 2] });
    stroke(c, line([-10, -6, -4, -3, 2, -1, 8, -3, 14, -6]), 2.2, team.trim.base);
    emblem(c, side, 2, -12, 5.6, 2.2);
    lashing(c, -17, -26, 6, 6, MAT.rope, 2);
  };
}

function chuteGun(c: Ctx): void {
  const trough = soft([-4, -6, 46, -6, 47, 3, 41, 6, -2, 6, -6, 2], 2);
  shape(c, trough, MAT.wood, { shadeOffset: [0, -3] });
  detail(c, line([0, -2, 43, -2]), MAT.wood.shade, 2);
  shape(c, rr(42, -9, 5, 12, 2), MAT.woodCut, { line: 2.2 });
  lashing(c, 8, -6, 5, 12, MAT.rope, 2);
  lashing(c, 30, -6, 5, 12, MAT.rope, 2);
}

function boulder(c: Ctx): void {
  shape(c, soft([-9, 2, -7, -6, 0, -9, 7, -6, 9, 1, 5, 8, -4, 8], 4), MAT.stone, { shadeOffset: [2, 2] });
  detail(c, line([-3, -5, -1, -1, -4, 3]), MAT.stone.shade, 1.4);
  detail(c, line([3, 2, 6, 4]), MAT.stone.shade, 1.4);
}

// ---- 2 Antik: Ok Burcu (A) · Kızgın Kum Kazanı (B) ----

function bowTowerBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, soft([-11, 0, 11, 0, 9, -37, -9, -37], 2), MARBLE, { shadeOffset: [3, 0] });
    for (const fx of [-5, 0, 5]) detail(c, line([fx * 1.1, -4, fx * 0.9, -34]), MARBLE.shade, 1.1);
    shape(c, rr(-13, -6, 26, 6, 2), K2.metal, { line: 2.4, shadeOffset: [1.5, 1.5] });
    shape(c, rr(-10, -31, 20, 13, 2), team.cloth, { shadeOffset: [2, 2] });
    stroke(c, line([-9, -19, 9, -19]), 2, team.trim.base);
    emblem(c, side, 0, -25, 4.8, 2);
    shape(c, rr(-1.6, -15, 3.2, 7, 1.6), INK, { line: 0 });
    // Bronz başlık + dişler.
    shape(c, rr(-14, -42, 28, 6, 2), K2.metal, { shadeOffset: [1.5, 1.5] });
    for (const x of [-14, -4, 6]) shape(c, rr(x, -47, 8, 6, 1.5), K2.metal, { line: 2.2 });
  };
}

function bowGun(c: Ctx): void {
  stick(c, [-9, 0, 9, 0], 3, K2.wood, 2);
  const limb: PathFn = (p) => {
    p.moveTo(4, -13);
    p.quadraticCurveTo(13, -8, 10, 0);
    p.quadraticCurveTo(13, 8, 4, 13);
  };
  stroke(c, limb, 7.4, INK);
  stroke(c, limb, 3.6, K2.wood.base);
  for (const y of [-13, 13]) shape(c, circle(4, y, 2.2), K2.metal, { line: 1.8 });
  shape(c, rr(8, -2.5, 5, 5, 1.5), K2.metal, { line: 1.8 });
  const str = line([4, -13, -5, 0, 4, 13]);
  stroke(c, str, 2.6, INK);
  stroke(c, str, 1, K2.fabric.base);
}

function arrowLoad(side: ArtSide) {
  return (c: Ctx): void => bolt(c, side, 24, K2.metal, K2.wood);
}

function sandBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Bronz üç ayak (arkada) + kor.
    stick(c, [-15, -26, -8, -36], 2.6, K2.metal, 2);
    stick(c, [15, -26, 9, -36], 2.6, K2.metal, 2);
    shape(c, soft([-8, -26, -4, -33, 0, -29, 4, -35, 8, -26], 2), MAT.flame, { line: 2 });
    shape(c, rr(-27, -7, 54, 7, 2), MARBLE, { shadeOffset: [1.5, 2] });
    shape(c, rr(-22, -27, 44, 21, 2), K2.trim, { shadeOffset: [2, 2] });
    // Menderes şeridi.
    const meander: number[] = [];
    for (let x = -20; x < 20; x += 8) meander.push(x, -9, x, -12.5, x + 4, -12.5, x + 4, -10.5);
    detail(c, line(meander), K2.trim.shade, 1.3);
    shape(c, rr(-9, -25, 20, 13, 2), team.cloth, { shadeOffset: [2, 2] });
    emblem(c, side, 1, -18.5, 4.9, 2);
  };
}

function cauldronGun(c: Ctx): void {
  const bowl: PathFn = (p) => {
    p.moveTo(-32, -2);
    p.arc(-16, -2, 16, Math.PI, 0, true);
    p.closePath();
  };
  shape(c, bowl, K2.metal, { shadeOffset: [3, 2] });
  detail(c, line([-28, 4, -4, 4]), K2.metal.shade, 1.4);
  shape(c, rr(-34, -5, 36, 5, 2), K2.metal, { line: 2.4 });
  for (const x of [-35, 3]) shape(c, circle(x, -1, 2.6), K2.metal, { line: 1.8 });
  // Taşıma halkası (ön dudak).
  stroke(c, line([0, -4, 3, -7]), 2.4, INK);
}

function sandLoad(c: Ctx): void {
  shape(c, soft([-14, 1, -9, -4, -3, -6, 4, -5, 10, -3, 14, 1], 3), SAND_GLOW, { line: 2.2 });
  for (const [x, y] of [
    [-6, -2],
    [2, -3],
    [8, -1],
  ] as const)
    shape(c, circle(x, y, 1), GLOW_CORE, { line: 0 });
}

// ---- 3 Orta: Arbalet Mazgalı (A) · Kaynar Yağ Oluğu (B) ----

function crossbowBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, soft([-14, 0, 14, 0, 12, -6, -12, -6], 1.5), STONE_GREY, { shadeOffset: [1.5, 1.5] });
    shape(c, rr(-12, -39, 24, 34, 2), STONE_GREY, { shadeOffset: [2.5, 2.5] });
    stoneBlocks(c, -12, -39, 24, 34);
    shape(c, rr(-15, -43, 30, 6, 2), STONE_GREY, { line: 2.4 });
    shape(c, rr(-15, -53, 10, 10, 1.5), STONE_GREY, { shadeOffset: [1.5, 1.5] });
    shape(c, rr(5, -53, 10, 10, 1.5), STONE_GREY, { shadeOffset: [1.5, 1.5] });
    // Takım kalkanı.
    const shield = soft([-8.5, -34, 8.5, -34, 8.5, -21, 0, -11, -8.5, -21], 2.5);
    shape(c, shield, team.cloth, { shadeOffset: [2, 2] });
    stroke(c, soft([-6, -31.5, 6, -31.5, 6, -21.5, 0, -14.5, -6, -21.5], 2), 1.8, team.trim.base);
    emblem(c, side, 0, -25, 4.6, 2);
  };
}

function crossbowGun(c: Ctx): void {
  stick(c, [-13, 1.5, 14, 0], 4, K3.wood, 2.2);
  const prod: PathFn = (p) => {
    p.moveTo(9, -12);
    p.quadraticCurveTo(16, 0, 9, 12);
  };
  stroke(c, prod, 7.2, INK);
  stroke(c, prod, 3.4, K3.metal.base);
  const str = line([9, -12, 1, 0, 9, 12]);
  stroke(c, str, 2.6, INK);
  stroke(c, str, 1, K3.fabric.base);
  shape(c, rr(-4, -1, 6, 6, 1.5), K3.band, { line: 1.8 });
  shape(c, rr(13, -3, 5, 6, 1.5), K3.metal, { line: 1.8 });
}

function crossbowLoad(side: ArtSide) {
  return (c: Ctx): void => bolt(c, side, 18, K3.metal, K3.wood);
}

function oilBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Oluk (öne-aşağı) + dikmesi.
    stick(c, [27, -15, 24, -2], 3, K3.wood, 2);
    shape(c, soft([8, -28, 39, -17, 39, -11, 8, -20], 1.5), K3.wood, { shadeOffset: [0, -2.5] });
    detail(c, line([10, -24, 38, -14]), K3.wood.shade, 1.4);
    shape(c, rr(-26, -25, 44, 25, 2), STONE_GREY, { shadeOffset: [2.5, 2.5] });
    stoneBlocks(c, -26, -25, 44, 25);
    // Ocak ağzı + kor.
    const mouth: PathFn = (p) => {
      p.moveTo(-1, 0);
      p.lineTo(-1, -9);
      p.arc(5, -9, 6, Math.PI, 0);
      p.lineTo(11, 0);
      p.closePath();
    };
    shape(c, mouth, { base: 0x3a1f14, shade: 0x2a150d }, { line: 2.2 });
    shape(c, soft([0, 0, 2, -6, 5, -3, 7, -8, 10, 0], 1.5), MAT.flame, { line: 1.6 });
    // Takım sancağı + amblem.
    shape(c, soft([-24, -23, -7, -23, -7, -7, -15.5, -2, -24, -7], 2), team.cloth, { shadeOffset: [2, 2] });
    stroke(c, line([-22, -9, -15.5, -5, -9, -9]), 1.8, team.trim.base);
    emblem(c, side, -15.5, -15, 5, 2);
  };
}

function potGun(c: Ctx): void {
  const pot: PathFn = (p) => {
    p.moveTo(-24, -16);
    p.lineTo(-24, -10);
    p.arc(-12, -10, 12, Math.PI, 0, true);
    p.lineTo(0, -16);
    p.closePath();
  };
  shape(c, pot, IRON, { shadeOffset: [2.5, 2] });
  detail(c, line([-21, -6, -3, -6]), IRON.shade, 1.3);
  shape(c, rr(-26, -19, 28, 4.5, 2), IRON, { line: 2.4 });
  const handle: PathFn = (p) => p.arc(-12, -19, 9, Math.PI * 1.1, Math.PI * 1.9);
  stroke(c, handle, 4, INK);
  stroke(c, handle, 1.8, K3.metal.base);
  shape(c, soft([0, -19, 5, -18, 3, -15, 0, -15], 1), IRON, { line: 1.8 });
}

function oilLoad(c: Ctx): void {
  shape(c, ellipse(0, 0, 11, 2.8), OIL, { line: 2, shadeOffset: [0, -1] });
  shape(c, circle(-4, -1.5, 1.8), OIL, { line: 1.4, shadeOffset: null });
  shape(c, circle(4, -2, 1.3), OIL, { line: 1.4, shadeOffset: null });
}

// ---- 4 Endüstri: Makineli Yuva (A) · Havan Mevzisi (B) ----

function mgBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    stick(c, [-12, 0, -9, -31], 3, K4.metal, 2.2);
    stick(c, [12, 0, 9, -31], 3, K4.metal, 2.2);
    for (const pts of [
      [-11, -3, 9, -27],
      [11, -3, -9, -27],
    ])
      stick(c, pts, 1.6, K4.metal, 1.6);
    shape(c, rr(-16, -35, 32, 5, 1.5), K4.metal, { line: 2.4 });
    for (let x = -13; x <= 13; x += 6.5) shape(c, circle(x, -32.5, 1), INK, { line: 0 });
    sandbag(c, -17, -43, 15, 8);
    sandbag(c, 1, -43, 16, 8);
    sandbag(c, -12, -50, 14, 7);
    // Kum torbasına örtülü takım bezi + amblem.
    shape(c, soft([-6, -43, 13, -43, 13, -28, 3.5, -24, -6, -28], 2), team.cloth, { shadeOffset: [2, 2] });
    stroke(c, line([-5, -30, 3.5, -26.5, 12, -30]), 1.8, team.trim.base);
    emblem(c, side, 3.5, -35, 4.8, 2);
  };
}

function mgGun(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Fişek şeridi (pirinç).
    const belt = line([-9, 3, -12, 7, -11, 11]);
    stroke(c, belt, 5, INK);
    stroke(c, belt, 3, K4.trim.base);
    shape(c, rr(-13, -5, 18, 9, 2), K4.metal, { shadeOffset: [1.5, 1.5] });
    shape(c, rr(-15, -2, 4, 8, 1.5), K4.metal, { line: 1.8 });
    shape(c, rr(4, -3.5, 18, 7, 2), K4.metal, { shadeOffset: [1, 1.5] });
    for (const x of [8, 12, 16]) shape(c, circle(x, 0, 1.1), INK, { line: 0 });
    stick(c, [22, 0, 30, 0], 2.2, K4.metal, 1.8);
    shape(c, rr(-12, -7.5, 12, 4, 1.5), team.cloth, { line: 1.8 });
    shape(c, rr(28, -2.5, 3, 5, 1), K4.metal, { line: 1.6 });
    // Takım renkli namlu kılıfı bileziği.
    shape(c, rr(17, -4.5, 5, 9, 1.5), team.trim, { line: 2 });
  };
}

function mortarBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, rr(-27, -5, 54, 5, 1.5), K4.metal, { line: 2.4 });
    for (let x = -23; x <= 23; x += 9) shape(c, circle(x, -2.5, 1), INK, { line: 0 });
    for (const x of [-28, -14, 0, 14]) sandbag(c, x, -14, 14, 9);
    for (const x of [-21, -7, 7]) sandbag(c, x, -22, 14, 8);
    // Takım branda + amblem.
    shape(c, soft([-27, -23, -7, -23, -6, -7, -16.5, -4, -28, -7], 2), team.cloth, { shadeOffset: [2, 2] });
    stroke(c, line([-27, -9, -16.5, -6, -7, -9]), 1.8, team.trim.base);
    emblem(c, side, -16.5, -15, 5.4, 2.2);
    // Cephane sandığı.
    shape(c, rr(15, -31, 12, 9, 1.5), K4.wood, { line: 2.2, shadeOffset: [1, 1] });
    detail(c, line([16, -26.5, 26, -26.5]), K4.wood.shade, 1.2);
  };
}

function mortarGun(c: Ctx): void {
  shape(c, circle(-5, 0, 7), K4.metal, { shadeOffset: [1.5, 1.5] });
  shape(c, rr(-5, -7.5, 30, 15, 3), K4.metal, { shadeOffset: [0, -3] });
  for (const x of [5, 15]) shape(c, rr(x, -8.5, 3.2, 17, 1), K4.trim, { line: 1.8 });
  shape(c, rr(24, -9, 5, 18, 2), K4.metal, { line: 2.4 });
  shape(c, rr(26.5, -6, 2, 12, 1), INK, { line: 0 });
}

// ---- 5 Gelecek: Darbe Lazeri (A) · Plazma Havanı (B) ----

function laserBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, soft([-14, 0, 14, 0, 11, -6, -11, -6], 2), HULL, { shadeOffset: [1.5, 1.5] });
    const pylon = soft([-8, -5, 8, -5, 5, -38, -5, -38], 2);
    shape(c, pylon, K5.limb, { shadeOffset: [2.5, 0] });
    hexPanels(c, pylon, -6, -10, 2, 4, K5.limb);
    stroke(c, line([0, -7, 0, -12]), 3, K5.band.shade);
    stroke(c, line([0, -28, 0, -36]), 3, K5.band.shade);
    stroke(c, line([0, -28, 0, -36]), 1.2, GLOW_CORE);
    shape(c, circle(0, -20, 7.5), team.cloth, { shadeOffset: [1.5, 1.5] });
    stroke(c, circle(0, -20, 9.6), 1.8, team.trim.base);
    emblem(c, side, 0, -20, 4.4, 2);
    // Kıskaç (yüzen başlığın tutucusu).
    shape(c, soft([-10, -37, -6, -43, -3, -43, -3, -38, 3, -38, 3, -43, 6, -43, 10, -37], 1.5), HULL, { line: 2.2 });
  };
}

function laserGun(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, soft([-10, -4, -17, -9, -15, 0, -17, 9, -10, 4], 1.5), team.trim, { line: 2, shadeOffset: [1, 1] });
    shape(c, rr(-11, -5.5, 20, 11, 5), K5.metal, { shadeOffset: [1.5, 1.5] });
    shape(c, rr(7, -2.3, 16, 4.6, 1.5), HULL, { line: 2.2 });
    stroke(c, line([-6, 0, 4, 0]), 2.6, K5.band.shade);
    stroke(c, line([-6, 0, 4, 0]), 1, GLOW_CORE);
    shape(c, circle(24, 0, 3.4), K5.band, { line: 2 });
    shape(c, circle(23.3, -0.8, 1.2), GLOW_CORE, { line: 0 });
  };
}

function plasmaBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, soft([-28, 0, 28, 0, 24, -7, -24, -7], 2), HULL, { shadeOffset: [1.5, 1.5] });
    const dome: PathFn = (p) => {
      p.arc(0, -6, 22, Math.PI, 0);
      p.closePath();
    };
    shape(c, dome, K5.limb, { shadeOffset: [3, 2] });
    hexPanels(c, dome, -20, -10, 5, 3, K5.limb);
    stroke(c, dome, 3, INK);
    shape(c, rr(-21, -6.5, 42, 3, 1.5), K5.band, { line: 1.6 });
    shape(c, circle(-9, -15, 7.5), team.cloth, { shadeOffset: [1.5, 1.5] });
    stroke(c, circle(-9, -15, 9.6), 1.8, team.trim.base);
    emblem(c, side, -9, -15, 4.5, 2);
  };
}

function plasmaGun(c: Ctx): void {
  shape(c, circle(-4, 0, 8), HULL, { shadeOffset: [1.5, 1.5] });
  shape(c, rr(-6, -8, 28, 16, 5), K5.metal, { shadeOffset: [0, -3] });
  for (const x of [3, 10]) shape(c, rr(x, -9.5, 3.5, 19, 1.5), K5.band, { line: 1.8 });
  shape(c, rr(19, -9.5, 6, 19, 2), HULL, { line: 2.4 });
}

function plasmaLoad(c: Ctx): void {
  glowDisk(c, 0, 0, 4.2, K5.glow);
}

// ---- Atış parlamaları (yerel (0,0) = çıkış noktası, ileri +x) ----

function dustBurst(c: Ctx): void {
  for (const [x, y, r] of [
    [2, 0, 6],
    [-4, 3, 4.5],
    [7, 4, 4],
  ] as const)
    shape(c, circle(x, y, r), DUST, { line: 0, shadeOffset: [1, -1.5] });
  shape(c, circle(9, -3, 1.6), MAT.stone, { line: 1.4 });
}

function splash(tone: Tone) {
  return (c: Ctx): void => {
    shape(c, soft([-4, -3, 6, -6, 12, -2, 8, 4, 0, 6, -5, 3], 2.5), tone, { line: 2, shadeOffset: [1, -1] });
    for (const [x, y, r] of [
      [14, -6, 1.8],
      [16, 2, 1.5],
      [4, -9, 1.4],
    ] as const)
      shape(c, circle(x, y, r), tone, { line: 1.4, shadeOffset: null });
  };
}

function cannonFlash(c: Ctx): void {
  for (const [x, y, r] of [
    [-2, -6, 5],
    [-2, 6, 5],
    [2, 0, 4.5],
  ] as const)
    shape(c, circle(x, y, r), { base: 0xe9e4dc, shade: 0xc4bdb2 }, { line: 0, shadeOffset: [1, -1.5] });
  burst(c, 11, K4.glow, 6, 1.6);
}

const FLASH: Record<ArtAge, Record<TowerKind, { draw: (c: Ctx) => void; r: number }>> = {
  1: { fast: { draw: (c) => burst(c, 7, MAT.spark, 5), r: 11 }, heavy: { draw: dustBurst, r: 12 } },
  2: { fast: { draw: (c) => burst(c, 7, { base: 0xffe3a3, shade: 0xd8a144 }, 4), r: 11 }, heavy: { draw: splash(SAND_GLOW), r: 18 } },
  3: { fast: { draw: (c) => burst(c, 7, { base: 0xf2f5fa, shade: 0xc3c9d3 }, 4), r: 11 }, heavy: { draw: splash(OIL), r: 18 } },
  4: { fast: { draw: (c) => burst(c, 8, K4.glow, 5), r: 13 }, heavy: { draw: cannonFlash, r: 19 } },
  5: { fast: { draw: (c) => glowDisk(c, 0, 0, 5, K5.glow), r: 10 }, heavy: { draw: (c) => glowDisk(c, 2, 0, 8, K5.glow), r: 16 } },
};

// ---- Yuva platformları ve kilit kapakları (üssün çağı) ----

/** Yuva platformu: çağın malzemesi + güverte önünde takım renkli şerit (boş yuvada da taraf okunur). */
function platformDraw(age: ArtAge, side: ArtSide) {
  return (c: Ctx): void => {
    platformShape(c, age);
    shape(c, rr(-19, 2.2, 38, 3, 1.2), TEAM[side].cloth, { line: 1.6, shadeOffset: null });
  };
}

function platformShape(c: Ctx, age: ArtAge): void {
  {
    switch (age) {
      case 1:
        stick(c, [-4, 6, -20, 30], 4, MAT.wood);
        shape(c, rr(-25, 0, 50, 7, 3.5), MAT.wood, { shadeOffset: [1.5, 1.5] });
        for (const x of [-21.5, 21.5]) shape(c, circle(x, 3.5, 2.6), MAT.woodCut, { line: 1.6, shadeOffset: null });
        lashing(c, -6, 1, 6, 8, MAT.rope, 2);
        break;
      case 2:
        shape(c, soft([-20, 8, 2, 8, -4, 14, -12, 26, -20, 28], 2), MARBLE, { shadeOffset: [1.5, 1.5] });
        shape(c, circle(-13, 22, 3.2), K2.metal, { line: 1.8 });
        shape(c, rr(-25, 6, 50, 3.5, 1), K2.trim, { line: 2 });
        shape(c, rr(-25, 0, 50, 6.5, 1.5), MARBLE, { shadeOffset: [1.5, 1.5] });
        break;
      case 3:
        for (const x of [-21, -7, 7]) {
          shape(c, rr(x, 7, 12, 7, 1.5), STONE_GREY, { line: 2.2, shadeOffset: [1, 1] });
          shape(c, rr(x + 2, 14, 8, 6, 1.5), STONE_GREY, { line: 2.2, shadeOffset: [1, 1] });
        }
        shape(c, rr(-25, 0, 50, 7, 1.5), STONE_GREY, { shadeOffset: [1.5, 1.5] });
        break;
      case 4:
        stick(c, [-2, 7, -20, 30], 3.4, K4.metal, 2.2);
        stick(c, [-12, 7, -20, 18], 2, K4.metal, 1.8);
        shape(c, rr(-25, 0, 50, 7, 1), K4.metal, { shadeOffset: [1.5, 1.5] });
        for (const x of [-22, 22]) shape(c, circle(x, 3.5, 1), INK, { line: 0 });
        break;
      case 5:
        stick(c, [-6, 7, -18, 28], 2.4, K5.metal, 2);
        stroke(c, line([-15, 9.5, 15, 9.5]), 4.4, INK);
        stroke(c, line([-15, 9.5, 15, 9.5]), 2.2, K5.band.base);
        shape(c, soft([-25, 3.5, -21, 0, 21, 0, 25, 3.5, 21, 7, -21, 7], 1.5), HULL, { shadeOffset: [1.5, 1.5] });
        for (const x of [-22, 22]) shape(c, circle(x, 3.5, 1.2), K5.band, { line: 0 });
        break;
    }
  }
}

const LOCK_TONES: Record<ArtAge, { lid: Tone; strap: Tone; spike: Tone }> = {
  1: { lid: { base: 0x7a5432, shade: 0x5a3b20 }, strap: MAT.rope, spike: MAT.bone },
  2: { lid: { base: 0x8f4c30, shade: 0x6a3420 }, strap: K2.metal, spike: K2.metal },
  3: { lid: { base: 0x6b4a30, shade: 0x4c321f }, strap: IRON, spike: K3.metal },
  4: { lid: { base: 0x4a4d55, shade: 0x33353b }, strap: K4.trim, spike: K4.metal },
  5: { lid: HULL, strap: K5.band, spike: K5.metal },
};

/** Kilitli yuva: güvertenin üstünde çivili, çapraz bağlı kapalı kapak. */
function lockDraw(age: ArtAge) {
  const t = LOCK_TONES[age];
  return (c: Ctx): void => {
    for (const x of [-11, 0, 11]) shape(c, soft([x - 3.5, -13, x, -22, x + 3.5, -13], 0.8), t.spike, { line: 2, shadeOffset: [0.8, 0.8] });
    const lid = soft([-21, 0, 21, 0, 19, -10, 13, -15, -13, -15, -19, -10], 3);
    shape(c, lid, t.lid, { shadeOffset: [2, 2] });
    for (const pts of [
      [-16, -2, 15, -13],
      [16, -2, -15, -13],
    ]) {
      stroke(c, line(pts), 5, INK);
      stroke(c, line(pts), 2.6, t.strap.base);
    }
    shape(c, circle(0, -7.5, 3.6), t.strap, { line: 2 });
    shape(c, rr(-0.8, -8, 1.6, 3, 0.6), INK, { line: 0 });
  };
}

function puffDraw(c: Ctx): void {
  const puff: PathFn = (p) => {
    p.arc(-9, 0, 7, 0, Math.PI * 2);
    p.moveTo(16, -1);
    p.arc(8, -1, 8, 0, Math.PI * 2);
    p.moveTo(7, -7);
    p.arc(0, -6, 8, 0, Math.PI * 2);
  };
  shape(c, puff, DUST, { line: 0, shadeOffset: [2, -3] });
}

// ---- Parça listesi ----

interface TowerDraw {
  body: (side: ArtSide) => (c: Ctx) => void;
  gun: (side: ArtSide) => (c: Ctx) => void;
  load: ((side: ArtSide) => (c: Ctx) => void) | null;
  /** Sınır kutuları: gövde, silah (silah yerel), yük (yük yerel). */
  bodyBox: readonly [number, number, number, number];
  gunBox: readonly [number, number, number, number];
  loadBox: readonly [number, number, number, number];
}

const same = (f: (c: Ctx) => void) => (): ((c: Ctx) => void) => f;

const DRAW: Record<ArtAge, Record<TowerKind, TowerDraw>> = {
  1: {
    fast: { body: slingBody, gun: same(slingGun), load: same(pebble), bodyBox: [-17, -46, 17, 2], gunBox: [-17, -22, 12, 2], loadBox: [-4, -4, 4, 4] },
    heavy: { body: chuteBody, gun: same(chuteGun), load: same(boulder), bodyBox: [-29, -34, 29, 3], gunBox: [-7, -10, 49, 7], loadBox: [-10, -10, 10, 9] },
  },
  2: {
    fast: { body: bowTowerBody, gun: same(bowGun), load: arrowLoad, bodyBox: [-15, -48, 15, 1], gunBox: [-11, -16, 15, 16], loadBox: [-2, -4, 30, 4] },
    heavy: { body: sandBody, gun: same(cauldronGun), load: same(sandLoad), bodyBox: [-28, -37, 28, 1], gunBox: [-38, -8, 6, 15], loadBox: [-15, -7, 15, 3] },
  },
  3: {
    fast: { body: crossbowBody, gun: same(crossbowGun), load: crossbowLoad, bodyBox: [-16, -54, 16, 1], gunBox: [-15, -13, 19, 13], loadBox: [-2, -4, 24, 4] },
    heavy: { body: oilBody, gun: same(potGun), load: same(oilLoad), bodyBox: [-27, -29, 40, 1], gunBox: [-27, -29, 6, 3], loadBox: [-12, -5, 12, 3.5] },
  },
  4: {
    fast: { body: mgBody, gun: mgGun, load: null, bodyBox: [-18, -51, 18, 1], gunBox: [-16, -14, 32, 16], loadBox: [0, 0, 1, 1] },
    heavy: { body: mortarBody, gun: same(mortarGun), load: null, bodyBox: [-29, -32, 28, 1], gunBox: [-12, -10, 30, 10], loadBox: [0, 0, 1, 1] },
  },
  5: {
    fast: { body: laserBody, gun: laserGun, load: null, bodyBox: [-15, -44, 15, 1], gunBox: [-18, -10, 28, 10], loadBox: [0, 0, 1, 1] },
    heavy: { body: plasmaBody, gun: same(plasmaGun), load: same(plasmaLoad), bodyBox: [-29, -29, 29, 1], gunBox: [-12, -10, 26, 10], loadBox: [-8, -8, 8, 8] },
  },
};

export function hasLoad(age: ArtAge, kind: TowerKind): boolean {
  return DRAW[age][kind].load !== null;
}

/** Bir çağın kule ve yuva parçaları: platform, kilit, toz + her tür için gövde/silah/yük (iki taraf) ve parlama. */
export function towerParts(age: ArtAge): PartSpec[] {
  const parts: PartSpec[] = [
    { name: 'locked', x0: -22, y0: -23, x1: 22, y1: 1, draw: lockDraw(age) },
    { name: 'puff', x0: -17, y0: -15, x1: 17, y1: 8, draw: puffDraw },
  ];
  for (const side of [0, 1] as const) parts.push({ name: `platform.${side}`, x0: -26, y0: -1, x1: 26, y1: 32, draw: platformDraw(age, side) });
  for (const kind of ['fast', 'heavy'] as const) {
    const d = DRAW[age][kind];
    const f = FLASH[age][kind];
    parts.push({ name: `${kind}.flash`, x0: -f.r, y0: -f.r, x1: f.r * 1.6, y1: f.r, draw: f.draw });
    for (const side of [0, 1] as const) {
      const [bx0, by0, bx1, by1] = d.bodyBox;
      const [gx0, gy0, gx1, gy1] = d.gunBox;
      parts.push({ name: `${kind}.body.${side}`, x0: bx0, y0: by0, x1: bx1, y1: by1, draw: d.body(side) });
      parts.push({ name: `${kind}.gun.${side}`, x0: gx0, y0: gy0, x1: gx1, y1: gy1, draw: d.gun(side) });
      if (d.load !== null) {
        const [lx0, ly0, lx1, ly1] = d.loadBox;
        parts.push({ name: `${kind}.load.${side}`, x0: lx0, y0: ly0, x1: lx1, y1: ly1, draw: d.load(side) });
      }
    }
  }
  return parts;
}
