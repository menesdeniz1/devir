import type { QueueOrder, SideId, SideState, StoneState, TowerSlotState } from '../sim/types';
import type { GameState } from '../sim/types';

/** Yapay zekânın görebildiği bilgi (PRD R-03). Karşı tarafın altını, deneyimini ve kuyruğunu İÇERMEZ. */
/** Karşı tarafın yuvasından görünen bilgi: açık mı ve kule türü (fiyat ve sayaç görünmez; PRD R-03). */
export interface EnemySlotView {
  unlocked: boolean;
  /** TowerDef.id; kule yoksa null. */
  towerType: string | null;
}

export interface Observation {
  tick: number;
  side: SideId;
  /** Kendi tam durumu (derin kopya). */
  self: SideState;
  /** Karşı taraftan yalnızca görünen bilgi. */
  enemy: { age: number; baseHp: number; baseMaxHp: number; slots: EnemySlotView[] };
  /** Sınır Taşı durumu (görünür bilgi; PRD R-03). */
  stone: StoneState;
  /** Sahadaki tüm birlikler. */
  units: { id: number; side: SideId; type: string; x: number; hp: number }[];
}

function cloneSlot(s: TowerSlotState): TowerSlotState {
  return { unlocked: s.unlocked, tower: s.tower === null ? null : { type: s.tower.type, paid: s.tower.paid, cooldown: s.tower.cooldown } };
}

function cloneOrder(o: QueueOrder): QueueOrder {
  return { unitId: o.unitId, progressTicks: o.progressTicks, paid: o.paid };
}

export function buildObservation(state: GameState, side: SideId): Observation {
  const own = state.sides[side];
  const enemy = state.sides[side === 0 ? 1 : 0];
  return {
    tick: state.tick,
    side,
    self: {
      gold: own.gold,
      xp: own.xp,
      age: own.age,
      baseHp: own.baseHp,
      baseMaxHp: own.baseMaxHp,
      queue: own.queue.map(cloneOrder),
      slots: own.slots.map(cloneSlot),
      stats: {
        produced: { ...own.stats.produced },
        lost: { ...own.stats.lost },
        kills: { ...own.stats.kills },
        goldEarned: own.stats.goldEarned,
        goldSpent: own.stats.goldSpent,
        goldRefunded: own.stats.goldRefunded,
        baseDamageDealt: own.stats.baseDamageDealt,
        ageUpTicks: own.stats.ageUpTicks.slice(),
      },
    },
    enemy: {
      age: enemy.age,
      baseHp: enemy.baseHp,
      baseMaxHp: enemy.baseMaxHp,
      slots: enemy.slots.map((s) => ({ unlocked: s.unlocked, towerType: s.tower === null ? null : s.tower.type })),
    },
    stone: { counter: state.stone.counter, owner: state.stone.owner },
    units: state.units.map((u) => ({ id: u.id, side: u.side, type: u.type, x: u.x, hp: u.hp })),
  };
}
