import { WORLD, ECONOMY } from '../data/world';
import { EPS, getUnit, mustGetUnit } from './compile';
import type { GameState, SimEvent, UnitState } from './types';

/** Her tick sonunda geçerli olması gereken değişmezler (TDD §10). İhlal metinlerini döndürür; boşsa sorun yok. */
export function checkInvariants(state: GameState): string[] {
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
    if (s.baseHp <= 0 && state.outcome === null) problems.push(`taraf ${side}: üs canı ${s.baseHp} ama sonuç belirlenmemiş`);
  }

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
    if (getUnit(p.sourceType) === undefined) problems.push(`mermi ${p.id}: bilinmeyen kaynak türü ${p.sourceType}`);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.targetX)) problems.push(`mermi ${p.id}: sayı sonlu değil`);
    if (!(p.x >= 0 && p.x <= WORLD.worldWidth)) problems.push(`mermi ${p.id}: koridor dışında (${p.x})`);
    if (p.targetId === null && p.targetLost) problems.push(`mermi ${p.id}: üs hedefli mermi 'hedef kayıp' olamaz`);
  }

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
      case 'orderCancelled':
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
        e.type === 'projectileImpact'
      ) {
        active = true;
      }
    }
    const next = new Map<number, number>();
    for (const u of state.units) {
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
