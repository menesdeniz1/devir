import { STONE } from '../data/stone';
import { WORLD } from '../data/world';
import { getUnit, mustGetAge, mustGetUnit, unitOfRole } from '../sim/compile';
import type { GameState, SideId, SimEvent, UnitState } from '../sim/types';
import { PLAYER_SIDE } from './constants';
import type { Session, SessionEvent } from './session';
import { TUTORIAL, TUTORIAL_STEP_IDS, type TutorialStepId } from './tutorialConfig';

export { TUTORIAL, TUTORIAL_STEP_IDS, type TutorialStepId } from './tutorialConfig';

/** Öğretici adım çalıştırıcısı (GDD §12): her adım bir sim olayı ya da durum koşuluyla tamamlanır. Başsızdır. */

const ENEMY_SIDE: SideId = PLAYER_SIDE === 0 ? 1 : 0;

export interface StepContext {
  readonly session: Session;
  readonly state: GameState;
  mutate(fn: (state: GameState) => void): void;
}

export interface TutorialStepDef {
  id: TutorialStepId;
  /** true ise oyuncu "Devam" düğmesiyle ilerletir (bilgi adımı). */
  manual?: boolean;
  /** Adım başlarken çalışan betik (rakip hamlesi, durum ayarı). */
  enter?(ctx: StepContext): void;
  /** Her sim olayında çağrılır; true dönerse adım tamamlanır. */
  onEvent?(event: SimEvent, ctx: StepContext): boolean;
  /** Her karede durum koşulu; true dönerse adım tamamlanır. */
  check?(ctx: StepContext): boolean;
}

// ---- Durum ayarı yardımcıları ------------------------------------------------------

function ensureGold(state: GameState, side: SideId, floor: number): void {
  const s = state.sides[side];
  if (s.gold < floor) s.gold = floor;
}

/** Tüm birlik, mermi, alan ve bekleyen vuruşları temizler (sahne sıfırlama). */
function clearField(state: GameState): void {
  state.units = [];
  state.projectiles = [];
  state.zones = [];
  state.strikes = [];
}

/** Rakip kümesi: üssünden `clusterDistanceFromBase` uzakta, birbirine yakın dizili birlikler. */
function injectCluster(state: GameState): void {
  const def = unitOfRole(state.sides[ENEMY_SIDE].age, 'front');
  if (def === undefined) return;
  const step = def.def.width + WORLD.friendlyGap + 1;
  const rightmost = WORLD.worldWidth - WORLD.baseWidth - TUTORIAL.clusterDistanceFromBase;
  for (let i = 0; i < TUTORIAL.clusterSize; i++) {
    const unit: UnitState = {
      id: state.nextId,
      side: ENEMY_SIDE,
      type: def.def.id,
      x: rightmost - i * step,
      hp: def.def.hp,
      cooldown: 0,
      mode: 'walk',
      stunTicks: 0,
      vulnTicks: 0,
      vulnPct: 0,
    };
    state.nextId += 1;
    state.units.push(unit);
  }
}

function roleOf(unitId: string): string | undefined {
  return getUnit(unitId)?.role;
}

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  { id: 'welcome', manual: true },
  {
    id: 'produceFront',
    onEvent: (e) => e.type === 'unitQueued' && e.side === PLAYER_SIDE && roleOf(e.unitId) === 'front',
  },
  {
    id: 'firstKill',
    enter(ctx) {
      const def = unitOfRole(ctx.state.sides[ENEMY_SIDE].age, 'front');
      if (def === undefined) return;
      ctx.session.submit({ type: 'queueUnit', side: ENEMY_SIDE, unitId: def.def.id });
    },
    onEvent(e, ctx) {
      // Bu adımda rakibin doğan tek birliği zayıflatılır (canı azami canın weakUnitHpFraction'ı).
      if (e.type === 'unitSpawned' && e.side === ENEMY_SIDE) {
        ctx.mutate((s) => {
          const unit = s.units.find((u) => u.id === e.id);
          if (unit !== undefined) unit.hp = Math.max(1, Math.floor(mustGetUnit(unit.type).def.hp * TUTORIAL.weakUnitHpFraction));
        });
      }
      return e.type === 'unitDied' && e.side === ENEMY_SIDE;
    },
  },
  {
    id: 'produceRanged',
    onEvent: (e) => e.type === 'unitSpawned' && e.side === PLAYER_SIDE && roleOf(e.unitType) === 'ranged',
  },
  {
    id: 'cancelOrder',
    onEvent: (e) => e.type === 'orderCancelled' && e.side === PLAYER_SIDE,
  },
  {
    id: 'buildTower',
    onEvent: (e) => e.type === 'towerBuilt' && e.side === PLAYER_SIDE,
  },
  {
    id: 'useAbility',
    enter(ctx) {
      ctx.mutate((s) => {
        clearField(s);
        injectCluster(s);
        s.sides[PLAYER_SIDE].abilityCooldown = 0;
      });
    },
    onEvent: (e) => e.type === 'abilityCast' && e.side === PLAYER_SIDE,
  },
  {
    id: 'ageUp',
    enter(ctx) {
      const target = mustGetAge(TUTORIAL.ageUpTargetAge);
      ctx.mutate((s) => {
        const side = s.sides[PLAYER_SIDE];
        side.xp = Math.max(side.xp, target.xpThreshold);
        side.gold = Math.max(side.gold, target.ageUpCost + TUTORIAL.goldFloor);
      });
    },
    onEvent: (e) => e.type === 'agedUp' && e.side === PLAYER_SIDE,
  },
  {
    id: 'captureStone',
    enter(ctx) {
      ctx.mutate((s) => {
        clearField(s);
        s.stone.counter = Math.max(s.stone.counter, Math.floor(STONE.counterMax * TUTORIAL.stoneHeadStartFraction * (PLAYER_SIDE === 0 ? 1 : -1)));
      });
    },
    onEvent: (e) => e.type === 'stoneCaptured' && e.side === PLAYER_SIDE,
  },
  {
    id: 'destroyBase',
    enter(ctx) {
      ctx.mutate((s) => {
        const enemy = s.sides[ENEMY_SIDE];
        enemy.baseHp = Math.min(enemy.baseHp, TUTORIAL.finalEnemyBaseHp);
      });
    },
    check: (ctx) => ctx.state.outcome?.kind === 'win' && ctx.state.outcome.winner === PLAYER_SIDE,
  },
];

if (TUTORIAL_STEPS.length !== TUTORIAL_STEP_IDS.length) throw new Error('Öğretici adımları ile kimlikleri uyuşmuyor');

// ---- Çalıştırıcı --------------------------------------------------------------------

export type TutorialRunStatus = 'running' | 'completed';

export class TutorialRunner {
  private index = 0;
  private runStatus: TutorialRunStatus = 'running';
  private started = false;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private readonly ctx: StepContext;

  constructor(
    private readonly session: Session,
    private readonly steps: readonly TutorialStepDef[] = TUTORIAL_STEPS,
  ) {
    const self = this;
    this.ctx = {
      session,
      get state() {
        return self.session.state;
      },
      mutate: (fn) => session.scenarioMutate(fn),
    };
    this.unsubscribe = session.subscribe((event) => this.onSessionEvent(event));
  }

  get stepIndex(): number {
    return this.index;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  get step(): TutorialStepDef | null {
    return this.runStatus === 'completed' ? null : (this.steps[this.index] ?? null);
  }

  get status(): TutorialRunStatus {
    return this.runStatus;
  }

  /** Öğretici maçının başlangıç ayarı ve ilk adım. Maç yeni kurulmuş olmalıdır. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.session.scenarioMutate((s) => {
      s.sides[PLAYER_SIDE].gold = TUTORIAL.startGold;
      s.sides[ENEMY_SIDE].gold = TUTORIAL.enemyStartGold;
    });
    this.steps[0]?.enter?.(this.ctx);
    this.emit();
  }

  /** Bilgi adımını ilerletir ("Devam"). Yalnız `manual` adımda etkilidir. */
  advance(): void {
    if (this.step?.manual === true) this.completeStep();
  }

  /** Her karede: üs canı alt sınırları ve durum koşulları. Duraklatılmışken ilerlemez. */
  update(): void {
    if (this.runStatus !== 'running' || this.session.paused) return;
    const state = this.session.state;
    if (state.outcome === null) this.clampBases(state);
    const step = this.step;
    if (step?.check?.(this.ctx) === true) this.completeStep();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  private clampBases(state: GameState): void {
    const last = this.index >= this.steps.length - 1;
    for (const side of [PLAYER_SIDE, ENEMY_SIDE] as const) {
      if (side === ENEMY_SIDE && last) continue;
      const s = state.sides[side];
      const floor = Math.ceil(s.baseMaxHp * TUTORIAL.baseHpFloorFraction);
      if (s.baseHp < floor) s.baseHp = floor;
    }
  }

  private onSessionEvent(event: SessionEvent): void {
    if (event.type !== 'sim' || this.runStatus !== 'running') return;
    for (const e of event.events) {
      if (this.runStatus !== 'running') return;
      if (this.step?.onEvent?.(e, this.ctx) === true) this.completeStep();
    }
  }

  private completeStep(): void {
    this.index += 1;
    const next = this.steps[this.index];
    if (next === undefined) {
      this.runStatus = 'completed';
      this.emit();
      return;
    }
    this.session.scenarioMutate((s) => {
      ensureGold(s, PLAYER_SIDE, TUTORIAL.goldFloor);
      ensureGold(s, ENEMY_SIDE, TUTORIAL.goldFloor);
    });
    next.enter?.(this.ctx);
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
