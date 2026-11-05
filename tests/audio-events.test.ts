import { describe, expect, it } from 'vitest';
import { MIX } from '../src/audio/config';
import { EventSoundMapper, type AudioEvent } from '../src/audio/eventMapper';
import { volumeToGain } from '../src/audio/volume';
import { VoiceLimiter } from '../src/audio/voices';
import { ABILITIES } from '../src/data/abilities';
import { TOWERS } from '../src/data/towers';
import { UNITS } from '../src/data/units';

const unit = (age: number, role: string) => UNITS.find((u) => u.age === age && u.role === role)!;
const sfxOf = (events: AudioEvent[], ctx = {}) => new EventSoundMapper().map(events, ctx);

describe('Ses düzeyi eğrisi', () => {
  it('(v/100)^2: uçlar ve orta nokta', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(100)).toBe(1);
    expect(volumeToGain(50)).toBeCloseTo(0.25, 10);
    expect(volumeToGain(10)).toBeCloseTo(0.01, 10);
  });
  it('tekdüzedir, aralık dışını kırpar, geçersiz değerde 0 verir', () => {
    let prev = -1;
    for (let v = 0; v <= 100; v += 5) {
      const g = volumeToGain(v);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    expect(volumeToGain(-20)).toBe(0);
    expect(volumeToGain(250)).toBe(1);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });
});

describe('Eşzamanlı ses sınırı (VoiceLimiter)', () => {
  it('aynı efekt en fazla 4: beşincisi en eskiyi atar', () => {
    const lim = new VoiceLimiter(4, 24);
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = lim.acquire('a', 1, i * 0.01, 1);
      expect(r.id).not.toBeNull();
      expect(r.evicted).toEqual([]);
      ids.push(r.id!);
    }
    const fifth = lim.acquire('a', 1, 0.05, 1);
    expect(fifth.id).not.toBeNull();
    expect(fifth.evicted).toEqual([ids[0]]);
    expect(lim.countFor('a')).toBe(4);
  });

  it('toplam en fazla 24: dolu iken eşit öncelik reddedilir, yüksek öncelik en düşüğü atar', () => {
    const lim = new VoiceLimiter(4, 24);
    for (let i = 0; i < 24; i++) expect(lim.acquire(`s${i % 6}`, 1, 0, 10).id).not.toBeNull();
    expect(lim.count()).toBe(24);
    const rejected = lim.acquire('new', 1, 0.1, 1);
    expect(rejected.id).toBeNull();
    expect(lim.count()).toBe(24);
    const strong = lim.acquire('boss', 5, 0.1, 1);
    expect(strong.id).not.toBeNull();
    expect(strong.evicted).toHaveLength(1);
    expect(lim.count()).toBe(24);
  });

  it('süresi dolan sesler yer açar', () => {
    const lim = new VoiceLimiter(4, 24);
    for (let i = 0; i < 4; i++) lim.acquire('a', 1, 0, 1);
    expect(lim.acquire('a', 1, 2, 1).evicted).toEqual([]);
    expect(lim.countFor('a')).toBe(1);
  });
});

describe('Olay -> ses eşlemesi', () => {
  it('yakın dövüş vuruşu: birlik doğma olayından öğrenilen çağın tınısı, role göre perde', () => {
    const heavy = unit(3, 'heavy');
    const front = unit(2, 'front');
    const m = new EventSoundMapper();
    m.map([
      { type: 'unitSpawned', side: 0, id: 1, unitType: front.id },
      { type: 'unitSpawned', side: 0, id: 2, unitType: heavy.id },
    ]);
    const a = m.map([{ type: 'attack', side: 0, attackerId: 1, target: 9, damage: 10 }]);
    const b = m.map([{ type: 'attack', side: 0, attackerId: 2, target: 9, damage: 10 }]);
    expect(a).toMatchObject([{ sfx: 'meleeHit', age: 2, rate: MIX.roleRate.front }]);
    expect(b).toMatchObject([{ sfx: 'meleeHit', age: 3, rate: MIX.roleRate.heavy }]);
  });

  it('tür bilinmiyorsa tarafın çağına düşer; mermili saldırının attack olayı sessizdir', () => {
    expect(sfxOf([{ type: 'attack', side: 1, attackerId: 77, target: 'base', damage: 5 }], { ages: [1, 4] })).toMatchObject([
      { sfx: 'meleeHit', age: 4, own: false },
    ]);
    expect(sfxOf([{ type: 'attack', side: 0, attackerId: 1, target: 2, damage: null }])).toEqual([]);
  });

  it('menzilli ve ağır atış ile çarpma: ağır birlik patlama, menzilli çarpma sesi çıkarır', () => {
    const ranged = unit(4, 'ranged');
    const heavy = unit(1, 'heavy');
    const m = new EventSoundMapper();
    const fired = m.map([
      { type: 'projectileFired', side: 0, id: 10, sourceType: ranged.id, target: 5 },
      { type: 'projectileFired', side: 0, id: 11, sourceType: heavy.id, target: 5 },
    ]);
    expect(fired.map((r) => [r.sfx, r.age])).toEqual(expect.arrayContaining([['shootRanged', 4], ['shootHeavy', 1]]));
    const hit = m.map([
      { type: 'projectileImpact', side: 0, id: 10, x: 500, hits: 1, hitBase: false },
      { type: 'projectileImpact', side: 0, id: 11, x: 600, hits: 2, hitBase: false },
    ]);
    expect(hit.map((r) => [r.sfx, r.age])).toEqual(expect.arrayContaining([['impact', 4], ['explosion', 1]]));
  });

  it('boşa giden mermi kısık çarpma sesi verir', () => {
    const m = new EventSoundMapper();
    m.map([{ type: 'projectileFired', side: 0, id: 3, sourceType: unit(1, 'ranged').id, target: 5 }]);
    const [r] = m.map([{ type: 'projectileImpact', side: 0, id: 3, x: 100, hits: 0, hitBase: false }]);
    expect(r!.sfx).toBe('impact');
    expect(r!.gain).toBeLessThan(MIX.ownGain);
  });

  it('kule mermisi kule sesinden ayrı çalınmaz (çift ses yok); kule türü hızlı/ağır ayrılır', () => {
    const fast = TOWERS.find((t) => t.age === 3 && t.kind === 'fast')!;
    const heavy = TOWERS.find((t) => t.age === 5 && t.kind === 'heavy')!;
    const out = sfxOf([
      { type: 'towerFired', side: 0, slot: 0, towerType: fast.id, target: 1 },
      { type: 'projectileFired', side: 0, id: 1, sourceType: fast.id, target: 1 },
      { type: 'towerFired', side: 0, slot: 1, towerType: heavy.id, target: 2 },
    ]);
    expect(out.map((r) => [r.sfx, r.age]).sort()).toEqual([['towerFast', 3], ['towerHeavy', 5]]);
  });

  it('birlik ölümü ve doğma; rakibin sesleri kendi seslerinden kısıktır', () => {
    const u = unit(2, 'ranged');
    const own = sfxOf([{ type: 'unitDied', side: 0, id: 1, unitType: u.id, bountyGold: 0, bountyXp: 0 }]);
    const enemy = sfxOf([{ type: 'unitDied', side: 1, id: 2, unitType: u.id, bountyGold: 0, bountyXp: 0 }]);
    expect(own[0]).toMatchObject({ sfx: 'unitDeath', age: 2, rate: MIX.roleRate.ranged, own: true });
    expect(enemy[0]!.gain).toBeLessThan(own[0]!.gain);
    expect(sfxOf([{ type: 'unitSpawned', side: 0, id: 1, unitType: u.id }])[0]!.sfx).toBe('unitSpawn');
  });

  it('aynı karedeki yinelenen olaylar tek istekte birleşir ve hafifçe güçlenir', () => {
    const events: AudioEvent[] = Array.from({ length: 12 }, (_, i) => ({ type: 'attack' as const, side: 0 as const, attackerId: i, target: 99, damage: 5 }));
    const out = sfxOf(events, { ages: [1, 1] });
    expect(out).toHaveLength(1);
    expect(out[0]!.count).toBe(12);
    expect(out[0]!.gain).toBeGreaterThan(MIX.ownGain);
    expect(out[0]!.gain).toBeLessThanOrEqual(MIX.ownGain * MIX.coalesceMax);
    // Farklı taraf/çağ ayrı kalır.
    expect(sfxOf([...events.slice(0, 2), { type: 'attack', side: 1, attackerId: 50, target: 1, damage: 5 }], { ages: [1, 1] })).toHaveLength(2);
  });

  it('üs hasarı hasarla ölçeklenir; çağ geçişi yeni çağın tınısıyla', () => {
    const small = sfxOf([{ type: 'baseDamaged', side: 0, amount: 1 }])[0]!;
    const big = sfxOf([{ type: 'baseDamaged', side: 0, amount: 1000 }])[0]!;
    expect(small.gain).toBeCloseTo(MIX.baseHitMinGain, 6);
    expect(big.gain).toBeCloseTo(1, 6);
    expect(sfxOf([{ type: 'agedUp', side: 0, age: 3, paid: 0, baseHp: 1, baseMaxHp: 1 }])[0]).toMatchObject({ sfx: 'ageUp', age: 3 });
  });

  it('yuva açma yalnız oyuncu için; kule kurma/satma iki taraf için (rakip kısık)', () => {
    const tower = TOWERS[0]!;
    expect(sfxOf([{ type: 'slotUnlocked', side: 1, slot: 1, paid: 0 }])).toEqual([]);
    expect(sfxOf([{ type: 'slotUnlocked', side: 0, slot: 1, paid: 0 }])[0]!.sfx).toBe('slotUnlocked');
    const built = sfxOf([{ type: 'towerBuilt', side: 1, slot: 0, towerType: tower.id, paid: 1 }])[0]!;
    expect(built).toMatchObject({ sfx: 'towerBuilt', age: tower.age, own: false });
    expect(sfxOf([{ type: 'towerSold', side: 0, slot: 0, towerType: tower.id, refund: 1 }])[0]!.sfx).toBe('towerSold');
  });

  it('Sınır Taşı: oyuncu kazanınca olumlu, kaybedince olumsuz ses', () => {
    expect(sfxOf([{ type: 'stoneCaptured', side: 0 }])[0]!.sfx).toBe('stoneCapture');
    expect(sfxOf([{ type: 'stoneCaptured', side: 1 }])[0]!.sfx).toBe('stoneLose');
    expect(sfxOf([{ type: 'stoneLost', side: 0 }])[0]!.sfx).toBe('stoneLose');
    expect(sfxOf([{ type: 'stoneLost', side: 1 }])).toEqual([]);
  });

  it('reddedilen komut hata sesi, maç sonu uygun stinger verir', () => {
    expect(sfxOf([{ type: 'commandRejected', command: { type: 'ageUp', side: 0 }, reason: 'notEnoughXp' }])[0]!.sfx).toBe('uiError');
    expect(sfxOf([{ type: 'commandRejected', command: { type: 'ageUp', side: 1 }, reason: 'notEnoughXp' }])).toEqual([]);
    expect(sfxOf([{ type: 'matchEnded', outcome: { kind: 'win', winner: 0, tick: 1 } }])[0]!.sfx).toBe('stingerWin');
    expect(sfxOf([{ type: 'matchEnded', outcome: { kind: 'win', winner: 1, tick: 1 } }])[0]!.sfx).toBe('stingerLoss');
    expect(sfxOf([{ type: 'matchEnded', outcome: { kind: 'draw', tick: 1 } }])[0]!.sfx).toBe('stingerDraw');
    expect(sfxOf([{ type: 'matchEnded', outcome: { kind: 'win', winner: 1, tick: 1 } }], { playerSide: 1 })[0]!.sfx).toBe('stingerWin');
  });

  it('her yetenek kimliği kendine özgü bir ses verir; bilinmeyen kimlik yedek sese düşer', () => {
    const casts = ABILITIES.map((a) => sfxOf([{ type: 'abilityCast', side: 0, abilityId: a.id }])[0]!.sfx);
    expect(new Set(casts).size).toBe(ABILITIES.length);
    expect(ABILITIES.length).toBeGreaterThanOrEqual(5);
    expect(sfxOf([{ type: 'abilityCast', side: 0, abilityId: 'nope' }])[0]!.sfx).toBe('abilityGeneric');
    // Gecikmeli vuruşun patlaması; saniyelik bölge hasarı sessiz.
    expect(sfxOf([{ type: 'abilityImpact', side: 0, abilityId: 'industrial_barrage' }])[0]!.sfx).toBe('abilityBarrageImpact');
    expect(sfxOf([{ type: 'abilityImpact', side: 0, abilityId: 'ancient_fire_trench' }])).toEqual([]);
  });

  it('gelir/kuyruk/bilinmeyen olay türleri güvenle yok sayılır', () => {
    const events = [
      { type: 'income', side: 0, amount: 5 },
      { type: 'unitQueued', side: 0, unitId: 'x', paid: 1 },
      { type: 'zoneExpired', side: 0, id: 1, abilityId: 'x' },
      { type: 'tamamenYeniOlay', side: 0 },
    ] as unknown as AudioEvent[];
    expect(sfxOf(events)).toEqual([]);
  });
});
