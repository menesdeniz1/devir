import type { AudioBufferLike, AudioContextLike, AudioNodeLike, AudioParamLike, BufferSourceLike, GainNodeLike, TimerLike } from '../src/audio/backend';

/** Sahte Web Audio uygulaması: hangi düğümlerin oluşturulup çalındığını kaydeder (tarayıcısız testler). */

export class FakeParam implements AudioParamLike {
  value = 0;
  targets: number[] = [];
  ramps: Array<{ value: number; time: number }> = [];
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.ramps.push({ value, time });
  }
  setTargetAtTime(target: number): void {
    this.targets.push(target);
    this.value = target;
  }
  cancelScheduledValues(): void {}
}

export class FakeNode implements AudioNodeLike {
  connections: AudioNodeLike[] = [];
  disconnected = false;
  connect(destination: AudioNodeLike): void {
    this.connections.push(destination);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  gain = new FakeParam();
}

export class FakeBuffer implements AudioBufferLike {
  readonly data: Float32Array;
  constructor(
    length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  get duration(): number {
    return this.data.length / this.sampleRate;
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeSource extends FakeNode implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  playbackRate = new FakeParam();
  onended: ((ev: unknown) => unknown) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  /** Bağlandığı kazanç düğümü (varsa). */
  gainNode: FakeGain | null = null;
  start(when = 0): void {
    this.startedAt = when;
  }
  stop(when = 0): void {
    this.stoppedAt = when;
  }
  get active(): boolean {
    return this.startedAt !== null && this.stoppedAt === null && !this.disconnected;
  }
  override connect(destination: AudioNodeLike): void {
    super.connect(destination);
    if (destination instanceof FakeGain) this.gainNode = destination;
  }
}

export class FakeContext implements AudioContextLike {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  buffers: FakeBuffer[] = [];
  resumeCalls = 0;
  closed = false;
  createGain(): GainNodeLike {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBuffer(_channels: number, length: number, sampleRate: number): AudioBufferLike {
    const b = new FakeBuffer(length, sampleRate);
    this.buffers.push(b);
    return b;
  }
  createBufferSource(): BufferSourceLike {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.closed = true;
  }
  /** Şu an çalan (başlamış, durdurulmamış) kaynak sayısı. */
  activeSources(): FakeSource[] {
    return this.sources.filter((s) => s.active);
  }
}

export class FakeTimer implements TimerLike {
  handlers = new Map<number, () => void>();
  private next = 1;
  setInterval(fn: () => void): number {
    const id = this.next++;
    this.handlers.set(id, fn);
    return id;
  }
  clearInterval(handle: unknown): void {
    this.handlers.delete(handle as number);
  }
  get running(): boolean {
    return this.handlers.size > 0;
  }
  fire(): void {
    for (const fn of [...this.handlers.values()]) fn();
  }
}
