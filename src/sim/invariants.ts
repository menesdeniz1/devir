import { ABILITY_RULES } from '../data/abilities';
import { STONE } from '../data/stone';
import { WORLD, ECONOMY } from '../data/world';
import { DEFENSE } from '../data/towers';
import { battlefieldBounds } from './geometry';
import { EPS, abilityOfAge, getAbility, getAge, getTower, getUnit, mustGetTower, mustGetUnit, secToTicks } from './compile';
import type { GameState, SimEvent, UnitState } from './types';

/** Her tick sonunda geçerli olması gereken değişmezler (TDD §10). İhlal metinlerini döndürür; boşsa sorun yok. */
export interface InvariantOptions {
  /** Karşılık senaryoları üs canını yapay olarak yükseltir; azami üs canının çağla uyumu denetlenmez. */
  allowCustomBaseHp?: boolean;
}

/** Yuva değişmezleri: 3 yuva, yuva 0 açık, açık yuvalar önek, kule yalnız açık yuvada, sayaç 0..aralık, paid > 0. */
function checkSlots(side: number, slots: GameState['sides'][0]['slots'], problems: string[]): void {
  if (slots.length !== DEFENSE.slotUnlockCosts.length) problems.push(`taraf ${side}: yuva sayısı ${slots.length} ≠ ${DEFENSE.slotUnlockCosts.length}`);
  if (slots[0]?.unlocked !== true) problems.push(`taraf ${side}: yuva 0 kilitli`);
  slots.forEach((slot, i) => {
    if (i > 0 && slot.unlocked && !slots[i - 1]!.unlocked) problems.push(`taraf ${side}: yuva ${i} açık ama önceki kilitli`);
    const tower = slot.tower;
    if (tower === null) return;
    if (!slot.unlocked) problems.push(`taraf ${side}: kilitli yuva ${i}'de kule var`);
    if (getTower(tower.type) === undefined) {
      problems.push(`taraf ${side}: yuva ${i}: bilinmeyen kule türü ${tower.type}`);
      return;
    }
    const interval = mustGetTower(tower.type).attackIntervalTicks;
    if (!Number.isInteger(tower.cooldown) || !(tower.cooldown >= 0 && tower.cooldown <= interval)) problems.push(`taraf ${side}: yuva ${i} kule sayacı sınır dışı (${tower.cooldown}/${interval})`);
    if (!Number.isInteger(tower.paid) || !(tower.paid > 0)) problems.push(`taraf ${side}: yuva ${i} kule ödemesi geçersiz (${tower.paid})`);
  });
}

export function checkInvariants(state: GameState, options: InvariantOptions = {}): string[] {
  const problems: string[] = [];
  for (const side of [0, 1] as const) {
    const s = state.sides[side];
    if (!Number.isInteger(s.gold) || s.gold < 0) problems.push(`taraf ${side}: altın geçersiz (${s.gold})`);
    if (!Number.isInteger(s.xp) || s.xp < 0) problems.push(`taraf ${side}: deneyim geçersiz (${s.xp})`);
    if (!Number.isInteger(s.baseHp) || !Number.isInteger(s.baseMaxHp)) problems.push(`taraf ${side}: üs canı tamsayı değil (${s.baseHp}/${s.baseMaxHp})`);
    if (!(s.baseHp >= 0 && s.baseHp <= s.baseMaxHp)) problems.push(`taraf ${side}: üs canı sınır dışı (${s.baseHp}/${s.baseMaxHp})`);
    if (s.queue.length > ECONOMY.maxQueue) problems.push(`taraf ${side}: kuyruk ${s.queue.length} > ${ECONOMY.maxQueue}`);
    // Yalnızca kuyruğun başındaki sipariş üretimdedir; diğerlerinin ilerlemesi sıfırdır.
    s.queue.forEach((order, index) => {
      if (index >= 1 && order.progressTicks !== 0) {
        problems.push(`taraf ${side}: kuyruk sırası ${index} üretimde değil ama ilerlemesi ${order.progressTicks}`);
      }
    });
    const ageDef = getAge(s.age);
    if (!Number.isInteger(s.age) || ageDef === undefined) problems.push(`taraf ${side}: çağ geçersiz (${s.age})`);
    else if (options.allowCustomBaseHp !== true && s.baseMaxHp !== ageDef.baseMaxHp) problems.push(`taraf ${side}: azami üs canı çağla uyumsuz (${s.baseMaxHp} ≠ ${ageDef.baseMaxHp})`);
    if (s.stats.ageUpTicks.length !== s.age - 1) problems.push(`taraf ${side}: çağ geçiş kaydı ${s.stats.ageUpTicks.length} ama çağ ${s.age}`);
    checkSlots(side, s.slots, problems);
    // Yetenek beklemesi: tamsayı, 0..max(başlangıç beklemesi, güncel yeteneğin beklemesi).
    const abilityMax = Math.max(secToTicks(ABILITY_RULES.initialCooldownSec), abilityOfAge(s.age)?.cooldownTicks ?? 0);
    if (!Number.isInteger(s.abilityCooldown) || !(s.abilityCooldown >= 0 && s.abilityCooldown <= abilityMax)) {
      problems.push(`taraf ${side}: yetenek beklemesi sınır dışı (${s.abilityCooldown}/${abilityMax})`);
    }
    if (s.baseHp <= 0 && state.outcome === null) problems.push(`taraf ${side}: üs canı ${s.baseHp} ama sonuç belirlenmemiş`);
  }

  const stone = state.stone;
  if (!Number.isInteger(stone.counter) || Math.abs(stone.counter) > STONE.counterMax) problems.push(`taş sayacı geçersiz (${stone.counter})`);
  if (stone.owner === 0 && stone.counter < 0) problems.push(`taş sahibi 0 ama sayaç ${stone.counter}`);
  if (stone.owner === 1 && stone.counter > 0) problems.push(`taş sahibi 1 ama sayaç ${stone.counter}`);
  if (stone.owner === null && Math.abs(stone.counter) === STONE.counterMax) problems.push(`taş sayacı sınırda ama sahibi yok (${stone.counter})`);

  const seen = new Set<number>();
  const perSide: [UnitState[], UnitState[]] = [[], []];
  for (const u of state.units) {
    if (seen.has(u.id)) problems.push(`birlik kimliği tekrar ediyor: ${u.id}`);
    seen.add(u.id);
    if (u.id >= state.nextId) problems.push(`birlik kimliği nextId'den büyük: ${u.id}`);
    const def = mustGetUnit(u.type).def;
    if (!Number.isFinite(u.x) || !Number.isFinite(u.hp)) problems.push(`birlik ${u.id}: sayı sonlu değil`);
    if (!Number.isInteger(u.hp)) problems.push(`birlik ${u.id}: can tamsayı değil (${u.hp})`);
    if (!(u.hp >= 0 && u.hp <= def.hp)) problems.push(`birlik ${u.id}: can sınır dışı (${u.hp}/${def.hp})`);
    const interval = mustGetUnit(u.type).attackIntervalTicks;
    if (!(u.cooldown >= 0 && u.cooldown <= interval)) problems.push(`birlik ${u.id}: bekleme sınır dışı (${u.cooldown}/${interval})`);
    if (!Number.isInteger(u.stunTicks) || u.stunTicks < 0) problems.push(`birlik ${u.id}: sersemleme sayacı geçersiz (${u.stunTicks})`);
    if (!Number.isInteger(u.vulnTicks) || u.vulnTicks < 0) problems.push(`birlik ${u.id}: savunmasızlık sayacı geçersiz (${u.vulnTicks})`);
    if (!Number.isInteger(u.vulnPct) || u.vulnPct < 0) problems.push(`birlik ${u.id}: savunmasızlık yüzdesi geçersiz (${u.vulnPct})`);
    if (u.vulnTicks === 0 && u.vulnPct !== 0) problems.push(`birlik ${u.id}: savunmasızlık bitti ama yüzde ${u.vulnPct}`);
    const half = def.width / 2;
    const limitFront = u.side === 0 ? WORLD.worldWidth - WORLD.baseWidth : WORLD.baseWidth;
    const frontX = u.side === 0 ? u.x + half : u.x - half;
    if (u.side === 0 ? frontX > limitFront + EPS : frontX < limitFront - EPS) {
      problems.push(`birlik ${u.id}: rakip üssünün içine girdi`);
    }
    perSide[u.side].push(u);
  }

  const projectileIds = new Set<number>();
  for (const p of state.projectiles) {
    if (seen.has(p.id) || projectileIds.has(p.id)) problems.push(`mermi kimliği tekrar ediyor: ${p.id}`);
    projectileIds.add(p.id);
    if (p.id >= state.nextId) problems.push(`mermi kimliği nextId'den büyük: ${p.id}`);
    if (p.sourceKind === 'tower' ? getTower(p.sourceType) === undefined : getUnit(p.sourceType) === undefined) problems.push(`mermi ${p.id}: bilinmeyen kaynak türü ${p.sourceType}`);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.targetX)) problems.push(`mermi ${p.id}: sayı sonlu değil`);
    if (!(p.x >= 0 && p.x <= WORLD.worldWidth)) problems.push(`mermi ${p.id}: koridor dışında (${p.x})`);
    if (p.targetId === null && p.targetLost) problems.push(`mermi ${p.id}: üs hedefli mermi 'hedef kayıp' olamaz`);
  }

  // Yetenek alanları ve bekleyen vuruşlar: kimlik tekil ve nextId'den küçük, alan savaş alanı içinde ve x0 ≤ x1, sayaç tamsayı.
  const field = battlefieldBounds();
  const fxIds = new Set<number>();
  const checkArea = (kind: string, e: { id: number; abilityId: string; x0: number; x1: number; ticksLeft: number }, minTicks: number): void => {
    if (fxIds.has(e.id) || seen.has(e.id) || projectileIds.has(e.id)) problems.push(`${kind} kimliği tekrar ediyor: ${e.id}`);
    fxIds.add(e.id);
    if (e.id >= state.nextId) problems.push(`${kind} kimliği nextId'den büyük: ${e.id}`);
    if (getAbility(e.abilityId) === undefined) problems.push(`${kind} ${e.id}: bilinmeyen yetenek ${e.abilityId}`);
    if (!(e.x0 <= e.x1) || !(e.x0 >= field.x0 - EPS) || !(e.x1 <= field.x1 + EPS)) problems.push(`${kind} ${e.id}: alan sınır dışı (${e.x0}..${e.x1})`);
    if (!Number.isInteger(e.ticksLeft) || e.ticksLeft < minTicks) problems.push(`${kind} ${e.id}: sayaç geçersiz (${e.ticksLeft})`);
  };
  for (const zone of state.zones) checkArea('alan', zone, 1);
  for (const strike of state.strikes) checkArea('vuruş', strike, 1);

  for (const side of [0, 1] as const) {
    const list = perSide[side].slice().sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const next = list[i]!;
      const gap = next.x - mustGetUnit(next.type).def.width / 2 - (prev.x + mustGetUnit(prev.type).def.width / 2);
      if (gap < WORLD.friendlyGap - EPS) {
        problems.push(`taraf ${side}: ${prev.id} ve ${next.id} üst üste (boşluk ${gap})`);
      }
    }
  }

  // S-05: hiçbir taraf-0 birliği bir taraf-1 birliğini tamamen geçmemiş olmalı.
  if (perSide[0].length > 0 && perSide[1].length > 0) {
    const maxBack0 = Math.max(...perSide[0].map((u) => u.x - mustGetUnit(u.type).def.width / 2));
    const minBack1 = Math.min(...perSide[1].map((u) => u.x + mustGetUnit(u.type).def.width / 2));
    if (!(maxBack0 < minBack1)) {
      problems.push(`birlikler birbirini geçti: taraf 0 en arka kenarı ${maxBack0} >= taraf 1 en arka kenarı ${minBack1}`);
    }
  }
  return problems;
}

/**
 * Altın korunumu: adım öncesi altın + gelir + ödüller + iadeler - ödemeler = adım sonrası altın.
 * Olaylardan hesaplanır; kabul edilen siparişin tam bir kez ücretlendirildiğini doğrular (K-01).
 */
export function goldBalanceProblems(goldBefore: readonly [number, number], state: GameState, events: readonly SimEvent[]): string[] {
  const expected: [number, number] = [goldBefore[0], goldBefore[1]];
  for (const e of events) {
    switch (e.type) {
      case 'unitQueued':
        expected[e.side] -= e.paid;
        break;
      case 'agedUp':
        expected[e.side] -= e.paid;
        break;
      case 'slotUnlocked':
      case 'towerBuilt':
        expected[e.side] -= e.paid;
        break;
      case 'orderCancelled':
      case 'towerSold':
        expected[e.side] += e.refund;
        break;
      case 'income':
        expected[e.side] += e.amount;
        break;
      case 'unitDied':
        expected[e.side === 0 ? 1 : 0] += e.bountyGold;
        break;
      default:
        break;
    }
  }
  const problems: string[] = [];
  for (const side of [0, 1] as const) {
    if (expected[side] !== state.sides[side].gold) {
      problems.push(`taraf ${side}: altın korunumu bozuk (beklenen ${expected[side]}, gerçek ${state.sides[side].gold})`);
    }
  }
  return problems;
}

/** Kilitlenme dedektörü süresi (saniye) — PRD K-05 / TDD §3. Süre kural değeri olduğu için burada adlandırılmıştır. */
export const STALL_SECONDS = 30;

/**
 * Kilitlenme dedektörü: sahada birlik varken STALL_SECONDS boyunca hiçbir birlik x değiştirmez,
 * hiç saldırı/üs hasarı oluşmaz ve hiç birlik doğmazsa tetiklenir. Sahada birlik yokken sayaç sıfırlanır.
 */
export class StallDetector {
  private lastX = new Map<number, number>();
  private idleTicks = 0;
  private readonly limitTicks: number;

  constructor() {
    this.limitTicks = STALL_SECONDS * WORLD.tickRate;
  }

  /** Her adımdan sonra çağır. Kilitlenme tespit edilirse true. */
  observe(state: GameState, events: readonly SimEvent[]): boolean {
    let active = false;
    for (const e of events) {
      if (
        e.type === 'attack' ||
        e.type === 'baseDamaged' ||
        e.type === 'unitSpawned' ||
        e.type === 'unitDied' ||
        e.type === 'projectileFired' ||
        e.type === 'towerFired' ||
        e.type === 'projectileImpact' ||
        e.type === 'abilityImpact'
      ) {
        active = true;
      }
    }
    // Süreli etkiler (sersemleme, alan, bekleyen vuruş) sonludur; sürerken ilerleme beklenir (TDD §3).
    if (state.zones.length > 0 || state.strikes.length > 0) active = true;
    const next = new Map<number, number>();
    for (const u of state.units) {
      if (u.stunTicks > 0) active = true;
      const before = this.lastX.get(u.id);
      if (before === undefined || before !== u.x) active = true;
      next.set(u.id, u.x);
    }
    this.lastX = next;
    if (state.units.length === 0 || active) {
      this.idleTicks = 0;
      return false;
    }
    this.idleTicks += 1;
    return this.idleTicks >= this.limitTicks;
  }
}
