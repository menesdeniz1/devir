import { describe, expect, it } from 'vitest';
import { buildObservation } from '../src/ai/observation';
import { chooseStance } from '../src/ai/strategy/army';
import { createAiBot } from '../src/ai/strategy';
import { initialMemory, readMemory, writeMemory } from '../src/ai/strategy/memory';
import { assessThreat } from '../src/ai/strategy/threat';
import { AI_PROFILES, AI_TUNING } from '../src/data/ai';
import type { AiDifficulty } from '../src/data/types';
import { stepMatch } from '../src/match/runner';
import { getTower, mustGetAge, mustGetUnit, secToTicks, unitOfRole } from '../src/sim/compile';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import type { Command, GameState, JsonValue, SideId } from '../src/sim/types';
import { addUnit, clone, spawnX } from './helpers';

const DIFFICULTIES: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];

/** Taraf 0 için koridorda, verilen rolden n birlik (sağa doğru dizili). */
function placeRole(s: GameState, side: SideId, role: 'front' | 'ranged' | 'heavy', n: number, startX: number): void {
  const type = unitOfRole(s.sides[side].age, role)!.def.id;
  for (let i = 0; i < n; i++) addUnit(s, side, startX + (side === 0 ? -i * 70 : i * 70), {}, type);
}

/** Hemen karar verecek bellek (boş bellekte ilk karar rastgele bir tick'e kayar; AI_TUNING.decisionJitter). */
function ready(seed: number, side: SideId): JsonValue {
  return writeMemory(initialMemory(seed, side));
}

function decide(s: GameState, side: SideId, difficulty: AiDifficulty, memory: JsonValue = ready(s.config.seed, side)) {
  return createAiBot(difficulty, s.config.seed, side).decide(buildObservation(s, side), memory, s.tick);
}

function aiMatch(seed: number, a: AiDifficulty, b: AiDifficulty): { state: GameState; controllers: [ReturnType<typeof createAiBot>, ReturnType<typeof createAiBot>] } {
  const state = createMatch({ seed, opponent: b });
  return { state, controllers: [createAiBot(a, seed, 0), createAiBot(b, seed, 1)] };
}

describe('K-13: yapay zekâ gizli bilgiye erişmez (GDD §9, TDD §5)', () => {
  it('K-13: karşı tarafın altını, deneyimi, kuyruğu, yetenek beklemesi ve istatistikleri farklı iki durumda kararlar ve bellek birebir aynı', () => {
    let casts = 0;
    for (const difficulty of DIFFICULTIES) {
      const { state, controllers } = aiMatch(11, 'normal', difficulty);
      let compared = 0;
      for (let t = 0; t < 9000 && state.outcome === null; t++) {
        if (t % 97 === 0) {
          const altered = clone(state);
          const hidden = altered.sides[0];
          hidden.gold += 4321;
          hidden.xp += 9876;
          hidden.queue.push({ unitId: 'primitive_heavy', progressTicks: 7, paid: 160 });
          hidden.stats.goldEarned += 5000;
          hidden.stats.kills['primitive_front'] = 99;
          hidden.abilityCooldown = hidden.abilityCooldown === 0 ? 777 : 0;
          expect(buildObservation(altered, 1)).toEqual(buildObservation(state, 1));
          const bot = createAiBot(difficulty, state.config.seed, 1);
          // Karar anı zorlanır (bellekteki next sıfırlanır) ki her örnekte gerçek bir karar karşılaştırılsın.
          const memory = state.ai[1] === null ? null : { ...(state.ai[1] as Record<string, JsonValue>), next: 0 };
          const before = JSON.stringify(memory);
          const ra = bot.decide(buildObservation(state, 1), memory, state.tick);
          const rb = bot.decide(buildObservation(altered, 1), memory, altered.tick);
          expect(rb).toEqual(ra);
          expect(JSON.stringify(memory)).toBe(before); // girdi belleği değişmez
          compared += 1;
          if (ra.commands.some((c) => c.type === 'castAbility')) casts += 1;
        }
        stepMatch(state, [], controllers);
      }
      expect(compared).toBeGreaterThan(20);
    }
    // Karşılaştırılan kararların bir kısmı yetenek kullanımıdır (yetenekli sürümle K-13).
    expect(casts).toBeGreaterThan(0);
  });
});

describe('Yapay zekâ belleği', () => {
  it('bellek düz JSON: gidiş-dönüşte birebir aynı; bozuk bellek başlangıç belleğine döner', () => {
    const { state, controllers } = aiMatch(3, 'hard', 'normal');
    for (let t = 0; t < 3000; t++) stepMatch(state, [], controllers);
    for (const side of [0, 1] as const) {
      const memory = state.ai[side];
      expect(memory).not.toBeNull();
      expect(JSON.parse(JSON.stringify(memory))).toEqual(memory);
      expect(writeMemory(readMemory(memory, 3, side))).toEqual(memory);
    }
    expect(readMemory('bozuk', 3, 0)).toEqual(initialMemory(3, 0));
    expect(readMemory({ rng: [1, 2] }, 3, 0)).toEqual(initialMemory(3, 0));
    // Taraflar ve tohumlar farklı rastgele akış alır.
    expect(initialMemory(3, 0).rng).not.toEqual(initialMemory(3, 1).rng);
    expect(initialMemory(3, 0).rng).not.toEqual(initialMemory(4, 0).rng);
  });

  it("kaydet-yükle: JSON'dan kurulan durum ve yalnız config'ten yeniden kurulan denetleyicilerle aynı son karma", () => {
    for (const [a, b] of [['easy', 'hard'], ['normal', 'normal'], ['hard', 'easy']] as const) {
      const straight = aiMatch(21, a, b);
      for (let t = 0; t < 8000 && straight.state.outcome === null; t++) stepMatch(straight.state, [], straight.controllers);

      const first = aiMatch(21, a, b);
      for (let t = 0; t < 3333; t++) stepMatch(first.state, [], first.controllers);
      const loaded = JSON.parse(JSON.stringify(first.state)) as GameState;
      const rebuilt: [ReturnType<typeof createAiBot>, ReturnType<typeof createAiBot>] = [
        createAiBot(a, loaded.config.seed, 0),
        createAiBot(b, loaded.config.seed, 1),
      ];
      for (let t = 3333; t < 8000 && loaded.outcome === null; t++) stepMatch(loaded, [], rebuilt);
      expect(stateHash(loaded)).toBe(stateHash(straight.state));
    }
  });

  it('aynı tohum aynı maç; farklı tohum farklı maç (rastgelelik yalnız bellekteki üreteçten)', () => {
    const run = (seed: number): string => {
      const m = aiMatch(seed, 'normal', 'normal');
      for (let t = 0; t < 6000 && m.state.outcome === null; t++) stepMatch(m.state, [], m.controllers);
      return stateHash(m.state);
    };
    expect(run(8)).toBe(run(8));
    expect(run(8)).not.toBe(run(9));
  });

  it("wantsDecision yalnız karar tick'inde true; arada decide boş komut ve aynı bellek döndürür", () => {
    const s = createMatch({ seed: 1, opponent: 'normal' });
    const bot = createAiBot('normal', 1, 1);
    const interval = secToTicks(AI_PROFILES.normal.decisionIntervalSec);
    const nextOf = (m: JsonValue): number => (m as { next: number }).next;
    // Boş bellek: ilk karar [0, aralık] içinde rastgele bir tick'e kayar.
    const first = bot.decide(buildObservation(s, 1), null, 0);
    expect(nextOf(first.memory)).toBeGreaterThanOrEqual(0);
    expect(nextOf(first.memory)).toBeLessThanOrEqual(Math.round(interval * (1 + AI_TUNING.decisionJitter)));
    // Karar tick'inde karar verilir; sonraki aralık ±decisionJitter içindedir.
    const t0 = Math.max(1, nextOf(first.memory));
    const second = bot.decide(buildObservation(s, 1), { ...(first.memory as Record<string, JsonValue>), next: t0 }, t0);
    const gap = nextOf(second.memory) - t0;
    expect(gap).toBeGreaterThanOrEqual(Math.round(interval * (1 - AI_TUNING.decisionJitter)));
    expect(gap).toBeLessThanOrEqual(Math.round(interval * (1 + AI_TUNING.decisionJitter)));
    const t1 = nextOf(second.memory);
    expect(bot.wantsDecision!(second.memory, t1 - 1)).toBe(false);
    expect(bot.wantsDecision!(second.memory, t1)).toBe(true);
    const between = bot.decide(buildObservation(s, 1), second.memory, t1 - 1);
    expect(between).toEqual({ commands: [], memory: second.memory });
  });
});

describe('Karar modülleri (GDD §9)', () => {
  it('tehdit: üsse yakın düşman gücü yakındaki kendi gücünü aşınca baskı; çok aşınca yüksek tehdit', () => {
    const s = createMatch({ seed: 1, opponent: 'normal' });
    const mem = initialMemory(1, 1);
    expect(assessThreat(buildObservation(s, 1), mem)).toMatchObject({ pressure: false, high: false });
    // Taraf 1'in üssüne yakın iki düşman ön hat birliği.
    placeRole(s, 0, 'front', 2, spawnX(1) - 100);
    const t = assessThreat(buildObservation(s, 1), mem);
    expect(t.nearEnemy).toBeGreaterThan(0);
    expect(t.pressure).toBe(true);
    expect(t.high).toBe(true);
    expect(t.enemyCount).toEqual({ front: 2, ranged: 0, heavy: 0 });
  });

  it('duruş: ön hat ağırlıklıya antiFront, saf ön hat yığınına antiSwarm, menzilliye antiRanged, ağır yığınına antiHeavy, kuleye yaslanana antiTower', () => {
    const stanceVs = (setup: (s: GameState) => void): string => {
      const s = createMatch({ seed: 1, opponent: 'normal' });
      setup(s);
      return chooseStance(assessThreat(buildObservation(s, 1), initialMemory(1, 1)));
    };
    expect(stanceVs(() => {})).toBe('opening');
    expect(stanceVs((s) => (placeRole(s, 0, 'front', 3, 900), placeRole(s, 0, 'heavy', 1, 700)))).toBe('antiFront');
    // Saf ön hat yığını (en az swarm.minUnits birlik): daha kalın ön hat dizisi.
    expect(stanceVs((s) => placeRole(s, 0, 'front', AI_TUNING.swarm.minUnits, 900))).toBe('antiSwarm');
    expect(stanceVs((s) => placeRole(s, 0, 'front', AI_TUNING.swarm.minUnits - 1, 900))).toBe('antiFront');
    expect(stanceVs((s) => (placeRole(s, 0, 'front', 3, 900), placeRole(s, 0, 'ranged', 2, 600)))).toBe('antiRanged');
    expect(stanceVs((s) => (placeRole(s, 0, 'front', 1, 900), placeRole(s, 0, 'heavy', 3, 800)))).toBe('antiHeavy');
    expect(
      stanceVs((s) => {
        for (let i = 0; i < AI_TUNING.siege.towers; i++) s.sides[0].slots[i] = { unlocked: true, tower: { type: 'primitive_tower_fast', paid: 120, cooldown: 0 } };
        placeRole(s, 0, 'front', AI_TUNING.siege.fewUnits - 1, 400);
      }),
    ).toBe('antiTower');
  });

  it('ordu: ön hat yığınına karşı ön hat, ağır yığınına karşı ön hat ağırlıklı, menzilli içerene ağır sipariş eder (Zor)', () => {
    const roles = (setup: (s: GameState) => void): string[] => {
      const s = createMatch({ seed: 2, opponent: 'hard' });
      s.sides[1].gold = 2000;
      setup(s);
      return decide(s, 1, 'hard')
        .commands.filter((c): c is Extract<Command, { type: 'queueUnit' }> => c.type === 'queueUnit')
        .map((c) => mustGetUnit(c.unitId).role);
    };
    const vsFront = roles((s) => placeRole(s, 0, 'front', 5, 900));
    expect(vsFront.length).toBeGreaterThan(0);
    expect(vsFront).toContain('ranged');
    for (const role of vsFront) expect(AI_TUNING.stances.antiSwarm).toContain(role);
    const vsHeavy = roles((s) => placeRole(s, 0, 'heavy', 4, 900));
    expect(vsHeavy).toContain('front');
    expect(vsHeavy).not.toContain('ranged');
    const vsRanged = roles((s) => (placeRole(s, 0, 'front', 3, 900), placeRole(s, 0, 'ranged', 2, 600)));
    expect(vsRanged).toContain('heavy');
    expect(vsRanged).not.toContain('ranged');
  });

  it('savunma: baskı altında yuva açar ve menzilli ağırlıklı düşmana ağır (B), ön hata hızlı (A) kule kurar', () => {
    const build = (role: 'front' | 'ranged'): Command[] => {
      const s = createMatch({ seed: 1, opponent: 'normal' });
      s.sides[1].gold = 1000;
      s.sides[1].slots[0]!.tower = { type: 'primitive_tower_fast', paid: 120, cooldown: 0 };
      placeRole(s, 0, role, 3, spawnX(1) - 120);
      return decide(s, 1, 'normal').commands.filter((c) => c.type === 'unlockSlot' || c.type === 'buildTower');
    };
    expect(build('ranged')).toEqual([
      { type: 'unlockSlot', side: 1, slot: 1 },
      { type: 'buildTower', side: 1, slot: 1, towerId: 'primitive_tower_heavy' },
    ]);
    expect(build('front')).toEqual([
      { type: 'unlockSlot', side: 1, slot: 1 },
      { type: 'buildTower', side: 1, slot: 1, towerId: 'primitive_tower_fast' },
    ]);
  });

  it('savunma politikaları: Kolay yalnız üs canı yarının altındayken ve yalnız yuva 1; Normal en çok 2 yuva', () => {
    const s = createMatch({ seed: 1, opponent: 'easy' });
    s.sides[1].gold = 5000;
    placeRole(s, 0, 'front', 3, spawnX(1) - 120);
    const towerCmds = (d: AiDifficulty, st: GameState) => decide(st, 1, d).commands.filter((c) => c.type === 'buildTower');
    expect(towerCmds('easy', s)).toEqual([]);
    s.sides[1].baseHp = Math.floor(s.sides[1].baseMaxHp * AI_PROFILES.easy.tower.hpTrigger) - 1;
    expect(towerCmds('easy', s)).toEqual([{ type: 'buildTower', side: 1, slot: 0, towerId: 'primitive_tower_fast' }]);
    s.sides[1].slots[0]!.tower = { type: 'primitive_tower_fast', paid: 120, cooldown: 0 };
    expect(towerCmds('easy', s)).toEqual([]);
    s.sides[1].slots[1] = { unlocked: true, tower: { type: 'primitive_tower_fast', paid: 120, cooldown: 0 } };
    expect(AI_PROFILES.normal.tower.maxSlots).toBe(2);
    expect(towerCmds('normal', s)).toEqual([]);
    expect(towerCmds('hard', s)).toHaveLength(1);
  });

  it('savunma: Zor, baskı yokken eski çağın kulesini satıp aynı türün güncel çağ kulesini kurar', () => {
    const s = createMatch({ seed: 1, opponent: 'hard' });
    s.sides[1].age = 2;
    s.sides[1].baseMaxHp = mustGetAge(2).baseMaxHp;
    s.sides[1].baseHp = s.sides[1].baseMaxHp;
    s.sides[1].gold = 1000;
    s.sides[1].slots[0]!.tower = { type: 'primitive_tower_heavy', paid: 160, cooldown: 0 };
    const cmds = decide(s, 1, 'hard').commands;
    expect(cmds.slice(0, 2)).toEqual([
      { type: 'sellTower', side: 1, slot: 0 },
      { type: 'buildTower', side: 1, slot: 0, towerId: 'ancient_tower_heavy' },
    ]);
    expect(getTower('ancient_tower_heavy')!.def.kind).toBe('heavy');
    // Normal yenilemez.
    expect(decide(s, 1, 'normal').commands.filter((c) => c.type === 'sellTower')).toEqual([]);
  });

  it('çağ: eşik geçince gecikme kadar bekler, sonra altın yetiyorsa atlar; yetmiyorsa ücreti biriktirir (sipariş yok)', () => {
    const next = mustGetAge(2);
    const s = createMatch({ seed: 4, opponent: 'normal' });
    s.sides[1].xp = next.xpThreshold;
    s.sides[1].gold = next.ageUpCost - 1;
    const bot = createAiBot('normal', 4, 1);
    let memory: JsonValue = null;
    const [lo, hi] = AI_PROFILES.normal.ageUpDelaySec;
    let tick = 0;
    let saw = { saving: false, ageUp: -1 };
    for (; tick <= secToTicks(hi) + 200; tick += 1) {
      s.tick = tick;
      if (!bot.wantsDecision!(memory, tick)) continue;
      const r = bot.decide(buildObservation(s, 1), memory, tick);
      memory = r.memory;
      if (tick < secToTicks(lo)) expect(r.commands.some((c) => c.type === 'ageUp')).toBe(false);
      if (tick > secToTicks(hi) && !saw.saving) {
        // Gecikme bitti, altın yetmiyor: biriktirir (hiç harcama yok).
        expect(r.commands).toEqual([]);
        saw.saving = true;
        s.sides[1].gold = next.ageUpCost;
      } else if (saw.saving && r.commands.some((c) => c.type === 'ageUp')) {
        saw = { ...saw, ageUp: tick };
        break;
      }
    }
    expect(saw.saving).toBe(true);
    expect(saw.ageUp).toBeGreaterThan(secToTicks(lo));
  });

  it('tek rol kilidi (GDD §10 ölçüm botu) yalnız o rolü sipariş eder', () => {
    const s = createMatch({ seed: 1, opponent: 'none' });
    s.sides[1].gold = 3000;
    placeRole(s, 0, 'heavy', 3, 900);
    const cmds = createAiBot('normal', 1, 1, { roleLock: 'ranged' }).decide(buildObservation(s, 1), ready(1, 1), 0).commands;
    const queued = cmds.filter((c): c is Extract<Command, { type: 'queueUnit' }> => c.type === 'queueUnit');
    expect(queued.length).toBeGreaterThan(0);
    for (const c of queued) expect(mustGetUnit(c.unitId).role).toBe('ranged');
  });
});
