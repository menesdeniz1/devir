import { ECONOMY, WORLD } from '../data/world';
import { PLAYER_SIDE } from '../game/constants';
import type { Session } from '../game/session';
import { fmt, rejectText, tr, unitName } from '../i18n/tr';
import { getAge, getUnit } from '../sim/compile';
import type { SideId } from '../sim/types';
import { availableUnitIds, cancelCommand, cancelOrderAt, produceUnit, queueCommand } from './actions';
import { UNIT_SHORTCUT_LABELS } from './constants';
import { attrWriter, boolWriter, el, formatClock, styleWriter, textWriter } from './dom';
import { roleMarkOf, roleNameOf, unitTooltip } from './unitInfo';

export interface Hud {
  /** Her karede çağrılır; yalnızca değişen değerler DOM'a yazılır. */
  update(): void;
  destroy(): void;
}

interface BaseBar {
  set: (hp: number, maxHp: number) => void;
}

function buildBase(parent: HTMLElement, side: SideId, label: string): BaseBar {
  const wrap = el('div', `hud-base hud-base--${side === 0 ? 'player' : 'enemy'}`, parent);
  const name = el('span', 'hud-base__name', wrap);
  name.textContent = label;
  const bar = el('div', 'bar', wrap);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', `${label} ${tr.hud.baseHp}`);
  bar.setAttribute('aria-valuemin', '0');
  const fill = el('div', 'bar__fill', bar);
  const text = el('span', 'hud-base__hp', wrap);
  const ariaNow = attrWriter(bar, 'aria-valuenow');
  const ariaMax = attrWriter(bar, 'aria-valuemax');
  const fillWriter = styleWriter(fill, 'width');
  const textWrite = textWriter(text);
  return {
    set: (hp, maxHp) => {
      const shown = Math.ceil(hp);
      fillWriter(`${Math.max(0, (hp / maxHp) * 100).toFixed(1)}%`);
      textWrite(`${shown} / ${maxHp}`);
      ariaNow(String(shown));
      ariaMax(String(maxHp));
    },
  };
}

interface UnitButton {
  unitId: string;
  button: HTMLButtonElement;
  setDisabled: (v: boolean) => void;
  setReason: (v: string) => void;
  setTitle: (v: string | null) => void;
  setAria: (v: string | null) => void;
}

interface QueueSlot {
  button: HTMLButtonElement;
  glyph: (v: string) => void;
  progress: (v: string) => void;
  setDisabled: (v: boolean) => void;
  setTitle: (v: string | null) => void;
  setAria: (v: string | null) => void;
  setKind: (v: string) => void;
  setRole: (v: string | null) => void;
  mark: (v: string) => void;
}

export function mountHud(root: HTMLElement, session: Session): Hud {
  const top = el('header', 'hud-top', root);
  const bottom = el('section', 'hud-bottom', root);
  bottom.setAttribute('aria-label', tr.hud.controls);

  // ---- Üst şerit ----
  const playerBar = buildBase(top, 0, tr.hud.you);
  const center = el('div', 'hud-center', top);
  const clock = el('span', 'hud-clock', center);
  clock.setAttribute('aria-label', tr.hud.time);
  const pauseButton = el('button', 'btn btn--pause', center);
  pauseButton.type = 'button';
  pauseButton.textContent = tr.hud.pause;
  pauseButton.setAttribute('aria-label', tr.hud.pauseAria);
  pauseButton.addEventListener('click', () => session.togglePause());
  const enemyBar = buildBase(top, 1, tr.hud.enemy);

  const writeClock = textWriter(clock);
  const writePauseDisabled = boolWriter((v) => {
    pauseButton.disabled = v;
  });

  // ---- Alt panel: altın ----
  const goldBox = el('div', 'hud-gold', bottom);
  const goldLabel = el('span', 'hud-gold__label', goldBox);
  goldLabel.textContent = tr.hud.gold;
  const goldValue = el('span', 'hud-gold__value', goldBox);
  const goldIncome = el('span', 'hud-gold__income', goldBox);
  const writeGold = textWriter(goldValue);
  const writeIncome = textWriter(goldIncome);

  // ---- Alt panel: birlik düğmeleri ----
  const unitsBox = el('div', 'hud-units', bottom);
  let unitButtons: UnitButton[] = [];
  let unitKey = '';

  function rebuildUnitButtons(ids: readonly string[]): void {
    unitsBox.replaceChildren();
    unitButtons = ids.map((unitId, index) => {
      const cell = el('div', 'unit-cell', unitsBox);
      const button = el('button', 'btn btn--unit', cell);
      button.type = 'button';
      button.dataset['role'] = getUnit(unitId)?.role ?? '';
      const nameEl = el('span', 'btn__name', button);
      nameEl.textContent = unitName(unitId);
      const costEl = el('span', 'btn__cost', button);
      costEl.textContent = String(getUnit(unitId)?.def.cost ?? 0);
      const keyEl = el('kbd', 'btn__key', button);
      keyEl.textContent = UNIT_SHORTCUT_LABELS[index] ?? '';
      const reason = el('span', 'unit-cell__reason', cell);
      reason.setAttribute('aria-hidden', 'true');
      button.addEventListener('click', () => {
        produceUnit(session, index);
      });
      const disabled = boolWriter((v) => {
        button.disabled = v;
      });
      return {
        unitId,
        button,
        setDisabled: disabled,
        setReason: textWriter(reason),
        setTitle: attrWriter(button, 'title'),
        setAria: attrWriter(button, 'aria-label'),
      };
    });
  }

  // ---- Alt panel: kuyruk ----
  const queueBox = el('div', 'hud-queue', bottom);
  queueBox.setAttribute('role', 'group');
  queueBox.setAttribute('aria-label', tr.hud.queue);
  const slots: QueueSlot[] = [];
  for (let i = 0; i < ECONOMY.maxQueue; i++) {
    const button = el('button', 'queue-slot', queueBox);
    button.type = 'button';
    const progress = el('span', 'queue-slot__progress', button);
    const glyph = el('span', 'queue-slot__glyph', button);
    const mark = el('span', 'queue-slot__mark', button);
    mark.setAttribute('aria-hidden', 'true');
    const kind = attrWriter(button, 'data-kind');
    const role = attrWriter(button, 'data-role');
    button.addEventListener('click', () => {
      cancelOrderAt(session, i);
    });
    slots.push({
      button,
      glyph: textWriter(glyph),
      progress: styleWriter(progress, 'width'),
      setDisabled: boolWriter((v) => {
        button.disabled = v;
      }),
      setTitle: attrWriter(button, 'title'),
      setAria: attrWriter(button, 'aria-label'),
      setKind: (v) => kind(v),
      setRole: (v) => role(v),
      mark: textWriter(mark),
    });
  }

  function update(): void {
    const state = session.state;
    const me = state.sides[PLAYER_SIDE];
    const foe = state.sides[PLAYER_SIDE === 0 ? 1 : 0];

    // Üst şerit.
    playerBar.set(me.baseHp, me.baseMaxHp);
    enemyBar.set(foe.baseHp, foe.baseMaxHp);
    writeClock(formatClock(state.tick / WORLD.tickRate));
    writePauseDisabled(session.ended);

    // Altın.
    writeGold(String(me.gold));
    writeIncome(fmt(tr.hud.incomePerSec, { n: getAge(me.age)?.incomePerSec ?? 0 }));

    // Birlik düğmeleri (çağ değişirse yeniden kurulur).
    const ids = availableUnitIds(session);
    const key = ids.join('|');
    if (key !== unitKey) {
      unitKey = key;
      rebuildUnitButtons(ids);
    }
    unitButtons.forEach((ub, index) => {
      const def = getUnit(ub.unitId)?.def;
      const cost = def?.cost ?? 0;
      const name = unitName(ub.unitId);
      const key = UNIT_SHORTCUT_LABELS[index] ?? '';
      const check = session.check(queueCommand(ub.unitId));
      ub.setDisabled(!check.ok);
      if (check.ok) {
        ub.setReason('');
        ub.setTitle(unitTooltip(ub.unitId, key));
        ub.setAria(fmt(tr.hud.produceAria, { name, cost, key }));
      } else {
        const reason = rejectText(check.reason, check.missingGold);
        ub.setReason(reason);
        ub.setTitle(unitTooltip(ub.unitId, key, reason));
        ub.setAria(fmt(tr.hud.produceAriaBlocked, { name, cost, key, reason }));
      }
    });

    // Kuyruk.
    slots.forEach((slot, i) => {
      const order = me.queue[i];
      if (order === undefined) {
        slot.setKind('empty');
        slot.setRole(null);
        slot.mark('');
        slot.glyph('');
        slot.progress('0%');
        slot.setDisabled(true);
        slot.setTitle(null);
        slot.setAria(tr.hud.queueSlotEmpty);
        return;
      }
      const name = unitName(order.unitId);
      const roleName = roleNameOf(order.unitId);
      slot.glyph(name.charAt(0));
      slot.mark(roleMarkOf(order.unitId));
      slot.setRole(getUnit(order.unitId)?.role ?? null);
      if (i === 0) {
        const build = getUnit(order.unitId)?.buildTicks ?? 1;
        const pct = Math.min(100, Math.floor((order.progressTicks / build) * 100));
        slot.setKind('producing');
        slot.progress(`${pct}%`);
        slot.setDisabled(true);
        slot.setTitle(fmt(tr.hud.queueSlotProducingTip, { name, role: roleName, reason: rejectText('orderInProduction') }));
        slot.setAria(fmt(tr.hud.queueSlotProducing, { name, role: roleName, pct }));
        return;
      }
      slot.setKind('waiting');
      slot.progress('0%');
      const check = session.check(cancelCommand(i));
      slot.setDisabled(!check.ok);
      if (check.ok) {
        slot.setTitle(fmt(tr.hud.queueSlotCancelTip, { name, role: roleName, refund: order.paid }));
        slot.setAria(fmt(tr.hud.queueSlotCancel, { name, role: roleName, refund: order.paid }));
      } else {
        slot.setTitle(rejectText(check.reason, check.missingGold));
        slot.setAria(fmt(tr.hud.queueSlotCancel, { name, role: roleName, refund: order.paid }));
      }
    });
  }

  update();
  return {
    update,
    destroy(): void {
      top.remove();
      bottom.remove();
    },
  };
}
