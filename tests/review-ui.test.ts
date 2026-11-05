import { describe, expect, it } from 'vitest';
import { Session } from '../src/game/session';
import { tr } from '../src/i18n';
import type { SimEvent } from '../src/sim/types';
import { cancelLastWaiting, cancelOrderAt } from '../src/ui/actions';
import { NoticeTimer, rejectNoticeText } from '../src/ui/notice';
import { FRONT_ID } from './helpers';

function collect(session: Session): SimEvent[] {
  const events: SimEvent[] = [];
  session.subscribe((e) => {
    if (e.type === 'sim') events.push(...e.events);
  });
  return events;
}

describe('HUD bildirim süresi duraklatmada azalmaz', () => {
  it('NoticeTimer: duraklatılmış karelerde süre sabit; devam edince dolar', () => {
    const timer = new NoticeTimer();
    timer.show(3000);
    expect(timer.tick(1000, false)).toBe(false);
    for (let i = 0; i < 100; i++) expect(timer.tick(1000, true)).toBe(false);
    expect(timer.active).toBe(true);
    expect(timer.tick(1000, false)).toBe(false);
    expect(timer.tick(1000, false)).toBe(true);
    expect(timer.active).toBe(false);
    expect(timer.tick(1000, false)).toBe(false);
  });

  it('clear süreyi sıfırlar', () => {
    const timer = new NoticeTimer();
    timer.show(10);
    timer.clear();
    expect(timer.active).toBe(false);
  });
});

describe('Aynı tick içinde çoklu komut: simülasyon reddi oyuncuya gösterilir (K-16)', () => {
  it('altın tek siparişe yetiyorsa ikinci komut commandRejected olur ve metin eksik altını içerir', () => {
    const session = new Session({ opponent: 'none' });
    const events = collect(session);
    session.debugMutate((s) => void (s.sides[0].gold = 60));
    // İkisi de tick başı duruma (60 altın) göre kabul edilir; ikincisi sim'de reddedilir.
    expect(session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID }).ok).toBe(true);
    const second = { type: 'queueUnit', side: 0, unitId: FRONT_ID } as const;
    expect(session.submit(second).ok).toBe(true);
    session.advance(50);
    const rejected = events.filter((e) => e.type === 'commandRejected');
    expect(rejected).toHaveLength(1);
    const e = rejected[0]!;
    if (e.type !== 'commandRejected') throw new Error('beklenmeyen olay');
    expect(e.command.side).toBe(0);
    expect(e.reason).toBe('notEnoughGold');
    const text = rejectNoticeText(e.reason, session.check(e.command));
    expect(text).toMatch(/^Yetersiz altın \(\d+ eksik\)$/);
  });

  it('yeniden denetim geçerse parametresiz kısa metin kullanılır; bilinmeyen ayrıntı "{missing}" bırakmaz', () => {
    expect(rejectNoticeText('notEnoughGold', { ok: true })).toBe(tr.rejectBare.notEnoughGold);
    expect(rejectNoticeText('queueFull', { ok: true })).toBe(tr.reject.queueFull);
    for (const reason of ['notEnoughGold', 'notEnoughXp', 'abilityCooldown'] as const) {
      expect(rejectNoticeText(reason, { ok: true })).not.toContain('{');
    }
    expect(rejectNoticeText('abilityCooldown', { ok: false, reason: 'abilityCooldown', cooldownTicks: 41 })).toBe('Bekleme: 3 sn');
  });
});

describe('Kuyruk iptali: aynı tick içinde ikinci tıklama yok sayılır (dizin kayması)', () => {
  function sessionWithQueue(): Session {
    const session = new Session({ opponent: 'none' });
    session.debugMutate((s) => void (s.sides[0].gold = 1000));
    for (let i = 0; i < 4; i++) session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    session.advance(50);
    expect(session.state.sides[0].queue.length).toBe(4);
    return session;
  }

  it('ikinci iptal bir sonraki adıma dek reddedilir; yalnız tek sipariş iptal edilir', () => {
    const session = sessionWithQueue();
    expect(cancelOrderAt(session, 3).ok).toBe(true);
    expect(cancelOrderAt(session, 2).ok).toBe(false);
    expect(cancelLastWaiting(session)?.ok).toBe(false);
    expect(session.pendingCommandCount).toBe(1);
    session.advance(50);
    expect(session.state.sides[0].queue.length).toBe(3);
    // Adım geçince yeniden iptal edilebilir.
    expect(cancelOrderAt(session, 2).ok).toBe(true);
    session.advance(50);
    expect(session.state.sides[0].queue.length).toBe(2);
  });
});
