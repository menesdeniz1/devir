import { describe, expect, it } from 'vitest';
import { COMBAT } from '../src/data/combat';
import { WORLD } from '../src/data/world';
import { step } from '../src/sim/step';
import { addUnit, newState } from './helpers';

/**
 * PRD E-10, GDD §4: deneyim öldürmelerden ve rakip üsse verilen hasardan gelir (1.2: maden deneyim vermez).
 * Toplam üs hasarı her 100'ü geçtikçe saldırana COMBAT.baseDamageXpPer100 deneyim.
 */
describe('E-10: üs baskısı deneyimi', () => {
  it('veride açık: 100 hasarda 15 deneyim', () => {
    expect(COMBAT.baseDamageXpPer100).toBe(15);
  });

  it('rakip üssüne vuran birlik, toplam hasarın her 100\'ü için deneyim kazanır; savunan taraf kazanmaz', () => {
    const s = newState();
    // Taraf 0'ın ön hat birliği rakip üssünün dibinde.
    addUnit(s, 0, WORLD.worldWidth - WORLD.baseWidth - 30);
    for (let t = 0; t < 30 * WORLD.tickRate; t++) step(s, []);
    const dealt = s.sides[0].stats.baseDamageDealt;
    expect(dealt).toBeGreaterThan(100);
    expect(s.sides[0].xp).toBe(Math.floor(dealt / 100) * COMBAT.baseDamageXpPer100);
    expect(s.sides[1].xp).toBe(0);
  });

  it('eşik birikimlidir: 60 + 60 hasar 100\'ü bir kez geçer', () => {
    const s = newState();
    s.sides[0].stats.baseDamageDealt = 60;
    addUnit(s, 0, WORLD.worldWidth - WORLD.baseWidth - 30);
    let xpAtCross = -1;
    for (let t = 0; t < 30 * WORLD.tickRate; t++) {
      step(s, []);
      if (xpAtCross < 0 && s.sides[0].stats.baseDamageDealt >= 100) xpAtCross = s.sides[0].xp;
    }
    expect(xpAtCross).toBe(COMBAT.baseDamageXpPer100);
  });

  it('E-10: yalnız savunan taraf da kulesiyle öldürerek deneyim kazanır', () => {
    const s = newState();
    s.sides[0].slots[0]!.tower = { type: 'primitive_tower_fast', paid: 0, cooldown: 0 };
    addUnit(s, 1, WORLD.baseWidth + 120);
    for (let t = 0; t < 30 * WORLD.tickRate; t++) step(s, []);
    expect(s.sides[0].xp).toBeGreaterThan(0);
  });
});
