import { MAX_CONSECUTIVE_FRAME_ERRORS, MAX_FRAME_MS, MAX_LOGGED_FRAME_ERRORS } from './constants';

/**
 * Sabit adımlı döngü (TDD §4). Saf mantık `FixedStepLoop.advance(frameMs)`: saat ve requestAnimationFrame
 * dışarıdan verilir, testte sentetik kare akışı beslenir. Tarayıcı sarmalayıcısı `startFrameLoop`.
 */

export interface LoopConfig {
  /** Bir simülasyon adımının gerçek süresi (ms) = 1000 / tickRate. */
  stepMs: number;
  /** Tek karede biriktirilecek en büyük süre (ms). */
  maxFrameMs: number;
}

export function createLoopConfig(tickRate: number): LoopConfig {
  return { stepMs: 1000 / tickRate, maxFrameMs: MAX_FRAME_MS };
}

/** Bir adım çalıştırır; `false` dönerse (ör. maç bitti) bu karedeki kalan adımlar yapılmaz ve biriktirici sıfırlanır. */
export type StepFn = () => boolean | void;

export class FixedStepLoop {
  private acc = 0;
  private isPaused = false;
  private multiplier = 1;

  constructor(
    private readonly config: LoopConfig,
    private readonly stepFn: StepFn,
  ) {}

  get paused(): boolean {
    return this.isPaused;
  }

  /** Kare başına adım çarpanı (yalnız geliştirme paneli kullanır). */
  get speed(): number {
    return this.multiplier;
  }

  setSpeed(multiplier: number): void {
    this.multiplier = Math.max(1, Math.floor(multiplier));
  }

  /** Çizim için ara değer: son iki adım arasında 0..1. */
  get alpha(): number {
    return this.acc / this.config.stepMs;
  }

  /** Duraklatma: step çağrılmaz ve biriktirici sıfırlanır. */
  pause(): void {
    this.isPaused = true;
    this.acc = 0;
  }

  resume(): void {
    this.isPaused = false;
    this.acc = 0;
  }

  /** Bir kare ilerletir; yapılan adım sayısını döndürür. */
  advance(frameMs: number): number {
    if (this.isPaused) {
      this.acc = 0;
      return 0;
    }
    const clamped = Number.isFinite(frameMs) ? Math.min(Math.max(frameMs, 0), this.config.maxFrameMs) : 0;
    this.acc += clamped;
    let steps = 0;
    while (this.acc >= this.config.stepMs) {
      this.acc -= this.config.stepMs;
      for (let i = 0; i < this.multiplier; i++) {
        steps += 1;
        if (this.stepFn() === false) {
          this.acc = 0;
          return steps;
        }
      }
    }
    return steps;
  }
}

// ---- Tarayıcı sarmalayıcısı -----------------------------------------------------

/** Zaman ve kare kaynağı; testte sahtesi verilir. */
export interface FrameClock {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
}

export interface FrameLoopOptions {
  /** Karede istisna atıldığında çağrılır (ardışık hata sayısıyla). Varsayılan: console.error (sınırlı). */
  onError?(error: unknown, consecutive: number): void;
  /** Bu kadar ardışık karede hata olursa döngü durur ve `onFatal` çağrılır. */
  maxConsecutiveErrors?: number;
  onFatal?(error: unknown): void;
}

/**
 * Kare akışını başlatır. `onFrame(frameMs)` her karede çağrılır; ilk karede frameMs = 0.
 * Sonraki kare, `onFrame`'den ÖNCE istenir ve `onFrame` try/catch içinde çalışır: tek bir karedeki hata döngüyü
 * kalıcı durdurmaz. Ardışık `maxConsecutiveErrors` karede hata olursa döngü durur ve `onFatal` çağrılır.
 * Döndürülen işlev döngüyü durdurur.
 */
export function startFrameLoop(clock: FrameClock, onFrame: (frameMs: number) => void, options: FrameLoopOptions = {}): () => void {
  const maxErrors = options.maxConsecutiveErrors ?? MAX_CONSECUTIVE_FRAME_ERRORS;
  const reported = new Set<string>();
  let last: number | null = null;
  let id = 0;
  let stopped = false;
  let consecutive = 0;

  const report = (error: unknown): void => {
    if (options.onError !== undefined) {
      options.onError(error, consecutive);
      return;
    }
    // Aynı hata her karede tekrarlanırsa konsol dolmasın: her ayrı ileti bir kez, toplamda sınırlı sayıda.
    const key = error instanceof Error ? error.message : String(error);
    if (reported.has(key) || reported.size >= MAX_LOGGED_FRAME_ERRORS) return;
    reported.add(key);
    console.error('Kare hatası:', error);
  };

  const tick = (): void => {
    if (stopped) return;
    id = clock.requestFrame(tick);
    const now = clock.now();
    const frameMs = last === null ? 0 : now - last;
    last = now;
    try {
      onFrame(frameMs);
      consecutive = 0;
    } catch (error) {
      consecutive += 1;
      report(error);
      if (consecutive >= maxErrors) {
        stopped = true;
        clock.cancelFrame(id);
        options.onFatal?.(error);
      }
    }
  };
  id = clock.requestFrame(tick);
  return () => {
    stopped = true;
    clock.cancelFrame(id);
  };
}
