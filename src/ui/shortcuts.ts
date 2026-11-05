import { tr } from '../i18n/tr';
import { KEY_ABILITY, KEY_AGE_UP, KEY_CANCEL_LAST, KEY_CLOSE_MENU, UNIT_SHORTCUT_CODES } from './constants';

/**
 * Kısayol listesi (salt görüntüleme). Kısayollar fiziksel tuşa (KeyboardEvent.code) bağlıdır; etiket, Keyboard Map API
 * varsa kullanıcının düzenine göre, yoksa Türkçe Q klavye varsayımıyla gösterilir (TDD §7).
 */

export interface ShortcutRow {
  action: string;
  keys: string[];
}

export type KeyLabeler = (code: string) => string;

/** Türkçe Q klavye varsayımı: Key* → harf, Digit* → rakam, diğerleri sabit ad. */
export const fallbackLabel: KeyLabeler = (code) => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Escape') return 'Esc';
  return code;
};

export function shortcutRows(label: KeyLabeler = fallbackLabel): ShortcutRow[] {
  return [
    { action: tr.shortcuts.produce, keys: UNIT_SHORTCUT_CODES.map((code) => label(code)) },
    { action: tr.shortcuts.cancelLast, keys: [label(KEY_CANCEL_LAST)] },
    { action: tr.shortcuts.ability, keys: [label(KEY_ABILITY)] },
    { action: tr.shortcuts.targetMove, keys: ['←', '→'] },
    { action: tr.shortcuts.targetApply, keys: [label('Enter'), label(KEY_ABILITY)] },
    { action: tr.shortcuts.ageUp, keys: [label(KEY_AGE_UP)] },
    { action: tr.shortcuts.pause, keys: [label('KeyP'), label(KEY_CLOSE_MENU)] },
    { action: tr.shortcuts.cancelTarget, keys: [label(KEY_CLOSE_MENU)] },
  ];
}

interface LayoutMapLike {
  get(code: string): string | undefined;
}

/** Keyboard Map API (yalnız Chromium) ile düzene duyarlı etiketleyici; yoksa ya da başarısızsa Q varsayımı. */
export async function loadKeyLabeler(nav: unknown = globalThis.navigator): Promise<KeyLabeler> {
  try {
    const keyboard = (nav as { keyboard?: { getLayoutMap?: () => Promise<LayoutMapLike> } } | undefined)?.keyboard;
    const map = await keyboard?.getLayoutMap?.();
    if (map === undefined) return fallbackLabel;
    return (code) => {
      const key = map.get(code);
      if (key === undefined || key.length === 0) return fallbackLabel(code);
      return key.length === 1 ? key.toLocaleUpperCase('tr') : key;
    };
  } catch {
    return fallbackLabel;
  }
}
