import type { Session } from '../game/session';
import { cancelLastWaiting, produceUnit } from './actions';
import { KEY_CANCEL_LAST, KEYS_TOGGLE_PAUSE, UNIT_SHORTCUT_CODES } from './constants';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Kısayollar fiziksel tuşa (KeyboardEvent.code) bağlıdır. Döndürülen işlev dinleyiciyi kaldırır. */
export function mountKeyboard(session: Session, target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    const code = event.code;

    const unitIndex = (UNIT_SHORTCUT_CODES as readonly string[]).indexOf(code);
    if (unitIndex >= 0) {
      event.preventDefault();
      if (!event.repeat) produceUnit(session, unitIndex);
      return;
    }
    if (code === KEY_CANCEL_LAST) {
      event.preventDefault();
      if (!event.repeat) cancelLastWaiting(session);
      return;
    }
    if ((KEYS_TOGGLE_PAUSE as readonly string[]).includes(code)) {
      event.preventDefault();
      if (!event.repeat && !session.ended) session.togglePause();
    }
  };
  target.addEventListener('keydown', onKeyDown as EventListener);
  return () => target.removeEventListener('keydown', onKeyDown as EventListener);
}
