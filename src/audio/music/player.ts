import type { AudioBufferLike, AudioContextLike, BufferSourceLike, GainNodeLike, TimerLike } from '../backend';
import { toAudioBuffer } from '../backend';
import { MUSIC } from '../config';
import { composeSong, type Song } from './compose';
import { renderInstrument } from './instruments';
import { planSteps, rewindToUnplayed, stepDurationSec, type PlannedStep, type SeqState } from './sequencer';
import { songDefForAge } from './songs';

export interface MusicPlayerDeps {
  ctx: AudioContextLike;
  /** Müzik kanalı (ses düzeyi ve duraklatma bu düğümün aşağısında uygulanır). */
  output: GainNodeLike;
  timer: TimerLike;
  sampleRate?: number;
}

interface Track {
  age: number;
  song: Song;
  /** Gerilimsiz adım süresi; nota arabelleği uzunlukları bundan hesaplanır. */
  baseStepSec: number;
  gain: GainNodeLike;
  state: SeqState;
  recent: PlannedStep[];
  cache: Map<string, AudioBufferLike>;
  live: Set<BufferSourceLike>;
  /** Çapraz geçişte sönüş bitiş zamanı; null ise etkin parça. */
  fadeEnd: number | null;
}

/** Çağ müziğini ileri bakışlı zamanlayıcıyla çalan adım sıralayıcı. */
export class MusicPlayer {
  private current: Track | null = null;
  private readonly fading: Track[] = [];
  private tension = 0;
  private paused = false;
  private timerHandle: unknown = null;
  private disposed = false;

  constructor(private readonly deps: MusicPlayerDeps) {}

  /** Çalan çağ (yoksa null). */
  get age(): number | null {
    return this.current?.age ?? null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setTension(t: number): void {
    this.tension = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  }

  /** Çağ müziğine yumuşak geçer. Aynı çağ tekrar istenirse bir şey yapmaz. */
  setAge(age: number): void {
    if (this.disposed || this.current?.age === age) return;
    const def = songDefForAge(age);
    if (!def) return;
    const { ctx, output } = this.deps;
    const now = ctx.currentTime;
    this.retireCurrent(now);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + MUSIC.crossfadeSec);
    gain.connect(output);

    const song = composeSong(def);
    this.current = {
      age,
      song,
      baseStepSec: stepDurationSec(song.bpm, 0),
      gain,
      state: { step: 0, time: now + MUSIC.restartPadSec, loop: 0 },
      recent: [],
      cache: new Map(),
      live: new Set(),
      fadeEnd: null,
    };
    this.ensureTimer();
  }

  /** Müziği söndürerek durdurur (çağ seçimi sıfırlanır). */
  stop(): void {
    if (this.disposed) return;
    this.retireCurrent(this.deps.ctx.currentTime);
  }

  /** Oyun duraklayınca: zamanlayıcı durur, planlı notalar iptal edilir, konum korunur. */
  pause(): void {
    if (this.paused || this.disposed) return;
    this.paused = true;
    this.clearTimer();
    const now = this.deps.ctx.currentTime;
    for (const t of [this.current, ...this.fading]) if (t) this.silence(t, now);
    if (this.current) {
      this.current.state = rewindToUnplayed(this.current.state, this.current.recent, now);
      this.current.recent = [];
    }
  }

  resume(): void {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    if (this.current) this.current.state = { ...this.current.state, time: this.deps.ctx.currentTime + MUSIC.restartPadSec };
    this.ensureTimer();
  }

  /** Bir zamanlayıcı turu (test için dışarıdan da çağrılabilir). */
  tick(): void {
    if (this.disposed || this.paused) return;
    const now = this.deps.ctx.currentTime;

    for (let i = this.fading.length - 1; i >= 0; i--) {
      const t = this.fading[i]!;
      if (t.fadeEnd !== null && now >= t.fadeEnd) {
        this.silence(t, now);
        t.gain.disconnect();
        t.cache.clear();
        this.fading.splice(i, 1);
      }
    }

    const track = this.current;
    if (!track) return;
    const stepSec = stepDurationSec(track.song.bpm, this.tension);
    const plan = planSteps(track.state, now, MUSIC.lookaheadSec, stepSec, track.song.byStep.length);
    track.state = plan.state;
    for (const p of plan.planned) {
      for (const note of track.song.byStep[p.step]!) {
        if (note.minTension > this.tension) continue;
        this.playNote(track, note.instrument, note.midi, note.durSteps, note.gain, p.time);
      }
    }
    track.recent = [...track.recent.filter((r) => r.time > now - 0.5), ...plan.planned];
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearTimer();
    const now = this.deps.ctx.currentTime;
    for (const t of [this.current, ...this.fading]) {
      if (!t) continue;
      this.silence(t, now);
      t.gain.disconnect();
      t.cache.clear();
    }
    this.current = null;
    this.fading.length = 0;
    this.disposed = true;
  }

  // ---- iç işler ----

  private retireCurrent(now: number): void {
    const old = this.current;
    if (!old) return;
    old.fadeEnd = now + MUSIC.crossfadeSec;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, old.fadeEnd);
    this.fading.push(old);
    this.current = null;
  }

  private playNote(track: Track, instrument: Parameters<typeof renderInstrument>[0], midi: number, durSteps: number, gain: number, time: number): void {
    const { ctx } = this.deps;
    const sr = this.deps.sampleRate ?? MUSIC.sampleRate;
    const key = `${instrument}|${midi}|${durSteps}`;
    let buf = track.cache.get(key);
    if (!buf) {
      buf = toAudioBuffer(ctx, renderInstrument(instrument, sr, midi, durSteps * track.baseStepSec), sr);
      track.cache.set(key, buf);
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(track.gain);
      track.live.add(src);
      src.onended = () => {
        track.live.delete(src);
        try {
          src.disconnect();
          g.disconnect();
        } catch {
          // zaten bağlantısı kesilmiş
        }
      };
      src.start(time);
    } catch {
      // ses bağlamı kapanmış olabilir; müzik sessizce atlanır
    }
  }

  private silence(track: Track, now: number): void {
    for (const src of track.live) {
      try {
        src.stop(now);
      } catch {
        // henüz başlamamış veya durmuş
      }
    }
    track.live.clear();
  }

  private ensureTimer(): void {
    if (this.timerHandle !== null || this.paused || this.disposed) return;
    this.timerHandle = this.deps.timer.setInterval(() => this.tick(), MUSIC.timerMs);
    this.tick();
  }

  private clearTimer(): void {
    if (this.timerHandle === null) return;
    this.deps.timer.clearInterval(this.timerHandle);
    this.timerHandle = null;
  }
}
