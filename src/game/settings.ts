import { DEFAULT_SETTINGS, GAME_SPEEDS, STORAGE_KEYS, VOLUME_MAX, VOLUME_MIN, type GameSpeed } from './constants';
import { isLanguage, type Language } from '../i18n/language';
import type { SafeStorage } from './storage';

/** Kalıcı kullanıcı ayarları (PRD EK-07). */
export interface Settings {
  /** 0..100 */
  musicVolume: number;
  /** 0..100 */
  sfxVolume: number;
  screenShake: boolean;
  /** Oyun hızı çarpanı (PRD G-08); yalnız GAME_SPEEDS değerleri. */
  gameSpeed: GameSpeed;
  /** Arayüz dili (PRD G-04). Yoksa otomatik: tarayıcı dili uygulama katmanında çözülür; bu katman tarayıcıya dokunmaz. */
  language?: Language;
}

export function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

function volume(raw: unknown, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.round(Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, raw)));
}

export function isGameSpeed(value: unknown): value is GameSpeed {
  return (GAME_SPEEDS as readonly unknown[]).includes(value);
}

/** Sıradaki oyun hızı (HUD düğmesi ve F kısayolu döngüsel geçer: 1 → 1,5 → 2 → 3 → 1). */
export function nextGameSpeed(current: GameSpeed): GameSpeed {
  const i = GAME_SPEEDS.indexOf(current);
  return GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length]!;
}

/** Bozuk ya da eksik veriyi varsayılanlarla tamamlar; geçerli alanları korur. */
export function sanitizeSettings(raw: unknown): Settings {
  const out = defaultSettings();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  out.musicVolume = volume(r['musicVolume'], out.musicVolume);
  out.sfxVolume = volume(r['sfxVolume'], out.sfxVolume);
  if (typeof r['screenShake'] === 'boolean') out.screenShake = r['screenShake'];
  if (isGameSpeed(r['gameSpeed'])) out.gameSpeed = r['gameSpeed'];
  if (isLanguage(r['language'])) out.language = r['language'];
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
