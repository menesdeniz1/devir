/**
 * Görsel sabitler (renk, boyut, süre). Denge değeri değildir; oyun kuralları `src/data` içindedir.
 * Takım ayrımı: renk + bakış yönü + amblem + can çubuğu biçimi (GDD §14).
 */

/** Mantıksal sahne yüksekliği (genişlik WORLD.worldWidth). */
export const SCENE_HEIGHT = 1080;
/** Pencere kenarından bırakılan boşluk (piksel). */
export const WINDOW_MARGIN = 12;
/** Cihaz piksel oranı üst sınırı (TDD §6). */
export const MAX_RESOLUTION = 2;

// ---- Dikey yerleşim (mantıksal px) ----
export const SKY_BOTTOM_Y = 610;
export const GROUND_TOP_Y = 610;
export const GROUND_BOTTOM_Y = 830;
/** Birlik ayaklarının taban çizgisi. */
export const UNIT_FEET_Y = 735;
/** Kimliğe göre görsel derinlik kayması: ±6 px (GDD §1). */
export const DEPTH_STEP_PX = 3;
export const DEPTH_LEVELS = 5;
export const BASE_HEIGHT = 250;
export const BASE_BOTTOM_Y = 745;

// ---- Renkler ----
export const COLOR_OUTLINE = 0x1d1b2b;
export const COLOR_SKY_TOP = 0x9ed0e6;
export const COLOR_SKY_MID = 0xbfe0d8;
export const COLOR_SKY_LOW = 0xf2e3b8;
export const COLOR_HILLS_FAR = 0x8fb59a;
export const COLOR_HILLS_NEAR = 0x6f9a74;
export const COLOR_GROUND = 0xc9a56b;
export const COLOR_GROUND_SHADE = 0xb08a52;
export const COLOR_GRASS = 0x7aa35a;
export const COLOR_LANE_MARK = 0x9b7a44;
export const COLOR_SKIN = 0xf2c9a0;
export const COLOR_WOOD = 0x8a5a2b;
export const COLOR_STONE = 0x8d8d99;
export const COLOR_EMBLEM = 0xfff3c4;
export const COLOR_HP_BACK = 0x2a2438;
export const COLOR_HP_FILL = 0x6ee06e;
export const COLOR_FLASH = 0xffffff;

export interface TeamPalette {
  main: number;
  dark: number;
  accent: number;
}

/** Oyuncu: mavi–camgöbeği. */
export const PALETTE_PLAYER: TeamPalette = { main: 0x2f8fe0, dark: 0x1b5a9a, accent: 0x28d4c8 };
/** Rakip: turuncu–kızıl. */
export const PALETTE_ENEMY: TeamPalette = { main: 0xf07a2a, dark: 0xa83a1a, accent: 0xe8432d };

// ---- Birlik çizimi ----
export const UNIT_LINE_WIDTH = 3;
export const UNIT_BODY_W = 24;
export const UNIT_BODY_H = 28;
export const UNIT_HEAD_R = 10;
export const UNIT_HP_BAR_W = 36;
export const UNIT_HP_BAR_H = 6;
export const UNIT_HP_BAR_Y = -78;
export const HP_NOTCHES = 3;
/** Rolün görsel ölçeği (yalnız çizim). */
export const ROLE_SCALE: Record<string, number> = { front: 1, ranged: 0.93, heavy: 1.5 };

// ---- Animasyon süreleri (ms, gerçek zaman) ----
export const ATTACK_ANIM_MS = 220;
export const ATTACK_LUNGE_PX = 9;
export const ATTACK_SWING_RAD = 0.9;
export const DEATH_FADE_MS = 600;
export const DEATH_SINK_PX = 8;
export const WALK_BOB_PX = 2.5;
export const WALK_BOB_PERIOD_MS = 260;
export const BASE_FLASH_MS = 160;
export const BASE_FLASH_ALPHA = 0.55;
/** Kare süresi üst sınırı (animasyon saati için, ms). */
export const MAX_ANIM_FRAME_MS = 100;
