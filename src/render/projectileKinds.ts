/**
 * Mermi görünüm türleri (GDD §14: çağa özgü mermiler). Saf veri ve eşleme; Pixi'den bağımsızdır (testlenebilir).
 * Tür, merminin kaynağından çıkar: birlikte rol × çağ, kulede kule türü (hızlı/ağır) × çağ.
 */
import { getTower, getUnit } from '../sim/compile';

export type ProjectileKind =
  // Birlik — menzilli
  | 'spear'
  | 'arrow'
  | 'bolt'
  | 'bullet'
  | 'rail'
  // Birlik — ağır
  | 'rock'
  | 'ballista'
  | 'catapult'
  | 'cannonball'
  | 'plasmaOrb'
  // Kule — hızlı
  | 'sling'
  | 'towerArrow'
  | 'towerBolt'
  | 'mgBullet'
  | 'laser'
  // Kule — ağır
  | 'chuteRock'
  | 'sand'
  | 'oil'
  | 'mortar'
  | 'plasmaBall';

/** Çarpma etkisi ailesi. */
export type ImpactKind = 'light' | 'spark' | 'zap' | 'heavy' | 'sand' | 'oil' | 'plasma';

/** Uçuş biçimi: `flat` düz, `arc` yay. `orient`: `tangent` yaya teğet, `spin` döner, `none` sabit. */
export interface ProjectileLook {
  readonly texture: string;
  /** Yay yüksekliği = min(max, mesafe × ratio); null ise düz uçuş. */
  readonly arc: { readonly ratio: number; readonly max: number } | null;
  readonly orient: 'tangent' | 'spin' | 'none';
  /** Dönüş hızı (rad/ms), `spin` için. */
  readonly spin?: number;
  /** Arkasında iz (ışın/mermi izi): doku rengi, en çok uzunluk (px), saydamlık. */
  readonly trail?: { readonly tint: number; readonly length: number; readonly alpha: number; readonly width: number };
  /** Uçuşta küçük duman/kıvılcım bırakır (ms aralıkla). */
  readonly puffEveryMs?: number;
  readonly puffTint?: number;
  /** Nabız: ölçek salınımı (enerji küreleri). */
  readonly pulse?: boolean;
  readonly impact: ImpactKind;
  /** Görsel ölçek. */
  readonly scale?: number;
}

const WARM_TRAIL = 0xffe28a;
const VIOLET_TRAIL = 0xe7a6ff;

export const PROJECTILE_LOOKS: Readonly<Record<ProjectileKind, ProjectileLook>> = {
  spear: { texture: 'p.spear', arc: { ratio: 0.06, max: 22 }, orient: 'tangent', impact: 'light' },
  arrow: { texture: 'p.arrow', arc: { ratio: 0.08, max: 30 }, orient: 'tangent', impact: 'light' },
  bolt: { texture: 'p.bolt', arc: { ratio: 0.03, max: 10 }, orient: 'tangent', impact: 'light' },
  bullet: { texture: 'p.bullet', arc: null, orient: 'none', trail: { tint: WARM_TRAIL, length: 70, alpha: 0.85, width: 0.7 }, impact: 'spark' },
  rail: { texture: 'p.rail', arc: null, orient: 'none', trail: { tint: VIOLET_TRAIL, length: 150, alpha: 0.9, width: 1.2 }, impact: 'zap' },

  rock: { texture: 'p.rock', arc: { ratio: 0.22, max: 95 }, orient: 'spin', spin: 0.012, impact: 'heavy' },
  ballista: { texture: 'p.ballista', arc: { ratio: 0.05, max: 18 }, orient: 'tangent', impact: 'heavy' },
  catapult: { texture: 'p.catapult', arc: { ratio: 0.3, max: 130 }, orient: 'spin', spin: 0.009, impact: 'heavy', scale: 1 },
  cannonball: { texture: 'p.cannonball', arc: { ratio: 0.12, max: 55 }, orient: 'spin', spin: 0.004, puffEveryMs: 45, puffTint: 0xcfc8be, impact: 'heavy' },
  plasmaOrb: { texture: 'p.plasmaOrb', arc: { ratio: 0.1, max: 45 }, orient: 'none', pulse: true, trail: { tint: VIOLET_TRAIL, length: 46, alpha: 0.6, width: 2.2 }, impact: 'plasma' },

  sling: { texture: 'p.sling', arc: { ratio: 0.12, max: 40 }, orient: 'spin', spin: 0.02, impact: 'light' },
  towerArrow: { texture: 'p.arrow', arc: { ratio: 0.1, max: 34 }, orient: 'tangent', impact: 'light' },
  towerBolt: { texture: 'p.bolt', arc: { ratio: 0.04, max: 14 }, orient: 'tangent', impact: 'light' },
  mgBullet: { texture: 'p.bullet', arc: null, orient: 'none', trail: { tint: WARM_TRAIL, length: 46, alpha: 0.75, width: 0.55 }, impact: 'spark', scale: 0.8 },
  laser: { texture: 'p.laser', arc: null, orient: 'none', trail: { tint: 0xff9ad8, length: 60, alpha: 0.75, width: 0.8 }, impact: 'zap' },

  chuteRock: { texture: 'p.rock', arc: { ratio: 0.18, max: 70 }, orient: 'spin', spin: 0.014, impact: 'heavy', scale: 0.9 },
  sand: { texture: 'p.sand', arc: { ratio: 0.22, max: 80 }, orient: 'spin', spin: 0.006, puffEveryMs: 40, puffTint: 0xffb14a, impact: 'sand' },
  oil: { texture: 'p.oil', arc: { ratio: 0.22, max: 80 }, orient: 'tangent', puffEveryMs: 55, puffTint: 0x5a5560, impact: 'oil' },
  mortar: { texture: 'p.mortar', arc: { ratio: 0.55, max: 190 }, orient: 'tangent', puffEveryMs: 50, puffTint: 0xd8d2c8, impact: 'heavy' },
  plasmaBall: { texture: 'p.plasmaBall', arc: { ratio: 0.3, max: 110 }, orient: 'none', pulse: true, trail: { tint: VIOLET_TRAIL, length: 40, alpha: 0.55, width: 2.8 }, impact: 'plasma' },
};

const UNIT_RANGED: readonly ProjectileKind[] = ['spear', 'arrow', 'bolt', 'bullet', 'rail'];
const UNIT_HEAVY: readonly ProjectileKind[] = ['rock', 'ballista', 'catapult', 'cannonball', 'plasmaOrb'];
const TOWER_FAST: readonly ProjectileKind[] = ['sling', 'towerArrow', 'towerBolt', 'mgBullet', 'laser'];
const TOWER_HEAVY: readonly ProjectileKind[] = ['chuteRock', 'sand', 'oil', 'mortar', 'plasmaBall'];

function byAge(list: readonly ProjectileKind[], age: number): ProjectileKind {
  const i = Math.min(list.length, Math.max(1, Math.round(age))) - 1;
  return list[i]!;
}

/** Merminin görünüm türü (kaynak türü ProjectileState.sourceType: birlik veya kule kimliği). Bilinmeyen → mızrak. */
export function projectileKindOf(sourceKind: 'unit' | 'tower', sourceType: string): ProjectileKind {
  if (sourceKind === 'tower') {
    const tower = getTower(sourceType);
    if (tower !== undefined) return byAge(tower.def.kind === 'heavy' ? TOWER_HEAVY : TOWER_FAST, tower.def.age);
  } else {
    const unit = getUnit(sourceType);
    if (unit !== undefined) return byAge(unit.role === 'heavy' ? UNIT_HEAVY : UNIT_RANGED, unit.def.age);
  }
  return 'spear';
}
