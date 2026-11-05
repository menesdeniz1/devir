import { createBasicBot } from '../src/ai/basicBot';
import type { Controller } from '../src/ai/controller';
import { createDefenderBot, createRandomBot, createStackerBot } from '../src/ai/testBots';
import { STONE } from '../src/data/stone';
import { UNITS } from '../src/data/units';
import { WORLD } from '../src/data/world';
import { mustGetAge, mustGetUnit } from '../src/sim/compile';
import { createMatch } from '../src/sim/create';
import { rngFromSeed, rngInt, rngNext, type RngState } from '../src/sim/rng';
import type { Command, GameState, SideId, UnitState } from '../src/sim/types';

export const FRONT_ID = 'primitive_front';

export function newState(seed = 1): GameState {
  return createMatch({ seed, opponent: 'none' });
}

/** Elle yerleştirilen birlik (senaryo testleri için). */
export function addUnit(state: GameState, side: SideId, x: number, overrides: Partial<UnitState> = {}, type = FRONT_ID): UnitState {
  const unit: UnitState = {
    id: state.nextId,
    side,
    type,
    x,
    hp: mustGetUnit(type).def.hp,
    cooldown: 0,
    mode: 'wait',
    ...overrides,
  };
  state.nextId += 1;
  state.units.push(unit);
  return unit;
}

export function spawnX(side: SideId, type = FRONT_ID): number {
  const half = mustGetUnit(type).def.width / 2;
  return side === 0 ? WORLD.baseWidth + half : WORLD.worldWidth - WORLD.baseWidth - half;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type BotKind = 'random-random' | 'random-basic' | 'stacker-random' | 'stacker-basic' | 'defender-random' | 'defender-basic' | 'stacker-defender';
export const BOT_KINDS: readonly BotKind[] = ['random-random', 'random-basic', 'stacker-random', 'stacker-basic'];
/** Kule kullanan botlu eşleşmeler (Aşama 4 testleri). */
export const TOWER_BOT_KINDS: readonly BotKind[] = ['defender-random', 'defender-basic', 'stacker-defender'];

/** Denetleyiciler yalnızca config.seed'den kurulur (kaydet-yükle sonrası aynı yoldan yeniden kurulabilmeleri için). */
export function makeControllers(kind: BotKind, configSeed: number): [Controller, Controller] {
  switch (kind) {
    case 'random-random':
      return [createRandomBot(configSeed, 0), createRandomBot(configSeed, 1)];
    case 'random-basic':
      return [createRandomBot(configSeed, 0), createBasicBot()];
    case 'stacker-random':
      return [createStackerBot(), createRandomBot(configSeed, 1)];
    case 'stacker-basic':
      return [createStackerBot(), createBasicBot()];
    case 'defender-random':
      return [createDefenderBot(), createRandomBot(configSeed, 1)];
    case 'defender-basic':
      return [createDefenderBot(), createBasicBot()];
    case 'stacker-defender':
      return [createStackerBot(), createDefenderBot()];
  }
}

/** Test amaçlı rastgele dış komut: geçersiz kimlik ve dizinler dahil. */
export function randomCommand(rng: RngState): Command {
  const side = rngInt(rng, 2) as SideId;
  if (rngNext(rng) < 0.12) return { type: 'ageUp', side };
  if (rngNext(rng) < 0.6) {
    const ids = [FRONT_ID, FRONT_ID, FRONT_ID, 'no_such_unit'];
    return { type: 'queueUnit', side, unitId: ids[rngInt(rng, ids.length)]! };
  }
  return { type: 'cancelOrder', side, index: rngInt(rng, 8) - 1 };
}

export function unitDef(type = FRONT_ID) {
  const found = UNITS.find((u) => u.id === type);
  if (found === undefined) throw new Error('birlik yok');
  return found;
}

/** Bir tarafı doğrudan n. çağa koyar (durum tutarlı kalır: azami üs canı tam, geçiş kayıtları sıfır tick'li). */
export function setAge(state: GameState, side: SideId, age: number): void {
  const s = state.sides[side];
  const def = mustGetAge(age);
  s.age = age;
  s.baseMaxHp = def.baseMaxHp;
  s.baseHp = def.baseMaxHp;
  s.stats.ageUpTicks = Array.from({ length: age - 1 }, () => 0);
}

/** Gövdesi taş bölgesinin tam ortasında duran birlik için x (taş testleri). */
export const ZONE_MID_X = (STONE.zoneStart + STONE.zoneEnd) / 2;
