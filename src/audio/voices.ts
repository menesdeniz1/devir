/**
 * Eşzamanlı ses sınırlayıcı (TDD §8): aynı efekt en fazla `maxPerSfx`, toplam en fazla `maxTotal`.
 * Saf mantık: zaman dışarıdan verilir, ses düğümü bilmez.
 *
 * Kural:
 * - Aynı efekt sınırdaysa en eski aynı-efekt sesi atılır (yenisi çalar).
 * - Toplam sınırdaysa en düşük öncelikli (eşitse en eski) ses, yalnızca yeninin önceliği ondan yüksekse atılır;
 *   değilse yeni ses reddedilir.
 */

export interface VoiceInfo {
  id: number;
  sfx: string;
  priority: number;
  startTime: number;
  endTime: number;
}

export interface AcquireResult {
  /** Verilen ses kimliği; null ise istek reddedildi. */
  id: number | null;
  /** Yer açmak için atılması gereken ses kimlikleri. */
  evicted: number[];
}

export class VoiceLimiter {
  private readonly voices: VoiceInfo[] = [];
  private nextId = 1;

  constructor(
    private readonly maxPerSfx: number,
    private readonly maxTotal: number,
  ) {}

  /** Süresi dolan sesleri listeden düşer. */
  prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i]!.endTime <= now) this.voices.splice(i, 1);
    }
  }

  acquire(sfx: string, priority: number, now: number, durationSec: number): AcquireResult {
    this.prune(now);
    const evicted: number[] = [];

    const same = this.voices.filter((v) => v.sfx === sfx);
    if (same.length >= this.maxPerSfx) {
      const oldest = same.reduce((a, b) => (b.startTime < a.startTime ? b : a));
      this.remove(oldest.id);
      evicted.push(oldest.id);
    }

    if (this.voices.length >= this.maxTotal) {
      const victim = this.voices.reduce((a, b) =>
        b.priority < a.priority || (b.priority === a.priority && b.startTime < a.startTime) ? b : a,
      );
      if (victim.priority >= priority) return { id: null, evicted };
      this.remove(victim.id);
      evicted.push(victim.id);
    }

    const id = this.nextId++;
    this.voices.push({ id, sfx, priority, startTime: now, endTime: now + durationSec });
    return { id, evicted };
  }

  release(id: number): void {
    this.remove(id);
  }

  count(): number {
    return this.voices.length;
  }

  countFor(sfx: string): number {
    return this.voices.filter((v) => v.sfx === sfx).length;
  }

  clear(): void {
    this.voices.length = 0;
  }

  private remove(id: number): void {
    const i = this.voices.findIndex((v) => v.id === id);
    if (i >= 0) this.voices.splice(i, 1);
  }
}
