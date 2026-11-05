import { MIX, MUSIC, SFX_SETTINGS } from './config';
import { Biquad, windowRms } from './dsp';
import { composeSong } from './music/compose';
import { renderInstrument } from './music/instruments';
import { planSteps, stepDurationSec } from './music/sequencer';
import { songDefForAge } from './music/songs';
import { SFX_IDS, SFX_SAMPLE_RATE, renderSfx, type SfxId } from './sfx';
import { volumeToGain } from './volume';

/**
 * Çevrimdışı ses analizi (saf; ses bağlamı gerekmez). Efekt ve müzik tamponlarının düzeylerini dBFS olarak ölçer;
 * kazanç ayarları (config.ts) ve testler (tests/audio-levels.test.ts) buna dayanır.
 *
 * Tanımlar:
 * - tepe: en büyük |örnek|.
 * - rms: tüm tamponun RMS'i.
 * - pencere RMS: 400 ms'lik kayan pencerenin en yüksek RMS'i (tampon sonu sıfırla doldurulmuş sayılır).
 * - dc: örnek ortalaması (doğrusal).
 * - kuyruk: son 10 ms'deki en büyük |örnek| (tıklama göstergesi).
 * - hf: 12 kHz üstü enerjinin toplam enerjiye oranı (örnek hızı < 24 kHz ise ölçülemez, 0).
 */

export const HF_CUTOFF_HZ = 12000;
export const TAIL_SEC = 0.01;
const FLOOR_DB = -180;

export function toDb(linear: number): number {
  return linear > 1e-9 ? 20 * Math.log10(linear) : FLOOR_DB;
}

export interface LevelStats {
  peakDb: number;
  rmsDb: number;
  windowRmsDb: number;
  /** Doğrusal ortalama (işaretli). */
  dc: number;
  durSec: number;
  /** Son 10 ms'in en büyük genliği (dBFS). */
  tailDb: number;
  /** 12 kHz üstü enerji payı (0..1). */
  hfShare: number;
  finite: boolean;
}

/** Bir tamponu `gain` ile çarpılmış gibi ölçer (tamponu değiştirmez). */
export function analyzeSamples(data: Float32Array, sr: number, gain = 1): LevelStats {
  let peak = 0;
  let sum = 0;
  let sq = 0;
  let finite = true;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (!Number.isFinite(v)) {
      finite = false;
      continue;
    }
    sum += v;
    sq += v * v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const n = Math.max(1, data.length);
  const tailStart = Math.max(0, data.length - Math.round(TAIL_SEC * sr));
  let tail = 0;
  for (let i = tailStart; i < data.length; i++) tail = Math.max(tail, Math.abs(data[i]!));

  let hfShare = 0;
  if (HF_CUTOFF_HZ < sr / 2 && sq > 0) {
    const a = new Biquad(sr, 'hp', HF_CUTOFF_HZ, 0.707);
    const b = new Biquad(sr, 'hp', HF_CUTOFF_HZ, 0.707);
    let hf = 0;
    for (let i = 0; i < data.length; i++) {
      const y = b.process(a.process(data[i]!));
      hf += y * y;
    }
    hfShare = Math.min(1, hf / sq);
  }

  return {
    peakDb: toDb(peak * gain),
    rmsDb: toDb(Math.sqrt(sq / n) * gain),
    windowRmsDb: toDb(windowRms(data, sr) * gain),
    dc: (sum / n) * gain,
    durSec: data.length / sr,
    tailDb: toDb(tail * gain),
    hfShare,
    finite,
  };
}

// ---- Çıkış kazancı ----------------------------------------------------------

/** Efektin çıkıştaki toplam kazancı: efekt ayarı × taraf × ana çıkış (kanal ses düzeyi ayrıca `volume` ile). */
export function sfxMixGain(id: SfxId, own = true, sfxVolume = 100): number {
  return SFX_SETTINGS[id].gain * (own ? MIX.ownGain : MIX.enemyGain) * MIX.masterGain * volumeToGain(sfxVolume);
}

/** Müziğin çıkıştaki toplam kazancı: çağ düzeltmesi × ana çıkış × kanal ses düzeyi. */
export function musicMixGain(age: number, musicVolume = 100): number {
  return MUSIC.levelTrim[Math.min(5, Math.max(1, age)) - 1]! * MIX.masterGain * volumeToGain(musicVolume);
}

// ---- Çevrimdışı müzik karışımı ----------------------------------------------

/**
 * Bir çağın müzik döngüsünü, gerçek besteleme + sıralayıcı + enstrüman hattıyla tek tamponda karıştırır.
 * Kazançlar: nota şiddeti × parça kazancı (çağ düzeltmesi ve kanal düzeyi dahil değil; bkz. musicMixGain).
 * Nota kuyrukları döngü başına sarılır (kesintisiz döngü).
 */
export function mixMusicLoop(age: number, tension = 0, sr: number = MUSIC.sampleRate): Float32Array {
  const def = songDefForAge(age);
  if (!def) throw new Error(`müzik tanımı yok: çağ ${age}`);
  const song = composeSong(def);
  const stepSec = stepDurationSec(song.bpm, tension);
  const baseStepSec = stepDurationSec(song.bpm, 0);
  const loopSec = song.totalSteps * stepSec;
  const out = new Float32Array(Math.round(loopSec * sr));
  const cache = new Map<string, Float32Array>();
  // Sıralayıcı: tüm döngüyü tek ileri bakış penceresinde planla.
  const { planned } = planSteps({ step: 0, time: 0, loop: 0 }, 0, loopSec - stepSec / 2, stepSec, song.totalSteps);
  for (const p of planned) {
    const start = Math.round(p.time * sr);
    for (const note of song.byStep[p.step]!) {
      if (note.minTension > tension) continue;
      const key = `${note.instrument}|${note.midi}|${note.durSteps}`;
      let buf = cache.get(key);
      if (!buf) {
        buf = renderInstrument(note.instrument, sr, note.midi, note.durSteps * baseStepSec);
        cache.set(key, buf);
      }
      for (let i = 0; i < buf.length; i++) out[(start + i) % out.length]! += buf[i]! * note.gain;
    }
  }
  return out;
}

// ---- Tablolar ---------------------------------------------------------------

export interface SfxRow extends LevelStats {
  id: SfxId;
  age: number;
}

export interface MusicRow extends LevelStats {
  age: number;
}

/** Her efekt × çağ için çıkış düzeyleri (kanal ses düzeyi `sfxVolume`, varsayılan tam). */
export function analyzeAllSfx(own = true, sfxVolume = 100): SfxRow[] {
  const rows: SfxRow[] = [];
  for (const id of SFX_IDS) {
    for (let age = 1; age <= 5; age++) {
      rows.push({ id, age, ...analyzeSamples(renderSfx(id, age), SFX_SAMPLE_RATE, sfxMixGain(id, own, sfxVolume)) });
    }
  }
  return rows;
}

/** Her çağın müzik döngüsü için çıkış düzeyleri (kanal ses düzeyi `musicVolume`, varsayılan tam). */
export function analyzeAllMusic(musicVolume = 100, tension = 0): MusicRow[] {
  const rows: MusicRow[] = [];
  for (let age = 1; age <= 5; age++) {
    rows.push({ age, ...analyzeSamples(mixMusicLoop(age, tension), MUSIC.sampleRate, musicMixGain(age, musicVolume)) });
  }
  return rows;
}

const f1 = (x: number): string => (x <= FLOOR_DB ? '-inf' : x.toFixed(1));

export function formatSfxTable(rows: readonly SfxRow[]): string {
  const lines = ['efekt/çağ            tepe   rms  pencere   dc(dB)  süre  kuyruk  hf%'];
  for (const r of rows) {
    lines.push(
      `${r.id.padEnd(20)}${r.age} ${f1(r.peakDb).padStart(6)} ${f1(r.rmsDb).padStart(5)} ${f1(r.windowRmsDb).padStart(7)} ${f1(toDb(Math.abs(r.dc))).padStart(8)} ${r.durSec.toFixed(2).padStart(5)} ${f1(r.tailDb).padStart(7)} ${(r.hfShare * 100).toFixed(1).padStart(4)}`,
    );
  }
  return lines.join('\n');
}

export function formatMusicTable(rows: readonly MusicRow[]): string {
  const lines = ['müzik/çağ    tepe   rms  pencere   dc(dB)  süre  kuyruk'];
  for (const r of rows) {
    lines.push(
      `çağ ${r.age}    ${f1(r.peakDb).padStart(6)} ${f1(r.rmsDb).padStart(5)} ${f1(r.windowRmsDb).padStart(7)} ${f1(toDb(Math.abs(r.dc))).padStart(8)} ${r.durSec.toFixed(1).padStart(5)} ${f1(r.tailDb).padStart(7)}`,
    );
  }
  return lines.join('\n');
}
