import { circle, detail, ellipse, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { AGE_KIT, GLOW_CORE, GROUND_SHADOW, INK, type ArtAge, type Tone } from './palette';

/**
 * Sınır Taşı'nın çağ görünümleri (GDD §8 "Görsel", §14 çağ kimlikleri). Taş, savaş alanının çağını (oyuncunun
 * çağı; arka planla aynı) izler: çağ ilerledikçe taşın getirisi arttığı gibi görünüşü de "yükselir".
 * Hepsinde (0,0) taşın tabanıdır (zemin çizgisi); yuva (`socket`) sahip amblemi ve ele geçirme halkasının
 * merkezidir. Tarafsız işaret her çağda aynı motiftir: yuvada üç kısa çentik. Yalnız Canvas 2D çizim ve
 * yerleşim verisi; Pixi yok (testler düğümde okur).
 */

export interface StonePart {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  draw: (c: Ctx) => void;
}

export interface StoneVariant {
  /** Yuva merkezi (taş yerelinde): amblem + ilerleme halkası. */
  socket: { x: number; y: number };
  /** Taşın en yüksek noktası (yerel y, negatif; süzülme genliği dahil). Kazanç işareti bunun üstünden doğar. */
  top: number;
  /** Zemine bağlı gövde. */
  body: StonePart;
  /** Süzülen parça (Gelecek kristali): gövdenin önünde, yuvayla birlikte hafifçe iner-kalkar. */
  float?: StonePart;
  /** Sahip rengine boyanan ışık (Endüstri feneri): açık tonlarda çizilir, sprite tint'i renk verir. */
  lamp?: StonePart;
  /** Süzülme genliği (yerel birim) ve dönemi (ms); 0 ise sabit. */
  bob: { amp: number; periodMs: number };
  /** Sahip halesi: ölçek ve taban saydamlığı. Getiri çağla arttığı için hale de çağla biraz güçlenir. */
  aura: { scale: number; alpha: number };
}

const SOCKET_Y = -74;

function groundShadow(c: Ctx, rx: number): void {
  c.save();
  c.globalAlpha = GROUND_SHADOW.alpha;
  shape(c, ellipse(2, 2, rx, 7), GROUND_SHADOW.color, { line: 0, shadeOffset: null });
  c.restore();
}

/** Tarafsız işaret: yuvada üç kısa çentik (her çağda aynı motif, çağın rengiyle). */
function neutralMark(c: Ctx, x: number, y: number, color: number): void {
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    detail(c, line([x + Math.cos(a) * 3, y + Math.sin(a) * 3, x + Math.cos(a) * 9, y + Math.sin(a) * 9]), color, 2.4);
  }
}

function rivets(c: Ctx, pts: readonly number[], r = 1.3): void {
  for (let i = 0; i < pts.length; i += 2) shape(c, circle(pts[i]!, pts[i + 1]!, r), INK, { line: 0 });
}

// ---- İlkel: kaba dikili taş, oyma spiral, yosun ----

const P_STONE: Tone = { base: 0xa7a59c, shade: 0x7f7d75 };
const P_MOSS: Tone = { base: 0x7f9a55, shade: 0x627c40 };
const P_CARVE = 0x5f5d57;
const P_SOCKET = { x: 1, y: SOCKET_Y } as const;

function primitiveDraw(c: Ctx): void {
  groundShadow(c, 40);
  // Taban taşları.
  shape(c, ellipse(-26, 0, 9, 5), P_STONE, { shadeOffset: [1.5, 1.5], line: 2.4 });
  shape(c, ellipse(28, 1, 8, 4.5), P_STONE, { shadeOffset: [1.5, 1.5], line: 2.4 });
  // Dikili taş gövdesi.
  const body = soft([-24, 3, 26, 3, 29, -44, 22, -104, 7, -132, -10, -127, -21, -96, -28, -42], 9);
  shape(c, body, P_STONE, { shadePath: soft([10, -130, 22, -104, 29, -44, 26, 3, 12, 3, 17, -50, 15, -104], 6) });
  // Yosun.
  shape(c, soft([-27, -30, -18, -38, -12, -30, -14, -18, -24, -14], 4), P_MOSS, { shadeOffset: [1, 1.5], line: 2 });
  shape(c, soft([12, -124, 19, -116, 13, -110, 6, -118], 3), P_MOSS, { shadeOffset: [1, 1], line: 2 });
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
  detail(c, spiral, P_CARVE, 2);
  for (const y of [-112, -106, -100]) detail(c, line([-6, y, 8, y - 2]), P_CARVE, 2);
  detail(c, line([18, -60, 22, -40, 18, -20]), P_CARVE, 1.8);
  // Yuva: koyu oyuk + iç oyma halka + tarafsız işaret.
  shape(c, circle(P_SOCKET.x, P_SOCKET.y, 17), P_STONE.shade, { line: 2.4, shadeOffset: [-2, -2] });
  detail(c, circle(P_SOCKET.x, P_SOCKET.y, 13), P_CARVE, 1.6);
  neutralMark(c, P_SOCKET.x, P_SOCKET.y, P_CARVE);
}

// ---- Antik: basamaklı kaide üstünde mermer dikilitaş, bronz tepelik, terakota friz ----

const MARBLE: Tone = { base: 0xeee4cd, shade: 0xcbbd9c };
const MARBLE_CARVE = 0xb3a483;

function ancientDraw(c: Ctx): void {
  const K = AGE_KIT[2];
  groundShadow(c, 40);
  // Kaide basamakları.
  shape(c, rr(-31, -10, 62, 12, 2), MARBLE, { shadeOffset: [2, 3] });
  shape(c, rr(-25, -20, 50, 11, 2), MARBLE, { shadeOffset: [2, 3] });
  // Dikilitaş gövdesi (sivrilen), sağda gölge şeridi.
  const shaft = soft([-17, -19, 17, -19, 12, -127, -12, -127], 2);
  shape(c, shaft, MARBLE, { shadePath: soft([9, -127, 12, -127, 17, -19, 11, -19], 1) });
  // Taban frizi ve tepe frizi: terakota, mermer meander.
  shape(c, rr(-17, -27, 34, 6, 1.5), K.trim, { line: 2.2 });
  shape(c, rr(-13.5, -126, 27, 10, 1.5), K.trim, { line: 2.2 });
  const key: number[] = [];
  for (let x = -11; x <= 9; x += 5) key.push(x, -119, x, -123, x + 2.5, -123, x + 2.5, -119);
  detail(c, line(key), MARBLE.base, 1.3);
  // Altın bronz tepelik (piramidion) + parıltı kenarı.
  shape(c, soft([-14, -127, 14, -127, 0, -152], 1.5), K.metal, { shadePath: soft([0, -152, 14, -127, 0, -127], 1) });
  stroke(c, line([-10, -129, -1.5, -148]), 1.6, K.metalHi);
  // Yazıt oyması (sınır yazıtı) yuvanın altında.
  for (const [y, w] of [[-44, 9], [-38, 7], [-32, 9]] as const) detail(c, line([-w, y, w, y]), MARBLE_CARVE, 1.8);
  // Yuva: bronz çerçeveli mermer madalyon, oyuk iç.
  shape(c, circle(0, SOCKET_Y, 17), K.metal, { shadeOffset: [1.5, 1.5], line: 2.4 });
  shape(c, circle(0, SOCKET_Y, 13), MARBLE.shade, { shadeOffset: [-1.5, -1.5], line: 1.8 });
  neutralMark(c, 0, SOCKET_Y, K.trim.shade);
}

// ---- Orta: kemerli sınır taşı, demir kuşaklar, arduvaz başlık, armalı kalkan ----

const GREY: Tone = { base: 0xaeaca6, shade: 0x86847f };

function blockCourses(c: Ctx, x0: number, x1: number, y0: number, y1: number, step: number, color: number): void {
  for (let y = y0 + step, row = 0; y < y1 - 2; y += step, row++) {
    detail(c, line([x0 + 2, y, x1 - 2, y]), color, 1.2);
    for (let x = x0 + (row % 2 === 0 ? 12 : 22); x < x1 - 4; x += 20) detail(c, line([x, y - step, x, y]), color, 1.2);
  }
}

/** Kalkan (heater) yolu: yuva merkezli, halkanın iç kenarına sığar. */
function shieldPath(cx: number, cy: number, s = 1): PathFn {
  return (p) => {
    p.moveTo(cx - 13 * s, cy - 15 * s);
    p.lineTo(cx + 13 * s, cy - 15 * s);
    p.lineTo(cx + 13 * s, cy - 2 * s);
    p.quadraticCurveTo(cx + 12 * s, cy + 12 * s, cx, cy + 19 * s);
    p.quadraticCurveTo(cx - 12 * s, cy + 12 * s, cx - 13 * s, cy - 2 * s);
    p.closePath();
  };
}

function medievalDraw(c: Ctx): void {
  const K = AGE_KIT[3];
  groundShadow(c, 42);
  // Taban bloğu.
  shape(c, rr(-30, -12, 60, 13, 2), GREY, { shadeOffset: [2, 3] });
  // Yontma sütun taşı + sıra derzleri.
  shape(c, rr(-24, -118, 48, 108, 3), GREY, { shadeOffset: [3, 3] });
  blockCourses(c, -24, 24, -118, -10, 14, GREY.shade);
  // Demir kuşaklar ve perçinler.
  for (const y of [-106, -36]) {
    shape(c, rr(-26.5, y, 53, 7, 1.5), K.band, { line: 2.2, shadeOffset: [1, 1.5] });
    rivets(c, [-21, y + 3.5, -7, y + 3.5, 7, y + 3.5, 21, y + 3.5]);
  }
  // Arduvaz laciverdi piramit başlık + demir tepe topuzu.
  shape(c, soft([-30, -115, 30, -115, 0, -142], 2.5), K.trim, { shadePath: soft([0, -142, 30, -115, 0, -115], 1) });
  detail(c, line([-20, -119, 20, -119]), K.trim.shade, 1.4);
  stick(c, [0, -141, 0, -147], 2, K.band, 1.8);
  shape(c, circle(0, -149, 3.6), K.metal, { line: 2 });
  // Armalı kalkan (yuva): arduvaz yüz, çelik kenar.
  stroke(c, shieldPath(0, SOCKET_Y, 1.12), 5, K.metal.shade);
  shape(c, shieldPath(0, SOCKET_Y, 1.12), K.metal, { shadeOffset: [1.5, 1.5], line: 2.4 });
  shape(c, shieldPath(0, SOCKET_Y), K.trim, { shadeOffset: [-1.5, -1.5], line: 1.8 });
  neutralMark(c, 0, SOCKET_Y, K.metal.base);
}

// ---- Endüstri: tuğla kaide üstünde dökme demir fener direği, pirinç gösterge, fener ----

const BRICK: Tone = { base: 0xb4553a, shade: 0x87392a };
const DIAL = { base: 0xf3ead2, shade: 0xd4c8a6 } as const;

function industrialDraw(c: Ctx): void {
  const K = AGE_KIT[4];
  groundShadow(c, 40);
  // Tuğla kaide + pirinç kapak levhası + perçinli plaka.
  shape(c, rr(-25, -26, 50, 27, 2), BRICK, { shadeOffset: [2.5, 3] });
  for (let y = -18, row = 0; y < 0; y += 8, row++) {
    detail(c, line([-23, y, 23, y]), BRICK.shade, 1);
    for (let x = row % 2 === 0 ? -17 : -11; x < 22; x += 12) detail(c, line([x, y - 8, x, y]), BRICK.shade, 1);
  }
  shape(c, rr(-29, -32, 58, 7, 2), K.trim, { line: 2.4, shadeOffset: [1, 1.5] });
  // Demir direk: perçin sıraları ve pirinç bilezik.
  shape(c, rr(-9, -122, 18, 92, 2), K.metal, { shadeOffset: [2.5, 0] });
  stroke(c, line([-5, -118, -5, -36]), 1.6, K.metalHi);
  rivets(c, [-5, -44, 5, -44, -5, -104, 5, -104], 1.2);
  shape(c, rr(-12, -52, 24, 6, 2), K.trim, { line: 2 });
  // Gösterge kutusu (yuva): demir gövde, pirinç çerçeve, krem kadran, çentikler.
  shape(c, circle(0, SOCKET_Y, 20), K.metal, { shadeOffset: [2, 2], line: 2.6 });
  shape(c, circle(0, SOCKET_Y, 16.5), K.trim, { shadeOffset: [1.5, 1.5], line: 2 });
  shape(c, circle(0, SOCKET_Y, 13.5), DIAL, { shadeOffset: [-1.5, -1.5], line: 1.6 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    detail(c, line([Math.cos(a) * 11, SOCKET_Y + Math.sin(a) * 11, Math.cos(a) * 13, SOCKET_Y + Math.sin(a) * 13]), INK, 1.1);
  }
  neutralMark(c, 0, SOCKET_Y, INK);
  // Fener bileziği, çatı ve tepe topuzu (cam ayrı parça: `lamp`).
  shape(c, rr(-13, -128, 26, 7, 2), K.trim, { line: 2.4 });
  shape(c, soft([-16, -147, 16, -147, 0, -161], 2), K.metal, { shadePath: soft([0, -161, 16, -147, 0, -147], 1) });
  shape(c, circle(0, -163, 2.8), K.trim, { line: 1.8 });
}

/** Fener camı + demir kafes; açık tonda çizilir, sahibin rengine boyanır. */
function industrialLampDraw(c: Ctx): void {
  const glass = soft([-10, -127, 10, -127, 12, -147, -12, -147], 2);
  shape(c, glass, { base: 0xffffff, shade: 0xd9d9d9 }, { shadeOffset: [-2.5, 0], line: 2.4 });
  shape(c, soft([-4, -131, 3, -131, 4, -143, -4, -143], 2), 0xffffff, { line: 0 });
  for (const x of [-6, 0, 6]) stroke(c, line([x, -128, x * 1.15, -146]), 1.8, INK);
}

// ---- Gelecek: altıgen yayıcı kaide üstünde süzülen kristal, parlayan çekirdek ----

const HULL: Tone = { base: 0x3d4870, shade: 0x2a3354 };

function futureDraw(c: Ctx): void {
  const K = AGE_KIT[5];
  groundShadow(c, 36);
  // Işın: kaideden kristale soluk eflatun huzme.
  const beam = c.createLinearGradient(0, -12, 0, -44);
  beam.addColorStop(0, 'rgba(233,184,255,0.55)');
  beam.addColorStop(1, 'rgba(233,184,255,0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(-13, -12);
  c.lineTo(13, -12);
  c.lineTo(6, -44);
  c.lineTo(-6, -44);
  c.closePath();
  c.fill();
  // Yayıcı kaide: alaşım gövde, üst levha, eflatun şerit.
  shape(c, soft([-30, 1, 30, 1, 24, -12, -24, -12], 3), HULL, { shadeOffset: [2.5, 2.5] });
  shape(c, ellipse(0, -12.5, 19, 4), K.metal, { line: 2.2, shadeOffset: [0, 1.5] });
  shape(c, ellipse(0, -12.5, 9, 2), K.glow, { line: 1.4 });
  shape(c, rr(-20, -6.5, 40, 3.5, 1.5), K.band, { line: 1.6 });
  stroke(c, line([-16, -5, 16, -5]), 1, GLOW_CORE);
}

function futureFloatDraw(c: Ctx): void {
  const K = AGE_KIT[5];
  // Uzun sekizyüzlü kristal: sol açık yüz, sağ gölge yüz, yüzey çizgileri.
  const crystal = soft([0, -152, 19, -86, 0, -26, -19, -86], 1.5);
  shape(c, crystal, K.stone, { shadePath: soft([0, -152, 19, -86, 0, -26, 4, -86], 1) });
  detail(c, line([-19, -86, 4, -86, 19, -86]), K.stone.shade, 1.3);
  detail(c, line([0, -150, 4, -86, 0, -28]), K.stone.shade, 1.3);
  stroke(c, line([-15, -92, -2, -142]), 1.6, GLOW_CORE);
  // Parlayan çekirdek (yuva): eflatun hale + açık çekirdek.
  c.save();
  c.globalAlpha = 0.55;
  shape(c, circle(0, SOCKET_Y, 16), K.band.base, { line: 0, shadeOffset: null });
  c.restore();
  shape(c, circle(0, SOCKET_Y, 13), K.glow, { shadeOffset: [-1.5, -1.5], line: 2.2 });
  shape(c, circle(-3, SOCKET_Y - 3, 3.5), GLOW_CORE, { line: 0 });
  neutralMark(c, 0, SOCKET_Y, K.band.shade);
  // Yanda süzülen iki küçük kırık parça.
  shape(c, soft([-28, -124, -23, -114, -28, -104, -33, -114], 1), K.stone, { shadeOffset: [1.5, 0], line: 2 });
  shape(c, soft([29, -52, 33, -44, 29, -36, 25, -44], 1), K.stone, { shadeOffset: [1.5, 0], line: 2 });
}

const BOB_NONE = { amp: 0, periodMs: 1 } as const;

export const STONE_VARIANTS: Readonly<Record<ArtAge, StoneVariant>> = {
  1: {
    socket: P_SOCKET,
    top: -132,
    body: { x0: -42, y0: -134, x1: 42, y1: 9, draw: primitiveDraw },
    bob: BOB_NONE,
    aura: { scale: 2.4, alpha: 0.32 },
  },
  2: {
    socket: { x: 0, y: SOCKET_Y },
    top: -152,
    body: { x0: -42, y0: -154, x1: 42, y1: 9, draw: ancientDraw },
    bob: BOB_NONE,
    aura: { scale: 2.55, alpha: 0.35 },
  },
  3: {
    socket: { x: 0, y: SOCKET_Y },
    top: -153,
    body: { x0: -44, y0: -155, x1: 44, y1: 9, draw: medievalDraw },
    bob: BOB_NONE,
    aura: { scale: 2.7, alpha: 0.38 },
  },
  4: {
    socket: { x: 0, y: SOCKET_Y },
    top: -166,
    body: { x0: -42, y0: -168, x1: 42, y1: 9, draw: industrialDraw },
    lamp: { x0: -14, y0: -149, x1: 14, y1: -125, draw: industrialLampDraw },
    bob: BOB_NONE,
    aura: { scale: 2.85, alpha: 0.41 },
  },
  5: {
    socket: { x: 0, y: SOCKET_Y },
    top: -152 - 3,
    body: { x0: -38, y0: -46, x1: 38, y1: 9, draw: futureDraw },
    float: { x0: -35, y0: -154, x1: 35, y1: -24, draw: futureFloatDraw },
    bob: { amp: 3, periodMs: 3200 },
    aura: { scale: 3, alpha: 0.44 },
  },
};

/** Fenerin tarafsız tonu (sönük cam) ve sahip tonu TEAM'den gelir. */
export const LAMP_NEUTRAL_TINT = 0xb9b2a2;
