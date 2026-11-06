import { circle, detail, ellipse, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { AGE_KIT, GLOW_CORE, GROUND_SHADOW, INK, MAT, type ArtAge, type Tone } from './palette';
import { GOLD, GOLD_HI, glint, type StoreSpot } from './stoneStore';

/**
 * Maden'in çağ görünümleri (GDD §8 "Görsel", §14 çağ kimlikleri). Maden, savaş alanının çağını (oyuncunun
 * çağı; arka planla aynı) izler: çağ ilerledikçe madenin getirisi arttığı gibi kendisi de büyür ve zenginleşir.
 * İlkel altın damarlı kaya + kazma, Antik ahşap destekli maden ağzı + el arabası, Orta taş kuyulu ahşap kule +
 * makara + kova teknesi, Endüstri perçinli demir kule + çark + konveyör + vagon, Gelecek kristal çıkarıcı.
 * Hepsinde (0,0) madenin tabanıdır (zemin çizgisi); yuva (`socket`) sahip amblemi ve ele geçirme halkasının
 * merkezidir (levha, kalkan, gösterge veya çekirdek). Tarafsız işaret her çağda aynı motiftir: yuvada üç kısa
 * çentik. Depo yığını (`store`) ayrı parçadır (stoneStore.ts). Yalnız Canvas 2D çizim ve yerleşim verisi; Pixi
 * yok (testler düğümde okur). Yuva birliklerin başı üstünde kalır (birlikler önünden geçer).
 */

export interface StonePart {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  draw: (c: Ctx) => void;
}

export interface StoneVariant {
  /** Yuva merkezi (maden yerelinde): amblem + ilerleme halkası. */
  socket: { x: number; y: number };
  /** Madenin en yüksek noktası (yerel y, negatif; süzülme genliği dahil). Kazanç işareti bunun üstünden doğar. */
  top: number;
  /** Zemine bağlı gövde. */
  body: StonePart;
  /** Süzülen parça (Gelecek kristali): gövdenin önünde, yuvayla birlikte hafifçe iner-kalkar. */
  float?: StonePart;
  /** Sahip rengine boyanan ışık (Endüstri feneri): açık tonlarda çizilir, sprite tint'i renk verir. */
  lamp?: StonePart;
  /** Depo yığınının yeri, ölçeği ve biçimi. */
  store: StoreSpot;
  /** Süzülme genliği (yerel birim) ve dönemi (ms); 0 ise sabit. */
  bob: { amp: number; periodMs: number };
  /** Sahip halesi: ölçek ve taban saydamlığı. Getiri çağla arttığı için hale de çağla biraz güçlenir. */
  aura: { scale: number; alpha: number };
}

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

/** Altın damarı: koyu kontur üstünde altın şerit ve ince parlak çizgi (kaya yüzeyinde zikzak). */
function vein(c: Ctx, pts: readonly number[], w = 2.6): void {
  stroke(c, line(pts), w + 2.2, INK);
  stroke(c, line(pts), w, GOLD.base);
  c.save();
  c.translate(-0.4, -0.6);
  stroke(c, line(pts), w * 0.35, GOLD_HI);
  c.restore();
}

/** Kayaya gömülü küçük altın yumrusu. */
function embedded(c: Ctx, x: number, y: number, r: number): void {
  shape(c, soft([x - r, y, x - r * 0.3, y - r * 0.9, x + r, y - r * 0.4, x + r * 0.6, y + r * 0.8, x - r * 0.5, y + r * 0.8], r * 0.4), GOLD, {
    shadeOffset: [-1, -1],
    line: 1.8,
  });
}

/** Tekerlek: konturlu jant, göbek ve tel/kol. */
function wheel(c: Ctx, x: number, y: number, r: number, rim: Tone, hub: Tone, spokes: number): void {
  shape(c, circle(x, y, r), rim, { shadeOffset: [1.5, 1.5], line: 2.4 });
  shape(c, circle(x, y, r * 0.62), rim.shade, { line: 1.4, shadeOffset: null });
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    stroke(c, line([x, y, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62]), 1.8, rim.base);
  }
  shape(c, circle(x, y, Math.max(1.8, r * 0.24)), hub, { line: 1.4, shadeOffset: null });
}

// ---- İlkel: altın damarlı kaya çıkıntısı, yaslanmış kaba kazma ----

const P_ROCK: Tone = { base: 0xb3a48a, shade: 0x8a7b63 };
const P_ROCK_DARK: Tone = { base: 0x9c8f78, shade: 0x766a56 };
const P_MOSS: Tone = { base: 0x7f9a55, shade: 0x627c40 };
const P_CRACK = 0x6e624f;
const P_SOCKET = { x: -8, y: -60 } as const;

function primitiveDraw(c: Ctx): void {
  groundShadow(c, 52);
  // Arkadaki ikinci kaya (siluete yumru).
  shape(c, soft([10, 3, 52, 3, 54, -20, 44, -40, 26, -44, 14, -30], 6), P_ROCK_DARK, { shadeOffset: [2, 2.5] });
  // Ana kaya çıkıntısı.
  const body = soft([-50, 3, 34, 3, 38, -26, 30, -54, 20, -82, 2, -106, -18, -100, -32, -78, -46, -52, -52, -22], 9);
  shape(c, body, P_ROCK, { shadePath: soft([20, -84, 30, -54, 38, -26, 34, 3, 18, 3, 24, -30, 18, -60, 10, -90], 6) });
  // Yosun.
  shape(c, soft([-6, -104, 4, -108, 12, -98, 4, -94, -6, -96], 3), P_MOSS, { shadeOffset: [1, 1], line: 2 });
  shape(c, soft([-52, -16, -44, -24, -36, -16, -40, -6, -50, -6], 4), P_MOSS, { shadeOffset: [1, 1.5], line: 2 });
  // Çatlaklar.
  detail(c, line([-38, -64, -34, -50, -40, -40]), P_CRACK, 1.8);
  detail(c, line([22, -70, 26, -58]), P_CRACK, 1.6);
  detail(c, line([-14, -18, -8, -10, -12, -2]), P_CRACK, 1.6);
  // Altın damarları ve gömülü yumrular.
  vein(c, [-46, -30, -38, -26, -32, -32, -24, -24, -16, -28]);
  vein(c, [-4, -94, 4, -90, 10, -96, 16, -88]);
  vein(c, [24, -44, 30, -36, 26, -26, 34, -18]);
  vein(c, [36, -8, 44, -14, 50, -10], 2.2);
  embedded(c, 30, -48, 4.2);
  embedded(c, -40, -36, 3.6);
  embedded(c, 6, -14, 4);
  glint(c, 33, -54, 5);
  glint(c, -26, -92, 4);
  // Yaslanmış kaba kazma: ahşap sap, iple bağlı sivri taş baş.
  stick(c, [56, 2, 38, -64], 3.4, MAT.wood, 2);
  shape(c, soft([24, -58, 31, -67, 41, -70, 54, -66, 42, -63, 31, -60], 1.5), MAT.stone, { shadeOffset: [0, 1.5], line: 2.2 });
  shape(c, ellipse(39, -63.5, 3.2, 4.4, -0.26), MAT.rope, { line: 1.6, shadeOffset: null });
  detail(c, line([36.5, -66, 41.5, -61]), MAT.rope.shade, 1);
  // Yuva: kayada düzleştirilmiş yüz, oyuk iç + tarafsız işaret.
  shape(c, circle(P_SOCKET.x, P_SOCKET.y, 18), P_ROCK.shade, { line: 2.4, shadeOffset: [-2, -2] });
  detail(c, circle(P_SOCKET.x, P_SOCKET.y, 13.5), P_CRACK, 1.6);
  neutralMark(c, P_SOCKET.x, P_SOCKET.y, P_CRACK);
}

// ---- Antik: ahşap destekli maden ağzı, bronz madalyon, el arabası ----

const HILL: Tone = { base: 0xd8b27e, shade: 0xb08756 };
const TUNNEL = { base: 0x3a2b2a, shade: 0x241a1c } as const;
const A_SOCKET = { x: 0, y: -94 } as const;

function ancientDraw(c: Ctx): void {
  const K = AGE_KIT[2];
  groundShadow(c, 60);
  // Tepe yamacı.
  const hill = soft([-60, 3, 60, 3, 58, -30, 50, -66, 36, -100, 14, -124, -10, -126, -32, -110, -46, -80, -56, -44], 12);
  shape(c, hill, HILL, { shadePath: soft([34, -102, 50, -66, 58, -30, 60, 3, 42, 3, 46, -34, 40, -70, 26, -104], 6) });
  // Krem taş kümeleri.
  shape(c, soft([-60, 3, -40, 3, -42, -10, -52, -16, -60, -10], 4), K.stone, { shadeOffset: [1.5, 2], line: 2.2 });
  shape(c, soft([-40, -96, -28, -102, -22, -94, -30, -88, -40, -90], 3), K.stone, { shadeOffset: [1, 1.5], line: 2 });
  // Altın damarları.
  vein(c, [-52, -44, -44, -40, -40, -48, -32, -42]);
  vein(c, [36, -58, 44, -52, 40, -42, 48, -36]);
  vein(c, [30, -104, 36, -96, 34, -86], 2.2);
  embedded(c, -46, -66, 3.8);
  embedded(c, 46, -24, 3.6);
  glint(c, -38, -72, 4.5);
  glint(c, 40, -64, 4);
  // Maden ağzı: karanlık tünel, içte asılı kandil ışığı.
  shape(c, soft([-19, 2, 19, 2, 19, -62, -19, -62], 1), TUNNEL, { shadePath: soft([-19, -62, 19, -62, 19, -50, -19, -50], 1), line: 2.4 });
  c.save();
  const lampGlow = c.createRadialGradient(0, -34, 0, 0, -34, 16);
  lampGlow.addColorStop(0, 'rgba(255,214,120,0.7)');
  lampGlow.addColorStop(1, 'rgba(255,214,120,0)');
  c.fillStyle = lampGlow;
  c.fillRect(-18, -50, 36, 34);
  c.restore();
  stroke(c, line([0, -50, 0, -40]), 1.2, K.metal.shade);
  shape(c, ellipse(0, -37, 5, 2.6), K.trim, { line: 1.6, shadeOffset: [0, 1] });
  shape(c, soft([2.5, -39, 5, -45, 6.5, -39], 1), MAT.flame, { line: 1.2, shadeOffset: null });
  // Ahşap destekler: iki dikme, üst kiriş (uçlarında kesik yüzler).
  shape(c, rr(-27, -64, 9, 66, 1.5), K.wood, { shadeOffset: [2, 0] });
  shape(c, rr(18, -64, 9, 66, 1.5), K.wood, { shadeOffset: [2, 0] });
  shape(c, rr(-34, -73, 68, 11, 2), K.wood, { shadeOffset: [0, 2.5] });
  shape(c, circle(-29, -67.5, 3.6), MAT.woodCut, { line: 1.6, shadeOffset: null });
  shape(c, circle(29, -67.5, 3.6), MAT.woodCut, { line: 1.6, shadeOffset: null });
  for (const x of [-22, 23]) detail(c, line([x, -50, x, -14]), K.wood.shade, 1.2);
  // Yaslanmış bronz kazma (sol).
  stick(c, [-56, 2, -42, -40], 3, K.wood, 2);
  shape(c, soft([-54, -36, -46, -44, -36, -46, -26, -40, -36, -41, -46, -39], 1.5), K.metal, { shadeOffset: [0, 1.5], line: 2.2 });
  // El arabası: ahşap tekne, bronz kuşak, tek tekerlek, sola uzanan kollar.
  stick(c, [36, -18, 24, -30], 2.4, K.wood, 2);
  shape(c, soft([32, -30, 64, -30, 60, -10, 36, -10], 2), K.wood, { shadeOffset: [2, 2] });
  detail(c, line([33, -24, 63, -24]), K.wood.shade, 1.2);
  shape(c, rr(34, -17, 28, 4, 1.5), K.metal, { line: 1.6, shadeOffset: [0, 1] });
  wheel(c, 48, -5, 7.5, K.wood, K.metal, 4);
  // Yuva: bronz çerçeveli madalyon, terakota iç, iki bronz çivi.
  shape(c, circle(A_SOCKET.x, A_SOCKET.y, 18), K.metal, { shadeOffset: [1.5, 1.5], line: 2.4 });
  shape(c, circle(A_SOCKET.x, A_SOCKET.y, 13.5), K.trim, { shadeOffset: [-1.5, -1.5], line: 1.8 });
  neutralMark(c, A_SOCKET.x, A_SOCKET.y, K.stone.base);
}

// ---- Orta: taş kuyu ağzı, ahşap kule + makara, çıkrık, demir kuşaklı tekne ----

const GREY: Tone = { base: 0xaeaca6, shade: 0x86847f };
const GREY_CAP: Tone = { base: 0x9a9892, shade: 0x777570 };
const M_SOCKET = { x: 0, y: -86 } as const;

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
  groundShadow(c, 64);
  // Çıkrık (sol): sehpa, tambur, kol.
  stick(c, [-60, 2, -52, -34], 3.4, K.wood, 2);
  stick(c, [-40, 2, -48, -34], 3.4, K.wood, 2);
  // Kule ayakları (taş kuyunun arkasından yükselir) ve çapraz kiriş.
  stick(c, [-32, -36, -7, -138], 5.5, K.wood, 2.4);
  stick(c, [32, -36, 7, -138], 5.5, K.wood, 2.4);
  stick(c, [-26, -58, 26, -58], 3.6, K.wood, 2);
  // Halat: makaradan kuyuya (dik) ve çıkrığa (çapraz).
  stroke(c, line([0, -136, 0, -44]), 3.6, INK);
  stroke(c, line([0, -136, 0, -44]), 1.8, MAT.rope.base);
  stroke(c, line([-9, -142, -50, -42]), 3.6, INK);
  stroke(c, line([-9, -142, -50, -42]), 1.8, MAT.rope.base);
  // Tambur ve kol.
  shape(c, circle(-50, -34, 8.5), K.wood, { shadeOffset: [1.5, 1.5], line: 2.4 });
  for (const r of [3.5, 6]) detail(c, circle(-50, -34, r), MAT.rope.shade, 1.2);
  stick(c, [-50, -34, -64, -46], 2.4, K.band, 2);
  shape(c, circle(-64, -46, 3), K.wood, { line: 1.8, shadeOffset: null });
  // Kuyu ağzı: taş duvar + kapak taşları.
  shape(c, rr(-36, -38, 72, 39, 3), GREY, { shadeOffset: [3, 3] });
  blockCourses(c, -36, 36, -38, 1, 13, GREY.shade);
  shape(c, rr(-40, -45, 80, 9, 2), GREY_CAP, { shadeOffset: [1.5, 2] });
  for (const x of [-20, 0, 20]) detail(c, line([x, -44, x, -37]), GREY_CAP.shade, 1.2);
  // Üst kiriş, makara başlığı ve makara.
  shape(c, rr(-24, -122, 48, 7, 1.5), K.wood, { shadeOffset: [0, 2] });
  shape(c, rr(-13, -140, 26, 7, 1.5), K.trim, { shadeOffset: [0, 2], line: 2.2 });
  wheel(c, 0, -145, 9.5, K.wood, K.metal, 6);
  // Dökülmüş birkaç külçe.
  embedded(c, 30, 0, 3.4);
  embedded(c, -28, 1, 3);
  glint(c, 24, -8, 3.8);
  // Tekne (sağ): ahşap, demir kuşaklar ve kulplar.
  shape(c, soft([34, -26, 66, -26, 62, 1, 38, 1], 2), K.wood, { shadeOffset: [2, 2] });
  for (const x of [43, 50, 57]) detail(c, line([x, -24, x + (x - 50) * 0.1, -1]), K.wood.shade, 1.1);
  shape(c, rr(34, -20, 32, 4, 1.5), K.band, { line: 1.6, shadeOffset: [0, 1] });
  shape(c, rr(36, -8, 28, 4, 1.5), K.band, { line: 1.6, shadeOffset: [0, 1] });
  rivets(c, [37, -18, 63, -18, 39, -6, 61, -6], 1.1);
  // Yuva: armalı kalkan (arduvaz yüz, çelik kenar) kuleye asılı.
  stroke(c, shieldPath(M_SOCKET.x, M_SOCKET.y, 1.12), 5, K.metal.shade);
  shape(c, shieldPath(M_SOCKET.x, M_SOCKET.y, 1.12), K.metal, { shadeOffset: [1.5, 1.5], line: 2.4 });
  shape(c, shieldPath(M_SOCKET.x, M_SOCKET.y), K.trim, { shadeOffset: [-1.5, -1.5], line: 1.8 });
  neutralMark(c, M_SOCKET.x, M_SOCKET.y, K.metal.base);
}

// ---- Endüstri: perçinli demir kule + büyük çark, tuğla makine evi, konveyör, maden vagonu ----

const BRICK: Tone = { base: 0xb4553a, shade: 0x87392a };
const DIAL = { base: 0xf3ead2, shade: 0xd4c8a6 } as const;
const STEAM: Tone = { base: 0xf4f1ea, shade: 0xd2ccc0 };
const I_SOCKET = { x: 0, y: -92 } as const;

function brickRows(c: Ctx, x0: number, x1: number, y0: number, y1: number, color: number): void {
  for (let y = y1 - 8, row = 0; y > y0 + 2; y -= 8, row++) {
    detail(c, line([x0 + 2, y, x1 - 2, y]), color, 1);
    for (let x = x0 + (row % 2 === 0 ? 6 : 12); x < x1 - 3; x += 12) detail(c, line([x, y, x, y + 8]), color, 1);
  }
}

function industrialDraw(c: Ctx): void {
  const K = AGE_KIT[4];
  groundShadow(c, 72);
  // Makine evi (sol): tuğla, çatı, baca, buhar.
  shape(c, soft([-60, -96, -52, -96, -52, -58, -60, -58], 1), BRICK, { shadeOffset: [2, 0] });
  shape(c, rr(-62, -100, 12, 5, 1.5), K.trim, { line: 2 });
  shape(c, soft([-64, -102, -68, -112, -60, -120, -50, -116, -44, -126, -32, -122, -34, -110, -46, -106, -54, -100], 5), STEAM, { shadeOffset: [1.5, 2], line: 2 });
  shape(c, rr(-72, -60, 32, 61, 2), BRICK, { shadeOffset: [2.5, 3] });
  brickRows(c, -72, -40, -60, 1, BRICK.shade);
  shape(c, soft([-76, -58, -56, -74, -36, -58], 2), K.metal, { shadeOffset: [0, 2] });
  shape(c, rr(-64, -44, 14, 14, 2), DIAL, { line: 2, shadeOffset: [-1, -1] });
  detail(c, line([-57, -44, -57, -30]), INK, 1.4);
  // Halat: makine evinden çarka.
  stroke(c, line([-46, -40, -15, -160]), 3.4, INK);
  stroke(c, line([-46, -40, -15, -160]), 1.6, K.metalHi);
  // Kule: perçinli demir ayaklar, çapraz kafes, yatay kirişler.
  const leg = (s: number): PathFn => soft([s * 38, -30, s * 28, -30, s * 9, -150, s * 15, -150], 1);
  for (const s of [-1, 1]) shape(c, leg(s), K.metal, { shadeOffset: [s * 2, 0] });
  for (const [ya, yb] of [[-34, -64], [-64, -96], [-96, -124], [-124, -148]] as const) {
    const xa = 28 - ((-30 - ya) / 120) * 19;
    const xb = 28 - ((-30 - yb) / 120) * 19;
    stroke(c, line([-xa, ya, xb, yb]), 4.4, INK);
    stroke(c, line([-xa, ya, xb, yb]), 2.2, K.metal.shade);
    stroke(c, line([xa, ya, -xb, yb]), 4.4, INK);
    stroke(c, line([xa, ya, -xb, yb]), 2.2, K.metal.shade);
  }
  for (const y of [-64, -124]) {
    const x = 30 - ((-30 - y) / 120) * 19;
    shape(c, rr(-x - 2, y - 3, 2 * x + 4, 6, 1.5), K.metal, { shadeOffset: [0, 1.5], line: 2.2 });
    rivets(c, [-x + 2, y, x - 2, y], 1.1);
  }
  rivets(c, [-33, -40, 33, -40, -24, -96, 24, -96], 1.2);
  // Halat: çarktan kuyuya.
  stroke(c, line([0, -144, 0, -40]), 3.4, INK);
  stroke(c, line([0, -144, 0, -40]), 1.6, K.metalHi);
  // Kuyu ağzı: tuğla kaide, pirinç kapak.
  shape(c, rr(-42, -26, 84, 27, 2), BRICK, { shadeOffset: [2.5, 3] });
  brickRows(c, -42, 42, -26, 1, BRICK.shade);
  shape(c, rr(-46, -32, 92, 7, 2), K.trim, { line: 2.4, shadeOffset: [1, 1.5] });
  // Tepe platformu ve büyük çark.
  shape(c, rr(-22, -152, 44, 7, 2), K.metal, { shadeOffset: [0, 2] });
  wheel(c, 0, -160, 15, K.metal, K.trim, 8);
  stroke(c, circle(0, -160, 15), 1.4, K.metalHi);
  // Konveyör (sağ): eğik bant, makaralar, destek ayağı; altında raylı vagon.
  stick(c, [56, -24, 56, -42], 2.6, K.metal, 2);
  shape(c, soft([34, -66, 74, -46, 72, -40, 32, -60], 1), K.metal, { shadeOffset: [0, 1.5], line: 2.2 });
  for (const t of [0.15, 0.5, 0.85]) shape(c, circle(33 + t * 40, -63 + t * 20, 2.2), K.trim, { line: 1.2, shadeOffset: null });
  // Raylar ve vagon.
  stroke(c, line([38, 1, 86, 1]), 3.4, INK);
  stroke(c, line([38, 1, 86, 1]), 1.6, K.metalHi);
  shape(c, soft([46, -26, 82, -26, 78, -6, 50, -6], 1.5), K.metal, { shadeOffset: [2, 2] });
  shape(c, rr(45, -28, 38, 4, 1.5), K.trim, { line: 1.6, shadeOffset: [0, 1] });
  rivets(c, [52, -18, 64, -18, 76, -18], 1.1);
  wheel(c, 55, -4, 5, K.metal, K.trim, 4);
  wheel(c, 73, -4, 5, K.metal, K.trim, 4);
  // Fener kolu (cam ayrı parça: `lamp`).
  stick(c, [17, -114, 38, -114], 1.8, K.metal, 1.6);
  shape(c, rr(32, -134, 12, 4, 1.5), K.trim, { line: 1.8 });
  shape(c, soft([30, -134, 46, -134, 38, -142], 1.5), K.metal, { line: 1.8, shadeOffset: null });
  // Yuva: demir gösterge kutusu, pirinç çerçeve, krem kadran.
  shape(c, circle(I_SOCKET.x, I_SOCKET.y, 20), K.metal, { shadeOffset: [2, 2], line: 2.6 });
  shape(c, circle(I_SOCKET.x, I_SOCKET.y, 16.5), K.trim, { shadeOffset: [1.5, 1.5], line: 2 });
  shape(c, circle(I_SOCKET.x, I_SOCKET.y, 13.5), DIAL, { shadeOffset: [-1.5, -1.5], line: 1.6 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    detail(c, line([Math.cos(a) * 11, I_SOCKET.y + Math.sin(a) * 11, Math.cos(a) * 13, I_SOCKET.y + Math.sin(a) * 13]), INK, 1.1);
  }
  neutralMark(c, I_SOCKET.x, I_SOCKET.y, INK);
}

/** Fener camı + demir kafes; açık tonda çizilir, sahibin rengine boyanır. */
function industrialLampDraw(c: Ctx): void {
  const glass = soft([32, -116, 44, -116, 45, -130, 31, -130], 2);
  shape(c, glass, { base: 0xffffff, shade: 0xd9d9d9 }, { shadeOffset: [-2, 0], line: 2.2 });
  shape(c, soft([35, -119, 39, -119, 39, -127, 35, -127], 1), 0xffffff, { line: 0 });
  for (const x of [35, 41]) stroke(c, line([x, -116, x, -130]), 1.4, INK);
  shape(c, rr(31, -116, 14, 3, 1), 0xb9b2a2, { line: 1.6 });
}

// ---- Gelecek: altıgen platform, matkap, iki yayıcı direk, süzülen altın kristal + parlayan çekirdek ----

const HULL: Tone = { base: 0x3d4870, shade: 0x2a3354 };
const F_SOCKET = { x: 0, y: -98 } as const;

function futureDraw(c: Ctx): void {
  const K = AGE_KIT[5];
  groundShadow(c, 68);
  // Yayıcı direkler (kristali kucaklayan iki kavisli kol).
  for (const s of [-1, 1]) {
    const arm: PathFn = (p) => {
      p.moveTo(s * 26, -18);
      p.quadraticCurveTo(s * 50, -78, s * 34, -146);
      p.lineTo(s * 26, -144);
      p.quadraticCurveTo(s * 38, -80, s * 16, -18);
      p.closePath();
    };
    shape(c, arm, HULL, { shadeOffset: [s * 2, 0], line: 2.6 });
    stroke(c, (p) => {
      p.moveTo(s * 24, -26);
      p.quadraticCurveTo(s * 42, -80, s * 30, -138);
    }, 1.4, K.band.base);
    // Yayıcı uç: eflatun göz.
    shape(c, circle(s * 31, -146, 5), K.metal, { line: 2, shadeOffset: [1, 1] });
    shape(c, circle(s * 31, -146, 2.4), K.glow, { line: 0 });
  }
  // Huzme: matkaptan kristale soluk eflatun.
  const beam = c.createLinearGradient(0, -34, 0, -70);
  beam.addColorStop(0, 'rgba(233,184,255,0.6)');
  beam.addColorStop(1, 'rgba(233,184,255,0)');
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(-10, -34);
  c.lineTo(10, -34);
  c.lineTo(5, -70);
  c.lineTo(-5, -70);
  c.closePath();
  c.fill();
  // Platform: alaşım gövde, eflatun şerit, üst levha.
  shape(c, soft([-60, 1, 60, 1, 52, -18, -52, -18], 3), HULL, { shadeOffset: [2.5, 2.5] });
  shape(c, rr(-46, -10, 92, 4, 1.5), K.band, { line: 1.6 });
  stroke(c, line([-42, -8.5, 42, -8.5]), 1, GLOW_CORE);
  for (const x of [-52, 52]) shape(c, circle(x, -6, 2.4), K.glow, { line: 1.2, shadeOffset: null });
  // Matkap gövdesi: altıgen boyun + sarmal uç (yukarıdan aşağı yere iner).
  shape(c, soft([-14, -18, 14, -18, 10, -30, -10, -30], 1.5), K.metal, { shadeOffset: [1.5, 1.5], line: 2.2 });
  shape(c, ellipse(0, -31, 11, 3.2), K.trim, { line: 1.8, shadeOffset: null });
  shape(c, ellipse(0, -31, 5, 1.4), K.glow, { line: 0 });
}

function futureFloatDraw(c: Ctx): void {
  const K = AGE_KIT[5];
  // Uzun altın kristal: sol açık yüz, sağ gölge yüz, yüzey çizgileri.
  const crystal = soft([0, -180, 24, -108, 0, -46, -24, -108], 1.5);
  shape(c, crystal, GOLD, { shadePath: soft([0, -180, 24, -108, 0, -46, 5, -108], 1) });
  detail(c, line([-24, -108, 5, -108, 24, -108]), GOLD.shade, 1.3);
  detail(c, line([0, -178, 5, -108, 0, -48]), GOLD.shade, 1.3);
  stroke(c, line([-18, -116, -3, -170]), 1.8, GOLD_HI);
  stroke(c, line([-16, -98, -4, -60]), 1.4, GOLD_HI);
  // Parlayan çekirdek (yuva): eflatun hale + açık çekirdek.
  c.save();
  c.globalAlpha = 0.6;
  shape(c, circle(F_SOCKET.x, F_SOCKET.y, 17), K.band.base, { line: 0, shadeOffset: null });
  c.restore();
  shape(c, circle(F_SOCKET.x, F_SOCKET.y, 13.5), K.glow, { shadeOffset: [-1.5, -1.5], line: 2.2 });
  shape(c, circle(F_SOCKET.x - 3, F_SOCKET.y - 3, 3.5), GLOW_CORE, { line: 0 });
  neutralMark(c, F_SOCKET.x, F_SOCKET.y, K.band.shade);
  // Yanda süzülen küçük altın kırıklar.
  shape(c, soft([-46, -122, -41, -112, -46, -102, -51, -112], 1), GOLD, { shadeOffset: [1.5, 0], line: 2 });
  shape(c, soft([44, -70, 48, -62, 44, -54, 40, -62], 1), GOLD, { shadeOffset: [1.5, 0], line: 2 });
  glint(c, 12, -150, 4.5);
}

const BOB_NONE = { amp: 0, periodMs: 1 } as const;

export const STONE_VARIANTS: Readonly<Record<ArtAge, StoneVariant>> = {
  1: {
    socket: P_SOCKET,
    top: -108,
    body: { x0: -54, y0: -110, x1: 58, y1: 9, draw: primitiveDraw },
    store: { x: -46, y: 3, scale: 0.95, style: 'ore' },
    bob: BOB_NONE,
    aura: { scale: 2.4, alpha: 0.32 },
  },
  2: {
    socket: A_SOCKET,
    top: -128,
    body: { x0: -62, y0: -130, x1: 66, y1: 9, draw: ancientDraw },
    store: { x: 48, y: -30, scale: 0.78, style: 'nugget' },
    bob: BOB_NONE,
    aura: { scale: 2.55, alpha: 0.35 },
  },
  3: {
    socket: M_SOCKET,
    top: -156,
    body: { x0: -70, y0: -158, x1: 68, y1: 9, draw: medievalDraw },
    store: { x: 50, y: -26, scale: 0.82, style: 'nugget' },
    bob: BOB_NONE,
    aura: { scale: 2.7, alpha: 0.38 },
  },
  4: {
    socket: I_SOCKET,
    top: -176,
    body: { x0: -78, y0: -178, x1: 88, y1: 9, draw: industrialDraw },
    lamp: { x0: 29, y0: -132, x1: 47, y1: -112, draw: industrialLampDraw },
    store: { x: 64, y: -28, scale: 0.9, style: 'nugget' },
    bob: BOB_NONE,
    aura: { scale: 2.85, alpha: 0.41 },
  },
  5: {
    socket: F_SOCKET,
    top: -185,
    body: { x0: -64, y0: -154, x1: 64, y1: 9, draw: futureDraw },
    float: { x0: -54, y0: -182, x1: 52, y1: -44, draw: futureFloatDraw },
    store: { x: 42, y: -18, scale: 0.92, style: 'crystal' },
    bob: { amp: 3, periodMs: 3200 },
    aura: { scale: 3, alpha: 0.44 },
  },
};

/** Fenerin tarafsız tonu (sönük cam) ve sahip tonu TEAM'den gelir. */
export const LAMP_NEUTRAL_TINT = 0xb9b2a2;
