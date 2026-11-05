import { describe, expect, it, vi } from 'vitest';
import { WORLD } from '../src/data/world';
import { SAVE_INTERVAL_SEC } from '../src/game/constants';
import { Flow } from '../src/game/flow';
import { startFrameLoop, type FrameClock } from '../src/game/loop';
import { createSave, parseSave, serializeSave } from '../src/game/save';
import { Session } from '../src/game/session';
import { TutorialRunner } from '../src/game/tutorial';
import { stateHash } from '../src/sim/hash';
import { FRONT_ID } from './helpers';
import { MemoryStorage } from './persistence-helpers';

/** Elle sürülen sahte kare saati. */
function manualClock(): FrameClock & { pump(dt?: number): boolean; cancelled: number } {
  let now = 0;
  let pending: (() => void) | null = null;
  const clock = {
    cancelled: 0,
    now: () => now,
    requestFrame(cb: () => void) {
      pending = cb;
      return 1;
    },
    cancelFrame() {
      clock.cancelled += 1;
      pending = null;
    },
    /** Bekleyen kareyi çalıştırır; kare beklemiyorsa false. */
    pump(dt = 16): boolean {
      const cb = pending;
      if (cb === null) return false;
      pending = null;
      now += dt;
      cb();
      return true;
    },
  };
  return clock;
}

describe('Döngü: karedeki istisna döngüyü durdurmaz', () => {
  it('hata atan kareden sonra döngü sürer; sonraki kareler çalışır', () => {
    const clock = manualClock();
    const seen: number[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    startFrameLoop(clock, (ms) => {
      seen.push(ms);
      if (seen.length === 2) throw new Error('tek seferlik');
    });
    for (let i = 0; i < 5; i++) expect(clock.pump()).toBe(true);
    expect(seen).toHaveLength(5);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it('aynı hata tekrarlanırsa konsola bir kez yazılır; farklı hatalar sınırlı sayıda yazılır', () => {
    const clock = manualClock();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let n = 0;
    startFrameLoop(
      clock,
      () => {
        n += 1;
        throw new Error(n <= 10 ? 'aynı' : `farklı ${n}`);
      },
      { maxConsecutiveErrors: 1000 },
    );
    for (let i = 0; i < 40; i++) clock.pump();
    // 1 ("aynı") + en çok MAX_LOGGED_FRAME_ERRORS-1 farklı ileti.
    expect(errors.mock.calls.length).toBeLessThanOrEqual(5);
    expect(errors.mock.calls.length).toBeGreaterThanOrEqual(2);
    errors.mockRestore();
  });

  it('ardışık N karede hata olursa döngü durur ve onFatal çağrılır; araya giren başarılı kare sayacı sıfırlar', () => {
    const clock = manualClock();
    const fatal: unknown[] = [];
    let frame = 0;
    startFrameLoop(
      clock,
      () => {
        frame += 1;
        // 1-2. kare hatalı, 3. başarılı, sonra hep hatalı.
        if (frame !== 3) throw new Error(`hata ${frame}`);
      },
      { maxConsecutiveErrors: 3, onError: () => undefined, onFatal: (e) => fatal.push(e) },
    );
    let pumped = 0;
    while (clock.pump()) pumped += 1;
    // 2 hata + 1 başarı + 3 ardışık hata = 6 kare; sonra durur.
    expect(pumped).toBe(6);
    expect(fatal).toHaveLength(1);
    expect((fatal[0] as Error).message).toBe('hata 6');
    expect(clock.pump()).toBe(false);
  });

  it('onFrame durdurma işlevini çağırırsa bekleyen kare iptal edilir', () => {
    const clock = manualClock();
    let stop: () => void = () => undefined;
    let calls = 0;
    stop = startFrameLoop(clock, () => {
      calls += 1;
      stop();
    });
    clock.pump();
    expect(clock.pump()).toBe(false);
    expect(calls).toBe(1);
  });
});

describe('Kayıt: yazma hatasında yeniden deneme sınırı', () => {
  it('kota hatasında 200 tick içinde en çok 1 deneme; bildirim bir kez', () => {
    const mem = new MemoryStorage();
    mem.failWrites = true;
    const session = new Session({ opponent: 'none' });
    const flow = new Flow({ session, storage: mem, newSeed: () => 1, gameVersion: '0.1.0' });
    const notices: unknown[] = [];
    flow.subscribeNotices((n) => notices.push(n));
    flow.startNewMatch('easy');
    const interval = SAVE_INTERVAL_SEC * WORLD.tickRate;
    const attemptsAfter = (ticks: number): number => {
      for (let i = 0; i < ticks; i++) {
        session.advance(50);
        flow.update();
      }
      return mem.writeAttempts;
    };
    expect(attemptsAfter(interval - 1)).toBe(0);
    expect(attemptsAfter(1)).toBe(1);
    // Sonraki aralığın sonuna dek yeni deneme yok (önceden her karede deneniyordu).
    expect(attemptsAfter(interval - 1)).toBe(1);
    expect(attemptsAfter(1)).toBe(2);
    expect(notices).toEqual([{ kind: 'saveWriteFailed' }]);
  });
});

describe('Duraklatma ve kayıt (K-07): kabul edilmiş ama uygulanmamış komut', () => {
  function play(): Session {
    const session = new Session({ seed: 5, opponent: 'normal' });
    for (let i = 0; i < 100; i++) session.advance(50);
    return session;
  }

  it('duraklatma kuyruğu boşaltır; komut ücretlenmez', () => {
    const session = play();
    const gold = session.state.sides[0].gold;
    expect(session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID }).ok).toBe(true);
    expect(session.pendingCommandCount).toBe(1);
    session.pause();
    expect(session.pendingCommandCount).toBe(0);
    expect(session.state.sides[0].gold).toBe(gold);
  });

  it('submit → pause → (a) devam ile (b) kaydet-yükle-devam ile aynı karma', () => {
    const a = play();
    const b = play();
    for (const s of [a, b]) {
      s.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
      s.pause();
    }
    expect(stateHash(a.state)).toBe(stateHash(b.state));

    const parsed = parseSave(serializeSave(createSave(b.state, '0.1.0', 0)), '0.1.0');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const loaded = new Session({ opponent: 'none' });
    loaded.startMatch(parsed.save.matchConfig, parsed.save.state);
    a.resume();
    for (let i = 0; i < 600; i++) {
      a.advance(50);
      loaded.advance(50);
    }
    expect(loaded.tick).toBe(a.tick);
    expect(stateHash(loaded.state)).toBe(stateHash(a.state));
  });

  it('hasPendingCommand bekleyen komutu bulur; adım sonrası boşalır', () => {
    const session = new Session({ opponent: 'none' });
    session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    expect(session.hasPendingCommand((c) => c.type === 'queueUnit')).toBe(true);
    expect(session.hasPendingCommand((c) => c.type === 'cancelOrder')).toBe(false);
    session.advance(50);
    expect(session.hasPendingCommand(() => true)).toBe(false);
  });
});

describe('Öğretici: duraklatma yüzünden atılan rakip siparişi yeniden verilir', () => {
  it('adım 3 girişinde duraklatılıp devam edilirse rakip birliği yine de gelir', () => {
    const session = new Session({ opponent: 'none' });
    session.startMatch({ seed: 1, opponent: 'none' });
    const runner = new TutorialRunner(session);
    runner.start();
    runner.advance();
    session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    session.advance(50);
    expect(runner.step?.id).toBe('firstKill');
    // Sipariş kuyruğa girdi; duraklatma onu atar.
    session.pause();
    expect(session.state.sides[1].queue).toHaveLength(0);
    session.resume();
    for (let i = 0; i < 300 && !session.state.units.some((u) => u.side === 1); i++) {
      session.advance(50);
      runner.update();
    }
    expect(session.state.units.filter((u) => u.side === 1)).toHaveLength(1);
  });
});
