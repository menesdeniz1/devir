import type { EconomyDef, WorldDef } from './types';

/** Koridor ve zaman sabitleri (GDD §1, TDD §3). */
export const WORLD: WorldDef = {
  tickRate: 20,
  worldWidth: 1920,
  baseWidth: 160,
  friendlyGap: 6,
};

/** Başlangıç ekonomisi (GDD §4). */
export const ECONOMY: EconomyDef = {
  startGold: 150,
  maxQueue: 5,
};
