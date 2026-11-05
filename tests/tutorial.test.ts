import { describe, expect, it } from 'vitest';
import { TOWERS } from '../src/data/towers';
import { WORLD } from '../src/data/world';
import { STORAGE_KEYS } from '../src/game/constants';
import { Flow } from '../src/game/flow';
import { Session } from '../src/game/session';
import { TUTORIAL, TUTORIAL_STEP_IDS, TUTORIAL_STEPS, type TutorialStepId } from '../src/game/tutorial';
import { loadTutorialStatus, saveTutorialStatus } from '../src/game/tutorialStatus';
import { SafeStorage } from '../src/game/storage';
import { tr } from '../src/i18n/tr';
import { unitOfRole } from '../src/sim/compile';
import { checkInvariants } from '../src/sim/invariants';
import { MemoryStorage } from './persistence-helpers';

const FRONT = unitOfRole(1, 'front')!.def.id;
const RANGED = unitOfRole(1, 'ranged')!.def.id;
const FAST_TOWER = TOWERS.find((t) => t.age === 1 && t.kind === 'fast')!.id;
/** Öğretici 5 dakikanın altında bitmeli (ürün tanımı, başarı ölçütleri). */
const FIVE_MINUTES_TICKS = 5 * 60 * WORLD.tickRate;

function rig(mem = new MemoryStorage()) {
  const session = new Session({ opponent: 'none' });
  const flow = new Flow({ session, storage: mem, newSeed: () => 42, gameVersion: '0.1.0' });
  return { mem, session, flow };
}

/** Oyuncu betiği: her adımda ilgili eylemi yapar (bir "ideal oyuncu"). */
class Player {
  private lastStep: TutorialStepId | null = null;
  private phase = 0;
  constructor(private readonly flow: Flow) {}

  act(tick: number): void {
    const runner = this.flow.tutorial;
    const step = runner?.step;
    if (runner === null || step === null || step === undefined) return;
    const { session } = this.flow;
    if (step.id !== this.lastStep) {
      this.lastStep = step.id;
      this.phase = 0;
    }
    const queue = (unitId: string): void => void session.submit({ type: 'queueUnit', side: 0, unitId });
    switch (step.id) {
      case 'welcome':
        runner.advance();
        break;
      case 'produceFront':
        queue(FRONT);
        break;
      case 'produceRanged':
        if (this.phase === 0) queue(RANGED);
        this.phase = 1;
        break;
      case 'cancelOrder': {
        if (this.phase === 0) {
          queue(FRONT);
          queue(FRONT);
          this.phase = 1;
        } else if (this.phase === 1) {
          const length = session.state.sides[0].queue.length;
          if (length >= 2) session.submit({ type: 'cancelOrder', side: 0, index: length - 1 });
          this.phase = 2;
        }
        break;
      }
      case 'buildTower':
        session.submit({ type: 'buildTower', side: 0, slot: 0, towerId: FAST_TOWER });
        break;
      case 'useAbility':
        session.submit({ type: 'castAbility', side: 0, x: 1100 });
        break;
      case 'ageUp':
        session.submit({ type: 'ageUp', side: 0 });
        break;
      case 'captureStone':
      case 'destroyBase':
        if (tick % 20 === 0) queue(session.state.sides[0].age === 1 ? FRONT : (unitOfRole(session.state.sides[0].age, 'front')?.def.id ?? FRONT));
        break;
      case 'firstKill':
        break;
    }
  }
}

describe('Öğretici: adım sırası ve koşulları (GDD §12)', () => {
  it('on adım GDD sırasıyla tanımlıdır ve her birinin metni vardır', () => {
    expect(TUTORIAL_STEP_IDS).toHaveLength(10);
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([...TUTORIAL_STEP_IDS]);
    for (const id of TUTORIAL_STEP_IDS) {
      expect(tr.tutorial.steps[id]?.title.length, id).toBeGreaterThan(0);
      expect(tr.tutorial.steps[id]?.text.length, id).toBeGreaterThan(0);
    }
    expect(Object.keys(tr.tutorial.steps).sort()).toEqual([...TUTORIAL_STEP_IDS].sort());
  });

  it('ideal oyuncu on adımı sırayla tamamlar, 5 dakikadan kısa sürer, değişmezler korunur', () => {
    const { flow, session } = rig();
    flow.startTutorial();
    const runner = flow.tutorial!;
    const player = new Player(flow);
    const seen: TutorialStepId[] = [runner.step!.id];
    let tick = 0;
    for (; tick < FIVE_MINUTES_TICKS && runner.status === 'running'; tick++) {
      player.act(tick);
      session.advance(1000 / WORLD.tickRate);
      flow.update();
      const id = runner.step?.id;
      if (id !== undefined && id !== seen.at(-1)) {
        seen.push(id);
        expect(checkInvariants(session.state), `adım ${id} girişi`).toEqual([]);
      }
      if (tick % 50 === 0) expect(checkInvariants(session.state), `tick ${tick}`).toEqual([]);
    }
    expect(seen).toEqual([...TUTORIAL_STEP_IDS]);
    expect(runner.status).toBe('completed');
    expect(session.state.outcome).toMatchObject({ kind: 'win', winner: 0 });
    expect(tick).toBeLessThan(FIVE_MINUTES_TICKS);
    expect(flow.tutorialStatus).toBe('completed');
  });

  it('yanlış olay adımı ilerletmez: ön hat adımında menzilli sipariş geçmez, rakibin iptali sayılmaz', () => {
    const { flow, session } = rig();
    flow.startTutorial();
    const runner = flow.tutorial!;
    runner.advance();
    expect(runner.step!.id).toBe('produceFront');
    session.submit({ type: 'queueUnit', side: 0, unitId: RANGED });
    session.advance(50);
    expect(runner.step!.id).toBe('produceFront');
    session.submit({ type: 'queueUnit', side: 0, unitId: FRONT });
    session.advance(50);
    expect(runner.step!.id).toBe('firstKill');
  });

  it('bilgi adımı yalnız Devam ile ilerler; başka adımda advance etkisizdir', () => {
    const { flow, session } = rig();
    flow.startTutorial();
    const runner = flow.tutorial!;
    for (let i = 0; i < 40; i++) {
      session.advance(50);
      flow.update();
    }
    expect(runner.step!.id).toBe('welcome');
    runner.advance();
    expect(runner.step!.id).toBe('produceFront');
    runner.advance();
    expect(runner.step!.id).toBe('produceFront');
  });

  it('adım 3: rakip tek ve zayıf bir birlik gönderir', () => {
    const { flow, session } = rig();
    flow.startTutorial();
    const runner = flow.tutorial!;
    runner.advance();
    session.submit({ type: 'queueUnit', side: 0, unitId: FRONT });
    session.advance(50);
    expect(runner.step!.id).toBe('firstKill');
    const full = unitOfRole(1, 'front')!.def.hp;
    for (let i = 0; i < 200 && !session.state.units.some((u) => u.side === 1); i++) session.advance(50);
    const enemies = session.state.units.filter((u) => u.side === 1);
    expect(enemies).toHaveLength(1);
    expect(enemies[0]!.hp).toBe(Math.floor(full * TUTORIAL.weakUnitHpFraction));
  });

  it('adım 7: rakip küme hâlinde gelir ve yetenek beklemesi sıfırdır; adım 8: deneyim eşiği dolu', () => {
    const { flow, session } = rig();
    flow.startTutorial();
    const runner = flow.tutorial!;
    const player = new Player(flow);
    let sawCluster = false;
    let sawXp = false;
    for (let tick = 0; tick < FIVE_MINUTES_TICKS && runner.status === 'running'; tick++) {
      player.act(tick);
      session.advance(50);
      flow.update();
      if (runner.step?.id === 'useAbility' && !sawCluster) {
        sawCluster = true;
        expect(session.state.units.filter((u) => u.side === 1)).toHaveLength(TUTORIAL.clusterSize);
        expect(session.state.sides[0].abilityCooldown).toBe(0);
      }
      if (runner.step?.id === 'ageUp' && !sawXp) {
        sawXp = true;
        expect(session.check({ type: 'ageUp', side: 0 }).ok).toBe(true);
      }
    }
    expect(sawCluster && sawXp).toBe(true);
  });

  it('üs canı alt sınırı: son adıma dek iki üs de yıkılmaz; son adımda rakip üs canı düşer', () => {
    const { flow, session } = rig();
    flow.startTutorial();
    const runner = flow.tutorial!;
    session.scenarioMutate((s) => {
      s.sides[0].baseHp = 1;
      s.sides[1].baseHp = 1;
    });
    flow.update();
    const half = (side: 0 | 1): number => Math.ceil(session.state.sides[side].baseMaxHp * TUTORIAL.baseHpFloorFraction);
    expect(session.state.sides[0].baseHp).toBe(half(0));
    expect(session.state.sides[1].baseHp).toBe(half(1));
    expect(runner.step!.id).toBe('welcome');
  });

  it('duraklatılmışken (ör. sekme gizli) koşullar değerlendirilmez', () => {
    const { flow, session } = rig();
    flow.startTutorial();
    session.pause();
    session.scenarioMutate((s) => void (s.sides[0].baseHp = 1));
    flow.update();
    expect(session.state.sides[0].baseHp).toBe(1);
    session.resume();
    flow.update();
    expect(session.state.sides[0].baseHp).toBeGreaterThan(1);
  });
});

describe('Öğretici: kayıt, sonuç ve durum bayrağı (ÖK-01, ÖK-02, ÖK-08)', () => {
  function withSave() {
    const r = rig();
    r.flow.startNewMatch('normal');
    for (let i = 0; i < 40; i++) r.session.advance(50);
    r.flow.toMenu();
    expect(r.flow.saveInfo).not.toBeNull();
    return r;
  }

  it('ilk açılışta öğretici önerilir; "Şimdi değil" saklanır ve bir daha önerilmez', () => {
    const r = rig();
    expect(r.flow.tutorialStatus).toBeNull();
    expect(r.flow.tutorialOfferPending).toBe(true);
    r.flow.dismissTutorialOffer();
    expect(r.flow.tutorialOfferPending).toBe(false);
    expect(JSON.parse(r.mem.data.get(STORAGE_KEYS.tutorial)!)).toEqual({ status: 'dismissed' });
    const again = rig(r.mem);
    expect(again.flow.tutorialOfferPending).toBe(false);
    expect(again.flow.tutorialStatus).toBe('dismissed');
  });

  it('durum bayrağı bozuk veriye dayanıklı; tamamlandı asla geri alınmaz', () => {
    const mem = new MemoryStorage();
    const store = new SafeStorage(mem);
    mem.data.set(STORAGE_KEYS.tutorial, '{kırık');
    expect(loadTutorialStatus(store)).toBeNull();
    mem.data.set(STORAGE_KEYS.tutorial, JSON.stringify({ status: 'bilinmeyen' }));
    expect(loadTutorialStatus(store)).toBeNull();
    expect(saveTutorialStatus(store, null, 'skipped')).toBe('skipped');
    expect(saveTutorialStatus(store, 'skipped', 'completed')).toBe('completed');
    expect(saveTutorialStatus(store, 'completed', 'skipped')).toBe('completed');
    expect(loadTutorialStatus(store)).toBe('completed');
  });

  it('atla: durum "skipped" olur, ana menüye dönülür, öğretici maçı kalmaz', () => {
    const r = rig();
    r.flow.startTutorial();
    expect(r.flow.screen).toBe('battle');
    r.flow.skipTutorial();
    expect(r.flow.screen).toBe('menu');
    expect(r.flow.tutorial).toBeNull();
    expect(r.flow.tutorialStatus).toBe('skipped');
    expect(r.flow.tutorialOfferPending).toBe(false);
    expect(rig(r.mem).flow.tutorialStatus).toBe('skipped');
  });

  it('yarıda bırakmak (ana menüye dön) bir daha önermez ama menüden yeniden açılabilir', () => {
    const r = rig();
    r.flow.startTutorial();
    r.flow.toMenu();
    expect(r.flow.tutorialStatus).toBe('dismissed');
    r.flow.startTutorial();
    expect(r.flow.tutorial).not.toBeNull();
  });

  it('öğretici maçı kayıt yazmaz, var olan kaydı ve Devam et durumunu korur', () => {
    const r = withSave();
    const saved = r.mem.data.get(STORAGE_KEYS.save);
    const info = r.flow.saveInfo;
    r.flow.startTutorial();
    for (let i = 0; i < 500; i++) {
      r.session.advance(50);
      r.flow.update();
    }
    r.session.pause();
    expect(r.flow.saveNow()).toBe(false);
    expect(r.mem.data.get(STORAGE_KEYS.save)).toBe(saved);
    r.flow.toMenu();
    expect(r.flow.saveInfo).toEqual(info);
    expect(r.mem.data.get(STORAGE_KEYS.save)).toBe(saved);
    // Devam et hâlâ eski maçı yükler.
    expect(r.flow.continueSaved()).toBe(true);
    expect(r.session.matchConfig.opponent).toBe('normal');
  });

  it('öğretici tamamlanınca sonuç geçmişi ve kayıt değişmez, durum "completed" olur', () => {
    const r = withSave();
    const saved = r.mem.data.get(STORAGE_KEYS.save);
    r.flow.startTutorial();
    const runner = r.flow.tutorial!;
    const player = new Player(r.flow);
    for (let tick = 0; tick < FIVE_MINUTES_TICKS && runner.status === 'running'; tick++) {
      player.act(tick);
      r.session.advance(50);
      r.flow.update();
    }
    expect(runner.status).toBe('completed');
    expect(r.flow.tutorialStatus).toBe('completed');
    expect(r.flow.results.entries).toHaveLength(0);
    expect(r.mem.data.has(STORAGE_KEYS.results)).toBe(false);
    expect(r.mem.data.get(STORAGE_KEYS.save)).toBe(saved);
    expect(r.flow.saveInfo).not.toBeNull();
    r.flow.toMenu();
    expect(r.flow.screen).toBe('menu');
    expect(r.flow.tutorial).toBeNull();
    expect(r.flow.results.entries).toHaveLength(0);
    // Atlama tamamlanmış durumu ezmez.
    r.flow.startTutorial();
    r.flow.skipTutorial();
    expect(r.flow.tutorialStatus).toBe('completed');
  });

  it('öğretici yalnız ana menüden başlar', () => {
    const r = rig();
    r.flow.startNewMatch('easy');
    r.flow.startTutorial();
    expect(r.flow.tutorial).toBeNull();
  });
});
