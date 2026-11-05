import type { Flow } from '../game/flow';
import type { TutorialStepId } from '../game/tutorialConfig';
import { fmt, tr } from '../i18n';
import { attrWriter, el, textWriter } from './dom';
import type { MountedScreen } from './menuScreens';
import { TUTORIAL_TARGETS } from './tutorialTargets';
import { actionButton, createScreen, heading, visibilityToggle } from './widgets';

/**
 * Öğretici arayüzü (PRD ÖK-01, GDD §12): ilk açılış önerisi, adım metin kutusu ("Atla" her zaman görünür),
 * ilgili öğeyi gösteren vurgulama katmanı ve tamamlanma kartı. Adım mantığı `game/tutorial.ts`'tedir.
 */
export function mountTutorialView(root: HTMLElement, flow: Flow): MountedScreen & { dismiss(): boolean } {
  // ---- İlk açılış önerisi ----
  const offer = createScreen(root, 'screen--offer', true);
  offer.root.dataset['screen'] = 'tutorial-offer';
  heading(offer.card, tr.tutorial.offerTitle, 'tutorial-offer-title');
  const offerText = el('p', 'screen__text', offer.card);
  offerText.textContent = tr.tutorial.offerText;
  const offerButtons = el('div', 'screen__buttons', offer.card);
  const offerLater = actionButton(offerButtons, tr.tutorial.offerLater, { onClick: () => flow.dismissTutorialOffer() });
  offerLater.dataset['action'] = 'tutorial-later';
  const offerStart = actionButton(offerButtons, tr.tutorial.offerStart, { primary: true, onClick: () => flow.startTutorial() });
  offerStart.dataset['action'] = 'tutorial-offer-start';
  const toggleOffer = visibilityToggle(offer.root, () => offerStart);

  // ---- Adım kutusu ----
  const panel = el('aside', 'tutorial', root);
  panel.hidden = true;
  panel.setAttribute('aria-label', tr.tutorial.region);
  const counter = el('div', 'tutorial__counter', panel);
  const title = el('h3', 'tutorial__title', panel);
  const text = el('p', 'tutorial__text', panel);
  text.setAttribute('aria-live', 'polite');
  const buttons = el('div', 'tutorial__buttons', panel);
  const next = actionButton(buttons, tr.tutorial.next, { primary: true, onClick: () => flow.tutorial?.advance() });
  next.classList.add('tutorial__next');
  next.dataset['action'] = 'tutorial-next';
  const skip = actionButton(buttons, tr.tutorial.skip, { ariaLabel: tr.tutorial.skipAria, onClick: () => flow.skipTutorial() });
  skip.dataset['action'] = 'tutorial-skip';
  const writeCounter = textWriter(counter);
  const writeTitle = textWriter(title);
  const writeText = textWriter(text);
  const writeStep = attrWriter(panel, 'data-step');

  // ---- Vurgulama ----
  const highlight = el('div', 'tutorial-highlight', root);
  highlight.hidden = true;
  highlight.setAttribute('aria-hidden', 'true');

  // ---- Tamamlanma ----
  const done = createScreen(root, 'overlay screen--tutorial-done', true);
  done.root.dataset['screen'] = 'tutorial-done';
  heading(done.card, tr.tutorial.doneTitle, 'tutorial-done-title');
  const doneText = el('p', 'screen__text', done.card);
  doneText.textContent = tr.tutorial.doneText;
  const doneMenu = actionButton(done.card, tr.tutorial.doneToMenu, { primary: true, onClick: () => flow.toMenu() });
  doneMenu.dataset['action'] = 'tutorial-done-menu';
  const toggleDone = visibilityToggle(done.root, () => doneMenu);

  function place(stepId: TutorialStepId | null): void {
    const selector = stepId === null ? undefined : TUTORIAL_TARGETS[stepId];
    const target = selector === undefined ? null : document.querySelector(selector);
    const rect = target?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0 || rect.height === 0) {
      highlight.hidden = true;
      return;
    }
    highlight.hidden = false;
    const pad = 4;
    highlight.style.left = `${rect.left - pad}px`;
    highlight.style.top = `${rect.top - pad}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;
  }

  function update(): void {
    const runner = flow.tutorial;
    const running = runner !== null && runner.status === 'running' && flow.screen === 'battle';
    toggleOffer(flow.screen === 'menu' && flow.tutorialOfferPending && !flow.settingsOpen);
    toggleDone(runner !== null && runner.status === 'completed' && flow.screen === 'battle');
    panel.hidden = !running;
    if (!running || runner === null) {
      highlight.hidden = true;
      return;
    }
    const step = runner.step;
    if (step === null) return;
    const strings = tr.tutorial.steps[step.id];
    writeStep(step.id);
    writeCounter(fmt(tr.tutorial.counter, { n: runner.stepIndex + 1, total: runner.stepCount }));
    writeTitle(strings?.title ?? '');
    writeText(strings?.text ?? '');
    next.hidden = step.manual !== true;
    place(step.id);
  }
  update();

  return {
    update,
    /** Esc: öneri açıksa "Şimdi değil". */
    dismiss(): boolean {
      if (!flow.tutorialOfferPending || flow.screen !== 'menu') return false;
      flow.dismissTutorialOffer();
      return true;
    },
    destroy(): void {
      offer.root.remove();
      panel.remove();
      highlight.remove();
      done.root.remove();
    },
  };
}
