import type { TutorialStepId } from '../game/tutorialConfig';

/** Her öğretici adımında vurgulanacak arayüz öğesinin CSS seçicisi (HUD sınıfları `hud.ts`'te tanımlıdır). */
export const TUTORIAL_TARGETS: Record<TutorialStepId, string> = {
  welcome: '.hud-top',
  produceFront: '.hud-units .unit-cell:nth-child(1)',
  firstKill: '.hud-gold',
  produceRanged: '.hud-units .unit-cell:nth-child(2)',
  cancelOrder: '.hud-queue',
  buildTower: '.hud-defense .slot-cell:nth-child(1)',
  useAbility: '.hud-ability',
  ageUp: '.hud-age',
  captureStone: '.hud-stone',
  destroyBase: '.hud-base--enemy',
};
