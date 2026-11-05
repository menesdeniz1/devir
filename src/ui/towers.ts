import { DEFENSE } from '../data/towers';
import { PLAYER_SIDE } from '../game/constants';
import type { Check, Session } from '../game/session';
import { fmt, tr, towerName } from '../i18n/tr';
import { getAge, getTower, sellRefund } from '../sim/compile';
import type { Command } from '../sim/types';
import { formatNumber } from './unitInfo';

/** Savunma yuvası komutları ve bilgi metinleri. Düğmeler yalnızca bu işlevleri kullanır (DOM yok; testlenebilir). */

/** Oyuncunun şu anki çağında kurulabilen kule kimlikleri (menü sırası). */
export function availableTowerIds(session: Session): readonly string[] {
  return getAge(session.state.sides[PLAYER_SIDE].age)?.towerIds ?? [];
}

export function unlockSlotCommand(slot: number): Command {
  return { type: 'unlockSlot', side: PLAYER_SIDE, slot };
}

export function buildTowerCommand(slot: number, towerId: string): Command {
  return { type: 'buildTower', side: PLAYER_SIDE, slot, towerId };
}

export function sellTowerCommand(slot: number): Command {
  return { type: 'sellTower', side: PLAYER_SIDE, slot };
}

export function unlockSlot(session: Session, slot: number): Check {
  return session.submit(unlockSlotCommand(slot));
}

export function buildTower(session: Session, slot: number, towerId: string): Check {
  return session.submit(buildTowerCommand(slot, towerId));
}

export function sellTower(session: Session, slot: number): Check {
  return session.submit(sellTowerCommand(slot));
}

/** Yuvanın arayüz durumu: kilitli, boş ya da dolu (dolu ise kule kimliği, ödenen ve eski çağ işareti). */
export type SlotView =
  | { kind: 'locked'; cost: number }
  | { kind: 'empty' }
  | { kind: 'built'; towerId: string; paid: number; refund: number; oldAge: boolean };

export function slotView(session: Session, slot: number): SlotView | null {
  const me = session.state.sides[PLAYER_SIDE];
  const s = me.slots[slot];
  if (s === undefined) return null;
  if (!s.unlocked) return { kind: 'locked', cost: DEFENSE.slotUnlockCosts[slot] ?? 0 };
  if (s.tower === null) return { kind: 'empty' };
  const current = getAge(me.age)?.towerIds.includes(s.tower.type) ?? false;
  return { kind: 'built', towerId: s.tower.type, paid: s.tower.paid, refund: sellRefund(s.tower.paid), oldAge: !current };
}

/** Kule seçeneğinin değer satırları: ad–maliyet, tür açıklaması, hasar/aralık/menzil, varsa alan hasarı; ret nedeni başta. */
export function towerTooltipLines(towerId: string, reason?: string): string[] {
  const tower = getTower(towerId);
  const lines: string[] = [];
  if (reason !== undefined) lines.push(reason);
  if (tower === undefined) {
    lines.push(towerName(towerId));
    return lines;
  }
  const def = tower.def;
  lines.push(`${towerName(towerId)} — ${fmt(tr.defense.buildCost, { cost: def.cost })}`);
  lines.push(tr.towerKind[def.kind]);
  lines.push(
    fmt(tr.towerStats.line, { damage: def.damage, interval: formatNumber(def.attackIntervalSec), range: def.range }),
  );
  if (def.splash !== undefined) lines.push(fmt(tr.towerStats.splash, { radius: def.splash.radius }));
  return lines;
}

export function towerTooltip(towerId: string, reason?: string): string {
  return towerTooltipLines(towerId, reason).join('\n');
}

/** Tür açıklaması (menü seçeneğinde görünür): "Hızlı, tek hedef" / "Ağır, alan hasarı". */
export function towerKindText(towerId: string): string {
  const kind = getTower(towerId)?.def.kind;
  return kind === undefined ? '' : tr.towerKind[kind];
}
