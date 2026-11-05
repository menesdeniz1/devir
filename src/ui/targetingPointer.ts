import type { Targeting } from './targeting';

/** Fare girdisinin ihtiyaç duyduğu ekran → dünya dönüşümü (renderer sağlar; ui, render'ı içe aktarmaz). */
export interface PointerProjection {
  screenToWorldX(clientX: number): number;
  isInCorridor(clientX: number, clientY: number): boolean;
}

/**
 * Hedefleme fare girdisi (PRD Y-02): imleç konumu takip edilir (koridor dışında null), sol tık uygular, sağ tık
 * iptal eder (bağlam menüsü hedefleme açıkken engellenir). Döndürülen işlev dinleyicileri kaldırır.
 */
export function mountTargetingPointer(host: HTMLElement, projection: PointerProjection, targeting: Targeting): () => void {
  const track = (event: PointerEvent): void => {
    targeting.setCursor(projection.isInCorridor(event.clientX, event.clientY) ? projection.screenToWorldX(event.clientX) : null);
  };
  const onLeave = (): void => targeting.setCursor(null);
  const onDown = (event: PointerEvent): void => {
    if (!targeting.active) return;
    track(event);
    if (event.button === 0) targeting.applyAtCursor();
  };
  const onContext = (event: Event): void => {
    if (!targeting.active) return;
    event.preventDefault();
    targeting.cancel();
  };
  host.addEventListener('pointermove', track);
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('contextmenu', onContext);
  return () => {
    host.removeEventListener('pointermove', track);
    host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('pointerleave', onLeave);
    host.removeEventListener('contextmenu', onContext);
  };
}
