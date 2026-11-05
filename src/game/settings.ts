import { DEFAULT_SETTINGS, STORAGE_KEYS, VOLUME_MAX, VOLUME_MIN } from './constants';
import type { SafeStorage } from './storage';

/** Kalıcı kullanıcı ayarları (PRD EK-07). */
export interface Settings {
  /** 0..100 */
  musicVolume: number;
  /** 0..100 */
  sfxVolume: number;
  screenShake: boolean;
}

export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

function volume(raw: unknown, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.round(Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, raw)));
}

/** Bozuk ya da eksik veriyi varsayılanlarla tamamlar; geçerli alanları korur. */
export function sanitizeSettings(raw: unknown): Settings {
  const out = defaultSettings();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  out.musicVolume = volume(r['musicVolume'], out.musicVolume);
  out.sfxVolume = volume(r['sfxVolume'], out.sfxVolume);
  if (typeof r['screenShake'] === 'boolean') out.screenShake = r['screenShake'];
  return out;
}

export function loadSettings(storage: SafeStorage): Settings {
  const text = storage.read(STORAGE_KEYS.settings);
  if (text === null) return defaultSettings();
  try {
    return sanitizeSettings(JSON.parse(text) as unknown);
  } catch {
    return defaultSettings();
  }
}

/** Ayarlar deposu: değişiklik anında dinleyicilere iletilir ve saklanır. */
export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(private readonly storage: SafeStorage) {
    this.current = loadSettings(storage);
  }

  get value(): Readonly<Settings> {
    return this.current;
  }

  update(patch: Partial<Settings>): void {
    this.current = sanitizeSettings({ ...this.current, ...patch });
    this.storage.write(STORAGE_KEYS.settings, JSON.stringify(this.current));
    for (const listener of [...this.listeners]) listener(this.current);
  }

  /** Dinleyiciyi kaydeder ve hemen mevcut değerle bir kez çağırır. */
  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
}
