import { ABILITIES } from '../data/abilities';
import { TOWERS } from '../data/towers';
import { UNITS } from '../data/units';
import { WORLD } from '../data/world';
import type { GameState, SideId } from '../sim/types';

/** Sonuç ekranının (PRD EK-06, GDD §13) saf veri özeti. Arayüz yalnızca bunu çizer. */
export interface UnitRow {
  unitId: string;
  produced: number;
  lost: number;
  kills: number;
}

export interface SideSummary {
  age: number;
  goldEarned: number;
  /** Net: harcanan − iade edilen. */
  goldSpent: number;
  baseDamageDealt: number;
  towerKills: number;
  abilityKills: number;
  /** Çağ geçişlerinin oyun saniyesi cinsinden zamanları (sırayla). */
  ageUpSeconds: number[];
}

export interface MatchSummary {
  durationSeconds: number;
  sides: [SideSummary, SideSummary];
  /** Oyuncunun (taraf 0) birlik tablosu: etkinliği olan türler, çağ sırasıyla. */
  unitRows: UnitRow[];
}

function sumKills(kills: Record<string, number>, ids: readonly string[]): number {
  let total = 0;
  for (const id of ids) total += kills[id] ?? 0;
  return total;
}

function summarizeSide(state: GameState, side: SideId): SideSummary {
  const s = state.sides[side];
  return {
    age: s.age,
    goldEarned: s.stats.goldEarned,
    // Net harcama: iptal ve satış iadeleri düşülür.
    goldSpent: s.stats.goldSpent - s.stats.goldRefunded,
    baseDamageDealt: s.stats.baseDamageDealt,
    towerKills: sumKills(
      s.stats.kills,
      TOWERS.map((t) => t.id),
    ),
    abilityKills: sumKills(
      s.stats.kills,
      ABILITIES.map((a) => a.id),
    ),
    ageUpSeconds: s.stats.ageUpTicks.map((tick) => tick / WORLD.tickRate),
  };
}

export function summarizeMatch(state: GameState, playerSide: SideId = 0): MatchSummary {
  const endTick = state.outcome?.tick ?? state.tick;
  const stats = state.sides[playerSide].stats;
  const unitRows: UnitRow[] = [];
  for (const unit of UNITS) {
    const row = { unitId: unit.id, produced: stats.produced[unit.id] ?? 0, lost: stats.lost[unit.id] ?? 0, kills: stats.kills[unit.id] ?? 0 };
    if (row.produced > 0 || row.lost > 0 || row.kills > 0) unitRows.push(row);
  }
  return {
    durationSeconds: endTick / WORLD.tickRate,
    sides: [summarizeSide(state, 0), summarizeSide(state, 1)],
    unitRows,
  };
}
