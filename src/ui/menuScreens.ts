import { DEFAULT_DIFFICULTY } from '../game/constants';
import type { Flow } from '../game/flow';
import { DIFFICULTIES, type Difficulty, type ResultKind } from '../game/results';
import { versionLabel } from '../game/version';
import { WORLD } from '../data/world';
import { ageName, difficultyName, fmt, tr } from '../i18n/tr';
import { el, formatClock, textWriter } from './dom';
import { actionButton, createScreen, heading, visibilityToggle } from './widgets';

export interface MountedScreen {
  update(): void;
  destroy(): void;
}

// ---- Ana menü (PRD EK-01) ---------------------------------------------------------

export function mountMenu(root: HTMLElement, flow: Flow): MountedScreen {
  const { root: screen, card } = createScreen(root, 'screen--menu', false);
  screen.dataset['screen'] = 'menu';
  const title = el('h1', 'menu__logo', card);
  title.textContent = tr.menu.title;
  const tagline = el('p', 'menu__tagline', card);
  tagline.textContent = tr.menu.tagline;

  const nav = el('nav', 'menu__list', card);
  nav.setAttribute('aria-label', tr.menu.navigation);
  const start = actionButton(nav, tr.menu.start, { ariaLabel: tr.menu.startAria, primary: true, onClick: () => flow.openSetup() });
  start.dataset['action'] = 'start';

  const resume = actionButton(nav, '', { onClick: () => void flow.continueSaved() });
  resume.dataset['action'] = 'continue';
  resume.classList.add('menu__continue');
  const resumeLabel = el('span', 'menu__continue-label', resume);
  resumeLabel.textContent = tr.menu.continue;
  const resumeInfo = el('span', 'menu__continue-info', resume);
  const writeInfo = textWriter(resumeInfo);

  const tutorial = actionButton(nav, tr.menu.tutorial, { ariaLabel: tr.menu.tutorialAria, onClick: () => flow.startTutorial() });
  tutorial.dataset['action'] = 'tutorial';

  const settings = actionButton(nav, tr.menu.settings, { ariaLabel: tr.menu.settingsAria, onClick: () => flow.openSettings() });
  settings.dataset['action'] = 'settings';

  const version = el('p', 'menu__version', card);
  version.textContent = fmt(tr.menu.version, { version: versionLabel() });

  const toggle = visibilityToggle(screen, () => (flow.saveInfo !== null ? resume : start));

  function update(): void {
    toggle(flow.screen === 'menu');
    const info = flow.saveInfo;
    resume.disabled = info === null;
    resume.title = info === null ? tr.menu.continueNone : '';
    writeInfo(
      info === null
        ? ''
        : fmt(tr.menu.continueInfo, {
            difficulty: difficultyName(info.opponent),
            time: formatClock(info.tick / WORLD.tickRate),
            age: ageName(info.playerAge),
          }),
    );
  }
  update();
  return { update, destroy: () => screen.remove() };
}

// ---- Maç kurulumu (PRD EK-02) -----------------------------------------------------

const RESULT_TEXT: Record<ResultKind, string> = { win: tr.result.win, loss: tr.result.loss, draw: tr.result.draw };

export function mountSetup(root: HTMLElement, flow: Flow): MountedScreen & { dismiss(): boolean } {
  const { root: screen, card } = createScreen(root, 'screen--setup', true);
  screen.dataset['screen'] = 'setup';
  heading(card, tr.setup.title, 'setup-title');

  let selected: Difficulty = DEFAULT_DIFFICULTY;
  const group = el('div', 'diff-group', card);
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', tr.setup.difficultyGroup);
  const cards = DIFFICULTIES.map((difficulty) => {
    const label = el('label', 'diff-card', group);
    const input = el('input', 'diff-card__input', label);
    input.type = 'radio';
    input.name = 'difficulty';
    input.value = difficulty;
    input.checked = difficulty === selected;
    input.addEventListener('change', () => {
      if (input.checked) selected = difficulty;
      syncSelection();
    });
    const name = el('span', 'diff-card__name', label);
    name.textContent = difficultyName(difficulty);
    const desc = el('span', 'diff-card__desc', label);
    desc.textContent = tr.difficultyDesc[difficulty] ?? '';
    const record = el('span', 'diff-card__record', label);
    return { difficulty, label, input, write: textWriter(record) };
  });
  function syncSelection(): void {
    for (const c of cards) c.label.dataset['selected'] = c.difficulty === selected ? 'true' : 'false';
  }
  syncSelection();

  const history = el('section', 'history', card);
  const historyTitle = el('h3', 'history__title', history);
  historyTitle.textContent = tr.setup.historyTitle;
  const historyList = el('ol', 'history__list', history);
  let historyKey = '';

  const buttons = el('div', 'screen__buttons', card);
  const back = actionButton(buttons, tr.setup.back, { ariaLabel: tr.setup.backAria, onClick: () => flow.closeSetup() });
  const start = actionButton(buttons, tr.setup.start, { primary: true, onClick: () => tryStart() });
  start.dataset['action'] = 'begin';
  back.dataset['action'] = 'back';

  // ---- Kayıt varken onay (PRD ÖK-08) ----
  const confirmScreen = createScreen(root, 'screen--confirm', true);
  confirmScreen.root.dataset['screen'] = 'confirm';
  heading(confirmScreen.card, tr.setup.confirmTitle, 'confirm-title');
  const confirmText = el('p', 'screen__text', confirmScreen.card);
  confirmText.textContent = tr.setup.confirmText;
  const confirmButtons = el('div', 'screen__buttons', confirmScreen.card);
  const confirmNo = actionButton(confirmButtons, tr.setup.confirmNo, { onClick: () => closeConfirm() });
  confirmNo.dataset['action'] = 'confirm-no';
  const confirmYes = actionButton(confirmButtons, tr.setup.confirmYes, {
    primary: true,
    onClick: () => {
      closeConfirm();
      flow.startNewMatch(selected, true);
    },
  });
  confirmYes.dataset['action'] = 'confirm-yes';
  let confirming = false;
  const toggleConfirm = visibilityToggle(confirmScreen.root, () => confirmNo, true);

  function closeConfirm(): void {
    confirming = false;
    toggleConfirm(false);
  }
  function tryStart(): void {
    if (flow.startNewMatch(selected)) return;
    confirming = true;
    toggleConfirm(true);
  }

  const toggle = visibilityToggle(screen, () => start, true);

  function renderHistory(): void {
    const { entries, totals } = flow.results;
    for (const c of cards) {
      const t = totals[c.difficulty];
      c.write(fmt(tr.setup.record, { wins: t.wins, losses: t.losses }) + (t.draws > 0 ? fmt(tr.setup.recordDraws, { draws: t.draws }) : ''));
    }
    const key = JSON.stringify(entries);
    if (key === historyKey) return;
    historyKey = key;
    historyList.replaceChildren();
    if (entries.length === 0) {
      const empty = el('li', 'history__empty', historyList);
      empty.textContent = tr.setup.historyEmpty;
      return;
    }
    for (const entry of entries) {
      const row = el('li', 'history__row', historyList);
      row.dataset['result'] = entry.result;
      row.textContent = fmt(tr.setup.historyRow, {
        result: RESULT_TEXT[entry.result],
        difficulty: difficultyName(entry.opponent),
        time: formatClock(entry.durationTicks / WORLD.tickRate),
        age: ageName(entry.playerAge),
      });
    }
  }

  function update(): void {
    const visible = flow.screen === 'setup';
    if (!visible && confirming) closeConfirm();
    // Onay açıkken kurulum gizlenir: aynı anda tek modal.
    toggle(visible && !confirming);
    if (visible) renderHistory();
  }
  update();

  return {
    update,
    /** Esc: önce onayı, sonra kurulumu kapatır. */
    dismiss(): boolean {
      if (confirming) {
        closeConfirm();
        return true;
      }
      if (flow.screen === 'setup') {
        flow.closeSetup();
        return true;
      }
      return false;
    },
    destroy(): void {
      screen.remove();
      confirmScreen.root.remove();
    },
  };
}
