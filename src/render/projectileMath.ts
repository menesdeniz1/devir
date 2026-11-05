/** Mermi çiziminin saf matematiği (Pixi'den bağımsız; testlenebilir). Simülasyon durumunu değiştirmez. */

/** Uçuş ilerlemesi 0..1: başlangıçtan hedefe oran. Mesafe sıfırsa 1. */
export function flightProgress(startX: number, currentX: number, targetX: number): number {
  const span = targetX - startX;
  if (Math.abs(span) < 1e-6) return 1;
  return Math.min(1, Math.max(0, (currentX - startX) / span));
}

/** Parabolik yay yüksekliği (yalnız görsel y kayması): t=0 ve t=1'de 0, ortada `height`. */
export function arcLift(t: number, height: number): number {
  return 4 * height * t * (1 - t);
}

/** Yay yüksekliği: uçuş mesafesiyle orantılı, üst sınırlı. */
export function arcHeightFor(span: number, ratio: number, maxHeight: number): number {
  return Math.min(maxHeight, Math.abs(span) * ratio);
}

/** İlerlemeye (0..1) göre solma (1 → 0). */
export function fadeAlpha(progress: number): number {
  return Math.min(1, Math.max(0, 1 - progress));
}

/** Geçen süreye göre 0..1 ilerleme. */
export function effectProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}
