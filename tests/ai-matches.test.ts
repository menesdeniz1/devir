import { describe, expect, it } from 'vitest';
import type { Controller } from '../src/ai/controller';
import { createAiBot } from '../src/ai/strategy';
import { createRandomBot, createStackerBot } from '../src/ai/testBots';
import type { AiDifficulty } from '../src/data/types';
import { Session } from '../src/game/session';
import { stepMatch } from '../src/match/runner';
import { createMatch } from '../src/sim/create';
import { checkInvariants, goldBalanceProblems, StallDetector } from '../src/sim/invariants';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import type { GameState, SimEvent } from '../src/sim/types';

const DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];
/** 20 dk (tick). */
const LONG = 20 * 60 * 20;

interface Played {
  state: GameState;
  rejected: SimEvent[];
  built: [number, number];
  sold: [number, number];
  violations: string[];
}

function play(state: GameState, controllers: [Controller | null, Controller | null], maxTicks: number, checks = false): Played {
  const result: Played = { state, rejected: [], built: [0, 0], sold: [0, 0], violations: [] };
  const stall = new StallDetector();
  while (state.outcome === null && state.tick < maxTicks) {
    const gold: [number, number] = [state.sides[0].gold, state.sides[1].gold];
    const events = stepMatch(state, [], controllers);
    for (const e of events) {
      if (e.type === 'commandRejected') result.rejected.push(e);
      else if (e.type === 'towerBuilt') result.built[e.side] += 1;
      else if (e.type === 'towerSold') result.sold[e.side] += 1;
    }
    if (checks) {
      result.violations.push(...checkInvariants(state), ...goldBalanceProblems(gold, state, events));
      if (stall.observe(state, events)) result.violations.push(`kilitlenme tick ${state.tick}`);
    }
  }
  return result;
}

const produced = (s: GameState, side: 0 | 1): number => Object.values(s.sides[side].stats.produced).reduce((a, b) => a + b, 0);

describe('Yapay zekâ yalnız geçerli komut üretir (PRD R-02)', () => {
  it('bulanık maçlar: rastgele ek altın/deneyim ve karışık rakiplerle hiçbir yapay zekâ komutu reddedilmez, değişmezler tutar', () => {
    let games = 0;
    for (let g = 0; g < 18; g++) {
      const seed = 100 + g;
      const d = DIFFICULTIES[g % 3]!;
      const state = createMatch({ seed, opponent: d });
      const setup = rngFromSeed(seed);
      for (const side of [0, 1] as const) {
        state.sides[side].gold += rngInt(setup, 4000);
        state.sides[side].xp += rngInt(setup, 12000);
      }
      // Taraf 0: rastgele bot, yığan bot ya da başka bir zorluk (o zaman iki taraf da yapay zekâdır).
      const kind = g % 3;
      const side0: Controller = kind === 0 ? createRandomBot(seed, 0) : kind === 1 ? createStackerBot() : createAiBot(DIFFICULTIES[(g + 1) % 3]!, seed, 0);
      const r = play(state, [side0, createAiBot(d, seed, 1)], 9000, true);
      const aiRejected = r.rejected.filter((e) => e.type === 'commandRejected' && (e.command.side === 1 || kind === 2));
      expect(aiRejected, `oyun ${g}`).toEqual([]);
      expect(r.violations, `oyun ${g}`).toEqual([]);
      games += 1;
    }
    expect(games).toBe(18);
  });
});

describe('Her zorluk tüm eylem türlerini kullanır (uzun maç, PRD R-01)', () => {
  for (const d of DIFFICULTIES) {
    it(`${d}: birlik üretir, kule kurar, çağ atlar`, () => {
      let units = 0;
      let towers = 0;
      let ageUps = 0;
      // Kolay kuleyi yalnız üs canı yarıya inince kurar; bu yüzden güçlü rakiplere karşı da oynatılır.
      const opponents: AiDifficulty[] = ['normal', 'hard', 'easy'];
      for (let i = 0; i < 6; i++) {
        const seed = 40 + i;
        const state = createMatch({ seed, opponent: d });
        const r = play(state, [createAiBot(opponents[i % 3]!, seed, 0), createAiBot(d, seed, 1)], LONG);
        units += produced(r.state, 1);
        towers += r.built[1];
        ageUps += r.state.sides[1].stats.ageUpTicks.length;
        expect(r.rejected).toEqual([]);
      }
      expect(units).toBeGreaterThan(0);
      expect(towers).toBeGreaterThan(0);
      expect(ageUps).toBeGreaterThan(0);
    });
  }

  it('zor: eski çağ kulesini satıp yeniler (satış komutu kullanılır)', () => {
    let sold = 0;
    for (let i = 0; i < 8 && sold === 0; i++) {
      const seed = 70 + i;
      const r = play(createMatch({ seed, opponent: 'hard' }), [createAiBot('hard', seed, 0), createAiBot('hard', seed, 1)], LONG);
      sold += r.sold[0] + r.sold[1];
    }
    expect(sold).toBeGreaterThan(0);
  });

  it('pasif rakibe karşı her zorluk maçı bitirir', () => {
    for (const d of DIFFICULTIES) {
      const r = play(createMatch({ seed: 5, opponent: d }), [null, createAiBot(d, 5, 1)], LONG);
      expect(r.state.outcome, d).toMatchObject({ kind: 'win', winner: 1 });
    }
  });
});

describe('Oturum: oyunun varsayılan rakibi Normal yapay zekâdır', () => {
  it('varsayılan config.opponent normal; rakip birlik üretir; zorluk seçimi config üzerinden', () => {
    const session = new Session();
    expect(session.state.config.opponent).toBe('normal');
    for (let i = 0; i < 400; i++) session.advance(50);
    expect(produced(session.state, 1)).toBeGreaterThan(0);
    expect(session.state.ai[1]).not.toBeNull();
    for (const d of DIFFICULTIES) {
      const s = new Session({ opponent: d });
      for (let i = 0; i < 100; i++) s.advance(50);
      expect(s.state.config.opponent).toBe(d);
      expect(produced(s.state, 1)).toBeGreaterThan(0);
    }
    const none = new Session({ opponent: 'none' });
    for (let i = 0; i < 100; i++) none.advance(50);
    expect(produced(none.state, 1)).toBe(0);
  });
});
