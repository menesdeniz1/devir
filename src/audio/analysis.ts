import { MIX, MUSIC, SFX_SETTINGS } from './config';
import { Biquad, windowRms } from './dsp';
import { measureLoudness, spectrumStats, type BandShares } from './loudness';
import { composeSong } from './music/compose';
import { INSTRUMENT_IDS, renderInstrument, type InstrumentId } from './music/instruments';
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
 * - tiz payı: 4 kHz üstü enerji payı (bands.high) — "cızırtı/batma" göstergesi.
 * - ağırlık merkezi: güçle ağırlıklı ortalama frekans (Hz) — tınının parlaklığı.
 * - yükselme: ilk olayın %10 → %90 yükselme süresi (bkz. attackTime) — tıklama göstergesi.
 */

export const HF_CUTOFF_HZ = 12000;
export const TAIL_SEC = 0.01;
/** Yükselme ölçümü: ilk olayın tepesinin arandığı pencere (sn) ve başlangıç eşiği (genel tepeye oranla). */
export const ATTACK_WINDOW_SEC = 0.06;
export const ATTACK_ONSET_FRAC = 0.1;
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
  /** Kapılamasız en yüksek 400 ms blok K-ağırlıklı gürlüğü (LUFS) — kısa efektler. */
  momentaryLufs: number;
  /** Kapılı entegre gürlük (LUFS) — müzik. */
  integratedLufs: number;
  /** < 250 Hz, 250 Hz–4 kHz, > 4 kHz enerji payları. */
  bands: BandShares;
  /** Spektral ağırlık merkezi (Hz). */
  centroidHz: number;
  /** İlk olayın %10 → %90 yükselme süresi (sn). */
  attackSec: number;
  finite: boolean;
}

/**
 * İlk olayın yükselme süresi (%10 → %90, sn), örnek genliği |x| üzerinden:
 * 1) başlangıç: |x| ilk kez genel tepenin %10'una ulaştığı örnek;
 * 2) yerel tepe L: başlangıçtan sonraki 60 ms içindeki en büyük |x| (ilk olayın tepesi);
 * 3) %10 ve %90 anları: |x|'in ilk kez 0,1·L ve 0,9·L'ye ulaştığı örnekler.
 * Tepe tutma yaklaşımıdır: bas seslerde (dalga yarım periyodu > yükselme) sonuç en az çeyrek periyot çıkar;
 * tıklama (anlık başlayan geniş bantlı ses) ise < 1 ms ölçülür. Sessiz tampon 0 verir.
 */
export function attackTime(data: Float32Array, sr: number): number {
  let g = 0;
  for (const v of data) if (Math.abs(v) > g) g = Math.abs(v);
  if (!(g > 1e-9)) return 0;
  let start = 0;
  while (start < data.length && Math.abs(data[start]!) < ATTACK_ONSET_FRAC * g) start++;
  const end = Math.min(data.length, start + Math.round(ATTACK_WINDOW_SEC * sr));
  let local = 0;
  for (let i = start; i < end; i++) local = Math.max(local, Math.abs(data[i]!));
  let t10 = 0;
  while (t10 < data.length && Math.abs(data[t10]!) < 0.1 * local) t10++;
  let t90 = t10;
  while (t90 < data.length && Math.abs(data[t90]!) < 0.9 * local) t90++;
  return (t90 - t10) / sr;
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

  const loud = measureLoudness(data, sr, gain);
  const spec = spectrumStats(data, sr);
  return {
    peakDb: toDb(peak * gain),
    rmsDb: toDb(Math.sqrt(sq / n) * gain),
    windowRmsDb: toDb(windowRms(data, sr) * gain),
    dc: (sum / n) * gain,
    durSec: data.length / sr,
    tailDb: toDb(tail * gain),
    hfShare,
    momentaryLufs: loud.momentaryMaxLufs,
    integratedLufs: loud.integratedLufs,
    bands: { low: spec.low, mid: spec.mid, high: spec.high },
    centroidHz: spec.centroidHz,
    attackSec: attackTime(data, sr),
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

export interface InstrumentRow extends LevelStats {
  id: InstrumentId;
  /** Enstrümanın kullanıldığı ilk çağ. */
  age: number;
  /** Ölçülen nota sayısı. */
  notes: number;
}

/**
 * Müzik enstrümanları: her enstrümanın şarkılarda gerçekten çaldığı tüm (perde, uzunluk) notaları üretilip
 * art arda eklenir ve tek tampon olarak ölçülür (nota şiddeti × parça kazancıyla). Yükselme süresi notaların en kısasıdır.
 */
export function analyzeInstruments(sr: number = MUSIC.sampleRate): InstrumentRow[] {
  const used = new Map<InstrumentId, { age: number; notes: Map<string, { midi: number; durSec: number; gain: number }> }>();
  for (let age = 1; age <= 5; age++) {
    const def = songDefForAge(age);
    if (!def) continue;
    const song = composeSong(def);
    const stepSec = stepDurationSec(song.bpm, 0);
    for (const step of song.byStep) {
      for (const n of step) {
        let u = used.get(n.instrument);
        if (!u) used.set(n.instrument, (u = { age, notes: new Map() }));
        const key = `${n.midi}|${n.durSteps}`;
        const prev = u.notes.get(key);
        if (!prev || prev.gain < n.gain) u.notes.set(key, { midi: n.midi, durSec: n.durSteps * stepSec, gain: n.gain });
      }
    }
  }
  const rows: InstrumentRow[] = [];
  for (const id of INSTRUMENT_IDS) {
    const u = used.get(id);
    if (!u) continue;
    const bufs = [...u.notes.values()].map((n) => {
      const b = renderInstrument(id, sr, n.midi, n.durSec);
      for (let i = 0; i < b.length; i++) b[i]! *= n.gain;
      return b;
    });
    const all = new Float32Array(bufs.reduce((a, b) => a + b.length, 0));
    let off = 0;
    for (const b of bufs) {
      all.set(b, off);
      off += b.length;
    }
    const st = analyzeSamples(all, sr);
    rows.push({ id, age: u.age, notes: bufs.length, ...st, attackSec: Math.min(...bufs.map((b) => attackTime(b, sr))) });
  }
  return rows;
}

// ---- Tını özeti (önce → sonra karşılaştırması) ------------------------------

/** Tını ölçütlerinin düz özeti (JSON'a yazılıp sonraki ölçümle karşılaştırılabilir). */
export interface TimbreRow {
  key: string;
  /** 4 kHz üstü enerji payı (0..1). */
  hf4k: number;
  centroidHz: number;
  attackMs: number;
  peakDb: number;
  /** Efekt: kısa süreli en yüksek gürlük; müzik: entegre gürlük (LUFS). */
  lufs: number;
}

export function timbreOf(key: string, st: LevelStats, loudness: 'momentary' | 'integrated'): TimbreRow {
  return {
    key,
    hf4k: st.bands.high,
    centroidHz: st.centroidHz,
    attackMs: st.attackSec * 1000,
    peakDb: st.peakDb,
    lufs: loudness === 'momentary' ? st.momentaryLufs : st.integratedLufs,
  };
}

/** Tüm efektler (çıkış düzeyinde), çağ döngüleri ve enstrümanlar için tını özeti. */
export function timbreReport(): { sfx: TimbreRow[]; music: TimbreRow[]; instruments: TimbreRow[] } {
  return {
    sfx: analyzeAllSfx().map((r) => timbreOf(`${r.id}/${r.age}`, r, 'momentary')),
    music: analyzeAllMusic().map((r) => timbreOf(`müzik/${r.age}`, r, 'integrated')),
    instruments: analyzeInstruments().map((r) => timbreOf(`${r.id}/${r.age}`, r, 'momentary')),
  };
}

/** Önce → sonra tablosu (anahtar eşleşmesiyle). `after` sırası korunur; `before`da olmayan satırlar "—" gösterir. */
export function formatTimbreComparison(before: readonly TimbreRow[], after: readonly TimbreRow[]): string {
  const prev = new Map(before.map((r) => [r.key, r]));
  const arrow = (a: number | undefined, b: number, fmt: (x: number) => string, w: number) =>
    `${(a === undefined ? '—' : fmt(a)).padStart(w)}→${fmt(b).padEnd(w)}`;
  const pc = (x: number) => (x * 100).toFixed(1);
  const hz = (x: number) => x.toFixed(0);
  const ms = (x: number) => x.toFixed(1);
  const lines = ['ses                     >4kHz%         merkez Hz       yükselme ms    tepe dBFS       LUFS'];
  for (const r of after) {
    const b = prev.get(r.key);
    lines.push(
      `${r.key.padEnd(22)}  ${arrow(b?.hf4k, r.hf4k, pc, 5)}  ${arrow(b?.centroidHz, r.centroidHz, hz, 5)}  ${arrow(b?.attackMs, r.attackMs, ms, 5)}  ${arrow(b?.peakDb, r.peakDb, f1, 5)}  ${arrow(b?.lufs, r.lufs, f1, 5)}`,
    );
  }
  return lines.join('\n');
}

const f1 = (x: number): string => (x <= FLOOR_DB ? '-inf' : x.toFixed(1));
const pct = (x: number): string => (x * 100).toFixed(0).padStart(3);

export function formatSfxTable(rows: readonly SfxRow[]): string {
  const lines = ['efekt/çağ            tepe   rms  pencere  LUFS(an)  süre  kuyruk  hf%  düşük/orta/tiz%'];
  for (const r of rows) {
    lines.push(
      `${r.id.padEnd(20)}${r.age} ${f1(r.peakDb).padStart(6)} ${f1(r.rmsDb).padStart(5)} ${f1(r.windowRmsDb).padStart(7)} ${f1(r.momentaryLufs).padStart(9)} ${r.durSec.toFixed(2).padStart(5)} ${f1(r.tailDb).padStart(7)} ${(r.hfShare * 100).toFixed(1).padStart(4)}  ${pct(r.bands.low)}/${pct(r.bands.mid)}/${pct(r.bands.high)}`,
    );
  }
  return lines.join('\n');
}

export function formatMusicTable(rows: readonly MusicRow[]): string {
  const lines = ['müzik/çağ    tepe   rms  LUFS(ent)  LUFS(an)  süre  düşük/orta/tiz%'];
  for (const r of rows) {
    lines.push(
      `çağ ${r.age}    ${f1(r.peakDb).padStart(6)} ${f1(r.rmsDb).padStart(5)} ${f1(r.integratedLufs).padStart(9)} ${f1(r.momentaryLufs).padStart(9)} ${r.durSec.toFixed(1).padStart(5)}  ${pct(r.bands.low)}/${pct(r.bands.mid)}/${pct(r.bands.high)}`,
    );
  }
  return lines.join('\n');
}
