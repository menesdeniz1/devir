import type { AbilityDef } from './types';

/**
 * Özel yetenekler (GDD §7), çağ başına bir tane. Oyuncu güncel çağının yeteneğini kullanır (PRD Y-01).
 * Çağ geçişinde kalan bekleme = min(kalan, yeni yeteneğin beklemesi) (PRD Y-05).
 */
export const ABILITY_RULES = {
  /** Maç başında her iki tarafın yetenek beklemesi (sn) (PRD Y-04). */
  initialCooldownSec: 30,
};

export const ABILITIES: readonly AbilityDef[] = [
  // Sürü Hücumu: yaban hayvanı sürüsü alandan geçer.
  { id: 'primitive_stampede', age: 1, width: 240, cooldownSec: 50, impactDamage: 60, status: { kind: 'stun', durationSec: 1 } },
  // Ateş Hendeği: alan 6 sn yanar.
  { id: 'ancient_fire_trench', age: 2, width: 220, cooldownSec: 55, zone: { durationSec: 6, damagePerSec: 50 } },
  // Çivi Kapanı: alan 10 sn yavaşlatır ve yaralar.
  { id: 'medieval_caltrops', age: 3, width: 300, cooldownSec: 55, zone: { durationSec: 10, damagePerSec: 40, slowPct: 50 } },
  // Baraj Ateşi: 1,5 sn gecikmeyle ağır vuruş.
  { id: 'industrial_barrage', age: 4, width: 320, cooldownSec: 60, delaySec: 1.5, impactDamage: 1100 },
  // Durağanlık Alanı: 4 sn dondurur; donmuşlar %30 fazla hasar alır.
  { id: 'future_stasis', age: 5, width: 260, cooldownSec: 60, status: { kind: 'freeze', durationSec: 4, damageTakenPct: 30 } },
];
