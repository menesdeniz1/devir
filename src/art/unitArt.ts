import type { Texture } from 'pixi.js';
import type { UnitRig } from './anim';
import { buildAtlas, mustTexture } from './atlas';
import type { ArtSide } from './palette';
import { primitiveUnitParts } from './primitiveParts';
import { FrontRig, HeavyRig, RangedRig, type TextureLookup } from './primitiveRigs';

/**
 * Birlik çizimi kaydı. Parça atlası ilk kullanımda (veya `prewarmUnitArt` ile açılışta) bir kez pişirilir.
 * Tür kimliği → tasarım; henüz çizilmemiş türler rolün İlkel Çağ tasarımına düşer.
 */

/** Doku pikseli / mantıksal px: 1080p'de 2× örnekleme (yakın), küçültmede mipmap. */
export const UNIT_ART_RESOLUTION = 2;

type Design = 'front' | 'ranged' | 'heavy';

const DESIGN_BY_TYPE: Readonly<Record<string, Design>> = {
  primitive_front: 'front',
  primitive_ranged: 'ranged',
  primitive_heavy: 'heavy',
};

let unitAtlas: Map<string, Texture> | null = null;

function textures(): Map<string, Texture> {
  unitAtlas ??= buildAtlas('art.units.primitive', primitiveUnitParts(), UNIT_ART_RESOLUTION);
  return unitAtlas;
}

/** Atlası şimdi pişirir (ilk birlik doğarken takılma olmasın). */
export function prewarmUnitArt(): void {
  textures();
}

/** Birlik başına sprite sayısı (rapor/test): gölge + parçalar + kıvılcım. */
export const SPRITES_PER_UNIT: Readonly<Record<Design, number>> = { front: 8, ranged: 9, heavy: 10 };

export function createUnitRig(typeId: string, role: string, side: ArtSide): UnitRig {
  const map = textures();
  const tex: TextureLookup = (name) => mustTexture(map, name);
  const design: Design = DESIGN_BY_TYPE[typeId] ?? (role === 'ranged' || role === 'heavy' ? role : 'front');
  switch (design) {
    case 'ranged':
      return new RangedRig(tex, side);
    case 'heavy':
      return new HeavyRig(tex, side);
    default:
      return new FrontRig(tex, side);
  }
}
