/** Anahtar-değer deposunun en küçük arayüzü (tarayıcıda localStorage; testte sahte). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Tüm erişimleri try/catch içine alır (TDD §9): gizli pencere, kota ya da engellenmiş site verisi oyunu durdurmaz.
 * İlk yazma hatasında bir kez `onWriteFailure` çağrılır.
 */
export class SafeStorage {
  private warned = false;
  private failureListener: (() => void) | null = null;

  constructor(private readonly backend: KeyValueStorage | null) {}

  get available(): boolean {
    return this.backend !== null;
  }

  /** İlk yazma hatasında bir kez çağrılacak işlevi kaydeder. */
  onWriteFailure(listener: () => void): void {
    this.failureListener = listener;
  }

  read(key: string): string | null {
    if (this.backend === null) return null;
    try {
      return this.backend.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): boolean {
    if (this.backend !== null) {
      try {
        this.backend.setItem(key, value);
        return true;
      } catch {
        // aşağıda bildirilir
      }
    }
    this.reportFailure();
    return false;
  }

  remove(key: string): void {
    if (this.backend === null) return;
    try {
      this.backend.removeItem(key);
    } catch {
      // Silinemeyen anahtar bir sonraki açılışta yeniden denetlenir.
    }
  }

  private reportFailure(): void {
    if (this.warned) return;
    this.warned = true;
    this.failureListener?.();
  }
}
