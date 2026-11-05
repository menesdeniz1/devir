import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_FADE_MS,
  baseDamageLevel,
  crossfadeAlpha,
  HIT_FLASH,
  hitFlashAlpha,
  SHAKE,
  SHAKE_ABILITIES,
  ScreenShake,
} from '../src/render/fxMath';
import { ABILITIES } from '../src/data/abilities';

function maxOffset(shake: ScreenShake, totalMs: number, stepMs = 16): { max: number; lastNonZeroMs: number } {
  let max = 0;
  let lastNonZeroMs = -1;
  for (let t = 0; t <= totalMs; t += stepMs) {
    const o = shake.update(stepMs);
    const m = Math.hypot(o.x, o.y);
    if (m > 0) lastNonZeroMs = t + stepMs;
    max = Math.max(max, m);
  }
  return { max, lastNonZeroMs };
}

describe('Ekran sarsıntısı (GDD §14, PRD GR-06)', () => {
  it('süreler ≤ 250 ms; orta sarsıntı hafiften güçlü', () => {
    expect(SHAKE.light.ms).toBeLessThanOrEqual(250);
    expect(SHAKE.medium.ms).toBeLessThanOrEqual(250);
    expect(SHAKE.medium.amp).toBeGreaterThan(SHAKE.light.amp);
  });

  it('tetiklenince genlik sınırı içinde salınır ve süresi dolunca durur', () => {
    const s = new ScreenShake();
    s.trigger('medium');
    const r = maxOffset(s, 600);
    expect(r.max).toBeGreaterThan(0);
    expect(r.max).toBeLessThanOrEqual(SHAKE.medium.amp * Math.SQRT2);
    expect(r.lastNonZeroMs).toBeLessThanOrEqual(SHAKE.medium.ms + 16);
    expect(s.active).toBe(false);
  });

  it('kapalıyken (setScreenShake(false)) hiç ofset yok; açık sarsıntı da hemen durur', () => {
    const s = new ScreenShake();
    s.trigger('medium');
    s.update(16);
    s.setEnabled(false);
    expect(s.update(16)).toEqual({ x: 0, y: 0 });
    s.trigger('medium');
    s.trigger('light');
    expect(maxOffset(s, 400).max).toBe(0);
  });

  it('hafif sarsıntı soğuma süresi içinde yeniden başlamaz (kuşatmada sürekli titreme yok)', () => {
    const s = new ScreenShake();
    s.trigger('light');
    maxOffset(s, SHAKE.light.ms + 20);
    expect(s.active).toBe(false);
    s.trigger('light');
    expect(s.active).toBe(false);
    maxOffset(s, SHAKE.lightCooldownMs);
    s.trigger('light');
    expect(s.active).toBe(true);
  });

  it('hafif tetikleme süren orta sarsıntıyı zayıflatmaz', () => {
    const s = new ScreenShake();
    s.trigger('medium');
    s.update(16);
    s.trigger('light');
    expect(maxOffset(s, 48).max).toBeGreaterThan(SHAKE.light.amp);
  });

  it('sarsıntı yetenekleri veride vardır (Sürü Hücumu, Baraj Ateşi)', () => {
    const ids = new Set(ABILITIES.map((a) => a.id));
    for (const id of SHAKE_ABILITIES) expect(ids.has(id), id).toBe(true);
    expect(SHAKE_ABILITIES.size).toBe(2);
  });
});

describe('Üs hasar düzeyi (GDD §14: %75 / %50 / %25)', () => {
  it('eşiklerde doğru katman', () => {
    expect(baseDamageLevel(1)).toBe(0);
    expect(baseDamageLevel(0.75)).toBe(0);
    expect(baseDamageLevel(0.7499)).toBe(1);
    expect(baseDamageLevel(0.5)).toBe(1);
    expect(baseDamageLevel(0.4999)).toBe(2);
    expect(baseDamageLevel(0.25)).toBe(2);
    expect(baseDamageLevel(0.2499)).toBe(3);
    expect(baseDamageLevel(0)).toBe(3);
  });

  it('geçersiz oran hasarsız sayılır', () => {
    expect(baseDamageLevel(Number.NaN)).toBe(0);
  });
});

describe('Arka plan geçişi ve vuruş parlaması', () => {
  it('geçiş 0 → 1 tekdüze artar', () => {
    expect(crossfadeAlpha(0)).toBe(0);
    expect(crossfadeAlpha(BACKGROUND_FADE_MS)).toBe(1);
    expect(crossfadeAlpha(BACKGROUND_FADE_MS * 2)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= BACKGROUND_FADE_MS; t += 50) {
      const a = crossfadeAlpha(t);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });

  it('parlama kısa: vuruştan sonra yükselir, süresi dolunca 0', () => {
    expect(hitFlashAlpha(Infinity)).toBe(0);
    expect(hitFlashAlpha(0)).toBe(0);
    expect(hitFlashAlpha(20)).toBeCloseTo(HIT_FLASH.alpha);
    expect(hitFlashAlpha(HIT_FLASH.ms / 2)).toBeGreaterThan(0);
    expect(hitFlashAlpha(HIT_FLASH.ms)).toBe(0);
    expect(HIT_FLASH.alpha).toBeLessThan(1);
  });
});
