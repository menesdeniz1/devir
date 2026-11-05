import { DEBUG_BASE_HIT, DEBUG_GOLD_GRANT, DEBUG_LOW_BASE_HP, DEBUG_XP_GRANT, DEBUG_SPEEDS, PLAYER_SIDE } from '../game/constants';
import type { Session } from '../game/session';
import { fmt, tr } from '../i18n/tr';
import { stateHash } from '../sim/hash';
import { attrWriter, el, textWriter } from './dom';

const ENEMY_SIDE = PLAYER_SIDE === 0 ? 1 : 0;

/**
 * Geliştirme paneli (`?debug`, yalnız import.meta.env.DEV). Oyun durumunu doğrudan değiştirebilir.
 * Üretim derlemesine girmez (main.ts dinamik içe aktarmayı DEV koşuluna bağlar).
 */
export function mountDebugPanel(root: HTMLElement, session: Session): { update(): void; destroy(): void } {
  const panel = el('aside', 'debug', root);
  panel.setAttribute('aria-label', tr.debug.title);
  const title = el('strong', 'debug__title', panel);
  title.textContent = tr.debug.title;

  const speedRow = el('div', 'debug__row', panel);
  const speedLabel = el('span', undefined, speedRow);
  speedLabel.textContent = tr.debug.speed;
  const speedButtons = DEBUG_SPEEDS.map((n) => {
    const b = el('button', 'btn btn--small', speedRow);
    b.type = 'button';
    b.textContent = `×${n}`;
    b.setAttribute('aria-label', fmt(tr.debug.speedAria, { n }));
    b.addEventListener('click', () => session.setSpeed(n));
    return { n, b, pressed: attrWriter(b, 'aria-pressed') };
  });

  const action = (label: string, run: () => void): void => {
    const b = el('button', 'btn btn--small', panel);
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', run);
  };
  action(tr.debug.enemyBase1, () => session.debugMutate((s) => void (s.sides[ENEMY_SIDE].baseHp = DEBUG_LOW_BASE_HP)));
  action(tr.debug.hitEnemyBase, () => session.debugMutate((s) => void (s.sides[ENEMY_SIDE].baseHp = Math.max(0, s.sides[ENEMY_SIDE].baseHp - DEBUG_BASE_HIT))));
  action(tr.debug.selfBase1, () => session.debugMutate((s) => void (s.sides[PLAYER_SIDE].baseHp = DEBUG_LOW_BASE_HP)));
  action(fmt(tr.debug.addGold, { n: DEBUG_GOLD_GRANT }), () => session.debugMutate((s) => void (s.sides[PLAYER_SIDE].gold += DEBUG_GOLD_GRANT)));
  action(fmt(tr.debug.addXp, { n: DEBUG_XP_GRANT }), () => session.debugMutate((s) => void (s.sides[PLAYER_SIDE].xp += DEBUG_XP_GRANT)));

  const info = el('div', 'debug__info', panel);
  const writeInfo = textWriter(info);

  return {
    update(): void {
      for (const sb of speedButtons) sb.pressed(session.speed === sb.n ? 'true' : 'false');
      writeInfo(`${tr.debug.tick}: ${session.tick}  ${tr.debug.hash}: ${stateHash(session.state)}`);
    },
    destroy(): void {
      panel.remove();
    },
  };
}
