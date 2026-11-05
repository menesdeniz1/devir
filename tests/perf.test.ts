import { describe, expect, it } from 'vitest';
import { computePerf, PERF_WINDOW_MS, PerfMeter, type PerfSample } from '../src/game/perf';
import { tr } from '../src/i18n/tr';

const steady = (fps: number, ms: number, stepMs = 1): PerfSample[] => {
  const out: PerfSample[] = [];
  for (let t = 0; t <= ms; t += 1000 / fps) out.push({ time: t, stepMs });
  return out;
};

describe('Performans istatistiği (TDD §4)', () => {
  it('boş ve tek örnekte sıfır fps', () => {
    expect(computePerf([], 1000)).toEqual({ fps: 0, stepAvgMs: 0, stepMaxMs: 0, frames: 0 });
    expect(computePerf([{ time: 10, stepMs: 2 }], 10)).toMatchObject({ fps: 0, stepAvgMs: 2, stepMaxMs: 2, frames: 1 });
  });

  it('sabit 60 fps akışında fps ≈ 60; 30 fps akışında ≈ 30', () => {
    expect(computePerf(steady(60, 3000), 3000).fps).toBeCloseTo(60, 0);
    expect(computePerf(steady(30, 3000), 3000).fps).toBeCloseTo(30, 0);
  });

  it('yalnız son pencere (1 sn) hesaba girer: eski yavaş kareler fps ve adım süresini etkilemez', () => {
    const slow: PerfSample[] = [
      { time: 0, stepMs: 50 },
      { time: 500, stepMs: 50 },
    ];
    const fast = steady(60, 3000, 2).filter((s) => s.time > 1500);
    const snap = computePerf([...slow, ...fast], 3000);
    expect(snap.stepMaxMs).toBe(2);
    expect(snap.stepAvgMs).toBeCloseTo(2, 5);
    expect(snap.fps).toBeCloseTo(60, 0);
  });

  it('adım süresi: ortalama ve en kötü', () => {
    const samples: PerfSample[] = [
      { time: 100, stepMs: 1 },
      { time: 200, stepMs: 3 },
      { time: 300, stepMs: 8 },
      { time: 400, stepMs: 0 },
    ];
    const snap = computePerf(samples, 400);
    expect(snap.stepAvgMs).toBe(3);
    expect(snap.stepMaxMs).toBe(8);
    expect(snap.frames).toBe(4);
    expect(snap.fps).toBeCloseTo(10, 5);
  });

  it('PerfMeter eski örnekleri atar (bellek sınırlı) ve aynı sonucu verir', () => {
    const meter = new PerfMeter();
    const all = steady(144, 20_000, 0.5);
    for (const s of all) meter.record(s.time, s.stepMs);
    const last = all[all.length - 1]!.time;
    const snap = meter.snapshot(last);
    expect(snap).toEqual(computePerf(all, last));
    expect(snap.frames).toBeLessThanOrEqual(Math.ceil((144 * PERF_WINDOW_MS) / 1000) + 1);
    expect(snap.fps).toBeCloseTo(144, 0);
  });

  it('panel metinleri tr.ts içindedir ve yer tutucular tanımlıdır', () => {
    expect(tr.debug.perfFrame).toContain('{fps}');
    expect(tr.debug.perfRender).toContain('{units}');
  });
});
