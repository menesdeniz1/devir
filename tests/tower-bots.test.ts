import { describe, expect, it } from 'vitest';
import { createBasicBot } from '../src/ai/basicBot';
import { buildObservation } from '../src/ai/observation';
import { createDefenderBot, createRandomBot, DEFENDER_GOLD_RESERVE } from '../src/ai/testBots';
import { BASIC_BOT } from '../src/data/ai';
import { DEFENSE } from '../src/data/towers';
import { WORLD } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { mustGetAge, mustGetUnit, unitOfRole } from '../src/sim/compile';
import { createMatch } from '../src/sim/create';
import type { Command, GameState, JsonValue, SideId } from '../src/sim/types';
import { addUnit, setAge } from './helpers';

const FACE_1 = WORLD.worldWidth - WORLD.baseWidth;

/** Taraf 1'in üs ön yüzüne bakan kenarı `gap` uzakta olan taraf 0 birliği. */
function foeNear(s: GameState, gap: number): void {
  const w = mustGetUnit('primitive_front').def.width;
  addUnit(s, 0, FACE_1 - gap - w / 2);
}

function decide(s: GameState, side: SideId, bot = createBasicBot(), memory: JsonValue = null): Command[] {
  return bot.decide(buildObservation(s, side), memory, s.tick).commands;
}

const towerCommands = (cmds: Command[]): Command[] => cmds.filter((c) => c.type === 'unlockSlot' || c.type === 'buildTower' || c.type === 'sellTower');

function place(s: GameState, side: SideId, slot: number, type: string, paid: number): void {
  for (let i = 0; i <= slot; i++) s.sides[side].slots[i]!.unlocked = true;
  s.sides[side].slots[slot]!.tower = { type, paid, cooldown: 0 };
}

describe('Basit bot: kule kullanımı (BASIC_BOT.tower)', () => {
  it('eşik içinde düşman birliği varken ilk boş yuvaya güncel çağın hızlı kulesini kurar', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    s.sides[1].gold = 1000;
    foeNear(s, BASIC_BOT.tower.threatDistance);
    const cmds = decide(s, 1);
    expect(towerCommands(cmds)).toEqual([{ type: 'buildTower', side: 1, slot: 0, towerId: 'primitive_tower_fast' }]);
  });

  it('eşikten uzakta düşman varken ya da hiç düşman yokken kule kurmaz', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    s.sides[1].gold = 1000;
    expect(towerCommands(decide(s, 1))).toEqual([]);
    foeNear(s, BASIC_BOT.tower.threatDistance + 1);
    expect(towerCommands(decide(s, 1))).toEqual([]);
  });

  it('sıradaki yuva: ikinci kule ağır türdür ve gerekirse yuvayı önce açar; en çok maxSlots yuva kullanılır', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    s.sides[1].gold = 1000;
    place(s, 1, 0, 'primitive_tower_fast', 120);
    foeNear(s, 100);
    expect(towerCommands(decide(s, 1))).toEqual([
      { type: 'unlockSlot', side: 1, slot: 1 },
      { type: 'buildTower', side: 1, slot: 1, towerId: 'primitive_tower_heavy' },
    ]);
    // Açma + kurma ücreti karşılanmıyorsa hiçbiri verilmez.
    s.sides[1].gold = DEFENSE.slotUnlockCosts[1]! + 159;
    expect(towerCommands(decide(s, 1))).toEqual([]);
    // maxSlots dolunca üçüncü yuva kullanılmaz.
    s.sides[1].gold = 5000;
    place(s, 1, 1, 'primitive_tower_heavy', 160);
    expect(BASIC_BOT.tower.maxSlots).toBe(2);
    expect(towerCommands(decide(s, 1))).toEqual([]);
  });

  it('çağ biriktirme önceliklidir: save durumunda kule kurmaz, ageUp durumunda yalnız çağ atlar', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    foeNear(s, 100);
    const next = mustGetAge(2);
    s.sides[1].xp = next.xpThreshold;
    s.sides[1].gold = next.ageUpCost - 1;
    expect(decide(s, 1)).toEqual([]);
    s.sides[1].gold = next.ageUpCost;
    expect(decide(s, 1)).toEqual([{ type: 'ageUp', side: 1 }]);
  });

  it('kule altını birlik siparişinden önce düşer; kalan altınla sipariş verir (tüm komutlar geçerli)', () => {
    const s = createMatch({ seed: 1, opponent: 'basic-bot' });
    s.sides[1].gold = 120 + 50;
    foeNear(s, 100);
    const cmds = decide(s, 1);
    expect(cmds[0]).toMatchObject({ type: 'buildTower', slot: 0 });
    expect(cmds[1]).toEqual({ type: 'queueUnit', side: 1, unitId: unitOfRole(1, 'front')!.def.id });
    const events = stepMatch(s, [], [null, createBasicBot()]);
    expect(events.filter((e) => e.type === 'commandRejected')).toHaveLength(0);
    expect(s.sides[1].slots[0]!.tower).not.toBeNull();
  });

  it('bütünleşik: basit bot saldırı altında gerçekten kule kurar ve komutları hiç reddedilmez', () => {
    const s = createMatch({ seed: 3, opponent: 'basic-bot' });
    s.sides[0].gold = 3000;
    const bot = createBasicBot();
    // Taraf 0'ın sürekli dış sipariş verdiği, basit botun savunmada kaldığı koşu.
    let built = 0;
    for (let t = 0; t < 4000 && s.outcome === null; t++) {
      const external: Command[] = t % 40 === 0 ? [{ type: 'queueUnit', side: 0, unitId: 'primitive_front' }] : [];
      for (const e of stepMatch(s, external, [null, bot])) {
        if (e.type === 'towerBuilt' && e.side === 1) built += 1;
        if (e.type === 'commandRejected' && e.command.side === 1) throw new Error(`bot komutu reddedildi: ${e.reason}`);
      }
    }
    expect(built).toBeGreaterThan(0);
    expect(s.sides[1].slots.filter((x) => x.tower !== null).length).toBeLessThanOrEqual(BASIC_BOT.tower.maxSlots);
  });
});

describe('Savunmacı bot (test botu)', () => {
  it('altın azken önce yuva 0’a hızlı kule kurar; sonra yuvaları sırayla açıp doldurur', () => {
    const s = createMatch({ seed: 1, opponent: 'none' });
    expect(decide(s, 0, createDefenderBot())).toEqual([{ type: 'buildTower', side: 0, slot: 0, towerId: 'primitive_tower_fast' }]);
    s.sides[0].gold = 100_000;
    const cmds = decide(s, 0, createDefenderBot());
    expect(cmds.slice(0, 5)).toEqual([
      { type: 'buildTower', side: 0, slot: 0, towerId: 'primitive_tower_fast' },
      { type: 'unlockSlot', side: 0, slot: 1 },
      { type: 'buildTower', side: 0, slot: 1, towerId: 'primitive_tower_heavy' },
      { type: 'unlockSlot', side: 0, slot: 2 },
      { type: 'buildTower', side: 0, slot: 2, towerId: 'primitive_tower_fast' },
    ]);
    // Yuvalar bu kararda doldurulurken birlik sipariş edilmez.
    expect(cmds.some((c) => c.type === 'queueUnit')).toBe(false);
  });

  it('birlik yalnız üç yuva da güncel çağ kulesiyle doluyken ve altın rezervin üstündeyken üretilir', () => {
    const s = createMatch({ seed: 1, opponent: 'none' });
    const bot = createDefenderBot();
    place(s, 0, 0, 'primitive_tower_fast', 120);
    place(s, 0, 1, 'primitive_tower_heavy', 160);
    s.sides[0].gold = 100_000;
    // İki yuva dolu, üçüncü kilitli: birlik yok.
    expect(decide(s, 0, bot).some((c) => c.type === 'queueUnit')).toBe(false);
    place(s, 0, 2, 'primitive_tower_fast', 120);
    const unit = unitOfRole(1, 'front')!.def;
    s.sides[0].gold = DEFENDER_GOLD_RESERVE + unit.cost - 1;
    expect(decide(s, 0, bot)).toEqual([]);
    s.sides[0].gold = DEFENDER_GOLD_RESERVE + unit.cost;
    expect(decide(s, 0, bot)).toEqual([{ type: 'queueUnit', side: 0, unitId: unit.id }]);
  });

  it('çağ atlayınca eski çağ kulelerini satıp yenisini kurar; çağ biriktirirken harcamaz', () => {
    const s = createMatch({ seed: 1, opponent: 'none' });
    place(s, 0, 0, 'primitive_tower_fast', 120);
    place(s, 0, 1, 'primitive_tower_heavy', 160);
    place(s, 0, 2, 'primitive_tower_fast', 120);
    setAge(s, 0, 2);
    s.sides[0].gold = 100_000;
    const cmds = decide(s, 0, createDefenderBot());
    expect(cmds).toEqual([
      { type: 'sellTower', side: 0, slot: 0 },
      { type: 'buildTower', side: 0, slot: 0, towerId: 'ancient_tower_fast' },
      { type: 'sellTower', side: 0, slot: 1 },
      { type: 'buildTower', side: 0, slot: 1, towerId: 'ancient_tower_heavy' },
      { type: 'sellTower', side: 0, slot: 2 },
      { type: 'buildTower', side: 0, slot: 2, towerId: 'ancient_tower_fast' },
    ]);
    // Çağ eşiği geçildi ama altın yetmiyor: biriktirir.
    const t = createMatch({ seed: 1, opponent: 'none' });
    t.sides[0].xp = mustGetAge(2).xpThreshold;
    t.sides[0].gold = mustGetAge(2).ageUpCost - 1;
    expect(decide(t, 0, createDefenderBot())).toEqual([]);
    t.sides[0].gold = mustGetAge(2).ageUpCost;
    expect(decide(t, 0, createDefenderBot())).toEqual([{ type: 'ageUp', side: 0 }]);
  });

  it('yeni çağın kulesi karşılanamıyorsa eski kule satılmaz', () => {
    const s = createMatch({ seed: 1, opponent: 'none' });
    place(s, 0, 0, 'primitive_tower_fast', 120);
    setAge(s, 0, 2);
    s.sides[0].gold = 210 - 60 - 1; // iade (60) eklense de ancient_tower_fast (210) karşılanamaz
    expect(decide(s, 0, createDefenderBot())).toEqual([]);
    s.sides[0].gold = 210 - 60;
    expect(decide(s, 0, createDefenderBot()).map((c) => c.type)).toEqual(['sellTower', 'buildTower']);
  });

  it('tam koşu: savunmacı bot komutları geçerlidir (hiçbiri reddedilmez) ve çağ atlayıp kuleleri yeniler', () => {
    const s = createMatch({ seed: 5, opponent: 'none' });
    let rejected = 0;
    let sold = 0;
    const controllers = [createDefenderBot(), createRandomBot(5, 1)] as const;
    for (let t = 0; t < 6000 && s.outcome === null; t++) {
      if (t === 1500) {
        // Kuleler kurulduktan sonra çağ atlama koşulları sağlanır: eski kuleler satılıp yenilenmeli.
        s.sides[0].xp = 3000;
        s.sides[0].gold += 3000;
      }
      for (const e of stepMatch(s, [], controllers)) {
        if (e.type === 'commandRejected' && e.command.side === 0) rejected += 1;
        if (e.type === 'towerSold' && e.side === 0) sold += 1;
      }
    }
    expect(rejected).toBe(0);
    expect(s.sides[0].age).toBeGreaterThan(1);
    expect(sold).toBeGreaterThan(0);
  });

  it('rastgele bot kule komutları da üretir (kurma, açma, satma)', () => {
    const s = createMatch({ seed: 9, opponent: 'none' });
    const bot = createRandomBot(9, 0);
    let memory: JsonValue = null;
    const kinds = new Set<string>();
    for (let t = 0; t < 8000; t++) {
      const r = bot.decide(buildObservation(s, 0), memory, t);
      memory = r.memory;
      for (const c of r.commands) kinds.add(c.type);
    }
    expect(kinds.has('unlockSlot')).toBe(true);
    expect(kinds.has('buildTower')).toBe(true);
    expect(kinds.has('sellTower')).toBe(true);
  });
});
