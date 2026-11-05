import { createBasicBot } from '../src/ai/basicBot';
import type { Controller } from '../src/ai/controller';
import { createRandomBot, createStackerBot } from '../src/ai/testBots';
import { WORLD } from '../src/data/world';
import { stepMatch } from '../src/match/runner';
import { checkInvariants, goldBalanceProblems, StallDetector } from '../src/sim/invariants';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import { rngFromSeed, rngInt } from '../src/sim/rng';
import type { GameState, Outcome, SideId } from '../src/sim/types';

function parseArgs(argv: string[]): { command: string; opts: Record<string, string> } {
  const [command = 'help', ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]!;
    if (key.startsWith('--')) {
      opts[key.slice(2)] = rest[i + 1] ?? '';
      i += 1;
    }
  }
  return { command, opts };
}

function numOpt(opts: Record<string, string>, name: string, fallback: number): number {
  const raw = opts[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} sayı olmalı: ${raw}`);
  return value;
}

function formatTime(ticks: number): string {
  const totalSec = Math.floor(ticks / WORLD.tickRate);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function describeOutcome(outcome: Outcome | null): string {
  if (outcome === null) return 'ZAMAN AŞIMI';
  return outcome.kind === 'draw' ? 'BERABERLİK' : `Taraf ${outcome.winner} KAZANDI`;
}

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((a, b) => a + b, 0);
}

function printSummary(state: GameState): void {
  console.log(`Sonuç: ${describeOutcome(state.outcome)}`);
  console.log(`Süre: ${formatTime(state.tick)} (${state.tick} tick)`);
  for (const side of [0, 1] as const) {
    const s = state.sides[side];
    console.log(
      `Taraf ${side}: kazanılan altın ${s.stats.goldEarned}, harcanan ${s.stats.goldSpent}, ` +
        `üretilen ${sum(s.stats.produced)}, kaybedilen ${sum(s.stats.lost)}, üs canı ${s.baseHp}/${s.baseMaxHp}`,
    );
  }
  console.log(`Son karma: ${stateHash(state)}`);
}

function makeBot(name: string, configSeed: number, side: SideId): Controller | null {
  switch (name) {
    case 'stacker':
      return createStackerBot();
    case 'basic':
      return createBasicBot();
    case 'random':
      return createRandomBot(configSeed, side);
    case 'idle':
      return null;
    default:
      throw new Error(`Bilinmeyen bot: ${name} (stacker | basic | random | idle)`);
  }
}

function runMatch(opts: Record<string, string>): number {
  const seed = numOpt(opts, 'seed', 1);
  const maxTicks = Math.round(numOpt(opts, 'max-minutes', 60) * 60 * WORLD.tickRate);
  const nameA = opts['a'] ?? 'stacker';
  const nameB = opts['b'] ?? 'basic';
  const state = createMatch({ seed, opponent: nameB === 'basic' ? 'basic-bot' : 'none' });
  const controllers: [Controller | null, Controller | null] = [makeBot(nameA, state.config.seed, 0), makeBot(nameB, state.config.seed, 1)];
  console.log(`Taraf 0: ${nameA}, taraf 1: ${nameB}, tohum ${seed}`);
  while (state.outcome === null && state.tick < maxTicks) {
    stepMatch(state, [], controllers);
  }
  printSummary(state);
  return 0;
}

type Kind = 'random-random' | 'random-basic' | 'stacker-random' | 'stacker-idle' | 'random-idle';

function makeControllers(kind: Kind, configSeed: number): [Controller, Controller | null] {
  switch (kind) {
    case 'random-random':
      return [createRandomBot(configSeed, 0), createRandomBot(configSeed, 1)];
    case 'random-basic':
      return [createRandomBot(configSeed, 0), createBasicBot()];
    case 'stacker-random':
      return [createStackerBot(), createRandomBot(configSeed, 1)];
    case 'stacker-idle':
      return [createStackerBot(), null];
    case 'random-idle':
      return [createRandomBot(configSeed, 0), null];
  }
}

/** Rakibi pasif ('idle') olan türler: üssü savunmasız rakibe karşı maç mutlaka bitmelidir; zaman aşımı ihlaldir. */
const IDLE_OPPONENT_KINDS: ReadonlySet<Kind> = new Set<Kind>(['stacker-idle', 'random-idle']);
const KINDS: readonly Kind[] = ['random-random', 'random-basic', 'stacker-random', 'stacker-idle', 'random-idle'];
/** Soak maçlarında başlangıç altınına eklenen en büyük rastgele ek (büyük orduları, dolu kuyruğu ve doğma engelini zorlar). */
const SOAK_MAX_EXTRA_GOLD = 3000;

function runSoak(opts: Record<string, string>): number {
  const games = numOpt(opts, 'games', 500);
  const baseSeed = numOpt(opts, 'seed', 1);
  const maxTicks = Math.round(numOpt(opts, 'max-minutes', 20) * 60 * WORLD.tickRate);
  let wins = 0;
  let draws = 0;
  let timeouts = 0;
  let violations = 0;
  const perKind: Record<string, number> = {};
  const timeoutsByKind: Record<string, number> = {};
  const started = Date.now();

  for (let g = 0; g < games; g++) {
    const seed = baseSeed + g;
    const kind = KINDS[g % KINDS.length]!;
    perKind[kind] = (perKind[kind] ?? 0) + 1;
    const state = createMatch({ seed, opponent: kind === 'random-basic' ? 'basic-bot' : 'none' });
    const setup = rngFromSeed(seed + 100003);
    if (g % 3 !== 0) {
      state.sides[0].gold += rngInt(setup, SOAK_MAX_EXTRA_GOLD + 1);
      state.sides[1].gold += rngInt(setup, SOAK_MAX_EXTRA_GOLD + 1);
    }
    const controllers = makeControllers(kind, state.config.seed);
    const stall = new StallDetector();
    const report = (what: string): void => {
      violations += 1;
      if (violations <= 20) console.log(`İHLAL oyun ${g} (seed ${seed}, ${kind}) tick ${state.tick}: ${what}`);
    };
    let stalled = false;
    while (state.outcome === null && state.tick < maxTicks) {
      const goldBefore: [number, number] = [state.sides[0].gold, state.sides[1].gold];
      const events = stepMatch(state, [], controllers);
      for (const p of checkInvariants(state)) report(p);
      for (const p of goldBalanceProblems(goldBefore, state, events)) report(p);
      if (stall.observe(state, events)) {
        report('kilitlenme: 30 sn boyunca hareket ve hasar yok');
        stalled = true;
        break;
      }
    }
    if (state.outcome === null && !stalled) {
      timeouts += 1;
      timeoutsByKind[kind] = (timeoutsByKind[kind] ?? 0) + 1;
      if (IDLE_OPPONENT_KINDS.has(kind)) report(`zaman aşımı: rakibi pasif türde maç ${maxTicks} tick içinde bitmedi`);
    } else if (state.outcome === null) {
      // Kilitlenme zaten ihlal olarak bildirildi.
    } else if (state.outcome.kind === 'draw') draws += 1;
    else wins += 1;
  }

  console.log(`Soak: ${games} oyun (${Object.entries(perKind).map(([k, v]) => `${k}: ${v}`).join(', ')})`);
  console.log(`Galibiyet: ${wins}, beraberlik: ${draws}, zaman aşımı: ${timeouts}`);
  console.log('Zaman aşımı dökümü (türe göre):');
  for (const kind of KINDS) {
    const count = timeoutsByKind[kind] ?? 0;
    const total = perKind[kind] ?? 0;
    const note = IDLE_OPPONENT_KINDS.has(kind)
      ? count > 0
        ? 'İHLAL: rakibi pasif türde zaman aşımı olmamalı'
        : 'beklenen: 0 (rakibi pasif)'
      : 'zaman aşımı olabilir; aynalı takas, ihlal değil (GDD §10)';
    console.log(`  ${kind}: ${count}/${total} (${note})`);
  }
  console.log(`İhlal sayısı: ${violations}`);
  console.log(`Gerçek süre: ${((Date.now() - started) / 1000).toFixed(1)} sn`);
  return violations > 0 ? 1 : 0;
}

function main(): number {
  const { command, opts } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'match':
      return runMatch(opts);
    case 'soak':
      return runSoak(opts);
    default:
      console.log('Kullanım: npm run sim -- match --seed 1 [--max-minutes 60] [--a stacker] [--b basic]  (botlar: stacker | basic | random | idle)');
      console.log('          npm run sim -- soak --games 500 [--seed 1] [--max-minutes 20]');
      return command === 'help' ? 0 : 1;
  }
}

process.exitCode = main();
