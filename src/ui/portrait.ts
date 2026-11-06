import { el } from './dom';

/**
 * Arayüz portreleri (GDD §11). Resimleri çizici üretir; arayüz `src/render`'ı içe aktarmaz, yalnız bu sözleşmeyi bilir
 * (main.ts bağlar). Arama hazır değilse null döner; HUD sonraki güncellemelerde yeniden sorar.
 */
export type PortraitKind = 'unit' | 'tower' | 'ability';
export type PortraitLookup = (kind: PortraitKind, id: string) => string | null;

/**
 * Bir resim yuvasını istenen kimliğe bağlar (DOM'suz; birim testlenebilir). Her güncellemede `set(id)` çağrılır:
 * kimlik değişmediyse ve resim zaten yazıldıysa arama yapılmaz; hazır değilse yer tutucu (null) bir kez yazılır ve
 * sonraki çağrıda yeniden sorulur. Arama verilmezse hep yer tutucu.
 */
export function portraitBinder(
  lookup: PortraitLookup | undefined,
  kind: PortraitKind,
  write: (src: string | null) => void,
): (id: string | null) => void {
  let wantId: string | null | undefined;
  let written: string | null | undefined;
  return (id) => {
    if (id === wantId && (written !== null || id === null)) return;
    wantId = id;
    const src = id === null || lookup === undefined ? null : lookup(kind, id);
    if (src === written) return;
    written = src;
    write(src);
  };
}

/**
 * Süs resmi: `alt=""` ve `aria-hidden` (düğmenin erişilebilir adı zaten birimi anlatır). Yer tutucu durumunda resim
 * gizlenir; ebeveyne `data-portrait="ready|none"` yazılır (CSS harf/rol işaretini yedek olarak gösterir).
 */
export function portraitImage(parent: HTMLElement, className: string, host: HTMLElement = parent): (src: string | null) => void {
  const img = el('img', className, parent);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.decoding = 'async';
  img.draggable = false;
  img.hidden = true;
  host.dataset['portrait'] = 'none';
  return (src) => {
    if (src === null) {
      img.hidden = true;
      img.removeAttribute('src');
      host.dataset['portrait'] = 'none';
      return;
    }
    img.src = src;
    img.hidden = false;
    host.dataset['portrait'] = 'ready';
  };
}
