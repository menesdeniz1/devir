import { describe, expect, it } from 'vitest';
import { UNITS } from '../src/data/units';
import { ECONOMY } from '../src/data/world';
import { Session } from '../src/game/session';
import { rejectText, tr, unitName, type UiRejectReason } from '../src/i18n';
import type { RejectReason } from '../src/sim/types';
import { FRONT_ID } from './helpers';

/**
 * Tür düzeyinde ayna: sim'e yeni bir RejectReason eklenirse bu nesne derlenmez
 * (tsc --noEmit testleri de kapsar) ve yeni neden için metin eklemek zorunlu olur.
 */
const ALL_SIM_REASONS: Record<RejectReason, true> = {
  invalidCommand: true,
  matchOver: true,
  unknownUnit: true,
  unitNotAvailable: true,
  notEnoughGold: true,
  queueFull: true,
  orderInProduction: true,
  noSuchOrder: true,
  notEnoughXp: true,
  maxAge: true,
  noSuchSlot: true,
  slotLocked: true,
  slotAlreadyUnlocked: true,
  previousSlotLocked: true,
  slotOccupied: true,
  slotEmpty: true,
  unknownTower: true,
  towerNotAvailable: true,
  abilityCooldown: true,
};
const ALL_REASONS = [...(Object.keys(ALL_SIM_REASONS) as RejectReason[]), 'paused'] as UiRejectReason[];

describe('K-16: kullanılamayan her işlem nedenini gösterir', () => {
  it('K-16: sim içindeki her RejectReason ve paused için tr.ts içinde boş olmayan metin vardır', () => {
    expect(ALL_REASONS.length).toBe(20);
    for (const reason of ALL_REASONS) {
      const text = rejectText(reason, 35);
      expect(text.trim().length, reason).toBeGreaterThan(0);
      expect(text, reason).not.toContain('{');
      expect(tr.reject[reason].trim().length, reason).toBeGreaterThan(0);
    }
    // tr.reject, bilinen nedenlerin dışında anahtar taşımaz.
    expect(Object.keys(tr.reject).sort()).toEqual([...ALL_REASONS].sort());
  });

  it('K-16: yetersiz altın metni eksik miktarı içerir', () => {
    expect(rejectText('notEnoughGold', 35)).toBe('Yetersiz altın (35 eksik)');
  });

  it('K-16: gerçek oturumdan gelen ret nedenlerinin hepsinin metni vardır', () => {
    const session = new Session();
    const reasons: UiRejectReason[] = [];
    const record = (r: ReturnType<Session['check']>): void => {
      if (!r.ok) {
        reasons.push(r.reason);
        expect(rejectText(r.reason, r.missingGold).trim().length).toBeGreaterThan(0);
      }
    };
    // Altın yetersiz.
    session.debugMutate((s) => {
      s.sides[0].gold = 10;
    });
    const poor = session.check({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    expect(poor).toMatchObject({ ok: false, reason: 'notEnoughGold' });
    record(poor);
    // Bilinmeyen birlik, olmayan sipariş, üretimdeki sipariş, kuyruk dolu.
    record(session.check({ type: 'queueUnit', side: 0, unitId: 'no_such_unit' }));
    record(session.check({ type: 'cancelOrder', side: 0, index: 3 }));
    session.debugMutate((s) => {
      s.sides[0].gold = 10_000;
    });
    for (let i = 0; i < ECONOMY.maxQueue; i++) {
      expect(session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID }).ok).toBe(true);
      session.advance(50);
    }
    record(session.check({ type: 'queueUnit', side: 0, unitId: FRONT_ID }));
    record(session.check({ type: 'cancelOrder', side: 0, index: 0 }));
    // Duraklatma.
    session.pause();
    record(session.check({ type: 'queueUnit', side: 0, unitId: FRONT_ID }));
    expect(reasons).toEqual(expect.arrayContaining(['notEnoughGold', 'unknownUnit', 'noSuchOrder', 'queueFull', 'orderInProduction', 'paused']));
  });

  it('K-16: her birlik türünün görünen adı vardır', () => {
    for (const u of UNITS) {
      expect(tr.unit[u.id], u.id).toBeDefined();
      expect(unitName(u.id).trim().length).toBeGreaterThan(0);
    }
  });
});
