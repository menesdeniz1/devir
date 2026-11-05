import type { GameState } from './types';

/** FNV-1a 32 bit, JSON metni üzerinden; sekiz haneli onaltılık metin. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), 0x01000193);
    if (c > 0xff) {
      h = Math.imul(h ^ (c >>> 8), 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stateHash(state: GameState): string {
  return fnv1a(JSON.stringify(state));
}
