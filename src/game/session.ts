import { createBasicBot } from '../ai/basicBot';
import type { Controller } from '../ai/controller';
import { createAiBot } from '../ai/strategy';
import { WORLD } from '../data/world';
import type { UiRejectReason } from '../i18n/tr';
import { stepMatch } from '../match/runner';
import { createMatch } from '../sim/create';
import type { Command, GameState, MatchConfig, SimEvent } from '../sim/types';
import { validate } from '../sim/validate';
import { DEFAULT_SEED } from './constants';
import { createLoopConfig, FixedStepLoop } from './loop';

export type { UiRejectReason } from '../i18n/tr';

/** Komut denetiminin sonucu: simülasyonun `validate` sonucu ya da oturum katmanının 'paused' reddi (TDD §3). */
export type Check = { ok: true } | { ok: false; reason: UiRejectReason; missingGold?: number; xp?: number; xpRequired?: number };

/** Görünürlük olaylarını dinleyebilen kaynak (tarayıcıda `document`; testte sahte). */
export interface VisibilitySource {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export type SessionEvent =
  | { type: 'sim'; events: readonly SimEvent[] }
  | { type: 'paused'; paused: boolean }
  | { type: 'ended' }
  /** Yeni maç kuruldu: görünüm nesneleri dahil önceki maça ait her şey atılmalı. */
  | { type: 'reset' };

export interface SessionOptions {
  seed?: number;
  opponent?: MatchConfig['opponent'];
  /** Her yeni maçta çağrılır; [taraf 0, taraf 1]. Varsayılan: [null, config.opponent'in denetleyicisi]. */
  createControllers?: () => [Controller | null, Controller | null];
  visibility?: VisibilitySource | null;
}

interface QueuedCommand {
  /** Bu tick'te (ya da sonrasında ilk adımda) uygulanır. */
  tick: number;
  command: Command;
}

/** Oyunun varsayılan rakibi (GDD §9). */
const DEFAULT_OPPONENT: MatchConfig['opponent'] = 'normal';

/** Rakip (taraf 1) denetleyicisi yalnız config'ten kurulur; böylece kayıttan aynı yolla yeniden kurulabilir (TDD §5). */
function defaultControllers(config: MatchConfig): [Controller | null, Controller | null] {
  switch (config.opponent) {
    case 'easy':
    case 'normal':
    case 'hard':
      return [null, createAiBot(config.opponent, config.seed, 1)];
    case 'basic-bot':
      return [null, createBasicBot()];
    case 'none':
      return [null, null];
  }
}

/**
 * Maç yaşam döngüsü: durum + denetleyiciler + komut kuyruğu + sabit adımlı döngü + duraklatma.
 * Yeniden başlatma her şeyi sıfırdan kurar (PRD K-08).
 */
export class Session {
  private readonly config: MatchConfig;
  private readonly makeControllers: () => [Controller | null, Controller | null];
  private readonly visibility: VisibilitySource | null;
  private readonly listeners = new Set<(event: SessionEvent) => void>();
  private readonly onVisibility = (): void => {
    if (this.visibility !== null && this.visibility.visibilityState === 'hidden') this.pause();
  };

  private gameState: GameState;
  private controllers: [Controller | null, Controller | null];
  private loop: FixedStepLoop;
  private commandQueue: QueuedCommand[] = [];
  private prevX = new Map<number, number>();
  private prevProjectileX = new Map<number, number>();
  private frameEvents: SimEvent[] = [];
  private endedAnnounced = false;

  constructor(options: SessionOptions = {}) {
    this.config = { seed: options.seed ?? DEFAULT_SEED, opponent: options.opponent ?? DEFAULT_OPPONENT };
    const config = this.config;
    this.makeControllers = options.createControllers ?? (() => defaultControllers(config));
    this.visibility = options.visibility ?? null;
    this.gameState = createMatch(this.config);
    this.controllers = this.makeControllers();
    this.loop = this.newLoop();
    this.visibility?.addEventListener('visibilitychange', this.onVisibility);
  }

  // ---- Okuma ---------------------------------------------------------------

  get state(): GameState {
    return this.gameState;
  }

  get tick(): number {
    return this.gameState.tick;
  }

  get paused(): boolean {
    return this.loop.paused;
  }

  get speed(): number {
    return this.loop.speed;
  }

  /** Maç bitmiş mi (girdiler kapalı). */
  get ended(): boolean {
    return this.gameState.outcome !== null;
  }

  /** Henüz uygulanmamış kabul edilmiş komut sayısı. */
  get pendingCommandCount(): number {
    return this.commandQueue.length;
  }

  /** Çizim için: duraklatılmış ya da bitmişken 1 (ara değer yok), aksi hâlde döngünün alpha değeri. */
  get renderAlpha(): number {
    if (this.paused || this.ended) return 1;
    return Math.min(1, this.loop.alpha);
  }

  /** Birliğin bir önceki tick'teki konumu; yoksa undefined. */
  previousX(unitId: number): number | undefined {
    return this.prevX.get(unitId);
  }

  /** Merminin bir önceki tick'teki konumu; yoksa (bu tick'te atıldı) undefined. */
  previousProjectileX(projectileId: number): number | undefined {
    return this.prevProjectileX.get(projectileId);
  }

  // ---- Komutlar ------------------------------------------------------------

  /**
   * Komutun şu an kabul edilip edilmeyeceği. Arayüz, düğme etkinliği ve neden metni için bunu kullanır.
   * Duraklatmada her komut 'paused' ile reddedilir; aksi hâlde simülasyonun `validate` sonucu geçerlidir.
   */
  check(command: Command): Check {
    if (this.paused) return { ok: false, reason: 'paused' };
    const result = validate(this.gameState, command);
    if (result.ok) return { ok: true };
    const rejected: Check = { ok: false, reason: result.reason };
    if (result.missingGold !== undefined) rejected.missingGold = result.missingGold;
    if (result.xp !== undefined) rejected.xp = result.xp;
    if (result.xpRequired !== undefined) rejected.xpRequired = result.xpRequired;
    return rejected;
  }

  /**
   * Komutu kuyruğa yazar; `atTick` verilmezse sonraki adıma (şu anki tick) damgalanır.
   * Reddedilen komut kuyruğa girmez ve durumu değiştirmez.
   */
  submit(command: Command, atTick: number = this.gameState.tick): Check {
    const result = this.check(command);
    if (!result.ok) return result;
    this.commandQueue.push({ tick: atTick, command });
    return result;
  }

  // ---- Duraklatma ----------------------------------------------------------

  pause(): void {
    if (this.paused || this.ended) return;
    this.loop.pause();
    this.snapshotPrev();
    this.emit({ type: 'paused', paused: true });
  }

  resume(): void {
    if (!this.paused) return;
    this.loop.resume();
    this.snapshotPrev();
    this.emit({ type: 'paused', paused: false });
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  // ---- Döngü ---------------------------------------------------------------

  /** Bir kare ilerletir (kare süresi ms). Yapılan adım sayısını döndürür. */
  advance(frameMs: number): number {
    this.frameEvents = [];
    const steps = this.loop.advance(frameMs);
    if (this.frameEvents.length > 0) this.emit({ type: 'sim', events: this.frameEvents });
    if (this.ended && !this.endedAnnounced) {
      this.endedAnnounced = true;
      this.emit({ type: 'ended' });
    }
    return steps;
  }

  private stepOnce(): boolean {
    if (this.gameState.outcome !== null) return false;
    this.snapshotPrev();
    const tick = this.gameState.tick;
    const due: Command[] = [];
    const rest: QueuedCommand[] = [];
    for (const item of this.commandQueue) {
      if (item.tick <= tick) due.push(item.command);
      else rest.push(item);
    }
    this.commandQueue = rest;
    const events = stepMatch(this.gameState, due, this.controllers);
    for (const event of events) this.frameEvents.push(event);
    return this.gameState.outcome === null;
  }

  private snapshotPrev(): void {
    this.prevX.clear();
    for (const unit of this.gameState.units) this.prevX.set(unit.id, unit.x);
    this.prevProjectileX.clear();
    for (const projectile of this.gameState.projectiles) this.prevProjectileX.set(projectile.id, projectile.x);
  }

  private newLoop(): FixedStepLoop {
    return new FixedStepLoop(createLoopConfig(WORLD.tickRate), () => this.stepOnce());
  }

  // ---- Yeniden oyna --------------------------------------------------------

  /** Tamamen yeni maç: durum, denetleyiciler, kuyruk, döngü ve duraklatma sıfırdan (PRD K-08). */
  restart(): void {
    this.gameState = createMatch(this.config);
    this.controllers = this.makeControllers();
    this.loop = this.newLoop();
    this.commandQueue = [];
    this.prevX = new Map();
    this.prevProjectileX = new Map();
    this.frameEvents = [];
    this.endedAnnounced = false;
    this.emit({ type: 'reset' });
    this.emit({ type: 'paused', paused: false });
  }

  // ---- Geliştirme yardımcıları (yalnız ?debug) -----------------------------

  setSpeed(multiplier: number): void {
    this.loop.setSpeed(multiplier);
  }

  /** Durumu doğrudan değiştirir. YALNIZ geliştirme paneli içindir. */
  debugMutate(mutate: (state: GameState) => void): void {
    mutate(this.gameState);
  }

  // ---- Abonelik ------------------------------------------------------------

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.visibility?.removeEventListener('visibilitychange', this.onVisibility);
    this.listeners.clear();
  }

  private emit(event: SessionEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
