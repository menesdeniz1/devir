import type { Texture } from 'pixi.js';
import { AGE_FRONT_STYLE, AGE_HEAVY_STYLE, AGE_RANGED_STYLE, ageUnitParts } from './ageParts';
import type { UnitRig } from './anim';
import { buildAtlas, mustTexture } from './atlas';
import type { ArtAge, ArtSide } from './palette';
import { primitiveUnitParts } from './primitiveParts';
import {
  FrontRig,
  HeavyRig,
  PRIMITIVE_FRONT,
  PRIMITIVE_HEAVY,
  PRIMITIVE_RANGED,
  RangedRig,
  type FrontStyle,
  type HeavyStyle,
  type RangedStyle,
  type TextureLookup,
} from './primitiveRigs';

/**
 * Birlik çizimi kaydı. Her çağın parça atlası ilk kullanımda (veya `prewarmUnitArt(age)` ile) bir kez,
 * tembel olarak pişirilir: oynanmayan çağlar bellek ve açılış süresi harcamaz.
 * Tür kimliği → rol tasarımı; çağ, birlik verisinden (`def.age`) ya da kimlik önekinden gelir.
 */

/** Doku pikseli / mantıksal px: 1080p'de 2× örnekleme (yakın), küçültmede mipmap. */
export const UNIT_ART_RESOLUTION = 2;

type Design = 'front' | 'ranged' | 'heavy';

const AGE_BY_PREFIX: Readonly<Record<string, ArtAge>> = {
  primitive: 1,
  ancient: 2,
  medieval: 3,
  industrial: 4,
  future: 5,
};

/** Çağ numarasını 1..5'e sıkıştırır (bilinmeyen → 1). */
export function artAge(age: number | undefined): ArtAge {
  if (age === undefined || !Number.isFinite(age)) return 1;
  const n = Math.round(age);
  return (n < 1 ? 1 : n > 5 ? 5 : n) as ArtAge;
}

function ageOfType(typeId: string): ArtAge | undefined {
  const prefix = typeId.split('_')[0] ?? '';
  return AGE_BY_PREFIX[prefix];
}

const atlases = new Map<ArtAge, Map<string, Texture>>();

function textures(age: ArtAge): Map<string, Texture> {
  let map = atlases.get(age);
  if (map === undefined) {
    map = buildAtlas(`art.units.age${age}`, age === 1 ? primitiveUnitParts() : ageUnitParts(age), UNIT_ART_RESOLUTION);
    atlases.set(age, map);
  }
  return map;
}

/** Bir çağın atlasını şimdi pişirir (ilk birlik doğarken takılma olmasın). Varsayılan: İlkel Çağ. */
export function prewarmUnitArt(age = 1): void {
  textures(artAge(age));
}

/** Pişirilmiş birlik atlaslarının doku boyutları (rapor/hata ayıklama). */
export function unitAtlasStats(): Array<{ age: ArtAge; width: number; height: number }> {
  const out: Array<{ age: ArtAge; width: number; height: number }> = [];
  for (const [age, map] of atlases) {
    const src = map.values().next().value?.source;
    if (src !== undefined) out.push({ age, width: src.pixelWidth, height: src.pixelHeight });
  }
  return out.sort((a, b) => a.age - b.age);
}

/** Birlik başına sprite sayısı (rapor/test): gölge + parçalar + kıvılcım. Her çağda aynı iskelet. */
export const SPRITES_PER_UNIT: Readonly<Record<Design, number>> = { front: 8, ranged: 9, heavy: 10 };

function styles(age: ArtAge): { front: FrontStyle; ranged: RangedStyle; heavy: HeavyStyle } {
  if (age === 1) return { front: PRIMITIVE_FRONT, ranged: PRIMITIVE_RANGED, heavy: PRIMITIVE_HEAVY };
  return { front: AGE_FRONT_STYLE[age], ranged: AGE_RANGED_STYLE[age], heavy: AGE_HEAVY_STYLE[age] };
}

/**
 * Birlik iskeleti kurar. `age` verilmezse tür kimliğinin önekinden (`ancient_` …) çıkarılır.
 * Rol bilinmeyen değerse ön hat tasarımına düşer.
 */
export function createUnitRig(typeId: string, role: string, side: ArtSide, age?: number): UnitRig {
  const a = artAge(age ?? ageOfType(typeId));
  const map = textures(a);
  const tex: TextureLookup = (name) => mustTexture(map, name);
  const design: Design = role === 'ranged' || role === 'heavy' ? role : 'front';
  const st = styles(a);
  switch (design) {
    case 'ranged':
      return new RangedRig(tex, side, st.ranged);
    case 'heavy':
      return new HeavyRig(tex, side, st.heavy);
    default:
      return new FrontRig(tex, side, st.front);
  }
}
