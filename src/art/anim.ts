import type { Container } from 'pixi.js';

/**
 * Animasyon girdisi ve ortak eğriler. Zaman, çizimin gerçek kare saatinden gelir (duraklatmada durur);
 * olaylar (saldırı, ölüm) çizici tarafından tetiklenir. Simülasyon durumu değiştirilmez.
 */

export interface UnitAnimInput {
  /** Birliğin yürüdüğü toplam mesafe (px). Adım evresi buradan çıkar: kayma olmaz, durunca bacak durur. */
  walkDist: number;
  /** 0 = duruyor, 1 = yürüyor (yumuşak geçiş). */
  walkBlend: number;
  /** Son saldırı olayından beri geçen süre (ms); hiç saldırmadıysa Infinity. Olay = vuruş/atış anı. */
  sinceAttackMs: number;
  /** Saldırı aralığı (ms): kurulma (hazırlık) evresi buna göre ölçeklenir. */
  attackIntervalMs: number;
  /** Saldırı modunda mı (hedefe kilitli). */
  engaged: boolean;
  /** Son hasar alınmasından beri geçen süre (ms); Infinity yoksa. */
  sinceHitMs: number;
  /** Birliğe özgü serbest saat (ms): nefes, sallanma. */
  timeMs: number;
}

/** Kodla kurulan birlik iskeleti. Kök sağa bakar; ayak tabanı (0,0). Bakış yönü dışarıdan scale.x ile verilir. */
export interface UnitRig {
  readonly root: Container;
  /** Can çubuğunun kök koordinatındaki üst kenarı. */
  readonly hpBarY: number;
  /** Can çubuğu genişliği. */
  readonly hpBarW: number;
  /** Zemin gölgesinin yarı genişliği. */
  readonly footprint: number;
  /** Silahın vuruş/atış noktası (kök yerel, sağa bakarken): mermi çıkışı veya yakın dövüş kıvılcımı için. */
  readonly launch: { readonly x: number; readonly y: number };
  pose(input: UnitAnimInput): void;
  /** t: 0 → 1, ölüm süresi boyunca. */
  poseDeath(t: number): void;
}

export const TAU = Math.PI * 2;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeInQuad(t: number): number {
  return t * t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

/** Hafif sekmeli düşüş (devrilme). */
export function easeOutBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/** Sönümlü yay: 0'da 1, zamanla 0'a salınarak iner (geri tepme, sarsılma). */
export function dampedWobble(ms: number, periodMs: number, decayMs: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.cos((ms / periodMs) * TAU) * Math.exp(-ms / decayMs);
}

/** Vuruş tepkisi: hasar alınca kısa geri sarsılma (0..1). */
export function hitJolt(sinceHitMs: number, durationMs: number): number {
  if (sinceHitMs >= durationMs) return 0;
  return Math.sin((sinceHitMs / durationMs) * Math.PI);
}

/**
 * Saldırı zaman çizelgesi: kuruluş (0..1, bir sonraki vuruşa yaklaşırken artar),
 * vuruş (0..1, olaydan hemen sonra hızlı), toparlanma (0..1).
 */
export interface AttackPhase {
  windup: number;
  strike: number;
  recover: number;
}

export function attackPhase(input: UnitAnimInput, strikeMs: number, recoverMs: number, windupShare: number): AttackPhase {
  const t = input.sinceAttackMs;
  if (!Number.isFinite(t)) return { windup: input.engaged ? 1 : 0, strike: 1, recover: 1 };
  if (t < strikeMs) return { windup: 0, strike: t / strikeMs, recover: 0 };
  const recover = clamp01((t - strikeMs) / recoverMs);
  if (!input.engaged) return { windup: 0, strike: 1, recover };
  // Kuruluş: aralığın son `windupShare` kısmında (bir sonraki vuruştan önce) yükselir.
  const start = input.attackIntervalMs * (1 - windupShare);
  const windup = clamp01((t - start) / (input.attackIntervalMs * windupShare));
  return { windup: easeInOut(windup), strike: 1, recover };
}

/** Yürüme evresi (radyan) mesafeden. */
export function walkPhase(dist: number, strideLen: number): number {
  return (dist / strideLen) * TAU;
}
