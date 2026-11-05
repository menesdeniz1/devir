import { STORAGE_KEYS } from './constants';
import type { SafeStorage } from './storage';

/**
 * Öğreticinin kalıcı durumu (`devir.tutorial.v1`, PRD ÖK-02).
 * - completed: tamamlandı; asla geri alınmaz.
 * - skipped: oyuncu atladı.
 * - dismissed: ilk açılış önerisine "Şimdi değil" dendi ya da öğretici yarıda bırakıldı.
 * Kayıt yoksa (null) öğretici ilk açılışta önerilir (PRD ÖK-01).
 */
export type TutorialStatus = 'completed' | 'skipped' | 'dismissed';

function isStatus(value: unknown): value is TutorialStatus {
  return value === 'completed' || value === 'skipped' || value === 'dismissed';
}

export function loadTutorialStatus(storage: SafeStorage): TutorialStatus | null {
  const text = storage.read(STORAGE_KEYS.tutorial);
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as unknown;
    const status = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)['status'] : undefined;
    return isStatus(status) ? status : null;
  } catch {
    return null;
  }
}

/** Yeni durumu yazar; tamamlanmış öğretici daha zayıf bir durumla ezilmez. Geçerli durumu döndürür. */
export function saveTutorialStatus(storage: SafeStorage, current: TutorialStatus | null, next: TutorialStatus): TutorialStatus {
  const status = current === 'completed' ? 'completed' : next;
  storage.write(STORAGE_KEYS.tutorial, JSON.stringify({ status }));
  return status;
}
