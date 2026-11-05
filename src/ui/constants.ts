/** Arayüz sabitleri (denge değil). Renkler ve ölçüler ayrıca style.css içindeki değişkenlerdedir. */

/** Birlik düğmelerinin klavye kısayolları (KeyboardEvent.code), sırasıyla. */
export const UNIT_SHORTCUT_CODES = ['Digit1', 'Digit2', 'Digit3'] as const;
/** Kısayol etiketleri (TDD §7: Türkçe Q varsayımı; rakamlar düzenden bağımsızdır). */
export const UNIT_SHORTCUT_LABELS = ['1', '2', '3'] as const;

export const KEY_CANCEL_LAST = 'Backspace';
export const KEY_AGE_UP = 'KeyE';

/** Çağ ve Sınır Taşı bildiriminin ekranda kalma süresi (ms). */
export const NOTICE_MS = 3000;
export const KEYS_TOGGLE_PAUSE = ['KeyP', 'Escape'] as const;

