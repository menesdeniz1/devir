import { en } from './en';
import type { Language } from './language';
import { tr as turkish, type Strings, type UiRejectReason } from './tr';

/**
 * Etkin metin tablosuna giriş noktası (TDD §7). Dil açılışta, arayüz kurulmadan önce `setLanguage` ile bir kez
 * seçilir; canlı geçiş yoktur (dil değişince sayfa yeniden yüklenir). Seçilmezse Türkçe (kaynak tablo) geçerlidir.
 *
 * `tr` canlı bir bağlamadır: modül düzeyinde (içe aktarma anında) `tr.…` okuyan kod dil seçilmeden önce çalışır;
 * metinler yalnızca işlev gövdelerinde ve arayüz kurulurken okunmalıdır.
 */
export type { Strings, UiRejectReason };
export { LANGUAGES, isLanguage, resolveLanguage, type Language } from './language';

const TABLES: Record<Language, Strings> = { tr: turkish, en };

export let tr: Strings = turkish;
let active: Language = 'tr';

export function setLanguage(language: Language): void {
  active = language;
  tr = TABLES[language];
}

export function getLanguage(): Language {
  return active;
}

/** Büyük/küçük harf dönüşümü için BCP 47 dil etiketi. */
export function activeLocale(): string {
  return active;
}

/** `{ad}` yer tutucularını doldurur. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

/** Ret nedeninin görünen metni (eksik altın varsa doldurulur). */
export function rejectText(
  reason: UiRejectReason,
  missingGold?: number,
  xpInfo?: { xp: number; xpRequired: number },
  cooldownSec?: number,
): string {
  return fmt(tr.reject[reason], { missing: missingGold ?? 0, xp: xpInfo?.xp ?? 0, required: xpInfo?.xpRequired ?? 0, sec: cooldownSec ?? 0 });
}

/** Yönelme biçimi: Türkçede "Antik Çağ'a", İngilizcede "the Ancient Age" ("… geçtin" / "advanced to …" cümleleri için). */
export function ageNameTo(age: number): string {
  return tr.ageTo[age] ?? tr.ageFallback;
}

export function ageName(age: number): string {
  return tr.age[age] ?? tr.ageFallback;
}

export function towerName(towerId: string): string {
  return tr.tower[towerId] ?? tr.towerFallback;
}

export function abilityName(abilityId: string): string {
  return tr.ability[abilityId] ?? tr.abilityFallback;
}

export function difficultyName(difficulty: string): string {
  return tr.difficulty[difficulty] ?? tr.difficultyFallback;
}

export function unitName(unitId: string): string {
  return tr.unit[unitId] ?? tr.unitFallback;
}
