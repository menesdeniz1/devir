import { describe, expect, it } from 'vitest';
import { createBasicBot } from '../src/ai/basicBot';
import { WORLD } from '../src/data/world';
import { createLoopConfig, FixedStepLoop, startFrameLoop, type FrameClock } from '../src/game/loop';
import { Session } from '../src/game/session';
import { stepMatch } from '../src/match/runner';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import type { Command } from '../src/sim/types';
import { FRONT_ID } from './helpers';
import { jitterFrames, steadyFrames } from './frames';

const TEN_SECONDS_MS = 10_000;
const EXPECTED_TICKS = (TEN_SECONDS_MS / 1000) * WORLD.tickRate;

const STREAMS: { name: string; frames: number[] }[] = [
  { name: '30 fps', frames: steadyFrames(30, TEN_SECONDS_MS) },
  { name: '60 fps', frames: steadyFrames(60, TEN_SECONDS_MS) },
  { name: '144 fps', frames: steadyFrames(144, TEN_SECONDS_MS) },
  { name: 'titreşimli (5-60 ms) #1', frames: jitterFrames(1, TEN_SECONDS_MS) },
  { name: 'titreşimli (5-60 ms) #2', frames: jitterFrames(99, TEN_SECONDS_MS) },
];

/** Tick -> komut betiği (yalnızca oyuncu tarafı). */
const SCRIPT: [number, Command][] = [
  [3, { type: 'queueUnit', side: 0, unitId: FRONT_ID }],
  [7, { type: 'queueUnit', side: 0, unitId: FRONT_ID }],
  [8, { type: 'queueUnit', side: 0, unitId: FRONT_ID }],
  [40, { type: 'queueUnit', side: 0, unitId: FRONT_ID }],
  [41, { type: 'queueUnit', side: 0, unitId: FRONT_ID }],
  [120, { type: 'queueUnit', side: 0, unitId: FRONT_ID }],
  [199, { type: 'queueUnit', side: 0, unitId: FRONT_ID }],
];

function playSession(frames: readonly number[]): Session {
  const session = new Session();
  session.debugMutate((s) => {
    s.sides[0].gold += 2000;
  });
  for (const [tick, command] of SCRIPT) session.submit(command, tick);
  for (const f of frames) session.advance(f);
  return session;
}

/** Başsız referans: aynı betik doğrudan stepMatch ile. */
function headlessReference(ticks: number): string {
  const state = createMatch({ seed: 1, opponent: 'basic-bot' });
  state.sides[0].gold += 2000;
  const bot = createBasicBot();
  for (let t = 0; t < ticks; t++) {
    const due = SCRIPT.filter(([tick]) => tick === t).map(([, c]) => c);
    stepMatch(state, due, [null, bot]);
  }
  return stateHash(state);
}

describe('K-09: oyun hızı kare hızından bağımsızdır', () => {
  it('K-09: sentetik kare akışlarının toplamı 10 sn ve beklenen tick sayısı 200', () => {
    expect(EXPECTED_TICKS).toBe(200);
    for (const s of STREAMS) {
      expect(
        s.frames.reduce((a, b) => a + b, 0),
        s.name,
      ).toBe(TEN_SECONDS_MS);
    }
  });

  it('K-09: 30/60/144 fps ve titreşimli akışlar aynı tick sayısını verir', () => {
    for (const s of STREAMS) {
      const session = new Session();
      for (const f of s.frames) session.advance(f);
      expect(session.tick, s.name).toBe(EXPECTED_TICKS);
    }
  });

  it('K-09: aynı komut betiği tüm akışlarda aynı son durum karmasını verir (ve başsız referansla eşittir)', () => {
    const reference = headlessReference(EXPECTED_TICKS);
    for (const s of STREAMS) {
      const session = playSession(s.frames);
      expect(session.tick, s.name).toBe(EXPECTED_TICKS);
      expect(stateHash(session.state), s.name).toBe(reference);
      // Betik gerçekten uygulanmış olmalı.
      expect(session.state.sides[0].stats.goldSpent, s.name).toBeGreaterThan(0);
    }
  });

  it('K-09: kare başına süre 250 ms ile kırpılır (uzun duraksama sonrası ölüm sarmalı yok)', () => {
    const config = createLoopConfig(WORLD.tickRate);
    let steps = 0;
    const loop = new FixedStepLoop(config, () => void (steps += 1));
    expect(loop.advance(60_000)).toBe((250 / config.stepMs));
    expect(steps).toBe(5);
    // Negatif ve sonsuz süreler adım üretmez.
    expect(loop.advance(-5)).toBe(0);
    expect(loop.advance(Number.NaN)).toBe(0);
  });

  it('K-09: render alpha = biriktirici / adım süresi', () => {
    const config = createLoopConfig(WORLD.tickRate);
    const loop = new FixedStepLoop(config, () => undefined);
    expect(config.stepMs).toBe(50);
    loop.advance(30);
    expect(loop.alpha).toBeCloseTo(0.6, 10);
    loop.advance(40); // 70 -> 1 adım, 20 kalır
    expect(loop.alpha).toBeCloseTo(0.4, 10);
  });

  it('K-09: hız çarpanı kare başına adım sayısını çarpar', () => {
    const config = createLoopConfig(WORLD.tickRate);
    let steps = 0;
    const loop = new FixedStepLoop(config, () => void (steps += 1));
    loop.setSpeed(4);
    loop.advance(100); // 2 adım x4
    expect(steps).toBe(8);
  });

  it('K-09: sahte saat ile kare döngüsü ilk karede 0 ms, sonra gerçek farkı verir ve durdurulabilir', () => {
    let now = 1000;
    let pending: (() => void) | null = null;
    const clock: FrameClock = {
      now: () => now,
      requestFrame: (cb) => {
        pending = cb;
        return 1;
      },
      cancelFrame: () => {
        pending = null;
      },
    };
    const seen: number[] = [];
    const stop = startFrameLoop(clock, (ms) => seen.push(ms));
    const pump = (dt: number): void => {
      now += dt;
      const cb = pending;
      pending = null;
      cb?.();
    };
    pump(0);
    pump(16);
    pump(33);
    expect(seen).toEqual([0, 16, 33]);
    stop();
    pump(10);
    expect(seen.length).toBe(3);
  });
});
