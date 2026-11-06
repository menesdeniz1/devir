import { afterEach, describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/data/abilities';
import { AGES } from '../src/data/ages';
import { TOWERS } from '../src/data/towers';
import { UNITS } from '../src/data/units';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../src/game/constants';
import { loadSettings, sanitizeSettings, SettingsStore } from '../src/game/settings';
import { SafeStorage } from '../src/game/storage';
import {
  abilityName,
  ageName,
  ageNameTo,
  fmt,
  getLanguage,
  LANGUAGES,
  rejectText,
  resolveLanguage,
  setLanguage,
  towerName,
  tr,
  unitName,
} from '../src/i18n';
import { en } from '../src/i18n/en';
import { tr as turkish } from '../src/i18n/tr';
import { formatNumber } from '../src/ui/unitInfo';
import { MemoryStorage } from './persistence-helpers';

/** Tablonun tüm yapraklarını "a.b.c" yoluyla düzleştirir (sayısal anahtarlar da yol parçasıdır). */
function flatten(value: unknown, path = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      for (const [p, v] of flatten(child, path === '' ? key : `${path}.${key}`)) out.set(p, v);
    }
  } else {
    out.set(path, value);
  }
  return out;
}

const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();

afterEach(() => setLanguage('tr'));

describe('G-04: iki metin tablosu', () => {
  const trLeaves = flatten(turkish);
  const enLeaves = flatten(en);

  it('en ve tr aynı anahtar kümesine sahiptir', () => {
    expect([...enLeaves.keys()].sort()).toEqual([...trLeaves.keys()].sort());
  });

  it('her değer boş olmayan bir dizgidir (iki dilde de)', () => {
    for (const [name, leaves] of [
      ['tr', trLeaves],
      ['en', enLeaves],
    ] as const) {
      for (const [path, value] of leaves) {
        expect(typeof value, `${name}.${path}`).toBe('string');
        expect((value as string).trim().length, `${name}.${path}`).toBeGreaterThan(0);
      }
    }
  });

  it('fmt yer tutucuları her anahtarda iki dilde aynıdır', () => {
    for (const [path, trValue] of trLeaves) {
      expect(placeholders(enLeaves.get(path) as string), path).toEqual(placeholders(trValue as string));
    }
  });

  it('İngilizce tabloda birlik, kule, yetenek ve çağ adlarının hepsi vardır', () => {
    setLanguage('en');
    for (const u of UNITS) expect(tr.unit[u.id], u.id).toBeDefined();
    for (const t of TOWERS) expect(tr.tower[t.id], t.id).toBeDefined();
    for (const a of ABILITIES) {
      expect(tr.ability[a.id], a.id).toBeDefined();
      expect(tr.abilityDesc[a.id], a.id).toBeDefined();
    }
    for (const age of AGES) {
      expect(tr.age[age.age], `age ${age.age}`).toBeDefined();
      expect(tr.ageTo[age.age], `ageTo ${age.age}`).toBeDefined();
    }
    for (const d of ['easy', 'normal', 'hard']) {
      expect(tr.difficulty[d], d).toBeDefined();
      expect(tr.difficultyDesc[d], d).toBeDefined();
    }
    // Aynı dilde iki farklı birlik/kule aynı adı taşımaz.
    expect(new Set(UNITS.map((u) => unitName(u.id))).size).toBe(UNITS.length);
    expect(new Set(TOWERS.map((t) => towerName(t.id))).size).toBe(TOWERS.length);
  });

  it('yetenek açıklamaları iki dilde veri alanlarıyla eksiksiz doldurulur', () => {
    const vars = { damage: 1, sec: 2, zoneSec: 3, dps: 4, slow: 5, delay: 6, pct: 7 };
    for (const lang of LANGUAGES) {
      setLanguage(lang);
      for (const a of ABILITIES) expect(fmt(tr.abilityDesc[a.id]!, vars), `${lang}/${a.id}`).not.toContain('{');
    }
  });
});

describe('G-04: etkin dil', () => {
  it('varsayılan Türkçedir; setLanguage tabloyu ve yardımcıları değiştirir', () => {
    expect(getLanguage()).toBe('tr');
    expect(tr).toBe(turkish);
    expect(unitName('primitive_front')).toBe('Taşbaltacı');
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(tr).toBe(en);
    expect(unitName('primitive_front')).toBe('Stone Axeman');
    expect(towerName('ancient_tower_fast')).toBe('Arrow Tower');
    expect(abilityName('future_stasis')).toBe('Stasis Field');
    expect(ageName(3)).toBe('Medieval Age');
    expect(unitName('yok')).toBe('Unit');
  });

  it('çağ cümleleri her dilde doğal kurulur (Türkçe yönelme hâli, İngilizce tamlama)', () => {
    expect(fmt(tr.hud.ageUpNotice, { dative: ageNameTo(2) })).toBe("Antik Çağ'a geçtin");
    expect(fmt(tr.hud.ageUpNoticeFoe, { dative: ageNameTo(4) })).toBe("Rakip Endüstri Çağı'na geçti");
    setLanguage('en');
    expect(fmt(tr.hud.ageUpNotice, { dative: ageNameTo(2) })).toBe('You advanced to the Ancient Age');
    expect(fmt(tr.hud.ageUpNoticeFoe, { dative: ageNameTo(4) })).toBe('The enemy advanced to the Industrial Age');
  });

  it('ret metinleri ve ondalık ayracı dile göre değişir', () => {
    expect(rejectText('notEnoughGold', 35)).toBe('Yetersiz altın (35 eksik)');
    expect(formatNumber(1.5)).toBe('1,5');
    setLanguage('en');
    expect(rejectText('notEnoughGold', 35)).toBe('Not enough gold (35 short)');
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(2)).toBe('2');
  });

  it('Maden (eski Sınır Taşı) İngilizcede "Mine"; oyun adı korunur', () => {
    expect(en.hud.stone).toBe('Mine');
    expect(en.appTitle).toBe('Devir');
    expect(en.menu.title).toBe('Devir');
  });
});

describe('G-04: dil seçimi (saf işlev)', () => {
  it('kayıtlı seçim her zaman kazanır', () => {
    expect(resolveLanguage('en', 'tr-TR')).toBe('en');
    expect(resolveLanguage('tr', 'en-US')).toBe('tr');
    expect(resolveLanguage('tr', undefined)).toBe('tr');
  });

  it('seçim yokken tarayıcı dili "tr" ile başlıyorsa Türkçe, değilse İngilizce', () => {
    expect(resolveLanguage(undefined, 'tr')).toBe('tr');
    expect(resolveLanguage(undefined, 'tr-TR')).toBe('tr');
    expect(resolveLanguage(undefined, 'TR-tr')).toBe('tr');
    expect(resolveLanguage(undefined, 'en-US')).toBe('en');
    expect(resolveLanguage(undefined, 'de-DE')).toBe('en');
    expect(resolveLanguage(undefined, 'ta')).toBe('en');
  });

  it('tarayıcı dili bilinmiyorsa İngilizce', () => {
    expect(resolveLanguage(undefined, undefined)).toBe('en');
    expect(resolveLanguage(undefined, null)).toBe('en');
    expect(resolveLanguage(undefined, '')).toBe('en');
  });
});

describe('G-04: dil ayarı (doğrulama ve göç)', () => {
  it('geçerli dil korunur; geçersiz ya da yanlış türde değer atılır (otomatik sayılır)', () => {
    expect(sanitizeSettings({ language: 'en' }).language).toBe('en');
    expect(sanitizeSettings({ language: 'tr' }).language).toBe('tr');
    for (const bad of ['de', 'EN', '', 1, null, true, {}, []]) {
      expect(sanitizeSettings({ musicVolume: 10, language: bad }), String(bad)).not.toHaveProperty('language');
    }
  });

  it('dil alanı olmayan eski kayıtlı ayarlar çalışır ve dil alanı eklenmez', () => {
    const mem = new MemoryStorage();
    mem.data.set(STORAGE_KEYS.settings, JSON.stringify({ musicVolume: 25, sfxVolume: 40, screenShake: false }));
    const loaded = loadSettings(new SafeStorage(mem));
    expect(loaded).toEqual({ musicVolume: 25, sfxVolume: 40, screenShake: false, gameSpeed: 1, erosion: true });
    expect(loaded.language).toBeUndefined();
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('dil seçimi saklanır, yeniden yüklemede korunur ve diğer ayarlara dokunmaz', () => {
    const mem = new MemoryStorage();
    const store = new SettingsStore(new SafeStorage(mem));
    store.update({ language: 'en' });
    expect(JSON.parse(mem.data.get(STORAGE_KEYS.settings)!)).toEqual({ ...DEFAULT_SETTINGS, language: 'en' });
    store.update({ musicVolume: 10 });
    const reloaded = new SettingsStore(new SafeStorage(mem));
    expect(reloaded.value).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 10, language: 'en' });
  });

  it('dil seçimi yokken saklanan nesnede dil anahtarı bulunmaz', () => {
    const mem = new MemoryStorage();
    const store = new SettingsStore(new SafeStorage(mem));
    store.update({ sfxVolume: 5 });
    expect(JSON.parse(mem.data.get(STORAGE_KEYS.settings)!)).not.toHaveProperty('language');
  });
});
