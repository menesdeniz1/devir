import { describe, expect, it } from 'vitest';
import { MUSIC } from '../src/audio/config';
import { composeSong } from '../src/audio/music/compose';
import { INSTRUMENT_IDS, type InstrumentId } from '../src/audio/music/instruments';
import { MusicPlayer } from '../src/audio/music/player';
import {
  MAX_LAG_SEC,
  effectiveBpm,
  loopDurationSec,
  planSteps,
  rewindToUnplayed,
  stepDurationSec,
  type PlannedStep,
  type SeqState,
} from '../src/audio/music/sequencer';
import { SONGS, STEPS_PER_BAR, songDefForAge } from '../src/audio/music/songs';
import { SCALES, degreeToMidi } from '../src/audio/music/theory';
import { FakeContext, FakeGain, FakeTimer } from './audio-helpers';

const AGES = [1, 2, 3, 4, 5];

function instrumentsOf(age: number): Set<InstrumentId> {
  return new Set(songDefForAge(age)!.tracks.map((t) => t.instrument));
}

describe('Müzik tanımları (çağ başına)', () => {
  it('her çağ için bir müzik tanımı var ve kimlikler benzersiz', () => {
    for (const age of AGES) expect(songDefForAge(age), `çağ ${age}`).toBeDefined();
    expect(SONGS).toHaveLength(5);
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(5);
  });

  it('döngü süresi 60-90 sn; tempo çağ ilerledikçe artar', () => {
    let prevBpm = 0;
    for (const age of AGES) {
      const song = composeSong(songDefForAge(age)!);
      const sec = loopDurationSec(song.bpm, song.totalSteps);
      expect(sec, `çağ ${age}`).toBeGreaterThanOrEqual(MUSIC.minLoopSec);
      expect(sec, `çağ ${age}`).toBeLessThanOrEqual(MUSIC.maxLoopSec);
      expect(song.bpm).toBeGreaterThan(prevBpm);
      prevBpm = song.bpm;
    }
  });

  it('veri geçerli: desenler 16 adım, motifler 32 adım içinde, parçaların bölüm maskesi 4 uzunlukta', () => {
    for (const def of SONGS) {
      expect(def.bars % 8).toBe(0);
      expect(def.progression).toHaveLength(8);
      for (const m of [def.motifA, def.motifB]) {
        for (const [step, , len] of m) {
          expect(step).toBeGreaterThanOrEqual(0);
          expect(step + len).toBeLessThanOrEqual(2 * STEPS_PER_BAR);
        }
      }
      for (const t of def.tracks) {
        expect(t.sections).toHaveLength(4);
        expect(INSTRUMENT_IDS).toContain(t.instrument);
        for (const p of [...(t.patterns ?? []), ...(t.fill ? [t.fill] : [])]) expect(p, `${def.id}/${t.instrument}`).toMatch(/^[xo.]{16}$/);
        if (t.kind === 'rhythm' || t.kind === 'bass' || t.kind === 'arp') expect(t.patterns?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('enstrüman paleti çağ ilerledikçe değişir (GDD §15)', () => {
    const has = (age: number, ...ids: InstrumentId[]) => ids.every((i) => instrumentsOf(age).has(i));
    expect(has(1, 'frameDrum', 'boneFlute')).toBe(true);
    expect(has(2, 'lyre', 'bronzeBell')).toBe(true);
    expect(has(3, 'organ', 'strings')).toBe(true);
    expect(has(4, 'brass', 'clank')).toBe(true);
    expect(has(5, 'synthLead', 'eKick')).toBe(true);
    // Ardışık olmayan çağların paletleri ortak enstrüman paylaşmaz.
    for (const a of AGES) {
      for (const b of AGES) {
        if (b - a < 2) continue;
        const shared = [...instrumentsOf(a)].filter((i) => instrumentsOf(b).has(i));
        expect(shared, `çağ ${a} ve ${b}`).toEqual([]);
      }
    }
  });

  it('besteleme: tam döngü adım sayısı, ilk adımda nota, ezgi dizi içinde kalır, gerilim katmanı var', () => {
    for (const age of AGES) {
      const def = songDefForAge(age)!;
      const song = composeSong(def);
      expect(song.totalSteps).toBe(def.bars * STEPS_PER_BAR);
      expect(song.byStep).toHaveLength(song.totalSteps);
      expect(song.byStep[0]!.length).toBeGreaterThan(0);
      const all = song.byStep.flat();
      expect(all.some((n) => n.minTension > 0), `çağ ${age} gerilim katmanı`).toBe(true);
      for (const n of all) {
        expect(n.midi).toBeGreaterThanOrEqual(20);
        expect(n.midi).toBeLessThanOrEqual(110);
        expect(n.gain).toBeGreaterThan(0);
        expect(n.durSteps).toBeGreaterThan(0);
      }
      // Bölümler farklılaşır: ilk bölümde ikinci bölümden daha az nota.
      const section = (i: number) => song.byStep.slice(i * 8 * STEPS_PER_BAR, (i + 1) * 8 * STEPS_PER_BAR).flat().length;
      expect(section(1)).toBeGreaterThan(section(0));
      // Melodi her çağda kök notaya çözülerek biter (son cümle kapanışı).
      const melodyInst = def.tracks.filter((t) => t.kind === 'melody').map((t) => t.instrument);
      const lastSection = song.byStep.slice(3 * 8 * STEPS_PER_BAR).flat().filter((n) => melodyInst.includes(n.instrument));
      expect(lastSection.length).toBeGreaterThan(0);
    }
  });

  it('besteleme deterministiktir', () => {
    const a = composeSong(songDefForAge(3)!);
    const b = composeSong(songDefForAge(3)!);
    expect(JSON.stringify(a.byStep)).toBe(JSON.stringify(b.byStep));
  });

  it('derece -> MIDI: oktav taşması ve negatif dereceler', () => {
    const s = SCALES.dorian;
    expect(degreeToMidi(s, 60, 0)).toBe(60);
    expect(degreeToMidi(s, 60, 7)).toBe(72);
    expect(degreeToMidi(s, 60, -1)).toBe(58);
    expect(degreeToMidi(SCALES.minorPent, 50, 5)).toBe(62);
  });
});

describe('Adım sıralayıcı zamanlama hesabı (saf)', () => {
  it('adım süresi: 120 bpm onaltılık = 0,125 sn; gerilim tempoyu en çok tempoBoost kadar artırır', () => {
    expect(stepDurationSec(120, 0)).toBeCloseTo(0.125, 10);
    expect(effectiveBpm(100, 1)).toBeCloseTo(100 * (1 + MUSIC.tempoBoost), 10);
    expect(effectiveBpm(100, 5)).toBeCloseTo(100 * (1 + MUSIC.tempoBoost), 10);
    expect(effectiveBpm(100, -1)).toBe(100);
    expect(stepDurationSec(120, 1)).toBeLessThan(stepDurationSec(120, 0));
  });

  it('ileri bakış penceresi: yalnız pencereye giren adımlar planlanır, zamanlar adım süresi aralıklıdır', () => {
    const start: SeqState = { step: 0, time: 1, loop: 0 };
    const { planned, state } = planSteps(start, 1, 0.4, 0.125, 256);
    expect(planned.map((p) => p.step)).toEqual([0, 1, 2, 3]);
    expect(planned.map((p) => p.time)).toEqual([1, 1.125, 1.25, 1.375]);
    expect(state).toEqual({ step: 4, time: 1.5, loop: 0 });
    expect(start).toEqual({ step: 0, time: 1, loop: 0 }); // girdi değişmez
  });

  it('art arda turlar kopuk veya çift adım üretmez', () => {
    let state: SeqState = { step: 0, time: 0, loop: 0 };
    const all: PlannedStep[] = [];
    for (let now = 0; now < 5; now += 0.08) {
      const r = planSteps(state, now, 0.4, 0.125, 64);
      all.push(...r.planned);
      state = r.state;
    }
    for (let i = 1; i < all.length; i++) {
      expect(all[i]!.time - all[i - 1]!.time).toBeCloseTo(0.125, 9);
      const expectedStep = (all[i - 1]!.step + 1) % 64;
      expect(all[i]!.step).toBe(expectedStep);
    }
  });

  it('döngü sonunda 0. adıma sarar ve döngü sayısı artar', () => {
    const { planned, state } = planSteps({ step: 62, time: 0, loop: 0 }, 0, 0.5, 0.125, 64);
    expect(planned.map((p) => [p.step, p.loop])).toEqual([[62, 0], [63, 0], [0, 1], [1, 1]]);
    expect(state.step).toBe(2);
    expect(state.loop).toBe(1);
  });

  it('büyük gecikmede (duraklama sonrası) toplu patlama yerine şimdiye yeniden hizalanır', () => {
    const lagging: SeqState = { step: 10, time: 1, loop: 0 };
    const { planned } = planSteps(lagging, 1 + MAX_LAG_SEC + 5, 0.4, 0.125, 64);
    expect(planned[0]!.step).toBe(10);
    expect(planned[0]!.time).toBeGreaterThanOrEqual(1 + MAX_LAG_SEC + 5);
    expect(planned.length).toBeLessThanOrEqual(5);
  });

  it('küçük gecikme (zamanlayıcı titremesi) adımları atlamaz', () => {
    const { planned } = planSteps({ step: 3, time: 0.95, loop: 0 }, 1, 0.4, 0.125, 64);
    expect(planned[0]).toEqual({ step: 3, time: 0.95, loop: 0 });
  });

  it('duraklamada henüz çalınmamış en erken adıma geri sarılır', () => {
    const recent: PlannedStep[] = [
      { step: 5, time: 0.9, loop: 0 },
      { step: 6, time: 1.025, loop: 0 },
      { step: 7, time: 1.15, loop: 0 },
    ];
    const state: SeqState = { step: 8, time: 1.275, loop: 0 };
    expect(rewindToUnplayed(state, recent, 1)).toEqual({ step: 6, time: 1.025, loop: 0 });
    expect(rewindToUnplayed(state, [], 1)).toEqual(state);
  });

  it('gerilim döngüyü kısaltır', () => {
    expect(loopDurationSec(100, 512, 1)).toBeLessThan(loopDurationSec(100, 512, 0));
  });
});

describe('MusicPlayer (sahte ses bağlamı)', () => {
  function setup() {
    const ctx = new FakeContext();
    const timer = new FakeTimer();
    const out = ctx.createGain() as FakeGain;
    const player = new MusicPlayer({ ctx, output: out, timer, sampleRate: 8000 });
    return { ctx, timer, out, player };
  }

  it('setAge notaları ileri bakışla zamanlar; zamanlayıcı ilerledikçe yenileri eklenir', () => {
    const { ctx, timer, player } = setup();
    player.setAge(1);
    expect(player.age).toBe(1);
    expect(timer.running).toBe(true);
    const first = ctx.sources.length;
    expect(first).toBeGreaterThan(0);
    for (const s of ctx.sources) expect(s.startedAt).toBeLessThanOrEqual(MUSIC.lookaheadSec + MUSIC.restartPadSec + 1e-9);
    ctx.currentTime = 1;
    timer.fire();
    expect(ctx.sources.length).toBeGreaterThan(first);
  });

  it('aynı çağ tekrar istenirse bir şey yapmaz; çağ değişimi eskiyi söndürüp yenisini açar', () => {
    const { ctx, player, out } = setup();
    player.setAge(1);
    const gains = ctx.gains.length;
    player.setAge(1);
    expect(ctx.gains.length).toBe(gains);
    ctx.currentTime = 5;
    player.setAge(2);
    expect(player.age).toBe(2);
    const trackGains = ctx.gains.filter((g) => g.connections.includes(out));
    expect(trackGains).toHaveLength(2);
    expect(trackGains[0]!.gain.ramps.at(-1)).toMatchObject({ value: 0, time: 5 + MUSIC.crossfadeSec });
    expect(trackGains[1]!.gain.ramps.at(-1)).toMatchObject({ value: MUSIC.levelTrim[1], time: 5 + MUSIC.crossfadeSec });
  });

  it('geçersiz çağ yok sayılır', () => {
    const { player } = setup();
    player.setAge(99);
    expect(player.age).toBeNull();
  });

  it('gerilim eşiği altındaki katmanlar çalmaz, eşik aşılınca çalar', () => {
    const run = (tension: number) => {
      const { ctx, timer, player } = setup();
      player.setTension(tension);
      player.setAge(1);
      for (let t = 0; t < 12; t += 0.2) {
        ctx.currentTime = t;
        timer.fire();
      }
      return ctx.sources.length;
    };
    expect(run(1)).toBeGreaterThan(run(0));
  });

  it('pause: zamanlayıcı durur, planlı notalar iptal edilir; resume aynı konumdan sürer', () => {
    const { ctx, timer, player } = setup();
    player.setAge(2);
    ctx.currentTime = 0.5;
    timer.fire();
    const before = ctx.sources.length;
    player.pause();
    expect(player.isPaused).toBe(true);
    expect(timer.running).toBe(false);
    expect(ctx.sources.filter((s) => s.startedAt! > 0.5).every((s) => s.stoppedAt !== null)).toBe(true);
    ctx.currentTime = 30;
    timer.fire(); // zamanlayıcı yok; çağrı etkisiz
    expect(ctx.sources.length).toBe(before);
    player.resume();
    expect(timer.running).toBe(true);
    expect(ctx.sources.length).toBeGreaterThan(before);
    const resumed = ctx.sources.slice(before);
    for (const s of resumed) expect(s.startedAt).toBeGreaterThanOrEqual(30);
  });

  it('dispose her şeyi kapatır; sonrası güvenli', () => {
    const { timer, player } = setup();
    player.setAge(3);
    player.dispose();
    expect(timer.running).toBe(false);
    expect(() => {
      player.setAge(4);
      player.tick();
      player.pause();
      player.resume();
      player.dispose();
    }).not.toThrow();
    expect(player.age).toBeNull();
  });
});
