/** Desteklenen arayüz dilleri (PRD G-04). */
export const LANGUAGES = ['tr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Etkin dili seçer (saf işlev; tarayıcıya dokunmaz): kayıtlı seçim varsa o; yoksa tarayıcı dili "tr" ile
 * başlıyorsa Türkçe, aksi halde (bilinmiyorsa da) İngilizce (PRD G-04, TDD §7).
 */
export function resolveLanguage(stored: Language | undefined, browserLanguage: string | undefined | null): Language {
  if (stored !== undefined) return stored;
  return typeof browserLanguage === 'string' && browserLanguage.trim().toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
