import { connectAudio } from './app/audioBridge';
import { createAudioEngine } from './audio';
import { browserClock } from './game/browserClock';
import { Flow } from './game/flow';
import { startFrameLoop } from './game/loop';
import { Session } from './game/session';
import { loadSettings } from './game/settings';
import { SafeStorage, type KeyValueStorage } from './game/storage';
import { fmt, resolveLanguage, setLanguage, tr } from './i18n';
import { createRenderer, type Renderer } from './render/renderer';
import { el } from './ui/dom';
import { mountHud } from './ui/hud';
import { mountKeyboard } from './ui/keyboard';
import { mountScreens } from './ui/screens';
import { createTargeting } from './ui/targeting';
import { mountTargetingPointer } from './ui/targetingPointer';
import { probeWebgl2 } from './ui/webgl';
import './ui/style.css';

interface FatalTexts {
  title: string;
  text: string;
  tech: string;
}

// Metinler çağrı anında okunur: dil açılışta (modül değerlendirmesinden sonra) seçilir.
const noWebglTexts = (): FatalTexts => ({ title: tr.errors.noWebgl, text: tr.errors.noWebglDetail, tech: tr.errors.noWebglTech });
const runtimeTexts = (): FatalTexts => ({ title: tr.errors.runtime, text: tr.errors.runtimeDetail, tech: tr.errors.runtimeTech });

function showFatal(root: HTMLElement, detail: string, texts: FatalTexts = noWebglTexts()): void {
  root.replaceChildren();
  const box = el('div', 'fatal', root);
  box.setAttribute('role', 'alert');
  const title = el('h1', undefined, box);
  title.textContent = texts.title;
  const text = el('p', undefined, box);
  text.textContent = texts.text;
  const tech = el('p', undefined, box);
  tech.textContent = fmt(texts.tech, { message: detail });
}

/** localStorage'a erişim bile özel durum fırlatabilir (engellenmiş site verisi); o durumda oyun kayıtsız sürer. */
function pickStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * Etkin dili arayüz kurulmadan önce bir kez seçer (PRD G-04, TDD §7): kayıtlı ayar, yoksa tarayıcı dili.
 * Tarayıcıya (`navigator`) yalnız burada, uygulama katmanında dokunulur.
 */
function chooseLanguage(storage: KeyValueStorage | null): void {
  const stored = loadSettings(new SafeStorage(storage)).language;
  const language = resolveLanguage(stored, globalThis.navigator?.language);
  setLanguage(language);
  document.documentElement.lang = language;
}

async function boot(): Promise<void> {
  chooseLanguage(pickStorage());
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
  // WebGL2 yoksa Pixi 2B tuvale düşebilir; oyun WebGL2 gerektirir (TDD §12): açıklayıcı hata ekranı.
  const webglProblem = probeWebgl2();
  if (webglProblem !== null) {
    showFatal(root, webglProblem);
    return;
  }
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
  const hud = mountHud(uiLayer, session, targeting, { onReject: () => audio.playUi('notice') });
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
  // Performans ölçümü yalnız geliştirme derlemesinde (?debug): dinamik içe aktarma üretim paketine girmez.
  let perf: { record(timeMs: number, stepMs: number): void } | null = null;
  if (import.meta.env.DEV && new URLSearchParams(globalThis.location.search).has('debug')) {
    const { mountDebugPanel } = await import('./ui/debugPanel');
    const { PerfMeter } = await import('./game/perf');
    const meter = new PerfMeter();
    perf = meter;
    debugUpdate = mountDebugPanel(uiLayer, session, {
      frame: () => meter.snapshot(browserClock.now()),
      render: () => renderer.stats,
    }).update;
  }

  startFrameLoop(browserClock, (frameMs) => {
    let stepMs = 0;
    if (flow.screen === 'battle') {
      const t0 = perf === null ? 0 : browserClock.now();
      session.advance(frameMs);
      if (perf !== null) stepMs = browserClock.now() - t0;
      flow.update();
      targeting.update();
      renderer.render(frameMs);
      hud.update(frameMs);
    }
    perf?.record(browserClock.now(), stepMs);
    screens.update(frameMs);
    debugUpdate?.();
  }, {
    // Ardışık karelerde hata sürerse döngü durur; oyuncuya açıklayıcı hata ekranı gösterilir (kayıt bozulmaz).
    onFatal: (error) => showFatal(root, error instanceof Error ? error.message : String(error), runtimeTexts()),
  });
}

void boot();
