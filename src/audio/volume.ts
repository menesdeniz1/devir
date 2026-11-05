import { MIX } from './config';
import { clamp } from './dsp';

/** Ayar değerini (0..100) algısal eğriyle kazanca (0..1) çevirir. NaN -> 0. */
export function volumeToGain(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.pow(clamp(volume, 0, 100) / 100, MIX.volumeCurveExponent);
}
