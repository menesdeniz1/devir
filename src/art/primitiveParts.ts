import type { PartSpec } from './atlas';
import { circle, detail, ellipse, emblem, eye, lashing, line, rr, shape, soft, stick, stroke, type Ctx } from './paint';
import { GROUND_SHADOW, INK, MAT, TEAM, type ArtSide } from './palette';

/**
 * İlkel Çağ parça tanımları: Taşbaltacı (ön hat), Mızrak Savuran (menzilli), Kaya Kaldıracı (ağır).
 * Her parça sağa bakar, (0,0) eklem noktasıdır. Takım renkli parçalar taraf başına ayrı pişirilir
 * (ad sonu `.0` / `.1`); malzeme parçaları paylaşılır.
 */

// ---- Eklem yerleri (iskelet bunları kullanır; parça çizimleriyle birlikte tutulur) ----
export const FRONT_JOINTS = {
  hipY: -15.5,
  legX: 5,
  shoulder: { x: -7, y: -21 },
  neck: { x: 2, y: -25 },
  shield: { x: 15, y: -9 },
  /** Balta başının kol yerelindeki merkezi (kıvılcım). */
  axeTip: { x: -6, y: 35 },
} as const;

export const RANGED_JOINTS = {
  hipY: -17.5,
  legX: 4,
  lean: 0.2,
  backShoulder: { x: -3, y: -20 },
  frontShoulder: { x: 4, y: -19 },
  neck: { x: 1.5, y: -22.5 },
  /** Elin kol yerelindeki yeri (mızrak burada tutulur). */
  hand: { x: 0, y: 21 },
} as const;

export const HEAVY_JOINTS = {
  cartX: 8,
  wheelBack: { x: -22, y: -12.5 },
  wheelFront: { x: 20, y: -12.5 },
  wheelR: 12.5,
  pivot: { x: 4, y: -60 },
  /** Kova/kaya: kiriş yerelinde. */
  rock: { x: -48, y: -6 },
  pusherX: -60,
  pusherHipY: -17,
  pusherLegScale: 0.85,
} as const;

// ---- Ortak ----

function shadowDraw(c: Ctx): void {
  c.save();
  c.globalAlpha = GROUND_SHADOW.alpha;
  shape(c, ellipse(0, 0, 20, 5), GROUND_SHADOW.color, { line: 0, shadeOffset: null });
  c.restore();
}

function sparkDraw(c: Ctx): void {
  const pts: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 12 : 4.6;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape(c, soft(pts, 1.2), MAT.spark, { line: 2.2, shadeOffset: [1.5, 1.5] });
  shape(c, circle(0, 0, 3.2), 0xffffff, { line: 0 });
}

// ---- Taşbaltacı ----

function frontLeg(c: Ctx): void {
  shape(c, rr(-4.5, -2, 9, 13, 4.5), MAT.skin, { shadeOffset: [2, 1] });
  shape(c, soft([-5.5, 2.5, 5.5, 2.5, 5.5, 8, -5.5, 8.5], 2.5), MAT.fur, { shadeOffset: [1.5, 1.5] });
  shape(c, ellipse(2.5, 12.6, 6.6, 3.1), MAT.hide, { shadeOffset: [1.5, 1.5] });
}

function frontTorso(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, soft([-14, 2, 14, 2, 15.5, -15, 11, -27, -11, -27, -15.5, -15], 7), team.cloth, { shadeOffset: [3.5, 4] });
    // Kürk etek (tırtıklı).
    shape(
      c,
      soft([-15.5, -6, 15.5, -6, 15.5, 1, 11.5, 5.5, 7.5, 1.5, 3.5, 5.5, -0.5, 1.5, -4.5, 5.5, -8.5, 1.5, -12.5, 5.5, -16.5, 1], 1.6),
      MAT.fur,
      { shadeOffset: [1.5, 2] },
    );
    // Omuz kayışı.
    shape(c, soft([-12, -24, -6.5, -27.5, 14, -9, 8.5, -6], 2), MAT.hide, { shadeOffset: [1.5, 1.5] });
    shape(c, circle(3.2, -16.2, 2.4), MAT.bone, { line: 2 });
  };
}

function frontHead(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Arka saç topağı.
    shape(c, soft([-11, -11, -8, -23, 1, -25, 9, -21, 3, -15, -6, -4], 4), MAT.hair, { shadeOffset: [1.5, 2] });
    shape(c, circle(2, -11, 11.5), MAT.skin, { shadeOffset: [3, 3] });
    shape(c, circle(-3.5, -10, 3.2), MAT.skin, { shadeOffset: [1, 1] });
    // Diken saç perçemi + saç bandı (takım vurgusu).
    shape(c, soft([-7, -17, -5, -27.5, -0.5, -21, 3, -28.5, 6.5, -20.5, 10.5, -25.5, 11.5, -17], 1.6), MAT.hair, { shadeOffset: [1, 1.5] });
    shape(c, soft([-10.5, -18.5, 13.4, -17.8, 13.6, -13.4, -10.2, -14.4], 2), team.trim, { shadeOffset: [1, 1.5] });
    // Kısa sakal.
    shape(c, soft([-2, -4.5, 9, -6.5, 13.5, -2.5, 7, 1.5, -0.5, -0.5], 3), MAT.hair, { shadeOffset: [1, 1.5] });
    // Kocaman burun (hafif mizah).
    shape(c, ellipse(13.2, -10.5, 4.9, 3.9), MAT.skin, { shadeOffset: [1.5, 1.5] });
    eye(c, 8, -10.2, 1.9);
    stroke(c, line([4.5, -13.6, 11.2, -12.4]), 2.6, INK);
    detail(c, line([7.5, -4.8, 10.5, -5.4]));
  };
}

function frontShield(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    shape(c, rr(-12, -18, 24, 36, 11), MAT.wood, { shadeOffset: [2.5, 3] });
    shape(c, rr(-8.5, -14.5, 17, 29, 8), team.cloth, { shadeOffset: [2.5, 3] });
    // Dikiş bağları.
    lashing(c, 0, -17.5, 7, 3, MAT.rope, 1);
    lashing(c, 0, 14.5, 7, 3, MAT.rope, 1);
    emblem(c, side, 0, 0, 6.6);
  };
}

function frontAxeArm(c: Ctx): void {
  stick(c, [0, 6, 0, 35], 4.6, MAT.wood);
  // Taş balta başı (ağız kol yerelinde -x yönünde: vuruş yönü).
  shape(c, soft([4.5, 29.5, -3, 30, -12.5, 23.5, -17, 35, -12.5, 46.5, -3, 40, 4.5, 40.5], 2.6), MAT.stone, { shadeOffset: [2.5, 2.5] });
  detail(c, line([-12, 27.5, -14.5, 35, -12, 42.5]), 0xe4e2dc, 1.8);
  detail(c, line([-7, 31, -9, 35, -7, 39]), MAT.stone.shade, 1.5);
  lashing(c, 0, 29, 9, 11, MAT.rope, 3);
  shape(c, rr(-4.5, -4, 9, 18, 4.5), MAT.skin, { shadeOffset: [2, 1.5] });
  shape(c, ellipse(0, -1.5, 6.5, 5), MAT.fur, { shadeOffset: [1.5, 1.5] });
  shape(c, circle(0, 13.5, 4.9), MAT.skin, { shadeOffset: [1.5, 1.5] });
}

// ---- Mızrak Savuran ----

function rangedLeg(c: Ctx): void {
  shape(c, rr(-3.4, -2, 6.8, 16, 3.4), MAT.skin, { shadeOffset: [1.6, 1] });
  shape(c, rr(-4.2, 7, 8.4, 4.6, 2.3), MAT.hide, { shadeOffset: [1, 1.2] });
  shape(c, ellipse(2.4, 15, 5.4, 2.7), MAT.hide, { shadeOffset: [1.2, 1.2] });
}

function rangedTorso(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Sırttaki mızrak demeti.
    const shafts: Array<[number, number, number, number]> = [
      [-7, -6, -17, -40],
      [-10, -4, -24, -35],
    ];
    for (const [x0, y0, x1, y1] of shafts) stick(c, [x0, y0, x1, y1], 2, MAT.wood, 1.6);
    for (const [, , x1, y1] of shafts) {
      const dx = x1 > -15 ? 1 : 0;
      shape(c, soft([x1 - 3.2 + dx, y1 + 2, x1 + dx * 0.5 - 1, y1 - 7, x1 + 3 + dx, y1 + 2.4], 1.2), MAT.stone, { shadeOffset: [1, 1] });
    }
    // Deri sadak.
    shape(c, soft([-15, -7, -8, -3, -2.5, -22, -9.5, -26], 3), MAT.hide, { shadeOffset: [1.5, 2] });
    lashing(c, -8.6, -17, 9, 6, MAT.rope, 1);
    // İnce gövde (takım rengi tunik).
    shape(c, soft([-8, 2, 8, 2, 9, -12, 7, -22.5, -7, -22.5, -9, -12], 6), team.cloth, { shadeOffset: [2.5, 3] });
    shape(c, rr(-9.2, -4, 18.4, 4, 2), MAT.hide, { shadeOffset: [1, 1] });
    shape(c, soft([-7, -22.5, -2, -22.5, -5.5, -15, -9, -16.5], 1.5), MAT.hide, { shadeOffset: [1, 1] });
    emblem(c, side, 1.5, -13, 4.7, 2.2);
  };
}

function rangedHead(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Tüy (takım vurgusu) + topuz.
    shape(c, soft([-6, -16, -15, -31, -11, -33, -2.5, -18.5], 3), team.trim, { shadeOffset: [1.5, 1.5] });
    detail(c, line([-5, -18, -12.5, -31]), team.trim.shade, 1.4);
    shape(c, circle(-6, -16, 4.2), MAT.hair, { shadeOffset: [1, 1.2] });
    shape(c, circle(2, -8.5, 9.6), MAT.skin, { shadeOffset: [2.5, 2.5] });
    shape(c, soft([-7.5, -5, -7, -14, -1, -18.4, 6.5, -17.2, 1.5, -14, -2.5, -6], 3), MAT.hair, { shadeOffset: [1, 1.5] });
    // Göz bandı boyası (takım vurgusu) + sivri burun.
    shape(c, rr(3, -12.2, 8.6, 3.4, 1.7), team.trim, { line: 2 });
    shape(c, soft([10, -10.5, 15.5, -5, 10, -4], 1.4), MAT.skin, { shadeOffset: [1, 1] });
    eye(c, 7.8, -10.2, 1.7);
    stroke(c, line([4.2, -14.2, 10.4, -12.8]), 2.2, INK);
    detail(c, line([6.5, -2, 9.8, -2.6]));
  };
}

function rangedArmFront(c: Ctx): void {
  shape(c, rr(-3, -3, 6, 15.5, 3), MAT.skin, { shadeOffset: [1.5, 1] });
  shape(c, rr(-3.8, 6.5, 7.6, 3.4, 1.7), MAT.hide, { shadeOffset: [1, 1] });
  shape(c, circle(0, 13.8, 3.6), MAT.skin, { shadeOffset: [1, 1] });
}

function rangedArmThrow(c: Ctx): void {
  // Atlatl: elden geriye (kol yerelinde +x) uzanan atma sopası; dipteki kemik kanca mızrağın dibini iter.
  stick(c, [0, 21, 13, 21], 2.6, MAT.wood, 2);
  shape(c, soft([10.5, 22.5, 12, 16.5, 15.5, 16.5, 15, 23], 1.2), MAT.bone, { line: 2 });
  shape(c, rr(-3.2, -3, 6.4, 24, 3.2), MAT.skin, { shadeOffset: [1.5, 1] });
  shape(c, rr(-4, 9, 8, 3.4, 1.7), MAT.hide, { shadeOffset: [1, 1] });
  shape(c, circle(0, 21, 3.9), MAT.skin, { shadeOffset: [1, 1] });
}

/** Mızrak: eksen tutma noktasında (dip -13, uç +46). */
function spearDraw(c: Ctx): void {
  shape(c, soft([-13, -3.6, -6, -1.2, -6, 1.2, -13, 3.6], 1), MAT.bone, { line: 2 });
  stick(c, [-13, 0, 36, 0], 2.6, MAT.wood, 2.2);
  shape(c, soft([34, -4.2, 46.5, 0, 34, 4.2], 1.3), MAT.stone, { shadeOffset: [1, 1.2] });
  lashing(c, 33.5, -2.4, 2.5, 4.8, MAT.rope, 1);
}

// ---- Kaya Kaldıracı ----

function wheelDraw(c: Ctx): void {
  const r = HEAVY_JOINTS.wheelR;
  shape(c, circle(0, 0, r), MAT.wood, { shadeOffset: [2, 2.5] });
  shape(c, circle(0, 0, r - 3.2), MAT.woodCut, { shadeOffset: [1.5, 1.5], line: 2 });
  detail(c, circle(0, 0, r - 6.4), MAT.woodCut.shade, 1.4);
  detail(c, circle(0, 0, 2.8), MAT.woodCut.shade, 1.4);
  // Çatlak: dönüşü gösterir.
  detail(c, line([1.2, -1.5, 4.5, -5, 6, -8.5]), INK, 1.6);
  shape(c, circle(0, 0, 2.2), MAT.wood, { line: 1.8 });
}

function heavyChassis(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    const P = HEAVY_JOINTS.pivot;
    // İtme sapı.
    stick(c, [-33, -25, -51, -32], 4, MAT.wood);
    shape(c, circle(-51, -32, 3.2), MAT.hide, { line: 2 });
    // Çatallı direk ve payandalar.
    stick(c, [-13, -27, P.x - 1, P.y + 12], 4, MAT.wood);
    stick(c, [21, -27, P.x + 2, P.y + 12], 4, MAT.wood);
    stick(c, [P.x, -27, P.x, P.y + 2], 7.5, MAT.wood);
    stick(c, [P.x, P.y + 3, P.x - 6, P.y - 8], 5, MAT.wood);
    stick(c, [P.x, P.y + 3, P.x + 7, P.y - 8], 5, MAT.wood);
    // Ön deri siper (takım rengi + amblem) ve flama.
    stick(c, [15, -29, 15, -63], 3.4, MAT.wood);
    stick(c, [37, -29, 37, -78], 3.4, MAT.wood);
    shape(c, soft([16, -57, 36.5, -59, 38.5, -31, 14, -31], 5), team.cloth, { shadeOffset: [2.5, 3] });
    lashing(c, 15.5, -55, 6, 4, MAT.rope, 1);
    lashing(c, 37, -57, 6, 4, MAT.rope, 1);
    emblem(c, side, 26.5, -44, 7.6);
    shape(c, soft([37, -79, 53, -74, 37, -68.5], 2), team.trim, { shadeOffset: [1.5, 1.5] });
    // Kütük platform.
    shape(c, rr(-37, -32, 74, 12, 6), MAT.wood, { shadeOffset: [2, 3] });
    detail(c, line([-30, -26, 30, -26]), MAT.wood.shade, 1.6);
    shape(c, circle(-35, -26, 5.2), MAT.woodCut, { line: 2.2, shadeOffset: [1, 1] });
    shape(c, circle(35, -26, 5.2), MAT.woodCut, { line: 2.2, shadeOffset: [1, 1] });
    for (const x of [-18, 0, 18]) lashing(c, x, -32, 4.5, 12, MAT.rope, 2);
    // Dingil takozları.
    shape(c, rr(-27, -21, 10, 9, 2.5), MAT.wood, { shadeOffset: [1, 1.5] });
    shape(c, rr(15, -21, 10, 9, 2.5), MAT.wood, { shadeOffset: [1, 1.5] });
  };
}

function beamDraw(c: Ctx): void {
  stick(c, [-49, 0, 19, 0], 6.5, MAT.wood);
  // Deri kova (uzun kolda).
  shape(c, soft([-60, -2, -37, -2, -40.5, 7.5, -56.5, 7.5], 4), MAT.hide, { shadeOffset: [1.5, 2] });
  detail(c, line([-55, 1.5, -42, 1.5]), MAT.hide.shade, 1.6);
  // Karşı ağırlık taşı (kısa kolda).
  shape(c, soft([11, -10, 25, -11.5, 30, 0, 25, 10.5, 11, 9.5, 7.5, 0], 5), MAT.stone, { shadeOffset: [2.5, 3] });
  detail(c, line([18, -6, 21, 1, 18.5, 6]), MAT.stone.shade, 1.6);
  lashing(c, 14, -10, 4.5, 20, MAT.rope, 3);
  shape(c, circle(0, 0, 4.6), MAT.rope, { line: 2.2 });
  shape(c, circle(0, 0, 1.8), INK, { line: 0 });
}

function rockDraw(c: Ctx): void {
  shape(c, soft([-8, -3, -4, -8, 4, -8.5, 8.5, -2.5, 7, 6, -1, 8, -7.5, 5], 3.2), MAT.stone, { shadeOffset: [2, 2.5] });
  detail(c, line([-2, -4, 0.5, 0, -1.5, 3.5]), MAT.stone.shade, 1.5);
}

function pusherBody(side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    // Arka kol (gölgeli ton).
    stick(c, [3, -17, 14, -14], 4.2, MAT.skin);
    // Öne eğik gövde.
    shape(c, soft([-6, 2, 6, 2, 12, -15, 6.5, -22, -2.5, -20, -8.5, -6], 5), team.cloth, { shadeOffset: [2, 2.5] });
    shape(c, rr(-7.5, -3.5, 14, 3.6, 1.8), MAT.hide, { line: 2 });
    emblem(c, side, -1.2, -11, 3.6, 2);
    // Baş: deri başlık + saç bandı.
    shape(c, circle(12, -27, 8), MAT.skin, { shadeOffset: [2, 2] });
    shape(c, soft([4.5, -26, 6, -34, 13, -36, 19, -32, 12, -31, 7, -23], 3), MAT.hair, { shadeOffset: [1, 1] });
    shape(c, soft([5, -31.5, 19.6, -31.2, 19.8, -28.4, 5.2, -28.4], 1.4), team.trim, { line: 2 });
    shape(c, ellipse(20, -26, 3.2, 2.6), MAT.skin, { shadeOffset: [1, 1] });
    eye(c, 15.8, -26.6, 1.5);
    stroke(c, line([13.4, -29.2, 17.8, -28.6]), 2, INK);
    // Ön kol: sapı kavrar.
    stick(c, [7.5, -16, 16.5, -13], 4.2, MAT.skin);
    shape(c, circle(16.5, -13, 3.2), MAT.skin, { shadeOffset: [1, 1], line: 2.2 });
  };
}

/** Taraf başına parça listesi (paylaşılan malzeme parçaları yalnız bir kez). */
export function primitiveUnitParts(): PartSpec[] {
  const parts: PartSpec[] = [
    { name: 'shadow', x0: -20, y0: -5, x1: 20, y1: 5, draw: shadowDraw },
    { name: 'spark', x0: -12, y0: -12, x1: 12, y1: 12, draw: sparkDraw },
    { name: 'front.leg', x0: -7, y0: -4, x1: 10, y1: 16, draw: frontLeg },
    { name: 'front.axeArm', x0: -18, y0: -8, x1: 8, y1: 48, draw: frontAxeArm },
    { name: 'ranged.leg', x0: -5, y0: -4, x1: 8, y1: 18, draw: rangedLeg },
    { name: 'ranged.armFront', x0: -5, y0: -5, x1: 5, y1: 18, draw: rangedArmFront },
    { name: 'ranged.armThrow', x0: -6, y0: -5, x1: 17, y1: 26, draw: rangedArmThrow },
    { name: 'ranged.spear', x0: -14, y0: -5, x1: 47, y1: 5, draw: spearDraw },
    { name: 'heavy.wheel', x0: -14, y0: -14, x1: 14, y1: 14, draw: wheelDraw },
    { name: 'heavy.beam', x0: -61, y0: -13, x1: 31, y1: 12, draw: beamDraw },
    { name: 'heavy.rock', x0: -10, y0: -10, x1: 10, y1: 10, draw: rockDraw },
  ];
  for (const side of [0, 1] as const) {
    parts.push(
      { name: `front.torso.${side}`, x0: -17, y0: -29, x1: 17, y1: 7, draw: frontTorso(side) },
      { name: `front.head.${side}`, x0: -12, y0: -30, x1: 19, y1: 2, draw: frontHead(side) },
      { name: `front.shield.${side}`, x0: -13, y0: -19, x1: 13, y1: 19, draw: frontShield(side) },
      { name: `ranged.torso.${side}`, x0: -27, y0: -50, x1: 11, y1: 4, draw: rangedTorso(side) },
      { name: `ranged.head.${side}`, x0: -16, y0: -35, x1: 16, y1: 2, draw: rangedHead(side) },
      { name: `heavy.chassis.${side}`, x0: -56, y0: -80, x1: 54, y1: -11, draw: heavyChassis(side) },
      { name: `heavy.pusher.${side}`, x0: -10, y0: -37, x1: 24, y1: 4, draw: pusherBody(side) },
    );
  }
  return parts;
}
