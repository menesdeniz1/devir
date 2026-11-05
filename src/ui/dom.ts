/** Küçük DOM yardımcıları. HUD yalnızca değer değişince DOM'a yazar (TDD §7). */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  parent?.appendChild(node);
  return node;
}

/** Değer değişmediyse DOM'a dokunmayan yazıcılar. */
export function textWriter(node: HTMLElement): (value: string) => void {
  let last: string | null = null;
  return (value) => {
    if (value === last) return;
    last = value;
    node.textContent = value;
  };
}

export function attrWriter(node: HTMLElement, name: string): (value: string | null) => void {
  let last: string | null | undefined;
  return (value) => {
    if (value === last) return;
    last = value;
    if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value);
  };
}

export function styleWriter(node: HTMLElement, prop: string): (value: string) => void {
  let last: string | null = null;
  return (value) => {
    if (value === last) return;
    last = value;
    node.style.setProperty(prop, value);
  };
}

export function boolWriter(apply: (value: boolean) => void): (value: boolean) => void {
  let last: boolean | null = null;
  return (value) => {
    if (value === last) return;
    last = value;
    apply(value);
  };
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
