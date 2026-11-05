import {
  defaultContextFactory,
  defaultTimer,
  toAudioBuffer,
  type AudioBufferLike,
  type AudioContextFactory,
  type AudioContextLike,
  type BufferSourceLike,
  type GainNodeLike,
  type TimerLike,
} from './backend';
import { MIX, SFX_SETTINGS } from './config';
import { EventSoundMapper, type AudioEvent, type AudioEventContext, type SfxRequest } from './eventMapper';
import { MusicPlayer } from './music/player';
import { SFX_SAMPLE_RATE, clampAge, renderSfx, type SfxId } from './sfx';
import { volumeToGain } from './volume';
import { VoiceLimiter } from './voices';

export type UiSound = 'click' | 'error' | 'notice';
export type StingerKind = 'win' | 'loss' | 'draw';

const UI_SFX: Record<UiSound, SfxId> = { click: 'uiClick', error: 'uiError', notice: 'uiNotice' };
const STINGER_SFX: Record<StingerKind, SfxId> = { win: 'stingerWin', loss: 'stingerLoss', draw: 'stingerDraw' };

/** Çağ değişince önceden üretilen savaş efektleri (ilk vuruşta üretim takılmasını önler). */
const WARMUP_SFX: readonly SfxId[] = [
  'meleeHit', 'shootRanged', 'shootHeavy', 'impact', 'explosion', 'unitDeath', 'unitSpawn', 'baseHit', 'towerFast', 'towerHeavy',
];

export interface AudioEngineOptions {
  /** Ses bağlamı üreticisi (testte sahte, tarayıcıda varsayılan AudioContext). */
  contextFactory?: AudioContextFactory;
  timer?: TimerLike;
  /** [0,1) rastgele kaynağı (çalma hızı sapması için). */
  random?: () => number;
  /** Çalınmak üzere kabul edilen her efekt isteği (tanılama/test). */
  onSfx?: (request: SfxRequest) => void;
  /** Efekt başına en kısa aralık ayarının çarpanı (0 = kapalı). Testler içindir. */
  minGapScale?: number;
}

export interface AudioEngine {
  /** İlk kullanıcı etkileşiminde çağrılır; bağlamı oluşturur/devam ettirir. Tekrar çağrılabilir. */
  unlock(): void;
  readonly unlocked: boolean;
  /** 0..100 (algısal eğri: (v/100)^2). Kilit açılmadan önce de saklanır. */
  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  /** Oyun duraklayınca müzik ve oyun efektleri durur (arayüz sesleri sürer). */
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  /** Çağ müziğine yumuşak geçer (1..5). */
  setAge(age: number): void;
  /** 0..1: müzik tempo ve katmanlarını hafifçe artırır. */
  setTension(tension: number): void;
  playUi(kind: UiSound): void;
  /** Bir tick/kare grubunun SimEvent'lerini seslere çevirir. matchEnded olayı da stinger çalar. */
  handleEvents(events: readonly AudioEvent[], context?: AudioEventContext): void;
  playStinger(kind: StingerKind): void;
  /** Yeni maç: olay belleğini ve stinger bayrağını sıfırlar. */
  resetMatch(): void;
  /** Çalan çağ müziğini söndürerek durdurur (ana menü vb.). */
  stopMusic(): void;
  /** Bir çağın efektlerini önceden üretir. */
  warmup(age: number): void;
  dispose(): void;
}

interface ActiveVoice {
  src: BufferSourceLike;
  gain: GainNodeLike;
  game: boolean;
}

interface Graph {
  ctx: AudioContextLike;
  master: GainNodeLike;
  musicGain: GainNodeLike;
  musicGate: GainNodeLike;
  sfxGain: GainNodeLike;
  gameBus: GainNodeLike;
  uiBus: GainNodeLike;
  music: MusicPlayer;
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const factory = options.contextFactory ?? defaultContextFactory;
  const timer = options.timer ?? defaultTimer();
  const random = options.random ?? Math.random;
  const gapScale = options.minGapScale ?? 1;

  const mapper = new EventSoundMapper();
  const limiter = new VoiceLimiter(MIX.maxPerSfx, MIX.maxTotal);
  const buffers = new Map<string, { buf: AudioBufferLike; dur: number }>();
  const lastStart = new Map<SfxId, number>();
  const voices = new Map<number, ActiveVoice>();

  let graph: Graph | null = null;
  let disposed = false;
  let paused = false;
  let musicVolume: number = MIX.defaultMusicVolume;
  let sfxVolume: number = MIX.defaultSfxVolume;
  let wantedAge: number | null = null;
  let tension = 0;
  let stingerPlayed = false;

  const safe = (fn: () => void): void => {
    try {
      fn();
    } catch {
      // Ses hatası oyunu durdurmamalı.
    }
  };

  function setParam(node: GainNodeLike, value: number, ctx: AudioContextLike, timeConstant: number = MIX.rampSec): void {
    safe(() => {
      node.gain.cancelScheduledValues(ctx.currentTime);
      node.gain.setTargetAtTime(value, ctx.currentTime, timeConstant);
    });
  }

  function applyMixer(g: Graph): void {
    setParam(g.musicGain, volumeToGain(musicVolume), g.ctx);
    setParam(g.sfxGain, volumeToGain(sfxVolume), g.ctx);
  }

  function applyPause(g: Graph): void {
    setParam(g.musicGate, paused ? 0 : 1, g.ctx);
    setParam(g.gameBus, paused ? 0 : 1, g.ctx);
  }

  function build(ctx: AudioContextLike): Graph {
    const master = ctx.createGain();
    master.gain.value = MIX.masterGain;
    master.connect(ctx.destination);
    const musicGain = ctx.createGain();
    const musicGate = ctx.createGain();
    const sfxGain = ctx.createGain();
    const gameBus = ctx.createGain();
    const uiBus = ctx.createGain();
    musicGain.gain.value = volumeToGain(musicVolume);
    sfxGain.gain.value = volumeToGain(sfxVolume);
    musicGate.gain.value = paused ? 0 : 1;
    gameBus.gain.value = paused ? 0 : 1;
    uiBus.gain.value = 1;
    musicGate.connect(musicGain);
    musicGain.connect(master);
    gameBus.connect(sfxGain);
    uiBus.connect(sfxGain);
    sfxGain.connect(master);
    const music = new MusicPlayer({ ctx, output: musicGate, timer });
    return { ctx, master, musicGain, musicGate, sfxGain, gameBus, uiBus, music };
  }

  function getBuffer(g: Graph, sfx: SfxId, age: number): { buf: AudioBufferLike; dur: number } {
    const key = `${sfx}|${age}`;
    let entry = buffers.get(key);
    if (!entry) {
      const data = renderSfx(sfx, age, SFX_SAMPLE_RATE);
      entry = { buf: toAudioBuffer(g.ctx, data, SFX_SAMPLE_RATE), dur: data.length / SFX_SAMPLE_RATE };
      buffers.set(key, entry);
    }
    return entry;
  }

  function stopVoice(id: number, fadeSec: number): void {
    const v = voices.get(id);
    if (!v || !graph) return;
    voices.delete(id);
    const now = graph.ctx.currentTime;
    safe(() => {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
      v.src.stop(now + fadeSec);
    });
  }

  function play(g: Graph, req: SfxRequest, game: boolean): void {
    const settings = SFX_SETTINGS[req.sfx];
    const now = g.ctx.currentTime;
    const last = lastStart.get(req.sfx);
    if (last !== undefined && now - last < settings.minGapSec * gapScale) return;

    const age = clampAge(req.age);
    const { buf, dur } = getBuffer(g, req.sfx, age);
    const jitter = 1 + (random() * 2 - 1) * MIX.rateJitter;
    const rate = req.rate * jitter;
    const result = limiter.acquire(req.sfx, settings.priority, now, dur / rate);
    for (const id of result.evicted) stopVoice(id, MIX.evictFadeSec);
    if (result.id === null) return;
    const id = result.id;
    lastStart.set(req.sfx, now);

    safe(() => {
      const src = g.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const gain = g.ctx.createGain();
      gain.gain.value = settings.gain * req.gain;
      src.connect(gain);
      gain.connect(game ? g.gameBus : g.uiBus);
      voices.set(id, { src, gain, game });
      src.onended = () => {
        voices.delete(id);
        limiter.release(id);
        safe(() => {
          src.disconnect();
          gain.disconnect();
        });
      };
      src.start(now);
      options.onSfx?.(req);
    });
  }

  function duckMusic(g: Graph): void {
    const now = g.ctx.currentTime;
    safe(() => {
      g.musicGain.gain.cancelScheduledValues(now);
      g.musicGain.gain.setTargetAtTime(volumeToGain(musicVolume) * MIX.stingerDuck, now, MIX.rampSec * 2);
      g.musicGain.gain.setTargetAtTime(volumeToGain(musicVolume), now + MIX.stingerDuckSec, 0.8);
    });
  }

  function playStingerSfx(g: Graph, req: SfxRequest): void {
    stingerPlayed = true;
    duckMusic(g);
    play(g, req, false);
  }

  const engine: AudioEngine = {
    get unlocked() {
      return graph !== null;
    },
    get paused() {
      return paused;
    },

    unlock() {
      if (disposed) return;
      if (graph) {
        if (graph.ctx.state === 'suspended') safe(() => void graph?.ctx.resume().catch(() => undefined));
        return;
      }
      let ctx: AudioContextLike | null = null;
      try {
        ctx = factory();
      } catch {
        ctx = null;
      }
      if (!ctx) return;
      graph = build(ctx);
      if (ctx.state === 'suspended') safe(() => void ctx?.resume().catch(() => undefined));
      graph.music.setTension(tension);
      if (wantedAge !== null) {
        graph.music.setAge(wantedAge);
        engine.warmup(wantedAge);
      }
      if (paused) graph.music.pause();
    },

    setMusicVolume(volume) {
      musicVolume = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : musicVolume;
      if (graph && !disposed) setParam(graph.musicGain, volumeToGain(musicVolume), graph.ctx);
    },

    setSfxVolume(volume) {
      sfxVolume = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : sfxVolume;
      if (graph && !disposed) setParam(graph.sfxGain, volumeToGain(sfxVolume), graph.ctx);
    },

    pause() {
      if (paused || disposed) return;
      paused = true;
      if (!graph) return;
      const gameIds = [...voices].filter(([, v]) => v.game).map(([id]) => id);
      for (const id of gameIds) {
        stopVoice(id, MIX.evictFadeSec);
        limiter.release(id);
      }
      graph.music.pause();
      applyPause(graph);
    },

    resume() {
      if (!paused || disposed) return;
      paused = false;
      if (!graph) return;
      applyPause(graph);
      graph.music.resume();
    },

    setAge(age) {
      if (disposed || !Number.isFinite(age)) return;
      wantedAge = clampAge(age);
      if (!graph) return;
      graph.music.setAge(wantedAge);
      engine.warmup(wantedAge);
    },

    setTension(t) {
      tension = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
      if (graph && !disposed) graph.music.setTension(tension);
    },

    playUi(kind) {
      if (!graph || disposed) return;
      play(graph, { sfx: UI_SFX[kind], age: 1, gain: 1, rate: 1, count: 1, own: true }, false);
    },

    handleEvents(events, context) {
      if (!graph || disposed || paused || events.length === 0) return;
      const g = graph;
      let requests: SfxRequest[] = [];
      safe(() => {
        requests = mapper.map(events, context);
      });
      for (const req of requests) {
        if (req.sfx.startsWith('stinger')) {
          if (!stingerPlayed) playStingerSfx(g, req);
        } else {
          play(g, req, true);
        }
      }
    },

    playStinger(kind) {
      if (!graph || disposed) return;
      playStingerSfx(graph, { sfx: STINGER_SFX[kind], age: 1, gain: 1, rate: 1, count: 1, own: true });
    },

    resetMatch() {
      mapper.reset();
      stingerPlayed = false;
    },

    stopMusic() {
      if (graph && !disposed) graph.music.stop();
      wantedAge = null;
    },

    warmup(age) {
      if (!graph || disposed) return;
      const g = graph;
      const a = clampAge(age);
      for (const sfx of WARMUP_SFX) safe(() => void getBuffer(g, sfx, a));
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      const g = graph;
      if (!g) return;
      safe(() => g.music.dispose());
      for (const v of voices.values()) safe(() => v.src.stop());
      voices.clear();
      limiter.clear();
      buffers.clear();
      safe(() => void g.ctx.close().catch(() => undefined));
      graph = null;
    },
  };

  return engine;
}
