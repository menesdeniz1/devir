import { describe, expect, it } from 'vitest';
import { buildObservation } from '../src/ai/observation';
import { createAiBot } from '../src/ai/strategy';
import { AI_PROFILES } from '../src/data/ai';
import type { AiDifficulty } from '../src/data/types';
import { stepMatch } from '../src/match/runner';
import { abilityOfAge, mustGetUnit, secToTicks, unitOfRole } from '../src/sim/compile';
import { createMatch } from '../src/sim/create';
import type { Command, GameState, JsonValue, SideId } from '../src/sim/types';
import { addUnit, setAge } from './helpers';

const DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];

/** Taraf 0'ın, merkezi `x` olan sıkışık ön hat kümesi (n birlik, aralık 42). */
function cluster(s: GameState, n: number, x: number, role: 'front' | 'ranged' | 'heavy' = 'front'): void {
  const type = unitOfRole(s.sides[0].age, role)!.def.id;
  const step = mustGetUnit(type).def.width + 6;
  for (let i = 0; i < n; i++) addUnit(s, 0, x + (i - (n - 1) / 2) * step, { mode: 'walk' }, type);
}

const casts = (cmds: Command[]) => cmds.filter((c): c is Extract<Command, { type: 'castAbility' }> => c.type === 'castAbility');

/** Yetenek hazırken taraf 1'in kararı; tepki gecikmesi geçene kadar karar tick'leri ilerletilir. */
function castOf(s: GameState, d: AiDifficulty, maxSec = 20): Extract<Command, { type: 'castAbility' }> | undefined {
  const bot = createAiBot(d, s.config.seed, 1);
  let memory: JsonValue = null;
  const start = s.tick;
  for (let t = start; t <= start + secToTicks(maxSec); t++) {
    if (!bot.wantsDecision!(memory, t)) continue;
    s.tick = t;
    const r = bot.decide(buildObservation(s, 1), memory, t);
    memory = r.memory;
    const c = casts(r.commands)[0];
    if (c !== undefined) return c;
  }
  return undefined;
}

describe('Yapay zekâ yeteneği (GDD §9 modül 5)', () => {
  it('bekleme sürerken yetenek komutu vermez; bitince kümenin üstüne kullanır', () => {
    for (const d of DIFFICULTIES) {
      const s = createMatch({ seed: 3, opponent: d });
      cluster(s, 5, 1300);
      expect(s.sides[1].abilityCooldown).toBeGreaterThan(0);
      expect(castOf(s, d, 5), d).toBeUndefined();
      s.sides[1].abilityCooldown = 0;
      const c = castOf(s, d);
      expect(c, d).toBeDefined();
      const half = abilityOfAge(1)!.def.width / 2;
      const jitter = AI_PROFILES[d].ability.aimJitter;
      // Merkez kümeyi kapsar (Kolay için sapma payı kadar).
      expect(Math.abs(c!.x - 1300)).toBeLessThanOrEqual(half + jitter);
    }
  });

  it('Normal: tek hedefe kullanmaz (≥3 hedef ya da değer eşiği), Kolay ≥1 hedefe kullanır', () => {
    const s = createMatch({ seed: 3, opponent: 'normal' });
    s.sides[1].abilityCooldown = 0;
    cluster(s, 1, 1000);
    expect(castOf(s, 'normal', 5)).toBeUndefined();
    expect(castOf(s, 'easy', 20)).toBeDefined();
  });

  it('Zor, üsse yakın düşmana öncelik verir (savunma); Normal ile aynı değerli uzak kümeye karşı', () => {
    const s = createMatch({ seed: 3, opponent: 'hard' });
    s.sides[1].abilityCooldown = 0;
    cluster(s, 4, 800); // uzak küme
    cluster(s, 3, 1600); // taraf 1 üssüne yakın küme
    const hard = castOf(s, 'hard')!;
    expect(hard.x).toBeGreaterThan(1400);
  });

  it('Zor, gecikmeli vuruşta (Baraj Ateşi) yürüyen hedefin ilerlemesini öngörür', () => {
    const s = createMatch({ seed: 3, opponent: 'hard' });
    setAge(s, 0, 4);
    setAge(s, 1, 4);
    s.sides[1].abilityCooldown = 0;
    expect(abilityOfAge(4)!.delayTicks).toBeGreaterThan(0);
    cluster(s, 4, 900);
    const hard = castOf(s, 'hard')!;
    const normal = castOf(s, 'normal')!;
    // Taraf 0 birlikleri +x yönüne yürür; Zor'un nişanı daha ileride.
    expect(hard.x).toBeGreaterThan(normal.x);
  });

  it('maçta her zorluk yetenek kullanır ve yetenek komutu hiç reddedilmez', () => {
    for (const d of DIFFICULTIES) {
      const s = createMatch({ seed: 9, opponent: d });
      const controllers = [createAiBot('normal', 9, 0), createAiBot(d, 9, 1)] as const;
      let cast = 0;
      for (let t = 0; t < 12000 && s.outcome === null; t++) {
        for (const e of stepMatch(s, [], [controllers[0], controllers[1]])) {
          if (e.type === 'abilityCast' && e.side === (1 as SideId)) cast += 1;
          if (e.type === 'commandRejected') throw new Error(`${d}: ${e.command.type} reddedildi (${e.reason})`);
        }
      }
      expect(cast, d).toBeGreaterThan(0);
    }
  });
});
