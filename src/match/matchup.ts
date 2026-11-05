import { createAbilityOnlyBot } from '../ai/strategy';
import type { Controller } from '../ai/controller';
import { mustGetUnit } from '../sim/compile';
import { stepMatch } from './runner';
import { createMatch } from '../sim/create';
import { WORLD } from '../data/world';
import { step } from '../sim/step';
import type { GameState, SideId, UnitState } from '../sim/types';

/**
 * Karşılık senaryoları (GDD §3 döngüsü, Aşama 2 testleri): iki önceden yerleştirilmiş ordu, biri tamamen ölene
 * kadar oynar. Gelir etkisizdir (kimse sipariş vermez), üsler çok yüksek canlıdır; sonuç yalnız ordulara bağlıdır.
 */

/** Senaryoda üs canı: ordular üsse ulaşıp sonucu kendiliğinden bitirmesin diye çok yüksek (tamsayı). */
const SCENARIO_BASE_HP = 1_000_000_000;
/** Senaryo üst süre sınırı (dakika): aşılırsa kazananı yoktur (zaman aşımı). */
const DEFAULT_MAX_MINUTES = 15;

export interface BattleResult {
  /** 0/1: o tarafın birlikleri kaldı; null: beraberlik (ikisi de yok) ya da zaman aşımı. */
  winner: SideId | null;
  timedOut: boolean;
  ticks: number;
  /** Savaş sonunda her tarafın kalan toplam canı. */
  remainingHp: [number, number];
  remainingUnits: [number, number];
}

/**
 * Ordu dizilimi: `army` önden arkaya sıralı tür kimlikleri. Ordu, kendi üssünün ön yüzünden başlayarak
 * dost aralığıyla sıkı dizilir (doğma düzeni gibi); listenin ilk elemanı en önde durur.
 * Birlikler doğrudan state.units içine (taraf başına sıralı) yerleştirilir.
 */
export function deployArmy(state: GameState, side: SideId, army: readonly string[]): UnitState[] {
  const widths = army.map((id) => mustGetUnit(id).def.width);
  const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, army.length - 1) * WORLD.friendlyGap;
  // Ordunun en ön kenarı (kendi ileri yönünde): üs ön yüzü + toplam uzunluk.
  const dir = side === 0 ? 1 : -1;
  const baseFace = side === 0 ? WORLD.baseWidth : WORLD.worldWidth - WORLD.baseWidth;
  let frontEdge = baseFace + dir * total;
  const placed: UnitState[] = [];
  for (const type of army) {
    const def = mustGetUnit(type).def;
    const x = frontEdge - dir * (def.width / 2);
    const unit: UnitState = { id: state.nextId, side, type, x, hp: def.hp, cooldown: 0, mode: 'wait', stunTicks: 0, vulnTicks: 0, vulnPct: 0 };
    state.nextId += 1;
    state.units.push(unit);
    placed.push(unit);
    frontEdge -= dir * (def.width + WORLD.friendlyGap);
  }
  return placed;
}

/** Senaryo seçenekleri. */
export interface BattleOptions {
  maxMinutes?: number;
  onStep?: (state: GameState) => void;
  /**
   * Yetenekli senaryo: verilen taraflar bekleme sıfırdan başlayarak çağının yeteneğini Zor yapay zekânın yetenek
   * modülüyle kullanır (birlik/kule/çağ kararı yok). Varsayılan: yeteneksiz.
   */
  abilities?: readonly [boolean, boolean];
}

/** İki ordunun savaş durumunu kurar (tohum 1, kimse sipariş vermez, üsler yüksek canlı). */
export function createBattle(armyA: readonly string[], armyB: readonly string[], seed = 1, abilities: readonly [boolean, boolean] = [false, false]): GameState {
  const state = createMatch({ seed, opponent: 'none' });
  for (const side of [0, 1] as const) {
    state.sides[side].baseHp = SCENARIO_BASE_HP;
    state.sides[side].baseMaxHp = SCENARIO_BASE_HP;
    if (abilities[side]) state.sides[side].abilityCooldown = 0;
  }
  deployArmy(state, 0, armyA);
  deployArmy(state, 1, armyB);
  return state;
}

function sideAlive(state: GameState, side: SideId): boolean {
  return state.units.some((u) => u.side === side) || state.projectiles.some((p) => p.side === side);
}

function summarize(state: GameState, timedOut: boolean): BattleResult {
  const remainingHp: [number, number] = [0, 0];
  const remainingUnits: [number, number] = [0, 0];
  for (const u of state.units) {
    remainingHp[u.side] += u.hp;
    remainingUnits[u.side] += 1;
  }
  let winner: SideId | null = null;
  if (!timedOut) {
    if (remainingUnits[0] > 0 && remainingUnits[1] === 0) winner = 0;
    else if (remainingUnits[1] > 0 && remainingUnits[0] === 0) winner = 1;
  }
  return { winner, timedOut, ticks: state.tick, remainingHp, remainingUnits };
}

/**
 * Savaşı oynatır: bir tarafın birliği ve havada mermisi kalmayana kadar (ya da zaman aşımına kadar) adımlar.
 * `onStep` her adımdan sonra çağrılır (testlerde değişmez denetimi için).
 */
export function playBattle(state: GameState, options: BattleOptions = {}): BattleResult {
  const maxTicks = Math.round((options.maxMinutes ?? DEFAULT_MAX_MINUTES) * 60 * WORLD.tickRate);
  const abilities = options.abilities ?? [false, false];
  const controllers: [Controller | null, Controller | null] = [
    abilities[0] ? createAbilityOnlyBot('hard', state.config.seed, 0) : null,
    abilities[1] ? createAbilityOnlyBot('hard', state.config.seed, 1) : null,
  ];
  const useControllers = abilities[0] || abilities[1];
  while (state.outcome === null && state.tick < maxTicks) {
    if (!sideAlive(state, 0) || !sideAlive(state, 1)) break;
    if (useControllers) stepMatch(state, [], controllers);
    else step(state, []);
    options.onStep?.(state);
  }
  const timedOut = state.outcome === null && sideAlive(state, 0) && sideAlive(state, 1);
  return summarize(state, timedOut);
}

/** Kısa yol: iki orduyu kurup oynatır. */
export function runBattle(armyA: readonly string[], armyB: readonly string[], options: BattleOptions = {}): BattleResult {
  return playBattle(createBattle(armyA, armyB, 1, options.abilities), options);
}

/** `unitId`'den `count` adetlik ordu. */
export function repeatUnit(unitId: string, count: number): string[] {
  return Array.from({ length: count }, () => unitId);
}
