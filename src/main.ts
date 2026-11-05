import { browserClock } from './game/browserClock';
import { startFrameLoop } from './game/loop';
import { Session } from './game/session';
import { fmt, tr } from './i18n/tr';
import { createRenderer, type Renderer } from './render/renderer';
import { el } from './ui/dom';
import { mountHud } from './ui/hud';
import { mountKeyboard } from './ui/keyboard';
import { mountOverlays } from './ui/overlays';
import { createTargeting } from './ui/targeting';
import { mountTargetingPointer } from './ui/targetingPointer';
import './ui/style.css';

function showFatal(root: HTMLElement, detail: string): void {
  root.replaceChildren();
  const box = el('div', 'fatal', root);
  box.setAttribute('role', 'alert');
  const title = el('h1', undefined, box);
  title.textContent = tr.errors.noWebgl;
  const text = el('p', undefined, box);
  text.textContent = tr.errors.noWebglDetail;
  const tech = el('p', undefined, box);
  tech.textContent = fmt(tr.errors.noWebglTech, { message: detail });
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (root === null) {
    document.body.textContent = tr.errors.noRoot;
    return;
  }
  document.title = tr.appTitle;

  const session = new Session({ visibility: document });
  const stage = el('div', 'stage', root);
  const targeting = createTargeting(session);
  let renderer: Renderer;
  try {
    renderer = await createRenderer(stage, session, { preview: () => targeting.previewArea() });
  } catch (error) {
    showFatal(root, error instanceof Error ? error.message : String(error));
    return;
  }

  const uiLayer = el('div', 'ui-layer', root);
  const hud = mountHud(uiLayer, session, targeting);
  const overlays = mountOverlays(uiLayer, session);
  // Esc önce hedeflemeyi, sonra açık kule menüsünü kapatır; ikisi de yoksa duraklatır.
  mountKeyboard(session, document, { dismiss: () => targeting.cancel() || hud.dismissMenu() }, targeting);
  mountTargetingPointer(stage, renderer, targeting);

  let debugUpdate: (() => void) | null = null;
  if (import.meta.env.DEV && new URLSearchParams(globalThis.location.search).has('debug')) {
    const { mountDebugPanel } = await import('./ui/debugPanel');
    debugUpdate = mountDebugPanel(uiLayer, session).update;
  }

  startFrameLoop(browserClock, (frameMs) => {
    session.advance(frameMs);
    targeting.update();
    renderer.render(frameMs);
    hud.update(frameMs);
    overlays.update();
    debugUpdate?.();
  });
}

void boot();
