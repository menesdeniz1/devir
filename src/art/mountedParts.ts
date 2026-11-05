import type { PartSpec } from './atlas';
import { circle, detail, ellipse, emblem, eye, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { AGE_KIT, INK, TEAM, type ArtSide, type Tone } from './palette';

/**
 * Atlı Okçu (Antik Çağ menzilli): at üstünde, kısa bileşik yaylı okçu. Parçalar sağa bakar, (0,0) eklem.
 * At: gövde (takım renkli eyer örtüsü + amblem), dört bacak (uzak ikisi gölgeli), kuyruk.
 * Binici: menzilli gövde/baş parçaları (`ranged.torso.*`, `ranged.head.*`) + oturan bacak, yay kolu, yay
 * (dinlenme / gerili), çekme kolu ve oka takılı ok. Rol silueti: ince binici, öne uzanan dikey yay.
 */

const K = AGE_KIT[2];
/** At tüyü (kestane) ve yele. */
const COAT: Tone = { base: 0xb0703f, shade: 0x7f4a27 };
const MANE: Tone = { base: 0x3b2a22, shade: 0x231812 };
const MUZZLE: Tone = { base: 0xd9a77a, shade: 0xb07d52 };
const HOOF: Tone = { base: 0x40342e, shade: 0x2a211d };

/** Eklem yerleri (at kök yereli; ayak tabanı y=0). */
export const MOUNT_JOINTS = {
  /** Gövde konteynerinin ölçeği: binici + at ≈ 76 px boy (ağırdan kısa, menzilliden uzun). */
  scale: 0.84,
  legTopY: -22,
  frontLegX: 18,
  backLegX: -19,
  /** Uzak bacakların yatay kayması. */
  farLegDx: -3,
  legLen: 22,
  tail: { x: -27, y: -33 },
  /** Binicinin kalçası (eyer). */
  seat: { x: -2, y: -39 },
  /** Binici gövdesi yerelinde omuzlar ve boyun (menzilli gövde ile aynı). */
  frontShoulder: { x: 4, y: -19 },
  backShoulder: { x: -3, y: -20 },
  neck: { x: 1.5, y: -22.5 },
  /** Yay kolunun kol yerelinde eli (yay burada tutulur). */
  hand: { x: 0, y: 15 },
  /** Çekme kolu parça boyları (omuz → dirsek → el). */
  upperLen: 9,
  foreLen: 9.5,
  /** Kirişin yay yerelindeki x'i: dinlenme / tam gerili. */
  stringRest: -3.5,
  stringDrawn: -15,
  /** Okun boyu (kiriş ucu → uç). */
  arrowLen: 28.5,
} as const;

// ---- At ----

function horseBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Boyun ve baş (binicinin önünde, yayın ilerisinde).
    shape(c, soft([15, -35, 23, -49, 30, -58, 37, -54, 31, -40, 27, -26], 4), COAT, { shadeOffset: [2, 2.5] });
    shape(c, soft([29, -57, 34, -62, 40, -58, 49, -48, 48, -42.5, 41, -41.5, 33, -47], 3), COAT, { shadeOffset: [1.5, 2] });
    shape(c, soft([41, -49, 49, -48, 48.5, -42.5, 41.5, -42], 2), MUZZLE, { shadeOffset: [1, 1] });
    shape(c, soft([30, -60, 30.5, -67, 34.5, -61], 1), COAT, { line: 2, shadeOffset: null });
    shape(c, ellipse(46.5, -44.5, 0.9, 0.7), INK, { line: 0 });
    eye(c, 37.5, -53.5, 1.5);
    // Yele.
    shape(c, soft([17, -37, 23, -50, 29.5, -61, 33, -58, 27, -48, 22, -35], 1.6), MANE, { shadeOffset: [1, 1] });
    // Gövde.
    shape(c, soft([-29, -32, -22, -39.5, 6, -40.5, 21, -38, 27, -31, 25, -22.5, 17, -18.5, -19, -18.5, -28, -23.5], 7), COAT, { shadeOffset: [2.5, 3.5] });
    detail(c, line([-19, -24, -8, -21, 12, -21]), COAT.shade, 1.4);
    // Bronz göğüs kayışı.
    stroke(c, line([21, -37, 26.5, -26]), 4.6, INK);
    stroke(c, line([21, -37, 26.5, -26]), 2.4, K.metal.base);
    shape(c, circle(24.5, -31, 2.4), K.metal, { line: 1.6, shadeOffset: null });
    // Takım renkli eyer örtüsü (tırtıklı alt kenar) + amblem.
    shape(c, soft([-20, -40, 8, -40, 9, -27, 5, -24, 1, -27, -3, -24, -7, -27, -11, -24, -15, -27, -19, -24, -21, -27], 1.6), team.cloth, { shadeOffset: [1.5, 2] });
    stroke(c, line([-20.5, -28, 8.5, -28]), 2, team.trim.base);
    emblem(c, side, -14, -33.5, 4.4, 2);
    // Eyer.
    shape(c, soft([-10, -40, -8, -43.5, 4, -43.5, 7, -40], 2), K.leather, { line: 2 });
  };
}

function horseLeg(c: Ctx): void {
  shape(c, soft([-4, -1, 4, -1, 3.2, 9, 2.4, 17, 3, 20, -2.6, 20, -2.4, 17, -3.2, 9], 2), COAT, { shadeOffset: [1.2, 1] });
  shape(c, rr(-3.2, 18.5, 6.8, 3.6, 1.2), HOOF, { line: 2, shadeOffset: null });
}

function horseTail(c: Ctx): void {
  shape(c, soft([0, -1, -7, 0, -12, 9, -10, 18, -6, 12, -3, 5], 2.5), MANE, { shadeOffset: [1, 1.5] });
  detail(c, line([-4, 2, -8, 10]), MANE.shade, 1.2);
}

// ---- Binici ----

function riderLeg(c: Ctx): void {
  // Uyluk öne-aşağı, baldır aşağı-geri; deri çizme.
  shape(c, soft([-3.5, -3, 4, -3, 9, 6, 5, 9, -1, 3], 2.5), K.limb, { shadeOffset: [1, 1.2] });
  shape(c, soft([4, 5, 9, 6, 7, 15, 3, 15], 2), K.limb, { shadeOffset: [1, 1] });
  shape(c, soft([2, 12, 8, 12, 10, 17.5, 1.5, 17.5], 1.8), K.boot, { shadeOffset: [0.8, 1] });
}

function bowArm(c: Ctx): void {
  shape(c, rr(-3, -3, 6, 16, 3), K.limb, { shadeOffset: [1.5, 1] });
  shape(c, rr(-3.8, 6.5, 7.6, 3.4, 1.7), K.band, { shadeOffset: [1, 1] });
  shape(c, circle(0, 15, 3.6), K.skin, { shadeOffset: [1, 1] });
}

/** Çekme kolu iki parçadır (üst kol + ön kol): el kirişi izler, dirsek geriye kırılır. Parçalar +y yönünde sarkar. */
function upperArm(c: Ctx): void {
  shape(c, rr(-3.2, -3, 6.4, 13, 3.2), K.limb, { shadeOffset: [1.5, 1] });
  shape(c, rr(-3.8, 1, 7.6, 3.2, 1.6), K.band, { line: 1.8 });
}

function forearm(c: Ctx): void {
  shape(c, rr(-2.8, -2.5, 5.6, 12, 2.8), K.limb, { shadeOffset: [1.2, 1] });
  shape(c, circle(0, 9.5, 3.4), K.skin, { shadeOffset: [1, 1] });
}

/** Bileşik yay: sap (0,0), uçlar yukarı-aşağı; kiriş düz (dinlenme) ya da geriye gerili. */
function bow(drawn: boolean) {
  return (c: Ctx): void => {
    const limb: PathFn = (p) => {
      p.moveTo(-3, -23);
      p.quadraticCurveTo(1, -21, 3, -15);
      p.quadraticCurveTo(5, -6, 1.5, 0);
      p.quadraticCurveTo(5, 6, 3, 15);
      p.quadraticCurveTo(1, 21, -3, 23);
    };
    const pull = drawn ? -15 : -3.5;
    const string = line([-3, -23, pull, 0, -3, 23]);
    stroke(c, string, 2.6, INK);
    stroke(c, string, 1.1, K.fabric.base);
    stroke(c, limb, 5.6, INK);
    stroke(c, limb, 3, K.wood.base);
    // Kemik/bronz uç ve sap sargısı.
    shape(c, rr(-1, -3.5, 4.4, 7, 1.4), K.leather, { line: 1.6 });
    shape(c, circle(-3, -23, 1.6), K.metal, { line: 1.4, shadeOffset: null });
    shape(c, circle(-3, 23, 1.6), K.metal, { line: 1.4, shadeOffset: null });
  };
}

/** Oka takılı ok: kiriş ucu (x=0) → uç (+x). */
function nockedArrow(c: Ctx): void {
  stick(c, [0, 0, 24, 0], 1.5, K.wood, 1.6);
  for (const s of [-1, 1]) shape(c, soft([1, 0, 6, s * 3.2, 8, s * 3.2, 4, 0], 0.6), K.fabric, { line: 1.4, shadeOffset: null });
  shape(c, soft([22, -2.8, 28.5, 0, 22, 2.8], 0.6), K.metal, { line: 1.6, shadeOffset: null });
}

/** Atlı Okçu binici gövdesi: sırtta ok sadağı (gorytos), takım tuniği, bronz kemer. `ranged.torso.*` adıyla. */
export function archerTorso(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Sadak: deri kutu, tüylü ok uçları dışarıda.
    for (const [x, y] of [
      [-13.5, -27],
      [-10.5, -28.5],
      [-7.5, -27.5],
    ] as const) {
      stick(c, [x + 2, y + 6, x, y], 1.3, K.wood, 1.3);
      shape(c, soft([x - 2, y + 1, x + 1.5, y + 1, x - 0.5, y - 4], 0.6), K.fabric, { line: 1.4, shadeOffset: null });
    }
    shape(c, soft([-16, -4, -9, -2, -5, -22, -12, -25], 2.6), K.trim, { shadeOffset: [1.5, 2] });
    detail(c, line([-13, -8, -8.5, -20]), K.metal.base, 1.6);
    shape(c, soft([-8, 2, 8, 2, 9, -12, 7, -22.5, -7, -22.5, -9, -12], 6), team.cloth, { shadeOffset: [2.5, 3] });
    shape(c, rr(-9.2, -4, 18.4, 4, 2), K.metal, { shadeOffset: [1, 1] });
    shape(c, soft([-7, -22.5, -2, -22.5, -5.5, -15, -9, -16.5], 1.5), K.fabric, { shadeOffset: [1, 1] });
    emblem(c, side, 1.5, -13, 4.7, 2.2);
  };
}

/** Atlı Okçunun atlasa eklenen parçaları (Antik Çağ atlası). */
export function mountedParts(): PartSpec[] {
  const parts: PartSpec[] = [
    { name: 'mount.leg', x0: -5, y0: -2, x1: 5, y1: 23, draw: horseLeg },
    { name: 'mount.tail', x0: -13, y0: -2, x1: 1, y1: 19, draw: horseTail },
    { name: 'mount.riderLeg', x0: -5, y0: -4, x1: 11, y1: 19, draw: riderLeg },
    { name: 'mount.bowArm', x0: -5, y0: -5, x1: 5, y1: 19, draw: bowArm },
    { name: 'mount.upperArm', x0: -4, y0: -4, x1: 4, y1: 11, draw: upperArm },
    { name: 'mount.forearm', x0: -4, y0: -3, x1: 4, y1: 13.5, draw: forearm },
    { name: 'mount.bow', x0: -6, y0: -25, x1: 7, y1: 25, draw: bow(false) },
    { name: 'mount.bowDrawn', x0: -17, y0: -25, x1: 7, y1: 25, draw: bow(true) },
    { name: 'mount.arrow', x0: -1, y0: -4, x1: 29, y1: 4, draw: nockedArrow },
  ];
  for (const side of [0, 1] as const) parts.push({ name: `mount.horse.${side}`, x0: -30, y0: -68, x1: 50, y1: -17, draw: horseBody(side) });
  return parts;
}
