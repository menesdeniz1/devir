import { describe, expect, it } from 'vitest';
import { ECONOMY, WORLD } from '../src/data/world';
import type { SessionEvent, VisibilitySource } from '../src/game/session';
import { Session } from '../src/game/session';
import { createMatch } from '../src/sim/create';
import { stateHash } from '../src/sim/hash';
import { checkInvariants } from '../src/sim/invariants';
import { FRONT_ID } from './helpers';

const FRAME_MS = 20;
/** Bir maçı bitirmek için güvenli üst sınır (kare sayısı). */
const MAX_FRAMES_TO_END = 9000;

function runFrames(session: Session, frames: number, ms = FRAME_MS): void {
  for (let i = 0; i < frames; i++) session.advance(ms);
}

function playUntilEnd(session: Session): void {
  for (let i = 0; i < MAX_FRAMES_TO_END && !session.ended; i++) session.advance(FRAME_MS * 4);
}

/** Görünürlük olayını elle tetiklenebilen sahte hedef. */
function fakeVisibility(): VisibilitySource & { visibilityState: string; fire(): void } {
  const listeners = new Set<() => void>();
  return {
    visibilityState: 'visible',
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
    fire() {
      for (const l of [...listeners]) l();
    },
  };
}

const freshHash = (): string => stateHash(createMatch({ seed: 1, opponent: 'normal' }));

describe('K-14: duraklatmada oyun zamanı ilerlemez ve komut kabul edilmez', () => {
  it('K-14: duraklatılmışken N kare beslenir, tick ve durum karması sabit kalır', () => {
    const session = new Session();
    runFrames(session, 50);
    expect(session.tick).toBeGreaterThan(0);
    session.pause();
    const tick = session.tick;
    const hash = stateHash(session.state);
    runFrames(session, 500, 50);
    expect(session.advance(250)).toBe(0);
    expect(session.tick).toBe(tick);
    expect(stateHash(session.state)).toBe(hash);
    session.resume();
    runFrames(session, 10);
    expect(session.tick).toBeGreaterThan(tick);
  });

  it('K-14: duraklatmada komut paused nedeniyle reddedilir, durum değişmez, kuyruğa girmez', () => {
    const session = new Session();
    session.pause();
    const hash = stateHash(session.state);
    const result = session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    expect(result).toEqual({ ok: false, reason: 'paused' });
    expect(session.check({ type: 'cancelOrder', side: 0, index: 1 })).toEqual({ ok: false, reason: 'paused' });
    expect(session.pendingCommandCount).toBe(0);
    expect(stateHash(session.state)).toBe(hash);
    session.resume();
    runFrames(session, 100);
    // Reddedilen komut devam edince de uygulanmaz.
    expect(session.state.sides[0].stats.goldSpent).toBe(0);
    expect(session.state.sides[0].queue.length).toBe(0);
  });

  it('K-14: duraklatma biriktiriciyi sıfırlar (devam edince eski süre birikmiş sayılmaz)', () => {
    const session = new Session();
    session.advance(40); // 40 ms birikti, adım yok
    expect(session.tick).toBe(0);
    session.pause();
    session.resume();
    session.advance(40);
    expect(session.tick).toBe(0);
    session.advance(10);
    expect(session.tick).toBe(1);
  });

  it('K-14: sekme gizlenince oturum duraklar; geri gelince duraklatılmış kalır (ÖK-06)', () => {
    const vis = fakeVisibility();
    const session = new Session({ visibility: vis });
    const events: SessionEvent[] = [];
    session.subscribe((e) => events.push(e));
    runFrames(session, 30);
    const tick = session.tick;
    expect(session.paused).toBe(false);

    vis.visibilityState = 'hidden';
    vis.fire();
    expect(session.paused).toBe(true);
    runFrames(session, 200, 100);
    expect(session.tick).toBe(tick);

    vis.visibilityState = 'visible';
    vis.fire();
    expect(session.paused).toBe(true);
    runFrames(session, 20);
    expect(session.tick).toBe(tick);
    expect(events.filter((e) => e.type === 'paused')).toEqual([{ type: 'paused', paused: true }]);

    session.resume();
    runFrames(session, 20);
    expect(session.tick).toBeGreaterThan(tick);
  });

  it('K-14: dispose görünürlük dinleyicisini kaldırır', () => {
    const vis = fakeVisibility();
    const session = new Session({ visibility: vis });
    session.dispose();
    vis.visibilityState = 'hidden';
    vis.fire();
    expect(session.paused).toBe(false);
  });

  it('K-14: sonuç belirlenince duraklatılamaz ve komut matchOver ile reddedilir', () => {
    const session = new Session();
    session.debugMutate((s) => {
      s.sides[0].baseHp = 1;
    });
    playUntilEnd(session);
    expect(session.ended).toBe(true);
    expect(session.state.outcome).toMatchObject({ kind: 'win', winner: 1 });
    session.pause();
    expect(session.paused).toBe(false);
    expect(session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID })).toEqual({ ok: false, reason: 'matchOver' });
    const tick = session.tick;
    runFrames(session, 20);
    expect(session.tick).toBe(tick);
  });
});

describe('K-08: yeniden oyna tamamen yeni durum kurar', () => {
  it('K-08: maç ortasında yeniden başlat: karma yeni createMatch ile aynı; kuyruk ve duraklatma temiz', () => {
    let controllerSets = 0;
    const session = new Session({
      createControllers: () => {
        controllerSets += 1;
        return [null, null];
      },
    });
    expect(controllerSets).toBe(1);
    session.debugMutate((s) => {
      s.sides[0].gold += 1000;
    });
    session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID }, 500); // ileri tick'e damgalı, bekler
    runFrames(session, 200);
    session.setSpeed(4);
    session.pause();
    expect(session.state.units.length + session.state.sides[0].queue.length).toBeGreaterThan(0);
    expect(session.pendingCommandCount).toBeGreaterThan(0);

    const events: SessionEvent[] = [];
    session.subscribe((e) => events.push(e));
    session.restart();

    expect(controllerSets).toBe(2);
    expect(events.some((e) => e.type === 'reset')).toBe(true);
    expect(session.paused).toBe(false);
    expect(session.speed).toBe(1);
    expect(session.pendingCommandCount).toBe(0);
    expect(session.tick).toBe(0);
    expect(session.state.units).toEqual([]);
    expect(session.previousX(1)).toBeUndefined();
    expect(stateHash(session.state)).toBe(freshHash());
  });

  it('K-08: maç bitince girdiler kapanır; yeniden oyna sonrası yeni oturumla aynı gidişat', () => {
    const session = new Session();
    session.debugMutate((s) => {
      s.sides[0].baseHp = 1;
    });
    playUntilEnd(session);
    expect(session.ended).toBe(true);
    let endedEvents = 0;
    session.subscribe((e) => {
      if (e.type === 'ended') endedEvents += 1;
    });
    runFrames(session, 10);
    expect(endedEvents).toBe(0); // 'ended' zaten bir kez bildirilmişti

    session.restart();
    expect(session.ended).toBe(false);
    expect(stateHash(session.state)).toBe(freshHash());
    expect(session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID }).ok).toBe(true);

    // Aynı girdilerle yeni bir oturum ile aynı karmaya ulaşır.
    const other = new Session();
    other.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    runFrames(session, 400);
    runFrames(other, 400);
    expect(stateHash(session.state)).toBe(stateHash(other.state));
    expect(session.tick).toBe(other.tick);
  });

  it('K-08: eski durum nesnesi yeniden başlatmadan etkilenmez (paylaşılan başvuru yok)', () => {
    const session = new Session();
    runFrames(session, 100);
    const old = session.state;
    const oldHash = stateHash(old);
    session.restart();
    runFrames(session, 100);
    expect(session.state).not.toBe(old);
    expect(stateHash(old)).toBe(oldHash);
  });
});

describe('Duman testi: 2 dk oyun süresi, oyuncu komutu yok', () => {
  it('bot kazanma yolunda ilerler: oyuncu üs canı düşer, değişmezler korunur', () => {
    const session = new Session();
    const twoMinutesMs = 120_000;
    const frames = twoMinutesMs / FRAME_MS;
    const hpSamples: number[] = [];
    for (let i = 0; i < frames; i++) {
      session.advance(FRAME_MS);
      if (i % 250 === 0) {
        hpSamples.push(session.state.sides[0].baseHp);
        expect(checkInvariants(session.state)).toEqual([]);
      }
    }
    expect(checkInvariants(session.state)).toEqual([]);
    const outcome = session.state.outcome;
    if (outcome === null) {
      expect(session.tick).toBe((twoMinutesMs / 1000) * WORLD.tickRate);
    } else {
      expect(outcome).toMatchObject({ kind: 'win', winner: 1 });
    }
    const me = session.state.sides[0];
    const foe = session.state.sides[1];
    expect(me.baseHp).toBeLessThan(me.baseMaxHp);
    expect(foe.baseHp).toBe(foe.baseMaxHp);
    expect(foe.stats.produced[FRONT_ID]).toBeGreaterThan(0);
    // Oyuncu can yalnızca azalır.
    for (let i = 1; i < hpSamples.length; i++) expect(hpSamples[i]!).toBeLessThanOrEqual(hpSamples[i - 1]!);
    expect(me.queue.length).toBeLessThanOrEqual(ECONOMY.maxQueue);
  });
});
