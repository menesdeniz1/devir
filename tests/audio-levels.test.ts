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
import { MIX, MUSIC, SFX_CATEGORY, SFX_LEVEL, SFX_SETTINGS, levelGain } from '../src/audio/config';
import { windowRms } from '../src/audio/dsp';
import { EventSoundMapper } from '../src/audio/eventMapper';
import { SFX_IDS, SFX_SAMPLE_RATE, renderSfx } from '../src/audio/sfx';
import { volumeToGain } from '../src/audio/volume';

/** Aşama 9 ses düzeyi ölçütleri: ölçülebilir hedefler (çıkışta dBFS, kanal ses düzeyi 100 iken). */

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
    // Kazanç uygulanmış gibi ölçülür.
    expect(analyzeSamples(data, sr, 0.5).peakDb).toBeCloseTo(st.peakDb - 6.02, 1);
  });

  it('kısa pencere RMS: kısa sesler sıfır dolgulu 400 ms pencerede ölçülür', () => {
    const sr = 32000;
    const burst = new Float32Array(Math.round(0.1 * sr)).fill(0.5);
    expect(windowRms(burst, sr)).toBeCloseTo(0.5 * Math.sqrt(0.1 / 0.4), 3);
  });

  it('12 kHz üstü payı: tiz sinyal yüksek, bas sinyal ~0', () => {
    const sr = 32000;
    const make = (f: number) => Float32Array.from({ length: sr }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr));
    expect(analyzeSamples(make(14000), sr).hfShare).toBeGreaterThan(0.8);
    expect(analyzeSamples(make(300), sr).hfShare).toBeLessThan(0.001);
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
    // Referans: tamponu hedefe götüren kazanç formülü.
    const ref = SFX_LEVEL.refWindowRmsDb;
    const g = levelGain(-16);
    expect(toDb(Math.pow(10, ref / 20) * g * MIX.ownGain * MIX.masterGain)).toBeCloseTo(-16, 1);
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

  it('kısa pencere RMS kategori hedefinin ±3 dB içinde', () => {
    for (const r of sfx) {
      const target = SFX_LEVEL.targets[SFX_CATEGORY[r.id]];
      expect(Math.abs(r.windowRmsDb - target), `${r.id}/${r.age}: ${r.windowRmsDb.toFixed(1)} dB, hedef ${target}`).toBeLessThanOrEqual(
        SFX_LEVEL.toleranceDb,
      );
    }
  });

  it('çağlar arasında aynı efektin RMS farkı ≤ 3 dB', () => {
    for (const id of SFX_IDS) {
      const rows = sfx.filter((r) => r.id === id);
      const spread = Math.max(...rows.map((r) => r.windowRmsDb)) - Math.min(...rows.map((r) => r.windowRmsDb));
      expect(spread, id).toBeLessThanOrEqual(SFX_LEVEL.maxAgeSpreadDb);
      const total = Math.max(...rows.map((r) => r.rmsDb)) - Math.min(...rows.map((r) => r.rmsDb));
      expect(total, `${id} (tüm tampon RMS)`).toBeLessThanOrEqual(SFX_LEVEL.maxAgeSpreadDb + 1);
    }
  });

  it('tizlik: 12 kHz üstü enerji payı sınırlıdır', () => {
    for (const r of sfx) expect(r.hfShare, `${r.id}/${r.age}`).toBeLessThanOrEqual(MAX_HF_SHARE);
  });

  it('düzey sıralaması anlamlı: fanfar/yetenek > çarpma > atış > ölüm > arayüz', () => {
    const level = (cat: keyof typeof SFX_LEVEL.targets) => mean(sfx.filter((r) => SFX_CATEGORY[r.id] === cat).map((r) => r.windowRmsDb));
    expect(level('fanfare')).toBeGreaterThan(level('ability'));
    expect(level('ability')).toBeGreaterThan(level('impact'));
    expect(level('impact')).toBeGreaterThan(level('strike'));
    expect(level('strike')).toBeGreaterThan(level('death'));
    expect(level('death')).toBeGreaterThan(level('ui'));
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

  it('rakip efektlerinin de tepe ve düzey ölçütleri tutar (kısık olduğundan hedefin altında)', () => {
    const enemy = analyzeAllSfx(false, 100);
    for (const r of enemy) {
      expect(r.peakDb, `${r.id}/${r.age}`).toBeLessThanOrEqual(SFX_LEVEL.peakCeilingDb - 2.5);
      expect(r.windowRmsDb, `${r.id}/${r.age}`).toBeLessThanOrEqual(SFX_LEVEL.targets[SFX_CATEGORY[r.id]] + 0.1 - 2.5);
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

  it('varsayılan ses düzeylerinde ortalama RMS, tipik savaş efektinin kısa pencere RMS değerinin 8–12 dB altında', () => {
    const typical = mean(
      analyzeAllSfx(true, MIX.defaultSfxVolume)
        .filter((r) => TYPICAL_BATTLE.includes(r.id))
        .map((r) => r.windowRmsDb),
    );
    const { min, max } = SFX_LEVEL.musicBelowSfxDb;
    for (const r of analyzeAllMusic(MIX.defaultMusicVolume, 0)) {
      const below = typical - r.rmsDb;
      expect(below, `çağ ${r.age}: müzik ${r.rmsDb.toFixed(1)} dB, efekt ${typical.toFixed(1)} dB`).toBeGreaterThanOrEqual(min);
      expect(below, `çağ ${r.age}`).toBeLessThanOrEqual(max);
    }
  });

  it('çağlar arası müzik gürlüğü farkı ≤ 3 dB; gerilim katmanları gürlüğü en çok birkaç dB artırır', () => {
    const rms = music.map((r) => r.rmsDb);
    expect(Math.max(...rms) - Math.min(...rms)).toBeLessThanOrEqual(SFX_LEVEL.maxAgeSpreadDb);
    for (let i = 0; i < 5; i++) {
      const rise = musicTense[i]!.rmsDb - music[i]!.rmsDb;
      expect(rise, `çağ ${i + 1}`).toBeLessThanOrEqual(4);
      expect(rise, `çağ ${i + 1}`).toBeGreaterThanOrEqual(-1);
    }
  });

  it('müzik, gürültü ve DC bakımından temiz: 12 kHz üstü yok (22,05 kHz örnekleme), döngü süresi 60–90 sn', () => {
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
  it('yeniden üretilen tampon aynı gürlüktedir (tohum kararlı)', () => {
    const a = windowRms(renderSfx('explosion', 4), SFX_SAMPLE_RATE);
    const b = windowRms(renderSfx('explosion', 4), SFX_SAMPLE_RATE);
    expect(a).toBe(b);
    expect(toDb(a)).toBeCloseTo(SFX_LEVEL.refWindowRmsDb, 1);
  });
});
