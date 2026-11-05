import { MUSIC } from '../config';
import { clamp } from '../dsp';
import { STEPS_PER_BEAT } from './songs';

/**
 * Adım sıralayıcının saf zamanlama hesapları (ses bağlamından bağımsız, test edilebilir).
 * Çalma zamanı AudioContext saatindedir; ileri bakışlı zamanlayıcı her turda `lookahead` kadar ilerisini planlar.
 */

/** Gerilim (0..1) ile hızlanmış tempo (bpm). */
export function effectiveBpm(bpm: number, tension: number): number {
  return bpm * (1 + MUSIC.tempoBoost * clamp(tension, 0, 1));
}

/** Bir adımın süresi (sn). */
export function stepDurationSec(bpm: number, tension = 0): number {
  return 60 / effectiveBpm(bpm, tension) / STEPS_PER_BEAT;
}

/** Tüm döngünün süresi (sn). */
export function loopDurationSec(bpm: number, totalSteps: number, tension = 0): number {
  return totalSteps * stepDurationSec(bpm, tension);
}

export interface SeqState {
  /** Sıradaki planlanacak adım (0..totalSteps-1). */
  step: number;
  /** O adımın çalma zamanı (bağlam saati). */
  time: number;
  /** Tamamlanan döngü sayısı. */
  loop: number;
}

export interface PlannedStep {
  step: number;
  time: number;
  loop: number;
}

export interface PlanResult {
  planned: PlannedStep[];
  state: SeqState;
}

/** Zamanlayıcı bundan fazla gecikirse (ör. duraklama) toplu patlama yerine şimdiye yeniden hizalanır. */
export const MAX_LAG_SEC = 0.15;

/**
 * `now`dan `lookaheadSec` ileriye kadar çalınacak adımları döndürür ve ilerlemiş durumu verir.
 * Girdi durumu değiştirilmez. Döngü sonunda adım 0'a döner ve `loop` artar.
 */
export function planSteps(state: SeqState, now: number, lookaheadSec: number, stepDur: number, totalSteps: number): PlanResult {
  let { step, time, loop } = state;
  if (time < now - MAX_LAG_SEC) time = now + MUSIC.restartPadSec;
  const planned: PlannedStep[] = [];
  const horizon = now + lookaheadSec;
  while (time < horizon) {
    planned.push({ step, time, loop });
    time += stepDur;
    step++;
    if (step >= totalSteps) {
      step = 0;
      loop++;
    }
  }
  return { planned, state: { step, time, loop } };
}

/**
 * Duraklamada henüz çalınmamış (zamanı `now`dan sonra) en erken planlı adıma geri sarar;
 * böylece devam edildiğinde ileri bakış penceresindeki notalar kaybolmaz.
 */
export function rewindToUnplayed(state: SeqState, recent: readonly PlannedStep[], now: number): SeqState {
  const first = recent.find((p) => p.time > now);
  return first ? { step: first.step, time: first.time, loop: first.loop } : state;
}
