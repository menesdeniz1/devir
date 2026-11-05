import { STONE } from '../data/stone';
import { ECONOMY, WORLD } from '../data/world';
import { PLAYER_SIDE } from '../game/constants';
import type { Session } from '../game/session';
import { ageName, ageNameTo, fmt, rejectText, tr, unitName } from '../i18n/tr';
import { getAge, getUnit } from '../sim/compile';
import type { SideId } from '../sim/types';
import { ageUp, ageUpCommand, availableUnitIds, cancelCommand, cancelOrderAt, produceUnit, queueCommand } from './actions';
import { NOTICE_MS, UNIT_SHORTCUT_LABELS } from './constants';
import { attrWriter, boolWriter, el, formatClock, styleWriter, textWriter } from './dom';
import { roleMarkOf, roleNameOf, unitTooltip } from './unitInfo';

export interface Hud {
  /** Her karede çağrılır; yalnızca değişen değerler DOM'a yazılır. frameMs: bildirim süresi için gerçek kare süresi. */
  update(frameMs?: number): void;
  destroy(): void;
}

interface BaseBar {
  set: (hp: number, maxHp: number) => void;
  setAge: (age: number) => void;
}

function buildBase(parent: HTMLElement, side: SideId, label: string): BaseBar {
  const wrap = el('div', `hud-base hud-base--${side === 0 ? 'player' : 'enemy'}`, parent);
  const name = el('span', 'hud-base__name', wrap);
  name.textContent = label;
  const ageEl = el('span', 'hud-base__age', wrap);
  ageEl.setAttribute('aria-label', `${label} ${tr.hud.ageName}`);
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
  const ageWrite = textWriter(ageEl);
  return {
    set: (hp, maxHp) => {
      const shown = Math.ceil(hp);
      fillWriter(`${Math.max(0, (hp / maxHp) * 100).toFixed(1)}%`);
      textWrite(`${shown} / ${maxHp}`);
      ariaNow(String(shown));
      ariaMax(String(maxHp));
    },
    setAge: (age) => ageWrite(ageName(age)),
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
  const clockRow = el('div', 'hud-center__row', center);
  const clock = el('span', 'hud-clock', clockRow);
  clock.setAttribute('aria-label', tr.hud.time);
  const pauseButton = el('button', 'btn btn--pause', clockRow);
  pauseButton.type = 'button';
  pauseButton.textContent = tr.hud.pause;
  pauseButton.setAttribute('aria-label', tr.hud.pauseAria);
  pauseButton.addEventListener('click', () => session.togglePause());
  const enemyBar = buildBase(top, 1, tr.hud.enemy);

  // Sınır Taşı göstergesi (üst şeridin ortasında, saatin altında).
  const stoneBox = el('div', 'hud-stone', center);
  stoneBox.title = tr.hud.stoneTip;
  const stoneLabel = el('span', 'hud-stone__label', stoneBox);
  stoneLabel.textContent = tr.hud.stone;
  const stoneTrack = el('div', 'hud-stone__track', stoneBox);
  stoneTrack.setAttribute('role', 'progressbar');
  stoneTrack.setAttribute('aria-label', tr.hud.stone);
  stoneTrack.setAttribute('aria-valuemin', String(-STONE.counterMax));
  stoneTrack.setAttribute('aria-valuemax', String(STONE.counterMax));
  const stoneFill = el('div', 'hud-stone__fill', stoneTrack);
  const stoneValue = el('span', 'hud-stone__value', stoneBox);
  const writeStoneWidth = styleWriter(stoneFill, 'width');
  const writeStoneLeft = styleWriter(stoneFill, 'left');
  const writeStoneText = textWriter(stoneValue);
  const writeStoneOwner = attrWriter(stoneBox, 'data-owner');
  const writeStoneNow = attrWriter(stoneTrack, 'aria-valuenow');
  const writeStoneAria = attrWriter(stoneTrack, 'aria-valuetext');

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

  // ---- Alt panel: deneyim ve çağ atlama ----
  const ageBox = el('div', 'hud-age', bottom);
  const xpHead = el('div', 'hud-xp__head', ageBox);
  const xpLabel = el('span', 'hud-xp__label', xpHead);
  xpLabel.textContent = tr.hud.xp;
  const xpText = el('span', 'hud-xp__text', xpHead);
  const xpBar = el('div', 'bar bar--xp', ageBox);
  xpBar.setAttribute('role', 'progressbar');
  xpBar.setAttribute('aria-valuemin', '0');
  const xpFill = el('div', 'bar__fill', xpBar);
  const ageButton = el('button', 'btn btn--age', ageBox);
  ageButton.type = 'button';
  const ageButtonName = el('span', 'btn__name', ageButton);
  ageButtonName.textContent = tr.hud.ageUp;
  const ageButtonCost = el('span', 'btn__cost', ageButton);
  const ageButtonKey = el('kbd', 'btn__key', ageButton);
  ageButtonKey.textContent = tr.hud.ageUpKey;
  const ageReason = el('span', 'unit-cell__reason', ageBox);
  ageReason.setAttribute('aria-hidden', 'true');
  ageButton.addEventListener('click', () => {
    ageUp(session);
  });
  const writeXpText = textWriter(xpText);
  const writeXpFill = styleWriter(xpFill, 'width');
  const writeXpNow = attrWriter(xpBar, 'aria-valuenow');
  const writeXpMax = attrWriter(xpBar, 'aria-valuemax');
  const writeXpAria = attrWriter(xpBar, 'aria-label');
  const writeAgeDisabled = boolWriter((v) => {
    ageButton.disabled = v;
  });
  const writeAgeCost = textWriter(ageButtonCost);
  const writeAgeReason = textWriter(ageReason);
  const writeAgeTitle = attrWriter(ageButton, 'title');
  const writeAgeAria = attrWriter(ageButton, 'aria-label');
  const writeAgeReady = attrWriter(ageButton, 'data-ready');

  // ---- Bildirim (çağ geçişi, Sınır Taşı) ----
  const notice = el('div', 'hud-notice', root);
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = true;
  let noticeLeft = 0;
  const showNotice = (text: string): void => {
    notice.textContent = text;
    notice.hidden = false;
    noticeLeft = NOTICE_MS;
  };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'reset') {
      noticeLeft = 0;
      notice.hidden = true;
      return;
    }
    if (event.type !== 'sim') return;
    for (const e of event.events) {
      if (e.type === 'agedUp') {
        showNotice(fmt(e.side === PLAYER_SIDE ? tr.hud.ageUpNotice : tr.hud.ageUpNoticeFoe, { dative: ageNameTo(e.age) }));
      } else if (e.type === 'stoneCaptured') {
        showNotice(e.side === PLAYER_SIDE ? tr.hud.noticeStoneCaptured : tr.hud.noticeStoneCapturedFoe);
      } else if (e.type === 'stoneLost' && e.side === PLAYER_SIDE) {
        showNotice(tr.hud.noticeStoneLost);
      }
    }
  });

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

  function updateStone(): void {
    const stone = session.state.stone;
    const ownerName = (side: SideId): string => (side === PLAYER_SIDE ? tr.hud.you : tr.hud.enemy);
    let text: string;
    if (stone.owner !== null) {
      text = fmt(tr.hud.stoneOwned, { owner: ownerName(stone.owner) });
    } else if (stone.counter === 0) {
      text = tr.hud.stoneNeutral;
    } else {
      const leaning: SideId = stone.counter > 0 ? 0 : 1;
      text = fmt(tr.hud.stoneLeaning, {
        owner: ownerName(leaning),
        pct: Math.round((Math.abs(stone.counter) / STONE.counterMax) * 100),
      });
    }
    writeStoneText(text);
    writeStoneOwner(stone.owner === null ? 'none' : stone.owner === PLAYER_SIDE ? 'player' : 'enemy');
    // Çubuk ortadan sayacın yönüne dolar; sahadaki konumu izler (taraf 0 solda, taraf 1 sağda): sayaç > 0 ortanın soluna dolar.
    const half = (Math.abs(stone.counter) / STONE.counterMax) * 50;
    const toLeft = stone.counter > 0;
    writeStoneWidth(`${half.toFixed(1)}%`);
    writeStoneLeft(toLeft ? `${(50 - half).toFixed(1)}%` : '50%');
    writeStoneNow(String(stone.counter));
    writeStoneAria(fmt(tr.hud.stoneAria, { state: text }));
  }

  function updateAge(): void {
    const me = session.state.sides[PLAYER_SIDE];
    const nextAge = getAge(me.age + 1);
    const key = tr.hud.ageUpKey;
    const check = session.check(ageUpCommand());
    writeAgeDisabled(!check.ok);
    writeAgeReady(check.ok ? 'true' : 'false');
    if (nextAge === undefined) {
      const reason = rejectText('maxAge');
      writeXpText(tr.hud.xpFinal);
      writeXpFill('100%');
      writeXpNow(String(me.xp));
      writeXpMax(String(me.xp));
      writeXpAria(fmt(tr.hud.xpAriaFinal, { xp: me.xp }));
      writeAgeCost('');
      writeAgeReason(reason);
      writeAgeTitle(tr.hud.ageUpTipFinal);
      writeAgeAria(fmt(tr.hud.ageUpAriaBlocked, { name: ageName(me.age), cost: 0, key, reason }));
      return;
    }
    writeXpText(fmt(tr.hud.xpProgress, { xp: me.xp, next: nextAge.xpThreshold }));
    writeXpFill(`${Math.min(100, (me.xp / nextAge.xpThreshold) * 100).toFixed(1)}%`);
    writeXpNow(String(me.xp));
    writeXpMax(String(nextAge.xpThreshold));
    writeXpAria(fmt(tr.hud.xpAria, { xp: me.xp, next: nextAge.xpThreshold }));
    writeAgeCost(fmt(tr.hud.ageUpCost, { cost: nextAge.ageUpCost }));
    const tip = fmt(tr.hud.ageUpTip, { dative: ageNameTo(nextAge.age), cost: nextAge.ageUpCost, key });
    if (check.ok) {
      writeAgeReason('');
      writeAgeTitle(tip);
      writeAgeAria(fmt(tr.hud.ageUpAria, { name: ageName(nextAge.age), cost: nextAge.ageUpCost, key }));
      return;
    }
    const xpInfo = check.xp !== undefined && check.xpRequired !== undefined ? { xp: check.xp, xpRequired: check.xpRequired } : undefined;
    const reason = rejectText(check.reason, check.missingGold, xpInfo);
    writeAgeReason(reason);
    writeAgeTitle(`${reason}\n${tip}`);
    writeAgeAria(fmt(tr.hud.ageUpAriaBlocked, { name: ageName(nextAge.age), cost: nextAge.ageUpCost, key, reason }));
  }

  function update(frameMs = 0): void {
    const state = session.state;
    const me = state.sides[PLAYER_SIDE];
    const foe = state.sides[PLAYER_SIDE === 0 ? 1 : 0];

    // Üst şerit.
    playerBar.set(me.baseHp, me.baseMaxHp);
    enemyBar.set(foe.baseHp, foe.baseMaxHp);
    playerBar.setAge(me.age);
    enemyBar.setAge(foe.age);
    writeClock(formatClock(state.tick / WORLD.tickRate));
    writePauseDisabled(session.ended);
    updateStone();

    // Bildirim süresi.
    if (noticeLeft > 0) {
      noticeLeft -= frameMs;
      if (noticeLeft <= 0) notice.hidden = true;
    }

    // Altın.
    writeGold(String(me.gold));
    writeIncome(fmt(tr.hud.incomePerSec, { n: getAge(me.age)?.incomePerSec ?? 0 }));

    // Deneyim ve çağ atlama.
    updateAge();

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
      unsubscribe();
      notice.remove();
      top.remove();
      bottom.remove();
    },
  };
}
