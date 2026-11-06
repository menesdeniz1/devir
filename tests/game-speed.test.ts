import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/data/world';
import { GAME_SPEEDS, STORAGE_KEYS } from '../src/game/constants';
import { createLoopConfig, FixedStepLoop } from '../src/game/loop';
import { Session } from '../src/game/session';
import { isGameSpeed, nextGameSpeed, sanitizeSettings, SettingsStore } from '../src/game/settings';
import { SafeStorage, type KeyValueStorage } from '../src/game/storage';
import { createMatch } from '../src/sim/create';
import { shortcutRows } from '../src/ui/shortcuts';
import { KEY_SPEED } from '../src/ui/constants';
import { tr } from '../src/i18n';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** Bir saniyelik gerçek zamanı 60 kare ile besler; yapılan adım sayısını döndürür. */
function stepsInOneSecond(speed: number): number {
  let steps = 0;
  const loop = new FixedStepLoop(createLoopConfig(WORLD.tickRate), () => void (steps += 1));
  loop.setSpeed(speed);
  for (let i = 0; i < 60; i++) loop.advance(1000 / 60);
  return steps;
}

describe('PRD G-08: oyun hızı', () => {
  it('seçenekler 1×, 1,5×, 2×, 3×; üst sınır 3×', () => {
    expect([...GAME_SPEEDS]).toEqual([1, 1.5, 2, 3]);
    expect(Math.max(...GAME_SPEEDS)).toBe(3);
  });

  it('döngü kesirli çarpanı destekler: 1 sn gerçek zamanda tickRate × hız adım', () => {
    for (const speed of GAME_SPEEDS) {
      // Kayan nokta birikimi ±1 adım oynatabilir.
      expect(Math.abs(stepsInOneSecond(speed) - WORLD.tickRate * speed)).toBeLessThanOrEqual(1);
    }
  });

  it('geçersiz çarpan 1× sayılır', () => {
    expect(stepsInOneSecond(Number.NaN)).toBeCloseTo(WORLD.tickRate, -1);
    expect(stepsInOneSecond(0)).toBeCloseTo(WORLD.tickRate, -1);
    expect(stepsInOneSecond(-2)).toBeCloseTo(WORLD.tickRate, -1);
  });

  it('oturum hızı yeni maçta ve kayıttan devamda korunur', () => {
    const session = new Session({ opponent: 'none' });
    session.setSpeed(2);
    expect(session.speed).toBe(2);
    session.startMatch({ seed: 7, opponent: 'none' });
    expect(session.speed).toBe(2);
    session.startMatch({ seed: 7, opponent: 'none' }, createMatch({ seed: 7, opponent: 'none' }));
    expect(session.speed).toBe(2);
    session.restart();
    expect(session.speed).toBe(2);
  });

  it('hız oyun durumunu değiştirmez: aynı adım sayısında 1× ve 3× aynı duruma varır', () => {
    const a = new Session({ opponent: 'normal' });
    const b = new Session({ opponent: 'normal' });
    a.startMatch({ seed: 11, opponent: 'normal' });
    b.startMatch({ seed: 11, opponent: 'normal' });
    b.setSpeed(3);
    // a: 3000 ms × 1 = 60 adım; b: 1000 ms × 3 = 60 adım.
    for (let i = 0; i < 60; i++) a.advance(50);
    for (let i = 0; i < 20; i++) b.advance(50);
    expect(a.tick).toBe(b.tick);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('ayar doğrulaması: yalnız seçenek değerleri kabul edilir, yoksa 1×', () => {
    expect(sanitizeSettings({}).gameSpeed).toBe(1);
    expect(sanitizeSettings({ gameSpeed: 1.5 }).gameSpeed).toBe(1.5);
    expect(sanitizeSettings({ gameSpeed: 3 }).gameSpeed).toBe(3);
    for (const bad of [4, 16, 0, -1, '2', null, Number.NaN]) expect(sanitizeSettings({ gameSpeed: bad }).gameSpeed).toBe(1);
    expect(isGameSpeed(2)).toBe(true);
    expect(isGameSpeed(2.5)).toBe(false);
  });

  it('eski ayar kaydı (hızsız) 1× ile açılır ve diğer alanlar korunur', () => {
    const mem = new MemoryStorage();
    mem.setItem(STORAGE_KEYS.settings, JSON.stringify({ musicVolume: 20, sfxVolume: 30, screenShake: false }));
    const store = new SettingsStore(new SafeStorage(mem));
    expect(store.value).toMatchObject({ musicVolume: 20, sfxVolume: 30, screenShake: false, gameSpeed: 1 });
    store.update({ gameSpeed: 2 });
    expect(JSON.parse(mem.getItem(STORAGE_KEYS.settings)!).gameSpeed).toBe(2);
    expect(new SettingsStore(new SafeStorage(mem)).value.gameSpeed).toBe(2);
  });

  it('HUD düğmesi ve F kısayolu döngüsel geçer: 1 → 1,5 → 2 → 3 → 1', () => {
    expect(nextGameSpeed(1)).toBe(1.5);
    expect(nextGameSpeed(1.5)).toBe(2);
    expect(nextGameSpeed(2)).toBe(3);
    expect(nextGameSpeed(3)).toBe(1);
  });

  it('kısayol listesinde F ile hız satırı var', () => {
    const rows = shortcutRows();
    const row = rows.find((r) => r.action === tr.shortcuts.speed);
    expect(row?.keys).toEqual([KEY_SPEED.slice(3)]);
  });
});
