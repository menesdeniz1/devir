import { Container, Graphics } from 'pixi.js';
import { WORLD } from '../data/world';
import type { SideId } from '../sim/types';
import {
  BASE_BOTTOM_Y,
  BASE_FLASH_ALPHA,
  BASE_FLASH_MS,
  BASE_HEIGHT,
  COLOR_EMBLEM,
  COLOR_FLASH,
  COLOR_GRASS,
  COLOR_GROUND,
  COLOR_GROUND_SHADE,
  COLOR_HILLS_FAR,
  COLOR_HILLS_NEAR,
  COLOR_LANE_MARK,
  COLOR_OUTLINE,
  COLOR_SKY_LOW,
  COLOR_SKY_MID,
  COLOR_SKY_TOP,
  COLOR_STONE,
  COLOR_WOOD,
  GROUND_BOTTOM_Y,
  GROUND_TOP_Y,
  PALETTE_ENEMY,
  PALETTE_PLAYER,
  SCENE_HEIGHT,
  SKY_BOTTOM_Y,
  type TeamPalette,
} from './constants';

export function paletteOf(side: SideId): TeamPalette {
  return side === 0 ? PALETTE_PLAYER : PALETTE_ENEMY;
}

/** Takım amblemi: oyuncu daire, rakip elmas. (cx, cy) merkez, r yarıçap. */
export function drawEmblem(g: Graphics, side: SideId, cx: number, cy: number, r: number, color: number): void {
  if (side === 0) {
    g.circle(cx, cy, r);
  } else {
    g.poly([cx, cy - r * 1.25, cx + r * 1.05, cy, cx, cy + r * 1.25, cx - r * 1.05, cy]);
  }
  g.fill(color).stroke({ width: 2, color: COLOR_OUTLINE });
}

/** Sabit arka plan: gökyüzü bantları, tepeler, zemin şeridi. */
export function createBackground(): Container {
  const root = new Container();
  const w = WORLD.worldWidth;
  const g = new Graphics();
  const third = SKY_BOTTOM_Y / 3;
  g.rect(0, 0, w, third + 1).fill(COLOR_SKY_TOP);
  g.rect(0, third, w, third + 1).fill(COLOR_SKY_MID);
  g.rect(0, third * 2, w, third + 2).fill(COLOR_SKY_LOW);
  // Uzak ve yakın tepeler.
  const farBase = GROUND_TOP_Y;
  g.poly([0, farBase, 0, 470, 260, 410, 520, 480, 800, 400, 1100, 470, 1400, 395, 1700, 460, w, 420, w, farBase]).fill(COLOR_HILLS_FAR);
  g.poly([0, farBase, 0, 540, 330, 500, 640, 560, 960, 510, 1280, 565, 1600, 515, w, 550, w, farBase]).fill(COLOR_HILLS_NEAR);
  // Zemin şeridi.
  g.rect(0, GROUND_TOP_Y, w, GROUND_BOTTOM_Y - GROUND_TOP_Y).fill(COLOR_GROUND);
  g.rect(0, GROUND_TOP_Y, w, 22).fill(COLOR_GRASS);
  g.rect(0, GROUND_BOTTOM_Y - 40, w, 40).fill(COLOR_GROUND_SHADE);
  g.rect(0, GROUND_TOP_Y + 22, w, 3).fill(COLOR_OUTLINE);
  // Orta çizgi: kesikli şerit.
  const laneY = (GROUND_TOP_Y + GROUND_BOTTOM_Y) / 2 + 30;
  for (let x = WORLD.baseWidth; x < w - WORLD.baseWidth; x += 64) {
    g.rect(x, laneY, 32, 4).fill(COLOR_LANE_MARK);
  }
  // Zemin altı: sahnenin geri kalanı.
  g.rect(0, GROUND_BOTTOM_Y, w, SCENE_HEIGHT - GROUND_BOTTOM_Y).fill(COLOR_GROUND_SHADE);
  root.addChild(g);
  return root;
}

export interface BaseView {
  container: Container;
  /** Kalan parlama süresi (ms). */
  flashMs: number;
  flash: Graphics;
}

/** Üs: kulübe + sancak + büyük amblem. Oyuncu solda, rakip sağda. */
export function createBaseView(side: SideId): BaseView {
  const pal = paletteOf(side);
  const w = WORLD.baseWidth;
  const dir = side === 0 ? 1 : -1;
  const container = new Container();
  container.x = side === 0 ? 0 : WORLD.worldWidth - w;
  container.y = BASE_BOTTOM_Y;

  const g = new Graphics();
  // Temel taş.
  g.roundRect(4, -26, w - 8, 26, 4).fill(COLOR_STONE).stroke({ width: 4, color: COLOR_OUTLINE });
  // Gövde.
  const bodyH = BASE_HEIGHT - 110;
  g.roundRect(14, -26 - bodyH, w - 28, bodyH, 6).fill(pal.main).stroke({ width: 4, color: COLOR_OUTLINE });
  // Gölge yarısı (iç tarafa karşı).
  const shadeX = side === 0 ? 14 : 14 + (w - 28) / 2;
  g.rect(shadeX + 2, -26 - bodyH + 4, (w - 28) / 2 - 2, bodyH - 8).fill({ color: pal.dark, alpha: 0.55 });
  // Çatı.
  g.poly([4, -26 - bodyH, w / 2, -26 - bodyH - 70, w - 4, -26 - bodyH]).fill(COLOR_WOOD).stroke({ width: 4, color: COLOR_OUTLINE });
  // Kapı.
  g.roundRect(w / 2 - 18, -26 - 44, 36, 44, 4).fill(COLOR_OUTLINE);
  container.addChild(g);

  // Sancak: iç yöne (düşmana) bakar.
  const flag = new Graphics();
  const poleX = side === 0 ? w - 20 : 20;
  flag.rect(poleX - 2, -BASE_HEIGHT - 30, 4, 90).fill(COLOR_WOOD);
  flag.poly([poleX, -BASE_HEIGHT - 28, poleX + dir * 44, -BASE_HEIGHT - 12, poleX, -BASE_HEIGHT + 6]).fill(pal.accent).stroke({ width: 3, color: COLOR_OUTLINE });
  container.addChild(flag);

  // Büyük amblem gövdede.
  const emblem = new Graphics();
  drawEmblem(emblem, side, w / 2, -26 - bodyH / 2 - 6, 22, COLOR_EMBLEM);
  container.addChild(emblem);

  const flash = new Graphics();
  flash.rect(4, -BASE_HEIGHT - 20, w - 8, BASE_HEIGHT + 20).fill(COLOR_FLASH);
  flash.alpha = 0;
  container.addChild(flash);

  return { container, flashMs: 0, flash };
}

/** Üs vuruş parlamasını bir kare ilerletir. */
export function updateBaseFlash(view: BaseView, animMs: number): void {
  if (view.flashMs > 0) view.flashMs = Math.max(0, view.flashMs - animMs);
  view.flash.alpha = (view.flashMs / BASE_FLASH_MS) * BASE_FLASH_ALPHA;
}

export function triggerBaseFlash(view: BaseView): void {
  view.flashMs = BASE_FLASH_MS;
}
