import type { MatchConfig, Outcome } from '../sim/types';
import { RESULTS_HISTORY_MAX, STORAGE_KEYS } from './constants';
import type { SafeStorage } from './storage';

/** Oyuncunun seçebildiği zorluklar (MatchConfig.opponent'in ilk üçü). */
export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type ResultKind = 'win' | 'loss' | 'draw';

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

export interface ResultEntry {
  /** Maçın bittiği an (ms, bilgi amaçlı). */
  at: number;
  opponent: Difficulty;
  result: ResultKind;
  durationTicks: number;
  playerAge: number;
}

export interface DifficultyTotals {
  wins: number;
  losses: number;
  draws: number;
}

export interface ResultsData {
  /** En yeni başta; en çok RESULTS_HISTORY_MAX kayıt. */
  entries: ResultEntry[];
  totals: Record<Difficulty, DifficultyTotals>;
}

function zeroTotals(): DifficultyTotals {
  return { wins: 0, losses: 0, draws: 0 };
}

export function emptyResults(): ResultsData {
  return { entries: [], totals: { easy: zeroTotals(), normal: zeroTotals(), hard: zeroTotals() } };
}

function count(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

function sanitizeEntry(raw: unknown): ResultEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const result = r['result'];
  const opponent = r['opponent'];
  if (!isDifficulty(opponent) || (result !== 'win' && result !== 'loss' && result !== 'draw')) return null;
  const at = r['at'];
  const duration = r['durationTicks'];
  const age = r['playerAge'];
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return null;
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 1) return null;
  return { at, opponent, result, durationTicks: Math.floor(duration), playerAge: age };
}

/** Bozuk veriyi atar, geçerli parçaları korur. */
export function sanitizeResults(raw: unknown): ResultsData {
  const out = emptyResults();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r['entries'])) {
    for (const item of r['entries'] as unknown[]) {
      const entry = sanitizeEntry(item);
      if (entry !== null) out.entries.push(entry);
      if (out.entries.length >= RESULTS_HISTORY_MAX) break;
    }
  }
  const totals = r['totals'];
  if (typeof totals === 'object' && totals !== null) {
    for (const difficulty of DIFFICULTIES) {
      const t = (totals as Record<string, unknown>)[difficulty];
      if (typeof t === 'object' && t !== null) {
        const tt = t as Record<string, unknown>;
        out.totals[difficulty] = { wins: count(tt['wins']), losses: count(tt['losses']), draws: count(tt['draws']) };
      }
    }
  }
  return out;
}

/** Yeni sonucu ekler (saf): geçmiş en yeni başta kırpılır, toplamlar artar. */
export function addResult(data: ResultsData, entry: ResultEntry): ResultsData {
  const totals: ResultsData['totals'] = {
    easy: { ...data.totals.easy },
    normal: { ...data.totals.normal },
    hard: { ...data.totals.hard },
  };
  const t = totals[entry.opponent];
  if (entry.result === 'win') t.wins += 1;
  else if (entry.result === 'loss') t.losses += 1;
  else t.draws += 1;
  return { entries: [entry, ...data.entries].slice(0, RESULTS_HISTORY_MAX), totals };
}

/** Maç sonucunu oyuncu (taraf 0) açısından sonuç türüne çevirir. */
export function resultKindOf(outcome: Outcome): ResultKind {
  if (outcome.kind === 'draw') return 'draw';
  return outcome.winner === 0 ? 'win' : 'loss';
}

/** Yalnız zorluk seçilebilen rakipler kayda geçer (test botları geçmişi kirletmez). */
export function difficultyOf(opponent: MatchConfig['opponent']): Difficulty | null {
  return isDifficulty(opponent) ? opponent : null;
}

export function loadResults(storage: SafeStorage): ResultsData {
  const text = storage.read(STORAGE_KEYS.results);
  if (text === null) return emptyResults();
  try {
    return sanitizeResults(JSON.parse(text) as unknown);
  } catch {
    return emptyResults();
  }
}

export function saveResults(storage: SafeStorage, data: ResultsData): boolean {
  return storage.write(STORAGE_KEYS.results, JSON.stringify(data));
}
