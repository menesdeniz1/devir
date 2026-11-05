import type { Session } from '../game/session';
import { abilityArea, battlefieldBounds } from '../sim/geometry';
import { castAbilityAt, checkAbility, playerAbility } from './ability';
import { TARGET_KEY_STEP } from './constants';

/**
 * Yetenek hedefleme durumu (PRD Y-02): Q ya da düğme ile açılır; imleç koridordaysa alan önizlenir; sol tık uygular,
 * sağ tık/Esc iptal eder, Q'ya tekrar basmak imleç konumunda uygular. DOM'a bağımlı değildir (girdiyi
 * `setCursor`/`apply`/`cancel` çağrıları besler); duraklatma ve maç sonu hedeflemeyi kapatır (Y-07).
 */
export interface Targeting {
  readonly active: boolean;
  /** İmlecin dünya x'i; imleç koridorda değilse null. */
  readonly cursorX: number | null;
  /** Hedeflemeyi açar; yetenek kullanılamıyorsa açmaz ve false döner. */
  begin(): boolean;
  /** Q kısayolu: kapalıysa açar; açıksa imleç konumunda uygular. */
  pressKey(): void;
  /** Hedeflemeyi kapatır; açıksa true (Esc önce bunu kapatır, duraklatmaz). */
  cancel(): boolean;
  setCursor(x: number | null): void;
  /**
   * Klavye: hedeflemede imleci koridorda `TARGET_KEY_STEP` kadar sola/sağa taşır; imleç yoksa (koridor dışı)
   * savaş alanının ortasında başlatır. Hedefleme kapalıysa false.
   */
  nudge(direction: -1 | 1): boolean;
  /** Klavye (Enter): imleç yoksa alan merkezinde uygular. Kabul edildiyse true. */
  applyFromKeyboard(): boolean;
  /** İmleç konumunda uygular (imleç koridorda değilse hiçbir şey yapmaz); kabul edildiyse hedefleme kapanır. */
  applyAtCursor(): boolean;
  /** Etkin hedeflemede, imleç koridordaysa önizlenecek (savaş alanına kırpılmış) alan. */
  previewArea(): { x0: number; x1: number } | null;
  /** Her karede: kullanılamaz hâle gelen (duraklatma, maç sonu, bekleme) hedeflemeyi kapatır. */
  update(): void;
}

export function createTargeting(session: Session): Targeting {
  let active = false;
  let cursorX: number | null = null;

  const self: Targeting = {
    get active() {
      return active;
    },
    get cursorX() {
      return cursorX;
    },
    begin() {
      if (!checkAbility(session).ok) return false;
      active = true;
      return true;
    },
    pressKey() {
      if (active) self.applyAtCursor();
      else self.begin();
    },
    cancel() {
      const was = active;
      active = false;
      return was;
    },
    setCursor(x) {
      cursorX = x;
    },
    nudge(direction) {
      if (!active) return false;
      const field = battlefieldBounds();
      if (cursorX === null) cursorX = (field.x0 + field.x1) / 2;
      else cursorX = Math.min(field.x1, Math.max(field.x0, cursorX + direction * TARGET_KEY_STEP));
      return true;
    },
    applyFromKeyboard() {
      if (!active) return false;
      if (cursorX === null) {
        const field = battlefieldBounds();
        cursorX = (field.x0 + field.x1) / 2;
      }
      return self.applyAtCursor();
    },
    applyAtCursor() {
      if (!active || cursorX === null) return false;
      const result = castAbilityAt(session, cursorX);
      if (result.ok) active = false;
      return result.ok;
    },
    previewArea() {
      if (!active || cursorX === null) return null;
      const ability = playerAbility(session);
      return ability === undefined ? null : abilityArea(cursorX, ability.def.width);
    },
    update() {
      if (active && !checkAbility(session).ok) active = false;
    },
  };
  return self;
}
