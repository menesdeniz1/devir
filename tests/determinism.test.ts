import { describe, expect, it } from 'vitest';
import { buildObservation } from '../src/ai/observation';
import { createBasicBot } from '../src/ai/basicBot';
import type { Controller } from '../src/ai/controller';
import { createRandomBot, createStackerBot } from '../src/ai/testBots';
import { UNITS } from '../src/data/units';
import { AGES } from '../src/data/ages';
import { WORLD, ECONOMY } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import type { Command, GameState, JsonValue } from '../src/sim/types';
import { BOT_KINDS, FRONT_ID, clone, makeControllers, newState } from './helpers';

function commandScript(seed: number, ticks: number): Map<number, Command[]> {
  const rng = rngFromSeed(seed * 31 + 5);
  const script = new Map<number, Command[]>();
  for (let t = 0; t < ticks; t++) {
    if (rngInt(rng, 40) !== 0) continue;
    script.set(t, [
      rngInt(rng, 4) === 0
        ? { type: 'cancelOrder', side: 0, index: rngInt(rng, 3) }
        : { type: 'queueUnit', side: rngInt(rng, 2) as 0 | 1, unitId: FRONT_ID },
    ]);
  }
  return script;
}

function run(seed: number, ticks: number, kind: (typeof BOT_KINDS)[number], reloadAt: number[]): string {
  let s: GameState = createMatch({ seed, opponent: 'none' });
  s.sides[0].gold += 1500;
  s.sides[1].gold += 1500;
  let controllers = makeControllers(kind, seed);
  const script = commandScript(seed, ticks);
  for (let t = 0; t < ticks; t++) {
    if (reloadAt.includes(t)) {
      // Kaydet-yükle: yalnızca JSON üzerinden; denetleyiciler sıfırdan kurulur (tüm bellek durumda olmalı).
      s = JSON.parse(JSON.stringify(s)) as GameState;
      controllers = makeControllers(kind, seed);
    }
    stepMatch(s, script.get(t) ?? [], controllers);
  }
  return stateHash(s);
}

describe('K-08: yeni maç temizdir', () => {
  it('K-08: iki createMatch aynı karmayı verir; biri değişince diğeri ve veri dosyaları etkilenmez', () => {
    const unitsBefore = JSON.stringify(UNITS);
    const agesBefore = JSON.stringify(AGES);
    const worldBefore = JSON.stringify([WORLD, ECONOMY]);
    const a = createMatch({ seed: 7, opponent: 'basic-bot' });
    const b = createMatch({ seed: 7, opponent: 'basic-bot' });
    expect(stateHash(a)).toBe(stateHash(b));
    const hashB = stateHash(b);

    a.sides[0].gold = 9999;
    a.sides[0].queue.push({ unitId: FRONT_ID, progressTicks: 3, paid: 50 });
    a.sides[0].stats.produced[FRONT_ID] = 5;
    a.sides[1].stats.kills[FRONT_ID] = 2;
    a.units.push({ id: 99, side: 0, type: FRONT_ID, x: 1, hp: 1, cooldown: 0, mode: 'wait' });
    a.config.seed = 123;
    a.ai[1] = { nextDecisionTick: 5 };

    expect(stateHash(b)).toBe(hashB);
    expect(a.sides[0]).not.toBe(b.sides[0]);
    expect(a.sides[0].queue).not.toBe(b.sides[0].queue);
    expect(a.sides[0].stats).not.toBe(b.sides[0].stats);
    expect(a.sides[0].stats.produced).not.toBe(b.sides[0].stats.produced);
    expect(JSON.stringify(UNITS)).toBe(unitsBefore);
    expect(JSON.stringify(AGES)).toBe(agesBefore);
    expect(JSON.stringify([WORLD, ECONOMY])).toBe(worldBefore);

    // Oynanmış bir maçtan sonra yeni maç yine ilk karmaya eşit.
    const played = createMatch({ seed: 7, opponent: 'basic-bot' });
    const controllers = makeControllers('stacker-basic', 7);
    for (let t = 0; t < 1000; t++) stepMatch(played, [], controllers);
    expect(stateHash(createMatch({ seed: 7, opponent: 'basic-bot' }))).toBe(hashB);
  });

  it('K-08: durum düz JSON verisidir (kaydet-yükle birebir aynı)', () => {
    const s = createMatch({ seed: 3, opponent: 'none' });
    const controllers = makeControllers('random-random', 3);
    for (let t = 0; t < 800; t++) stepMatch(s, [], controllers);
    expect(s).toStrictEqual(JSON.parse(JSON.stringify(s)));
  });
});

describe('Determinizm (K-07 temeli)', () => {
  it('K-07: aynı tohum ve aynı komut betiği aynı son karmayı verir', () => {
    for (const kind of BOT_KINDS) {
      const h1 = run(11, 3000, kind, []);
      const h2 = run(11, 3000, kind, []);
      expect(h1).toBe(h2);
    }
    expect(run(11, 3000, 'random-random', [])).not.toBe(run(12, 3000, 'random-random', []));
  });

  it('K-07: ortada kaydet-yükle yapılan koşu kesintisiz koşuyla aynı karmayı verir', () => {
    for (const kind of BOT_KINDS) {
      const straight = run(21, 4000, kind, []);
      expect(run(21, 4000, kind, [1000])).toBe(straight);
      expect(run(21, 4000, kind, [333, 1500, 2999])).toBe(straight);
    }
  });
});

describe('Rastgele bot: yalnız config’ten yeniden kurulabilirlik', () => {
  it('K-07: maç ortasında JSON kaydet-yükle + denetleyicileri yalnız yüklenen config’ten kur → kesintisiz koşuyla aynı son karma', () => {
    const total = 3000;
    const kinds = ['random-random', 'random-basic', 'stacker-random'] as const;
    for (const kind of kinds) {
      for (const seed of [31, 32]) {
        const fresh = (): GameState => {
          const st = createMatch({ seed, opponent: kind === 'random-basic' ? 'basic-bot' : 'none' });
          st.sides[0].gold += 1500;
          st.sides[1].gold += 1500;
          return st;
        };
        const straight = fresh();
        const sc = makeControllers(kind, straight.config.seed);
        for (let t = 0; t < total; t++) stepMatch(straight, [], sc);

        for (const cut of [1, 777, 2000]) {
          let st = fresh();
          let controllers = makeControllers(kind, st.config.seed);
          for (let t = 0; t < cut; t++) stepMatch(st, [], controllers);
          const saved = JSON.stringify(st);
          st = JSON.parse(saved) as GameState;
          // Yalnızca yüklenen durumun config'i kullanılır; yapıcıya başka hiçbir bilgi verilmez.
          controllers = makeControllers(kind, st.config.seed);
          for (let t = cut; t < total; t++) stepMatch(st, [], controllers);
          expect(stateHash(st), `${kind} tohum ${seed} kesim ${cut}`).toBe(stateHash(straight));
        }
      }
    }
  });

  it('rastgele botun ilk kararı yalnız (config.seed, taraf) çiftine bağlıdır; iki taraf ve iki tohum farklı akış verir', () => {
    const s = newState(9);
    s.sides[0].gold = 5000;
    const obs0 = buildObservation(s, 0);
    const first = (seed: number, side: 0 | 1) => {
      const bot = createRandomBot(seed, side);
      let memory: JsonValue = null;
      const out: string[] = [];
      for (let t = 0; t < 400; t++) {
        const r = bot.decide(buildObservation(s, side), memory, t);
        memory = r.memory;
        if (r.commands.length > 0) out.push(`${t}:${JSON.stringify(r.commands)}`);
      }
      return out.join('|') + JSON.stringify(memory);
    };
    expect(obs0.tick).toBe(0);
    expect(first(9, 0)).toBe(first(9, 0));
    expect(first(9, 0)).not.toBe(first(9, 1));
    expect(first(9, 0)).not.toBe(first(10, 0));
  });
});

describe('wantsDecision kancası', () => {
  it('kanca yalnızca gereksiz çağrıları eler: aynı son karma, daha az decide çağrısı', () => {
    const play = (withHook: boolean): { hash: string; calls: number } => {
      const s = createMatch({ seed: 4, opponent: 'basic-bot' });
      s.sides[0].gold += 1000;
      const real = createBasicBot();
      let calls = 0;
      const bot: Controller = {
        id: real.id,
        decide(obs, memory, tick) {
          calls += 1;
          return real.decide(obs, memory, tick);
        },
        ...(withHook && real.wantsDecision !== undefined ? { wantsDecision: real.wantsDecision.bind(real) } : {}),
      };
      const controllers: [Controller, Controller] = [createStackerBot(), bot];
      for (let t = 0; t < 4000; t++) stepMatch(s, [], controllers);
      return { hash: stateHash(s), calls };
    };
    expect(createBasicBot().wantsDecision).toBeDefined();
    const without = play(false);
    const withHook = play(true);
    expect(withHook.hash).toBe(without.hash);
    expect(without.calls).toBe(4000);
    expect(withHook.calls).toBeLessThan(without.calls / 10);
    expect(withHook.calls).toBeGreaterThan(0);
  });
});

describe('K-13 (erken): gizli bilgi', () => {
  it('K-13: basicBot kararları oyuncunun altını, deneyimi ve kuyruğu farklı iki durumda birebir aynıdır', () => {
    const base = createMatch({ seed: 5, opponent: 'basic-bot' });
    const controllers = makeControllers('stacker-basic', 5);
    for (let t = 0; t < 500; t++) stepMatch(base, [], controllers);

    const altered = clone(base);
    altered.sides[0].gold += 777;
    altered.sides[0].xp += 321;
    altered.sides[0].queue.push({ unitId: FRONT_ID, progressTicks: 4, paid: 50 });
    altered.sides[0].stats.goldEarned += 1000;
    altered.sides[0].stats.kills[FRONT_ID] = 40;

    const obsA = buildObservation(base, 1);
    const obsB = buildObservation(altered, 1);
    expect(obsB).toEqual(obsA);

    const bot = createBasicBot();
    for (const memory of [null, { nextDecisionTick: 0 }, { nextDecisionTick: 99999 }]) {
      const before = JSON.stringify([obsA, memory]);
      const ra = bot.decide(obsA, memory, base.tick);
      const rb = bot.decide(obsB, memory, altered.tick);
      expect(rb).toEqual(ra);
      expect(JSON.stringify([obsA, memory])).toBe(before); // girdiyi değiştirmez
    }

    // Çok adımlı: oyuncu tarafı farklıysa bile bot tarafının kararları gözlemden ibarettir.
    const decide = (st: GameState) => bot.decide(buildObservation(st, 1), st.ai[1], st.tick);
    expect(decide(altered)).toEqual(decide(base));
  });

  it('K-13: gözlem karşı tarafın altın, deneyim ve kuyruk alanlarını içermez', () => {
    // Birkaç yüz tick oynatılmış, iki tarafta da birlik olan bir durum.
    const s = createMatch({ seed: 5, opponent: 'basic-bot' });
    const controllers = makeControllers('stacker-basic', 5);
    s.sides[0].gold += 1500;
    for (let t = 0; t < 600; t++) stepMatch(s, [], controllers);
    expect(s.units.some((u) => u.side === 0)).toBe(true);
    expect(s.units.some((u) => u.side === 1)).toBe(true);

    for (const side of [0, 1] as const) {
      const obs = buildObservation(s, side);
      expect(obs.units.length).toBeGreaterThan(0);
      expect(obs.units.some((u) => u.side === 0)).toBe(true);
      expect(obs.units.some((u) => u.side === 1)).toBe(true);
      expect(Object.keys(obs.enemy).sort()).toEqual(['age', 'baseHp', 'baseMaxHp', 'slots']);
      const unitKeys = ['hp', 'id', 'side', 'type', 'x'];
      for (const u of obs.units) expect(Object.keys(u).sort()).toEqual(unitKeys);
      // Gözlem birliği alanları gerçek birlik nesnesinin alanlarının yalnızca bir alt kümesidir;
      // cooldown ve mode gibi iç alanlar sızmaz.
      const real = s.units[0]!;
      expect(Object.keys(real).sort()).toEqual(['cooldown', 'hp', 'id', 'mode', 'side', 'type', 'x']);
      expect(Object.keys(obs.units[0]!).every((k) => k in real)).toBe(true);
      // Gözlemin tamamında karşı tarafın altın/deneyim/kuyruk bilgisi yok.
      expect(Object.keys(obs).sort()).toEqual(['enemy', 'self', 'side', 'stone', 'tick', 'units']);
      const enemyJson = JSON.stringify(obs.enemy);
      for (const key of ['gold', 'xp', 'queue', 'stats']) expect(enemyJson).not.toContain(key);
    }
  });

  it('K-13: basicBot komutları doğrulamadan geçer (hiç reddedilmez)', () => {
    const s = createMatch({ seed: 2, opponent: 'basic-bot' });
    const controllers = makeControllers('stacker-basic', 2);
    for (let t = 0; t < 6000 && s.outcome === null; t++) {
      const events = stepMatch(s, [], controllers);
      for (const e of events) {
        if (e.type === 'commandRejected' && e.command.side === 1) throw new Error(`bot komutu reddedildi: ${e.reason}`);
      }
    }
    expect(s.sides[1].stats.goldSpent).toBeGreaterThan(0);
  });
});
