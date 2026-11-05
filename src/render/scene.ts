import { Container, Graphics } from 'pixi.js';
import { BaseRig } from '../art/primitiveBase';
import { prewarmUnitArt } from '../art/unitArt';
import { WORLD } from '../data/world';
import type { SideId } from '../sim/types';
import {
  BASE_BOTTOM_Y,
  BASE_FLASH_ALPHA,
  BASE_FLASH_MS,
  COLOR_EMBLEM,
  COLOR_OUTLINE,
  GROUND_BOTTOM_Y,
  GROUND_TOP_Y,
  PALETTE_ENEMY,
  PALETTE_PLAYER,
  SCENE_HEIGHT,
  UNIT_FEET_Y,
  type TeamPalette,
} from './constants';

export function paletteOf(side: SideId): TeamPalette {
  return side === 0 ? PALETTE_PLAYER : PALETTE_ENEMY;
}

/** Takım amblemi: oyuncu daire, rakip elmas. (cx, cy) merkez, r yarıçap. */
export function drawEmblem(g: Graphics, side: SideId, cx: number, cy: number, r: number, color: number = COLOR_EMBLEM): void {
  if (side === 0) {
    g.circle(cx, cy, r);
  } else {
    g.poly([cx, cy - r * 1.25, cx + r * 1.05, cy, cx, cy + r * 1.25, cx - r * 1.05, cy]);
  }
  g.fill(color).stroke({ width: 2, color: COLOR_OUTLINE });
}

// ---- Arka plan: İlkel Çağ — kayalık vadi, ateş dumanları (GDD §14) ----
// Kesik kâğıt katmanları; kontursuz ve birliklerden daha az doygun ki birlikler öne çıksın.

const SKY_BANDS: ReadonlyArray<readonly [number, number]> = [
  [0, 0x8ccbe4],
  [130, 0xa3d5e5],
  [230, 0xbcdfe0],
  [310, 0xd3e5d2],
  [380, 0xe9e4c2],
  [440, 0xf4dfb3],
];
const BG = {
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
  grass: 0x88a858,
  grassEdge: 0x6c8a43,
  earth: 0xd2ab72,
  path: 0xc49b63,
  pathEdge: 0xb88f58,
  pebble: 0xa48660,
  foreground: 0x9a7246,
  foregroundTop: 0x86623b,
  blades: 0x5d7a3b,
} as const;

/** Sabit sözde rastgele (görsel yerleşim kararlı kalsın). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cloud(g: Graphics, x: number, y: number, s: number): void {
  g.ellipse(x, y + 8 * s, 70 * s, 14 * s).fill(BG.cloudShade);
  g.circle(x - 34 * s, y, 22 * s).fill(BG.cloud);
  g.circle(x, y - 12 * s, 30 * s).fill(BG.cloud);
  g.circle(x + 36 * s, y - 2 * s, 22 * s).fill(BG.cloud);
  g.roundRect(x - 64 * s, y - 4 * s, 128 * s, 16 * s, 8 * s).fill(BG.cloud);
}

function smokeColumn(g: Graphics, x: number, baseY: number, rand: () => number): void {
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const r = 10 + k * 26;
    const drift = Math.sin(k * 3.2) * 24 + k * 50;
    g.circle(x + drift, baseY - k * 230, r).fill({ color: BG.smoke, alpha: 0.5 * (1 - k * 0.75) });
    if (rand() > 0.5) g.circle(x + drift + r * 0.6, baseY - k * 230 + 6, r * 0.6).fill({ color: BG.smoke, alpha: 0.35 * (1 - k) });
  }
}

function conifer(g: Graphics, x: number, baseY: number, h: number): void {
  g.rect(x - 3, baseY - h * 0.25, 6, h * 0.25).fill(BG.trunk);
  for (let i = 0; i < 3; i++) {
    const y = baseY - h * 0.2 - i * h * 0.24;
    const w = h * (0.34 - i * 0.08);
    g.poly([x - w, y, x + w, y, x, y - h * 0.42]).fill(BG.tree);
    g.poly([x, y, x + w, y, x, y - h * 0.42]).fill(BG.treeShade);
  }
}

/** Sabit arka plan: gökyüzü bantları, uzak kayalık mesalar, duman sütunları, tepeler, yol, ön plan. */
export function createBackground(): Container {
  const root = new Container();
  const w = WORLD.worldWidth;
  const g = new Graphics();
  const rand = seeded(1729);

  // Gökyüzü: kâğıt şeritleri.
  for (let i = 0; i < SKY_BANDS.length; i++) {
    const [y, color] = SKY_BANDS[i]!;
    const next = SKY_BANDS[i + 1]?.[0] ?? GROUND_TOP_Y;
    g.rect(0, y, w, next - y + 1).fill(color);
  }
  g.circle(1470, 215, 74).fill({ color: BG.sun, alpha: 0.35 });
  g.circle(1470, 215, 52).fill(BG.sun);
  cloud(g, 330, 170, 1);
  cloud(g, 980, 120, 0.8);
  cloud(g, 1720, 250, 0.7);

  // Uzak mesalar (vadi duvarları), iki kat.
  g.poly([0, 620, 0, 372, 130, 366, 160, 396, 320, 392, 352, 338, 560, 332, 592, 388, 730, 396, 770, 430, 1140, 432, 1180, 388, 1330, 380, 1362, 330, 1600, 326, 1632, 372, 1780, 376, 1808, 350, w, 346, w, 620]).fill(BG.mesaFar);
  g.poly([0, 620, 0, 420, 150, 420, 330, 424, 560, 410, 760, 448, 1140, 452, 1360, 414, 1600, 404, 1800, 412, w, 400, w, 620]).fill(BG.mesaFarShade);
  smokeColumn(g, 610, 470, rand);
  smokeColumn(g, 1290, 480, rand);
  g.poly([0, 620, 0, 470, 90, 462, 120, 488, 260, 484, 300, 446, 470, 440, 500, 478, 880, 486, 920, 458, 1040, 452, 1080, 490, 1420, 494, 1450, 456, 1620, 450, 1660, 486, w, 480, w, 620]).fill(BG.mesaNear);
  g.poly([0, 620, 0, 508, 300, 500, 500, 512, 900, 520, 1080, 514, 1450, 522, 1700, 512, w, 516, w, 620]).fill(BG.mesaNearShade);

  // Yosun yeşili tepeler + ağaçlar + kayalar.
  const hill: number[] = [0, 620];
  for (let x = 0; x <= w; x += 60) hill.push(x, 548 + Math.sin(x / 170) * 14 + Math.sin(x / 61) * 6);
  hill.push(w, 620);
  g.poly(hill).fill(BG.hills);
  g.rect(0, 585, w, 40).fill(BG.hillsShade);
  for (let i = 0; i < 26; i++) {
    const x = 40 + i * 74 + rand() * 40;
    conifer(g, x, 560 + Math.sin(x / 170) * 12 + 10, 40 + rand() * 34);
  }
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 210 + rand() * 80;
    g.ellipse(x, 592, 26 + rand() * 14, 16).fill(BG.boulder);
    g.ellipse(x + 6, 598, 20, 9).fill(BG.boulderShade);
  }

  // Zemin şeridi: çim yakası, toprak, yürüme yolu.
  g.rect(0, GROUND_TOP_Y, w, GROUND_BOTTOM_Y - GROUND_TOP_Y).fill(BG.earth);
  g.rect(0, GROUND_TOP_Y, w, 20).fill(BG.grass);
  for (let x = 0; x < w; x += 16) {
    const h = 6 + rand() * 7;
    g.poly([x, GROUND_TOP_Y + 20, x + 8, GROUND_TOP_Y + 20, x + 4 + rand() * 4, GROUND_TOP_Y + 20 + h]).fill(BG.grass);
  }
  g.rect(0, GROUND_TOP_Y + 1, w, 3).fill(BG.grassEdge);
  const pathTop = UNIT_FEET_Y - 34;
  const pathBottom = UNIT_FEET_Y + 26;
  g.rect(0, pathTop, w, pathBottom - pathTop).fill(BG.path);
  g.rect(0, pathTop, w, 3).fill(BG.pathEdge);
  g.rect(0, pathBottom - 3, w, 3).fill(BG.pathEdge);
  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    const y = GROUND_TOP_Y + 32 + rand() * (GROUND_BOTTOM_Y - GROUND_TOP_Y - 44);
    if (y > pathTop - 4 && y < pathBottom + 4) continue;
    g.ellipse(x, y, 3 + rand() * 4, 2 + rand() * 2).fill(BG.pebble);
  }

  // Ön plan (alt panelin arkası): koyu toprak, kayalar, ot yaprakları.
  g.rect(0, GROUND_BOTTOM_Y, w, SCENE_HEIGHT - GROUND_BOTTOM_Y).fill(BG.foreground);
  const fg: number[] = [0, GROUND_BOTTOM_Y + 30];
  for (let x = 0; x <= w; x += 48) fg.push(x, GROUND_BOTTOM_Y - 6 + Math.sin(x / 90) * 6 + rand() * 6);
  fg.push(w, GROUND_BOTTOM_Y + 30);
  g.poly(fg).fill(BG.foregroundTop);
  for (let i = 0; i < 70; i++) {
    const x = rand() * w;
    const y = GROUND_BOTTOM_Y + 2 + rand() * 20;
    const h = 10 + rand() * 16;
    g.poly([x - 3, y, x + 3, y, x + (rand() - 0.5) * 10, y - h]).fill(BG.blades);
  }
  root.addChild(g);
  return root;
}

// ---- Üsler ----

export interface BaseView {
  container: Container;
  /** Kalan parlama süresi (ms). */
  flashMs: number;
  /** Vuruş parlaması (üssün beyaz silueti). */
  flash: Container;
  /** Çizim iskeleti (duman, alev). */
  rig: BaseRig;
}

/** İlkel Çağ üssü (çadır, totem, palisat, ateş). Oyuncu solda sağa bakar; rakip sağda, aynalanmış. */
export function createBaseView(side: SideId): BaseView {
  // Birlik atlası da sahne kurulurken pişirilsin (ilk doğumda takılma olmasın).
  prewarmUnitArt();
  const rig = new BaseRig(side);
  const container = new Container();
  container.addChild(rig.root);
  if (side === 0) {
    container.x = 0;
  } else {
    container.x = WORLD.worldWidth;
    container.scale.x = -1;
  }
  container.y = BASE_BOTTOM_Y;
  return { container, flashMs: 0, flash: rig.flash, rig };
}

/** Üs görünümünü bir kare ilerletir: vuruş parlaması, alev ve duman. */
export function updateBaseFlash(view: BaseView, animMs: number): void {
  if (view.flashMs > 0) view.flashMs = Math.max(0, view.flashMs - animMs);
  view.flash.alpha = (view.flashMs / BASE_FLASH_MS) * BASE_FLASH_ALPHA;
  view.rig.update(animMs);
}

export function triggerBaseFlash(view: BaseView): void {
  view.flashMs = BASE_FLASH_MS;
}
