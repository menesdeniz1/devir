import { el } from './dom';

/** Menü ekranlarında ortak küçük yapı taşları. */

export interface ScreenParts {
  root: HTMLElement;
  card: HTMLElement;
}

/** Tam ekran katman: opak arka plan ve ortada kart. Başlangıçta gizlidir. */
export function createScreen(parent: HTMLElement, className: string, modal: boolean): ScreenParts {
  const root = el('div', `screen ${className}`, parent);
  root.hidden = true;
  const card = el('div', 'screen__card', root);
  if (modal) {
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.tabIndex = -1;
  }
  return { root, card };
}

export function heading(parent: HTMLElement, text: string, id: string, level: 'h1' | 'h2' = 'h2'): HTMLElement {
  const h = el(level, 'screen__title', parent);
  h.id = id;
  h.textContent = text;
  parent.setAttribute('aria-labelledby', id);
  return h;
}

export function actionButton(
  parent: HTMLElement,
  text: string,
  options: { ariaLabel?: string; primary?: boolean; onClick: () => void },
): HTMLButtonElement {
  const b = el('button', options.primary === true ? 'btn btn--primary' : 'btn', parent);
  b.type = 'button';
  b.textContent = text;
  if (options.ariaLabel !== undefined) b.setAttribute('aria-label', options.ariaLabel);
  b.addEventListener('click', options.onClick);
  return b;
}

/**
 * Katmanı göster/gizle; görünür olurken odağı verilen öğeye taşır. `restoreFocus` ise kapanınca odağı
 * açılmadan önceki öğeye geri verir (ör. ayarlar katmanı).
 */
export function visibilityToggle(
  root: HTMLElement,
  focusTarget: () => HTMLElement | null,
  restoreFocus = false,
): (visible: boolean) => void {
  let shown = false;
  let previous: Element | null = null;
  return (visible) => {
    if (visible === shown) return;
    shown = visible;
    if (visible) {
      previous = restoreFocus ? document.activeElement : null;
      root.hidden = false;
      focusTarget()?.focus();
    } else {
      root.hidden = true;
      if (restoreFocus && previous instanceof HTMLElement && previous.isConnected && previous.offsetParent !== null) previous.focus();
      previous = null;
    }
  };
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/** Odaklanabilir ve görünür öğeler (sırayla). */
export function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.offsetParent !== null || node.getClientRects().length > 0);
}

/** Görünür modal kartlar arasında en üstteki (en yüksek z-index; eşitse DOM'da sonraki). */
function topModal(doc: Document): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestZ = -Infinity;
  for (const card of doc.querySelectorAll<HTMLElement>('.screen:not([hidden]) > [aria-modal="true"]')) {
    const parent = card.parentElement;
    if (parent === null) continue;
    const z = Number.parseInt(getComputedStyle(parent).zIndex, 10);
    const value = Number.isFinite(z) ? z : 0;
    if (value >= bestZ) {
      bestZ = value;
      best = card;
    }
  }
  return best;
}

/**
 * Modal katmanlarda Tab odağı tuzağı: görünür en üstteki modal varken Tab/Shift+Tab yalnız onun içinde döner;
 * odak modalın dışındaysa içeri alınır. Döndürülen işlev dinleyiciyi kaldırır.
 */
export function installModalFocusTrap(doc: Document = document): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const modal = topModal(doc);
    if (modal === null) return;
    const items = focusableIn(modal);
    if (items.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = doc.activeElement;
    const inside = active instanceof Node && modal.contains(active);
    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };
  doc.addEventListener('keydown', onKeyDown, true);
  return () => doc.removeEventListener('keydown', onKeyDown, true);
}
