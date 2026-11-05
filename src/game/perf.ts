/**
 * Performans ölçümü (TDD §4, yalnız `?debug` geliştirme panelinde): son pencere (varsayılan 1 sn) içindeki
 * kare sayısından fps, simülasyon adım süresinin ortalaması ve en kötüsü. Saf hesaplama; saat dışarıdan verilir.
 */

/** Ölçüm penceresi (ms). */
export const PERF_WINDOW_MS = 1000;

export interface PerfSample {
  /** Karenin zaman damgası (ms). */
  time: number;
  /** O karede `session.advance`in harcadığı süre (ms). */
  stepMs: number;
}

export interface PerfSnapshot {
  fps: number;
  stepAvgMs: number;
  stepMaxMs: number;
  /** Penceredeki kare sayısı. */
  frames: number;
}

/** `nowMs`'ten geriye `windowMs` içindeki örneklerin istatistiği. */
export function computePerf(samples: readonly PerfSample[], nowMs: number, windowMs: number = PERF_WINDOW_MS): PerfSnapshot {
  const inWindow = samples.filter((s) => s.time > nowMs - windowMs && s.time <= nowMs);
  if (inWindow.length === 0) return { fps: 0, stepAvgMs: 0, stepMaxMs: 0, frames: 0 };
  let sum = 0;
  let max = 0;
  for (const s of inWindow) {
    sum += s.stepMs;
    if (s.stepMs > max) max = s.stepMs;
  }
  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  // fps: kare aralıklarından (n örnek = n−1 aralık); tek örnekte ölçülemez.
  const span = last.time - first.time;
  const fps = inWindow.length >= 2 && span > 0 ? ((inWindow.length - 1) * 1000) / span : 0;
  return { fps, stepAvgMs: sum / inWindow.length, stepMaxMs: max, frames: inWindow.length };
}

export class PerfMeter {
  private samples: PerfSample[] = [];

  constructor(private readonly windowMs: number = PERF_WINDOW_MS) {}

  record(timeMs: number, stepMs: number): void {
    this.samples.push({ time: timeMs, stepMs });
    const cutoff = timeMs - this.windowMs;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop]!.time <= cutoff) drop += 1;
    if (drop > 0) this.samples = this.samples.slice(drop);
  }

  snapshot(nowMs: number): PerfSnapshot {
    return computePerf(this.samples, nowMs, this.windowMs);
  }
}
