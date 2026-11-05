/** Müzik kuramı yardımcıları: dizi (gam) tanımları ve derece -> MIDI dönüşümü. */

export const SCALES = {
  minorPent: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;

/** Dizi derecesini (negatif ve oktav taşan değerler dahil) MIDI notasına çevirir. */
export function degreeToMidi(scale: readonly number[], root: number, degree: number): number {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + octave * 12 + scale[idx]!;
}
