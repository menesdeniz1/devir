import { browserClock } from './game/browserClock';
import { startFrameLoop } from './game/loop';
import { Session } from './game/session';
import { fmt, tr } from './i18n/tr';
import { createRenderer, type Renderer } from './render/renderer';
import { el } from './ui/dom';
import { mountHud } from './ui/hud';
import { mountKeyboard } from './ui/keyboard';
import { mountOverlays } from './ui/overlays';
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
  let renderer: Renderer;
  try {
    renderer = await createRenderer(stage, session);
  } catch (error) {
    showFatal(root, error instanceof Error ? error.message : String(error));
    return;
  }

  const uiLayer = el('div', 'ui-layer', root);
  const hud = mountHud(uiLayer, session);
  const overlays = mountOverlays(uiLayer, session);
  mountKeyboard(session);

  let debugUpdate: (() => void) | null = null;
  if (import.meta.env.DEV && new URLSearchParams(globalThis.location.search).has('debug')) {
    const { mountDebugPanel } = await import('./ui/debugPanel');
    debugUpdate = mountDebugPanel(uiLayer, session).update;
  }

  startFrameLoop(browserClock, (frameMs) => {
    session.advance(frameMs);
    renderer.render(frameMs);
    hud.update(frameMs);
    overlays.update();
    debugUpdate?.();
  });
}

void boot();
