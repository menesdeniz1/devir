import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, RESULTS_HISTORY_MAX, STORAGE_KEYS } from '../src/game/constants';
import {
  addResult,
  difficultyOf,
  emptyResults,
  loadResults,
  resultKindOf,
  sanitizeResults,
  saveResults,
  type ResultEntry,
} from '../src/game/results';
import { loadSettings, sanitizeSettings, SettingsStore } from '../src/game/settings';
import { SafeStorage } from '../src/game/storage';
import { MemoryStorage } from './persistence-helpers';

const entry = (over: Partial<ResultEntry> = {}): ResultEntry => ({ at: 1, opponent: 'normal', result: 'win', durationTicks: 1200, playerAge: 3, ...over });

describe('Sonuç geçmişi (GDD §13, ÖK-02)', () => {
  it('toplamlar zorluk başına artar; geçmiş en yeni başta', () => {
    let data = emptyResults();
    data = addResult(data, entry({ opponent: 'easy', result: 'win', at: 1 }));
    data = addResult(data, entry({ opponent: 'hard', result: 'loss', at: 2 }));
    data = addResult(data, entry({ opponent: 'hard', result: 'draw', at: 3 }));
    data = addResult(data, entry({ opponent: 'hard', result: 'loss', at: 4 }));
    expect(data.totals.easy).toEqual({ wins: 1, losses: 0, draws: 0 });
    expect(data.totals.normal).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(data.totals.hard).toEqual({ wins: 0, losses: 2, draws: 1 });
    expect(data.entries.map((e) => e.at)).toEqual([4, 3, 2, 1]);
  });

  it('yalnız son 20 kayıt tutulur ama toplamlar silinmez', () => {
    let data = emptyResults();
    for (let i = 0; i < RESULTS_HISTORY_MAX + 7; i++) data = addResult(data, entry({ at: i }));
    expect(data.entries).toHaveLength(RESULTS_HISTORY_MAX);
    expect(data.entries[0]!.at).toBe(RESULTS_HISTORY_MAX + 6);
    expect(data.entries.at(-1)!.at).toBe(7);
    expect(data.totals.normal.wins).toBe(RESULTS_HISTORY_MAX + 7);
  });

  it('addResult girdiyi değiştirmez', () => {
    const before = emptyResults();
    addResult(before, entry());
    expect(before).toEqual(emptyResults());
  });

  it('sonuç türü oyuncu açısından; yalnız seçilebilir zorluklar kayda geçer', () => {
    expect(resultKindOf({ kind: 'win', winner: 0, tick: 5 })).toBe('win');
    expect(resultKindOf({ kind: 'win', winner: 1, tick: 5 })).toBe('loss');
    expect(resultKindOf({ kind: 'draw', tick: 5 })).toBe('draw');
    expect(difficultyOf('hard')).toBe('hard');
    expect(difficultyOf('basic-bot')).toBeNull();
    expect(difficultyOf('none')).toBeNull();
  });

  it('depoya yazılıp geri okunur; bozuk JSON ve bozuk girdiler boş sayılır', () => {
    const mem = new MemoryStorage();
    const store = new SafeStorage(mem);
    const data = addResult(emptyResults(), entry({ opponent: 'easy', result: 'loss' }));
    expect(saveResults(store, data)).toBe(true);
    expect(loadResults(store)).toEqual(data);

    mem.data.set(STORAGE_KEYS.results, '{bozuk json');
    expect(loadResults(store)).toEqual(emptyResults());
    mem.data.set(STORAGE_KEYS.results, '42');
    expect(loadResults(store)).toEqual(emptyResults());

    const partial = sanitizeResults({
      entries: [entry(), { at: 'x' }, null, { ...entry(), opponent: 'efsane' }, { ...entry(), playerAge: 0 }],
      totals: { easy: { wins: -3, losses: 'a', draws: 2.7 }, normal: 5 },
    });
    expect(partial.entries).toEqual([entry()]);
    expect(partial.totals.easy).toEqual({ wins: 0, losses: 0, draws: 2 });
    expect(partial.totals.normal).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});

describe('Ayarlar (EK-07, ÖK-02)', () => {
  it('depo boşken varsayılanlar', () => {
    const settings = new SettingsStore(new SafeStorage(new MemoryStorage()));
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  it('güncelleme anında dinleyicilere iletilir ve saklanır; yeni örnek aynı değeri okur', () => {
    const mem = new MemoryStorage();
    const settings = new SettingsStore(new SafeStorage(mem));
    const seen: number[] = [];
    settings.subscribe((s) => seen.push(s.musicVolume));
    settings.update({ musicVolume: 25 });
    settings.update({ screenShake: false });
    expect(seen).toEqual([DEFAULT_SETTINGS.musicVolume, 25, 25]);
    expect(JSON.parse(mem.data.get(STORAGE_KEYS.settings)!)).toEqual({ musicVolume: 25, sfxVolume: DEFAULT_SETTINGS.sfxVolume, screenShake: false, gameSpeed: 1 });
    expect(new SettingsStore(new SafeStorage(mem)).value).toEqual({ musicVolume: 25, sfxVolume: DEFAULT_SETTINGS.sfxVolume, screenShake: false, gameSpeed: 1 });
  });

  it('ses düzeyi 0..100 aralığına kırpılır ve yuvarlanır', () => {
    expect(sanitizeSettings({ musicVolume: 140, sfxVolume: -4 })).toMatchObject({ musicVolume: 100, sfxVolume: 0 });
    expect(sanitizeSettings({ musicVolume: 33.6 }).musicVolume).toBe(34);
  });

  it('bozuk JSON ve yanlış tipler varsayılana düşer', () => {
    const mem = new MemoryStorage();
    const store = new SafeStorage(mem);
    mem.data.set(STORAGE_KEYS.settings, 'kırık{');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    mem.data.set(STORAGE_KEYS.settings, '"metin"');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    mem.data.set(STORAGE_KEYS.settings, JSON.stringify({ musicVolume: 'yüksek', sfxVolume: null, screenShake: 'evet' }));
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    mem.data.set(STORAGE_KEYS.settings, JSON.stringify({ musicVolume: 10, extra: 1 }));
    expect(loadSettings(store)).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 10 });
  });

  it('okuma ve yazma hatalarında çökmez; yazma hatası bir kez bildirilir', () => {
    const mem = new MemoryStorage();
    mem.failReads = true;
    mem.failWrites = true;
    const store = new SafeStorage(mem);
    let warnings = 0;
    store.onWriteFailure(() => (warnings += 1));
    const settings = new SettingsStore(store);
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
    settings.update({ sfxVolume: 5 });
    settings.update({ sfxVolume: 6 });
    expect(settings.value.sfxVolume).toBe(6);
    expect(warnings).toBe(1);
  });

  it('depo hiç yoksa (null) da çalışır', () => {
    const settings = new SettingsStore(new SafeStorage(null));
    settings.update({ musicVolume: 1 });
    expect(settings.value.musicVolume).toBe(1);
  });
});
