import { WORLD } from '../data/world';
import { PLAYER_SIDE } from '../game/constants';
import type { Flow } from '../game/flow';
import { summarizeMatch, type MatchSummary } from '../game/summary';
import { ageName, fmt, tr, unitName } from '../i18n/tr';
import { el, formatClock, textWriter } from './dom';
import { actionButton, createScreen, heading, visibilityToggle } from './widgets';

export interface Overlays {
  update(): void;
  destroy(): void;
}

function table(parent: HTMLElement, caption: string, header: string[]): HTMLTableSectionElement {
  const t = el('table', 'stats-table', parent);
  const cap = el('caption', 'stats-table__caption', t);
  cap.textContent = caption;
  const head = el('thead', undefined, t);
  const row = el('tr', undefined, head);
  header.forEach((text, i) => {
    const th = el('th', i === 0 ? 'stats-table__label' : 'stats-table__num', row);
    th.scope = 'col';
    th.textContent = text;
  });
  return el('tbody', undefined, t);
}

function addRow(body: HTMLTableSectionElement, cells: string[], className?: string): void {
  const row = el('tr', className, body);
  cells.forEach((text, i) => {
    const cell = i === 0 ? el('th', 'stats-table__label', row) : el('td', 'stats-table__num', row);
    if (cell instanceof HTMLTableCellElement && i === 0) cell.scope = 'row';
    cell.textContent = text;
  });
}

const num = (n: number): string => String(Math.round(n));

function ageUpText(seconds: number[]): string {
  return seconds.length === 0 ? tr.result.ageUpsNone : seconds.map((s) => formatClock(s)).join(' · ');
}

/** Sonuç ekranının tablolarını doldurur (PRD EK-06, GDD §13). */
function renderStats(host: HTMLElement, summary: MatchSummary): void {
  host.replaceChildren();
  const units = table(host, tr.result.unitsTitle, [tr.result.colUnit, tr.result.colProduced, tr.result.colLost, tr.result.colKills]);
  units.parentElement?.setAttribute('data-table', 'units');
  if (summary.unitRows.length === 0) {
    addRow(units, [tr.result.unitsEmpty, '', '', '']);
  } else {
    let produced = 0;
    let lost = 0;
    let kills = 0;
    for (const row of summary.unitRows) {
      addRow(units, [unitName(row.unitId), num(row.produced), num(row.lost), num(row.kills)]);
      produced += row.produced;
      lost += row.lost;
      kills += row.kills;
    }
    addRow(units, [tr.result.total, num(produced), num(lost), num(kills)], 'stats-table__total');
  }

  const [you, foe] = summary.sides;
  const sum = table(host, tr.result.summaryTitle, ['', tr.result.colYou, tr.result.colFoe]);
  sum.parentElement?.setAttribute('data-table', 'summary');
  addRow(sum, [tr.result.goldEarned, num(you.goldEarned), num(foe.goldEarned)]);
  addRow(sum, [tr.result.goldSpent, num(you.goldSpent), num(foe.goldSpent)]);
  addRow(sum, [tr.result.baseDamage, num(you.baseDamageDealt), num(foe.baseDamageDealt)]);
  addRow(sum, [tr.result.towerKills, num(you.towerKills), num(foe.towerKills)]);
  addRow(sum, [tr.result.abilityKills, num(you.abilityKills), num(foe.abilityKills)]);
  addRow(sum, [tr.result.ageUps, ageUpText(you.ageUpSeconds), ageUpText(foe.ageUpSeconds)]);
}

/** Duraklatma menüsü (PRD EK-05) ve sonuç ekranı (PRD EK-06). */
export function mountOverlays(root: HTMLElement, flow: Flow): Overlays {
  const session = flow.session;

  // ---- Duraklatma ----
  const pause = createScreen(root, 'overlay overlay--pause', true);
  pause.root.dataset['screen'] = 'pause';
  heading(pause.card, tr.pause.title, 'pause-title');
  const resume = actionButton(pause.card, tr.pause.resume, { ariaLabel: tr.pause.resumeAria, primary: true, onClick: () => session.resume() });
  resume.dataset['action'] = 'resume';
  const pauseSettings = actionButton(pause.card, tr.pause.settings, { ariaLabel: tr.pause.settingsAria, onClick: () => flow.openSettings() });
  pauseSettings.dataset['action'] = 'pause-settings';
  const pauseMenu = actionButton(pause.card, tr.pause.toMenu, { ariaLabel: tr.pause.toMenuAria, onClick: () => flow.toMenu() });
  pauseMenu.dataset['action'] = 'to-menu';
  const hint = el('p', 'overlay__hint', pause.card);
  const writeHint = textWriter(hint);
  const togglePause = visibilityToggle(pause.root, () => resume);

  // ---- Sonuç ----
  const result = createScreen(root, 'overlay overlay--result', true);
  result.root.dataset['screen'] = 'result';
  const resultTitle = heading(result.card, '', 'result-title');
  const time = el('p', 'overlay__time', result.card);
  const ages = el('p', 'overlay__time overlay__ages', result.card);
  const stats = el('div', 'stats', result.card);
  stats.dataset['role'] = 'stats';
  const buttons = el('div', 'screen__buttons', result.card);
  const replay = actionButton(buttons, tr.result.replay, {
    ariaLabel: tr.result.replayAria,
    primary: true,
    onClick: () => {
      flow.replay();
      replay.blur();
    },
  });
  replay.dataset['action'] = 'replay';
  const toMenu = actionButton(buttons, tr.result.toMenu, { ariaLabel: tr.result.toMenuAria, onClick: () => flow.toMenu() });
  toMenu.dataset['action'] = 'result-menu';
  const writeTitle = textWriter(resultTitle);
  const writeTime = textWriter(time);
  const writeAges = textWriter(ages);
  const toggleResult = visibilityToggle(result.root, () => replay);
  let rendered = false;

  function update(): void {
    const outcome = session.state.outcome;
    const inBattle = flow.screen === 'battle';

    // Aynı anda tek modal: ayarlar açıkken duraklatma katmanı gizlenir (ayarlar kapanınca geri gelir).
    togglePause(inBattle && session.paused && outcome === null && !flow.settingsOpen);

    writeHint(`${tr.pause.hint} ${flow.tutorial !== null ? tr.tutorial.pauseHint : tr.pause.savedHint}`);

    // Öğretici maçının sonu sonuç ekranı yerine tamamlanma kartıyla gösterilir.
    const showResult = inBattle && outcome !== null && flow.tutorial === null;
    if (showResult && outcome !== null) {
      const kind = outcome.kind === 'draw' ? 'draw' : outcome.winner === PLAYER_SIDE ? 'win' : 'loss';
      writeTitle(kind === 'draw' ? tr.result.draw : kind === 'win' ? tr.result.win : tr.result.loss);
      result.root.dataset['outcome'] = kind;
      writeTime(fmt(tr.result.time, { time: formatClock(outcome.tick / WORLD.tickRate) }));
      writeAges(fmt(tr.result.ages, { you: ageName(session.state.sides[0].age), foe: ageName(session.state.sides[1].age) }));
      if (!rendered) {
        rendered = true;
        renderStats(stats, summarizeMatch(session.state, PLAYER_SIDE));
      }
    } else {
      rendered = false;
    }
    toggleResult(showResult);
  }

  update();
  return {
    update,
    destroy(): void {
      pause.root.remove();
      result.root.remove();
    },
  };
}
