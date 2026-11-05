import type { TowerKind } from '../data/types';
import { getTower } from '../sim/compile';

/** Kimlik listesinde verilen türden ilk kule kimliği; yoksa undefined. */
export function towerOfKind(towerIds: readonly string[], kind: TowerKind): string | undefined {
  return towerIds.find((id) => getTower(id)?.def.kind === kind);
}
