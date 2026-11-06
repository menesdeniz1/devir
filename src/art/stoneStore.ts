import { shape, soft, stroke, line, type Ctx } from './paint';
import { INK, type Tone } from './palette';

/**
 * Maden deposu yığını (GDD §8 "Görsel"): madenin deposunda biriken altın, madenin yanında (ya da arabasında,
 * teknesinde, tepsisinde) bir yığın olarak görünür. Yığın, depodaki altına göre birkaç kesik basamakta büyür;
 * basamak değişmedikçe hiçbir şey yeniden çizilmez/kurulmaz. Yalnız Canvas 2D çizim; Pixi yok.
 * (0,0) yığının taban ortasıdır (zemin veya kap ağzı).
 */

/** Altın tonları (bütün çağlarda aynı: altın her çağda altındır). */
export const GOLD: Tone = { base: 0xf6c443, shade: 0xc98a1e };
export const GOLD_HI = 0xfff0a6;

/**
 * Depo basamak eşikleri (altın): `small` aşılınca (> 0) küçük yığın, `medium` ve `large` ise en az bu kadar
 * altında orta ve büyük yığın. Görsel eşiktir, oyun kuralı değildir.
 */
export const STONE_STORE_STEPS = { small: 0, medium: 100, large: 300 } as const;

export type StoreStep = 0 | 1 | 2 | 3;

/** Depodaki altından yığın basamağı: 0 boş, 1 küçük, 2 orta, 3 büyük. */
export function storeStep(gold: number): StoreStep {
  if (!(gold > STONE_STORE_STEPS.small)) return 0;
  if (gold >= STONE_STORE_STEPS.large) return 3;
  if (gold >= STONE_STORE_STEPS.medium) return 2;
  return 1;
}

/** Yığın biçimi: ham cevher (altın + kaya), külçe (yalnız altın), kristal (Gelecek: altın altıgen kırıklar). */
export type PileStyle = 'ore' | 'nugget' | 'crystal';

export interface StoreSpot {
  /** Yığının taban ortası (taş yerelinde). */
  x: number;
  y: number;
  /** Yığın ölçeği (kabın boyuna göre). */
  scale: number;
  style: PileStyle;
}

/** Yığın tümseğinin yarı genişliği ve yüksekliği (ölçek 1), basamak başına. */
const MOUND: Record<Exclude<StoreStep, 0>, { w: number; h: number }> = {
  1: { w: 15, h: 13 },
  2: { w: 22, h: 20 },
  3: { w: 30, h: 30 },
};

/** Külçe yerleşimi [x, y, r]; arkadan öne/alttan üste çizilir. Basamak büyüdükçe daha çok satır. */
const NUGGETS: Record<Exclude<StoreStep, 0>, ReadonlyArray<readonly [number, number, number]>> = {
  1: [
    [-7, -4, 5],
    [7, -4, 4.8],
    [0, -10, 5.2],
  ],
  2: [
    [-15, -4, 4.6],
    [-5, -4, 5],
    [6, -4, 5],
    [16, -4, 4.4],
    [-9, -11, 5],
    [3, -12, 5.4],
    [12, -10, 4.4],
    [-2, -18, 5],
  ],
  3: [
    [-23, -4, 4.8],
    [-12, -4, 5.4],
    [0, -4, 5.4],
    [12, -4, 5.4],
    [23, -4, 4.8],
    [-17, -12, 5.2],
    [-5, -13, 5.6],
    [7, -13, 5.6],
    [18, -11, 5],
    [-10, -20, 5.4],
    [3, -21, 5.8],
    [13, -19, 4.8],
    [-3, -28, 5.6],
  ],
};

/** Sabit "rastgele" sapmalar: külçeler yumru görünsün (deterministik). */
const JIT = [0.82, 1.08, 0.9, 1.15, 0.86, 1.02];

function nuggetPath(x: number, y: number, r: number, k: number) {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + k * 0.7;
    const rr = r * JIT[(i + k) % JIT.length]!;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.82);
  }
  return soft(pts, r * 0.35);
}

/** Altıgen altın taş (Gelecek): düz kesimli, hafif döndürülmüş. */
function gemPath(x: number, y: number, r: number, k: number) {
  const pts: number[] = [];
  const rot = ((k % 3) - 1) * 0.18;
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9);
  }
  return soft(pts, 0.8);
}

/** Dört kollu küçük parıltı (krem, ince konturlu). */
export function glint(c: Ctx, x: number, y: number, r: number): void {
  const q = r * 0.28;
  shape(c, soft([x, y - r, x + q, y - q, x + r, y, x + q, y + q, x, y + r, x - q, y + q, x - r, y, x - q, y - q], 0.5), GOLD_HI, { line: 1.2 });
}

const ORE_ROCK: Tone = { base: 0x9c9384, shade: 0x766e61 };
/** Ham cevher tümseği: altın tozlu toprak (yığın yine altın okunur). */
const ORE_MOUND: Tone = { base: 0xd7a73c, shade: 0xa9792a };

/** Yığın çizimi (ölçek ve biçim kabın çağına göre). */
export function pileDraw(style: PileStyle, step: Exclude<StoreStep, 0>, scale: number) {
  return (c: Ctx): void => {
    c.save();
    c.scale(scale, scale);
    const m = MOUND[step];
    const moundTone: Tone = style === 'ore' ? ORE_MOUND : GOLD;
    // Tümsek: yığının dolgun silueti (aralarda boşluk görünmesin).
    shape(c, soft([-m.w, 0.5, m.w, 0.5, m.w * 0.62, -m.h * 0.55, 0, -m.h, -m.w * 0.62, -m.h * 0.55], 4), moundTone, {
      shadeOffset: [-2, -2],
      line: 2.2,
    });
    NUGGETS[step].forEach(([x, y, r], i) => {
      if (style === 'crystal') {
        shape(c, gemPath(x, y, r, i), GOLD, { shadeOffset: [-1.4, -1.4], line: 1.8 });
        // Üst yüz (açık) ve iç kesim çizgisi.
        shape(c, gemPath(x - r * 0.12, y - r * 0.12, r * 0.45, i), GOLD_HI, { line: 0 });
        return;
      }
      const rock = style === 'ore' && i % 4 === 1;
      shape(c, nuggetPath(x, y, r, i), rock ? ORE_ROCK : GOLD, { shadeOffset: [-1.2, -1.4], line: 1.8 });
      if (!rock) stroke(c, line([x - r * 0.45, y - r * 0.25, x - r * 0.1, y - r * 0.5]), 1.3, GOLD_HI);
    });
    // Parıltılar: büyüdükçe çoğalır.
    if (step >= 2) glint(c, -m.w * 0.35, -m.h * 0.7, 4);
    if (step >= 3) glint(c, m.w * 0.55, -m.h * 0.45, 4.5);
    c.restore();
    // Taban çizgisi: yığın zemine/kaba oturur.
    stroke(c, line([-MOUND[step].w * scale * 0.85, 0.5, MOUND[step].w * scale * 0.85, 0.5]), 1.6, INK);
  };
}

/** Yığın parçasının yerel sınır kutusu (ölçek ve basamağa göre; kontur payı atlas ekler). */
export function pileBounds(step: Exclude<StoreStep, 0>, scale: number): { x0: number; y0: number; x1: number; y1: number } {
  const m = MOUND[step];
  const w = (m.w + 6) * scale;
  const top = (step === 3 ? 36 : m.h + 8) * scale;
  return { x0: -w, y0: -top - 6 * scale, x1: w, y1: 3 };
}
