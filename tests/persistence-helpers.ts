import type { KeyValueStorage } from '../src/game/storage';

/** Bellek içi sahte depo; yazma/okuma hatası benzetilebilir. */
export class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  failWrites = false;
  failReads = false;
  writeAttempts = 0;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('okuma engellendi');
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writeAttempts += 1;
    if (this.failWrites) throw new Error('kota doldu');
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}
