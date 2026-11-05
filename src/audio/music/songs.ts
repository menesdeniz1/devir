import type { InstrumentId } from './instruments';
import type { ScaleName } from './theory';

/**
 * Çağ başına müzik tanımları (veri). Tamamı özgündür; tanınmış bir eserin ezgisi kullanılmaz.
 * Her şarkı 32 ölçülük (4 bölüm × 8 ölçü) bir döngüdür; süre = ölçü × 4 vuruş × 60 / tempo (60–90 sn).
 *
 * Desen dizgeleri bir ölçüdür (16 adım = 4 vuruş × 4 onaltılık): 'x' güçlü, 'o' zayıf vuruş, '.' sessiz.
 * Ezgi motifleri iki ölçüldür (32 adım): [adım, dizi derecesi, uzunluk (adım)].
 */

export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;
export const SECTION_BARS = 8;
export const SECTIONS = 4;

export type TrackKind = 'rhythm' | 'bass' | 'chord' | 'arp' | 'melody' | 'drone';
export type Motif = readonly (readonly [step: number, degree: number, len: number])[];
export type SectionMask = readonly [boolean, boolean, boolean, boolean];

export interface TrackDef {
  instrument: InstrumentId;
  kind: TrackKind;
  /** Karışımdaki göreli düzey. */
  gain: number;
  /** Kök notaya göre oktav kayması. */
  octave?: number;
  /** Vurmalı parçalar için sabit MIDI perdesi. */
  midi?: number;
  /** Ölçü desenleri (ölçü sırasıyla döngü). */
  patterns?: readonly string[];
  /** Her bölümün son ölçüsünde çalınan geçiş (fill) deseni. */
  fill?: string;
  /** Akor/drone notalarının uzunluğu (adım). */
  hold?: number;
  /** Bu parçanın çaldığı bölümler. */
  sections: SectionMask;
  /** Yalnızca gerilim bu değere ulaşınca çalar (0..1). */
  minTension?: number;
}

export interface SongDef {
  age: number;
  id: string;
  bpm: number;
  bars: number;
  /** Kök MIDI notası. */
  root: number;
  scale: ScaleName;
  /** Bir bölümün 8 ölçüsü için akor kökü dereceleri. */
  progression: readonly number[];
  motifA: Motif;
  motifB: Motif;
  tracks: readonly TrackDef[];
}

const ALL: SectionMask = [true, true, true, true];
const NOT_FIRST: SectionMask = [false, true, true, true];
const LATE: SectionMask = [false, false, true, true];

export const SONGS: readonly SongDef[] = [
  // 1. İlkel Çağ: çerçeve davul, kemik flüt, drone. Minör pentatonik, D.
  {
    age: 1,
    id: 'primitive',
    bpm: 92,
    bars: 32,
    root: 50,
    scale: 'minorPent',
    progression: [0, 0, 3, 2, 0, 0, 4, 2],
    motifA: [[0, 4, 4], [4, 3, 2], [6, 2, 2], [8, 3, 6], [16, 2, 4], [20, 0, 2], [22, 2, 2], [24, 3, 8]],
    motifB: [[0, 5, 4], [4, 4, 2], [6, 3, 2], [8, 4, 4], [12, 5, 4], [16, 6, 4], [20, 5, 2], [22, 4, 2], [24, 3, 4], [28, 2, 4]],
    tracks: [
      { instrument: 'frameDrum', kind: 'rhythm', midi: 38, gain: 0.9, sections: ALL, patterns: ['x..o..x.x..o....', 'x..o..x.x.o.x...'], fill: 'x.x.xxx.x.x.xxxx' },
      { instrument: 'skinDrum', kind: 'rhythm', midi: 50, gain: 0.55, sections: NOT_FIRST, patterns: ['..o...o...o...o.', '..o...o.o.o...oo'] },
      { instrument: 'stickClick', kind: 'rhythm', midi: 60, gain: 0.35, sections: LATE, patterns: ['..x...x...x...x.'] },
      { instrument: 'shaker', kind: 'rhythm', midi: 60, gain: 0.3, sections: ALL, patterns: ['x.x.x.x.x.x.x.x.'], minTension: 0.5 },
      { instrument: 'droneHum', kind: 'drone', octave: -1, hold: 32, gain: 0.35, sections: ALL },
      { instrument: 'boneFlute', kind: 'melody', octave: 1, gain: 0.6, sections: ALL },
    ],
  },
  // 2. Antik Çağ: lir, bronz zil, el davulu. Dor dizisi, E.
  {
    age: 2,
    id: 'ancient',
    bpm: 100,
    bars: 32,
    root: 52,
    scale: 'dorian',
    progression: [0, 3, 5, 4, 0, 3, 6, 4],
    motifA: [[0, 4, 4], [4, 5, 2], [6, 4, 2], [8, 2, 4], [12, 3, 4], [16, 4, 4], [20, 2, 2], [22, 1, 2], [24, 0, 8]],
    motifB: [[0, 7, 6], [6, 6, 2], [8, 5, 4], [12, 4, 4], [16, 5, 2], [18, 4, 2], [20, 3, 4], [24, 2, 4], [28, 4, 4]],
    tracks: [
      { instrument: 'handDrum', kind: 'rhythm', midi: 45, gain: 0.8, sections: ALL, patterns: ['x...o...x...o...', 'x...o...x.o.o...'], fill: 'x.x.o.x.xxx.xxxx' },
      { instrument: 'handDrum', kind: 'rhythm', midi: 57, gain: 0.4, sections: NOT_FIRST, patterns: ['..o...o...o...o.'] },
      { instrument: 'shaker', kind: 'rhythm', midi: 60, gain: 0.3, sections: ALL, patterns: ['x.x.x.x.x.x.x.x.'], minTension: 0.5 },
      { instrument: 'lyre', kind: 'arp', octave: 0, gain: 0.5, sections: ALL, patterns: ['x.x.x.x.x.x.x.x.'] },
      { instrument: 'bronzeBell', kind: 'arp', octave: 1, gain: 0.35, sections: LATE, patterns: ['x...............'] },
      { instrument: 'softPad', kind: 'chord', hold: 16, gain: 0.35, sections: NOT_FIRST },
      { instrument: 'lute', kind: 'bass', octave: -1, gain: 0.6, sections: NOT_FIRST, patterns: ['x.......o.......'] },
      { instrument: 'aulos', kind: 'melody', octave: 1, gain: 0.55, sections: ALL },
    ],
  },
  // 3. Orta Çağ: org, yaylı, lavta, tabor. Eol dizisi, A.
  {
    age: 3,
    id: 'medieval',
    bpm: 104,
    bars: 32,
    root: 57,
    scale: 'aeolian',
    progression: [0, 5, 2, 6, 0, 5, 3, 4],
    motifA: [[0, 0, 4], [4, 2, 4], [8, 4, 4], [12, 2, 2], [14, 3, 2], [16, 2, 6], [22, 1, 2], [24, 0, 8]],
    motifB: [[0, 4, 4], [4, 5, 2], [6, 4, 2], [8, 3, 4], [12, 2, 4], [16, 3, 4], [20, 4, 4], [24, 2, 2], [26, 1, 2], [28, 0, 4]],
    tracks: [
      { instrument: 'taborDrum', kind: 'rhythm', midi: 43, gain: 0.8, sections: ALL, patterns: ['x...o...x..o.o..', 'x..o....x...o.x.'], fill: 'x.xxo.xxx.xxo.xx' },
      { instrument: 'taborDrum', kind: 'rhythm', midi: 55, gain: 0.3, sections: LATE, patterns: ['o.o.o.o.o.o.o.o.'] },
      { instrument: 'taborDrum', kind: 'rhythm', midi: 62, gain: 0.25, sections: ALL, patterns: ['x.x.x.x.x.x.x.x.'], minTension: 0.5 },
      { instrument: 'organ', kind: 'chord', hold: 16, gain: 0.3, sections: ALL },
      { instrument: 'strings', kind: 'chord', hold: 16, gain: 0.4, sections: NOT_FIRST },
      { instrument: 'bowedBass', kind: 'bass', octave: -1, gain: 0.6, sections: NOT_FIRST, patterns: ['x...o...x...o...'] },
      { instrument: 'lute', kind: 'arp', octave: 1, gain: 0.4, sections: LATE, patterns: ['x.x.x.x.x.x.x.x.'] },
      { instrument: 'lute', kind: 'melody', octave: 1, gain: 0.6, sections: [true, true, false, false] },
      { instrument: 'strings', kind: 'melody', octave: 1, gain: 0.5, sections: [false, false, true, true] },
    ],
  },
  // 4. Endüstri Çağı: bakır nefesliler, mekanik ritim, buhar. Armonik minör, C.
  {
    age: 4,
    id: 'industrial',
    bpm: 112,
    bars: 32,
    root: 48,
    scale: 'harmonicMinor',
    progression: [0, 5, 3, 4, 0, 5, 3, 4],
    motifA: [[0, 0, 3], [3, 0, 1], [4, 2, 4], [8, 4, 3], [11, 3, 1], [12, 2, 4], [16, 0, 2], [18, 2, 2], [20, 3, 4], [24, 4, 8]],
    motifB: [[0, 4, 4], [4, 5, 4], [8, 6, 4], [12, 5, 2], [14, 4, 2], [16, 3, 4], [20, 2, 4], [24, 0, 8]],
    tracks: [
      { instrument: 'kickMech', kind: 'rhythm', midi: 36, gain: 0.9, sections: ALL, patterns: ['x...x...x...x...'], fill: 'x...x...x.x.xxxx' },
      { instrument: 'clank', kind: 'rhythm', midi: 60, gain: 0.4, sections: NOT_FIRST, patterns: ['..o...x...o...x.'] },
      { instrument: 'steamHiss', kind: 'rhythm', midi: 60, gain: 0.25, sections: LATE, patterns: ['..x...x...x...x.'] },
      { instrument: 'steamHiss', kind: 'rhythm', midi: 60, gain: 0.2, sections: ALL, patterns: ['x.x.x.x.x.x.x.x.'], minTension: 0.5 },
      { instrument: 'pistonBass', kind: 'bass', octave: -1, gain: 0.55, sections: ALL, patterns: ['x.xxx.xxx.xxx.x.'] },
      { instrument: 'pistonArp', kind: 'arp', octave: 1, gain: 0.3, sections: LATE, patterns: ['x.x.x.x.x.x.x.x.'] },
      { instrument: 'brass', kind: 'chord', hold: 16, gain: 0.3, sections: NOT_FIRST },
      { instrument: 'brass', kind: 'melody', octave: 1, gain: 0.55, sections: ALL },
    ],
  },
  // 5. Gelecek Çağı: sentezleyici, elektronik davul. Lidyen dizisi, A.
  {
    age: 5,
    id: 'future',
    bpm: 120,
    bars: 32,
    root: 57,
    scale: 'lydian',
    progression: [0, 1, 0, 4, 0, 1, 5, 4],
    motifA: [[0, 4, 4], [4, 6, 4], [8, 7, 6], [14, 6, 2], [16, 4, 4], [20, 2, 2], [22, 4, 2], [24, 2, 8]],
    motifB: [[0, 7, 2], [2, 8, 2], [4, 9, 4], [8, 7, 4], [12, 6, 4], [16, 4, 2], [18, 6, 2], [20, 7, 4], [24, 4, 4], [28, 2, 4]],
    tracks: [
      { instrument: 'eKick', kind: 'rhythm', midi: 36, gain: 0.6, sections: ALL, patterns: ['x...x...x...x...', 'x...x...x..xx...'] },
      { instrument: 'eSnare', kind: 'rhythm', midi: 50, gain: 0.6, sections: NOT_FIRST, patterns: ['....x.......x...'] },
      { instrument: 'eHat', kind: 'rhythm', midi: 60, gain: 0.35, sections: NOT_FIRST, patterns: ['..x...x...x...x.', 'x.x.x.x.x.x.x.x.'] },
      { instrument: 'eHat', kind: 'rhythm', midi: 60, gain: 0.2, sections: ALL, patterns: ['ooooooooooooooo.'], minTension: 0.6 },
      { instrument: 'subBass', kind: 'bass', octave: -2, gain: 0.35, sections: ALL, patterns: ['x.x...x.x.x...x.', 'x.x.x.x.x.x.x.x.'] },
      { instrument: 'synthPad', kind: 'chord', hold: 16, gain: 0.35, sections: ALL },
      { instrument: 'synthArp', kind: 'arp', octave: 1, gain: 0.3, sections: NOT_FIRST, patterns: ['x.xxx.xxx.xxx.xx'] },
      { instrument: 'synthLead', kind: 'melody', octave: 1, gain: 0.5, sections: ALL },
    ],
  },
];

/** Çağ -> şarkı tanımı (1..5). */
export function songDefForAge(age: number): SongDef | undefined {
  return SONGS.find((s) => s.age === age);
}
