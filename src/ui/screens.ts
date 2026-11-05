import type { Flow, FlowNotice } from '../game/flow';
import type { SaveFailure } from '../game/save';
import { tr } from '../i18n/tr';
import { mountMenu, mountSetup } from './menuScreens';
import { mountOverlays } from './overlays';
import { mountSettings } from './settingsScreen';
import { mountToasts } from './toast';
import { mountTutorialView } from './tutorialView';

export interface Screens {
  /** Her karede: ekran görünürlüğü ve bildirim süreleri. */
  update(frameMs?: number): void;
  /** Oyun dışı bir ekran (menü, kurulum, ayarlar) açıkken oyun kısayolları çalışmaz. */
  blocksGame(): boolean;
  /** Esc: ayarlar → kurulum onayı/kurulum → ana menü (yutulur). Savaş ekranında false. */
  dismiss(): boolean;
  destroy(): void;
}

export interface ScreenHooks {
  /** Bir bildirim gösterildiğinde (ör. 'notice' sesi). */
  onNotice?: () => void;
}

export function noticeText(notice: FlowNotice): string {
  if (notice.kind === 'saveWriteFailed') return tr.notices.saveWriteFailed;
  const failure: SaveFailure = notice.failure;
  return failure === 'version' ? tr.notices.saveVersion : tr.notices.saveInvalid;
}

/** Tüm ekranlar ve katmanlar: ana menü, kurulum, ayarlar, duraklatma, sonuç, bildirimler. */
export function mountScreens(root: HTMLElement, flow: Flow, hooks: ScreenHooks = {}): Screens {
  const menu = mountMenu(root, flow);
  const setup = mountSetup(root, flow);
  const overlays = mountOverlays(root, flow);
  const settings = mountSettings(root, flow);
  const tutorial = mountTutorialView(root, flow);
  const toasts = mountToasts(root, hooks.onNotice);

  const all = [menu, setup, overlays, settings, tutorial];
  const refresh = (): void => {
    root.dataset['screen'] = flow.screen;
    for (const screen of all) screen.update();
  };

  const unsubscribeFlow = flow.subscribe(refresh);
  const unsubscribeNotices = flow.subscribeNotices((notice) => toasts.show(noticeText(notice)));
  const unsubscribeSession = flow.session.subscribe((event) => {
    if (event.type === 'paused' || event.type === 'reset' || event.type === 'ended') refresh();
  });
  refresh();

  return {
    update(frameMs = 0): void {
      refresh();
      toasts.update(frameMs);
    },
    blocksGame(): boolean {
      return flow.screen !== 'battle' || flow.settingsOpen;
    },
    dismiss(): boolean {
      if (settings.dismiss() || tutorial.dismiss()) return true;
      if (flow.screen === 'setup') return setup.dismiss();
      // Ana menüde Esc bir şey yapmaz ama oyun kısayolu olarak da işlenmez.
      return flow.screen === 'menu';
    },
    destroy(): void {
      unsubscribeFlow();
      unsubscribeNotices();
      unsubscribeSession();
      for (const screen of all) screen.destroy();
      toasts.destroy();
    },
  };
}
