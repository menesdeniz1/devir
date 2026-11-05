import { describe, expect, it } from 'vitest';
import { createSave, parseSave, serializeSave } from '../src/game/save';
import { Session } from '../src/game/session';
import { stateHash } from '../src/sim/hash';
import { checkInvariants } from '../src/sim/invariants';
import type { Command } from '../src/sim/types';
import { FRONT_ID } from './helpers';

/** Her kare tam bir tick ilerletir (stepMs = 50). */
const FRAME_MS = 50;
const SPLIT_TICKS = 900;
const TOTAL_TICKS = 2200;

/** Sabit komut programı: oyuncu belirli tick'lerde birlik üretir ve deneyim/altın alır. */
function script(tick: number): Command[] {
  if (tick % 40 === 0) return [{ type: 'queueUnit', side: 0, unitId: FRONT_ID }];
  return [];
}

function play(session: Session, fromTick: number, toTick: number): void {
  for (let tick = fromTick; tick < toTick; tick++) {
    for (const command of script(tick)) session.submit(command);
    session.advance(FRAME_MS);
  }
}

function newSession(opponent: 'easy' | 'normal' | 'hard', seed: number): Session {
  const session = new Session({ seed, opponent });
  session.debugMutate((s) => void (s.sides[0].gold += 3000));
  return session;
}

describe('K-07: kaydedilip yüklenen maç kesintisiz maçla aynı durumu üretir', () => {
  for (const opponent of ['easy', 'normal', 'hard'] as const) {
    it(`${opponent} rakibiyle: kesintisiz koşu = kaydet-yükle-devam koşusu (JSON dönüşümü dahil)`, () => {
      // Kesintisiz koşu.
      const straight = newSession(opponent, 11);
      play(straight, 0, TOTAL_TICKS);

      // Ortada kaydet → metne çevir → doğrulayıp yükle → yepyeni oturumla devam et.
      const first = newSession(opponent, 11);
      play(first, 0, SPLIT_TICKS);
      expect(first.tick).toBe(SPLIT_TICKS);
      const text = serializeSave(createSave(first.state, '0.1.0', 0));
      const loaded = parseSave(text, '0.1.0');
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(stateHash(loaded.save.state)).toBe(stateHash(first.state));

      const second = new Session({ seed: 0, opponent: 'none' });
      second.startMatch(loaded.save.matchConfig, loaded.save.state);
      expect(second.tick).toBe(SPLIT_TICKS);
      play(second, SPLIT_TICKS, TOTAL_TICKS);

      expect(second.tick).toBe(straight.tick);
      expect(stateHash(second.state)).toBe(stateHash(straight.state));
      expect(checkInvariants(second.state)).toEqual([]);
      // Maç bir şey yapmış olmalı (boş koşu karşılaştırması anlamsız olurdu).
      expect(straight.state.units.length + straight.state.sides[0].stats.produced[FRONT_ID]!).toBeGreaterThan(0);
    });
  }

  it('birden çok kesinti: her 300 tick kaydet-yükle, sonuç değişmez', () => {
    const straight = newSession('normal', 5);
    play(straight, 0, 1500);

    let session = newSession('normal', 5);
    for (let from = 0; from < 1500; from += 300) {
      play(session, from, from + 300);
      const parsed = parseSave(serializeSave(createSave(session.state, '0.1.0', from)), '0.1.0');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const next = new Session({ opponent: 'none' });
      next.startMatch(parsed.save.matchConfig, parsed.save.state);
      session = next;
    }
    expect(stateHash(session.state)).toBe(stateHash(straight.state));
  });

  it('yapay zekâ belleği durumdadır: yüklenen maçta rakip denetleyici aynı kararları verir', () => {
    const first = newSession('hard', 3);
    play(first, 0, 600);
    expect(first.state.ai[1]).not.toBeNull();
    const parsed = parseSave(serializeSave(createSave(first.state, '0.1.0', 0)), '0.1.0');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.state.ai).toEqual(first.state.ai);
  });
});
