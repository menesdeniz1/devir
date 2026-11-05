import { describe, expect, it } from 'vitest';
import { TOWERS } from '../src/data/towers';
import { UNITS } from '../src/data/units';
import { arcSlope } from '../src/render/projectileMath';
import { PROJECTILE_LOOKS, projectileKindOf, type ProjectileKind } from '../src/render/projectileKinds';

describe('Çağa özgü mermiler (GDD §14)', () => {
  const shooters = UNITS.filter((u) => u.role !== 'front');

  it('her menzilli/ağır birlik ve her kule bir mermi görünümüne eşlenir', () => {
    for (const u of shooters) expect(PROJECTILE_LOOKS[projectileKindOf('unit', u.id)], u.id).toBeDefined();
    for (const t of TOWERS) expect(PROJECTILE_LOOKS[projectileKindOf('tower', t.id)], t.id).toBeDefined();
  });

  it('birlik mermileri: menzilli ve ağır çağdan çağa farklı', () => {
    for (const role of ['ranged', 'heavy'] as const) {
      const kinds = UNITS.filter((u) => u.role === role)
        .sort((a, b) => a.age - b.age)
        .map((u) => projectileKindOf('unit', u.id));
      expect(kinds).toHaveLength(5);
      expect(new Set(kinds).size, role).toBe(5);
    }
  });

  it('beklenen eşleme: mızrak/ok/cıvata/mermi/ray; kaya/balista/mancınık/gülle/plazma küresi', () => {
    const byAge = (role: string): ProjectileKind[] =>
      UNITS.filter((u) => u.role === role)
        .sort((a, b) => a.age - b.age)
        .map((u) => projectileKindOf('unit', u.id));
    expect(byAge('ranged')).toEqual(['spear', 'arrow', 'bolt', 'bullet', 'rail']);
    expect(byAge('heavy')).toEqual(['rock', 'ballista', 'catapult', 'cannonball', 'plasmaOrb']);
  });

  it('kule mermileri: hızlı × çağ ve ağır × çağ beşer farklı tür', () => {
    for (const kind of ['fast', 'heavy'] as const) {
      const kinds = TOWERS.filter((t) => t.kind === kind)
        .sort((a, b) => a.age - b.age)
        .map((t) => projectileKindOf('tower', t.id));
      expect(kinds).toHaveLength(5);
      expect(new Set(kinds).size, kind).toBe(5);
    }
    const heavy = TOWERS.filter((t) => t.kind === 'heavy')
      .sort((a, b) => a.age - b.age)
      .map((t) => projectileKindOf('tower', t.id));
    expect(heavy).toEqual(['chuteRock', 'sand', 'oil', 'mortar', 'plasmaBall']);
  });

  it('bilinmeyen kaynak güvenli varsayılana düşer', () => {
    expect(projectileKindOf('unit', 'yok')).toBe('spear');
    expect(projectileKindOf('tower', 'yok')).toBe('spear');
  });

  it('enerji ve ateşli silahların izi var; yaylı mermilerin yay sınırı pozitif', () => {
    for (const k of ['bullet', 'rail', 'laser', 'mgBullet', 'plasmaOrb', 'plasmaBall'] as const) expect(PROJECTILE_LOOKS[k].trail, k).toBeDefined();
    for (const look of Object.values(PROJECTILE_LOOKS)) {
      if (look.arc !== null) {
        expect(look.arc.max).toBeGreaterThan(0);
        expect(look.arc.ratio).toBeGreaterThan(0);
      }
    }
  });
});

describe('Yay eğimi (teğet yönelim)', () => {
  it('başta yükselir, ortada düz, sonda iner; mesafe sıfırsa 0', () => {
    expect(arcSlope(0, 50, 400)).toBeLessThan(0);
    expect(arcSlope(0.5, 50, 400)).toBeCloseTo(0);
    expect(arcSlope(1, 50, 400)).toBeGreaterThan(0);
    expect(arcSlope(0.3, 50, 0)).toBe(0);
    expect(arcSlope(0, 50, -400)).toBe(arcSlope(0, 50, 400));
  });
});
