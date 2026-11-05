import { WORLD } from '../data/world';
import { PLAYER_SIDE } from '../game/constants';
import type { Check, Session } from '../game/session';
import { abilityName, fmt, rejectText, tr } from '../i18n';
import { abilityOfAge, type CompiledAbility } from '../sim/compile';
import { battlefieldBounds } from '../sim/geometry';
import type { Command } from '../sim/types';
import { formatNumber } from './unitInfo';

/** Oyuncunun güncel çağ yeteneği (PRD Y-01). */
export function playerAbility(session: Session): CompiledAbility | undefined {
  return abilityOfAge(session.state.sides[PLAYER_SIDE].age);
}

export function castCommand(x: number): Command {
  return { type: 'castAbility', side: PLAYER_SIDE, x };
}

/**
 * Yeteneğin şu an kullanılabilir olup olmadığı (düğme etkinliği ve neden metni için). Alanın konumu kullanılabilirliği
 * etkilemez; bu yüzden savaş alanının ortası sorgulanır.
 */
export function checkAbility(session: Session): Check {
  const field = battlefieldBounds();
  return session.check(castCommand((field.x0 + field.x1) / 2));
}

/** Yeteneği x merkezli alana kullanır (düğme/fare ve kısayol aynı yolu kullanır). */
export function castAbilityAt(session: Session, x: number): Check {
  return session.submit(castCommand(x));
}

/** Kalan beklemeyi tam saniyeye yukarı yuvarlar (gösterim). */
export function cooldownSeconds(ticks: number): number {
  return Math.ceil(ticks / WORLD.tickRate);
}

/** Ret nedeninin görünen metni; bekleme için kalan saniye doldurulur. */
export function abilityReasonText(check: Extract<Check, { ok: false }>): string {
  const sec = check.cooldownTicks === undefined ? undefined : cooldownSeconds(check.cooldownTicks);
  return rejectText(check.reason, check.missingGold, undefined, sec);
}

/** Kısa açıklama: sayılar veriden doldurulur. */
export function abilityDescription(ability: CompiledAbility): string {
  const def = ability.def;
  const template = tr.abilityDesc[def.id] ?? tr.abilityDescFallback;
  return fmt(template, {
    damage: def.impactDamage ?? 0,
    sec: def.status === undefined ? 0 : formatNumber(def.status.durationSec),
    pct: def.status?.damageTakenPct ?? 0,
    zoneSec: def.zone === undefined ? 0 : formatNumber(def.zone.durationSec),
    dps: def.zone?.damagePerSec ?? 0,
    slow: def.zone?.slowPct ?? 0,
    delay: def.delaySec === undefined ? 0 : formatNumber(def.delaySec),
  });
}

/** Araç ipucu metni (satırlar `\n` ile birleşir): nedeni (varsa) başta, sonra ad, açıklama ve alan/bekleme değerleri. */
export function abilityTooltip(ability: CompiledAbility, key: string, reason?: string): string {
  return abilityTooltipLines(ability, key, reason).join('\n');
}

/** Araç ipucu satırları: başlık, açıklama, alan/bekleme değerleri; varsa kullanılamama nedeni başta. */
export function abilityTooltipLines(ability: CompiledAbility, key: string, reason?: string): string[] {
  const lines: string[] = [];
  if (reason !== undefined) lines.push(reason);
  lines.push(
    fmt(tr.abilityUi.tip, {
      name: abilityName(ability.def.id),
      key,
      desc: abilityDescription(ability),
      stats: fmt(tr.abilityUi.stats, { width: ability.def.width, cooldown: formatNumber(ability.def.cooldownSec) }),
    }),
  );
  return lines;
}
