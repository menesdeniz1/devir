import { WORLD } from '../data/world';
import type { PendingDamage } from './combat';
import { mustGetAbility, mustGetUnit, type CompiledAbility } from './compile';
import { bodyOverlaps, otherSide } from './geometry';
import type { GameState, SideId, SimEvent, UnitState } from './types';

/**
 * Özel yetenekler (GDD §7, PRD Y-01…Y-08). Yalnız karşı tarafın birliklerine etki eder; üs ve dostlar etkilenmez.
 *
 * Süre kuralı: her süre, kullanım adımı dahil adım sayısıdır (alan ve bekleme kullanım adımından itibaren sayılır;
 * kullanım adımı 1. adımdır). Durum etkileri (sersemletme/savunmasızlık) vuruş adımında yazılır ve sonraki
 * `statusTicks` tick boyunca etkindir.
 */

/** Adım 5'te hesaplanan, o tick boyunca geçerli durum etkileri; birlik dizisiyle aynı sırada. */
export interface EffectFlags {
  /** Bu tick'te hareket edemez/saldıramaz. */
  stunned: boolean[];
  /** Bu tick'te alandaki yavaşlatmanın yüzdesi (0 = yok). */
  slowPct: number[];
  /** Bu tick'te savunmasız birliklerin kimliği → hasar artış yüzdesi. */
  vulnerable: Map<number, number>;
}

/** Kabul edilmiş kullanımın etkilerini kaydeder (zaten doğrulanmıştır): süreli alan ve/veya vuruş. */
export function launchAbility(state: GameState, side: SideId, ability: CompiledAbility, x0: number, x1: number): void {
  const abilityId = ability.def.id;
  if (ability.def.zone !== undefined) {
    const id = state.nextId;
    state.nextId += 1;
    state.zones.push({ id, side, abilityId, x0, x1, ticksLeft: ability.zoneTicks });
  }
  if (ability.hasStrike) {
    const id = state.nextId;
    state.nextId += 1;
    // Gecikmesiz vuruş aynı adımda (adım 9) patlar; kaydı adım sonunda kalmaz.
    state.strikes.push({ id, side, abilityId, x0, x1, ticksLeft: ability.delayTicks });
  }
}

/** Alandaki karşı taraf birlikleri (dizi sırasıyla indeksler). */
function enemiesInArea(state: GameState, side: SideId, x0: number, x1: number): number[] {
  const enemy = otherSide(side);
  const hit: number[] = [];
  state.units.forEach((u, i) => {
    if (u.side === enemy && bodyOverlaps(u, mustGetUnit(u.type).def.width, x0, x1)) hit.push(i);
  });
  return hit;
}

/**
 * Adım 5: bekleme ve durum süreleri azalır; alanlar etki eder (hasar bekleyen hasara girer, yavaşlatma işaretlenir);
 * süresi biten alan kaldırılır. Yarım kalan durum etkisi olan birlik bu tick de etkilenir (sayaç tick sonunda azalır).
 */
export function advanceAbilityEffects(state: GameState, pending: PendingDamage[], events: SimEvent[]): EffectFlags {
  for (const side of state.sides) {
    if (side.abilityCooldown > 0) side.abilityCooldown -= 1;
  }

  const flags: EffectFlags = { stunned: [], slowPct: [], vulnerable: new Map() };
  for (const u of state.units) {
    flags.stunned.push(u.stunTicks > 0);
    flags.slowPct.push(0);
    if (u.stunTicks > 0) u.stunTicks -= 1;
    if (u.vulnTicks > 0) {
      flags.vulnerable.set(u.id, u.vulnPct);
      u.vulnTicks -= 1;
      if (u.vulnTicks === 0) u.vulnPct = 0;
    }
  }

  if (state.zones.length === 0) return flags;
  const remaining: GameState['zones'] = [];
  for (const zone of state.zones) {
    const ability = mustGetAbility(zone.abilityId);
    const zoneDef = ability.def.zone;
    if (zoneDef !== undefined) {
      // Hasar, alanın her tickRate'inci etkin adımında uygulanır (saniyelik).
      const elapsed = ability.zoneTicks - zone.ticksLeft + 1;
      const damageTick = zoneDef.damagePerSec !== undefined && elapsed % WORLD.tickRate === 0;
      const hit = enemiesInArea(state, zone.side, zone.x0, zone.x1);
      for (const i of hit) {
        const unit = state.units[i]!;
        if (zoneDef.slowPct !== undefined) flags.slowPct[i] = Math.max(flags.slowPct[i]!, zoneDef.slowPct);
        if (damageTick) pending.push({ attackerSide: zone.side, attackerType: zone.abilityId, target: unit.id, damage: zoneDef.damagePerSec! });
      }
      if (damageTick) events.push({ type: 'abilityImpact', side: zone.side, abilityId: zone.abilityId, x0: zone.x0, x1: zone.x1, hits: hit.length });
    }
    zone.ticksLeft -= 1;
    if (zone.ticksLeft > 0) remaining.push(zone);
    else events.push({ type: 'zoneExpired', side: zone.side, id: zone.id, abilityId: zone.abilityId });
  }
  state.zones = remaining;
  return flags;
}

/** Aynı türden etki üst üste binmez: süre uzun olana yenilenir. */
function applyStatus(unit: UnitState, ability: CompiledAbility): void {
  const status = ability.def.status;
  if (status === undefined) return;
  unit.stunTicks = Math.max(unit.stunTicks, ability.statusTicks);
  if (status.kind === 'freeze') {
    const pct = status.damageTakenPct ?? 0;
    unit.vulnPct = unit.vulnTicks > 0 ? Math.max(unit.vulnPct, pct) : pct;
    unit.vulnTicks = Math.max(unit.vulnTicks, ability.statusTicks);
  }
}

/**
 * Adım 9: bekleyen vuruşların sayacı azalır; sıfıra inenler alandaki düşmanlara vurur (hasar bekleyen hasara, durum
 * etkisi hemen yazılır) ve kaydı silinir.
 */
export function detonateStrikes(state: GameState, pending: PendingDamage[], events: SimEvent[]): void {
  if (state.strikes.length === 0) return;
  const remaining: GameState['strikes'] = [];
  for (const strike of state.strikes) {
    if (strike.ticksLeft > 0) strike.ticksLeft -= 1;
    if (strike.ticksLeft > 0) {
      remaining.push(strike);
      continue;
    }
    const ability = mustGetAbility(strike.abilityId);
    const hit = enemiesInArea(state, strike.side, strike.x0, strike.x1);
    for (const i of hit) {
      const unit = state.units[i]!;
      if (ability.def.impactDamage !== undefined) {
        pending.push({ attackerSide: strike.side, attackerType: strike.abilityId, target: unit.id, damage: ability.def.impactDamage });
      }
      applyStatus(unit, ability);
    }
    events.push({ type: 'abilityImpact', side: strike.side, abilityId: strike.abilityId, x0: strike.x0, x1: strike.x1, hits: hit.length });
  }
  state.strikes = remaining;
}
