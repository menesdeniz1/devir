import type { AiProfileDef } from '../../data/types';
import type { Command } from '../../sim/types';
import type { Observation } from '../observation';
import type { Threat } from './threat';

/**
 * Yetenek modülü (GDD §9 modül 5) için yer tutucu. Aşama 5'te `castAbility` komutu ve gözlemde etki alanları
 * geldiğinde: alan içindeki düşman değerini en çok yapan noktayı tarar, profil eşiği üstündeyse kullanır.
 * Şimdilik komut üretmez.
 */
export function planAbility(_obs: Observation, _threat: Threat, _profile: AiProfileDef): Command[] {
  return [];
}
