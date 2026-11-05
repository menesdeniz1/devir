/** Tüm ses efektlerinin kimlikleri. Her kimliğin bir tarifi (sfx/index.ts) ve ayarı (config.ts) vardır. */
export const SFX_IDS = [
  // Savaş
  'meleeHit',
  'shootRanged',
  'shootHeavy',
  'impact',
  'explosion',
  'unitDeath',
  'unitSpawn',
  'baseHit',
  // Yapılar
  'towerFast',
  'towerHeavy',
  'towerBuilt',
  'towerSold',
  'slotUnlocked',
  'ageUp',
  'stoneCapture',
  'stoneLose',
  // Yetenekler (yetenek kimliği başına bir ses)
  'abilityStampede',
  'abilityFireTrench',
  'abilityCaltrops',
  'abilityBarrage',
  'abilityBarrageImpact',
  'abilityStasis',
  'abilityGeneric',
  // Arayüz
  'uiClick',
  'uiError',
  'uiNotice',
  // Maç sonu
  'stingerWin',
  'stingerLoss',
  'stingerDraw',
] as const;

export type SfxId = (typeof SFX_IDS)[number];
