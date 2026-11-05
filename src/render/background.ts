import { Container, Graphics } from 'pixi.js';
import type { ArtAge } from '../art/palette';
import { WORLD } from '../data/world';
import { GROUND_BOTTOM_Y, GROUND_TOP_Y, SCENE_HEIGHT, UNIT_FEET_Y } from './constants';
import { BACKGROUND_FADE_MS, crossfadeAlpha } from './fxMath';

/**
 * Çağ arka planları (GDD §14 "Çağ kimlikleri"): İlkel kayalık vadi; Antik zeytinlik ve tapınak siluetleri;
 * Orta ormanlı tepeler ve uzak kale; Endüstri fabrika silueti ve is; Gelecek gece gökyüzü ve ışık şeritleri.
 * Kesik kâğıt katmanları; kontursuz ve birliklerden daha az doygun ki birlikler öne çıksın. Zemin şeridi ve
 * yürüme yolu her çağda aynı yerdedir (okunurluk). Her çağın arka planı ilk gerektiğinde bir kez çizilir.
 */

const W = WORLD.worldWidth;
const PATH_TOP = UNIT_FEET_Y - 34;
const PATH_BOTTOM = UNIT_FEET_Y + 26;

/** Sabit sözde rastgele (görsel yerleşim kararlı kalsın). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rand = () => number;

function skyBands(g: Graphics, bands: ReadonlyArray<readonly [number, number]>, bottom: number): void {
  for (let i = 0; i < bands.length; i++) {
    const [y, color] = bands[i]!;
    const next = bands[i + 1]?.[0] ?? bottom;
    g.rect(0, y, W, next - y + 1).fill(color);
  }
}

function cloud(g: Graphics, x: number, y: number, s: number, color: number, shade: number, alpha = 1): void {
  g.ellipse(x, y + 8 * s, 70 * s, 14 * s).fill({ color: shade, alpha });
  g.circle(x - 34 * s, y, 22 * s).fill({ color, alpha });
  g.circle(x, y - 12 * s, 30 * s).fill({ color, alpha });
  g.circle(x + 36 * s, y - 2 * s, 22 * s).fill({ color, alpha });
  g.roundRect(x - 64 * s, y - 4 * s, 128 * s, 16 * s, 8 * s).fill({ color, alpha });
}

/** Dalgalı sırt çizgisi (alt kenar `bottom`). */
function ridge(g: Graphics, base: number, amp1: number, f1: number, amp2: number, f2: number, color: number, bottom = 620, step = 40): void {
  const pts: number[] = [0, bottom];
  for (let x = 0; x <= W + step; x += step) pts.push(Math.min(x, W), base + Math.sin(x / f1) * amp1 + Math.sin(x / f2 + 1.3) * amp2);
  pts.push(W, bottom);
  g.poly(pts).fill(color);
}

interface GroundStyle {
  earth: number;
  collar: number;
  collarEdge: number;
  path: number;
  pathEdge: number;
  pebble: number;
  foreground: number;
  foregroundTop: number;
  blades: number;
  /** Çim yakası tırtıkları (false: düz kenar, ör. metal güverte). */
  tufts: boolean;
}

/** Zemin şeridi: yaka, toprak, yürüme yolu ve ön plan (alt panelin arkası). */
function ground(g: Graphics, st: GroundStyle, rand: Rand, path?: (g: Graphics, rand: Rand) => void): void {
  g.rect(0, GROUND_TOP_Y, W, GROUND_BOTTOM_Y - GROUND_TOP_Y).fill(st.earth);
  g.rect(0, GROUND_TOP_Y, W, 20).fill(st.collar);
  if (st.tufts) {
    for (let x = 0; x < W; x += 16) {
      const h = 6 + rand() * 7;
      g.poly([x, GROUND_TOP_Y + 20, x + 8, GROUND_TOP_Y + 20, x + 4 + rand() * 4, GROUND_TOP_Y + 20 + h]).fill(st.collar);
    }
  }
  g.rect(0, GROUND_TOP_Y + 1, W, 3).fill(st.collarEdge);
  g.rect(0, PATH_TOP, W, PATH_BOTTOM - PATH_TOP).fill(st.path);
  g.rect(0, PATH_TOP, W, 3).fill(st.pathEdge);
  g.rect(0, PATH_BOTTOM - 3, W, 3).fill(st.pathEdge);
  path?.(g, rand);
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const y = GROUND_TOP_Y + 32 + rand() * (GROUND_BOTTOM_Y - GROUND_TOP_Y - 44);
    if (y > PATH_TOP - 4 && y < PATH_BOTTOM + 4) continue;
    g.ellipse(x, y, 3 + rand() * 4, 2 + rand() * 2).fill(st.pebble);
  }
  g.rect(0, GROUND_BOTTOM_Y, W, SCENE_HEIGHT - GROUND_BOTTOM_Y).fill(st.foreground);
  const fg: number[] = [0, GROUND_BOTTOM_Y + 30];
  for (let x = 0; x <= W; x += 48) fg.push(x, GROUND_BOTTOM_Y - 6 + Math.sin(x / 90) * 6 + rand() * 6);
  fg.push(W, GROUND_BOTTOM_Y + 30);
  g.poly(fg).fill(st.foregroundTop);
  for (let i = 0; i < 70; i++) {
    const x = rand() * W;
    const y = GROUND_BOTTOM_Y + 2 + rand() * 20;
    const h = 10 + rand() * 16;
    g.poly([x - 3, y, x + 3, y, x + (rand() - 0.5) * 10, y - h]).fill(st.blades);
  }
}

// =====================================================================
// İlkel: kayalık vadi, ateş dumanları
// =====================================================================

const P = {
  sun: 0xfff0c2,
  cloud: 0xfbf5e8,
  cloudShade: 0xe6e3dc,
  mesaFar: 0xd9b996,
  mesaFarShade: 0xc8a57f,
  mesaNear: 0xc0946a,
  mesaNearShade: 0xa87d55,
  smoke: 0xd8d0c4,
  hills: 0x93ad6b,
  hillsShade: 0x7f9a5c,
  tree: 0x5f7f4a,
  treeShade: 0x4d6a3c,
  trunk: 0x6e5236,
  boulder: 0xa99f8d,
  boulderShade: 0x8d8473,
} as const;

function smokeColumn(g: Graphics, x: number, baseY: number, rand: Rand, color: number, rise = 230, alpha = 0.5): void {
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const r = 10 + k * 26;
    const drift = Math.sin(k * 3.2) * 24 + k * 50;
    g.circle(x + drift, baseY - k * rise, r).fill({ color, alpha: alpha * (1 - k * 0.75) });
    if (rand() > 0.5) g.circle(x + drift + r * 0.6, baseY - k * rise + 6, r * 0.6).fill({ color, alpha: alpha * 0.7 * (1 - k) });
  }
}

function conifer(g: Graphics, x: number, baseY: number, h: number, tree: number, shade: number, trunk: number): void {
  g.rect(x - 3, baseY - h * 0.25, 6, h * 0.25).fill(trunk);
  for (let i = 0; i < 3; i++) {
    const y = baseY - h * 0.2 - i * h * 0.24;
    const w = h * (0.34 - i * 0.08);
    g.poly([x - w, y, x + w, y, x, y - h * 0.42]).fill(tree);
    g.poly([x, y, x + w, y, x, y - h * 0.42]).fill(shade);
  }
}

function drawPrimitive(g: Graphics): void {
  const rand = seeded(1729);
  skyBands(
    g,
    [
      [0, 0x8ccbe4],
      [130, 0xa3d5e5],
      [230, 0xbcdfe0],
      [310, 0xd3e5d2],
      [380, 0xe9e4c2],
      [440, 0xf4dfb3],
    ],
    GROUND_TOP_Y,
  );
  g.circle(1470, 215, 74).fill({ color: P.sun, alpha: 0.35 });
  g.circle(1470, 215, 52).fill(P.sun);
  cloud(g, 330, 170, 1, P.cloud, P.cloudShade);
  cloud(g, 980, 120, 0.8, P.cloud, P.cloudShade);
  cloud(g, 1720, 250, 0.7, P.cloud, P.cloudShade);

  // Uzak mesalar (vadi duvarları), iki kat.
  g.poly([0, 620, 0, 372, 130, 366, 160, 396, 320, 392, 352, 338, 560, 332, 592, 388, 730, 396, 770, 430, 1140, 432, 1180, 388, 1330, 380, 1362, 330, 1600, 326, 1632, 372, 1780, 376, 1808, 350, W, 346, W, 620]).fill(P.mesaFar);
  g.poly([0, 620, 0, 420, 150, 420, 330, 424, 560, 410, 760, 448, 1140, 452, 1360, 414, 1600, 404, 1800, 412, W, 400, W, 620]).fill(P.mesaFarShade);
  smokeColumn(g, 610, 470, rand, P.smoke);
  smokeColumn(g, 1290, 480, rand, P.smoke);
  g.poly([0, 620, 0, 470, 90, 462, 120, 488, 260, 484, 300, 446, 470, 440, 500, 478, 880, 486, 920, 458, 1040, 452, 1080, 490, 1420, 494, 1450, 456, 1620, 450, 1660, 486, W, 480, W, 620]).fill(P.mesaNear);
  g.poly([0, 620, 0, 508, 300, 500, 500, 512, 900, 520, 1080, 514, 1450, 522, 1700, 512, W, 516, W, 620]).fill(P.mesaNearShade);

  // Yosun yeşili tepeler + ağaçlar + kayalar.
  ridge(g, 548, 14, 170, 6, 61, P.hills, 620, 60);
  g.rect(0, 585, W, 40).fill(P.hillsShade);
  for (let i = 0; i < 26; i++) {
    const x = 40 + i * 74 + rand() * 40;
    conifer(g, x, 560 + Math.sin(x / 170) * 12 + 10, 40 + rand() * 34, P.tree, P.treeShade, P.trunk);
  }
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 210 + rand() * 80;
    g.ellipse(x, 592, 26 + rand() * 14, 16).fill(P.boulder);
    g.ellipse(x + 6, 598, 20, 9).fill(P.boulderShade);
  }
  ground(
    g,
    {
      earth: 0xd2ab72,
      collar: 0x88a858,
      collarEdge: 0x6c8a43,
      path: 0xc49b63,
      pathEdge: 0xb88f58,
      pebble: 0xa48660,
      foreground: 0x9a7246,
      foregroundTop: 0x86623b,
      blades: 0x5d7a3b,
      tufts: true,
    },
    rand,
  );
}

// =====================================================================
// Antik: zeytinlikler, tapınak siluetleri
// =====================================================================

const A = {
  mountain: 0xbdb3c6,
  mountainShade: 0xa99fb6,
  hill: 0xd4c49a,
  hillShade: 0xc2b083,
  temple: 0xeee2c6,
  templeShade: 0xd3c3a0,
  roof: 0xd49a76,
  cypress: 0x5f7448,
  cypressShade: 0x4c5f3a,
  grove: 0xb3b277,
  groveShade: 0x9e9d63,
  olive: 0x8d9c6a,
  oliveLight: 0xa6b383,
  oliveShade: 0x76855a,
  trunk: 0x7a5d44,
} as const;

/** Tapınak silueti: basamaklar, sütunlar, arşitrav, alınlık. (x, y) taban ortası. */
function temple(g: Graphics, x: number, y: number, s: number, cols: number): void {
  const w = 22 * s * cols;
  g.rect(x - w / 2 - 10 * s, y - 8 * s, w + 20 * s, 8 * s).fill(A.templeShade);
  g.rect(x - w / 2 - 5 * s, y - 15 * s, w + 10 * s, 7 * s).fill(A.temple);
  const colH = 62 * s;
  for (let i = 0; i < cols; i++) {
    const cx = x - w / 2 + 11 * s + i * 22 * s;
    g.rect(cx - 5 * s, y - 15 * s - colH, 10 * s, colH).fill(A.temple);
    g.rect(cx + 1.5 * s, y - 15 * s - colH, 3.5 * s, colH).fill(A.templeShade);
  }
  const top = y - 15 * s - colH;
  g.rect(x - w / 2 - 4 * s, top - 12 * s, w + 8 * s, 12 * s).fill(A.temple);
  g.rect(x - w / 2 - 4 * s, top - 4 * s, w + 8 * s, 4 * s).fill(A.templeShade);
  g.poly([x - w / 2 - 8 * s, top - 12 * s, x + w / 2 + 8 * s, top - 12 * s, x, top - 40 * s]).fill(A.roof);
  g.poly([x - w / 2 + 6 * s, top - 15 * s, x + w / 2 - 6 * s, top - 15 * s, x, top - 33 * s]).fill(A.temple);
}

function cypress(g: Graphics, x: number, baseY: number, h: number): void {
  g.ellipse(x, baseY - h / 2, h * 0.13, h / 2).fill(A.cypress);
  g.ellipse(x + h * 0.04, baseY - h / 2 + 2, h * 0.07, h / 2 - 3).fill(A.cypressShade);
}

function oliveTree(g: Graphics, x: number, baseY: number, s: number, rand: Rand): void {
  // Burgulu gövde + yassı, gümüşi yeşil taç kümeleri.
  g.poly([x - 4 * s, baseY, x + 4 * s, baseY, x + 2 * s, baseY - 10 * s, x + 6 * s, baseY - 20 * s, x + 1 * s, baseY - 20 * s, x - 2 * s, baseY - 12 * s]).fill(A.trunk);
  const blobs: Array<[number, number, number]> = [
    [-12, -26, 11],
    [0, -32, 13],
    [13, -27, 11],
    [-4, -22, 10],
    [8, -21, 9],
  ];
  for (const [dx, dy, r] of blobs) g.ellipse(x + dx * s, baseY + dy * s, r * s * 1.15, r * s * 0.85).fill(A.olive);
  for (const [dx, dy, r] of blobs) if (rand() > 0.35) g.ellipse(x + (dx - 2) * s, baseY + (dy - 3) * s, r * s * 0.6, r * s * 0.4).fill(A.oliveLight);
  g.ellipse(x + 4 * s, baseY - 19 * s, 14 * s, 4 * s).fill(A.oliveShade);
}

function drawAncient(g: Graphics): void {
  const rand = seeded(2718);
  skyBands(
    g,
    [
      [0, 0x93c4e0],
      [140, 0xaed0e2],
      [240, 0xc8dbdc],
      [320, 0xe2e1c8],
      [390, 0xf3dfb4],
      [450, 0xf7d6a2],
    ],
    GROUND_TOP_Y,
  );
  g.circle(560, 230, 86).fill({ color: 0xfff1c4, alpha: 0.3 });
  g.circle(560, 230, 58).fill(0xfff1c4);
  cloud(g, 1180, 150, 0.9, 0xfdf6e6, 0xebe2cf);
  cloud(g, 1740, 230, 0.6, 0xfdf6e6, 0xebe2cf);
  cloud(g, 230, 120, 0.7, 0xfdf6e6, 0xebe2cf);

  // Uzak dağlar (lavanta pusu).
  g.poly([0, 620, 0, 400, 180, 330, 300, 372, 470, 300, 640, 380, 800, 350, 980, 410, 1150, 330, 1330, 290, 1520, 360, 1700, 320, W, 390, W, 620]).fill(A.mountain);
  g.poly([0, 620, 0, 440, 260, 420, 520, 440, 800, 420, 1100, 446, 1400, 420, 1700, 432, W, 424, W, 620]).fill(A.mountainShade);

  // Tapınak tepeleri.
  g.poly([1000, 620, 1120, 470, 1210, 446, 1460, 444, 1560, 470, 1700, 620]).fill(A.hill);
  g.poly([1000, 620, 1120, 486, 1560, 486, 1700, 620]).fill(A.hillShade);
  temple(g, 1335, 448, 0.95, 8);
  g.poly([160, 620, 280, 500, 360, 488, 520, 492, 620, 620]).fill(A.hill);
  temple(g, 420, 492, 0.55, 5);
  for (const [x, y, h] of [
    [1080, 520, 70],
    [1112, 506, 82],
    [1585, 520, 74],
    [1612, 532, 62],
    [250, 530, 60],
    [585, 540, 58],
    [770, 548, 66],
    [1830, 548, 70],
  ] as const) {
    cypress(g, x, y + h * 0.1, h);
  }

  // Zeytinlik tepeleri: sıra sıra zeytin ağaçları.
  ridge(g, 552, 10, 210, 5, 77, A.grove, 620, 50);
  g.rect(0, 588, W, 34).fill(A.groveShade);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 17; i++) {
      const x = 30 + i * 118 + row * 58 + rand() * 24;
      const y = 572 + row * 20 + Math.sin(x / 210) * 8;
      oliveTree(g, x, y, row === 0 ? 0.8 : 1, rand);
    }
  }
  ground(
    g,
    {
      earth: 0xdaa676,
      collar: 0xb7ae66,
      collarEdge: 0x9b9350,
      path: 0xe3d2ad,
      pathEdge: 0xc8b28a,
      pebble: 0xb98a5c,
      foreground: 0xa4683f,
      foregroundTop: 0x8f5a36,
      blades: 0x8b8a46,
      tufts: true,
    },
    rand,
    (gg, r) => {
      // Döşeme taşları: iki sıra kayık ek yeri.
      const mid = (PATH_TOP + PATH_BOTTOM) / 2;
      gg.rect(0, mid - 1, W, 2).fill({ color: 0xc8b28a, alpha: 0.7 });
      for (let x = 0; x < W; x += 46) {
        const o = (x / 46) % 2 === 0 ? 0 : 23;
        gg.rect(x + o, PATH_TOP + 4, 2, mid - PATH_TOP - 5).fill({ color: 0xc8b28a, alpha: 0.7 });
        gg.rect(x + 23 - o, mid + 1, 2, PATH_BOTTOM - mid - 5).fill({ color: 0xc8b28a, alpha: 0.7 });
        if (r() > 0.7) gg.rect(x + o + 6, PATH_TOP + 8, 14, 4).fill({ color: 0xefe2c4, alpha: 0.7 });
      }
    },
  );
}

// =====================================================================
// Orta: ormanlı tepeler, uzakta kale
// =====================================================================

const M = {
  far: 0xa2b6c0,
  farShade: 0x93a7b3,
  castle: 0x9aa1ab,
  castleShade: 0x858d99,
  roof: 0x5d6890,
  banner: 0xb8574a,
  forestFar: 0x7c9a72,
  forestMid: 0x5f8552,
  forestMidLight: 0x6f9660,
  forestNear: 0x83ab5d,
  forestNearShade: 0x739a50,
  trunk: 0x5e4630,
} as const;

function castle(g: Graphics, x: number, y: number, s: number): void {
  const merl = (x0: number, x1: number, top: number): void => {
    for (let xx = x0; xx < x1 - 4 * s; xx += 10 * s) g.rect(xx, top - 6 * s, 6 * s, 6 * s).fill(M.castle);
  };
  // Sur.
  g.rect(x - 110 * s, y - 50 * s, 220 * s, 50 * s).fill(M.castle);
  g.rect(x - 110 * s, y - 14 * s, 220 * s, 14 * s).fill(M.castleShade);
  merl(x - 110 * s, x + 110 * s, y - 50 * s);
  // Kuleler (yuvarlak, konik çatılı) ve kale burcu.
  const towers: Array<[number, number, number]> = [
    [-112, 90, 18],
    [112, 90, 18],
    [-40, 120, 22],
    [36, 150, 26],
  ];
  for (const [dx, h, r] of towers) {
    const tx = x + dx * s;
    g.rect(tx - r * s, y - h * s, r * 2 * s, h * s).fill(M.castle);
    g.rect(tx + r * 0.35 * s, y - h * s, r * 0.65 * s, h * s).fill(M.castleShade);
    g.poly([tx - (r + 5) * s, y - h * s, tx + (r + 5) * s, y - h * s, tx, y - (h + r * 2.2) * s]).fill(M.roof);
    g.rect(tx - 1 * s, y - (h + r * 2.2 + 18) * s, 2 * s, 18 * s).fill(M.castleShade);
    g.poly([tx + 1 * s, y - (h + r * 2.2 + 18) * s, tx + 16 * s, y - (h + r * 2.2 + 13) * s, tx + 1 * s, y - (h + r * 2.2 + 8) * s]).fill(M.banner);
    g.rect(tx - 2 * s, y - (h - 22) * s, 4 * s, 9 * s).fill(M.castleShade);
  }
  g.rect(x - 9 * s, y - 26 * s, 18 * s, 26 * s).fill(0x6d7480);
}

/** Yaprak döken ağaç kümesi (yuvarlak taçlar). */
function treeClump(g: Graphics, x: number, baseY: number, s: number, color: number, light: number, rand: Rand): void {
  g.rect(x - 2.5 * s, baseY - 14 * s, 5 * s, 14 * s).fill(M.trunk);
  g.circle(x - 9 * s, baseY - 20 * s, 12 * s).fill(color);
  g.circle(x + 9 * s, baseY - 22 * s, 13 * s).fill(color);
  g.circle(x, baseY - 33 * s, 15 * s).fill(color);
  if (rand() > 0.3) g.circle(x - 4 * s, baseY - 38 * s, 7 * s).fill(light);
}

function drawMedieval(g: Graphics): void {
  const rand = seeded(1066);
  skyBands(
    g,
    [
      [0, 0x7fb3dc],
      [140, 0x98c3e2],
      [250, 0xb5d3e5],
      [340, 0xcfe0e3],
      [420, 0xe1e8dc],
    ],
    GROUND_TOP_Y,
  );
  cloud(g, 420, 150, 1.1, 0xfbfcfb, 0xdfe5ea);
  cloud(g, 1050, 210, 0.75, 0xfbfcfb, 0xdfe5ea);
  cloud(g, 1650, 120, 0.95, 0xfbfcfb, 0xdfe5ea);

  // Uzak mavi tepeler ve kale.
  ridge(g, 420, 26, 260, 12, 97, M.far, 620, 40);
  g.poly([1150, 620, 1230, 430, 1330, 404, 1480, 402, 1580, 430, 1660, 620]).fill(M.farShade);
  castle(g, 1405, 412, 0.9);
  // Uzak orman şeridi.
  ridge(g, 478, 12, 140, 6, 47, M.forestFar, 620, 30);
  for (let x = 0; x < W; x += 26) g.circle(x + rand() * 12, 478 + Math.sin(x / 140) * 12 - 4, 14 + rand() * 6).fill(M.forestFar);
  // Orta orman: yuvarlak taçlar ve köknarlar.
  ridge(g, 528, 14, 180, 8, 67, M.forestMid, 620, 30);
  for (let i = 0; i < 40; i++) {
    const x = rand() * W;
    const y = 540 + Math.sin(x / 180) * 12;
    if (rand() > 0.55) conifer(g, x, y + 8, 46 + rand() * 24, M.forestMid, 0x527446, M.trunk);
    else treeClump(g, x, y + 8, 0.9 + rand() * 0.4, M.forestMid, M.forestMidLight, rand);
  }
  // Yakın tepe.
  ridge(g, 574, 9, 230, 5, 83, M.forestNear, 620, 40);
  g.rect(0, 594, W, 26).fill(M.forestNearShade);
  for (let i = 0; i < 14; i++) {
    const x = 60 + i * 140 + rand() * 60;
    treeClump(g, x, 596, 1.2, 0x6b9450, 0x7fa862, rand);
  }
  ground(
    g,
    {
      earth: 0x9cb664,
      collar: 0x7fa556,
      collarEdge: 0x668a42,
      path: 0xb99062,
      pathEdge: 0xa47d52,
      pebble: 0x7f9a50,
      foreground: 0x5d7b3c,
      foregroundTop: 0x4f6c32,
      blades: 0x3f5a28,
      tufts: true,
    },
    rand,
    (gg) => {
      // Tekerlek izleri.
      for (const y of [PATH_TOP + 16, PATH_BOTTOM - 16]) gg.rect(0, y, W, 3).fill({ color: 0x9a7650, alpha: 0.75 });
    },
  );
}

// =====================================================================
// Endüstri: fabrika silueti, is
// =====================================================================

const I = {
  far: 0x9c8f86,
  mid: 0x7f6f66,
  midShade: 0x6d5f57,
  window: 0xf0c56e,
  near: 0x6c6056,
  smoke: 0x8a8079,
  smokeLight: 0xb3aaa1,
  pole: 0x4f4540,
} as const;

function factory(g: Graphics, x: number, base: number, w: number, h: number, teeth: number, color: number, shade: number, lit: number, rand: Rand): void {
  g.rect(x, base - h, w, h).fill(color);
  const tw = w / teeth;
  for (let i = 0; i < teeth; i++) {
    const x0 = x + i * tw;
    g.poly([x0, base - h, x0 + tw * 0.75, base - h - tw * 0.55, x0 + tw * 0.75, base - h, x0 + tw, base - h]).fill(color);
    g.poly([x0 + tw * 0.75, base - h - tw * 0.55, x0 + tw, base - h, x0 + tw * 0.75, base - h]).fill(shade);
  }
  for (let wy = base - h + 14; wy < base - 12; wy += 22) {
    for (let wx = x + 8; wx < x + w - 14; wx += 20) {
      if (rand() < lit) g.rect(wx, wy, 9, 11).fill({ color: I.window, alpha: 0.75 });
      else g.rect(wx, wy, 9, 11).fill(shade);
    }
  }
}

function chimney(g: Graphics, x: number, base: number, h: number, w: number, color: number, rand: Rand, smoke: boolean): void {
  g.poly([x - w / 2, base, x + w / 2, base, x + w * 0.38, base - h, x - w * 0.38, base - h]).fill(color);
  g.rect(x - w * 0.48, base - h - 6, w * 0.96, 7).fill(color);
  if (!smoke) return;
  // Is bulutu: rüzgârla sağa yatan, kararan sütun.
  for (let i = 0; i < 10; i++) {
    const k = i / 9;
    const r = 9 + k * 34;
    g.circle(x + k * 150 + Math.sin(k * 4) * 12, base - h - 10 - k * 170, r).fill({ color: k < 0.5 ? I.smoke : I.smokeLight, alpha: 0.6 * (1 - k * 0.7) });
    if (rand() > 0.4) g.circle(x + k * 150 + r * 0.7, base - h - k * 170, r * 0.6).fill({ color: I.smoke, alpha: 0.4 * (1 - k) });
  }
}

function gasHolder(g: Graphics, x: number, base: number, r: number, h: number, color: number): void {
  g.rect(x - r, base - h, r * 2, h).fill(color);
  g.ellipse(x, base - h, r, r * 0.25).fill(color);
  for (let i = 0; i <= 4; i++) g.rect(x - r + (i * r * 2) / 4 - 1.5, base - h - 8, 3, h + 8).fill(I.midShade);
  g.rect(x - r, base - h * 0.5, r * 2, 3).fill(I.midShade);
}

function drawIndustrial(g: Graphics): void {
  const rand = seeded(1851);
  skyBands(
    g,
    [
      [0, 0x9fa3a6],
      [120, 0xb2afa7],
      [220, 0xc6bca6],
      [310, 0xd6c4a0],
      [390, 0xe0c391],
      [450, 0xe6bd83],
    ],
    GROUND_TOP_Y,
  );
  g.circle(1520, 300, 70).fill({ color: 0xf6c27c, alpha: 0.35 });
  g.circle(1520, 300, 46).fill(0xf2b36a);
  // Is bantları.
  for (const [y, a] of [
    [150, 0.25],
    [260, 0.2],
    [360, 0.18],
  ] as const) {
    for (let x = -100; x < W + 100; x += 260) g.ellipse(x + rand() * 80, y + rand() * 30, 220, 26).fill({ color: 0x8c847c, alpha: a });
  }

  // Uzak fabrika silueti.
  const farBase = 520;
  g.rect(0, farBase - 30, W, 130).fill(I.far);
  for (let x = -20; x < W; x += 140 + rand() * 60) {
    const h = 50 + rand() * 70;
    g.rect(x, farBase - h, 90 + rand() * 50, h).fill(I.far);
    if (rand() > 0.45) chimney(g, x + 30, farBase - h, 60 + rand() * 50, 14, I.far, rand, false);
  }
  gasHolder(g, 760, farBase, 46, 70, I.far);
  gasHolder(g, 1660, farBase, 38, 56, I.far);

  // Orta: tuğla fabrikalar, bacalar, is sütunları.
  const midBase = 584;
  factory(g, 120, midBase, 260, 70, 6, I.mid, I.midShade, 0.35, rand);
  chimney(g, 330, midBase - 70, 120, 22, I.mid, rand, true);
  factory(g, 600, midBase, 200, 56, 4, I.mid, I.midShade, 0.3, rand);
  factory(g, 980, midBase, 300, 82, 7, I.mid, I.midShade, 0.4, rand);
  chimney(g, 1040, midBase - 82, 150, 26, I.mid, rand, true);
  chimney(g, 1200, midBase - 82, 110, 20, I.mid, rand, true);
  factory(g, 1480, midBase, 240, 64, 5, I.mid, I.midShade, 0.35, rand);
  chimney(g, 1690, midBase - 64, 130, 22, I.mid, rand, true);
  // Su kulesi.
  g.rect(1830, midBase - 80, 4, 80).fill(I.midShade);
  g.rect(1866, midBase - 80, 4, 80).fill(I.midShade);
  g.roundRect(1820, midBase - 120, 60, 44, 6).fill(I.mid);
  g.poly([1816, midBase - 120, 1884, midBase - 120, 1850, midBase - 140]).fill(I.midShade);

  // Yakın: cüruf tepeleri, telgraf direkleri ve teller.
  ridge(g, 590, 8, 160, 4, 51, I.near, 620, 40);
  for (let x = 80; x < W; x += 240) {
    g.rect(x, 520, 4, 80).fill(I.pole);
    g.rect(x - 12, 528, 28, 4).fill(I.pole);
    if (x + 240 < W) {
      for (const dy of [0, 8]) {
        g.moveTo(x + 2, 528 + dy);
        for (let k = 1; k <= 12; k++) {
          const t = k / 12;
          g.lineTo(x + 2 + t * 240, 528 + dy + Math.sin(t * Math.PI) * 14);
        }
        g.stroke({ width: 1.5, color: I.pole, alpha: 0.7 });
      }
    }
  }
  ground(
    g,
    {
      earth: 0xa69176,
      collar: 0x8c8460,
      collarEdge: 0x6e6a4c,
      path: 0xa39b8f,
      pathEdge: 0x857d72,
      pebble: 0x6f665d,
      foreground: 0x5a4c44,
      foregroundTop: 0x4b3f39,
      blades: 0x3e3530,
      tufts: true,
    },
    rand,
    (gg, r) => {
      // Arnavut kaldırımı + yolun arkasında demiryolu.
      for (let y = PATH_TOP + 7; y < PATH_BOTTOM - 4; y += 11) {
        const o = ((y - PATH_TOP) / 11) % 2 === 0 ? 0 : 9;
        for (let x = o; x < W; x += 18) gg.roundRect(x + 2, y, 13 + r() * 2, 8, 3).fill({ color: 0x8f877c, alpha: 0.8 });
      }
      const railY = GROUND_TOP_Y + 46;
      for (let x = 0; x < W; x += 22) gg.rect(x, railY - 4, 12, 16).fill(0x6b5644);
      gg.rect(0, railY - 1, W, 4).fill(0x4a4a50);
      gg.rect(0, railY + 7, W, 4).fill(0x4a4a50);
      gg.rect(0, railY - 1, W, 1.5).fill(0x9a9aa4);
      gg.rect(0, railY + 7, W, 1.5).fill(0x9a9aa4);
    },
  );
  // Ön planda kömür yığınları.
  for (let i = 0; i < 8; i++) {
    const x = 100 + i * 240 + rand() * 80;
    g.ellipse(x, GROUND_BOTTOM_Y + 22, 40, 14).fill(0x2f2b2c);
    g.ellipse(x - 8, GROUND_BOTTOM_Y + 16, 18, 7).fill(0x464044);
  }
}

// =====================================================================
// Gelecek: gece gökyüzü, ışık şeritleri
// =====================================================================

const F = {
  star: 0xf4eeff,
  planet: 0xd9d2f2,
  planetShade: 0xb3a9dc,
  ring: 0xe9b8ff,
  cityFar: 0x2e3462,
  cityMid: 0x262b54,
  cityNear: 0x1f2346,
  window: 0xe9c6ff,
  windowCool: 0xa9d8ff,
  violet: 0xd65cff,
  pink: 0xff7ac8,
  teal: 0x7fdcff,
} as const;

/** Işık şeridi: geniş soluk hale + ince parlak çizgi (yumuşak eğri). */
function lightStrip(g: Graphics, y: number, amp: number, phase: number, color: number, width: number, alpha: number): void {
  const pts: number[] = [];
  for (let x = 0; x <= W; x += 30) pts.push(x, y + Math.sin(x / 380 + phase) * amp);
  const band = (w: number): number[] => {
    const top: number[] = [];
    const bottom: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      top.push(pts[i]!, pts[i + 1]! - w / 2);
      bottom.unshift(pts[i]!, pts[i + 1]! + w / 2);
    }
    return [...top, ...bottom];
  };
  g.poly(band(width * 6)).fill({ color, alpha: alpha * 0.18 });
  g.poly(band(width * 2.4)).fill({ color, alpha: alpha * 0.35 });
  g.poly(band(width)).fill({ color: 0xffffff, alpha: alpha * 0.85 });
}

function skyline(g: Graphics, base: number, minH: number, maxH: number, color: number, rand: Rand, windows: number): void {
  for (let x = -10; x < W; ) {
    const w = 40 + rand() * 70;
    const h = minH + rand() * (maxH - minH);
    g.rect(x, base - h, w, h + 2).fill(color);
    if (rand() > 0.6) {
      g.rect(x + w / 2 - 2, base - h - 30, 4, 30).fill(color);
      g.circle(x + w / 2, base - h - 32, 3).fill({ color: F.pink, alpha: 0.9 });
    }
    if (rand() > 0.7) g.poly([x, base - h, x + w, base - h, x + w * 0.5, base - h - 24]).fill(color);
    for (let wy = base - h + 10; wy < base - 8; wy += 14) {
      for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        if (rand() < windows) g.rect(wx, wy, 5, 6).fill({ color: rand() > 0.5 ? F.window : F.windowCool, alpha: 0.55 + rand() * 0.3 });
      }
    }
    x += w + 4 + rand() * 20;
  }
}

function drawFuture(g: Graphics): void {
  const rand = seeded(2099);
  skyBands(
    g,
    [
      [0, 0x121736],
      [110, 0x171d44],
      [210, 0x1e2452],
      [300, 0x282b60],
      [380, 0x35326d],
      [440, 0x463a7a],
      [490, 0x564283],
    ],
    GROUND_TOP_Y,
  );
  for (let i = 0; i < 150; i++) {
    const y = rand() * 420;
    const r = rand() > 0.9 ? 2.2 : 1 + rand() * 0.8;
    g.circle(rand() * W, y, r).fill({ color: F.star, alpha: 0.4 + rand() * 0.6 * (1 - y / 520) });
  }
  // Halkalı gezegen.
  g.circle(1520, 170, 92).fill({ color: F.ring, alpha: 0.08 });
  g.circle(1520, 170, 62).fill(F.planet);
  g.circle(1540, 186, 56).fill(F.planetShade);
  g.circle(1508, 156, 46).fill(F.planet);
  g.ellipse(1520, 172, 118, 20).stroke({ width: 5, color: F.ring, alpha: 0.75 });
  g.ellipse(1520, 172, 104, 15).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
  g.circle(360, 120, 10).fill({ color: F.planet, alpha: 0.8 });

  skyline(g, 520, 60, 170, F.cityFar, rand, 0.22);
  lightStrip(g, 410, 18, 0.4, F.violet, 3, 0.85);
  lightStrip(g, 452, 12, 2.1, F.teal, 2, 0.55);
  skyline(g, 572, 40, 120, F.cityMid, rand, 0.3);
  lightStrip(g, 520, 10, 1.2, F.pink, 2.4, 0.7);
  // Yakın: altıgen kubbeler ve alçak yapılar.
  ridge(g, 590, 6, 200, 3, 61, F.cityNear, 620, 40);
  for (const [x, r] of [
    [260, 46],
    [880, 60],
    [1390, 40],
    [1790, 52],
  ] as const) {
    g.ellipse(x, 600, r, r * 0.8).fill(F.cityNear);
    for (let k = -2; k <= 2; k++) g.rect(x + k * r * 0.35 - 1, 600 - r * 0.75 * Math.cos((k * 0.35 * Math.PI) / 2), 2, r * 0.75).fill({ color: F.violet, alpha: 0.25 });
    g.circle(x, 600 - r * 0.8 - 4, 3).fill({ color: F.violet, alpha: 0.9 });
  }
  ground(
    g,
    {
      earth: 0x6770a0,
      collar: 0x7a85b6,
      collarEdge: 0xb070e0,
      path: 0x8f98c2,
      pathEdge: 0xc77df0,
      pebble: 0x58608c,
      foreground: 0x2c3256,
      foregroundTop: 0x363d66,
      blades: 0x4a4f86,
      tufts: false,
    },
    rand,
    (gg) => {
      // Güverte panelleri: ek yerleri ve yol kenarında ışık noktaları.
      for (let x = 0; x < W; x += 96) {
        gg.rect(x, PATH_TOP + 3, 2, PATH_BOTTOM - PATH_TOP - 6).fill({ color: 0x737caa, alpha: 0.9 });
        gg.rect(x + 46, GROUND_TOP_Y + 22, 2, PATH_TOP - GROUND_TOP_Y - 24).fill({ color: 0x5a6390, alpha: 0.8 });
        gg.rect(x + 46, PATH_BOTTOM + 2, 2, GROUND_BOTTOM_Y - PATH_BOTTOM - 4).fill({ color: 0x4c547d, alpha: 0.8 });
      }
      for (let x = 24; x < W; x += 48) {
        gg.circle(x, PATH_TOP + 1.5, 2.2).fill({ color: 0xf0d0ff, alpha: 0.9 });
        gg.circle(x, PATH_BOTTOM - 1.5, 2.2).fill({ color: 0xf0d0ff, alpha: 0.9 });
      }
    },
  );
  // Ön planda ışık noktaları.
  for (let x = 30; x < W; x += 70) g.circle(x + rand() * 30, GROUND_BOTTOM_Y + 30 + rand() * 40, 2).fill({ color: F.violet, alpha: 0.6 });
}

const PAINTERS: Record<ArtAge, (g: Graphics) => void> = {
  1: drawPrimitive,
  2: drawAncient,
  3: drawMedieval,
  4: drawIndustrial,
  5: drawFuture,
};

/** Bir çağın arka planını çizer (sabit; karede yeniden çizim yok). */
export function createAgeBackground(age: ArtAge): Container {
  const root = new Container();
  const g = new Graphics();
  PAINTERS[age](g);
  root.addChild(g);
  root.label = `background.age${age}`;
  return root;
}

/**
 * Oyuncunun çağını izleyen arka plan (GDD §14). Çağ değişince yeni arka plan eskisinin üstünde yumuşakça
 * belirir; geçiş bitince eskisi gizlenir. Her çağın çizimi ilk gerektiğinde bir kez yapılır ve saklanır.
 */
export class BackgroundView {
  readonly container = new Container();
  private readonly layers = new Map<ArtAge, Container>();
  private current: ArtAge | null = null;
  private fadeMs = Infinity;

  constructor(age: ArtAge = 1) {
    this.setAge(age, false);
  }

  get age(): ArtAge | null {
    return this.current;
  }

  /** Geçiş sürüyor mu. */
  get fading(): boolean {
    return Number.isFinite(this.fadeMs);
  }

  setAge(age: ArtAge, animate = true): void {
    if (age === this.current) return;
    let layer = this.layers.get(age);
    if (layer === undefined) {
      layer = createAgeBackground(age);
      this.layers.set(age, layer);
    }
    // Süren geçiş varsa: o an görünen en üst katman alttaki tek katman olur.
    for (const [a, l] of this.layers) l.visible = a === this.current;
    this.container.addChild(layer);
    layer.visible = true;
    this.current = age;
    if (animate && this.container.children.length > 1) {
      layer.alpha = 0;
      this.fadeMs = 0;
    } else {
      layer.alpha = 1;
      this.fadeMs = Infinity;
      for (const [a, l] of this.layers) l.visible = a === age;
    }
  }

  update(animMs: number): void {
    if (!Number.isFinite(this.fadeMs) || this.current === null) return;
    this.fadeMs += animMs;
    const layer = this.layers.get(this.current)!;
    layer.alpha = crossfadeAlpha(this.fadeMs, BACKGROUND_FADE_MS);
    if (this.fadeMs >= BACKGROUND_FADE_MS) {
      layer.alpha = 1;
      this.fadeMs = Infinity;
      for (const [a, l] of this.layers) l.visible = a === this.current;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.layers.clear();
  }
}
