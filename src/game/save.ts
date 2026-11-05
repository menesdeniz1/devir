import { getAbility, getAge, getTower, getUnit } from '../sim/compile';
import { fnv1a } from '../sim/hash';
import { checkInvariants } from '../sim/invariants';
import type { GameState, MatchConfig } from '../sim/types';
import { SAVE_SCHEMA_VERSION, STORAGE_KEYS } from './constants';
import type { SafeStorage } from './storage';

/**
 * Tek yuvalı kayıt (TDD §9, PRD ÖK-03…ÖK-05).
 * Biçim: { schemaVersion, gameVersion, savedAt, matchConfig, state, checksum }; checksum = FNV-1a(JSON.stringify(state)).
 * `savedAt` yalnızca bilgi amaçlıdır; simülasyona girmez.
 */
export interface SaveFile {
  schemaVersion: number;
  gameVersion: string;
  savedAt: number;
  matchConfig: MatchConfig;
  state: GameState;
  checksum: string;
}

/** Yükleme zincirinin hangi basamakta başarısız olduğu. */
export type SaveFailure =
  /** JSON ayrıştırılamadı ya da kök bir nesne değil. */
  | 'parse'
  /** schemaVersion ya da gameVersion uyumsuz (ilk sürümde göç yok). */
  | 'version'
  | 'checksum'
  | 'structure'
  /** Bitmiş maça ait kayıt geçerli sayılmaz. */
  | 'finished'
  /** Bilinmeyen birlik, kule, yetenek ya da çağ başvurusu. */
  | 'references'
  | 'invariants';

export type ParseResult = { ok: true; save: SaveFile } | { ok: false; failure: SaveFailure; detail?: string };

/** Menüde gösterilen kayıt özeti. */
export interface SaveInfo {
  opponent: MatchConfig['opponent'];
  tick: number;
  playerAge: number;
  savedAt: number;
}

const OPPONENTS: readonly string[] = ['easy', 'normal', 'hard', 'basic-bot', 'none'];

export function checksumOf(state: GameState): string {
  return fnv1a(JSON.stringify(state));
}

export function createSave(state: GameState, gameVersion: string, savedAt: number): SaveFile {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion,
    savedAt,
    matchConfig: { seed: state.config.seed, opponent: state.config.opponent },
    state,
    checksum: checksumOf(state),
  };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

/**
 * Sürüm hattı (semver): 1.x ve sonrasında yalnız ana sürüm ("1"), 0.x'te ana.ikincil ("0.2"); ayrıştırılamıyorsa null.
 * Kayıt biçimi ayrıca schemaVersion ile, içerik de yapısal/veri doğrulamasıyla korunur; ara sürüm (1.0 → 1.1) kaydı bozmaz.
 */
function versionLine(version: unknown): string | null {
  if (typeof version !== 'string') return null;
  const match = /^(\d+)\.(\d+)\./.exec(version);
  if (match === null) return null;
  return match[1] === '0' ? `0.${match[2]}` : match[1]!;
}

/** Aynı sürüm hattı uyumlu sayılır: yama ve (1.x'te) ara sürümler kaydı bozmaz. */
export function isCompatibleVersion(saved: unknown, current: string): boolean {
  const a = versionLine(saved);
  const b = versionLine(current);
  return a !== null && b !== null && a === b;
}

// ---- Yapısal doğrulama --------------------------------------------------------------

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isSide = (v: unknown): boolean => v === 0 || v === 1;
const isCounts = (v: unknown): boolean => isObj(v) && Object.values(v).every(isNum);

function all(list: unknown, check: (item: Obj) => boolean): boolean {
  return Array.isArray(list) && list.every((item) => isObj(item) && check(item));
}

function sideShapeOk(s: unknown): boolean {
  if (!isObj(s)) return false;
  if (![s['gold'], s['xp'], s['age'], s['baseHp'], s['baseMaxHp'], s['abilityCooldown']].every(isNum)) return false;
  if (!all(s['queue'], (o) => typeof o['unitId'] === 'string' && isNum(o['progressTicks']) && isNum(o['paid']))) return false;
  const slotsOk = all(s['slots'], (slot) => {
    const tower = slot['tower'];
    const towerOk = tower === null || (isObj(tower) && typeof tower['type'] === 'string' && isNum(tower['paid']) && isNum(tower['cooldown']));
    return typeof slot['unlocked'] === 'boolean' && towerOk;
  });
  if (!slotsOk) return false;
  const stats = s['stats'];
  if (!isObj(stats)) return false;
  return (
    isCounts(stats['produced']) &&
    isCounts(stats['lost']) &&
    isCounts(stats['kills']) &&
    [stats['goldEarned'], stats['goldSpent'], stats['goldRefunded'], stats['baseDamageDealt']].every(isNum) &&
    Array.isArray(stats['ageUpTicks']) &&
    (stats['ageUpTicks'] as unknown[]).every(isNum)
  );
}

/** Durum nesnesinin biçimi (alan varlığı ve tipleri). İlk bulunan sorunu döndürür; sorun yoksa null. */
export function structureProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'durum nesne değil';
  if (raw['schemaVersion'] !== 1) return 'durum şema sürümü';
  const config = raw['config'];
  if (!isObj(config) || !isNum(config['seed']) || typeof config['opponent'] !== 'string' || !OPPONENTS.includes(config['opponent'])) return 'config';
  if (!isInt(raw['tick']) || (raw['tick'] as number) < 0) return 'tick';
  if (!isInt(raw['nextId'])) return 'nextId';
  const outcome = raw['outcome'];
  if (outcome !== null && !isObj(outcome)) return 'outcome';
  const sides = raw['sides'];
  if (!Array.isArray(sides) || sides.length !== 2 || !sides.every(sideShapeOk)) return 'sides';
  const unitsOk = all(raw['units'], (u) =>
    isInt(u['id']) && isSide(u['side']) && typeof u['type'] === 'string' && isNum(u['x']) && isNum(u['hp']) && isNum(u['cooldown']) &&
    (u['mode'] === 'walk' || u['mode'] === 'attack' || u['mode'] === 'wait') && isNum(u['stunTicks']) && isNum(u['vulnTicks']) && isNum(u['vulnPct']),
  );
  if (!unitsOk) return 'units';
  const projectilesOk = all(raw['projectiles'], (p) =>
    isInt(p['id']) && isSide(p['side']) && (p['sourceKind'] === 'unit' || p['sourceKind'] === 'tower') && typeof p['sourceType'] === 'string' &&
    isNum(p['sourceId']) && (p['targetId'] === null || isNum(p['targetId'])) && isNum(p['x']) && isNum(p['targetX']) && typeof p['targetLost'] === 'boolean',
  );
  if (!projectilesOk) return 'projectiles';
  const areaOk = (a: Obj): boolean => isInt(a['id']) && isSide(a['side']) && typeof a['abilityId'] === 'string' && isNum(a['x0']) && isNum(a['x1']) && isNum(a['ticksLeft']);
  if (!all(raw['zones'], areaOk)) return 'zones';
  if (!all(raw['strikes'], areaOk)) return 'strikes';
  const stone = raw['stone'];
  if (!isObj(stone) || !isNum(stone['counter']) || !(stone['owner'] === null || isSide(stone['owner']))) return 'stone';
  if (!Array.isArray(raw['ai']) || raw['ai'].length !== 2) return 'ai';
  return null;
}

/** Veri başvuruları: tür kimlikleri ve çağ numaraları verilerde var mı. Yapı doğrulanmış olmalıdır. */
export function referenceProblem(state: GameState): string | null {
  for (const side of state.sides) {
    if (getAge(side.age) === undefined) return `çağ ${side.age}`;
    for (const order of side.queue) if (getUnit(order.unitId) === undefined) return `birlik ${order.unitId}`;
    for (const slot of side.slots) if (slot.tower !== null && getTower(slot.tower.type) === undefined) return `kule ${slot.tower.type}`;
  }
  for (const unit of state.units) if (getUnit(unit.type) === undefined) return `birlik ${unit.type}`;
  for (const p of state.projectiles) {
    if (p.sourceKind === 'unit' ? getUnit(p.sourceType) === undefined : getTower(p.sourceType) === undefined) return `mermi kaynağı ${p.sourceType}`;
  }
  for (const area of [...state.zones, ...state.strikes]) if (getAbility(area.abilityId) === undefined) return `yetenek ${area.abilityId}`;
  return null;
}

/** Yükleme zinciri: ayrıştır → sürüm → karma → yapı → başvurular → değişmezler (TDD §9). */
export function parseSave(text: string, currentVersion: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, failure: 'parse' };
  }
  if (!isObj(raw)) return { ok: false, failure: 'parse' };

  if (raw['schemaVersion'] !== SAVE_SCHEMA_VERSION || !isCompatibleVersion(raw['gameVersion'], currentVersion)) {
    return { ok: false, failure: 'version' };
  }
  if (typeof raw['checksum'] !== 'string' || raw['state'] === undefined || checksumOf(raw['state'] as GameState) !== raw['checksum']) {
    return { ok: false, failure: 'checksum' };
  }
  const problem = structureProblem(raw['state']);
  const matchConfig = raw['matchConfig'];
  if (problem !== null) return { ok: false, failure: 'structure', detail: problem };
  const state = raw['state'] as GameState;
  if (!isNum(raw['savedAt']) || !isObj(matchConfig) || matchConfig['seed'] !== state.config.seed || matchConfig['opponent'] !== state.config.opponent) {
    return { ok: false, failure: 'structure', detail: 'matchConfig' };
  }
  if (state.outcome !== null) return { ok: false, failure: 'finished' };
  const reference = referenceProblem(state);
  if (reference !== null) return { ok: false, failure: 'references', detail: reference };
  try {
    const problems = checkInvariants(state);
    if (problems.length > 0) return { ok: false, failure: 'invariants', detail: problems[0] };
  } catch (error) {
    return { ok: false, failure: 'invariants', detail: error instanceof Error ? error.message : String(error) };
  }
  return {
    ok: true,
    save: {
      schemaVersion: raw['schemaVersion'] as number,
      gameVersion: raw['gameVersion'] as string,
      savedAt: raw['savedAt'] as number,
      matchConfig: { seed: state.config.seed, opponent: state.config.opponent },
      state,
      checksum: raw['checksum'] as string,
    },
  };
}

export function infoOf(save: SaveFile): SaveInfo {
  return { opponent: save.state.config.opponent, tick: save.state.tick, playerAge: save.state.sides[0].age, savedAt: save.savedAt };
}

export type LoadResult = { status: 'none' } | { status: 'ok'; save: SaveFile } | { status: 'invalid'; failure: SaveFailure; detail?: string };

/** Tek kayıt yuvası: yazma, okuma (geçersizse siler) ve silme. */
export class SaveSlot {
  constructor(
    private readonly storage: SafeStorage,
    private readonly gameVersion: string,
  ) {}

  /** Kaydı yazar; yazılamazsa false (oyun sürer). */
  write(state: GameState, savedAt: number): boolean {
    return this.storage.write(STORAGE_KEYS.save, serializeSave(createSave(state, this.gameVersion, savedAt)));
  }

  /** Okur ve doğrular. Geçersiz kayıt silinir; çağıran oyuncuyu bilgilendirir. */
  load(): LoadResult {
    const text = this.storage.read(STORAGE_KEYS.save);
    if (text === null) return { status: 'none' };
    const result = parseSave(text, this.gameVersion);
    if (result.ok) return { status: 'ok', save: result.save };
    this.clear();
    return result.detail === undefined ? { status: 'invalid', failure: result.failure } : { status: 'invalid', failure: result.failure, detail: result.detail };
  }

  clear(): void {
    this.storage.remove(STORAGE_KEYS.save);
  }
}
