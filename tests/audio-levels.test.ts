import { beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeAllMusic,
  analyzeAllSfx,
  analyzeSamples,
  mixMusicLoop,
  musicMixGain,
  sfxMixGain,
  toDb,
  type MusicRow,
  type SfxRow,
} from '../src/audio/analysis';
import { BALANCE, MIX, MUSIC, SFX_CATEGORY, SFX_LEVEL, SFX_SETTINGS, levelGain } from '../src/audio/config';
import { windowRms } from '../src/audio/dsp';
import { EventSoundMapper } from '../src/audio/eventMapper';
import {
  ABS_GATE_LUFS,
  bandShares,
  highPassCoefficients,
  kWeight,
  measureLoudness,
  shelfCoefficients,
  type BiquadCoefficients,
} from '../src/audio/loudness';
import { SFX_IDS, SFX_SAMPLE_RATE, renderSfx } from '../src/audio/sfx';
import { volumeToGain } from '../src/audio/volume';

/**
 * Aşama 9 ses düzeyi ölçütleri: ITU-R BS.1770-4 K-ağırlıklı gürlük (LUFS) hedefleri, tepe, DC, tıklama, frekans dengesi.
 * Düzeyler çıkışta ölçülür (ana çıkış ve kendi-taraf kazancı dahil), kanal ses düzeyi 100 iken.
 */

const TYPICAL_BATTLE: readonly string[] = ['meleeHit', 'shootRanged', 'impact'];
/** 12 kHz üstü enerji payı üst sınırı (tizlik/cızırtı koruması). */
const MAX_HF_SHARE = 0.1;

let sfx: SfxRow[] = [];
let music: MusicRow[] = [];
let musicTense: MusicRow[] = [];

beforeAll(() => {
  sfx = analyzeAllSfx(true, 100);
  music = analyzeAllMusic(100, 0);
  musicTense = analyzeAllMusic(100, 1);
}, 120_000);

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sine = (f: number, fs: number, seconds: number, amp: number) =>
  Float32Array.from({ length: Math.round(fs * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / fs));

/** Standardın yayımladığı 48 kHz K-filtresi katsayıları (ITU-R BS.1770-4, Tablo 1-2). */
const PUBLISHED_48K = {
  shelf: { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
  highPass: { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 },
} satisfies Record<string, BiquadCoefficients>;

/** Çift ikinci derece süzgecin ω'daki genlik karesi |H|². */
function magSq(c: BiquadCoefficients, w: number): number {
  const re = (a: number, b: number, d: number) => a + b * Math.cos(w) + d * Math.cos(2 * w);
  const im = (b: number, d: number) => -(b * Math.sin(w) + d * Math.sin(2 * w));
  const nr = re(c.b0, c.b1, c.b2);
  const ni = im(c.b1, c.b2);
  const dr = re(1, c.a1, c.a2);
  const di = im(c.a1, c.a2);
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}
/** Yayımlanmış 48 kHz katsayılarından f Hz'deki K-ağırlık kazancının karesi (analog prototipin karşılığı). */
const kGainSq = (f: number) => magSq(PUBLISHED_48K.shelf, (2 * Math.PI * f) / 48000) * magSq(PUBLISHED_48K.highPass, (2 * Math.PI * f) / 48000);

describe('Ses düzeyi: K-ağırlıklı gürlük ölçer (BS.1770-4)', () => {
  it('48 kHz için türetilen katsayılar standardın yayımladığı değerlerle eşleşir', () => {
    for (const [name, got, want] of [
      ['ön filtre', shelfCoefficients(48000), PUBLISHED_48K.shelf],
      ['RLB', highPassCoefficients(48000), PUBLISHED_48K.highPass],
    ] as const) {
      for (const k of ['b0', 'b1', 'b2', 'a1', 'a2'] as const) expect(got[k], `${name}.${k}`).toBeCloseTo(want[k], 8);
    }
  });

  it('1 kHz sinüs −20 dBFS ≈ −23,0 LUFS (±0,3) — 48, 32 ve 22,05 kHz örneklemede', () => {
    for (const fs of [48000, 32000, 22050]) {
      const l = measureLoudness(sine(1000, fs, 5, 0.1), fs);
      expect(l.integratedLufs, `${fs} Hz entegre`).toBeGreaterThan(-23.3);
      expect(l.integratedLufs, `${fs} Hz entegre`).toBeLessThan(-22.7);
      expect(l.momentaryMaxLufs, `${fs} Hz an`).toBeGreaterThan(-23.3);
      expect(l.momentaryMaxLufs, `${fs} Hz an`).toBeLessThan(-22.7);
    }
  });

  it('tam ölçekli sinüs ≈ −3,0 LUFS; kazanç parametresi dBFS ile aynı oranda kaydırır', () => {
    const full = measureLoudness(sine(1000, 48000, 3, 1), 48000);
    expect(full.integratedLufs).toBeGreaterThan(-3.3);
    expect(full.integratedLufs).toBeLessThan(-2.7);
    const half = measureLoudness(sine(1000, 48000, 3, 1), 48000, 0.5);
    expect(half.integratedLufs - full.integratedLufs).toBeCloseTo(-6.02, 1);
  });

  it('K-ağırlık eğrisi: farklı frekanslarda yayımlanmış katsayılardan hesaplanan analitik kazançla örtüşür (±0,3 dB)', () => {
    const ref = measureLoudness(sine(1000, 48000, 4, 0.1), 48000).integratedLufs;
    // Düşük/orta frekanslar tüm hızlarda; 10 kHz yalnız 48 kHz'de (çift doğrusal dönüşüm bozulması yüksek frekansta büyür).
    const cases: Array<[number, number]> = [[100, 32000], [200, 22050], [500, 32000], [3000, 32000], [10000, 48000]];
    for (const [f, fs] of cases) {
      const measured = measureLoudness(sine(f, fs, 4, 0.1), fs).integratedLufs - ref;
      const expected = 10 * Math.log10(kGainSq(f) / kGainSq(1000));
      expect(Math.abs(measured - expected), `${f} Hz @ ${fs}: ölçülen ${measured.toFixed(2)}, beklenen ${expected.toFixed(2)}`).toBeLessThan(0.3);
    }
    // İki öncül: yüksek raf ~+4 dB tizde, RLB basta keser.
    expect(10 * Math.log10(kGainSq(10000) / kGainSq(1000))).toBeGreaterThan(2.5);
    expect(10 * Math.log10(kGainSq(30) / kGainSq(1000))).toBeLessThan(-3);
  });

  it('pembe spektrumlu sinyal (log aralıklı eşit güçte çok-sinüs) analitik beklentiyle örtüşür (±0,3 dB)', () => {
    const fs = 48000;
    const n = fs * 4;
    const data = new Float32Array(n);
    const freqs: number[] = [];
    for (let i = 0; i < 90; i++) freqs.push(40 * Math.pow(15000 / 40, i / 89));
    const amp = 0.02;
    freqs.forEach((f, idx) => {
      const phase = idx * 2.399963; // altın açı: sabit, çakışmasız fazlar
      for (let i = 0; i < n; i++) data[i]! += amp * Math.sin((2 * Math.PI * f * i) / fs + phase);
    });
    const expectedMs = freqs.reduce((a, f) => a + ((amp * amp) / 2) * kGainSq(f), 0);
    const expected = -0.691 + 10 * Math.log10(expectedMs);
    const got = measureLoudness(data, fs).integratedLufs;
    expect(Math.abs(got - expected), `ölçülen ${got.toFixed(2)}, beklenen ${expected.toFixed(2)}`).toBeLessThan(0.3);
  });

  it('kapılama: mutlak (−70 LUFS) ve göreli (−10 LU) kapı; kısa tamponlar tek blok sayılır', () => {
    const fs = 32000;
    // 3 sn yüksek + 8 sn çok alçak (−50 dBFS): göreli kapı alçak kısmı dışlar, entegre ≈ yüksek kısmın gürlüğü.
    const loud = sine(1000, fs, 3, 0.1);
    const quiet = sine(1000, fs, 8, 0.1 * Math.pow(10, -30 / 20));
    const mixed = new Float32Array(loud.length + quiet.length);
    mixed.set(loud);
    mixed.set(quiet, loud.length);
    const l = measureLoudness(mixed, fs);
    expect(l.integratedLufs).toBeGreaterThan(-23.5);
    expect(l.integratedLufs).toBeLessThan(-22.5);
    // Tamamı mutlak kapının altında: ölçülemez (çok düşük sabit).
    const silent = measureLoudness(sine(1000, fs, 3, 1e-5), fs);
    expect(silent.integratedLufs).toBeLessThan(ABS_GATE_LUFS);
    // 50 ms'lik tam ölçekli vuruş: 400 ms bloğa dolgulu ölçülür, entegre/an değeri sonlu ve vuruştan düşük.
    const click = measureLoudness(new Float32Array(Math.round(0.05 * fs)).fill(0.5), fs);
    expect(Number.isFinite(click.momentaryMaxLufs)).toBe(true);
  });

  it('K-ağırlıklı çıkış sonludur ve girişle aynı uzunluktadır', () => {
    expect(kWeight(sine(440, 32000, 1, 0.5), 32000)).toHaveLength(32000);
  });
});

describe('Ses düzeyi: analiz aracı', () => {
  it('bilinen işaret üzerinde doğru ölçer (tepe, RMS, DC, kuyruk, kısa pencere)', () => {
    const sr = 32000;
    const n = sr; // 1 sn
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr) + 0.1;
    const st = analyzeSamples(data, sr);
    expect(st.peakDb).toBeCloseTo(toDb(0.6), 1);
    expect(st.dc).toBeCloseTo(0.1, 3);
    expect(st.rmsDb).toBeCloseTo(toDb(Math.sqrt(0.125 + 0.01)), 1);
    expect(st.windowRmsDb).toBeCloseTo(st.rmsDb, 0);
    expect(st.durSec).toBe(1);
    expect(st.tailDb).toBeGreaterThan(toDb(0.4));
    expect(analyzeSamples(data, sr, 0.5).peakDb).toBeCloseTo(st.peakDb - 6.02, 1);
  });

  it('kısa pencere RMS: kısa sesler sıfır dolgulu 400 ms pencerede ölçülür', () => {
    const sr = 32000;
    const burst = new Float32Array(Math.round(0.1 * sr)).fill(0.5);
    expect(windowRms(burst, sr)).toBeCloseTo(0.5 * Math.sqrt(0.1 / 0.4), 3);
  });

  it('12 kHz üstü payı: tiz sinyal yüksek, bas sinyal ~0', () => {
    const sr = 32000;
    expect(analyzeSamples(sine(14000, sr, 1, 1), sr).hfShare).toBeGreaterThan(0.8);
    expect(analyzeSamples(sine(300, sr, 1, 1), sr).hfShare).toBeLessThan(0.001);
  });

  it('bant payları: 100 Hz bas, 1 kHz orta, 8 kHz tiz', () => {
    const sr = 32000;
    expect(bandShares(sine(100, sr, 1, 0.5), sr).low).toBeGreaterThan(0.98);
    expect(bandShares(sine(1000, sr, 1, 0.5), sr).mid).toBeGreaterThan(0.98);
    expect(bandShares(sine(8000, sr, 1, 0.5), sr).high).toBeGreaterThan(0.98);
    const b = bandShares(sine(1000, sr, 1, 0.5), sr);
    expect(b.low + b.mid + b.high).toBeCloseTo(1, 6);
  });

  it('müzik karışımı gerçek döngü uzunluğundadır ve sonludur', () => {
    const buf = mixMusicLoop(2, 0);
    expect(buf.length / MUSIC.sampleRate).toBeGreaterThan(MUSIC.minLoopSec);
    expect(buf.length / MUSIC.sampleRate).toBeLessThan(MUSIC.maxLoopSec);
    expect(buf.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('Ses düzeyi: yapılandırma tutarlılığı', () => {
  it('her efektin kategorisi var ve kazancı kategori hedefinden türetilmiştir', () => {
    for (const id of SFX_IDS) {
      const category = SFX_CATEGORY[id];
      expect(category, id).toBeDefined();
      expect(SFX_LEVEL.targets[category], id).toBeLessThan(0);
      expect(SFX_SETTINGS[id].gain, id).toBeGreaterThan(0);
    }
    const g = levelGain(-17);
    expect(SFX_LEVEL.refMomentaryLufs + toDb(g * MIX.ownGain * MIX.masterGain)).toBeCloseTo(-17, 1);
  });

  it('hedef LUFS sırası: fanfar > yetenek > çarpma > atış > ölüm > arayüz', () => {
    const t = SFX_LEVEL.targets;
    expect(t.fanfare).toBeGreaterThan(t.ability);
    expect(t.ability).toBeGreaterThan(t.impact);
    expect(t.impact).toBeGreaterThan(t.strike);
    expect(t.strike).toBeGreaterThan(t.death);
    expect(t.death).toBeGreaterThan(t.ui);
  });
});

describe('Ses düzeyi: efektler (her efekt × çağ)', () => {
  it('tablo tam: 29 efekt × 5 çağ', () => {
    expect(sfx).toHaveLength(SFX_IDS.length * 5);
  });

  it('sonlu, DC ≈ 0, sonda tıklama yok, tepe ≤ −1 dBFS', () => {
    for (const r of sfx) {
      const name = `${r.id}/${r.age}`;
      expect(r.finite, `${name} NaN`).toBe(true);
      expect(Math.abs(r.dc), `${name} DC`).toBeLessThanOrEqual(SFX_LEVEL.maxDc);
      expect(r.tailDb, `${name} son 10 ms (tıklama)`).toBeLessThanOrEqual(SFX_LEVEL.maxTailDb);
      expect(r.peakDb, `${name} tepe`).toBeLessThanOrEqual(SFX_LEVEL.peakCeilingDb);
    }
  });

  it('kısa süreli (400 ms blok) en yüksek gürlük kategori hedefinin ±2 LU içinde', () => {
    for (const r of sfx) {
      const target = SFX_LEVEL.targets[SFX_CATEGORY[r.id]];
      expect(Math.abs(r.momentaryLufs - target), `${r.id}/${r.age}: ${r.momentaryLufs.toFixed(1)} LUFS, hedef ${target}`).toBeLessThanOrEqual(
        SFX_LEVEL.toleranceLu,
      );
    }
  });

  it('çağlar arasında aynı efektin gürlük farkı ≤ 3 LU', () => {
    for (const id of SFX_IDS) {
      const l = sfx.filter((r) => r.id === id).map((r) => r.momentaryLufs);
      expect(Math.max(...l) - Math.min(...l), id).toBeLessThanOrEqual(SFX_LEVEL.maxAgeSpreadLu);
    }
  });

  it('tizlik: 12 kHz üstü enerji payı sınırlıdır', () => {
    for (const r of sfx) expect(r.hfShare, `${r.id}/${r.age}`).toBeLessThanOrEqual(MAX_HF_SHARE);
  });

  it('frekans dengesi: hiçbir efektte tek bant (< 250 Hz, 250 Hz–4 kHz, > 4 kHz) %85’i aşmaz', () => {
    for (const r of sfx) {
      const { low, mid, high } = r.bands;
      expect(low + mid + high, `${r.id}/${r.age}`).toBeCloseTo(1, 6);
      for (const [name, v] of [['düşük', low], ['orta', mid], ['tiz', high]] as const) {
        expect(v, `${r.id}/${r.age}: ${name} bant ${(v * 100).toFixed(0)}%`).toBeLessThanOrEqual(BALANCE.maxBandShare);
      }
    }
  });

  it('arayüz sesleri bas ağırlıklı değil (< 250 Hz payı ≤ %40)', () => {
    for (const r of sfx.filter((x) => SFX_CATEGORY[x.id] === 'ui')) {
      expect(r.bands.low, `${r.id}/${r.age}`).toBeLessThanOrEqual(BALANCE.maxUiLow);
    }
  });
});

describe('Ses düzeyi: taraf ayrımı', () => {
  it('rakip sesleri kendi seslerimizden ≈3 dB kısık (3,1 dB)', () => {
    const diff = toDb(MIX.enemyGain) - toDb(MIX.ownGain);
    expect(diff).toBeLessThanOrEqual(-2.5);
    expect(diff).toBeGreaterThanOrEqual(-3.5);
    for (const id of SFX_IDS) {
      expect(toDb(sfxMixGain(id, false)) - toDb(sfxMixGain(id, true)), id).toBeCloseTo(diff, 6);
    }
  });

  it('olay eşlemesi rakip istek kazancını aynı oranda düşürür', () => {
    const own = new EventSoundMapper().map([{ type: 'attack', side: 0, attackerId: 1, target: 2, damage: 5 }], { ages: [2, 2] })[0]!;
    const enemy = new EventSoundMapper().map([{ type: 'attack', side: 1, attackerId: 1, target: 2, damage: 5 }], { ages: [2, 2] })[0]!;
    expect(toDb(enemy.gain) - toDb(own.gain)).toBeCloseTo(toDb(MIX.enemyGain), 6);
  });

  it('rakip efektleri hedefin ≈3 LU altında, tepeleri de düşük', () => {
    const enemy = analyzeAllSfx(false, 100);
    for (const r of enemy) {
      const target = SFX_LEVEL.targets[SFX_CATEGORY[r.id]];
      expect(Math.abs(r.momentaryLufs - (target + toDb(MIX.enemyGain))), `${r.id}/${r.age}`).toBeLessThanOrEqual(SFX_LEVEL.toleranceLu);
      expect(r.peakDb, `${r.id}/${r.age}`).toBeLessThanOrEqual(SFX_LEVEL.peakCeilingDb - 2.5);
    }
  });
});

describe('Ses düzeyi: müzik (her çağın döngüsü)', () => {
  it('beş çağ için tablo var; sonlu, DC ≈ 0, tepe ≤ −1 dBFS (tam ses düzeyinde, gerilim 0 ve 1)', () => {
    expect(music).toHaveLength(5);
    for (const r of [...music, ...musicTense]) {
      expect(r.finite, `çağ ${r.age} NaN`).toBe(true);
      expect(Math.abs(r.dc), `çağ ${r.age} DC`).toBeLessThanOrEqual(SFX_LEVEL.maxDc);
      expect(r.peakDb, `çağ ${r.age} tepe`).toBeLessThanOrEqual(SFX_LEVEL.peakCeilingDb);
    }
  });

  it('varsayılan ses düzeylerinde entegre gürlük, tipik savaş efektinin kısa süreli gürlüğünün 9–12 LU altında', () => {
    const typical = mean(
      analyzeAllSfx(true, MIX.defaultSfxVolume)
        .filter((r) => TYPICAL_BATTLE.includes(r.id))
        .map((r) => r.momentaryLufs),
    );
    const { min, max } = SFX_LEVEL.musicBelowSfxLu;
    for (const r of analyzeAllMusic(MIX.defaultMusicVolume, 0)) {
      const below = typical - r.integratedLufs;
      expect(below, `çağ ${r.age}: müzik ${r.integratedLufs.toFixed(1)} LUFS, efekt ${typical.toFixed(1)} LUFS`).toBeGreaterThanOrEqual(min);
      expect(below, `çağ ${r.age}`).toBeLessThanOrEqual(max);
    }
  });

  it('çağlar arası müzik gürlüğü farkı ≤ 3 LU; gerilim katmanları gürlüğü en çok birkaç LU artırır', () => {
    const l = music.map((r) => r.integratedLufs);
    expect(Math.max(...l) - Math.min(...l)).toBeLessThanOrEqual(SFX_LEVEL.maxAgeSpreadLu);
    for (let i = 0; i < 5; i++) {
      const rise = musicTense[i]!.integratedLufs - music[i]!.integratedLufs;
      expect(rise, `çağ ${i + 1}`).toBeLessThanOrEqual(4);
      expect(rise, `çağ ${i + 1}`).toBeGreaterThanOrEqual(-1);
    }
  });

  it('frekans dengesi: orta bant (250 Hz–4 kHz) payı ≥ %30 (gerilim 0 ve 1)', () => {
    for (const r of [...music, ...musicTense]) {
      expect(r.bands.mid, `çağ ${r.age}: orta bant ${(r.bands.mid * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(BALANCE.minMusicMid);
    }
  });

  it('müzik temiz: 12 kHz üstü yok (22,05 kHz örnekleme), döngü süresi 60–90 sn', () => {
    for (const r of music) {
      expect(r.hfShare).toBe(0);
      expect(r.durSec).toBeGreaterThanOrEqual(MUSIC.minLoopSec);
      expect(r.durSec).toBeLessThanOrEqual(MUSIC.maxLoopSec);
    }
  });

  it('çağ düzeltmesi çıkış kazancına yansır ve ses düzeyi eğrisiyle birleşir', () => {
    for (let age = 1; age <= 5; age++) {
      expect(musicMixGain(age, 60)).toBeCloseTo(MUSIC.levelTrim[age - 1]! * MIX.masterGain * volumeToGain(60), 10);
    }
  });
});

describe('Ses düzeyi: tek tek üretim sabitliği', () => {
  it('yeniden üretilen tampon aynı gürlüktedir (tohum kararlı) ve referans LUFS’a normalleştirilmiştir', () => {
    const a = measureLoudness(renderSfx('explosion', 4), SFX_SAMPLE_RATE).momentaryMaxLufs;
    const b = measureLoudness(renderSfx('explosion', 4), SFX_SAMPLE_RATE).momentaryMaxLufs;
    expect(a).toBe(b);
    expect(a).toBeCloseTo(SFX_LEVEL.refMomentaryLufs, 1);
  });
});
