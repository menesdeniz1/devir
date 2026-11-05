import { tr } from '../i18n';
import { TOAST_MS } from './constants';
import { el } from './dom';

export interface Toasts {
  show(text: string): void;
  /** Her karede: süresi dolan bildirimleri kaldırır. */
  update(frameMs: number): void;
  destroy(): void;
}

/** Kalıcı olmayan bildirimler (kayıt silindi, kayıt yazılamıyor). Ekran okuyuculara okunur. */
export function mountToasts(root: HTMLElement, onShow?: () => void): Toasts {
  const box = el('div', 'toasts', root);
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const items: { node: HTMLElement; left: number }[] = [];

  function remove(item: { node: HTMLElement; left: number }): void {
    item.node.remove();
    items.splice(items.indexOf(item), 1);
  }

  return {
    show(text): void {
      const node = el('div', 'toast', box);
      const label = el('span', 'toast__text', node);
      label.textContent = text;
      const close = el('button', 'btn btn--small toast__close', node);
      close.type = 'button';
      close.textContent = tr.notices.dismiss;
      const item = { node, left: TOAST_MS };
      close.addEventListener('click', () => remove(item));
      items.push(item);
      onShow?.();
    },
    update(frameMs): void {
      for (const item of [...items]) {
        item.left -= frameMs;
        if (item.left <= 0) remove(item);
      }
    },
    destroy(): void {
      box.remove();
    },
  };
}
