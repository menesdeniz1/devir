import { WORLD } from '../data/world';
import { PLAYER_SIDE } from '../game/constants';
import type { Session } from '../game/session';
import { fmt, tr } from '../i18n/tr';
import { el, formatClock, textWriter } from './dom';

export interface Overlays {
  update(): void;
  destroy(): void;
}

function dialog(root: HTMLElement, cls: string, titleId: string): { box: HTMLElement; title: HTMLElement } {
  const box = el('div', `overlay ${cls}`, root);
  box.hidden = true;
  const card = el('div', 'overlay__card', box);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', titleId);
  const title = el('h2', 'overlay__title', card);
  title.id = titleId;
  return { box, title };
}

/** Duraklatma ve sonuç katmanları. */
export function mountOverlays(root: HTMLElement, session: Session): Overlays {
  // ---- Duraklatma ----
  const pause = dialog(root, 'overlay--pause', 'pause-title');
  pause.title.textContent = tr.pause.title;
  const pauseCard = pause.box.firstElementChild as HTMLElement;
  const resume = el('button', 'btn btn--primary', pauseCard);
  resume.type = 'button';
  resume.textContent = tr.pause.resume;
  resume.setAttribute('aria-label', tr.pause.resumeAria);
  resume.addEventListener('click', () => session.resume());
  const hint = el('p', 'overlay__hint', pauseCard);
  hint.textContent = tr.pause.hint;

  // ---- Sonuç ----
  const result = dialog(root, 'overlay--result', 'result-title');
  const resultCard = result.box.firstElementChild as HTMLElement;
  const time = el('p', 'overlay__time', resultCard);
  const replay = el('button', 'btn btn--primary', resultCard);
  replay.type = 'button';
  replay.textContent = tr.result.replay;
  replay.setAttribute('aria-label', tr.result.replayAria);
  replay.addEventListener('click', () => {
    session.restart();
    replay.blur();
  });
  const writeTitle = textWriter(result.title);
  const writeTime = textWriter(time);

  let pauseShown = false;
  let resultShown = false;

  function update(): void {
    const outcome = session.state.outcome;

    const showPause = session.paused && outcome === null;
    if (showPause !== pauseShown) {
      pauseShown = showPause;
      pause.box.hidden = !showPause;
      if (showPause) resume.focus();
      else resume.blur();
    }

    const showResult = outcome !== null;
    if (outcome !== null) {
      const title =
        outcome.kind === 'draw' ? tr.result.draw : outcome.winner === PLAYER_SIDE ? tr.result.win : tr.result.loss;
      writeTitle(title);
      result.box.dataset['outcome'] = outcome.kind === 'draw' ? 'draw' : outcome.winner === PLAYER_SIDE ? 'win' : 'loss';
      writeTime(fmt(tr.result.time, { time: formatClock(outcome.tick / WORLD.tickRate) }));
    }
    if (showResult !== resultShown) {
      resultShown = showResult;
      result.box.hidden = !showResult;
      if (showResult) replay.focus();
    }
  }

  update();
  return {
    update,
    destroy(): void {
      pause.box.remove();
      result.box.remove();
    },
  };
}
