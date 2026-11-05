import { connectAudio } from './app/audioBridge';
import { createAudioEngine } from './audio';
import { browserClock } from './game/browserClock';
import { Flow } from './game/flow';
import { startFrameLoop } from './game/loop';
import { Session } from './game/session';
import type { KeyValueStorage } from './game/storage';
import { fmt, tr } from './i18n/tr';
import { createRenderer, type Renderer } from './render/renderer';
import { el } from './ui/dom';
import { mountHud } from './ui/hud';
import { mountKeyboard } from './ui/keyboard';
import { mountScreens } from './ui/screens';
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

/** localStorage'a erişim bile özel durum fırlatabilir (engellenmiş site verisi); o durumda oyun kayıtsız sürer. */
function pickStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (root === null) {
    document.body.textContent = tr.errors.noRoot;
    return;
  }
  document.title = tr.appTitle;

  // Menüdeyken oturum denetleyicisiz bir arka plan maçı tutar; gerçek maç menüden kurulur.
  const session = new Session({ visibility: document, opponent: 'none' });
  const flow = new Flow({ session, storage: pickStorage() });
  const stage = el('div', 'stage', root);
  const targeting = createTargeting(session);
  let renderer: Renderer;
  try {
    renderer = await createRenderer(stage, session, { preview: () => targeting.previewArea() });
  } catch (error) {
    showFatal(root, error instanceof Error ? error.message : String(error));
    return;
  }

  const audio = createAudioEngine();
  connectAudio(audio, flow, document);
  flow.settings.subscribe((s) => renderer.setScreenShake(s.screenShake));

  const uiLayer = el('div', 'ui-layer', root);
  const hud = mountHud(uiLayer, session, targeting);
  const screens = mountScreens(uiLayer, flow, { onNotice: () => audio.playUi('notice') });
  flow.subscribe((event) => {
    if (event.type === 'screen' && flow.screen !== 'battle') targeting.cancel();
  });
  // Menü düğmelerinde tıklama sesi (oyun içi düğmeler kendi olay seslerini çalar).
  uiLayer.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('.screen button, .toast button') !== null) audio.playUi('click');
  });

  // Esc önce hedeflemeyi, sonra açık kule menüsünü kapatır; ikisi de yoksa duraklatır. Oyun dışı ekranlar kendi Esc'ini işler.
  mountKeyboard(
    session,
    document,
    { dismiss: () => targeting.cancel() || hud.dismissMenu() },
    targeting,
    { blocked: () => screens.blocksGame(), dismiss: () => screens.dismiss() },
  );
  mountTargetingPointer(stage, renderer, targeting);

  // Sekme gizlenince oturum duraklar (kayıt duraklatma olayında alınır); sayfa kapanırken de kaydedilir.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flow.saveNow();
  });
  globalThis.addEventListener('pagehide', () => flow.saveNow());

  let debugUpdate: (() => void) | null = null;
  if (import.meta.env.DEV && new URLSearchParams(globalThis.location.search).has('debug')) {
    const { mountDebugPanel } = await import('./ui/debugPanel');
    debugUpdate = mountDebugPanel(uiLayer, session).update;
  }

  startFrameLoop(browserClock, (frameMs) => {
    if (flow.screen === 'battle') {
      session.advance(frameMs);
      flow.update();
      targeting.update();
      renderer.render(frameMs);
      hud.update(frameMs);
    }
    screens.update(frameMs);
    debugUpdate?.();
  });
}

void boot();
