import { describe, expect, it } from 'vitest';
import { createBasicBot } from '../src/ai/basicBot';
import { buildObservation } from '../src/ai/observation';
import { createMonoBot, createRandomBot, createStackerBot } from '../src/ai/testBots';
import { BASIC_BOT } from '../src/data/ai';
import type { Role } from '../src/data/types';
import { stepMatch } from '../src/match/runner';
import { mustGetUnit, unitOfRole } from '../src/sim/compile';
import { createMatch } from '../src/sim/create';
import { checkInvariants } from '../src/sim/invariants';
import type { JsonValue, SimEvent } from '../src/sim/types';

const ROLES: readonly Role[] = ['front', 'ranged', 'heavy'];

function queuedUnits(events: SimEvent[], side: 0 | 1): string[] {
  return events.flatMap((e) => (e.type === 'unitQueued' && e.side === side ? [e.unitId] : []));
}

describe('Basit bot: BASIC_BOT.composition sırasını döngüsel izler', () => {
  it('bol altınla sipariş sırası composition rollerinin güncel çağdaki birlikleridir ve baştan tekrarlanır', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    s.sides[1].gold = 100_000;
    const bot = createBasicBot();
    const ordered: string[] = [];
    for (let t = 0; t < 3000; t++) {
      ordered.push(...queuedUnits(stepMatch(s, [], [null, bot]), 1));
    }
    const seq = BASIC_BOT.composition;
    expect(ordered.length).toBeGreaterThan(seq.length * 2);
    ordered.forEach((unitId, i) => {
      expect(unitId, `sipariş ${i}`).toBe(unitOfRole(1, seq[i % seq.length]!)!.def.id);
    });
    // Üç rol de üretildi.
    expect(new Set(ordered.map((id) => mustGetUnit(id).role))).toEqual(new Set(ROLES));
  });

  it('altın yetmezse sırayı atlamadan bekler; yetince aynı rolü sipariş eder', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    const bot = createBasicBot();
    // Sıra indeksi 2 → 'ranged' (70); altın 60: 'front' (50) karşılanabilir ama atlanmamalı.
    const memory: JsonValue = { nextDecisionTick: 0, sequenceIndex: 2 };
    s.sides[1].gold = 60;
    const waiting = bot.decide(buildObservation(s, 1), memory, 0);
    expect(waiting.commands).toEqual([]);
    expect((waiting.memory as { sequenceIndex: number }).sequenceIndex).toBe(2);

    s.sides[1].gold = 70;
    const ordering = bot.decide(buildObservation(s, 1), memory, 0);
    expect(ordering.commands).toEqual([{ type: 'queueUnit', side: 1, unitId: unitOfRole(1, 'ranged')!.def.id }]);
    expect((ordering.memory as { sequenceIndex: number }).sequenceIndex).toBe(3);
  });

  it('wantsDecision kancası korunur: karar zamanı gelmeden decide çağrılmaz, gelince çağrılır', () => {
    const bot = createBasicBot();
    expect(bot.wantsDecision).toBeDefined();
    const memory: JsonValue = { nextDecisionTick: 100, sequenceIndex: 0 };
    expect(bot.wantsDecision!(memory, 99)).toBe(false);
    expect(bot.wantsDecision!(memory, 100)).toBe(true);
    expect(bot.wantsDecision!(null, 0)).toBe(true);
  });

  it('saf: aynı gözlem ve bellek aynı sonucu verir; girdiyi değiştirmez', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    s.sides[1].gold = 1000;
    const bot = createBasicBot();
    const obs = buildObservation(s, 1);
    const memory: JsonValue = { nextDecisionTick: 0, sequenceIndex: 4 };
    const memoryCopy = JSON.parse(JSON.stringify(memory)) as JsonValue;
    const a = bot.decide(obs, memory, 0);
    const b = bot.decide(obs, memory, 0);
    expect(b).toEqual(a);
    expect(memory).toEqual(memoryCopy);
  });
});

describe('Test botları', () => {
  it('tek rol botu yalnız o rolü üretir (her rol için)', () => {
    for (const role of ROLES) {
      const s = createMatch({ seed: 5, opponent: 'none' });
      s.sides[0].gold = 100_000;
      const bot = createMonoBot(role);
      expect(bot.id).toBe(`mono-${role}`);
      const ordered: string[] = [];
      for (let t = 0; t < 1500; t++) {
        ordered.push(...queuedUnits(stepMatch(s, [], [bot, null]), 0));
        expect(checkInvariants(s)).toEqual([]);
      }
      expect(ordered.length).toBeGreaterThan(5);
      expect(new Set(ordered.map((id) => mustGetUnit(id).role))).toEqual(new Set([role]));
      const produced = s.sides[0].stats.produced;
      for (const other of ROLES.filter((r) => r !== role)) {
        expect(produced[unitOfRole(1, other)!.def.id]).toBe(0);
      }
    }
  });

  it('yığan bot altın karışımın bedeline ulaşana kadar bekler, sonra üç rolü de içeren karışımı sıralar', () => {
    const s = createMatch({ seed: 5, opponent: 'none' });
    const bot = createStackerBot();
    s.sides[0].gold = 100;
    expect(bot.decide(buildObservation(s, 0), null, 0).commands).toEqual([]);
    s.sides[0].gold = 100_000;
    const { commands } = bot.decide(buildObservation(s, 0), null, 0);
    expect(commands.length).toBeGreaterThanOrEqual(3);
    expect(commands.length).toBeLessThanOrEqual(5);
    const roles = new Set(commands.map((c) => (c.type === 'queueUnit' ? mustGetUnit(c.unitId).role : null)));
    expect(roles).toEqual(new Set(ROLES));
    // Kuyruk doluyken yeni sipariş vermez.
    s.sides[0].queue.push({ unitId: commands[0]!.type === 'queueUnit' ? commands[0]!.unitId : '', progressTicks: 0, paid: 1 });
    expect(bot.decide(buildObservation(s, 0), null, 0).commands).toEqual([]);
  });

  it('rastgele bot çağın üç birliğini de seçer', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 4; seed++) {
      const s = createMatch({ seed, opponent: 'none' });
      s.sides[0].gold = 100_000;
      s.sides[1].gold = 100_000;
      const controllers = [createRandomBot(seed, 0), createRandomBot(seed, 1)] as const;
      for (let t = 0; t < 2000; t++) {
        const events = stepMatch(s, [], controllers);
        for (const id of [...queuedUnits(events, 0), ...queuedUnits(events, 1)]) seen.add(id);
      }
    }
    expect([...seen].sort()).toEqual(['primitive_front', 'primitive_heavy', 'primitive_ranged']);
  });
});
