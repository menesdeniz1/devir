/**
 * Renk belirteçleri (GDD §14). Görsel değerdir; oyun kuralı değildir.
 * Her şekil iki tonla boyanır: düz (`base`) + gölge (`shade`). Kontur her yerde aynı koyu mürekkep.
 */

export type ArtSide = 0 | 1;

export interface Tone {
  base: number;
  shade: number;
}

/** Kontur rengi ve kalınlığı (mantıksal px, 1080p'de ≈ 3 px). */
export const INK = 0x1d1b2b;
export const INK_WIDTH = 3;
/** İnce iç çizgiler (dikiş, damar, halka). */
export const INK_THIN = 1.6;

/** Malzemeler: İlkel Çağ (toprak, okr, yosun yeşili; ahşap, deri, taş). */
export const MAT = {
  skin: { base: 0xf1c08e, shade: 0xcc9162 },
  hair: { base: 0x4d3022, shade: 0x2f1d15 },
  hide: { base: 0xcf9f63, shade: 0xa0703f },
  fur: { base: 0x8c6b4b, shade: 0x664b31 },
  wood: { base: 0xa56b35, shade: 0x764a22 },
  woodCut: { base: 0xe2b77a, shade: 0xc0915a },
  stone: { base: 0xb0aea7, shade: 0x817f7a },
  rope: { base: 0xe6d199, shade: 0xb79f67 },
  bone: { base: 0xf6eed6, shade: 0xcfc29e },
  spark: { base: 0xfff4b0, shade: 0xffc247 },
  flame: { base: 0xffd35a, shade: 0xf0782a },
} satisfies Record<string, Tone>;

/** Amblem dolgusu (takım şekli üzerinde açık krem). */
export const EMBLEM_FILL = 0xfff3c4;

export interface TeamTones {
  /** Giysi, kalkan yüzü, sancak: takımın ana rengi. */
  cloth: Tone;
  /** Saç bandı, tüy, boya şeridi: takımın vurgu rengi. */
  trim: Tone;
}

/** Oyuncu: mavi–camgöbeği. Rakip: turuncu–kızıl (renk körlüğüne dayanıklı çift). */
export const TEAM: Record<ArtSide, TeamTones> = {
  0: { cloth: { base: 0x2f8fe0, shade: 0x1d5ea6 }, trim: { base: 0x2ad3c6, shade: 0x16958b } },
  1: { cloth: { base: 0xf07a2a, shade: 0xb2461a }, trim: { base: 0xe8432d, shade: 0x9e2518 } },
};

/** Arka uzuvlar için çarpma tonu (derinlik). */
export const BACK_LIMB_TINT = 0xbdb3c4;
/** Zemin gölgesi. */
export const GROUND_SHADOW = { color: 0x2a1d12, alpha: 0.24 };

// ---- Çağ malzeme takımları (GDD §14 "Çağ kimlikleri"). Çağ 1 yukarıdaki MAT'tır. ----

export type ArtAge = 1 | 2 | 3 | 4 | 5;

/**
 * Bir çağın birlik malzemeleri. Takım rengi (TEAM) her çağda aynıdır; bunlar takımdan bağımsız malzemelerdir.
 * Gelecek Çağ parlaması eflatundur: camgöbeği oyuncunun takım rengine yakın olduğundan birliklerde kullanılmaz.
 */
export interface AgeKit {
  skin: Tone;
  hair: Tone;
  /** Kol/bacak örtüsü (çıplak deri, örgü zırh, yün pantolon, alaşım). */
  limb: Tone;
  /** Dizlik, tozluk, sargı veya parlayan şerit. */
  band: Tone;
  boot: Tone;
  /** Ana metal: bronz, çelik, dökme demir, açık alaşım. */
  metal: Tone;
  metalHi: number;
  /** Süs malzemesi: terakota, arduvaz laciverdi, pirinç, koyu lacivert. */
  trim: Tone;
  wood: Tone;
  leather: Tone;
  /** Takımdan bağımsız kumaş: keten, ham bez, haki, kompozit. */
  fabric: Tone;
  /** Taş/tuğla (kaya mermisi, karşı ağırlık). */
  stone: Tone;
  /** Kıvılcım ve parlama. */
  glow: Tone;
}

export const AGE_KIT: Record<Exclude<ArtAge, 1>, AgeKit> = {
  // Antik: terakota, bronz, krem.
  2: {
    skin: MAT.skin,
    hair: { base: 0x3a2a22, shade: 0x241913 },
    limb: MAT.skin,
    band: { base: 0xd8a144, shade: 0xa66f22 },
    boot: { base: 0x9a5a34, shade: 0x6e3d21 },
    metal: { base: 0xd8a144, shade: 0xa66f22 },
    metalHi: 0xffe3a3,
    trim: { base: 0xc8643c, shade: 0x96462a },
    wood: { base: 0x9a6a3e, shade: 0x6d4726 },
    leather: { base: 0xa85f36, shade: 0x7a4124 },
    fabric: { base: 0xf1e4c4, shade: 0xcfbf98 },
    stone: { base: 0xe9dfca, shade: 0xc2b59a },
    glow: MAT.spark,
  },
  // Orta: taş grisi, demir, arduvaz laciverdi.
  3: {
    skin: MAT.skin,
    hair: { base: 0x5a3a26, shade: 0x3a2618 },
    limb: { base: 0xa3a8b3, shade: 0x777d8a },
    band: { base: 0x6b707c, shade: 0x4b4f5a },
    boot: { base: 0x5b3d2a, shade: 0x3d281b },
    metal: { base: 0xc3c9d3, shade: 0x8d94a2 },
    metalHi: 0xf2f5fa,
    trim: { base: 0x3f4a6b, shade: 0x2b3350 },
    wood: { base: 0x8b5a32, shade: 0x60391e },
    leather: { base: 0x7a4f2f, shade: 0x55341d },
    fabric: { base: 0xd9cfb8, shade: 0xb3a78c },
    stone: { base: 0xa9a9a6, shade: 0x7e7e7c },
    glow: MAT.spark,
  },
  // Endüstri: tuğla, dökme demir, pirinç, buhar beyazı.
  4: {
    skin: MAT.skin,
    hair: { base: 0x3b2b25, shade: 0x241a16 },
    limb: { base: 0x4d4a57, shade: 0x37343f },
    band: { base: 0xb3a27c, shade: 0x8c7c58 },
    boot: { base: 0x2c2a31, shade: 0x1b1a1f },
    metal: { base: 0x5b5f68, shade: 0x3d4048 },
    metalHi: 0xa9afba,
    trim: { base: 0xdcae4a, shade: 0xa97f26 },
    wood: { base: 0x7c4e2e, shade: 0x553219 },
    leather: { base: 0x6e4428, shade: 0x4c2d19 },
    fabric: { base: 0xc2b48a, shade: 0x9a8b64 },
    stone: { base: 0x34363c, shade: 0x1f2024 },
    glow: { base: 0xfff1c2, shade: 0xff9c3a },
  },
  // Gelecek: koyu lacivert alaşım, eflatun parlama.
  5: {
    skin: MAT.skin,
    hair: { base: 0x2b2733, shade: 0x1a1720 },
    limb: { base: 0x313b5c, shade: 0x20273f },
    band: { base: 0xd65cff, shade: 0x9a30d6 },
    boot: { base: 0x445079, shade: 0x2c3456 },
    metal: { base: 0x8a96b8, shade: 0x5d6889 },
    metalHi: 0xdfe8ff,
    trim: { base: 0x232a45, shade: 0x161b30 },
    wood: { base: 0x3a4466, shade: 0x262d47 },
    leather: { base: 0x2b3250, shade: 0x1b2038 },
    fabric: { base: 0x5a6688, shade: 0x3f4968 },
    stone: { base: 0xe9b8ff, shade: 0xc65cff },
    glow: { base: 0xf6d4ff, shade: 0xc65cff },
  },
};

/** Parlama çekirdeği (enerji silahı, ışık dalgası). */
export const GLOW_CORE = 0xfdf6ff;
/** Beyaz kumaş (çapraz kayış). */
export const WHITE_STRAP: Tone = { base: 0xeeeae0, shade: 0xc9c3b4 };
