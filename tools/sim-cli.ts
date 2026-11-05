import { createBasicBot } from '../src/ai/basicBot';
import type { Controller } from '../src/ai/controller';
import { createDefenderBot, createMonoBot, createRandomBot, createStackerBot } from '../src/ai/testBots';
import { ABILITIES } from '../src/data/abilities';
import type { Role } from '../src/data/types';
import { runBattle, repeatUnit, type BattleResult } from '../src/match/matchup';
import { UNITS } from '../src/data/units';
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

/** Maç boyunca Sınır Taşı sahipliği tick sayıları: [taraf 0, taraf 1]. */
type StoneTicks = [number, number];

function printSummary(state: GameState, stoneTicks?: StoneTicks): void {
  console.log(`Sonuç: ${describeOutcome(state.outcome)}`);
  console.log(`Süre: ${formatTime(state.tick)} (${state.tick} tick)`);
  for (const side of [0, 1] as const) {
    const s = state.sides[side];
    console.log(
      `Taraf ${side}: kazanılan altın ${s.stats.goldEarned}, harcanan ${s.stats.goldSpent}, ` +
        `üretilen ${sum(s.stats.produced)}, kaybedilen ${sum(s.stats.lost)}, üs canı ${s.baseHp}/${s.baseMaxHp}`,
    );
  }
  for (const side of [0, 1] as const) {
    const s = state.sides[side];
    const times = s.stats.ageUpTicks.map((tick, i) => `${i + 2}. çağ ${formatTime(tick)}`);
    console.log(`Taraf ${side}: çağ ${s.age}, deneyim ${s.xp}, çağ geçişleri: ${times.length > 0 ? times.join(', ') : 'yok'}`);
  }
  if (stoneTicks !== undefined) {
    const neutral = state.tick - stoneTicks[0] - stoneTicks[1];
    console.log(
      `Sınır Taşı sahipliği: taraf 0 ${formatTime(stoneTicks[0])}, taraf 1 ${formatTime(stoneTicks[1])}, sahipsiz ${formatTime(neutral)}`,
    );
  }
  console.log(`Son karma: ${stateHash(state)}`);
}

const BOT_NAMES = ['stacker', 'basic', 'random', 'defender', 'mono-front', 'mono-ranged', 'mono-heavy', 'idle'] as const;

function makeBot(name: string, configSeed: number, side: SideId): Controller | null {
  switch (name) {
    case 'stacker':
      return createStackerBot();
    case 'basic':
      return createBasicBot();
    case 'random':
      return createRandomBot(configSeed, side);
    case 'defender':
      return createDefenderBot();
    case 'mono-front':
      return createMonoBot('front');
    case 'mono-ranged':
      return createMonoBot('ranged');
    case 'mono-heavy':
      return createMonoBot('heavy');
    case 'idle':
      return null;
    default:
      throw new Error(`Bilinmeyen bot: ${name} (${BOT_NAMES.join(' | ')})`);
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
  const stoneTicks: StoneTicks = [0, 0];
  while (state.outcome === null && state.tick < maxTicks) {
    stepMatch(state, [], controllers);
    if (state.stone.owner !== null) stoneTicks[state.stone.owner] += 1;
  }
  printSummary(state, stoneTicks);
  return 0;
}

/** Soak türü: [taraf 0 botu, taraf 1 botu]. Adı `${a}-${b}`. */
type Kind = readonly [string, string];
const kindName = (kind: Kind): string => `${kind[0]}-${kind[1]}`;

/** Rakibi pasif ('idle') olan türler: üssü savunmasız rakibe karşı maç mutlaka bitmelidir; zaman aşımı ihlaldir. */
const isIdleOpponent = (kind: Kind): boolean => kind[1] === 'idle';
const KINDS: readonly Kind[] = [
  ['random', 'random'],
  ['random', 'basic'],
  ['stacker', 'random'],
  ['stacker', 'basic'],
  ['stacker', 'idle'],
  ['random', 'idle'],
  ['mono-front', 'basic'],
  ['mono-ranged', 'basic'],
  ['mono-heavy', 'basic'],
  ['mono-front', 'idle'],
  ['mono-ranged', 'idle'],
  ['mono-heavy', 'idle'],
  ['mono-heavy', 'mono-ranged'],
  ['mono-front', 'mono-heavy'],
  ['defender', 'random'],
  ['defender', 'basic'],
  ['stacker', 'defender'],
  ['defender', 'idle'],
  ['basic', 'basic'],
  ['stacker', 'stacker'],
  ['mono-front', 'mono-ranged'],
];
/** Soak maçlarında başlangıç altınına eklenen en büyük rastgele ek (büyük orduları, dolu kuyruğu ve doğma engelini zorlar). */
const SOAK_MAX_EXTRA_GOLD = 3000;
/** Soak maçlarında başlangıç deneyimine eklenen en büyük rastgele ek (çağ atlamayı ve geç çağ birliklerini erken zorlar). */
const SOAK_MAX_EXTRA_XP = 12000;

function runSoak(opts: Record<string, string>): number {
  const games = numOpt(opts, 'games', 500);
  const baseSeed = numOpt(opts, 'seed', 1);
  const maxTicks = Math.round(numOpt(opts, 'max-minutes', 20) * 60 * WORLD.tickRate);
  let wins = 0;
  let draws = 0;
  let timeouts = 0;
  let violations = 0;
  let agedGames = 0;
  let maxAgeGames = 0;
  let stoneCaptures = 0;
  let abilityRejects = 0;
  let abilityKills = 0;
  const abilityCasts: Record<string, number> = {};
  const perKind: Record<string, number> = {};
  const timeoutsByKind: Record<string, number> = {};
  const started = Date.now();

  for (let g = 0; g < games; g++) {
    const seed = baseSeed + g;
    const kindDef = KINDS[g % KINDS.length]!;
    const kind = kindName(kindDef);
    perKind[kind] = (perKind[kind] ?? 0) + 1;
    const state = createMatch({ seed, opponent: kindDef[1] === 'basic' ? 'basic-bot' : 'none' });
    const setup = rngFromSeed(seed + 100003);
    if (g % 3 !== 0) {
      state.sides[0].gold += rngInt(setup, SOAK_MAX_EXTRA_GOLD + 1);
      state.sides[1].gold += rngInt(setup, SOAK_MAX_EXTRA_GOLD + 1);
      state.sides[0].xp += rngInt(setup, SOAK_MAX_EXTRA_XP + 1);
      state.sides[1].xp += rngInt(setup, SOAK_MAX_EXTRA_XP + 1);
    }
    const controllers: [Controller | null, Controller | null] = [
      makeBot(kindDef[0], state.config.seed, 0),
      makeBot(kindDef[1], state.config.seed, 1),
    ];
    const stall = new StallDetector();
    const report = (what: string): void => {
      violations += 1;
      if (violations <= 20) console.log(`İHLAL oyun ${g} (seed ${seed}, ${kind}) tick ${state.tick}: ${what}`);
    };
    let stalled = false;
    while (state.outcome === null && state.tick < maxTicks) {
      const goldBefore: [number, number] = [state.sides[0].gold, state.sides[1].gold];
      const events = stepMatch(state, [], controllers);
      for (const e of events) {
        if (e.type === 'stoneCaptured') stoneCaptures += 1;
        else if (e.type === 'abilityCast') abilityCasts[e.abilityId] = (abilityCasts[e.abilityId] ?? 0) + 1;
        else if (e.type === 'commandRejected' && e.command.type === 'castAbility') abilityRejects += 1;
      }
      for (const p of checkInvariants(state)) report(p);
      for (const p of goldBalanceProblems(goldBefore, state, events)) report(p);
      if (stall.observe(state, events)) {
        report('kilitlenme: 30 sn boyunca hareket ve hasar yok');
        stalled = true;
        break;
      }
    }
    for (const side of state.sides) for (const id of ABILITIES.map((a) => a.id)) abilityKills += side.stats.kills[id] ?? 0;
    if (state.sides[0].age > 1 || state.sides[1].age > 1) agedGames += 1;
    if (state.sides[0].age === 5 || state.sides[1].age === 5) maxAgeGames += 1;
    if (state.outcome === null && !stalled) {
      timeouts += 1;
      timeoutsByKind[kind] = (timeoutsByKind[kind] ?? 0) + 1;
      if (isIdleOpponent(kindDef)) report(`zaman aşımı: rakibi pasif türde maç ${maxTicks} tick içinde bitmedi`);
    } else if (state.outcome === null) {
      // Kilitlenme zaten ihlal olarak bildirildi.
    } else if (state.outcome.kind === 'draw') draws += 1;
    else wins += 1;
  }

  console.log(`Soak: ${games} oyun (${Object.entries(perKind).map(([k, v]) => `${k}: ${v}`).join(', ')})`);
  console.log(`Galibiyet: ${wins}, beraberlik: ${draws}, zaman aşımı: ${timeouts}`);
  console.log(`Çağ atlanan oyun: ${agedGames}, 5. çağa ulaşılan oyun: ${maxAgeGames}, Sınır Taşı ele geçirme: ${stoneCaptures}`);
  const totalCasts = Object.values(abilityCasts).reduce((a, b) => a + b, 0);
  console.log(
    `Yetenek kullanımı: ${totalCasts} (${ABILITIES.map((a) => `${a.id}: ${abilityCasts[a.id] ?? 0}`).join(', ')}), bekleme reddi: ${abilityRejects}, yetenekle öldürülen birlik: ${abilityKills}`,
  );
  console.log('Zaman aşımı dökümü (türe göre):');
  for (const kindDef of KINDS) {
    const kind = kindName(kindDef);
    const count = timeoutsByKind[kind] ?? 0;
    const total = perKind[kind] ?? 0;
    const note = isIdleOpponent(kindDef)
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

// ---- tournament: iki botun dönüşümlü taraflarla eşleşmesi ----------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percent(count: number, total: number): string {
  return total === 0 ? '0.0%' : `${((count / total) * 100).toFixed(1)}%`;
}

/** İki botu N maç oynatır; çift numaralı maçlarda A taraf 0, tek numaralılarda taraf 1'dedir (GDD §10). */
function runTournament(opts: Record<string, string>): number {
  const nameA = opts['a'] ?? 'defender';
  const nameB = opts['b'] ?? 'basic';
  const games = numOpt(opts, 'games', 200);
  const baseSeed = numOpt(opts, 'seed', 1);
  const maxTicks = Math.round(numOpt(opts, 'max-minutes', 20) * 60 * WORLD.tickRate);
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let timeouts = 0;
  let winsAAsSide0 = 0;
  const finishedTicks: number[] = [];
  const started = Date.now();

  for (let g = 0; g < games; g++) {
    const seed = baseSeed + g;
    const aSide: SideId = g % 2 === 0 ? 0 : 1;
    const state = createMatch({ seed, opponent: nameA === 'basic' || nameB === 'basic' ? 'basic-bot' : 'none' });
    const botA = makeBot(nameA, state.config.seed, aSide);
    const botB = makeBot(nameB, state.config.seed, aSide === 0 ? 1 : 0);
    const controllers: [Controller | null, Controller | null] = aSide === 0 ? [botA, botB] : [botB, botA];
    while (state.outcome === null && state.tick < maxTicks) stepMatch(state, [], controllers);
    if (state.outcome === null) {
      timeouts += 1;
      continue;
    }
    finishedTicks.push(state.tick);
    if (state.outcome.kind === 'draw') draws += 1;
    else if (state.outcome.winner === aSide) {
      winsA += 1;
      if (aSide === 0) winsAAsSide0 += 1;
    } else winsB += 1;
  }

  console.log(`Turnuva: A=${nameA} vs B=${nameB}, ${games} maç, taraflar dönüşümlü, tohum ${baseSeed}…${baseSeed + games - 1}, üst süre ${(maxTicks / WORLD.tickRate / 60).toFixed(0)} dk`);
  console.log(`A kazandı: ${winsA} (${percent(winsA, games)}), B kazandı: ${winsB} (${percent(winsB, games)}), beraberlik: ${draws} (${percent(draws, games)}), zaman aşımı: ${timeouts} (${percent(timeouts, games)})`);
  console.log(`A'nın taraf 0'daki galibiyeti: ${winsAAsSide0}/${Math.ceil(games / 2)}, taraf 1'deki: ${winsA - winsAAsSide0}/${Math.floor(games / 2)}`);
  console.log(`Biten maçların medyan süresi: ${finishedTicks.length === 0 ? '-' : formatTime(median(finishedTicks))} (${finishedTicks.length} maç)`);
  console.log(`Gerçek süre: ${((Date.now() - started) / 1000).toFixed(1)} sn`);
  return 0;
}

// ---- matchup: karşılık matrisi ---------------------------------------------------

const ROLE_UNIT: Record<Role, string> = { front: 'primitive_front', ranged: 'primitive_ranged', heavy: 'primitive_heavy' };
const ROLE_LABEL: Record<Role, string> = { front: 'ön hat', ranged: 'menzilli', heavy: 'ağır' };
/** Tek rol ordularının büyüklüğü (≈480 altın; test yoğunluğu, denge değil). */
const MONO_COUNTS: Record<Role, number> = { front: 9, ranged: 7, heavy: 3 };
const ROLES: readonly Role[] = ['front', 'ranged', 'heavy'];

interface NamedArmy {
  label: string;
  units: string[];
  cost: number;
}

function army(label: string, parts: readonly (readonly [Role, number])[]): NamedArmy {
  const units = parts.flatMap(([role, count]) => repeatUnit(ROLE_UNIT[role], count));
  const cost = units.reduce((total, id) => total + (UNITS.find((u) => u.id === id)?.cost ?? 0), 0);
  return { label, units, cost };
}

function describeBattle(r: BattleResult): string {
  const who = r.timedOut ? 'ZAMAN AŞIMI' : r.winner === null ? 'BERABERE' : r.winner === 0 ? 'SOL' : 'SAĞ';
  const hp = Math.round(r.remainingHp[0] + r.remainingHp[1]);
  return `${who} · ${hp} can · ${(r.ticks / WORLD.tickRate).toFixed(1)} sn`;
}

function runMatchup(): number {
  const monos = ROLES.map((role) => army(`${MONO_COUNTS[role]} ${ROLE_LABEL[role]}`, [[role, MONO_COUNTS[role]]]));
  const mixes: NamedArmy[] = [
    army('4 ön hat + 4 menzilli', [['front', 4], ['ranged', 4]]),
    army('3 ön hat + 2 menzilli + 1 ağır', [['front', 3], ['ranged', 2], ['heavy', 1]]),
    army('2 ön hat + 2 menzilli + 1 ağır', [['front', 2], ['ranged', 2], ['heavy', 1]]),
    army('2 ön hat + 2 ağır', [['front', 2], ['heavy', 2]]),
  ];

  console.log('Karşılık matrisi — tek rol, ≈480 altın (satır: sol taraf, sütun: sağ taraf). Hücre: kazanan · kalan toplam can · süre');
  console.log(`Ordular: ${monos.map((m) => `${m.label} (${m.cost} altın)`).join(', ')}`);
  for (const row of monos) {
    for (const col of monos) {
      console.log(`  ${row.label.padEnd(12)} vs ${col.label.padEnd(12)} → ${describeBattle(runBattle(row.units, col.units))}`);
    }
  }

  console.log('');
  console.log('Karma ordu vs tek rol (karma solda, tek rol sağda; karma ordu önden arkaya ön hat → menzilli → ağır dizilir)');
  for (const mix of mixes) {
    for (const mono of monos) {
      console.log(`  ${mix.label.padEnd(32)} (${mix.cost}) vs ${mono.label.padEnd(12)} → ${describeBattle(runBattle(mix.units, mono.units))}`);
    }
  }

  console.log('');
  console.log('Yol haritası Aşama 2 karşılık kontrolleri (iki taraf düzeninde de aynı sonuç beklenir)');
  const checks: { label: string; left: NamedArmy; right: NamedArmy }[] = [
    { label: '(a) 9 ön hat > 3 ağır', left: monos[0]!, right: monos[2]! },
    { label: '(b) 3 ağır > 7 menzilli', left: monos[2]!, right: monos[1]! },
    { label: '(c) 4 ön hat + 4 menzilli > 9 ön hat', left: mixes[0]!, right: monos[0]! },
  ];
  let failed = 0;
  for (const check of checks) {
    const asLeft = runBattle(check.left.units, check.right.units);
    const asRight = runBattle(check.right.units, check.left.units);
    const ok = asLeft.winner === 0 && asRight.winner === 1;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'TUTTU ' : 'TUTMADI'} ${check.label}: ${describeBattle(asLeft)} | taraflar değişince: ${describeBattle(asRight)}`);
  }
  console.log(failed === 0 ? 'Üç kontrol de tuttu.' : `${failed} kontrol tutmadı (denge kararı lead'e aittir).`);
  return 0;
}

function main(): number {
  const { command, opts } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'match':
      return runMatch(opts);
    case 'soak':
      return runSoak(opts);
    case 'matchup':
      return runMatchup();
    case 'tournament':
      return runTournament(opts);
    default:
      console.log('Kullanım: npm run sim -- match --seed 1 [--max-minutes 60] [--a stacker] [--b basic]  (botlar: ' + BOT_NAMES.join(' | ') + ')');
      console.log('          npm run sim -- soak --games 500 [--seed 1] [--max-minutes 20]');
      console.log('          npm run sim -- tournament --a defender --b random --games 200 [--seed 1] [--max-minutes 20]');
      console.log('          npm run sim -- matchup   (karşılık matrisi ve karma-vs-tek rol sonuçları)');
      return command === 'help' ? 0 : 1;
  }
}

process.exitCode = main();
