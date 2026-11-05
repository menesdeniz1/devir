import { describe, expect, it } from 'vitest';
import { Biquad, Osc, createRng, midiToFreq } from '../src/audio/dsp';
import { INSTRUMENT_IDS, renderInstrument } from '../src/audio/music/instruments';
import { SFX_IDS, SFX_RECIPES, SFX_SAMPLE_RATE, renderSfx, type SfxId } from '../src/audio/sfx';
import { SFX_SETTINGS } from '../src/audio/config';

const AGES = [1, 2, 3, 4, 5];

function stats(buf: Float32Array): { peak: number; finite: boolean } {
  let peak = 0;
  let finite = true;
  for (const v of buf) {
    if (!Number.isFinite(v)) finite = false;
    else if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  return { peak, finite };
}

function rms(buf: Float32Array): number {
  let s = 0;
  for (const v of buf) s += v * v;
  return Math.sqrt(s / buf.length);
}

/** Normalleştirilmiş sıfır-gecikmeli ilinti (örtüşen uzunlukta). */
function correlation(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    ab += a[i]! * b[i]!;
    aa += a[i]! * a[i]!;
    bb += b[i]! * b[i]!;
  }
  return ab / Math.sqrt(aa * bb + 1e-12);
}

describe('Ses sentezi: dsp araç kutusu', () => {
  it('osilatör doğru frekansta üretir (sıfır geçişleri)', () => {
    const sr = 44100;
    const osc = new Osc(sr, 'sine');
    let crossings = 0;
    let prev = osc.next(440);
    for (let i = 1; i < sr; i++) {
      const v = osc.next(440);
      if ((prev < 0 && v >= 0) || (prev >= 0 && v < 0)) crossings++;
      prev = v;
    }
    expect(Math.abs(crossings - 880)).toBeLessThanOrEqual(2);
  });

  it('alçak geçiren süzgeç tizi bastırır, bası geçirir', () => {
    const sr = 32000;
    const measure = (freq: number) => {
      const lp = new Biquad(sr, 'lp', 800, 0.707);
      const osc = new Osc(sr, 'sine');
      let sum = 0;
      for (let i = 0; i < sr; i++) {
        const y = lp.process(osc.next(freq));
        if (i > sr / 2) sum += y * y;
      }
      return Math.sqrt(sum / (sr / 2));
    };
    expect(measure(6000)).toBeLessThan(measure(200) * 0.1);
  });

  it('tohumlu üreteç tekrarlanabilir ve [0,1) aralığındadır', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('MIDI -> Hz: A4 = 440, oktav ikiye katlar', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
  });
});

describe('Ses sentezi: efekt tarifleri', () => {
  it('her efekt kimliğinin tarifi ve karışım ayarı vardır', () => {
    for (const id of SFX_IDS) {
      expect(SFX_RECIPES[id], id).toBeDefined();
      expect(SFX_SETTINGS[id], id).toBeDefined();
    }
  });

  it('her efekt her çağda: sonlu, sessiz değil, doruk <= 1, uzunluk tarifteki süre kadar', () => {
    for (const id of SFX_IDS) {
      for (const age of AGES) {
        const buf = renderSfx(id, age);
        const recipe = SFX_RECIPES[id];
        expect(buf.length, `${id}/${age} uzunluk`).toBe(Math.round(recipe.dur * SFX_SAMPLE_RATE));
        const { peak, finite } = stats(buf);
        expect(finite, `${id}/${age} sonlu`).toBe(true);
        expect(peak, `${id}/${age} doruk`).toBeGreaterThan(0.1);
        expect(peak, `${id}/${age} doruk`).toBeLessThanOrEqual(1);
        // Sonda tıklama olmasın: son örnek ~0.
        expect(Math.abs(buf[buf.length - 1]!)).toBeLessThan(0.01);
      }
    }
  });

  it('üretim tekrarlanabilir (aynı kimlik+çağ -> aynı örnekler)', () => {
    const a = renderSfx('explosion', 3);
    const b = renderSfx('explosion', 3);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 97) expect(a[i]).toBe(b[i]);
  });

  it('tını çağla değişir: çağdan çağa çağa duyarlı efektler birbirinden farklıdır', () => {
    const ageSensitive: SfxId[] = [
      'meleeHit', 'shootRanged', 'shootHeavy', 'impact', 'explosion', 'unitDeath', 'baseHit', 'towerFast', 'towerHeavy', 'towerBuilt', 'ageUp',
    ];
    for (const id of ageSensitive) {
      for (let age = 1; age < 5; age++) {
        const a = renderSfx(id, age);
        const b = renderSfx(id, age + 1);
        expect(correlation(a, b), `${id}: ${age} ile ${age + 1} benzer`).toBeLessThan(0.9);
      }
    }
  });

  it('beş yetenek sesi birbirinden belirgin biçimde farklıdır', () => {
    const ids: SfxId[] = ['abilityStampede', 'abilityFireTrench', 'abilityCaltrops', 'abilityBarrage', 'abilityStasis'];
    const bufs = ids.map((id) => renderSfx(id, 1));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(Math.abs(correlation(bufs[i]!, bufs[j]!)), `${ids[i]} ~ ${ids[j]}`).toBeLessThan(0.5);
      }
    }
    // Yetenek sesleri çağdan bağımsızdır.
    expect(correlation(renderSfx('abilityStampede', 1), renderSfx('abilityStampede', 5))).toBeGreaterThan(0.7);
  });

  it('arayüz sesleri kısa, stingerlar uzundur', () => {
    expect(SFX_RECIPES.uiClick.dur).toBeLessThan(0.2);
    for (const id of ['stingerWin', 'stingerLoss', 'stingerDraw'] as const) {
      expect(SFX_RECIPES[id].dur).toBeGreaterThan(2);
      expect(rms(renderSfx(id, 1))).toBeGreaterThan(0.02);
    }
  });
});

describe('Ses sentezi: enstrümanlar', () => {
  it('her enstrüman sonlu, sessiz olmayan ve sınırlı örnek üretir', () => {
    for (const id of INSTRUMENT_IDS) {
      for (const midi of [36, 60, 72]) {
        const buf = renderInstrument(id, 22050, midi, 0.5);
        expect(buf.length, id).toBeGreaterThan(100);
        const { peak, finite } = stats(buf);
        expect(finite, id).toBe(true);
        expect(peak, `${id}/${midi}`).toBeGreaterThan(0.05);
        expect(peak, `${id}/${midi}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
