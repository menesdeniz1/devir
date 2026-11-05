import type { InstrumentId } from './instruments';
import { SECTION_BARS, SECTIONS, STEPS_PER_BAR, type Motif, type SongDef, type TrackDef } from './songs';
import { SCALES, degreeToMidi } from './theory';

/** Bir nota olayı: hangi enstrüman, hangi perde, kaç adım, ne kadar yüksek sesle. */
export interface NoteEvent {
  instrument: InstrumentId;
  midi: number;
  durSteps: number;
  /** vuruş şiddeti × parça kazancı */
  gain: number;
  /** Bu gerilim eşiğinin altında çalınmaz. */
  minTension: number;
}

export interface Song {
  age: number;
  id: string;
  bpm: number;
  totalSteps: number;
  /** Adım başına çalan notalar (uzunluk = totalSteps). */
  byStep: NoteEvent[][];
}

const SOFT = 0.55;
/** Karşılık cümlesinde ezginin kaydırıldığı derece sayısı. */
const ANSWER_SHIFT = 2;
/** Cümle sonunda kararın başladığı adım (motifin son 8 adımı). */
const CADENCE_STEP = 24;

function shifted(m: Motif, by: number): Motif {
  return m.map(([s, d, l]) => [s, d + by, l] as const);
}

/** Motifin son bölümü kök notaya çözülen bir kapanışla değiştirilir. */
function cadence(m: Motif): Motif {
  return [...m.filter(([s]) => s < CADENCE_STEP), [CADENCE_STEP, 0, 8] as const];
}

/** Üst oktav: motifin son notaları bir oktav (dizi uzunluğu kadar derece) yükselir. */
function octaveUp(m: Motif, scaleLen: number): Motif {
  return m.map(([s, d, l]) => [s, s >= CADENCE_STEP - 8 ? d + scaleLen : d, l] as const);
}

/** Bölüm başına dört iki-ölçülük cümle. */
function phrasesFor(section: number, def: SongDef, scaleLen: number): Motif[] {
  const a = def.motifA;
  const b = def.motifB;
  const end = cadence(a);
  switch (section) {
    case 0:
      return [a, a, shifted(a, ANSWER_SHIFT), end];
    case 1:
      return [a, octaveUp(a, scaleLen), b, end];
    case 2:
      return [b, b, shifted(b, ANSWER_SHIFT), end];
    default:
      return [b, shifted(a, ANSWER_SHIFT), octaveUp(a, scaleLen), end];
  }
}

function chordTones(def: SongDef, degree: number, count: number): number[] {
  const scale = SCALES[def.scale];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(degreeToMidi(scale, def.root, degree + i * 2));
  return out;
}

/** Şarkı tanımından adım adım nota olaylarını üretir (saf, tohumsuz, kesin). */
export function composeSong(def: SongDef): Song {
  const totalSteps = def.bars * STEPS_PER_BAR;
  const byStep: NoteEvent[][] = Array.from({ length: totalSteps }, () => []);
  const scale = SCALES[def.scale];

  const push = (step: number, t: TrackDef, midi: number, durSteps: number, vel: number): void => {
    if (step < 0 || step >= totalSteps) return;
    byStep[step]!.push({ instrument: t.instrument, midi, durSteps, gain: vel * t.gain, minTension: t.minTension ?? 0 });
  };

  for (let bar = 0; bar < def.bars; bar++) {
    const section = Math.floor(bar / SECTION_BARS) % SECTIONS;
    const barInSection = bar % SECTION_BARS;
    const chordDegree = def.progression[barInSection % def.progression.length]!;
    const barStart = bar * STEPS_PER_BAR;

    for (const t of def.tracks) {
      if (!t.sections[section]) continue;
      const octave = (t.octave ?? 0) * 12;
      const pattern =
        t.fill && barInSection === SECTION_BARS - 1 ? t.fill : t.patterns?.[bar % (t.patterns?.length ?? 1)];

      switch (t.kind) {
        case 'rhythm':
          forEachHit(pattern, (i, vel) => push(barStart + i, t, t.midi ?? 60, 2, vel));
          break;
        case 'bass': {
          const root = degreeToMidi(scale, def.root, chordDegree) + octave;
          const fifth = degreeToMidi(scale, def.root, chordDegree + 4) + octave;
          forEachHit(pattern, (i, vel) => push(barStart + i, t, vel === 1 ? root : fifth, t.hold ?? 3, vel === 1 ? 1 : 0.75));
          break;
        }
        case 'chord': {
          const hold = t.hold ?? STEPS_PER_BAR;
          for (let s = 0; s < STEPS_PER_BAR; s += hold) {
            for (const m of chordTones(def, chordDegree, 3)) push(barStart + s, t, m + octave, hold, 1);
          }
          break;
        }
        case 'arp': {
          const tones = [...chordTones(def, chordDegree, 3), degreeToMidi(scale, def.root, chordDegree + 7)];
          let n = 0;
          forEachHit(pattern, (i, vel) => {
            push(barStart + i, t, tones[n % tones.length]! + octave, 2, vel);
            n++;
          });
          break;
        }
        case 'drone': {
          const hold = t.hold ?? STEPS_PER_BAR;
          if ((bar * STEPS_PER_BAR) % hold === 0) {
            push(barStart, t, degreeToMidi(scale, def.root, 0) + octave, hold, 1);
            push(barStart, t, degreeToMidi(scale, def.root, 4) + octave, hold, 0.7);
          }
          break;
        }
        case 'melody': {
          if (barInSection % 2 !== 0) break;
          const phrase = phrasesFor(section, def, scale.length)[barInSection / 2]!;
          for (const [s, d, l] of phrase) push(barStart + s, t, degreeToMidi(scale, def.root, d) + octave, l, 1);
          break;
        }
      }
    }
  }

  return { age: def.age, id: def.id, bpm: def.bpm, totalSteps, byStep };
}

function forEachHit(pattern: string | undefined, fn: (index: number, velocity: number) => void): void {
  if (!pattern) return;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === 'x') fn(i, 1);
    else if (c === 'o') fn(i, SOFT);
  }
}
