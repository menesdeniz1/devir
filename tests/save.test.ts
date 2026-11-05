import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../src/game/constants';
import { checksumOf, createSave, infoOf, isCompatibleVersion, parseSave, SaveSlot, serializeSave, type SaveFailure } from '../src/game/save';
import { Session } from '../src/game/session';
import { SafeStorage } from '../src/game/storage';
import { fnv1a, stateHash } from '../src/sim/hash';
import type { GameState } from '../src/sim/types';
import { clone, FRONT_ID } from './helpers';
import { MemoryStorage } from './persistence-helpers';

const VERSION = '0.1.0';

/** Birkaç saniye oynanmış, birlik ve kuyruk içeren bir maç durumu. */
function playedState(): GameState {
  const session = new Session({ seed: 7, opponent: 'normal' });
  session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
  session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
  for (let i = 0; i < 400; i++) session.advance(50);
  return clone(session.state);
}

function saveText(mutate?: (save: Record<string, unknown>) => void): string {
  const save = JSON.parse(serializeSave(createSave(playedState(), VERSION, 123))) as Record<string, unknown>;
  mutate?.(save);
  return JSON.stringify(save);
}

/** Karmayı yeniden hesaplayarak durumu bozar (karma kontrolünü geçip sonraki basamakta takılması için). */
function tampered(mutate: (state: Record<string, unknown>) => void): string {
  return saveText((save) => {
    const state = save['state'] as Record<string, unknown>;
    mutate(state);
    save['checksum'] = fnv1a(JSON.stringify(state));
  });
}

function failureOf(text: string): SaveFailure | null {
  const result = parseSave(text, VERSION);
  return result.ok ? null : result.failure;
}

describe('Kayıt biçimi (TDD §9)', () => {
  it('alanlar: schemaVersion, gameVersion, savedAt, matchConfig, state, checksum', () => {
    const state = playedState();
    const save = createSave(state, VERSION, 42);
    expect(Object.keys(save).sort()).toEqual(['checksum', 'gameVersion', 'matchConfig', 'savedAt', 'schemaVersion', 'state']);
    expect(save.schemaVersion).toBe(1);
    expect(save.gameVersion).toBe(VERSION);
    expect(save.savedAt).toBe(42);
    expect(save.matchConfig).toEqual({ seed: 7, opponent: 'normal' });
    expect(save.state).toBe(state);
  });

  it('checksum, state JSON metninin FNV-1a karmasıdır', () => {
    const state = playedState();
    expect(createSave(state, VERSION, 1).checksum).toBe(fnv1a(JSON.stringify(state)));
    expect(checksumOf(state)).toBe(stateHash(state));
  });

  it('savedAt durumu ve karmayı etkilemez', () => {
    const state = playedState();
    expect(createSave(state, VERSION, 1).checksum).toBe(createSave(state, VERSION, 999).checksum);
  });

  it('yazılıp okunan kayıt aynı durumu (aynı karma) verir ve özet doğrudur', () => {
    const state = playedState();
    const result = parseSave(serializeSave(createSave(state, VERSION, 5)), VERSION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(stateHash(result.save.state)).toBe(stateHash(state));
    expect(infoOf(result.save)).toEqual({ opponent: 'normal', tick: state.tick, playerAge: 1, savedAt: 5 });
  });
});

describe('Yükleme zinciri: her başarısızlık türü (ÖK-04)', () => {
  it('ayrıştırılamayan metin ve nesne olmayan kök: parse', () => {
    expect(failureOf('{bozuk')).toBe('parse');
    expect(failureOf('')).toBe('parse');
    expect(failureOf('[1,2]')).toBe('parse');
    expect(failureOf('null')).toBe('parse');
  });

  it('uyumsuz şema ya da oyun sürümü: version', () => {
    expect(failureOf(saveText((s) => void (s['schemaVersion'] = 2)))).toBe('version');
    expect(failureOf(saveText((s) => void (s['gameVersion'] = '0.2.0')))).toBe('version');
    expect(failureOf(saveText((s) => void (s['gameVersion'] = 7)))).toBe('version');
    expect(failureOf(saveText((s) => void delete s['gameVersion']))).toBe('version');
  });

  it('yama sürümü farkı uyumludur; ana/ikincil fark uyumsuzdur', () => {
    expect(isCompatibleVersion('0.1.0', '0.1.9')).toBe(true);
    expect(isCompatibleVersion('0.1.0', '0.2.0')).toBe(false);
    expect(isCompatibleVersion('1.1.0', '0.1.0')).toBe(false);
    expect(isCompatibleVersion('dev', '0.1.0')).toBe(false);
  });

  it('değiştirilmiş durum ya da karma: checksum', () => {
    expect(failureOf(saveText((s) => void ((s['state'] as { tick: number }).tick += 1)))).toBe('checksum');
    expect(failureOf(saveText((s) => void (s['checksum'] = '00000000')))).toBe('checksum');
    expect(failureOf(saveText((s) => void delete s['checksum']))).toBe('checksum');
    expect(failureOf(saveText((s) => void delete s['state']))).toBe('checksum');
  });

  it('eksik ya da yanlış tipli alanlar (karma doğru): structure', () => {
    expect(failureOf(tampered((st) => void delete st['sides']))).toBe('structure');
    expect(failureOf(tampered((st) => void (st['units'] = 'x')))).toBe('structure');
    expect(failureOf(tampered((st) => void ((st['sides'] as { gold: unknown }[])[0]!.gold = 'çok')))).toBe('structure');
    expect(failureOf(tampered((st) => void (st['tick'] = 1.5)))).toBe('structure');
    expect(failureOf(tampered((st) => void (st['stone'] = null)))).toBe('structure');
    expect(failureOf(tampered((st) => void (st['ai'] = [null])))).toBe('structure');
    expect(failureOf(tampered((st) => void ((st['config'] as { opponent: string }).opponent = 'efsane')))).toBe('structure');
  });

  it('matchConfig durumdaki config ile uyuşmuyorsa: structure', () => {
    expect(failureOf(saveText((s) => void ((s['matchConfig'] as { seed: number }).seed = 99)))).toBe('structure');
  });

  it('bitmiş maça ait kayıt: finished', () => {
    expect(failureOf(tampered((st) => void (st['outcome'] = { kind: 'draw', tick: 10 })))).toBe('finished');
  });

  it('bilinmeyen birlik, kule, yetenek ya da çağ: references', () => {
    expect(failureOf(tampered((st) => void ((st['units'] as { type: string }[])[0]!.type = 'yok_birlik')))).toBe('references');
    expect(failureOf(tampered((st) => void (st['sides'] as { queue: unknown[] }[])[0]!.queue.push({ unitId: 'yok', progressTicks: 0, paid: 1 })))).toBe('references');
    expect(failureOf(tampered((st) => void ((st['sides'] as { slots: { tower: unknown }[] }[])[0]!.slots[0]!.tower = { type: 'yok_kule', paid: 1, cooldown: 0 })))).toBe('references');
    expect(failureOf(tampered((st) => void (st['zones'] = [{ id: 99, side: 0, abilityId: 'yok', x0: 1, x1: 2, ticksLeft: 5 }])))).toBe('references');
    expect(failureOf(tampered((st) => void ((st['sides'] as { age: number }[])[1]!.age = 9)))).toBe('references');
  });

  it('simülasyon değişmezi ihlali: invariants', () => {
    expect(failureOf(tampered((st) => void ((st['sides'] as { gold: number }[])[0]!.gold = -5)))).toBe('invariants');
    expect(failureOf(tampered((st) => void ((st['sides'] as { baseHp: number }[])[0]!.baseHp = 10 ** 9)))).toBe('invariants');
  });

  it('geçerli kayıt zinciri geçer', () => {
    expect(failureOf(saveText())).toBeNull();
  });
});

describe('SaveSlot: tek yuva, geçersizi sil', () => {
  function slotOf(storage: MemoryStorage): SaveSlot {
    return new SaveSlot(new SafeStorage(storage), VERSION);
  }

  it('yoksa none; yazınca ok; temizleyince none', () => {
    const mem = new MemoryStorage();
    const slot = slotOf(mem);
    expect(slot.load()).toEqual({ status: 'none' });
    expect(slot.write(playedState(), 1)).toBe(true);
    expect(slot.load().status).toBe('ok');
    slot.clear();
    expect(slot.load()).toEqual({ status: 'none' });
  });

  it('geçersiz kayıt okununca silinir ve neden bildirilir', () => {
    const mem = new MemoryStorage();
    mem.data.set(STORAGE_KEYS.save, '{"schemaVersion":1,bozuk');
    const slot = slotOf(mem);
    expect(slot.load()).toEqual({ status: 'invalid', failure: 'parse' });
    expect(mem.data.has(STORAGE_KEYS.save)).toBe(false);
    expect(slot.load()).toEqual({ status: 'none' });
  });

  it('uyumsuz sürüm silinir (göç yok)', () => {
    const mem = new MemoryStorage();
    slotOf(mem).write(playedState(), 1);
    const old = new SaveSlot(new SafeStorage(mem), '0.2.0');
    expect(old.load()).toMatchObject({ status: 'invalid', failure: 'version' });
    expect(mem.data.has(STORAGE_KEYS.save)).toBe(false);
  });

  it('yazma hatasında false döner, istisna fırlatmaz; okuma hatası none sayılır', () => {
    const mem = new MemoryStorage();
    const slot = slotOf(mem);
    mem.failWrites = true;
    expect(slot.write(playedState(), 1)).toBe(false);
    mem.failReads = true;
    expect(slot.load()).toEqual({ status: 'none' });
    expect(new SaveSlot(new SafeStorage(null), VERSION).write(playedState(), 1)).toBe(false);
  });
});
