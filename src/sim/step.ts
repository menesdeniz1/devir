import { COMBAT } from '../data/combat';
import { WORLD } from '../data/world';
import { advanceAbilityEffects, detonateStrikes, type EffectFlags } from './abilities';
import { applyCommand } from './commands';
import { strike, type PendingDamage } from './combat';
import { EROSION, STONE } from '../data/stone';
import { EPS, mustGetAge, mustGetTower, mustGetUnit } from './compile';
import { dirOf, enemyBaseFaceX, facingEdgeX, otherSide, ownBaseFaceX } from './geometry';
import { selectTargets, type Target } from './targeting';
import { erosionEnabled, type Command, type GameState, type Outcome, type ProjectileState, type SideId, type SimEvent, type UnitState } from './types';
import { isWellFormedCommand } from './validate';

/**
 * Bir simülasyon adımı (TDD §3). Durumu yerinde değiştirir ve olayları döndürür.
 * Sonuç belirlenmişse hiçbir şeyi değiştirmez (tick dahil) ve boş liste döner.
 */
export function step(state: GameState, commands: readonly Command[]): SimEvent[] {
  if (state.outcome !== null) return [];
  const events: SimEvent[] = [];

  applyCommands(state, commands, events);
  economy(state, events);
  production(state, events);
  const pending: PendingDamage[] = [];
  const effects = advanceAbilityEffects(state, pending, events);
  const targets = selectTargets(state);
  movement(state, targets, effects);
  attacks(state, targets, effects, pending, events);
  advanceProjectiles(state, pending, events);
  towerAttacks(state, events);
  detonateStrikes(state, pending, events);
  resolveDamage(state, pending, effects, events);
  updateStone(state, events);
  resolveOutcome(state, events);
  state.tick += 1;
  return events;
}

// ---- 2. Komutlar -------------------------------------------------------------

function applyCommands(state: GameState, commands: readonly Command[], events: SimEvent[]): void {
  // Önce taraf 0, sonra taraf 1; aynı taraf içinde verilen sıra korunur.
  for (const side of [0, 1] as const) {
    for (const cmd of commands) {
      if (isWellFormedCommand(cmd) && cmd.side === side) applyCommand(state, cmd, events);
    }
  }
  // Bozuk komutlar (taraf dışı, bilinmeyen tür, eksik alan) sessizce atılmaz; 'invalidCommand' ile reddedilir.
  for (const cmd of commands) {
    if (!isWellFormedCommand(cmd)) applyCommand(state, cmd, events);
  }
}

// ---- 3. Ekonomi --------------------------------------------------------------

function economy(state: GameState, events: SimEvent[]): void {
  // Tam bir saniye dolduğunda (adım sonunda) gelir yazılır.
  if ((state.tick + 1) % WORLD.tickRate !== 0) return;
  // Aşınma (GDD §8.1): başlangıçtan sonra iki üs de her saniye azami canının binde perSecPermille'ini kaybeder.
  if (erosionEnabled(state.config)) {
    const elapsedSec = (state.tick + 1) / WORLD.tickRate;
    if (elapsedSec === EROSION.startSec) events.push({ type: 'erosionStarted' });
    if (elapsedSec > EROSION.startSec) {
      for (const sd of state.sides) sd.baseHp = Math.max(0, sd.baseHp - Math.ceil((sd.baseMaxHp * EROSION.perSecPermille) / 1000));
    }
  }
  for (const side of [0, 1] as const) {
    const s = state.sides[side];
    const ageDef = mustGetAge(s.age);
    let amount = ageDef.incomePerSec;
    // Sınır Taşı bonusu (GDD §8): payın bir kısmı sahibine hemen, kalanı kazanda birikir.
    if (state.stone.owner === side) {
      const keepGold = Math.round(ageDef.stoneGoldPerSec * (1 - STONE.potShare));
      const keepXp = Math.round(ageDef.stoneXpPerSec * (1 - STONE.potShare));
      amount += keepGold;
      s.xp += keepXp;
      state.stone.potGold += ageDef.stoneGoldPerSec - keepGold;
      state.stone.potXp += ageDef.stoneXpPerSec - keepXp;
    }
    s.gold += amount;
    s.stats.goldEarned += amount;
    events.push({ type: 'income', side, amount });
  }
}

// ---- 4. Üretim ---------------------------------------------------------------

function production(state: GameState, events: SimEvent[]): void {
  for (const side of [0, 1] as const) {
    const s = state.sides[side];
    const order = s.queue[0];
    if (order === undefined) continue;
    const unit = mustGetUnit(order.unitId);
    if (order.progressTicks < unit.buildTicks) order.progressTicks += 1;
    if (order.progressTicks < unit.buildTicks) continue;
    if (!spawnBlocked(state, side, unit.def.width)) {
      spawnUnit(state, side, order.unitId, events);
      s.queue.shift();
    }
  }
}

/** Aynı taraftan herhangi bir birlik [ön yüz, ön yüz + w + aralık] aralığıyla çakışıyorsa doğma engellidir. */
function spawnBlocked(state: GameState, side: SideId, width: number): boolean {
  // Taraf koordinatında (ileri yön artan): doğma bölgesi [0, width + aralık] (üs ön yüzünden itibaren).
  const zoneEnd = width + WORLD.friendlyGap;
  for (const u of state.units) {
    if (u.side !== side) continue;
    const half = mustGetUnit(u.type).def.width / 2;
    const rear = forwardOffset(side, u.x) - half;
    const front = forwardOffset(side, u.x) + half;
    if (rear < zoneEnd - EPS && front > EPS) return true;
  }
  return false;
}

/** Kendi üssünün ön yüzünden ileri doğru ölçülen konum. */
function forwardOffset(side: SideId, x: number): number {
  return side === 0 ? x - WORLD.baseWidth : WORLD.worldWidth - WORLD.baseWidth - x;
}

function spawnUnit(state: GameState, side: SideId, unitId: string, events: SimEvent[]): void {
  const unit = mustGetUnit(unitId);
  const half = unit.def.width / 2;
  const x = side === 0 ? WORLD.baseWidth + half : WORLD.worldWidth - WORLD.baseWidth - half;
  const id = state.nextId;
  state.nextId += 1;
  state.units.push({ id, side, type: unitId, x, hp: unit.def.hp, cooldown: 0, mode: 'wait', stunTicks: 0, vulnTicks: 0, vulnPct: 0 });
  state.sides[side].stats.produced[unitId] = (state.sides[side].stats.produced[unitId] ?? 0) + 1;
  events.push({ type: 'unitSpawned', side, id, unitType: unitId });
}

// ---- 6. Hedefleme: targeting.ts ----------------------------------------------

// ---- 7. Hareket --------------------------------------------------------------

function movement(state: GameState, targets: readonly Target[], effects: EffectFlags): void {
  // Karşı tarafın tick başındaki en ön kenarı (her taraf kendi ileri koordinatında), hareket başlamadan alınır.
  const enemyFrontForward: [number, number] = [Infinity, Infinity];
  for (const side of [0, 1] as const) {
    const enemy = otherSide(side);
    const dir = dirOf(side);
    for (const e of state.units) {
      if (e.side !== enemy) continue;
      const half = mustGetUnit(e.type).def.width / 2;
      const edgeX = e.x + dirOf(enemy) * half;
      enemyFrontForward[side] = Math.min(enemyFrontForward[side], dir * edgeX);
    }
  }

  // Sersemlemiş birlik hareket etmez ve saldırmaz; hedef olmaya devam eder.
  const modes: ('walk' | 'attack' | 'wait')[] = state.units.map((_, i) => (targets[i] !== null && !effects.stunned[i] ? 'attack' : 'wait'));

  for (const side of [0, 1] as const) {
    const dir = dirOf(side);
    // Önden arkaya: ileri koordinatı büyük olan önce; eşitlikte dizi sırası.
    const order: number[] = [];
    state.units.forEach((u, i) => {
      if (u.side === side) order.push(i);
    });
    order.sort((i, j) => dir * state.units[j]!.x - dir * state.units[i]!.x || i - j);

    const baseLimit = dir * enemyBaseFaceX(side);
    let aheadRear: number | null = null;
    for (const i of order) {
      const u = state.units[i]!;
      const def = mustGetUnit(u.type);
      const half = def.def.width / 2;
      if (targets[i] === null && !effects.stunned[i]) {
        const front = dir * u.x + half;
        // Alandaki yavaşlatma hız çarpanıdır; yavaşlatma yokken hız aynen kalır (kayan nokta kimliği korunur).
        const slow = effects.slowPct[i]!;
        let limit = front + (slow > 0 ? (def.speedPerTick * (100 - slow)) / 100 : def.speedPerTick);
        if (aheadRear !== null) limit = Math.min(limit, aheadRear - WORLD.friendlyGap);
        // "Boşluğun yarısı" sınırı: iki taraf aynı adımda iç içe geçmez.
        const enemyFront = enemyFrontForward[side];
        if (enemyFront !== Infinity) limit = Math.min(limit, front + Math.max(0, enemyFront - front) / 2);
        limit = Math.min(limit, baseLimit);
        if (limit > front) {
          u.x = dir * (limit - half);
          modes[i] = 'walk';
        }
      }
      aheadRear = dir * u.x - half;
    }
  }

  state.units.forEach((u, i) => {
    u.mode = modes[i]!;
  });
}

// ---- 8. Saldırılar -----------------------------------------------------------

function attacks(state: GameState, targets: readonly Target[], effects: EffectFlags, pending: PendingDamage[], events: SimEvent[]): void {
  const byId = indexById(state.units);
  state.units.forEach((u, i) => {
    // Sersemlemiş birliğin saldırı sayacı da durur (sersemleme bitince kaldığı yerden sürer).
    if (effects.stunned[i] === true) return;
    if (u.cooldown > 0) u.cooldown -= 1;
    const target = targets[i] ?? null;
    if (target === null || u.cooldown > 0) return;
    const def = mustGetUnit(u.type);
    const victim = target === 'base' ? 'base' : byId.get(target);
    if (victim === undefined) return; // hedefler aynı adımda seçildiği için oluşmaz
    u.cooldown = def.attackIntervalTicks;
    const impactX = victim === 'base' ? enemyBaseFaceX(u.side) : facingEdgeX(victim, mustGetUnit(victim.type).def.width, u.side);
    if (def.projectileStep === null) {
      // Yakın dövüş: hasar anında bekleyen hasara girer (tamsayı tablo).
      const result = strike(state, u.side, 'unit', u.type, victim, impactX, pending);
      events.push({ type: 'attack', side: u.side, attackerId: u.id, target, damage: result.mainDamage });
      return;
    }
    // Menzilli/ağır: mermi üretir; hasar çarpmada (adım 9) bekleyen hasara girer.
    const dir = dirOf(u.side);
    const id = state.nextId;
    state.nextId += 1;
    const projectile: ProjectileState = {
      id,
      side: u.side,
      sourceKind: 'unit',
      sourceType: u.type,
      sourceId: u.id,
      targetId: victim === 'base' ? null : victim.id,
      x: u.x + (dir * def.def.width) / 2,
      targetX: impactX,
      targetLost: false,
    };
    state.projectiles.push(projectile);
    events.push({ type: 'attack', side: u.side, attackerId: u.id, target, damage: null });
    events.push({ type: 'projectileFired', side: u.side, id, sourceType: u.type, target });
  });
}

function indexById(units: readonly UnitState[]): Map<number, UnitState> {
  const byId = new Map<number, UnitState>();
  for (const u of units) byId.set(u.id, u);
  return byId;
}

// ---- 9. Mermiler -------------------------------------------------------------

/**
 * Her mermi hedefinin güncel çarpma noktasına speed/tickRate kadar ilerler; kalan mesafe adımdan kısaysa çarpar.
 * Hedef ölmüşse targetLost işaretlenir ve targetX son bilinen noktada kalır: alan hasarı varsa orada patlar,
 * yoksa hasarsız kaybolur. Atan birlik ölmüş olsa da mermi sürer (hasar sourceType'tan hesaplanır).
 */
function advanceProjectiles(state: GameState, pending: PendingDamage[], events: SimEvent[]): void {
  if (state.projectiles.length === 0) return;
  const byId = indexById(state.units);
  const flying: ProjectileState[] = [];
  for (const p of state.projectiles) {
    const stepLength = p.sourceKind === 'tower' ? mustGetTower(p.sourceType).projectileStep : (mustGetUnit(p.sourceType).projectileStep ?? 0);
    const dir = dirOf(p.side);
    let victim: UnitState | 'base' | null;
    if (p.targetId === null) {
      victim = 'base';
    } else {
      const found = p.targetLost ? undefined : byId.get(p.targetId);
      if (found === undefined) {
        p.targetLost = true;
        victim = null;
      } else {
        victim = found;
        p.targetX = facingEdgeX(found, mustGetUnit(found.type).def.width, p.side);
      }
    }
    if (dir * (p.targetX - p.x) > stepLength) {
      p.x += dir * stepLength;
      flying.push(p);
      continue;
    }
    p.x = p.targetX;
    const result = strike(state, p.side, p.sourceKind, p.sourceType, victim, p.targetX, pending);
    events.push({ type: 'projectileImpact', side: p.side, id: p.id, x: p.targetX, hits: result.unitsHit, hitBase: result.hitBase });
  }
  state.projectiles = flying;
}

/**
 * Kuleler (TDD §3 adım 9): her yuvadaki kulenin sayacı 1 azalır (0'ın altına inmez). Sayaç 0 ise ve üs ön yüzüne
 * bakan kenar mesafesi menzil içinde olan en yakın düşman birliği varsa (eşitlikte dizi sırası) mermi atar.
 * Kuleler üsse saldırmaz ve hedef alınamaz; hasar mermi çarpınca (adım 10) uygulanır.
 */
function towerAttacks(state: GameState, events: SimEvent[]): void {
  for (const side of [0, 1] as const) {
    const slots = state.sides[side].slots;
    for (let slot = 0; slot < slots.length; slot++) {
      const tower = slots[slot]!.tower;
      if (tower === null) continue;
      if (tower.cooldown > 0) tower.cooldown -= 1;
      if (tower.cooldown > 0) continue;
      const def = mustGetTower(tower.type);
      const target = nearestTowerTarget(state, side, def.def.range);
      if (target === null) continue;
      tower.cooldown = def.attackIntervalTicks;
      const id = state.nextId;
      state.nextId += 1;
      state.projectiles.push({
        id,
        side,
        sourceKind: 'tower',
        sourceType: tower.type,
        sourceId: slot,
        targetId: target.id,
        x: ownBaseFaceX(side),
        targetX: facingEdgeX(target, mustGetUnit(target.type).def.width, side),
        targetLost: false,
      });
      events.push({ type: 'towerFired', side, slot, towerType: tower.type, target: target.id });
      events.push({ type: 'projectileFired', side, id, sourceType: tower.type, target: target.id });
    }
  }
}

/** Kendi üs ön yüzüne bakan kenar mesafesi `range` içinde olan en yakın düşman birliği; yoksa null. */
function nearestTowerTarget(state: GameState, side: SideId, range: number): UnitState | null {
  const enemy = otherSide(side);
  const dir = dirOf(side);
  const face = ownBaseFaceX(side);
  let best: UnitState | null = null;
  let bestGap = Infinity;
  for (const e of state.units) {
    if (e.side !== enemy) continue;
    const gap = dir * (facingEdgeX(e, mustGetUnit(e.type).def.width, side) - face);
    if (gap <= range && gap < bestGap) {
      best = e;
      bestGap = gap;
    }
  }
  return best;
}

// ---- 10. Hasarın eşzamanlı uygulanması ---------------------------------------

function resolveDamage(state: GameState, pending: readonly PendingDamage[], effects: EffectFlags, events: SimEvent[]): void {
  if (pending.length === 0) return;
  const byId = indexById(state.units);
  const fatalSeen = new Set<number>();

  for (const p of pending) {
    if (p.target === 'base') {
      const victim = otherSide(p.attackerSide);
      const base = state.sides[victim];
      const applied = Math.min(p.damage, base.baseHp);
      base.baseHp -= applied;
      if (applied > 0) {
        // Üs baskısı deneyimi (PRD E-10, GDD §4): toplam üs hasarı her 100'ü geçtikçe saldırana deneyim.
        const attacker = state.sides[p.attackerSide];
        const before = attacker.stats.baseDamageDealt;
        attacker.xp += (Math.floor((before + applied) / 100) - Math.floor(before / 100)) * COMBAT.baseDamageXpPer100;
        state.sides[p.attackerSide].stats.baseDamageDealt += applied;
        events.push({ type: 'baseDamaged', side: victim, amount: applied });
      }
      continue;
    }
    const victim = byId.get(p.target);
    if (victim === undefined) continue;
    // Savunmasız birlik (donmuş) %vulnPct fazla hasar alır; sonuç tamsayıya yuvarlanır (GDD §7).
    const vulnPct = effects.vulnerable.get(victim.id);
    victim.hp -= vulnPct === undefined ? p.damage : Math.round((p.damage * (100 + vulnPct)) / 100);
    if (victim.hp <= 0 && !fatalSeen.has(victim.id)) {
      fatalSeen.add(victim.id);
      const kills = state.sides[p.attackerSide].stats.kills;
      kills[p.attackerType] = (kills[p.attackerType] ?? 0) + 1;
    }
  }

  if (fatalSeen.size === 0) return;
  const survivors: UnitState[] = [];
  for (const u of state.units) {
    if (!fatalSeen.has(u.id)) {
      survivors.push(u);
      continue;
    }
    const def = mustGetUnit(u.type).def;
    const rewardSide = otherSide(u.side);
    const reward = state.sides[rewardSide];
    reward.gold += def.bountyGold;
    reward.xp += def.bountyXp;
    reward.stats.goldEarned += def.bountyGold;
    state.sides[u.side].stats.lost[u.type] = (state.sides[u.side].stats.lost[u.type] ?? 0) + 1;
    events.push({
      type: 'unitDied',
      side: u.side,
      id: u.id,
      unitType: u.type,
      bountyGold: def.bountyGold,
      bountyXp: def.bountyXp,
    });
  }
  state.units = survivors;
}

// ---- 11. Sınır Taşı -------------------------------------------------------------

/**
 * Gövdesi [zoneStart, zoneEnd] ile kesişen birlikler taraf başına sayılır. Yalnız bir taraf varsa sayaç o tarafa 1
 * ilerler (±counterMax'ta durur); iki taraf da varsa ya da kimse yoksa değişmez. Sınıra ulaşan sahip olur;
 * sahip 0 iken sayaç < 0, sahip 1 iken sayaç > 0 olursa sahiplik düşer.
 */
/** Taşı sahibinden söken taraf kazanın tamamını alır (GDD §8); kazan boşalır. */
function claimPot(state: GameState, side: SideId, events: SimEvent[]): void {
  const stone = state.stone;
  if (stone.potGold === 0 && stone.potXp === 0) return;
  const s = state.sides[side];
  s.gold += stone.potGold;
  s.stats.goldEarned += stone.potGold;
  s.xp += stone.potXp;
  events.push({ type: 'stonePotClaimed', side, gold: stone.potGold, xp: stone.potXp });
  stone.potGold = 0;
  stone.potXp = 0;
}

function updateStone(state: GameState, events: SimEvent[]): void {
  const stone = state.stone;
  const present: [boolean, boolean] = [false, false];
  for (const u of state.units) {
    const half = mustGetUnit(u.type).def.width / 2;
    if (u.x + half >= STONE.zoneStart && u.x - half <= STONE.zoneEnd) present[u.side] = true;
  }
  if (present[0] && !present[1]) stone.counter = Math.min(STONE.counterMax, stone.counter + 1);
  else if (present[1] && !present[0]) stone.counter = Math.max(-STONE.counterMax, stone.counter - 1);

  if (stone.owner === 0 && stone.counter < 0) {
    stone.owner = null;
    events.push({ type: 'stoneLost', side: 0 });
    claimPot(state, 1, events);
  } else if (stone.owner === 1 && stone.counter > 0) {
    stone.owner = null;
    events.push({ type: 'stoneLost', side: 1 });
    claimPot(state, 0, events);
  }
  if (stone.owner === null) {
    if (stone.counter === STONE.counterMax) {
      stone.owner = 0;
      events.push({ type: 'stoneCaptured', side: 0 });
    } else if (stone.counter === -STONE.counterMax) {
      stone.owner = 1;
      events.push({ type: 'stoneCaptured', side: 1 });
    }
  }
}

// ---- 12. Sonuç ---------------------------------------------------------------

function resolveOutcome(state: GameState, events: SimEvent[]): void {
  const down0 = state.sides[0].baseHp <= 0;
  const down1 = state.sides[1].baseHp <= 0;
  if (!down0 && !down1) return;
  // Sonuç tick'i: bu adım dahil geçen toplam tick (tick++ bu adımın sonunda yapılır).
  const tick = state.tick + 1;
  const outcome: Outcome = down0 && down1 ? { kind: 'draw', tick } : { kind: 'win', winner: down0 ? 1 : 0, tick };
  state.outcome = outcome;
  // Olay durumla nesne paylaşmaz: dinleyicinin değişikliği duruma sızamaz.
  events.push({ type: 'matchEnded', outcome: { ...outcome } });
}
