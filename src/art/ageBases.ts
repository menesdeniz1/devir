import type { PartSpec } from './atlas';
import type { LaterAge } from './ageParts';
import { circle, detail, emblem, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { AGE_KIT, GLOW_CORE, INK, TEAM, type ArtSide, type Tone } from './palette';
import { flameDraw, smokeDraw, type BaseFx } from './primitiveBase';

/**
 * Antik → Gelecek üsleri (GDD §14 çağ kimlikleri). Yerleşim İlkel Çağ ile aynıdır: (0,0) üs tabanının
 * arka-alt köşesi, x 0…160 ayak izi, sağa bakar; rakip aynalanır. Her üste takım rengi büyük bir yüzeyde
 * (friz, sancak, levha, enerji şeridi) ve büyük bir amblem vardır.
 * Çağa özgü siluet öğesi: Antik sütunlu giriş; Orta mazgallı kule ve sur; Endüstri baca ve perçinli levha;
 * Gelecek kubbe, anten ve enerji şeridi.
 */

const MARBLE: Tone = { base: 0xeee4cd, shade: 0xcbbd9c };
const STONE_GREY: Tone = { base: 0xaeaca6, shade: 0x86847f };
const BRICK: Tone = { base: 0xb4553a, shade: 0x87392a };
const WARM_LIGHT: Tone = { base: 0xffd77a, shade: 0xf0a646 };
const SOOT: Tone = { base: 0x9a948f, shade: 0x77716c };
const HULL: Tone = { base: 0x3d4870, shade: 0x2a3354 };

function ground(c: Ctx, tone: Tone): void {
  shape(c, soft([-10, 6, 172, 6, 166, -6, 120, -11, 40, -12, -4, -6], 6), tone, { line: 0, shadeOffset: [0, -4] });
}

function rivetRow(c: Ctx, x0: number, x1: number, y: number, step: number): void {
  for (let x = x0; x <= x1; x += step) shape(c, circle(x, y, 1.3), INK, { line: 0 });
}

// ---- Antik: tapınak cephesi ----

function drawAncient(side: ArtSide) {
  const K = AGE_KIT[2];
  return (c: Ctx): void => {
    const team = TEAM[side];
    ground(c, { base: 0xb59a72, shade: 0x8f7752 });
    // Basamaklar.
    shape(c, rr(4, -16, 132, 12, 2), MARBLE, { shadeOffset: [2, 3] });
    shape(c, rr(10, -26, 120, 11, 2), MARBLE, { shadeOffset: [2, 3] });
    // Karanlık iç mekân + takım renkli perde.
    shape(c, rr(18, -150, 104, 125, 2), { base: 0x5b3a2a, shade: 0x46291c }, { line: 2.5 });
    shape(c, soft([60, -146, 82, -146, 84, -26, 58, -26], 2), team.cloth, { shadeOffset: [3, 0] });
    detail(c, line([71, -140, 71, -30]), team.cloth.shade, 1.6);
    // Sütunlar (oluklu gövde, başlık, kaide).
    for (const x of [20, 44, 86, 110]) {
      shape(c, rr(x, -148, 12, 123, 3), MARBLE, { shadeOffset: [3, 0] });
      for (const fx of [3.5, 6, 8.5]) detail(c, line([x + fx, -142, x + fx, -32]), MARBLE.shade, 1.2);
      shape(c, rr(x - 3, -154, 18, 7, 2), MARBLE, { line: 2.5 });
      shape(c, rr(x - 2, -30, 16, 5, 1.5), MARBLE, { line: 2.2 });
    }
    // Arşitrav, takım renkli friz, korniş.
    shape(c, rr(12, -163, 116, 10, 2), MARBLE, { shadeOffset: [2, 2] });
    shape(c, rr(12, -176, 116, 13, 2), team.cloth, { shadeOffset: [2, 2] });
    for (let x = 18; x < 124; x += 14) shape(c, rr(x, -175, 5, 11, 1), team.trim, { line: 1.6 });
    shape(c, rr(6, -182, 128, 7, 2), MARBLE, { line: 2.5 });
    // Terakota alınlık + mermer timpan + büyük amblem.
    shape(c, soft([4, -182, 136, -182, 70, -218], 3), K.trim, { shadeOffset: [3, 3] });
    shape(c, soft([22, -186, 118, -186, 70, -211], 2), MARBLE, { shadeOffset: [2, 2] });
    emblem(c, side, 70, -196, 9.5, 3);
    shape(c, soft([66, -218, 70, -228, 74, -218], 1.5), K.trim, { line: 2.2 });
    // Sağda alçak duvar + bronz mangal + asılı bronz kalkan.
    shape(c, rr(128, -42, 42, 38, 2), MARBLE, { shadeOffset: [2, 3] });
    shape(c, rr(125, -48, 48, 7, 2), K.trim, { line: 2.5 });
    shape(c, circle(149, -22, 11), K.metal, { shadeOffset: [2, 2] });
    shape(c, circle(149, -22, 8), team.cloth, { line: 2, shadeOffset: [1.5, 1.5] });
    emblem(c, side, 149, -22, 4.2, 2);
    stick(c, [142, -48, 140, -60], 2.4, K.metal, 2);
    stick(c, [156, -48, 158, -60], 2.4, K.metal, 2);
    shape(c, soft([136, -66, 162, -66, 157, -57, 141, -57], 2.5), K.metal, { shadeOffset: [1.5, 2] });
  };
}

// ---- Orta: mazgallı kule ve sur ----

function blocks(c: Ctx, x: number, y: number, w: number, h: number, tone: Tone): void {
  for (let yy = y + 12, row = 0; yy < y + h - 2; yy += 12, row++) {
    detail(c, line([x + 2, yy, x + w - 2, yy]), tone.shade, 1.2);
    for (let xx = x + (row % 2 === 0 ? 10 : 18); xx < x + w - 4; xx += 18) detail(c, line([xx, yy - 12, xx, yy]), tone.shade, 1.2);
  }
}

function merlons(c: Ctx, x0: number, x1: number, top: number, tone: Tone): void {
  for (let x = x0; x + 9 <= x1; x += 15) shape(c, rr(x, top, 10, 14, 1.5), tone, { shadeOffset: [1.5, 1.5] });
}

function drawMedieval(side: ArtSide) {
  const K = AGE_KIT[3];
  return (c: Ctx): void => {
    const team = TEAM[side];
    ground(c, { base: 0x8f8a7e, shade: 0x6f6a60 });
    // Sur + kapı.
    shape(c, rr(78, -86, 70, 82, 2), STONE_GREY, { shadeOffset: [2, 3] });
    blocks(c, 78, -86, 70, 82, STONE_GREY);
    merlons(c, 79, 148, -98, STONE_GREY);
    const arch: PathFn = (p) => {
      p.moveTo(98, -6);
      p.lineTo(98, -40);
      p.arc(114, -40, 16, Math.PI, 0);
      p.lineTo(130, -6);
      p.closePath();
    };
    stroke(c, arch, 9, STONE_GREY.shade);
    shape(c, arch, K.wood, { shadeOffset: [2, 0] });
    for (const y of [-40, -22]) shape(c, rr(98, y, 32, 4, 1), K.band, { line: 1.8 });
    detail(c, line([114, -56, 114, -6]), K.wood.shade, 1.6);
    rivetRow(c, 102, 126, -38, 6);
    rivetRow(c, 102, 126, -20, 6);
    // Köşe kulesi: arduvaz laciverdi konik çatı.
    shape(c, rr(146, -124, 26, 120, 2), STONE_GREY, { shadeOffset: [2, 3] });
    blocks(c, 146, -124, 26, 120, STONE_GREY);
    shape(c, rr(156, -100, 4, 12, 2), INK, { line: 0 });
    shape(c, soft([142, -122, 176, -122, 159, -160], 2.5), K.trim, { shadeOffset: [3, 3] });
    stick(c, [159, -160, 159, -176], 2, K.wood, 1.8);
    shape(c, soft([159, -176, 174, -172, 159, -167], 1.2), team.trim, { line: 2 });
    // Ana kule: mazgallar, oklar için yarıklar, takım sancağı.
    shape(c, rr(20, -182, 62, 178, 2), STONE_GREY, { shadeOffset: [3, 3] });
    blocks(c, 20, -182, 62, 178, STONE_GREY);
    shape(c, rr(16, -190, 70, 10, 2), STONE_GREY, { line: 2.5 });
    merlons(c, 16, 86, -203, STONE_GREY);
    shape(c, rr(28, -160, 4, 16, 2), INK, { line: 0 });
    shape(c, rr(70, -160, 4, 16, 2), INK, { line: 0 });
    stick(c, [51, -203, 51, -230], 2.4, K.wood, 2);
    shape(c, soft([51, -230, 80, -224, 51, -216], 1.5), team.trim, { shadeOffset: [1.5, 1.5] });
    shape(c, soft([34, -180, 68, -180, 68, -92, 51, -78, 34, -92], 2), team.cloth, { shadeOffset: [3, 3] });
    stroke(c, line([37, -176, 37, -93]), 2.2, team.trim.base);
    stroke(c, line([65, -176, 65, -93]), 2.2, team.trim.base);
    stick(c, [30, -180, 72, -180], 3, K.wood, 2);
    emblem(c, side, 51, -130, 11, 3);
    // Kapı üstünde demir mangal.
    shape(c, soft([104, -100, 124, -100, 120, -92, 108, -92], 2), K.band, { line: 2.4 });
    stick(c, [114, -92, 114, -86], 3, K.band, 2);
  };
}

// ---- Endüstri: tuğla fabrika, baca, perçinli levha ----

function brickRows(c: Ctx, x: number, y: number, w: number, h: number): void {
  for (let yy = y + 8, row = 0; yy < y + h - 2; yy += 8, row++) {
    detail(c, line([x + 2, yy, x + w - 2, yy]), BRICK.shade, 1);
    for (let xx = x + (row % 2 === 0 ? 6 : 12); xx < x + w - 3; xx += 12) detail(c, line([xx, yy - 8, xx, yy]), BRICK.shade, 1);
  }
}

function drawIndustrial(side: ArtSide) {
  const K = AGE_KIT[4];
  return (c: Ctx): void => {
    const team = TEAM[side];
    ground(c, { base: 0x6b6460, shade: 0x544d49 });
    // Baca (arkada).
    shape(c, rr(92, -224, 20, 110, 2), BRICK, { shadeOffset: [2.5, 0] });
    brickRows(c, 92, -224, 20, 110);
    for (const y of [-200, -160]) shape(c, rr(90, y, 24, 4, 1), K.metal, { line: 2 });
    shape(c, rr(88, -231, 28, 8, 2), K.metal, { line: 2.5 });
    // Fabrika binası + testere dişi çatı.
    shape(c, rr(8, -118, 100, 114, 2), BRICK, { shadeOffset: [3, 3] });
    brickRows(c, 8, -118, 100, 114);
    shape(c, soft([4, -116, 4, -128, 34, -150, 34, -128, 64, -150, 64, -128, 94, -150, 94, -128, 112, -128, 112, -116], 1.5), K.metal, { shadeOffset: [2, 2] });
    for (const x of [34, 64, 94]) detail(c, line([x - 3, -145, x - 3, -130]), 0xbfe3f0, 2);
    // Aydınlık kemerli pencereler.
    for (const x of [16, 44, 72]) {
      const win: PathFn = (p) => {
        p.moveTo(x, -72);
        p.lineTo(x, -96);
        p.arc(x + 9, -96, 9, Math.PI, 0);
        p.lineTo(x + 18, -72);
        p.closePath();
      };
      shape(c, win, WARM_LIGHT, { shadeOffset: [0, -3], line: 2.5 });
      detail(c, line([x + 9, -104, x + 9, -72]), INK, 1.6);
      detail(c, line([x, -86, x + 18, -86]), INK, 1.6);
    }
    // Takım renkli tabela + amblem.
    shape(c, rr(14, -64, 56, 24, 2), K.trim, { line: 2.5 });
    shape(c, rr(17, -61, 50, 18, 1.5), team.cloth, { shadeOffset: [2, 2] });
    emblem(c, side, 42, -52, 7.5, 2.5);
    rivetRow(c, 18, 66, -62.5, 8);
    // Ocak ağzı (alev içinde).
    const mouth: PathFn = (p) => {
      p.moveTo(74, -6);
      p.lineTo(74, -24);
      p.arc(86, -24, 12, Math.PI, 0);
      p.lineTo(98, -6);
      p.closePath();
    };
    shape(c, mouth, { base: 0x3a1f14, shade: 0x2a150d }, { line: 2.5 });
    stroke(c, mouth, 2, K.trim.base);
    // Sağda perçinli dökme demir levha duvar, pirinç boru, dişli.
    shape(c, rr(112, -74, 58, 70, 2), K.metal, { shadeOffset: [2.5, 3] });
    for (const y of [-52, -30]) detail(c, line([114, y, 168, y]), K.metal.shade, 1.6);
    for (const y of [-68, -46, -24, -10]) rivetRow(c, 117, 165, y, 8);
    shape(c, rr(120, -64, 42, 14, 2), team.trim, { line: 2 });
    stroke(c, line([104, -92, 140, -92, 140, -74]), 8, INK);
    stroke(c, line([104, -92, 140, -92, 140, -74]), 4.4, K.trim.base);
    const teeth: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 13 : 10;
      teeth.push(156 + Math.cos(a) * r, -92 + Math.sin(a) * r);
    }
    shape(c, soft(teeth, 1), K.metal, { shadeOffset: [1.5, 1.5] });
    shape(c, circle(156, -92, 4), K.trim, { line: 2 });
  };
}

// ---- Gelecek: kubbe, anten, enerji şeridi ----

function drawFuture(side: ArtSide) {
  const K = AGE_KIT[5];
  return (c: Ctx): void => {
    const team = TEAM[side];
    ground(c, { base: 0x3a4466, shade: 0x262d47 });
    // Anten direği (arkada).
    stick(c, [70, -110, 70, -204], 4, K.metal);
    stick(c, [58, -160, 82, -160], 2.4, K.metal, 2);
    stick(c, [62, -182, 78, -182], 2.4, K.metal, 2);
    shape(c, soft([56, -142, 84, -142, 76, -132, 64, -132], 2), K.metal, { line: 2.2 });
    // Sağda enerji direği + yarı saydam kalkan duvarı.
    shape(c, soft([140, -6, 164, -6, 158, -122, 146, -122], 2), HULL, { shadeOffset: [2, 0] });
    stroke(c, line([152, -12, 152, -116]), 4, K.band.shade);
    stroke(c, line([152, -12, 152, -116]), 1.6, GLOW_CORE);
    shape(c, circle(152, -126, 7), K.glow, { line: 2.2 });
    c.save();
    c.globalAlpha = 0.35;
    shape(c, rr(118, -52, 54, 46, 6), team.trim.base, { line: 0, shadeOffset: null });
    c.restore();
    stroke(c, rr(118, -52, 54, 46, 6), 2, team.trim.base);
    for (const x of [130, 142, 166]) detail(c, line([x, -50, x, -8]), team.trim.shade, 1);
    // Altıgen panelli taban bloğu.
    shape(c, soft([8, -4, 132, -4, 138, -50, 2, -50], 3), K.limb, { shadeOffset: [3, 3] });
    for (const x of [26, 50, 90, 114]) detail(c, line([x, -48, x - 4, -40, x, -6]), K.metal.shade, 1.4);
    // Kubbe: altıgen desen.
    const dome: PathFn = (p) => {
      p.arc(70, -50, 60, Math.PI, 0);
      p.closePath();
    };
    shape(c, dome, HULL, { shadeOffset: [4, 3] });
    c.save();
    c.beginPath();
    dome(c);
    c.clip();
    for (let row = 0; row < 5; row++) {
      for (let col = -1; col < 9; col++) {
        const hx = 14 + col * 16 + (row % 2) * 8;
        const hy = -58 - row * 13;
        const hex: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          hex.push(hx + Math.cos(a) * 8, hy + Math.sin(a) * 7.5);
        }
        detail(c, soft(hex, 1), HULL.shade, 1.2);
      }
    }
    c.restore();
    stroke(c, dome, 3, INK);
    // Takım renkli amblem halkası.
    shape(c, circle(70, -80, 19), team.cloth, { shadeOffset: [2.5, 2.5] });
    stroke(c, circle(70, -80, 22), 2, team.trim.base);
    emblem(c, side, 70, -80, 11, 3);
    // Enerji şeridi: takım vurgusu + eflatun kenar ışıkları.
    shape(c, rr(4, -42, 134, 8, 3), team.trim, { line: 2.2 });
    stroke(c, line([10, -38, 132, -38]), 1.4, GLOW_CORE);
    for (const x of [16, 40, 100, 124]) shape(c, rr(x, -22, 10, 5, 2), K.band, { line: 1.8 });
    shape(c, rr(56, -30, 28, 26, 4), INK, { line: 2.4 });
    shape(c, rr(60, -27, 20, 20, 3), K.band, { line: 0, shadeOffset: [0, -3] });
  };
}

function beaconDraw(c: Ctx): void {
  const K = AGE_KIT[5];
  c.save();
  c.globalAlpha = 0.35;
  shape(c, circle(0, -6, 11), K.glow.shade, { line: 0, shadeOffset: null });
  c.restore();
  shape(c, circle(0, -6, 5.5), K.glow, { line: 2.2 });
  shape(c, circle(-1.2, -7.2, 2), GLOW_CORE, { line: 0 });
}

function sootDraw(c: Ctx): void {
  const puff: PathFn = (p) => {
    p.arc(-5, 1, 8, 0, Math.PI * 2);
    p.moveTo(14, 0);
    p.arc(5, -1, 9, 0, Math.PI * 2);
    p.moveTo(9, -8);
    p.arc(0, -7, 8, 0, Math.PI * 2);
  };
  shape(c, puff, SOOT, { line: 0, shadeOffset: [2, -3] });
}

function moteDraw(c: Ctx): void {
  const K = AGE_KIT[5];
  const hex: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    hex.push(Math.cos(a) * 5, Math.sin(a) * 5);
  }
  stroke(c, soft(hex, 1), 2.4, K.glow.shade);
  stroke(c, soft(hex, 1), 1, GLOW_CORE);
}

const DRAW: Record<LaterAge, (side: ArtSide) => (c: Ctx) => void> = {
  2: drawAncient,
  3: drawMedieval,
  4: drawIndustrial,
  5: drawFuture,
};

export const AGE_BASE_FX: Record<LaterAge, BaseFx> = {
  2: { flame: { x: 149, y: -64 }, flicker: 'flame', smoke: { x: 147, y: -84 }, rise: 150, drift: -24, puffScale: 0.9 },
  3: { flame: { x: 114, y: -98 }, flicker: 'flame', smoke: { x: 112, y: -118 }, rise: 120, drift: -22, puffScale: 0.85 },
  4: { flame: { x: 86, y: -6 }, flicker: 'flame', smoke: { x: 102, y: -236 }, rise: 190, drift: -40, puffScale: 1.25 },
  5: { flame: { x: 70, y: -202 }, flicker: 'pulse', smoke: { x: 152, y: -130 }, rise: 110, drift: 0, puffScale: 0.9 },
};

/** Bir çağın üs parçaları (iki taraf + vuruş siluetleri + alev/ışık + duman/zerre). */
export function ageBaseParts(age: LaterAge): PartSpec[] {
  const parts: PartSpec[] =
    age === 5
      ? [
          { name: 'flame', x0: -12, y0: -18, x1: 12, y1: 6, draw: beaconDraw },
          { name: 'smoke', x0: -7, y0: -7, x1: 7, y1: 7, draw: moteDraw },
        ]
      : [
          { name: 'flame', x0: -8, y0: -23, x1: 8, y1: 1, draw: flameDraw },
          { name: 'smoke', x0: -14, y0: -16, x1: 15, y1: 10, draw: age === 4 ? sootDraw : smokeDraw },
        ];
  for (const side of [0, 1] as const) {
    const draw = DRAW[age](side);
    parts.push({ name: `base.${side}`, x0: -12, y0: -232, x1: 180, y1: 7, draw });
    parts.push({ name: `base.flash.${side}`, x0: -12, y0: -232, x1: 180, y1: 7, draw, silhouette: true });
  }
  return parts;
}
