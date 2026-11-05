import type { PartSpec } from './atlas';
import { circle, detail, ellipse, emblem, eye, lashing, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { AGE_KIT, GLOW_CORE, GROUND_SHADOW, INK, TEAM, WHITE_STRAP, type AgeKit, type ArtSide } from './palette';
import { HEAVY_JOINTS } from './primitiveParts';
import type { FrontStyle, HeavyStyle, RangedStyle } from './primitiveRigs';

/**
 * Antik → Gelecek çağlarının parça çizimleri (Aşama 3: çağ görünüm varyantları).
 * İlkel Çağ iskeletleri ve eklem yerleri aynen kullanılır; parça adları da aynıdır (`front.head.0` …),
 * böylece her çağ kendi atlasında aynı iskelete giydirilir. Çağ başına fark: malzeme paleti (AGE_KIT) +
 * rol başına belirgin parça değişimi (başlık, kalkan, silah; ağırda kiriş/namlu, gövde, tekerlek/ayak).
 * Takım rengi her çağda büyük bir yüzeyde (giysi/kalkan/siper) ve amblem her rolde görünür kalır.
 * 12 birliğin tam özgün tasarımı Aşama 9'dadır.
 */

export type LaterAge = 2 | 3 | 4 | 5;

// ---- Çağ başına iskelet ayarları (silah ucu, kip, namlu) ----

export const AGE_FRONT_STYLE: Record<LaterAge, FrontStyle> = {
  2: { tip: { x: 0, y: 58 } },
  3: { tip: { x: 0, y: 42 } },
  4: { tip: { x: 0, y: 55 } },
  5: { tip: { x: 0, y: 44 } },
};

export const AGE_RANGED_STYLE: Record<LaterAge, RangedStyle> = {
  2: { mode: 'throw', muzzle: { x: 46, y: 0 } },
  3: { mode: 'shoot', muzzle: { x: 33, y: -3.4 } },
  4: { mode: 'shoot', muzzle: { x: 47, y: -1.2 } },
  5: { mode: 'shoot', muzzle: { x: 53, y: -0.6 } },
};

export const AGE_HEAVY_STYLE: Record<LaterAge, HeavyStyle> = {
  2: { mode: 'aim', legs: 'wheels', ammo: { x: 2, y: -6 }, muzzle: { x: 34, y: -5 }, aimAngle: -0.3 },
  3: { mode: 'lever', legs: 'wheels', ammo: HEAVY_JOINTS.rock, muzzle: HEAVY_JOINTS.rock, aimAngle: 0 },
  4: { mode: 'aim', legs: 'wheels', ammo: null, muzzle: { x: 46, y: 0 }, aimAngle: -0.26 },
  5: { mode: 'aim', legs: 'walk', ammo: null, muzzle: { x: 50, y: 0 }, aimAngle: -0.2 },
};

// ---- Ortak ----

function shadowDraw(c: Ctx): void {
  c.save();
  c.globalAlpha = GROUND_SHADOW.alpha;
  shape(c, ellipse(0, 0, 20, 5), GROUND_SHADOW.color, { line: 0, shadeOffset: null });
  c.restore();
}

function sparkDraw(K: AgeKit) {
  return (c: Ctx): void => {
    const pts: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 12 : 4.6;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape(c, soft(pts, 1.2), K.glow, { line: 2.2, shadeOffset: [1.5, 1.5] });
    shape(c, circle(0, 0, 3.2), 0xffffff, { line: 0 });
  };
}

/** Yumuşak parlama halesi (enerji silahları): kontursuz, yarı saydam. */
function haze(c: Ctx, path: PathFn, color: number, alpha: number): void {
  c.save();
  c.globalAlpha = alpha;
  shape(c, path, color, { line: 0, shadeOffset: null });
  c.restore();
}

function rivets(c: Ctx, pts: readonly number[], r = 1.1): void {
  for (let i = 0; i < pts.length; i += 2) shape(c, circle(pts[i]!, pts[i + 1]!, r), INK, { line: 0 });
}

/** Büyük, kıvrık bıyık (Endüstri; hafif mizah). */
function moustache(c: Ctx, K: AgeKit, x: number, y: number, s: number): void {
  shape(
    c,
    soft([x - 6 * s, y, x - 2 * s, y - 2.4 * s, x + 4 * s, y - 2.6 * s, x + 8 * s, y - 1 * s, x + 10.5 * s, y - 3.4 * s, x + 10 * s, y + 1.2 * s, x + 4 * s, y + 1.8 * s, x - 2 * s, y + 2 * s], 1.4),
    K.hair,
    { shadeOffset: [0.8, 1] },
  );
}

// =====================================================================
// Ön hat
// =====================================================================

function frontLeg(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    shape(c, rr(-4.5, -2, 9, 13, 4.5), K.limb, { shadeOffset: [2, 1] });
    if (age === 2) {
      // Bronz dizlik + sandal kayışları.
      shape(c, soft([-5.2, 2, 5.2, 2, 5, 10, -5, 10], 2.5), K.band, { shadeOffset: [1.5, 1.5] });
      detail(c, line([-2.5, 4, 2.5, 4]), K.metalHi, 1.2);
    } else if (age === 3) {
      shape(c, rr(-5.2, 3, 10.4, 7.5, 2.5), K.band, { shadeOffset: [1.5, 1.5] });
      shape(c, circle(0.5, 2, 3.6), K.metal, { line: 2, shadeOffset: [1, 1] });
    } else if (age === 4) {
      // Tozluk sargısı.
      shape(c, rr(-5.2, 3.5, 10.4, 7.5, 2), K.band, { shadeOffset: [1.5, 1.5] });
      for (const y of [5.5, 8.2]) detail(c, line([-4.6, y - 1, 4.6, y + 1]), K.band.shade, 1.2);
    } else {
      shape(c, rr(-5.2, 2.5, 10.4, 7, 2.5), K.boot, { shadeOffset: [1.5, 1.5] });
      stroke(c, line([-4, 5.8, 4, 5.8]), 1.8, K.band.base);
    }
    shape(c, ellipse(2.5, 12.6, 6.6, 3.1), K.boot, { shadeOffset: [1.5, 1.5] });
    if (age === 2) detail(c, line([-1, 10.5, 4, 12]), K.boot.shade, 1.2);
  };
}

function frontArm(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    // Silah (kolun altında): ağız/uç kol yerelinde +y yönünde.
    if (age === 2) {
      // Bronz uçlu mızrak (yukarıdan saplama).
      stick(c, [0, -12, 0, 50], 3.4, K.wood);
      shape(c, soft([0, 46, 3.8, 51.5, 0, 63, -3.8, 51.5], 1.4), K.metal, { shadeOffset: [1, 1.2] });
      detail(c, line([0, 49, 0, 59]), K.metal.shade, 1.1);
      shape(c, soft([-2, -11, 2, -11, 0, -16.5], 1), K.metal, { line: 2 });
    } else if (age === 3) {
      // Çelik kılıç: kabza, balçak, ağız.
      shape(c, soft([-2.8, 18, 2.8, 18, 2.6, 40, 0, 46, -2.6, 40], 1.2), K.metal, { shadeOffset: [1, 1] });
      detail(c, line([0, 20, 0, 39]), K.metal.shade, 1.1);
      shape(c, rr(-7.5, 15.5, 15, 3.4, 1.6), K.band, { line: 2.2 });
      shape(c, circle(0, 7.5, 2.8), K.metal, { line: 2 });
    } else if (age === 4) {
      // Süngülü tüfek, dipçik geride.
      shape(c, soft([-3.6, -4, 3.2, -4, 3.8, 14, -2.6, 14], 1.6), K.wood, { shadeOffset: [1, 1.2] });
      shape(c, rr(-1.8, 13, 3.6, 31, 1.2), K.metal, { line: 2.2 });
      shape(c, rr(-2.8, 15, 5.6, 17, 2), K.wood, { shadeOffset: [1, 1] });
      shape(c, rr(-3, 22, 6, 2.4, 1), K.trim, { line: 1.6 });
      shape(c, soft([-1.4, 43, 1.4, 43, 0.4, 58, -0.4, 58], 0.6), { base: 0xdfe3ea, shade: 0xa9afba }, { line: 2 });
    } else {
      // Plazma çubuğu: sap + parlayan ağız.
      shape(c, rr(-2.6, 8, 5.2, 11, 2), K.trim, { line: 2.2 });
      haze(c, rr(-5.5, 18, 11, 31, 5.5), K.glow.shade, 0.35);
      shape(c, rr(-2.8, 19, 5.6, 26, 2.8), K.glow, { line: 2.2, shadeOffset: [1, 1] });
      stroke(c, line([0, 21, 0, 42]), 1.6, GLOW_CORE);
      shape(c, ellipse(0, 18.5, 6, 2.4), K.metal, { line: 2 });
    }
    // Kol ve omuzluk.
    shape(c, rr(-4.5, -4, 9, 18, 4.5), K.limb, { shadeOffset: [2, 1.5] });
    if (age === 2) {
      shape(c, rr(-5, 6, 10, 4, 2), K.band, { line: 2 });
      shape(c, ellipse(0, -1.5, 6.5, 5), K.metal, { shadeOffset: [1.5, 1.5] });
    } else if (age === 3) {
      shape(c, ellipse(0, -1, 7, 5.6), K.metal, { shadeOffset: [1.5, 1.5] });
      detail(c, line([-5, 1.5, 5, 1.5]), K.metal.shade, 1.2);
    } else if (age === 4) {
      shape(c, rr(-5, 8, 10, 3.6, 1.8), K.trim, { line: 2 });
      shape(c, ellipse(0, -2, 6.8, 4.2), K.trim, { shadeOffset: [1, 1.2] });
      for (const x of [-4, -1.3, 1.3, 4]) detail(c, line([x, 1.5, x, 4.5]), K.trim.shade, 1.3);
    } else {
      shape(c, ellipse(0, -1.5, 7, 5.4), K.metal, { shadeOffset: [1.5, 1.5] });
      stroke(c, line([-5, 7, 5, 7]), 1.8, K.band.base);
    }
    const hand = age === 3 ? K.metal : age === 5 ? K.boot : K.skin;
    shape(c, circle(0, 13.5, 4.9), hand, { shadeOffset: [1.5, 1.5] });
  };
}

const FRONT_OUTLINE = [-14, 2, 14, 2, 15.5, -15, 11, -27, -11, -27, -15.5, -15];

function frontTorso(age: LaterAge, K: AgeKit, side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    if (age === 2) {
      // Takım renkli tunik, bronz göğüslük, takım renkli kayış etek (pteruges).
      shape(c, soft(FRONT_OUTLINE, 7), team.cloth, { shadeOffset: [3.5, 4] });
      for (let i = 0; i < 7; i++) {
        const x = -15 + i * 4.3;
        shape(c, rr(x, -8, 3.9, 12.5, 1.6), i % 2 === 0 ? team.cloth : team.trim, { shadeOffset: [1, 1.5], line: 2 });
      }
      shape(c, soft([-13, -8, 13, -8, 14.5, -16, 10.5, -27, -10.5, -27, -14.5, -16], 5), K.metal, { shadeOffset: [2.5, 3] });
      detail(c, line([-7, -20, -1.5, -16.5, 3, -16.5, 8, -20]), K.metal.shade, 1.6);
      detail(c, line([1, -15, 1, -9.5]), K.metal.shade, 1.4);
      detail(c, line([-8, -24, -3, -25.5]), K.metalHi, 1.4);
      shape(c, rr(-14.5, -10, 29, 3.4, 1.7), K.leather, { line: 2 });
    } else if (age === 3) {
      // Örgü zırh üstünde takım renkli cübbe (tabar) + küçük amblem.
      shape(c, soft(FRONT_OUTLINE, 7), K.limb, { shadeOffset: [3.5, 4] });
      for (let y = -23; y < 2; y += 4) detail(c, line([-13, y, 13, y]), K.limb.shade, 1);
      shape(c, soft([-10.5, 4, 10.5, 4, 11.5, -14, 7.5, -27, -7.5, -27, -11.5, -14], 4), team.cloth, { shadeOffset: [2.5, 3] });
      shape(c, rr(-10.5, 0.5, 21, 3.4, 1.4), team.trim, { line: 2 });
      shape(c, rr(-13.5, -9.5, 27, 3.6, 1.8), K.leather, { line: 2 });
      shape(c, rr(-2, -10.3, 4.4, 5, 1), K.metal, { line: 1.8 });
      emblem(c, side, 0, -18.5, 4.4, 2);
    } else if (age === 4) {
      // Takım renkli uzun ceket, beyaz çapraz kayışlar, pirinç toka.
      shape(c, soft([-15.5, -8, -2, -8, -3, 6, -16, 4.5], 2), team.cloth, { shadeOffset: [1.5, 2] });
      shape(c, soft(FRONT_OUTLINE, 7), team.cloth, { shadeOffset: [3.5, 4] });
      shape(c, rr(-9, -28.5, 18, 4, 2), team.trim, { line: 2 });
      stick(c, [-11, -25, 11, -7], 2.8, WHITE_STRAP, 1.6);
      stick(c, [11, -25, -11, -7], 2.8, WHITE_STRAP, 1.6);
      shape(c, rr(-14.5, -9, 29, 3.8, 1.8), K.leather, { line: 2 });
      shape(c, rr(-2.6, -9.8, 5.2, 5.2, 1), K.trim, { line: 1.8 });
      rivets(c, [6, -2, 6, 1.5], 1);
    } else {
      // Alaşım zırh, takım renkli göğüs plakası, eflatun ek yeri parlaması.
      shape(c, soft(FRONT_OUTLINE, 7), K.limb, { shadeOffset: [3.5, 4] });
      shape(c, soft([-11.5, -5, 11.5, -5, 13, -15, 9, -26, -9, -26, -13, -15], 4), team.cloth, { shadeOffset: [2.5, 3] });
      shape(c, rr(-11, -3, 22, 5, 2), K.metal, { line: 2 });
      stroke(c, line([-10, -4.2, 10, -4.2]), 1.8, K.band.base);
      detail(c, line([-12.5, -15, -6, -11, 6, -11, 12.5, -15]), team.cloth.shade, 1.4);
      emblem(c, side, 0, -17, 4.6, 2);
    }
  };
}

/** Ön hat yüzü: deri daire, kulak, burun, göz (başlıklar üstüne çizilir). */
function frontFace(c: Ctx, K: AgeKit): void {
  shape(c, circle(2, -11, 11.5), K.skin, { shadeOffset: [3, 3] });
  shape(c, circle(-3.5, -10, 3.2), K.skin, { shadeOffset: [1, 1] });
}

function frontNoseEye(c: Ctx, K: AgeKit): void {
  shape(c, ellipse(13.2, -10.5, 4.9, 3.9), K.skin, { shadeOffset: [1.5, 1.5] });
  eye(c, 8, -10.2, 1.9);
  stroke(c, line([4.5, -13.6, 11.2, -12.4]), 2.6, INK);
}

function frontHead(age: LaterAge, K: AgeKit, side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    if (age === 2) {
      // Tepeli bronz miğfer; tepe takım vurgusu.
      frontFace(c, K);
      shape(c, soft([-2, -4.5, 9, -6.5, 13.5, -2.5, 7, 1.5, -0.5, -0.5], 3), K.hair, { shadeOffset: [1, 1.5] });
      shape(c, soft([-16, -13, -14, -26, -5, -36, 7, -36, 13.5, -29, 10, -25, 3, -29, -5, -28, -10, -19], 3), team.trim, { shadeOffset: [1.5, 2] });
      for (const x of [-9, -3, 3]) detail(c, line([x, -33 + Math.abs(x) * 0.3, x - 2, -26]), team.trim.shade, 1.3);
      shape(c, soft([-10.5, -1, -12.5, -13, -8, -22.5, 2, -25, 10.5, -21.5, 14.5, -15, 5, -14.5, 3.5, -6, 0, -1], 3.5), K.metal, { shadeOffset: [2.5, 2.5] });
      detail(c, line([-6, -21, 4, -23]), K.metalHi, 1.4);
      detail(c, line([5, -14.5, 14, -15]), K.metal.shade, 1.4);
      frontNoseEye(c, K);
    } else if (age === 3) {
      // Kapalı kova miğfer: göz yarığı, nefes delikleri, takım renkli tüy.
      shape(c, soft([-6, -24, -3, -34, 4, -36.5, 9.5, -31, 5, -25], 2.5), team.trim, { shadeOffset: [1.2, 1.5] });
      shape(c, rr(-9.5, -26, 24.5, 26.5, 5), K.metal, { shadeOffset: [3, 3] });
      shape(c, rr(-9.5, -17.5, 24.5, 3.4, 1.4), K.band, { line: 2 });
      shape(c, rr(6, -13.8, 9.5, 2.8, 1.4), INK, { line: 0 });
      detail(c, line([12.5, -23.5, 12.5, -15]), K.metal.shade, 1.4);
      detail(c, line([12.5, -10, 12.5, -2]), K.metal.shade, 1.4);
      rivets(c, [9.5, -7, 9.5, -3.5, 6.5, -5.2], 1);
      detail(c, line([-5, -23, 5, -24]), K.metalHi, 1.4);
    } else if (age === 4) {
      // Uzun kalpak (şako): takım bandı, amblem rozeti, ponpon; kocaman bıyık.
      frontFace(c, K);
      shape(c, soft([-9, -19, -5, -21, -6, -12, -9, -10], 2), K.hair, { shadeOffset: [1, 1] });
      shape(c, soft([-9, -19, 11.5, -19, 12.5, -38, -8.5, -38], 2), K.boot, { shadeOffset: [2, 2] });
      shape(c, rr(-10, -40.5, 23.5, 4, 1.8), K.boot, { line: 2.2 });
      shape(c, rr(-9.4, -22.5, 21.8, 4, 1.4), team.trim, { line: 2 });
      shape(c, soft([7, -19.5, 19, -17, 18, -15, 6, -17.5], 1.2), K.boot, { line: 2.2 });
      emblem(c, side, 2.5, -29.5, 3.8, 1.8);
      shape(c, circle(1.5, -43, 3.4), team.trim, { line: 2, shadeOffset: [1, 1] });
      frontNoseEye(c, K);
      moustache(c, K, 9, -5.5, 1);
    } else {
      // Kapalı miğfer, takım renkli parlak vizör, anten kanadı.
      stick(c, [-4, -22, -10, -32], 2, K.metal, 1.6);
      shape(c, circle(-10, -32, 2.2), K.glow, { line: 1.6 });
      shape(c, soft([-10, -1, -11.5, -14, -7, -23.5, 3, -25.5, 11.5, -22, 15.5, -13, 16, -4, 9, 0.5], 4), K.limb, { shadeOffset: [3, 3] });
      shape(c, soft([3.5, -17, 16, -14.5, 16, -8, 4.5, -8.5], 2), team.trim, { line: 2.2, shadeOffset: [1, 1.2] });
      stroke(c, line([6, -15, 14, -13.5]), 1.4, GLOW_CORE);
      stroke(c, line([-8, -16, 0, -21]), 2, K.band.base);
      shape(c, soft([0, -6, 12, -5, 10, 0, 0, 0], 1.5), K.metal, { line: 2 });
    }
  };
}

function frontShield(age: LaterAge, K: AgeKit, side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    if (age === 2) {
      // Yuvarlak bronz kalkan.
      shape(c, circle(0, 0, 17), K.metal, { shadeOffset: [2.5, 3] });
      shape(c, circle(0, 0, 13), team.cloth, { shadeOffset: [2.5, 3] });
      detail(c, circle(0, 0, 15), K.metal.shade, 1.2);
      emblem(c, side, 0, 0, 6.8);
    } else if (age === 3) {
      // Üçgen (heater) kalkan: demir kenar, takım yüz, üst şerit.
      const outer: PathFn = soft([-13, -18, 13, -18, 13, -3, 0, 20, -13, -3], 3);
      shape(c, outer, K.band, { shadeOffset: [2.5, 3] });
      shape(c, soft([-10, -15, 10, -15, 10, -3.5, 0, 15.5, -10, -3.5], 2.5), team.cloth, { shadeOffset: [2, 2.5] });
      shape(c, rr(-10, -15, 20, 5, 1.5), team.trim, { line: 2 });
      emblem(c, side, 0, 0, 6.4);
    } else if (age === 4) {
      // Perçinli demir siper: gözetleme yarığı, takım boyalı levha.
      shape(c, rr(-12.5, -20, 25, 40, 3), K.metal, { shadeOffset: [2.5, 3] });
      shape(c, rr(-8.5, -6, 17, 22, 2), team.cloth, { shadeOffset: [2, 2] });
      shape(c, rr(-6, -15, 12, 3, 1.5), INK, { line: 0 });
      rivets(c, [-10, -17.5, 10, -17.5, -10, 17.5, 10, 17.5, -10, 0, 10, 0], 1.2);
      detail(c, line([-12, -9, 12, -9]), K.metal.shade, 1.4);
      emblem(c, side, 0, 5, 6.2);
    } else {
      // Altıgen enerji kalkanı: yarı saydam takım rengi, alaşım çerçeve.
      const hex: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        hex.push(Math.cos(a) * 15, Math.sin(a) * 19);
      }
      haze(c, soft(hex, 3), team.trim.base, 0.35);
      c.save();
      c.globalAlpha = 0.78;
      shape(c, soft(hex, 3), team.cloth, { line: 0, shadeOffset: [2.5, 3] });
      c.restore();
      stroke(c, soft(hex, 3), 3.2, K.trim.base);
      stroke(c, soft(hex, 3), 1.4, team.trim.base);
      detail(c, line([-7, -10, 0, -14, 7, -10]), GLOW_CORE, 1.2);
      emblem(c, side, 0, 0, 6.6);
    }
  };
}

// =====================================================================
// Menzilli
// =====================================================================

function rangedLeg(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    shape(c, rr(-3.4, -2, 6.8, 16, 3.4), K.limb, { shadeOffset: [1.6, 1] });
    const band = age === 5 ? K.boot : K.band;
    shape(c, rr(-4.2, 7, 8.4, 4.6, 2.3), band, { shadeOffset: [1, 1.2] });
    if (age === 5) stroke(c, line([-3, 9.3, 3, 9.3]), 1.4, K.band.base);
    shape(c, ellipse(2.4, 15, 5.4, 2.7), K.boot, { shadeOffset: [1.2, 1.2] });
  };
}

function rangedArmFront(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    shape(c, rr(-3, -3, 6, 15.5, 3), K.limb, { shadeOffset: [1.5, 1] });
    shape(c, rr(-3.8, 6.5, 7.6, 3.4, 1.7), age === 5 ? K.band : age === 2 ? K.band : K.leather, { shadeOffset: [1, 1] });
    shape(c, circle(0, 13.8, 3.6), age === 5 ? K.boot : K.skin, { shadeOffset: [1, 1] });
  };
}

function rangedArmThrow(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    shape(c, rr(-3.2, -3, 6.4, 24, 3.2), K.limb, { shadeOffset: [1.5, 1] });
    shape(c, rr(-4, 9, 8, 3.4, 1.7), age === 2 || age === 5 ? K.band : K.leather, { shadeOffset: [1, 1] });
    shape(c, circle(0, 21, 3.9), age === 5 ? K.boot : K.skin, { shadeOffset: [1, 1] });
  };
}

/** Silah: tutma noktası eksende (0,0), namlu/uç +x yönünde. */
function rangedWeapon(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    if (age === 2) {
      // Bronz yaprak uçlu cirit.
      stick(c, [-13, 0, 36, 0], 2.6, K.wood, 2.2);
      shape(c, soft([32, -3.6, 38, -4.2, 47, 0, 38, 4.2, 32, 3.6], 1.3), K.metal, { shadeOffset: [1, 1.2] });
      detail(c, line([34, 0, 44, 0]), K.metal.shade, 1);
      lashing(c, 0, -2.4, 3, 4.8, K.leather, 2);
    } else if (age === 3) {
      // Arbalet: kundak, çelik yay, kiriş, ok, üzengi.
      detail(c, line([20, -12.5, 6, -1.5, 20, 12.5]), INK, 1.3);
      shape(c, soft([-12, -1.2, 24, -2.6, 26, 1.6, 4, 2.4, 1, 7, -4, 7, -3, 2.6, -12, 3.2], 1.4), K.wood, { shadeOffset: [1, 1.2] });
      const prod: PathFn = (p) => {
        p.moveTo(19.5, -13.5);
        p.quadraticCurveTo(27, 0, 19.5, 13.5);
      };
      stroke(c, prod, 6.6, INK);
      stroke(c, prod, 3.4, K.metal.base);
      stick(c, [6, -4, 30, -4], 1.5, K.wood, 1.4);
      shape(c, soft([29, -6.2, 34, -4, 29, -1.8], 0.6), K.metal, { line: 1.6 });
      shape(c, soft([5, -4, 9, -4, 7, -7], 0.6), K.fabric, { line: 1.4 });
      stroke(c, (p) => p.ellipse(28, 0.5, 2.6, 3.6, 0, -Math.PI / 2, Math.PI / 2), 1.8, INK);
    } else if (age === 4) {
      // Uzun namlulu tüfek, pirinç bilezikler.
      shape(c, soft([-15, -1.4, 0, -2.4, 2, 1.6, -1, 2.8, -15, 5.2], 1.6), K.wood, { shadeOffset: [1, 1.2] });
      shape(c, rr(9, -2.6, 38, 2.8, 1.2), K.metal, { line: 2 });
      shape(c, rr(0, -3.2, 11, 5.2, 1.4), K.metal, { line: 2, shadeOffset: [1, 1] });
      shape(c, rr(9, -1, 22, 3.8, 1.6), K.wood, { shadeOffset: [1, 1] });
      for (const x of [15, 27]) shape(c, rr(x, -1.6, 2, 5, 0.8), K.trim, { line: 1.4 });
      stroke(c, (p) => p.arc(4, 3, 2.6, 0, Math.PI), 1.6, INK);
      shape(c, rr(44.5, -4.6, 1.6, 2.2, 0.6), K.metal, { line: 1.2 });
    } else {
      // Ray tüfeği: çift ray, eflatun bobinler, dürbün.
      shape(c, soft([-12, -2, 2, -3.4, 3, 3.4, -2, 4.6, -12, 5.2], 1.8), K.limb, { shadeOffset: [1, 1.2] });
      haze(c, rr(18, -4, 36, 8, 4), K.glow.shade, 0.4);
      shape(c, rr(18, -5, 35, 2.6, 1.2), K.metal, { line: 1.8 });
      shape(c, rr(18, 2.4, 35, 2.6, 1.2), K.metal, { line: 1.8 });
      stroke(c, line([20, -0.6, 51, -0.6]), 2.4, K.glow.base);
      stroke(c, line([22, -0.6, 49, -0.6]), 1, GLOW_CORE);
      shape(c, rr(1, -5.5, 19, 9.5, 2.6), K.metal, { shadeOffset: [1.2, 1.5] });
      for (const x of [5, 10, 15]) shape(c, rr(x, -4.5, 2.4, 7.5, 1), K.band, { line: 1.2 });
      shape(c, rr(4, -10, 11, 3.6, 1.6), K.trim, { line: 1.8 });
      shape(c, circle(14.5, -8.2, 1.4), K.glow, { line: 0 });
    }
  };
}

const RANGED_OUTLINE = [-8, 2, 8, 2, 9, -12, 7, -22.5, -7, -22.5, -9, -12];

function rangedTorso(age: LaterAge, K: AgeKit, side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    if (age === 2) {
      // Sırtta cirit demeti + terakota sadak; takım tuniği, bronz kemer, keten askı.
      const shafts: Array<[number, number, number, number]> = [
        [-7, -6, -17, -40],
        [-10, -4, -24, -35],
      ];
      for (const [x0, y0, x1, y1] of shafts) stick(c, [x0, y0, x1, y1], 2, K.wood, 1.6);
      for (const [, , x1, y1] of shafts) shape(c, soft([x1 - 3.2, y1 + 2, x1 - 0.5, y1 - 7.5, x1 + 3, y1 + 2.4], 1.2), K.metal, { shadeOffset: [1, 1] });
      shape(c, soft([-15, -7, -8, -3, -2.5, -22, -9.5, -26], 3), K.trim, { shadeOffset: [1.5, 2] });
      detail(c, line([-12.5, -10, -6, -22.5]), K.fabric.base, 1.4);
      shape(c, soft(RANGED_OUTLINE, 6), team.cloth, { shadeOffset: [2.5, 3] });
      shape(c, rr(-9.2, -4, 18.4, 4, 2), K.metal, { shadeOffset: [1, 1] });
      shape(c, soft([-7, -22.5, -2, -22.5, -5.5, -15, -9, -16.5], 1.5), K.fabric, { shadeOffset: [1, 1] });
      emblem(c, side, 1.5, -13, 4.7, 2.2);
    } else if (age === 3) {
      // Belde cıvata sadağı (tüylü uçlar), kapitone takım yeleği.
      shape(c, soft([-17, -2, -9, -1, -7, -17, -14.5, -19], 2.5), K.leather, { shadeOffset: [1.5, 2] });
      for (const [x, y] of [[-15, -19], [-12, -20], [-9, -19]] as const) {
        stick(c, [x, y + 2, x - 0.5, y - 4], 1.2, K.wood, 1.2);
        shape(c, soft([x - 2, y - 3, x + 1.5, y - 3, x - 0.3, y - 7.5], 0.6), K.fabric, { line: 1.4 });
      }
      shape(c, soft(RANGED_OUTLINE, 6), team.cloth, { shadeOffset: [2.5, 3] });
      for (const x of [-4.5, 0, 4.5]) detail(c, line([x, -21, x, -5]), team.cloth.shade, 1.1);
      shape(c, rr(-9.2, -4, 18.4, 4, 2), K.leather, { shadeOffset: [1, 1] });
      shape(c, circle(0, -2, 1.6), K.metal, { line: 1.2 });
      emblem(c, side, 1.5, -13, 4.7, 2.2);
    } else if (age === 4) {
      // Haki sırt çantası ve battaniye rulosu; takım ceketi, pirinç düğmeler.
      shape(c, rr(-17.5, -21, 10.5, 17, 3), K.fabric, { shadeOffset: [1.5, 2] });
      shape(c, ellipse(-12, -23, 7.5, 3.6), K.limb, { shadeOffset: [1, 1.2] });
      detail(c, line([-12, -26.5, -12, -19.5]), K.leather.base, 1.6);
      shape(c, soft(RANGED_OUTLINE, 6), team.cloth, { shadeOffset: [2.5, 3] });
      shape(c, rr(-7, -24, 14, 3.6, 1.8), team.trim, { line: 2 });
      stick(c, [-6, -21.5, 6, -5], 2.2, K.leather, 1.4);
      shape(c, rr(-9.2, -4, 18.4, 4, 2), K.leather, { shadeOffset: [1, 1] });
      for (const y of [-17, -9]) shape(c, circle(5.5, y, 1.2), K.trim, { line: 1 });
      emblem(c, side, 0.5, -13, 4.5, 2.2);
    } else {
      // Sırtta güç paketi (eflatun hücreler, kablo); alaşım giysi, takım göğüs paneli.
      shape(c, rr(-17.5, -23, 10.5, 19, 3), K.trim, { shadeOffset: [1.5, 2] });
      for (const y of [-19, -12]) shape(c, rr(-15.5, y, 6.5, 4, 1.6), K.band, { line: 1.6 });
      stroke(c, (p) => {
        p.moveTo(-9, -8);
        p.quadraticCurveTo(-4, 2, 5, -6);
      }, 3.2, INK);
      stroke(c, (p) => {
        p.moveTo(-9, -8);
        p.quadraticCurveTo(-4, 2, 5, -6);
      }, 1.6, K.band.base);
      shape(c, soft(RANGED_OUTLINE, 6), K.limb, { shadeOffset: [2.5, 3] });
      shape(c, soft([-6.5, -6, 7.5, -6, 8, -13, 6, -21.5, -5.5, -21.5, -7.5, -13], 3), team.cloth, { shadeOffset: [2, 2.5] });
      shape(c, rr(-9.2, -4, 18.4, 4, 2), K.metal, { shadeOffset: [1, 1] });
      stroke(c, line([-7, -2, 7, -2]), 1.4, K.band.base);
      emblem(c, side, 1, -13.5, 4.5, 2.2);
    }
  };
}

function rangedFace(c: Ctx, K: AgeKit): void {
  shape(c, circle(2, -8.5, 9.6), K.skin, { shadeOffset: [2.5, 2.5] });
}

function rangedNoseEye(c: Ctx, K: AgeKit): void {
  shape(c, soft([10, -10.5, 15.5, -5, 10, -4], 1.4), K.skin, { shadeOffset: [1, 1] });
  eye(c, 7.8, -10.2, 1.7);
  stroke(c, line([4.2, -14.2, 10.4, -12.8]), 2.2, INK);
}

function rangedHead(age: LaterAge, K: AgeKit, side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    if (age === 2) {
      // Konik bronz başlık (pilos), takım renkli püskül.
      shape(c, soft([-6, -16, -14, -29, -10.5, -32, -1, -23], 2.5), team.trim, { shadeOffset: [1.5, 1.5] });
      detail(c, line([-4, -19, -11, -29]), team.trim.shade, 1.3);
      rangedFace(c, K);
      shape(c, soft([-7.5, -3, -7.5, -11, -2, -9.5, -3.5, -3], 2.5), K.hair, { shadeOffset: [1, 1] });
      shape(c, soft([-8, -12.5, 11.5, -12.5, 5.5, -26, 1.5, -29.5, -2.5, -26], 2.2), K.metal, { shadeOffset: [2, 2] });
      shape(c, rr(-9, -14.2, 22, 3.4, 1.6), K.metal, { line: 2 });
      detail(c, line([-1, -24, 2, -14.5]), K.metalHi, 1.2);
      rangedNoseEye(c, K);
    } else if (age === 3) {
      // Geniş kenarlı demir şapka (kettle hat), takım bandı.
      rangedFace(c, K);
      shape(c, soft([-7.5, -4, -7.5, -11, -3, -11, -4, -4], 2), K.hair, { shadeOffset: [1, 1] });
      shape(c, (p) => {
        p.arc(1.5, -14.5, 9, Math.PI, 0);
        p.closePath();
      }, K.metal, { shadeOffset: [2, 2] });
      shape(c, rr(-7.5, -16.5, 18, 3, 1.4), team.trim, { line: 2 });
      shape(c, ellipse(1.5, -14, 14.5, 2.8), K.metal, { shadeOffset: [1, 1.2] });
      detail(c, line([-3, -21, 3, -22.5]), K.metalHi, 1.2);
      rangedNoseEye(c, K);
    } else if (age === 4) {
      // Takım renkli kepi, siyah siper; bıyık.
      rangedFace(c, K);
      shape(c, soft([-7.5, -4, -7.5, -12, -3, -12, -4, -4], 2), K.hair, { shadeOffset: [1, 1] });
      shape(c, soft([-8, -13, 9.5, -13, 10, -25, -5, -23.5], 2), team.cloth, { shadeOffset: [1.5, 2] });
      shape(c, rr(-8.5, -15.5, 18.5, 3.6, 1.4), K.boot, { line: 2 });
      shape(c, soft([7, -15, 16.5, -13.5, 15.5, -11.5, 6, -12.5], 1), K.boot, { line: 2 });
      shape(c, circle(1, -19.5, 1.7), K.trim, { line: 1.2 });
      rangedNoseEye(c, K);
      moustache(c, K, 8.5, -3.5, 0.75);
    } else {
      // Dar vizörlü miğfer, kulakta eflatun alıcı.
      shape(c, soft([-8, -2, -9.5, -12, -5, -19, 3, -20.5, 10, -17, 13.5, -10, 13.5, -2, 6, 1], 3.5), K.limb, { shadeOffset: [2.5, 2.5] });
      shape(c, soft([4, -13, 14, -11.5, 14, -7.5, 4.5, -8], 1.8), team.trim, { line: 2, shadeOffset: [0.8, 1] });
      stroke(c, line([6, -11.2, 12.5, -10.2]), 1.2, GLOW_CORE);
      shape(c, circle(-3, -9, 3.6), K.metal, { line: 2 });
      shape(c, circle(-3, -9, 1.6), K.band, { line: 0 });
      stick(c, [-3, -12.5, -6, -24], 1.4, K.metal, 1.4);
      shape(c, circle(-6, -24.5, 1.8), K.glow, { line: 1.4 });
    }
  };
}

// =====================================================================
// Ağır
// =====================================================================

function wheelDraw(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    const r = HEAVY_JOINTS.wheelR;
    if (age === 5) {
      // Yürüyen ayak: üst payanda, diz eklemi, taban.
      stick(c, [-3, -17, 0, 0], 5.5, K.metal);
      stick(c, [0, 0, 3, 8.5], 5.5, K.limb);
      shape(c, soft([-9, 8.5, 13, 8.5, 15, 12.8, -10.5, 12.8], 2.5), K.trim, { shadeOffset: [1, 1.5] });
      stroke(c, line([-6, 11, 10, 11]), 1.4, K.band.base);
      shape(c, circle(0, 0, 4.6), K.metal, { line: 2.2, shadeOffset: [1, 1] });
      shape(c, circle(0, 0, 1.9), K.band, { line: 0 });
      return;
    }
    const rim = age === 3 ? K.band : age === 4 ? K.metal : K.wood;
    const face = age === 4 ? K.metal : K.wood;
    shape(c, circle(0, 0, r), rim, { shadeOffset: [2, 2.5] });
    shape(c, circle(0, 0, r - 3), face, { shadeOffset: [1.5, 1.5], line: 2 });
    const spokes = age === 3 ? 8 : 6;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const p = line([Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(a) * (r - 3.5), Math.sin(a) * (r - 3.5)]);
      stroke(c, p, 3.6, INK);
      stroke(c, p, 1.8, age === 4 ? K.metalHi : K.wood.shade);
    }
    if (age === 4) rivets(c, [0, -(r - 1.5), r - 1.5, 0, 0, r - 1.5, -(r - 1.5), 0], 0.9);
    const hub = age === 2 ? K.metal : age === 4 ? K.trim : K.band;
    shape(c, circle(0, 0, 3.6), hub, { line: 2 });
  };
}

function heavyChassis(age: LaterAge, K: AgeKit, side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    const P = HEAVY_JOINTS.pivot;
    if (age === 2) {
      // Balista arabası: ahşap platform, bronz köşe levhaları, bronz yakalı direk, yuvarlak takım kalkanı.
      stick(c, [-33, -25, -51, -32], 4, K.wood);
      shape(c, circle(-51, -32, 3.2), K.leather, { line: 2 });
      stick(c, [-12, -27, P.x - 1, P.y + 10], 4, K.wood);
      stick(c, [20, -27, P.x + 2, P.y + 10], 4, K.wood);
      stick(c, [P.x, -27, P.x, P.y + 3], 8, K.wood);
      shape(c, rr(P.x - 6.5, P.y + 1, 13, 6, 2), K.metal, { line: 2.2 });
      stick(c, [37, -29, 37, -80], 3.4, K.wood);
      shape(c, soft([37, -81, 55, -75, 37, -69], 2), team.trim, { shadeOffset: [1.5, 1.5] });
      shape(c, circle(31, -42, 13), K.metal, { shadeOffset: [2, 2.5] });
      shape(c, circle(31, -42, 10), team.cloth, { shadeOffset: [2, 2.5] });
      emblem(c, side, 31, -42, 6.2);
      shape(c, rr(-38, -32, 76, 12, 4), K.wood, { shadeOffset: [2, 3] });
      shape(c, rr(-38, -32, 9, 12, 3), K.metal, { line: 2.2 });
      shape(c, rr(29, -32, 9, 12, 3), K.metal, { line: 2.2 });
      for (let x = -26; x < 26; x += 7) detail(c, line([x, -24, x + 3.5, -28, x + 7, -24]), K.trim.base, 1.6);
      shape(c, rr(-27, -21, 10, 9, 2.5), K.wood, { shadeOffset: [1, 1.5] });
      shape(c, rr(15, -21, 10, 9, 2.5), K.wood, { shadeOffset: [1, 1.5] });
    } else if (age === 3) {
      // Mancınık: koyu ahşap A-çatı, demir lamalar, takım renkli kalkan-siper, çatal sancak.
      stick(c, [-33, -25, -51, -32], 4, K.wood);
      shape(c, circle(-51, -32, 3.2), K.leather, { line: 2 });
      stick(c, [-20, -29, P.x - 1, P.y + 4], 6, K.wood);
      stick(c, [26, -29, P.x + 2, P.y + 4], 6, K.wood);
      stick(c, [-12, -42, 18, -42], 4, K.wood);
      shape(c, rr(P.x - 7, P.y - 2, 14, 10, 2.5), K.band, { line: 2.2 });
      rivets(c, [P.x - 4, P.y + 3, P.x + 4, P.y + 3], 1);
      stick(c, [38, -29, 38, -84], 3.4, K.wood);
      shape(c, soft([38, -85, 60, -82, 52, -77, 60, -72, 38, -70], 1.5), team.trim, { shadeOffset: [1.5, 1.5] });
      shape(c, soft([13, -62, 40, -64, 41, -30, 12, -30], 3), K.band, { shadeOffset: [2, 2.5] });
      shape(c, soft([16, -59, 37.5, -60.5, 38, -33, 15, -33], 2.5), team.cloth, { shadeOffset: [2, 2.5] });
      emblem(c, side, 26.5, -46, 7.4);
      shape(c, rr(-38, -32, 76, 12, 3), K.wood, { shadeOffset: [2, 3] });
      for (const x of [-30, -6, 18]) shape(c, rr(x, -32, 5, 12, 1), K.band, { line: 1.8 });
      shape(c, rr(-27, -21, 10, 9, 2.5), K.band, { shadeOffset: [1, 1.5] });
      shape(c, rr(15, -21, 10, 9, 2.5), K.band, { shadeOffset: [1, 1.5] });
    } else if (age === 4) {
      // Buharlı top arabası: perçinli kazan, baca, pirinç saat, takım boyalı ön zırh.
      stick(c, [-36, -25, -52, -31], 3.4, K.metal);
      shape(c, circle(-52, -31, 3), K.trim, { line: 2 });
      shape(c, rr(-34, -88, 12, 5, 2), K.metal, { line: 2.2 });
      shape(c, rr(-32.5, -85, 9, 26, 2), K.metal, { shadeOffset: [1.5, 1.5] });
      shape(c, rr(-33, -76, 10, 3, 1), K.trim, { line: 1.6 });
      shape(c, rr(-39, -64, 46, 34, 9), K.metal, { shadeOffset: [3, 3] });
      shape(c, rr(-39, -52, 46, 4, 1.5), team.trim, { line: 2 });
      rivets(c, [-33, -60, -23, -61.5, -13, -62, -3, -61.5, -33, -35, -23, -34, -13, -34, -3, -34]);
      shape(c, circle(-22, -42, 5.2), K.trim, { line: 2.2 });
      shape(c, circle(-22, -42, 3), 0xf4efe0, { line: 1.2 });
      detail(c, line([-22, -42, -20, -44.5]), INK, 1.2);
      shape(c, rr(P.x - 5.5, P.y + 2, 11, 30, 2), K.metal, { shadeOffset: [1.5, 1.5] });
      shape(c, soft([11, -64, 41, -59, 43, -28, 9, -28], 3), K.metal, { shadeOffset: [2, 2.5] });
      shape(c, soft([14, -60, 38.5, -56, 40, -31, 12, -31], 2.5), team.cloth, { shadeOffset: [2, 2.5] });
      rivets(c, [14, -57, 37, -53, 14, -34, 38, -34], 1.1);
      emblem(c, side, 26.5, -45, 7.4);
      shape(c, rr(-41, -32, 84, 12, 3), K.metal, { shadeOffset: [2, 3] });
      rivets(c, [-36, -26, -24, -26, -12, -26, 0, -26, 12, -26, 24, -26, 36, -26]);
      shape(c, rr(-27, -21, 10, 9, 2.5), K.metal, { shadeOffset: [1, 1.5] });
      shape(c, rr(15, -21, 10, 9, 2.5), K.metal, { shadeOffset: [1, 1.5] });
    } else {
      // Yürüyen kale gövdesi: altıgen panelli lacivert kabuk, takım enerji paneli, eflatun şeritler, anten.
      stick(c, [-30, -66, -37, -88], 2.2, K.metal);
      shape(c, circle(-37, -89, 2.6), K.glow, { line: 1.6 });
      stick(c, [-38, -30, -52, -34], 3.4, K.metal);
      shape(c, circle(-52, -34, 3), K.band, { line: 2 });
      const hull: PathFn = soft([-42, -28, 36, -28, 45, -44, 36, -67, -30, -70, -46, -50], 6);
      shape(c, hull, K.limb, { shadeOffset: [3, 3.5] });
      detail(c, line([-30, -69, -22, -48, -40, -44]), K.metal.shade, 1.4);
      detail(c, line([-22, -48, 0, -46, 8, -68]), K.metal.shade, 1.4);
      detail(c, line([0, -46, -4, -29]), K.metal.shade, 1.4);
      const panel: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        panel.push(26 + Math.cos(a) * 14, -47 + Math.sin(a) * 13);
      }
      haze(c, soft(panel, 2), team.trim.base, 0.3);
      shape(c, soft(panel, 2.5), team.cloth, { shadeOffset: [2, 2.5] });
      emblem(c, side, 26, -47, 7);
      stroke(c, line([-38, -32, 32, -32]), 2.6, K.band.base);
      stroke(c, line([-26, -62, -6, -64]), 2, K.band.base);
      shape(c, rr(P.x - 8, P.y - 3, 16, 12, 3), K.metal, { line: 2.2, shadeOffset: [1, 1.5] });
      shape(c, rr(-30, -30, 14, 6, 2), K.metal, { line: 2 });
      shape(c, rr(13, -30, 14, 6, 2), K.metal, { line: 2 });
    }
  };
}

function beamDraw(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    if (age === 2) {
      // Balista: kızak, burulmalı çerçeve, bronz yaylar, kiriş.
      detail(c, line([-3, -17, -25, 0, -3, 17]), INK, 1.4);
      shape(c, rr(-34, -3, 70, 6, 2), K.wood, { shadeOffset: [1, 1.5] });
      stick(c, [14, -9, -2, -17, -4, -17], 3, K.wood, 2);
      stick(c, [14, 9, -2, 17, -4, 17], 3, K.wood, 2);
      shape(c, rr(9, -11, 10, 22, 2), K.wood, { shadeOffset: [1.5, 1.5] });
      shape(c, rr(8, -13, 12, 4, 1.5), K.metal, { line: 2 });
      shape(c, rr(8, 9, 12, 4, 1.5), K.metal, { line: 2 });
      lashing(c, 14, -8, 6, 16, K.leather, 3);
      shape(c, soft([-30, -3, -24, -7, -22, -3], 1), K.metal, { line: 1.8 });
      shape(c, rr(30, -4, 6, 8, 2), K.metal, { line: 2 });
    } else if (age === 3) {
      // Mancınık kirişi: demir bilezikler, sapan kesesi, demir kuşaklı karşı ağırlık sandığı.
      stick(c, [-56, 0, 21, 0], 7, K.wood);
      for (const x of [-40, -20, 4]) shape(c, rr(x, -4.5, 4, 9, 1), K.band, { line: 1.8 });
      stroke(c, line([-56, 0, -58, 5, -52, 8]), 1.4, K.fabric.shade);
      shape(c, soft([-60, -2, -37, -2, -40.5, 7.5, -56.5, 7.5], 4), K.leather, { shadeOffset: [1.5, 2] });
      shape(c, rr(9, -12, 23, 24, 3), K.wood, { shadeOffset: [2.5, 3] });
      shape(c, rr(9, -12, 23, 4, 1), K.band, { line: 2 });
      shape(c, rr(9, 8, 23, 4, 1), K.band, { line: 2 });
      shape(c, rr(18.5, -12, 4, 24, 1), K.band, { line: 2 });
      rivets(c, [12, -10, 29, -10, 12, 10, 29, 10]);
      shape(c, circle(0, 0, 4.8), K.band, { line: 2.2 });
      shape(c, circle(0, 0, 1.8), INK, { line: 0 });
    } else if (age === 4) {
      // Dökme demir top namlusu: dip topuzu, pirinç bilezikler, kalın ağız.
      shape(c, circle(-21, 0, 5), K.metal, { line: 2.2, shadeOffset: [1, 1] });
      shape(c, soft([-18, -8.5, 36, -6, 36, 6, -18, 8.5], 3), K.metal, { shadeOffset: [2, 2.5] });
      shape(c, rr(34, -7.5, 11, 15, 3), K.metal, { shadeOffset: [1.5, 1.5] });
      shape(c, ellipse(45, 0, 1.8, 4.2), INK, { line: 0 });
      shape(c, rr(-8, -9, 3.6, 18, 1.2), K.trim, { line: 1.8 });
      shape(c, rr(17, -7.6, 3.2, 15.2, 1.2), K.trim, { line: 1.8 });
      detail(c, line([-14, -5, 30, -3.6]), K.metalHi, 1.4);
      shape(c, circle(0, 0, 4.6), K.trim, { line: 2.2 });
    } else {
      // Çift namlulu plazma topu: alaşım gövde, eflatun bobin, yayıcı uç.
      haze(c, rr(14, -9, 40, 18, 9), K.glow.shade, 0.35);
      shape(c, rr(14, -8, 32, 4.6, 1.6), K.limb, { line: 2 });
      shape(c, rr(14, 3.4, 32, 4.6, 1.6), K.limb, { line: 2 });
      shape(c, rr(16, -2.8, 30, 5.6, 2.8), K.glow, { line: 1.8 });
      stroke(c, line([18, 0, 44, 0]), 1.4, GLOW_CORE);
      shape(c, circle(48, 0, 4.8), K.glow, { line: 2 });
      shape(c, circle(48, 0, 2), GLOW_CORE, { line: 0 });
      shape(c, soft([-24, -10, 10, -12, 17, -6, 17, 6, 10, 10, -24, 9], 4), K.metal, { shadeOffset: [2, 2.5] });
      for (const x of [-16, -10, -4]) stroke(c, line([x, -7, x, 6]), 1.8, K.band.base);
      shape(c, circle(0, 0, 4.6), K.trim, { line: 2.2 });
      shape(c, circle(0, 0, 1.8), K.band, { line: 0 });
    }
  };
}

/** Kiriş/kızaktaki dolu mermi (balista oku, mancınık taşı, gülle, enerji küresi). */
function ammoDraw(age: LaterAge, K: AgeKit) {
  return (c: Ctx): void => {
    if (age === 2) {
      stick(c, [-22, 0, 20, 0], 2.6, K.wood, 2);
      shape(c, soft([18, -3.8, 28, 0, 18, 3.8], 1), K.metal, { line: 2 });
      shape(c, soft([-23, 0, -18, -5, -14, 0], 0.8), K.fabric, { line: 1.6 });
    } else if (age === 3) {
      shape(c, circle(0, 0, 8.5), K.stone, { shadeOffset: [2, 2.5] });
      detail(c, line([-4, -4, 3, 3]), K.stone.shade, 1.4);
      detail(c, line([-5, 2, 0, 6]), K.stone.shade, 1.4);
    } else if (age === 4) {
      shape(c, circle(0, 0, 7.5), K.stone, { shadeOffset: [2, 2] });
      shape(c, circle(-2.5, -2.5, 2), 0x8a8f99, { line: 0 });
    } else {
      haze(c, circle(0, 0, 10), K.glow.shade, 0.4);
      shape(c, circle(0, 0, 6.5), K.glow, { line: 2 });
      shape(c, circle(-1.5, -1.5, 2.4), GLOW_CORE, { line: 0 });
    }
  };
}

function pusherBody(age: LaterAge, K: AgeKit, side: ArtSide) {
  return (c: Ctx): void => {
    const team = TEAM[side];
    stick(c, [3, -17, 14, -14], 4.2, K.limb);
    const body = soft([-6, 2, 6, 2, 12, -15, 6.5, -22, -2.5, -20, -8.5, -6], 5);
    shape(c, body, age === 5 ? K.limb : team.cloth, { shadeOffset: [2, 2.5] });
    if (age === 5) shape(c, soft([-4, -4, 7, -4, 10, -14, 5, -20, -2, -18, -6, -8], 3), team.cloth, { shadeOffset: [1.5, 2] });
    if (age === 3) shape(c, soft([-8, -4, 7, -4, 6, 2, -6, 2], 2), K.limb, { line: 2 });
    shape(c, rr(-7.5, -3.5, 14, 3.6, 1.8), age === 2 ? K.metal : K.leather, { line: 2 });
    emblem(c, side, -1.2, -11, 3.6, 2);
    // Baş.
    if (age !== 5) {
      shape(c, circle(12, -27, 8), K.skin, { shadeOffset: [2, 2] });
      shape(c, ellipse(20, -26, 3.2, 2.6), K.skin, { shadeOffset: [1, 1] });
      eye(c, 15.8, -26.6, 1.5);
    }
    if (age === 2) {
      shape(c, soft([3.5, -28, 21, -28, 14, -39, 11, -40.5, 8, -38], 2), K.metal, { shadeOffset: [1.5, 1.5] });
      shape(c, soft([10, -40, 5, -45, 8, -46, 13, -41], 1.2), team.trim, { line: 1.8 });
    } else if (age === 3) {
      shape(c, (p) => {
        p.arc(12, -29.5, 7.5, Math.PI, 0);
        p.closePath();
      }, K.metal, { shadeOffset: [1.5, 1.5] });
      shape(c, ellipse(12, -29.5, 11.5, 2.2), K.metal, { line: 2 });
      shape(c, rr(5, -32, 14, 2.4, 1), team.trim, { line: 1.6 });
    } else if (age === 4) {
      shape(c, soft([3.5, -30, 19, -32, 23, -29.5, 19, -28.5, 4, -28], 2), K.limb, { shadeOffset: [1, 1] });
      shape(c, soft([4, -30, 17, -32, 16, -36, 6, -35.5], 2.5), K.limb, { shadeOffset: [1, 1.2] });
      shape(c, rr(13, -30.5, 6, 3.4, 1.6), K.trim, { line: 1.6 });
      moustache(c, K, 16.5, -22.5, 0.6);
    } else {
      shape(c, soft([4, -22, 4, -31, 9, -36, 17, -35, 22, -29, 22, -21, 12, -19], 3), K.limb, { shadeOffset: [2, 2] });
      shape(c, soft([13, -30, 22.5, -28.5, 22.5, -25, 13.5, -25.5], 1.4), team.trim, { line: 1.8 });
      stroke(c, line([6, -30, 10, -34]), 1.6, K.band.base);
    }
    stick(c, [7.5, -16, 16.5, -13], 4.2, K.limb);
    shape(c, circle(16.5, -13, 3.2), age === 5 ? K.boot : K.skin, { shadeOffset: [1, 1], line: 2.2 });
  };
}

/** Bir sonraki çağın tüm birlik parçaları (iki taraf). Adlar İlkel Çağ ile aynıdır. */
export function ageUnitParts(age: LaterAge): PartSpec[] {
  const K = AGE_KIT[age];
  const parts: PartSpec[] = [
    { name: 'shadow', x0: -20, y0: -5, x1: 20, y1: 5, draw: shadowDraw },
    { name: 'spark', x0: -12, y0: -12, x1: 12, y1: 12, draw: sparkDraw(K) },
    { name: 'front.leg', x0: -7, y0: -4, x1: 10, y1: 16, draw: frontLeg(age, K) },
    { name: 'front.axeArm', x0: -9, y0: -18, x1: 9, y1: 64, draw: frontArm(age, K) },
    { name: 'ranged.leg', x0: -5, y0: -4, x1: 8, y1: 18, draw: rangedLeg(age, K) },
    { name: 'ranged.armFront', x0: -5, y0: -5, x1: 5, y1: 18, draw: rangedArmFront(age, K) },
    { name: 'ranged.armThrow', x0: -5, y0: -5, x1: 5, y1: 25, draw: rangedArmThrow(age, K) },
    { name: 'ranged.spear', x0: -16, y0: -15, x1: 55, y1: 15, draw: rangedWeapon(age, K) },
    { name: 'heavy.wheel', x0: -14, y0: -19, x1: 16, y1: 14, draw: wheelDraw(age, K) },
    { name: 'heavy.beam', x0: -61, y0: -24, x1: 55, y1: 24, draw: beamDraw(age, K) },
    { name: 'heavy.rock', x0: -24, y0: -11, x1: 29, y1: 11, draw: ammoDraw(age, K) },
  ];
  for (const side of [0, 1] as const) {
    parts.push(
      { name: `front.torso.${side}`, x0: -17, y0: -30, x1: 17, y1: 7, draw: frontTorso(age, K, side) },
      { name: `front.head.${side}`, x0: -17, y0: -47, x1: 20, y1: 2, draw: frontHead(age, K, side) },
      { name: `front.shield.${side}`, x0: -18, y0: -21, x1: 18, y1: 21, draw: frontShield(age, K, side) },
      { name: `ranged.torso.${side}`, x0: -27, y0: -50, x1: 11, y1: 4, draw: rangedTorso(age, K, side) },
      { name: `ranged.head.${side}`, x0: -16, y0: -35, x1: 17, y1: 2, draw: rangedHead(age, K, side) },
      { name: `heavy.chassis.${side}`, x0: -56, y0: -92, x1: 62, y1: -11, draw: heavyChassis(age, K, side) },
      { name: `heavy.pusher.${side}`, x0: -10, y0: -47, x1: 25, y1: 4, draw: pusherBody(age, K, side) },
    );
  }
  return parts;
}


