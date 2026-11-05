import { beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeAllMusic,
  analyzeInstruments,
  analyzeSamples,
  attackTime,
  formatTimbreComparison,
  sfxMixGain,
  timbreOf,
  type InstrumentRow,
  type LevelStats,
  type MusicRow,
} from '../src/audio/analysis';
import { MIX, SFX_CATEGORY, SFX_LEVEL, SFX_SETTINGS, SOFTEN } from '../src/audio/config';
import { Biquad, Osc, createRng, renderLayers, type Layer } from '../src/audio/dsp';
import { createAudioEngine, type AudioEngine } from '../src/audio/engine';
import type { AudioEvent } from '../src/audio/eventMapper';
import { spectrumStats } from '../src/audio/loudness';
import { balanceBands } from '../src/audio/sfx/balance';
import { SFX_IDS, SFX_SAMPLE_RATE, limitPeaks, renderSfx, type SfxId } from '../src/audio/sfx';
import { VoiceLimiter } from '../src/audio/voices';
import { FakeContext, FakeTimer } from './audio-helpers';

/**
 * Yumuşak tını ölçütleri (GDD §15). İlk insan oyun testi: efektler "hafif itici". Kök nedenler ölçüldü ve düzeltildi:
 * her efekte eklenen 5,5 kHz üstü hışırtı dolgusu, 1–2 ms'lik anlık başlangıçlar, çiğ testere/kare dalgalar, süzgeçsiz
 * tiz gürültü ve çınlama, rezonanslı dar bant gürültü, tek tamponun birebir tekrarı. Burada hem mutlak sınırlar hem de
 * değişiklik öncesi ölçülen en kötü seslere göre iyileşme kodlanır.
 *
 * Ölçütler (analysis.ts): tiz payı = 4 kHz üstü enerji payı; ağırlık merkezi = güç ağırlıklı ortalama frekans;
 * yükselme = ilk olayın %10 → %90 süresi (tepe tutma).
 */

const SR = SFX_SAMPLE_RATE;

/** Mutlak hedefler. */
const TARGET = {
  /** Efekt: 4 kHz üstü enerji payı (önce ortalama %10,3, en kötü %28). */
  sfxMaxHf4k: 0.05,
  /** Efekt: spektral ağırlık merkezi (Hz) (önce ortalama 1592 Hz, en kötü 3401 Hz). */
  sfxMaxCentroidHz: 1800,
  /** Efekt: tüm efektlerin ortalama ağırlık merkezi (Hz). */
  sfxMeanCentroidHz: 900,
  /** Yükselme süresi alt sınırı (sn): daha hızlısı tıklama gibi duyulur. */
  minAttackSec: 0.003,
  /** Müzik döngüsü: 4 kHz üstü pay ve ağırlık merkezi. */
  musicMaxHf4k: 0.02,
  musicMaxCentroidHz: 800,
  /** Enstrüman: ağırlık merkezi üst sınırı (zil/çalkalayıcı dahil; önce 9,6 kHz). */
  instrumentMaxCentroidHz: 5500,
  /** Tonal (vurmalı olmayan) enstrümanlarda 4 kHz üstü pay. */
  tonalMaxHf4k: 0.03,
} as const;

/** Değişiklik öncesi ölçülen en tiz efektler: [4 kHz üstü pay, ağırlık merkezi Hz] (kendi-taraf çıkış düzeyi). */
const BEFORE_SFX: Record<string, readonly [number, number]> = {
  'towerBuilt/4': [0.284, 3070],
  'abilityFireTrench/4': [0.274, 2980],
  'abilityFireTrench/2': [0.269, 2934],
  'abilityFireTrench/1': [0.26, 2835],
  'towerSold/5': [0.216, 3401],
  'ageUp/4': [0.162, 2348],
  'impact/3': [0.159, 2394],
  'shootRanged/4': [0.157, 1731],
  'slotUnlocked/4': [0.154, 2215],
  'towerHeavy/1': [0.15, 1759],
  'meleeHit/1': [0.123, 1510],
  'unitSpawn/4': [0.13, 1940],
};
/** Değişiklik öncesi en tiz müzik enstrümanları. */
const BEFORE_INSTRUMENTS: Record<string, readonly [number, number]> = {
  eHat: [0.999, 9581],
  shaker: [0.988, 8271],
  steamHiss: [0.792, 5578],
  eSnare: [0.522, 4546],
  taborDrum: [0.132, 1229],
};

/** Bilinçli hızlı geçişler: telli çalgı çekişi (Karplus-Strong gürültü uyarımı). En az 1,5 ms. */
const PLUCKED = new Set(['lyre', 'lute']);
const PLUCK_MIN_ATTACK_SEC = 0.0015;
const PERCUSSIVE = new Set(['frameDrum', 'skinDrum', 'stickClick', 'shaker', 'handDrum', 'taborDrum', 'clank', 'kickMech', 'steamHiss', 'eKick', 'eSnare', 'eHat']);

interface Row extends LevelStats {
  key: string;
  id: SfxId;
  variant: number;
}

let sfx: Row[] = [];
let music: MusicRow[] = [];
let instruments: InstrumentRow[] = [];

beforeAll(() => {
  for (const id of SFX_IDS) {
    for (let age = 1; age <= 5; age++) {
      for (let v = 0; v < SFX_SETTINGS[id].variants; v++) {
        sfx.push({ key: `${id}/${age}`, id, variant: v, ...analyzeSamples(renderSfx(id, age, SR, v), SR, sfxMixGain(id)) });
      }
    }
  }
  music = analyzeAllMusic();
  instruments = analyzeInstruments();
}, 180_000);

const sine = (f: number, sr: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(sr * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));

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

describe('Tını ölçümü: analiz aracı', () => {
  it('spektral ağırlık merkezi: saf sinüste frekansın kendisi; iki eşit sinüste ortası', () => {
    expect(spectrumStats(sine(1000, SR, 1), SR).centroidHz).toBeCloseTo(1000, -1);
    const mix = sine(500, SR, 1).map((v, i) => v + 0.5 * Math.sin((2 * Math.PI * 2500 * i) / SR));
    expect(spectrumStats(mix, SR).centroidHz).toBeCloseTo(1500, -1);
  });

  it('yükselme süresi: anlık başlangıç < 0,5 ms; 10 ms doğrusal yükselme ≈ 8 ms (%10 → %90)', () => {
    const click = new Float32Array(SR / 10);
    for (let i = 100; i < click.length; i++) click[i] = 0.5 * Math.sin((2 * Math.PI * 2000 * i) / SR);
    expect(attackTime(click, SR)).toBeLessThan(0.0005);
    const ramp = sine(2000, SR, 0.2).map((v, i) => v * Math.min(1, i / (0.01 * SR)));
    expect(attackTime(ramp, SR)).toBeGreaterThan(0.0075);
    expect(attackTime(ramp, SR)).toBeLessThan(0.0085);
    expect(attackTime(new Float32Array(100), SR)).toBe(0);
  });

  it('önce → sonra tablosu anahtarla eşleşir', () => {
    const st = analyzeSamples(sine(1000, SR, 0.5), SR);
    const row = timbreOf('a', st, 'momentary');
    const text = formatTimbreComparison([{ ...row, hf4k: 0.2 }], [row, { ...row, key: 'b' }]);
    expect(text).toContain('20.0→0.0');
    expect(text.split('\n')).toHaveLength(3);
    expect(text).toContain('—→');
  });
});

describe('Tını: sentez araç kutusu yumuşaktır', () => {
  it('yüksek raf süzgeci: tizde busShelfDb kadar kısar, basa dokunmaz', () => {
    const gainAt = (f: number) => {
      const hs = new Biquad(SR, 'hs', SOFTEN.busShelfHz, 0.707, SOFTEN.busShelfDb);
      const x = sine(f, SR, 0.5);
      let inE = 0;
      let outE = 0;
      for (let i = 0; i < x.length; i++) {
        const y = hs.process(x[i]!);
        if (i > x.length / 2) {
          inE += x[i]! * x[i]!;
          outE += y * y;
        }
      }
      return 10 * Math.log10(outE / inE);
    };
    expect(gainAt(12000)).toBeCloseTo(SOFTEN.busShelfDb, 0);
    expect(Math.abs(gainAt(150))).toBeLessThan(0.3);
  });

  it('testere dalga katmanı perdeyi izleyen süzgeçle yuvarlatılır (çiğ osilatöre göre tiz payı çok düşük)', () => {
    const raw = new Osc(SR, 'saw');
    const rawBuf = Float32Array.from({ length: SR / 2 }, () => raw.next(400));
    const layer: Layer = { k: 'tone', wave: 'saw', f: 400, tau: 0.3, gain: 0.5, hold: 0.3 };
    const soft = renderLayers(SR, 0.5, [layer], createRng(1));
    expect(spectrumStats(rawBuf, SR).high).toBeGreaterThan(0.03);
    expect(spectrumStats(soft, SR).high).toBeLessThan(0.003);
  });

  it('gürültü katmanı bant sınırlıdır: süzgeçsiz ve yüksek geçiren gürültü bile tiz cızırtı üretmez', () => {
    const white = renderLayers(SR, 0.5, [{ k: 'noise', filter: 'none', f: 0, tau: 1, gain: 0.5, hold: 0.5 }], createRng(2));
    expect(spectrumStats(white, SR).centroidHz).toBeLessThan(4000);
    const hiss = renderLayers(SR, 0.5, [{ k: 'noise', filter: 'hp', f: 6500, tau: 1, gain: 0.5, hold: 0.5 }], createRng(3));
    expect(spectrumStats(hiss, SR).centroidHz).toBeLessThan(SOFTEN.noiseCeilHz);
  });

  it('çınlamada ringMaxHz üstü kısmiler atılır, yüksek kısmiler zayıflar', () => {
    const r = renderLayers(SR, 0.5, [{ k: 'ring', f: 2500, ratios: [1, 4], tau: 0.3, gain: 0.5 }], createRng(4));
    expect(spectrumStats(r, SR).high).toBeLessThan(0.01);
  });

  it('her katman en az SOFTEN.minAttackSec içinde yükselir (anlık başlangıç istense bile)', () => {
    const hit = renderLayers(SR, 0.2, [{ k: 'noise', filter: 'bp', f: 1500, tau: 0.05, gain: 0.5, attack: 0 }], createRng(5));
    expect(attackTime(hit, SR)).toBeGreaterThan(SOFTEN.minAttackSec * 0.5);
    let early = 0;
    for (let i = 0; i < Math.round(0.0005 * SR); i++) early = Math.max(early, Math.abs(hit[i]!));
    let peak = 0;
    for (const v of hit) peak = Math.max(peak, Math.abs(v));
    expect(early).toBeLessThan(peak * 0.25);
  });

  it('bant dengeleyici tiz banda (> 4 kHz) dolgu eklemez; tonal efekte alçak bant gövdesi ekler', () => {
    const tonal = sine(1000, SR, 0.4);
    balanceBands(tonal, SR, createRng(6));
    const s = spectrumStats(tonal, SR);
    expect(s.high).toBeLessThan(0.005);
    expect(s.mid).toBeLessThanOrEqual(0.85);
    const bass = sine(80, SR, 0.4);
    balanceBands(bass, SR, createRng(7));
    expect(spectrumStats(bass, SR).high).toBeLessThan(0.005);
  });

  it('tepe sınırlayıcı: tepe sınırın altına iner, sınırın altındaki bölüm değişmez', () => {
    const x = sine(300, SR, 0.4, 0.3);
    for (let i = 4000; i < 4200; i++) x[i]! *= 3;
    const before = x.slice();
    limitPeaks(x, SR, 0.5);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(0.5 + 1e-6);
    for (let i = 0; i < 3000; i++) expect(x[i]).toBe(before[i]);
  });
});

describe('Tını: efektler (her efekt × çağ × çeşit)', () => {
  it('tiz payı ve ağırlık merkezi mutlak sınırların altında', () => {
    for (const r of sfx) {
      const name = `${r.key}#${r.variant}`;
      expect(r.bands.high, `${name}: > 4 kHz %${(r.bands.high * 100).toFixed(1)}`).toBeLessThanOrEqual(TARGET.sfxMaxHf4k);
      expect(r.centroidHz, `${name}: merkez ${r.centroidHz.toFixed(0)} Hz`).toBeLessThanOrEqual(TARGET.sfxMaxCentroidHz);
    }
    const base = sfx.filter((r) => r.variant === 0);
    const mean = base.reduce((a, r) => a + r.centroidHz, 0) / base.length;
    expect(mean).toBeLessThanOrEqual(TARGET.sfxMeanCentroidHz);
  });

  it('değişiklik öncesi en tiz efektler belirgin biçimde yumuşadı (tiz payı ≤ yarı, merkez ≤ %70)', () => {
    for (const [key, [hf, centroid]] of Object.entries(BEFORE_SFX)) {
      const r = sfx.find((x) => x.key === key && x.variant === 0)!;
      expect(r, key).toBeDefined();
      expect(r.bands.high, `${key}: tiz payı ${hf} → ${r.bands.high.toFixed(3)}`).toBeLessThanOrEqual(hf * 0.5);
      expect(r.centroidHz, `${key}: merkez ${centroid} → ${r.centroidHz.toFixed(0)}`).toBeLessThanOrEqual(centroid * 0.7);
    }
  });

  it(`tıklama yok: yükselme süresi ≥ ${TARGET.minAttackSec * 1000} ms`, () => {
    for (const r of sfx) {
      expect(r.attackSec, `${r.key}#${r.variant}: ${(r.attackSec * 1000).toFixed(1)} ms`).toBeGreaterThanOrEqual(TARGET.minAttackSec);
    }
  });

  it('çeşitler de kırpılmaz ve kategori gürlük hedefinde kalır', () => {
    for (const r of sfx) {
      const name = `${r.key}#${r.variant}`;
      expect(r.peakDb, `${name} tepe`).toBeLessThanOrEqual(SFX_LEVEL.peakCeilingDb);
      expect(r.tailDb, `${name} kuyruk`).toBeLessThanOrEqual(SFX_LEVEL.maxTailDb);
      expect(Math.abs(r.dc), `${name} DC`).toBeLessThanOrEqual(SFX_LEVEL.maxDc);
      const target = SFX_LEVEL.targets[SFX_CATEGORY[r.id]];
      expect(Math.abs(r.momentaryLufs - target), `${name}: ${r.momentaryLufs.toFixed(1)} LUFS, hedef ${target}`).toBeLessThanOrEqual(
        SFX_LEVEL.toleranceLu,
      );
    }
  });

  it('sık efektlerin birkaç çeşidi var; çeşitler birbirinden duyulur biçimde farklı ama aynı karakterde', () => {
    const frequent = SFX_IDS.filter((id) => SFX_SETTINGS[id].variants > 1);
    expect(frequent).toEqual(expect.arrayContaining(['meleeHit', 'shootRanged', 'impact', 'unitSpawn', 'unitDeath', 'towerFast']));
    for (const id of frequent) {
      expect(SFX_SETTINGS[id].variants, id).toBe(MIX.frequentVariants);
      for (const age of [1, 3, 5]) {
        const v = [0, 1, 2].map((n) => renderSfx(id, age, SR, n));
        for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) {
          expect(correlation(v[a]!, v[b]!), `${id}/${age} çeşit ${a}~${b} aynı`).toBeLessThan(0.97);
        }
        const keyRows = sfx.filter((r) => r.id === id && r.key === `${id}/${age}`);
        const cents = keyRows.map((r) => r.centroidHz);
        expect(Math.max(...cents) / Math.min(...cents), `${id}/${age} çeşit tınısı çok farklı`).toBeLessThan(1.6);
      }
    }
  });
});

describe('Tını: müzik', () => {
  it('çağ döngüleri yumuşak: 4 kHz üstü pay ve ağırlık merkezi sınırlı', () => {
    expect(music).toHaveLength(5);
    for (const r of music) {
      expect(r.bands.high, `çağ ${r.age}`).toBeLessThanOrEqual(TARGET.musicMaxHf4k);
      expect(r.centroidHz, `çağ ${r.age}`).toBeLessThanOrEqual(TARGET.musicMaxCentroidHz);
    }
  });

  it('enstrümanlar: tiz vurmalılar yumuşadı, tonal enstrümanlarda tiz yok, ani başlangıç yalnız telli çekişte', () => {
    expect(instruments.length).toBeGreaterThan(20);
    for (const r of instruments) {
      expect(r.centroidHz, `${r.id}: ${r.centroidHz.toFixed(0)} Hz`).toBeLessThanOrEqual(TARGET.instrumentMaxCentroidHz);
      if (!PERCUSSIVE.has(r.id)) expect(r.bands.high, `${r.id} tiz payı`).toBeLessThanOrEqual(TARGET.tonalMaxHf4k);
      const minAttack = PLUCKED.has(r.id) ? PLUCK_MIN_ATTACK_SEC : TARGET.minAttackSec;
      expect(r.attackSec, `${r.id}: ${(r.attackSec * 1000).toFixed(1)} ms`).toBeGreaterThanOrEqual(minAttack);
    }
    for (const [id, [hf, centroid]] of Object.entries(BEFORE_INSTRUMENTS)) {
      const r = instruments.find((x) => x.id === id)!;
      expect(r, id).toBeDefined();
      expect(r.centroidHz, `${id}: merkez ${centroid} → ${r.centroidHz.toFixed(0)}`).toBeLessThanOrEqual(centroid * 0.75);
      expect(r.bands.high, `${id}: tiz payı ${hf} → ${r.bands.high.toFixed(3)}`).toBeLessThan(hf);
    }
  });
});

// ---- Çalış başına çeşitlilik ve eşzamanlı ses sınırı ------------------------

function engineSetup(random: () => number) {
  const ctx = new FakeContext();
  const engine = createAudioEngine({ contextFactory: () => ctx, timer: new FakeTimer(), random, minGapScale: 0 });
  engine.unlock();
  return { ctx, engine };
}

const hit = (i: number, side: 0 | 1 = 0): AudioEvent => ({ type: 'attack', side, attackerId: i, target: 999, damage: 5 });

function playSpaced(engine: AudioEngine, ctx: FakeContext, n: number): void {
  for (let i = 0; i < n; i++) {
    ctx.currentTime = i * 2;
    engine.handleEvents([hit(i)], { ages: [2, 2] });
  }
}

describe('Tını: çalıştan çalışa çeşitlilik', () => {
  it('sık efekt art arda aynı tamponu çalmaz; düzey ve perde çalış başına değişir', () => {
    const { ctx, engine } = engineSetup(createRng(42));
    playSpaced(engine, ctx, 9);
    const src = ctx.sources;
    expect(src).toHaveLength(9);
    for (let i = 1; i < src.length; i++) expect(src[i]!.buffer, `çalış ${i}`).not.toBe(src[i - 1]!.buffer);
    expect(new Set(src.map((s) => s.buffer)).size).toBe(MIX.frequentVariants);
    const gains = src.map((s) => s.gainNode!.gain.value);
    const rates = src.map((s) => s.playbackRate.value);
    expect(new Set(gains.map((g) => g.toFixed(4))).size).toBeGreaterThanOrEqual(6);
    expect(new Set(rates.map((r) => r.toFixed(4))).size).toBeGreaterThanOrEqual(6);
    const spreadDb = 20 * Math.log10(Math.max(...gains) / Math.min(...gains));
    expect(spreadDb).toBeGreaterThan(0.5);
    expect(spreadDb).toBeLessThanOrEqual(2 * MIX.gainJitterDb + 1e-9);
  });

  it('çağ geçişinde yalnız temel çeşit hemen üretilir; ek çeşitler sonraki karelere yayılır', () => {
    const { ctx, engine } = engineSetup(createRng(9));
    const sfxBuffers = () => ctx.buffers.filter((b) => b.sampleRate === SR).length;
    engine.setAge(2);
    const warm = sfxBuffers();
    expect(warm).toBeGreaterThan(0);
    // Ek çeşit hazır değilken temel çeşit çalar (kare içinde ek üretim yok).
    engine.handleEvents([hit(1)], { ages: [2, 2] });
    expect(sfxBuffers()).toBe(warm + 1);
    for (let frame = 0; frame < 40; frame++) engine.handleEvents([]);
    const extra = SFX_IDS.filter((id) => SFX_SETTINGS[id].variants > 1).length * (MIX.frequentVariants - 1);
    expect(sfxBuffers()).toBeLessThanOrEqual(warm + extra);
    expect(sfxBuffers()).toBeGreaterThanOrEqual(warm + extra - 1);
  });

  it('sık olmayan efektler (arayüz, yetenek, fanfar) tek tamponla çalar', () => {
    for (const id of ['uiClick', 'abilityStasis', 'ageUp', 'stingerWin'] as const) expect(SFX_SETTINGS[id].variants, id).toBe(1);
    const { ctx, engine } = engineSetup(createRng(7));
    engine.playUi('click');
    ctx.currentTime = 1;
    engine.playUi('click');
    expect(ctx.sources[0]!.buffer).toBe(ctx.sources[1]!.buffer);
  });
});

describe('Tını: eşzamanlı aynı ses sınırı ve kısma', () => {
  it('VoiceLimiter efekte özgü sınırı uygular (genel sınırı aşamaz)', () => {
    const lim = new VoiceLimiter(4, 24);
    const ids = [0, 1, 2].map((i) => lim.acquire('hit', 1, i * 0.01, 1, 3).id);
    const fourth = lim.acquire('hit', 1, 0.05, 1, 3);
    expect(fourth.evicted).toEqual([ids[0]]);
    expect(lim.countFor('hit')).toBe(3);
    for (let i = 0; i < 6; i++) lim.acquire('big', 1, 0.1, 1, 10);
    expect(lim.countFor('big')).toBe(4);
  });

  it(`sık savaş sesinden aynı anda en çok ${MIX.maxPerFrequentSfx} kopya; sonradan binenler kısılır`, () => {
    const { ctx, engine } = engineSetup(() => 0.5);
    for (let i = 0; i < 6; i++) engine.handleEvents([hit(i)], { ages: [1, 1] });
    const active = ctx.activeSources();
    expect(active).toHaveLength(MIX.maxPerFrequentSfx);
    const gains = ctx.sources.map((s) => s.gainNode!.gain.value);
    expect(gains[1]).toBeLessThan(gains[0]!);
    expect(gains[2]).toBeLessThan(gains[1]!);
    expect(gains[0]! / gains[2]!).toBeCloseTo(1 + MIX.sameVoiceDuck * (MIX.maxPerFrequentSfx - 1), 6);
    for (const id of SFX_IDS) expect(SFX_SETTINGS[id].maxVoices, id).toBeLessThanOrEqual(MIX.maxPerSfx);
  });

  it('büyük savaş: tüm savaş sesleri yağsa da toplam eşzamanlı ses sınırı aşılmaz', () => {
    const { ctx, engine } = engineSetup(createRng(3));
    const events: AudioEvent[] = [];
    for (let i = 0; i < 40; i++) {
      events.push(hit(i, (i % 2) as 0 | 1));
      events.push({ type: 'baseDamaged', side: (i % 2) as 0 | 1, amount: 10 });
    }
    for (let frame = 0; frame < 30; frame++) {
      ctx.currentTime = frame * 0.016;
      engine.handleEvents(
        [
          ...events.slice(0, 4),
          { type: 'unitSpawned', side: 0, id: 1000 + frame, unitType: 'x' },
          { type: 'unitDied', side: 1, id: 2000 + frame, unitType: 'x', bountyGold: 0, bountyXp: 0 },
        ],
        { ages: [(frame % 5) + 1, 3] },
      );
      expect(ctx.activeSources().length).toBeLessThanOrEqual(MIX.maxTotal);
    }
    expect(MIX.maxTotal).toBeLessThanOrEqual(16);
    expect(MIX.coalesceMax).toBeLessThanOrEqual(1.4);
  });
});
