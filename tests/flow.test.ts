import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/data/world';
import { SAVE_INTERVAL_SEC, STORAGE_KEYS } from '../src/game/constants';
import { Flow, type FlowEvent, type FlowNotice } from '../src/game/flow';
import type { SaveFailure } from '../src/game/save';
import { Session, type VisibilitySource } from '../src/game/session';
import { tr } from '../src/i18n/tr';
import { stateHash } from '../src/sim/hash';
import { noticeText } from '../src/ui/screens';
import { MemoryStorage } from './persistence-helpers';
import { FRONT_ID } from './helpers';

const INTERVAL_TICKS = SAVE_INTERVAL_SEC * WORLD.tickRate;
const VERSION = '0.1.0';

function fakeVisibility(): VisibilitySource & { visibilityState: string; fire(): void } {
  const listeners = new Set<() => void>();
  return {
    visibilityState: 'visible',
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
    fire() {
      for (const l of [...listeners]) l();
    },
  };
}

interface Rig {
  mem: MemoryStorage;
  session: Session;
  flow: Flow;
  visibility: ReturnType<typeof fakeVisibility>;
  events: FlowEvent[];
  notices: FlowNotice[];
  clock: { now: number };
}

function rig(mem = new MemoryStorage()): Rig {
  const visibility = fakeVisibility();
  const session = new Session({ opponent: 'none', visibility });
  const clock = { now: 1000 };
  let seed = 100;
  const flow = new Flow({ session, storage: mem, now: () => clock.now, newSeed: () => seed++, gameVersion: VERSION });
  const events: FlowEvent[] = [];
  const notices: FlowNotice[] = [];
  flow.subscribe((e) => events.push(e));
  flow.subscribeNotices((n) => notices.push(n));
  return { mem, session, flow, visibility, events, notices, clock };
}

/** Bir kare = bir tick (50 ms). */
function run(r: Rig, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    r.session.advance(50);
    r.flow.update();
  }
}

describe('Flow: ekran akışı', () => {
  it('açılışta ana menü, oturum duraklatılmış, kayıt yok', () => {
    const r = rig();
    expect(r.flow.screen).toBe('menu');
    expect(r.session.paused).toBe(true);
    expect(r.flow.saveInfo).toBeNull();
    expect(r.flow.settingsOpen).toBe(false);
  });

  it('menü → kurulum → geri; kurulum yalnız menüden açılır', () => {
    const r = rig();
    r.flow.openSetup();
    expect(r.flow.screen).toBe('setup');
    r.flow.closeSetup();
    expect(r.flow.screen).toBe('menu');
    r.flow.startNewMatch('easy');
    r.flow.openSetup();
    expect(r.flow.screen).toBe('battle');
  });

  it('yeni maç: seçilen zorluk, her maç için yeni tohum, temiz durum', () => {
    const r = rig();
    r.flow.startNewMatch('hard');
    expect(r.flow.screen).toBe('battle');
    expect(r.session.paused).toBe(false);
    expect(r.session.matchConfig).toEqual({ seed: 100, opponent: 'hard' });
    expect(r.session.tick).toBe(0);
    r.flow.toMenu();
    r.flow.startNewMatch('hard', true);
    expect(r.session.matchConfig.seed).toBe(101);
  });

  it('ayarlar katmanı açılıp kapanır ve ana menüye dönüşte kapanır', () => {
    const r = rig();
    r.flow.startNewMatch('easy');
    r.flow.openSettings();
    expect(r.flow.settingsOpen).toBe(true);
    r.flow.toMenu();
    expect(r.flow.settingsOpen).toBe(false);
  });
});

describe('Flow: kayıt zamanları (ÖK-03, TDD §9)', () => {
  it('periyodik kayıt: her 200 tick oyun süresinde bir', () => {
    const r = rig();
    r.flow.startNewMatch('easy');
    run(r, INTERVAL_TICKS - 1);
    expect(r.mem.data.has(STORAGE_KEYS.save)).toBe(false);
    run(r, 1);
    expect(r.mem.data.has(STORAGE_KEYS.save)).toBe(true);
    expect(r.flow.saveInfo?.tick).toBe(INTERVAL_TICKS);
    const first = r.mem.writeAttempts;
    run(r, INTERVAL_TICKS - 1);
    expect(r.mem.writeAttempts).toBe(first);
    run(r, 1);
    expect(r.mem.writeAttempts).toBe(first + 1);
    expect(r.flow.saveInfo?.tick).toBe(2 * INTERVAL_TICKS);
  });

  it('duraklatma anında kaydeder', () => {
    const r = rig();
    r.flow.startNewMatch('normal');
    run(r, 30);
    expect(r.flow.saveInfo).toBeNull();
    r.session.pause();
    expect(r.flow.saveInfo?.tick).toBe(30);
    expect(r.flow.saveInfo?.opponent).toBe('normal');
  });

  it('sekme gizlenince oyun duraklar ve kayıt alınır (K-14, ÖK-06)', () => {
    const r = rig();
    r.flow.startNewMatch('easy');
    run(r, 25);
    r.visibility.visibilityState = 'hidden';
    r.visibility.fire();
    expect(r.session.paused).toBe(true);
    expect(r.flow.saveInfo?.tick).toBe(25);
    const tick = r.session.tick;
    run(r, 100);
    expect(r.session.tick).toBe(tick);
  });

  it('pagehide benzeri anlık kayıt: saveNow savaş dışında ve bitmiş maçta yazmaz', () => {
    const r = rig();
    expect(r.flow.saveNow()).toBe(false);
    r.flow.startNewMatch('easy');
    run(r, 5);
    expect(r.flow.saveNow()).toBe(true);
    r.flow.toMenu();
    const writes = r.mem.writeAttempts;
    expect(r.flow.saveNow()).toBe(false);
    expect(r.mem.writeAttempts).toBe(writes);
  });

  it('ana menüye dönüş kaydeder ve duraklatır; Devam et aynı durumu duraklatılmış açar (K-07)', () => {
    const r = rig();
    r.flow.startNewMatch('normal');
    r.session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    run(r, 80);
    const hash = stateHash(r.session.state);
    const tick = r.session.tick;
    r.flow.toMenu();
    expect(r.flow.screen).toBe('menu');
    expect(r.session.paused).toBe(true);
    expect(r.flow.saveInfo?.tick).toBe(tick);

    // "Sayfa yeniden yüklendi": aynı depo, yepyeni oturum ve akış.
    const again = rig(r.mem);
    expect(again.flow.saveInfo?.tick).toBe(tick);
    expect(again.flow.continueSaved()).toBe(true);
    expect(again.flow.screen).toBe('battle');
    expect(again.session.paused).toBe(true);
    expect(again.session.tick).toBe(tick);
    expect(stateHash(again.session.state)).toBe(hash);
    expect(again.session.matchConfig).toEqual({ seed: 100, opponent: 'normal' });
    // Devam ettirince ilerler.
    again.session.resume();
    run(again, 10);
    expect(again.session.tick).toBe(tick + 10);
  });

  it('yazma başarısızsa oyun sürer ve yalnız bir kez uyarılır', () => {
    const r = rig();
    r.mem.failWrites = true;
    r.flow.startNewMatch('easy');
    run(r, 10);
    r.session.pause();
    r.session.resume();
    run(r, INTERVAL_TICKS);
    r.session.pause();
    expect(r.session.tick).toBeGreaterThan(INTERVAL_TICKS);
    expect(r.notices).toEqual([{ kind: 'saveWriteFailed' }]);
    expect(r.flow.saveInfo).toBeNull();
  });
});

describe('Flow: yeni maç ve kayıt (ÖK-08, K-08)', () => {
  it('kayıt varken onaysız yeni maç başlamaz; onaylanınca eski kayıt silinir', () => {
    const r = rig();
    r.flow.startNewMatch('easy');
    run(r, 40);
    r.flow.toMenu();
    const save = r.mem.data.get(STORAGE_KEYS.save);
    expect(save).toBeDefined();

    expect(r.flow.startNewMatch('hard')).toBe(false);
    expect(r.flow.screen).toBe('menu');
    expect(r.mem.data.get(STORAGE_KEYS.save)).toBe(save);

    expect(r.flow.startNewMatch('hard', true)).toBe(true);
    expect(r.flow.screen).toBe('battle');
    expect(r.flow.saveInfo).toBeNull();
    expect(r.mem.data.has(STORAGE_KEYS.save)).toBe(false);
    expect(r.session.tick).toBe(0);
  });

  it('kayıt yoksa yeni maç onay istemez', () => {
    const r = rig();
    expect(r.flow.startNewMatch('normal')).toBe(true);
  });
});

describe('Flow: maç sonu', () => {
  function finish(r: Rig): void {
    r.session.debugMutate((s) => void (s.sides[1].baseHp = 0));
    run(r, 5);
  }

  it('sonuç geçmişe yazılır, kayıt silinir, toplamlar artar', () => {
    const r = rig();
    r.flow.startNewMatch('normal');
    run(r, 60);
    r.session.pause();
    expect(r.mem.data.has(STORAGE_KEYS.save)).toBe(true);
    r.session.resume();
    finish(r);
    expect(r.session.ended).toBe(true);
    expect(r.mem.data.has(STORAGE_KEYS.save)).toBe(false);
    expect(r.flow.saveInfo).toBeNull();
    const results = r.flow.results;
    expect(results.entries).toHaveLength(1);
    expect(results.entries[0]).toMatchObject({ opponent: 'normal', result: 'win', playerAge: 1, at: 1000 });
    expect(results.totals.normal.wins).toBe(1);
    expect(JSON.parse(r.mem.data.get(STORAGE_KEYS.results)!).totals.normal.wins).toBe(1);
    // Bitmiş maçta ana menüye dönmek kayıt yazmaz.
    r.flow.toMenu();
    expect(r.mem.data.has(STORAGE_KEYS.save)).toBe(false);
  });

  it('yenilgi ve sonuçlar yeniden açılışta kalıcıdır', () => {
    const r = rig();
    r.flow.startNewMatch('hard');
    r.session.debugMutate((s) => void (s.sides[0].baseHp = 0));
    run(r, 5);
    expect(r.flow.results.entries[0]).toMatchObject({ opponent: 'hard', result: 'loss' });
    expect(rig(r.mem).flow.results.totals.hard.losses).toBe(1);
  });

  it('Yeniden oyna: aynı zorluk, yeni tohum, tamamen temiz durum (K-08)', () => {
    const r = rig();
    r.flow.startNewMatch('hard');
    r.session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    run(r, 100);
    finish(r);
    expect(r.session.ended).toBe(true);
    r.flow.replay();
    expect(r.session.ended).toBe(false);
    expect(r.session.paused).toBe(false);
    expect(r.session.tick).toBe(0);
    expect(r.session.matchConfig).toEqual({ seed: 101, opponent: 'hard' });
    expect(r.session.state.units).toHaveLength(0);
    expect(r.session.state.projectiles).toHaveLength(0);
    expect(r.session.state.outcome).toBeNull();
    expect(r.session.pendingCommandCount).toBe(0);
    expect(r.flow.screen).toBe('battle');
    run(r, 3);
    expect(r.session.tick).toBe(3);
  });

  it('test botu rakibi sonuç geçmişine yazılmaz', () => {
    const mem = new MemoryStorage();
    const session = new Session({ opponent: 'basic-bot' });
    const flow = new Flow({ session, storage: mem, gameVersion: VERSION });
    session.startMatch({ seed: 1, opponent: 'basic-bot' });
    flow.openSetup();
    session.debugMutate((s) => void (s.sides[1].baseHp = 0));
    for (let i = 0; i < 5; i++) session.advance(50);
    expect(session.ended).toBe(true);
    expect(flow.results.entries).toHaveLength(0);
  });
});

describe('Flow: geçersiz kayıt (ÖK-04)', () => {
  it('açılışta bozuk kayıt silinir, Devam et kapalı, ilk dinleyiciye bildirilir', () => {
    const mem = new MemoryStorage();
    mem.data.set(STORAGE_KEYS.save, '{"bozuk":');
    const r = rig(mem);
    expect(r.flow.saveInfo).toBeNull();
    expect(mem.data.has(STORAGE_KEYS.save)).toBe(false);
    expect(r.notices).toEqual([{ kind: 'saveInvalid', failure: 'parse' }]);
  });

  it('uyumsuz sürümlü kayıt silinir ve bildirilir', () => {
    const first = rig();
    first.flow.startNewMatch('easy');
    run(first, 10);
    first.flow.toMenu();
    const session = new Session({ opponent: 'none' });
    const flow = new Flow({ session, storage: first.mem, gameVersion: '0.9.0' });
    const notices: FlowNotice[] = [];
    flow.subscribeNotices((n) => notices.push(n));
    expect(flow.saveInfo).toBeNull();
    expect(notices).toEqual([{ kind: 'saveInvalid', failure: 'version' }]);
    expect(first.mem.data.has(STORAGE_KEYS.save)).toBe(false);
  });

  it('Devam et sırasında kayıt bozulmuşsa false döner, siler ve bildirir', () => {
    const r = rig();
    r.flow.startNewMatch('easy');
    run(r, 10);
    r.flow.toMenu();
    r.mem.data.set(STORAGE_KEYS.save, r.mem.data.get(STORAGE_KEYS.save)!.replace('"tick":10', '"tick":11'));
    expect(r.flow.continueSaved()).toBe(false);
    expect(r.flow.screen).toBe('menu');
    expect(r.flow.saveInfo).toBeNull();
    expect(r.mem.data.has(STORAGE_KEYS.save)).toBe(false);
    expect(r.notices).toEqual([{ kind: 'saveInvalid', failure: 'checksum' }]);
  });

  it('depo hiç erişilemezse oyun kayıtsız çalışır', () => {
    const session = new Session({ opponent: 'none' });
    const flow = new Flow({ session, storage: null });
    expect(flow.startNewMatch('easy')).toBe(true);
    expect(flow.saveNow()).toBe(false);
  });

  it('her başarısızlık türünün bildirim metni vardır', () => {
    const failures: SaveFailure[] = ['parse', 'version', 'checksum', 'structure', 'finished', 'references', 'invariants'];
    for (const failure of failures) expect(noticeText({ kind: 'saveInvalid', failure }).length).toBeGreaterThan(0);
    expect(noticeText({ kind: 'saveInvalid', failure: 'version' })).toBe(tr.notices.saveVersion);
    expect(noticeText({ kind: 'saveWriteFailed' })).toBe(tr.notices.saveWriteFailed);
  });
});
