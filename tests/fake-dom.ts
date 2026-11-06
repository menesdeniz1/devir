/**
 * Birim testleri için çok küçük bir DOM taklidi (Vitest Node ortamında jsdom yok). Yalnız HUD'un kullandığı
 * yüzey: öğe ağacı, öznitelikler, dataset/style, metin, olay dinleyicileri ve basit sınıf seçicileri.
 * Yerleşim yoktur (ölçüler 0).
 */

type Listener = (event: { type: string; target: FakeElement }) => void;

export class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style = {
    props: new Map<string, string>(),
    setProperty(name: string, value: string): void {
      this.props.set(name, value);
    },
  };
  private readonly listeners = new Map<string, Listener[]>();
  private text = '';
  className = '';
  hidden = false;
  disabled = false;
  type = '';
  title = '';
  alt = '';
  decoding = '';
  draggable = true;
  tabIndex = 0;
  readonly offsetWidth = 0;

  constructor(tag: string, private readonly doc: FakeDocument) {
    this.tagName = tag.toUpperCase();
  }

  get src(): string {
    return this.attributes.get('src') ?? '';
  }
  set src(value: string) {
    this.attributes.set('src', value);
  }

  get classList(): { contains(c: string): boolean; add(c: string): void } {
    return {
      contains: (c) => this.className.split(/\s+/).includes(c),
      add: (c) => {
        if (!this.className.split(/\s+/).includes(c)) this.className = `${this.className} ${c}`.trim();
      },
    };
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(value: string) {
    for (const c of this.children) c.parentNode = null;
    this.children.length = 0;
    this.text = value;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child: FakeElement): void {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.textContent = '';
    for (const n of nodes) this.appendChild(n);
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.children.some((c) => c.contains(node));
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => l !== listener));
  }
  /** Tıklama: kapalı düğmede dinleyiciler çalışmaz (tarayıcıdaki gibi). */
  click(): void {
    if (this.disabled) return;
    for (const l of this.listeners.get('click') ?? []) l({ type: 'click', target: this });
  }
  focus(): void {
    this.doc.activeElement = this;
  }
  blur(): void {
    if (this.doc.activeElement === this) this.doc.activeElement = this.doc.body;
  }
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  /** Ağaçtaki tüm alt öğeler (derinlik öncelikli, belge sırası). */
  descendants(): FakeElement[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
  querySelectorAll(selector: string): FakeElement[] {
    return this.descendants().filter((n) => matches(n, selector));
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** Basit seçiciler: `tag`, `.a.b`, `tag.a`, `[name="v"]` ve `:not(:disabled)` birleşimleri (yalnız tek bileşik). */
function matches(node: FakeElement, selector: string): boolean {
  return selector.split(',').some((part) => {
    let sel = part.trim();
    if (sel.endsWith(':not(:disabled)')) {
      if (node.disabled) return false;
      sel = sel.slice(0, -':not(:disabled)'.length);
    }
    const attr = /\[([\w-]+)="([^"]*)"\]/.exec(sel);
    if (attr !== null) {
      if (node.getAttribute(attr[1]!) !== attr[2]) return false;
      sel = sel.replace(attr[0], '');
    }
    const [tag, ...classes] = sel.split('.');
    if (tag !== undefined && tag !== '' && node.tagName !== tag.toUpperCase()) return false;
    return classes.every((c) => node.classList.contains(c));
  });
}

export class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null = null;
  private readonly listeners = new Map<string, Listener[]>();

  constructor() {
    this.body = new FakeElement('body', this);
    this.activeElement = this.body;
  }
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => l !== listener));
  }
}
