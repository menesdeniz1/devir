import { TOWERS } from '../data/towers';
import { UNITS } from '../data/units';
import { ECONOMY } from '../data/world';
import { mustGetAge } from './compile';
import type { GameState, MatchConfig, SideState, SideStats } from './types';

function zeroCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of UNITS) counts[unit.id] = 0;
  return counts;
}

function createStats(): SideStats {
  // Öldürme istatistiği birlik ve kule türlerini birlikte sayar.
  const kills = zeroCounts();
  for (const tower of TOWERS) kills[tower.id] = 0;
  return {
    produced: zeroCounts(),
    lost: zeroCounts(),
    kills,
    goldEarned: 0,
    goldSpent: 0,
    goldRefunded: 0,
    baseDamageDealt: 0,
    ageUpTicks: [],
  };
}

function createSide(): SideState {
  const baseMaxHp = mustGetAge(1).baseMaxHp;
  return {
    gold: ECONOMY.startGold,
    xp: 0,
    age: 1,
    baseHp: baseMaxHp,
    baseMaxHp,
    queue: [],
    slots: [
      { unlocked: true, tower: null },
      { unlocked: false, tower: null },
      { unlocked: false, tower: null },
    ],
    stats: createStats(),
  };
}

/**
 * Yeni maç durumu. Her çağrı tamamen yeni nesneler üretir.
 * Yapay zekâ belleği başlangıçta null'dır; denetleyici ilk kararında kendi belleğini kurar.
 */
export function createMatch(config: MatchConfig): GameState {
  return {
    schemaVersion: 1,
    config: { seed: config.seed, opponent: config.opponent },
    tick: 0,
    nextId: 1,
    outcome: null,
    sides: [createSide(), createSide()],
    units: [],
    projectiles: [],
    stone: { counter: 0, owner: null },
    ai: [null, null],
  };
}
