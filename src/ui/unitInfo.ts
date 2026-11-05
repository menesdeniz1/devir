import { fmt, tr, unitName } from '../i18n/tr';
import { getUnit, TARGET_CLASSES } from '../sim/compile';

/** Sayıyı Türkçe gösterir: tamsayı olduğu gibi, ondalıklı değer virgülle (3,5). */
export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace('.', ',');
}

/**
 * Birlik düğmesinin araç ipucu satırları: başlık, değerler, rol/karşılık açıklaması; varsa kullanılamama nedeni başta.
 * Değerler veriden okunur (tek kaynak); metinler tr.ts'tedir.
 */
export function unitTooltipLines(unitId: string, key: string, reason?: string): string[] {
  const unit = getUnit(unitId);
  const lines: string[] = [];
  if (reason !== undefined) lines.push(reason);
  if (unit === undefined) {
    lines.push(unitName(unitId));
    return lines;
  }
  const def = unit.def;
  lines.push(fmt(tr.hud.unitTitle, { name: unitName(unitId), cost: def.cost, key }));
  lines.push(
    fmt(tr.unitStats.line, {
      hp: def.hp,
      damage: def.damage,
      range: def.range,
      speed: def.speed,
      build: formatNumber(def.buildTimeSec),
    }),
  );
  if (def.splash !== undefined) lines.push(fmt(tr.unitStats.splash, { radius: def.splash.radius }));
  if (def.pierce !== undefined) lines.push(fmt(tr.unitStats.pierce, { count: def.pierce.count }));
  if (def.multiplierOverrides !== undefined) {
    for (const cls of TARGET_CLASSES) {
      const value = def.multiplierOverrides[cls];
      if (value !== undefined) lines.push(fmt(tr.unitStats.override, { target: tr.targetClass[cls] ?? cls, value: formatNumber(value) }));
    }
  }
  lines.push(`${tr.role[def.role]}: ${tr.roleHint[def.role]}`);
  return lines;
}

export function unitTooltip(unitId: string, key: string, reason?: string): string {
  return unitTooltipLines(unitId, key, reason).join('\n');
}

/** Siparişin rol adı (kuyruk kutusu ipuçları için). */
export function roleNameOf(unitId: string): string {
  const unit = getUnit(unitId);
  return unit === undefined ? '' : tr.role[unit.role];
}

/** Kuyruk kutusundaki kısa rol işareti. */
export function roleMarkOf(unitId: string): string {
  const unit = getUnit(unitId);
  return unit === undefined ? '' : tr.roleMark[unit.role];
}
