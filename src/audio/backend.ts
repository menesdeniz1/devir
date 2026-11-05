/**
 * Web Audio'nun kullandığımız en küçük alt kümesi (yapısal tipler).
 * Gerçek AudioContext bunu karşılar; testlerde sahte bir uygulama enjekte edilir.
 * src/audio DOM'a doğrudan erişmez: bağlam üreticisi dışarıdan verilir (varsayılanı globalThis'e bakar).
 */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface AudioBufferLike {
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  playbackRate: AudioParamLike;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onended: ((ev: any) => any) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

/** Sınırlayıcı olarak kullanılan DynamicsCompressorNode'un alt kümesi. */
export interface CompressorNodeLike extends AudioNodeLike {
  threshold: AudioParamLike;
  knee: AudioParamLike;
  ratio: AudioParamLike;
  attack: AudioParamLike;
  release: AudioParamLike;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceLike;
  /** İsteğe bağlı: yoksa sınırlayıcı atlanır. */
  createDynamicsCompressor?(): CompressorNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type AudioContextFactory = () => AudioContextLike | null;

/** setInterval/clearInterval soyutlaması (testte elle sürülür). */
export interface TimerLike {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Varsayılan bağlam üreticisi: tarayıcıda AudioContext'i kullanır, yoksa null döner. */
export function defaultContextFactory(): AudioContextLike | null {
  const g = globalThis as unknown as { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor() as AudioContextLike;
}

export function defaultTimer(): TimerLike {
  return {
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
  };
}

/** Float32Array'i AudioBuffer'a (tek kanal) kopyalar. */
export function toAudioBuffer(ctx: AudioContextLike, data: Float32Array, sampleRate: number): AudioBufferLike {
  const buf = ctx.createBuffer(1, data.length, sampleRate);
  buf.getChannelData(0).set(data);
  return buf;
}
