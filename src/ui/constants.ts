/** Arayüz sabitleri (denge değil). Renkler ve ölçüler ayrıca style.css içindeki değişkenlerdedir. */

/** Birlik düğmelerinin klavye kısayolları (KeyboardEvent.code), sırasıyla. */
export const UNIT_SHORTCUT_CODES = ['Digit1', 'Digit2', 'Digit3'] as const;
/** Kısayol etiketleri (TDD §7: Türkçe Q varsayımı; rakamlar düzenden bağımsızdır). */
export const UNIT_SHORTCUT_LABELS = ['1', '2', '3'] as const;

export const KEY_CANCEL_LAST = 'Backspace';
export const KEY_AGE_UP = 'KeyE';
/** Yetenek hedeflemesini açar; hedefleme açıkken imleç konumunda uygular (GDD §11). */
export const KEY_ABILITY = 'KeyQ';
/** Oyun hızını döngüsel değiştirir (1× → 1,5× → 2× → 3×). */
export const KEY_SPEED = 'KeyF';
/** Açık kule menüsünü kapatır (menü yokken Esc duraklatır). */
export const KEY_CLOSE_MENU = 'Escape';

/** Çağ ve Sınır Taşı bildiriminin ekranda kalma süresi (ms). */
export const NOTICE_MS = 3000;
export const KEYS_TOGGLE_PAUSE = ['KeyP', 'Escape'] as const;


/** Bildirim (toast) süresi (ms). */
export const TOAST_MS = 9000;
/** Ses düzeyi kaydırıcısı adımı. */
export const VOLUME_STEP = 5;

/** Klavyeyle yetenek hedeflemede ←/→ tuşunun imleci kaydırdığı mesafe (dünya birimi). */
export const TARGET_KEY_STEP = 40;
export const KEY_TARGET_LEFT = 'ArrowLeft';
export const KEY_TARGET_RIGHT = 'ArrowRight';
export const KEY_TARGET_APPLY = 'Enter';
