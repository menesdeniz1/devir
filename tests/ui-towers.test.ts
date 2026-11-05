import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOWERS } from '../src/data/towers';
import { Session } from '../src/game/session';
import { rejectText, tr, towerName, type UiRejectReason } from '../src/i18n';
import { sellRefund } from '../src/sim/compile';
import { mountKeyboard } from '../src/ui/keyboard';
import {
  availableTowerIds,
  buildTower,
  buildTowerCommand,
  sellTower,
  slotView,
  towerKindText,
  towerTooltip,
  towerTooltipLines,
  unlockSlot,
  unlockSlotCommand,
} from '../src/ui/towers';

afterEach(() => {
  vi.unstubAllGlobals();
});

function newSession(gold = 10_000): Session {
  const session = new Session({ createControllers: () => [null, null] });
  session.debugMutate((s) => {
    s.sides[0].gold = gold;
  });
  return session;
}

describe('Arayüz: savunma yuvaları', () => {
  it('tr.ts: on kulenin adı tam olarak GDD §6 tablosundaki gibidir', () => {
    const expected: Record<string, string> = {
      primitive_tower_fast: 'Sapan Direği',
      primitive_tower_heavy: 'Kaya Oluğu',
      ancient_tower_fast: 'Ok Burcu',
      ancient_tower_heavy: 'Kızgın Kum Kazanı',
      medieval_tower_fast: 'Arbalet Mazgalı',
      medieval_tower_heavy: 'Kaynar Yağ Oluğu',
      industrial_tower_fast: 'Makineli Yuva',
      industrial_tower_heavy: 'Havan Mevzisi',
      future_tower_fast: 'Darbe Lazeri',
      future_tower_heavy: 'Plazma Havanı',
    };
    expect(TOWERS).toHaveLength(10);
    for (const t of TOWERS) {
      expect(towerName(t.id), t.id).toBe(expected[t.id]);
      expect(tr.towerKind[t.kind].length).toBeGreaterThan(0);
    }
    expect(tr.towerKind.fast).toBe('Hızlı, tek hedef');
    expect(tr.towerKind.heavy).toBe('Ağır, alan hasarı');
  });

  it('K-16: her yeni ret nedeni için metin vardır ve yer tutucu kalmaz', () => {
    const reasons: UiRejectReason[] = [
      'noSuchSlot',
      'slotLocked',
      'slotAlreadyUnlocked',
      'previousSlotLocked',
      'slotOccupied',
      'slotEmpty',
      'unknownTower',
      'towerNotAvailable',
    ];
    for (const reason of reasons) {
      const text = rejectText(reason, 12);
      expect(text.trim().length, reason).toBeGreaterThan(0);
      expect(text, reason).not.toContain('{');
    }
    expect(rejectText('previousSlotLocked')).toBe('Önce önceki yuvayı aç');
  });

  it('yuva görünümü: başta yuva 0 boş, diğerleri kilitli (200 ve 500 altın); kurulunca dolu', () => {
    const session = newSession();
    expect(slotView(session, 0)).toEqual({ kind: 'empty' });
    expect(slotView(session, 1)).toEqual({ kind: 'locked', cost: 200 });
    expect(slotView(session, 2)).toEqual({ kind: 'locked', cost: 500 });
    expect(slotView(session, 3)).toBeNull();
    expect(buildTower(session, 0, 'primitive_tower_fast').ok).toBe(true);
    session.advance(50);
    expect(slotView(session, 0)).toEqual({ kind: 'built', towerId: 'primitive_tower_fast', paid: 120, refund: 60, oldAge: false });
    session.dispose();
  });

  it('menü: güncel çağın iki kulesi (hızlı + ağır) sunulur; çağ atlayınca değişir, eski çağ kulesi işaretlenir', () => {
    const session = newSession();
    expect(availableTowerIds(session)).toEqual(['primitive_tower_fast', 'primitive_tower_heavy']);
    expect(buildTower(session, 0, 'primitive_tower_fast').ok).toBe(true);
    session.advance(50);
    session.debugMutate((s) => {
      s.sides[0].xp = 800;
    });
    expect(session.submit({ type: 'ageUp', side: 0 }).ok).toBe(true);
    session.advance(50);
    expect(availableTowerIds(session)).toEqual(['ancient_tower_fast', 'ancient_tower_heavy']);
    expect(slotView(session, 0)).toMatchObject({ kind: 'built', towerId: 'primitive_tower_fast', oldAge: true });
    session.dispose();
  });

  it('yuva açma düğmesi: ret nedenleri sıra ve eksik altınla gelir; açılınca kabul edilir', () => {
    const session = newSession(150);
    expect(session.check(unlockSlotCommand(2))).toEqual({ ok: false, reason: 'previousSlotLocked' });
    expect(session.check(unlockSlotCommand(1))).toEqual({ ok: false, reason: 'notEnoughGold', missingGold: 50 });
    expect(rejectText('notEnoughGold', 50)).toBe('Yetersiz altın (50 eksik)');
    expect(session.check(unlockSlotCommand(0))).toEqual({ ok: false, reason: 'slotAlreadyUnlocked' });
    session.debugMutate((s) => {
      s.sides[0].gold = 200;
    });
    expect(unlockSlot(session, 1).ok).toBe(true);
    session.advance(50);
    expect(slotView(session, 1)).toEqual({ kind: 'empty' });
    session.dispose();
  });

  it('kur–sat menüsü komutları: kurma ret nedenleri; satış iadesi gösterilen değerle aynıdır', () => {
    const session = newSession();
    expect(session.check(buildTowerCommand(1, 'primitive_tower_fast'))).toEqual({ ok: false, reason: 'slotLocked' });
    expect(session.check(buildTowerCommand(0, 'ancient_tower_fast'))).toEqual({ ok: false, reason: 'towerNotAvailable' });
    expect(session.check(buildTowerCommand(0, 'no_such_tower'))).toEqual({ ok: false, reason: 'unknownTower' });
    expect(buildTower(session, 0, 'primitive_tower_heavy').ok).toBe(true);
    session.advance(50);
    expect(session.check(buildTowerCommand(0, 'primitive_tower_fast'))).toEqual({ ok: false, reason: 'slotOccupied' });
    const view = slotView(session, 0);
    expect(view).toMatchObject({ kind: 'built', paid: 160, refund: sellRefund(160) });
    const gold = session.state.sides[0].gold;
    expect(sellTower(session, 0).ok).toBe(true);
    session.advance(50);
    expect(session.state.sides[0].gold).toBeGreaterThanOrEqual(gold + 80);
    expect(session.check({ type: 'sellTower', side: 0, slot: 0 })).toEqual({ ok: false, reason: 'slotEmpty' });
    session.dispose();
  });

  it('duraklatmada tüm yuva işlemleri "paused" ile kapalıdır; komut kuyruğa girmez', () => {
    const session = newSession();
    session.pause();
    expect(session.check(unlockSlotCommand(1))).toEqual({ ok: false, reason: 'paused' });
    expect(session.check(buildTowerCommand(0, 'primitive_tower_fast'))).toEqual({ ok: false, reason: 'paused' });
    expect(session.check({ type: 'sellTower', side: 0, slot: 0 })).toEqual({ ok: false, reason: 'paused' });
    expect(buildTower(session, 0, 'primitive_tower_fast')).toEqual({ ok: false, reason: 'paused' });
    expect(session.pendingCommandCount).toBe(0);
    expect(rejectText('paused')).toBe(tr.reject.paused);
    session.dispose();
  });

  it('araç ipucu: ad, maliyet, tür, hasar, aralık, menzil ve (ağır kulede) alan yarıçapı veriden gelir; ret nedeni başta', () => {
    const fast = towerTooltip('primitive_tower_fast');
    expect(fast).toContain('Sapan Direği');
    expect(fast).toContain('120 altın');
    expect(fast).toContain('Hızlı, tek hedef');
    expect(fast).toContain('Hasar 16');
    expect(fast).toContain('Aralık 0,6 sn');
    expect(fast).toContain('Menzil 270');
    expect(fast).not.toContain('Alan hasarı (');
    const heavy = towerTooltip('primitive_tower_heavy');
    expect(heavy).toContain('Kaya Oluğu');
    expect(heavy).toContain('160 altın');
    expect(heavy).toContain('Ağır, alan hasarı');
    expect(heavy).toContain('Hasar 40');
    expect(heavy).toContain('Aralık 2 sn');
    expect(heavy).toContain('Menzil 200');
    expect(heavy).toContain('Alan hasarı (yarıçap 60)');
    expect(towerKindText('primitive_tower_heavy')).toBe('Ağır, alan hasarı');
    const lines = towerTooltipLines('future_tower_heavy', 'Yetersiz altın (100 eksik)');
    expect(lines[0]).toBe('Yetersiz altın (100 eksik)');
    expect(lines.join('\n')).toContain('Hasar 640');
  });

  it('Esc: açık kule menüsü varsa yalnız menüyü kapatır (duraklatmaz); menü yoksa duraklatır', () => {
    vi.stubGlobal('HTMLElement', class FakeElement {});
    const session = newSession();
    let handler: ((event: KeyboardEvent) => void) | null = null;
    const target = {
      addEventListener: (_type: string, fn: EventListenerOrEventListenerObject) => {
        handler = fn as (event: KeyboardEvent) => void;
      },
      removeEventListener: () => {
        handler = null;
      },
    };
    let menuOpen = true;
    const unmount = mountKeyboard(session, target as unknown as Document, {
      dismiss: () => {
        const was = menuOpen;
        menuOpen = false;
        return was;
      },
    });
    const press = (code: string): void => {
      handler!({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: {}, preventDefault: () => undefined } as unknown as KeyboardEvent);
    };
    press('Escape');
    expect(menuOpen).toBe(false);
    expect(session.paused).toBe(false);
    press('Escape');
    expect(session.paused).toBe(true);
    // P menüden bağımsız duraklatma tuşudur.
    session.resume();
    menuOpen = true;
    press('KeyP');
    expect(session.paused).toBe(true);
    expect(menuOpen).toBe(true);
    unmount();
    session.dispose();
  });
});
