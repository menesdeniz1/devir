/**
 * Görsel sabitler (renk, boyut, süre). Denge değeri değildir; oyun kuralları `src/data` içindedir.
 * Takım ayrımı: renk + bakış yönü + amblem + can çubuğu biçimi (GDD §14).
 */
import { INK, TEAM } from '../art/palette';

/** Mantıksal sahne yüksekliği (genişlik WORLD.worldWidth). */
export const SCENE_HEIGHT = 1080;
/** Pencere kenarından bırakılan boşluk (piksel). */
export const WINDOW_MARGIN = 12;
/** Cihaz piksel oranı üst sınırı (TDD §6). */
export const MAX_RESOLUTION = 2;

// ---- Dikey yerleşim (mantıksal px) ----
export const GROUND_TOP_Y = 610;
export const GROUND_BOTTOM_Y = 830;
/** Birlik ayaklarının taban çizgisi (yürüme yolu bunun çevresinde çizilir). */
export const UNIT_FEET_Y = 735;
/** Kimliğe göre görsel derinlik kayması: ±6 px (GDD §1). */
export const DEPTH_STEP_PX = 3;
export const DEPTH_LEVELS = 5;
export const BASE_BOTTOM_Y = 745;

// ---- Renkler ----
export const COLOR_OUTLINE = INK;
export const COLOR_SKY_TOP = 0x9ed0e6;
export const COLOR_EMBLEM = 0xfff3c4;
export const COLOR_HP_BACK = 0x2a2438;
export const COLOR_HP_FILL = 0x6ee06e;

export interface TeamPalette {
  main: number;
  dark: number;
  accent: number;
}

function teamPalette(side: 0 | 1): TeamPalette {
  return { main: TEAM[side].cloth.base, dark: TEAM[side].cloth.shade, accent: TEAM[side].trim.base };
}

/** Oyuncu: mavi–camgöbeği (renk belirteçlerinin kaynağı: src/art/palette.ts). */
export const PALETTE_PLAYER: TeamPalette = teamPalette(0);
/** Rakip: turuncu–kızıl. */
export const PALETTE_ENEMY: TeamPalette = teamPalette(1);

// ---- Birlik çizimi ----
export const UNIT_HP_BAR_H = 6;
export const HP_NOTCHES = 3;
/**
 * Birlik çiziminin genel ölçeği (simülasyon genişliğinden bağımsız; görsel üst üste binme serbest).
 * Çizim boyları (ölçek 1): ön hat ≈ 62 px, menzilli ≈ 58 px, ağır ≈ 90 px (GDD §14 tablosuna yakın).
 */
export const UNIT_ART_SCALE = 1;
/** Ağır birlikler arka katmanda çizilir (GDD §14): sıralama kaydırması. */
export const HEAVY_Z_OFFSET = -10_000;
/** Yürüme ↔ duruş geçişinin hızı (1/ms). */
export const WALK_BLEND_PER_MS = 1 / 140;

// ---- Animasyon süreleri (ms, gerçek zaman; birlik pozlarının zamanlaması src/art içindedir) ----
export const DEATH_FADE_MS = 600;
export const BASE_FLASH_MS = 160;
export const BASE_FLASH_ALPHA = 0.55;
/** Kare süresi üst sınırı (animasyon saati için, ms). */
export const MAX_ANIM_FRAME_MS = 100;

// ---- Birlik durum görselleri (GDD §7 durum etkileri; yalnız görünüm) ----
/** Sersemlik yıldızları: sayı, yörünge yarıçapları, tur süresi, başın üstündeki boşluk. */
export const STUN_STARS = 3;
export const STUN_STAR_SCALE = 1.35;
export const STUN_ORBIT_RX = 13;
export const STUN_ORBIT_RY = 4.5;
export const STUN_PERIOD_MS = 900;
export const STUN_LIFT_PX = 10;
/** Donma: birliğin buz/enerji tonu (çarpma), kristal büyüme süresi, parıltı döngüsü. */
export const FREEZE_TINT = 0xd4c8ff;
export const FREEZE_GROW_MS = 180;
export const FREEZE_GLINT_MS = 1100;
export const FREEZE_GLINT_COLOR = 0xf3e8ff;
/** Kristal kümesinin ölçeği: birliğin ayak izine göre (ön hat ≈ 1). */
export const FREEZE_CRYSTAL_FOOTPRINT = 18;
