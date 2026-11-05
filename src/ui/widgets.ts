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
