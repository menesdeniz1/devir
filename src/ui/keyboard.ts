import type { Session } from '../game/session';
import { ageUp, cancelLastWaiting, produceUnit } from './actions';
import { KEY_ABILITY, KEY_AGE_UP, KEY_CANCEL_LAST, KEY_CLOSE_MENU, KEYS_TOGGLE_PAUSE, UNIT_SHORTCUT_CODES } from './constants';
import type { Targeting } from './targeting';

/** Metin girilen öğeler kısayolları yutar; kaydırıcı, onay kutusu ve seçenek düğmesi yutmaz (Esc/P çalışmalı). */
const NON_TEXT_INPUT_TYPES = ['range', 'checkbox', 'radio', 'button'];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.includes((target as HTMLInputElement).type);
  return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Oyun dışı ekranlar (ana menü, kurulum, ayarlar) açıkken kısayolları bu arayüz yönetir. */
export interface ScreenGate {
  /** true ise oyun kısayolları (üret, çağ, duraklat…) çalışmaz. */
  blocked(): boolean;
  /** Esc: ekranı kapatır/geri gider; işlendiyse true. */
  dismiss(): boolean;
}

/** Kısayollar fiziksel tuşa (KeyboardEvent.code) bağlıdır. Döndürülen işlev dinleyiciyi kaldırır. */
export function mountKeyboard(
  session: Session,
  target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
  /** Esc'e öncelikli açık bir menü varsa: `dismiss` onu kapatır ve true döner (o zaman duraklatma yapılmaz). */
  menu: { dismiss(): boolean } | null = null,
  /** Q kısayolu için yetenek hedeflemesi (verilmezse Q işlenmez). */
  targeting: Pick<Targeting, 'pressKey'> | null = null,
  /** Ekran akışı: oyun dışı ekran açıkken tüm oyun kısayolları kapalıdır, yalnız Esc ekrana gider. */
  screens: ScreenGate | null = null,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    const code = event.code;

    if (screens?.blocked() === true) {
      if (code === KEY_CLOSE_MENU) {
        event.preventDefault();
        if (!event.repeat) screens.dismiss();
      }
      return;
    }

    const unitIndex = (UNIT_SHORTCUT_CODES as readonly string[]).indexOf(code);
    if (unitIndex >= 0) {
      event.preventDefault();
      if (!event.repeat) produceUnit(session, unitIndex);
      return;
    }
    if (code === KEY_AGE_UP) {
      event.preventDefault();
      if (!event.repeat) ageUp(session);
      return;
    }
    if (code === KEY_ABILITY && targeting !== null) {
      event.preventDefault();
      if (!event.repeat) targeting.pressKey();
      return;
    }
    if (code === KEY_CANCEL_LAST) {
      event.preventDefault();
      if (!event.repeat) cancelLastWaiting(session);
      return;
    }
    if ((KEYS_TOGGLE_PAUSE as readonly string[]).includes(code)) {
      event.preventDefault();
      if (code === KEY_CLOSE_MENU && !event.repeat && menu?.dismiss() === true) return;
      if (!event.repeat && !session.ended) session.togglePause();
    }
  };
  target.addEventListener('keydown', onKeyDown as EventListener);
  return () => target.removeEventListener('keydown', onKeyDown as EventListener);
}
