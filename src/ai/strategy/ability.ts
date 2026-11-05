import { AI_TUNING } from '../../data/ai';
import type { AiProfileDef } from '../../data/types';
import { WORLD } from '../../data/world';
import { abilityOfAge, getUnit, secToTicks, unitOfRole } from '../../sim/compile';
import { abilityArea, battlefieldBounds } from '../../sim/geometry';
import { rngNext } from '../../sim/rng';
import type { Command } from '../../sim/types';
import type { Observation } from '../observation';
import type { AiMemory } from './memory';
import { unitPower, type Threat } from './threat';

/** Hedef adayı: öngörülen gövde aralığı ve değeri. */
interface Target {
  x0: number;
  x1: number;
  value: number;
}

/**
 * Düşman birliğinin vuruşa kadar `ticks` içinde yürüyeceği yol: önündeki en yakın kendi birliğimiz ya da üssümüz
 * menzile girene kadar ilerler (temas hâlindeyse durur). Yaklaşık öngörüdür; gözlemdeki konum ve veriden hesaplanır.
 */
function advanceOf(obs: Observation, u: Observation['units'][number], ticks: number): number {
  const unit = getUnit(u.type);
  if (unit === undefined || ticks <= 0) return 0;
  const dir = u.side === 0 ? 1 : -1;
  const half = unit.def.width / 2;
  const front = u.x + dir * half;
  // Önündeki boşluk: en yakın kendi birliğimizin bakan kenarı ya da kendi üs ön yüzümüz.
  let gap = obs.side === 0 ? front - WORLD.baseWidth : WORLD.worldWidth - WORLD.baseWidth - front;
  for (const o of obs.units) {
    if (o.side !== obs.side) continue;
    const ow = getUnit(o.type)?.def.width ?? 0;
    const g = dir * (o.x - dir * (ow / 2) - front);
    if (g >= 0 && g < gap) gap = g;
  }
  return dir * Math.max(0, Math.min(unit.speedPerTick * ticks, gap - unit.def.range));
}

/** Kendi etkin alanımız ya da bekleyen vuruşumuz zaten kapsıyorsa birlik yeniden hedeflenmez (boşa harcamamak için). */
function covered(obs: Observation, x: number): boolean {
  const own = (z: { side: number; x0: number; x1: number }) => z.side === obs.side && x >= z.x0 && x <= z.x1;
  return obs.zones.some(own) || obs.strikes.some(own);
}

/**
 * Yetenek modülü (GDD §9 modül 5). Bekleme bitmişse (ve profilin tepki gecikmesi dolmuşsa) alan içindeki düşman
 * değerini en çok yapan merkezi tarar; profil eşiği karşılanırsa `castAbility` verir. Zor, üsse yakın düşmana
 * öncelik verir ve gecikmeli vuruşta hedef ilerlemesini öngörür; Kolay nişanı rastgele saptırır.
 */
export function planAbility(obs: Observation, mem: AiMemory, threat: Threat, profile: AiProfileDef): Command[] {
  const p = profile.ability;
  if (obs.self.abilityCooldown > 0) {
    mem.abilityWait = -1;
    return [];
  }
  const ability = abilityOfAge(obs.self.age);
  if (ability === undefined) return [];
  if (mem.abilityWait < 0) {
    const [lo, hi] = p.reactionDelaySec;
    mem.abilityWait = obs.tick + (hi > 0 ? secToTicks(lo + (hi - lo) * rngNext(mem.rng)) : 0);
  }
  if (obs.tick < mem.abilityWait) return [];

  const lead = p.leadDelayed ? ability.delayTicks : 0;
  const face = obs.side === 0 ? WORLD.baseWidth : WORLD.worldWidth - WORLD.baseWidth;
  const targets: Target[] = [];
  for (const u of obs.units) {
    if (u.side === obs.side) continue;
    const unit = getUnit(u.type);
    if (unit === undefined) continue;
    const x = u.x + advanceOf(obs, u, lead);
    if (covered(obs, x)) continue;
    const half = unit.def.width / 2;
    const dist = obs.side === 0 ? x - half - face : face - (x + half);
    const weight = dist <= AI_TUNING.nearBaseDistance ? p.defenseWeight : 1;
    targets.push({ x0: x - half, x1: x + half, value: unitPower(u.type, u.hp) * weight });
  }
  if (targets.length === 0) return [];

  const field = battlefieldBounds();
  let best = { x: 0, value: -1, count: 0 };
  for (let x = field.x0; x <= field.x1; x += AI_TUNING.abilityScanStep) {
    const area = abilityArea(x, ability.def.width);
    if (area === null) continue;
    let value = 0;
    let count = 0;
    for (const t of targets) {
      if (t.x1 >= area.x0 && t.x0 <= area.x1) {
        value += t.value;
        count += 1;
      }
    }
    if (value > best.value) best = { x, value, count };
  }

  const minTargets = threat.pressure ? Math.min(p.minTargets, p.defenseMinTargets) : p.minTargets;
  const frontCost = unitOfRole(obs.self.age, 'front')?.def.cost ?? 0;
  const enough = best.count >= minTargets || (p.minValue !== null && best.count > 0 && best.value >= p.minValue * frontCost);
  if (!enough) return [];
  let x = best.x;
  if (p.aimJitter > 0) x += (rngNext(mem.rng) * 2 - 1) * p.aimJitter;
  x = Math.min(field.x1, Math.max(field.x0, x));
  mem.abilityWait = -1;
  return [{ type: 'castAbility', side: obs.side, x }];
}
