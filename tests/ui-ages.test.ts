import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGES } from '../src/data/ages';
import { UNITS } from '../src/data/units';
import { Session } from '../src/game/session';
import { ageName, ageNameTo, fmt, rejectText, tr, unitName } from '../src/i18n/tr';
import { mustGetAge } from '../src/sim/compile';
import { ageUp, ageUpCommand, availableUnitIds } from '../src/ui/actions';
import { KEY_AGE_UP } from '../src/ui/constants';
import { mountKeyboard } from '../src/ui/keyboard';
import { unitTooltip } from '../src/ui/unitInfo';

afterEach(() => {
  vi.unstubAllGlobals();
});

function press(session: Session, code: string, repeat = false): void {
  vi.stubGlobal('HTMLElement', class {});
  let handler: ((e: KeyboardEvent) => void) | null = null;
  const target = {
    addEventListener: (_: string, h: (e: KeyboardEvent) => void) => {
      handler = h;
    },
    removeEventListener: () => undefined,
  };
  const unmount = mountKeyboard(session, target as unknown as Document);
  handler!({ code, repeat, ctrlKey: false, metaKey: false, altKey: false, target: {}, preventDefault: () => undefined } as unknown as KeyboardEvent);
  unmount();
}

describe('Arayüz: çağlar (Ç-01, E-08, EK-03, EK-04)', () => {
  it('Ç-01: beş çağ adı tr.ts içindedir; yönelme hâlleri "geçtin" cümlesi için tanımlıdır', () => {
    expect([1, 2, 3, 4, 5].map(ageName)).toEqual(['İlkel Çağ', 'Antik Çağ', 'Orta Çağ', 'Endüstri Çağı', 'Gelecek Çağı']);
    expect(fmt(tr.hud.ageUpNotice, { dative: ageNameTo(2) })).toBe("Antik Çağ'a geçtin");
    expect(fmt(tr.hud.ageUpNotice, { dative: ageNameTo(4) })).toBe("Endüstri Çağı'na geçtin");
  });

  it('on beş birliğin hepsinin Türkçe adı vardır ve istenen adlarla eşleşir', () => {
    expect(UNITS).toHaveLength(15);
    for (const u of UNITS) expect(unitName(u.id), u.id).not.toBe(tr.unitFallback);
    expect(unitName('ancient_front')).toBe('Kalkanlı Mızrakçı');
    expect(unitName('medieval_ranged')).toBe('Arbaletçi');
    expect(unitName('industrial_heavy')).toBe('Buharlı Top Arabası');
    expect(unitName('future_heavy')).toBe('Yürüyen Kale');
  });

  it('EK-04: deneyim yetersiz metni mevcut ve gereken deneyimi içerir; son çağ metni vardır', () => {
    expect(rejectText('notEnoughXp', undefined, { xp: 320, xpRequired: 800 })).toBe('Deneyim yetersiz (320/800)');
    expect(rejectText('maxAge')).toBe('Son çağa ulaşıldı');
    expect(rejectText('paused')).toBe('Oyun duraklatıldı');
  });

  it('Session.check: çağ atlama nedenleri alanlarıyla gelir (deneyim, altın, son çağ, duraklatma)', () => {
    const session = new Session({ createControllers: () => [null, null] });
    const next = mustGetAge(2);
    expect(session.check(ageUpCommand())).toEqual({ ok: false, reason: 'notEnoughXp', xp: 0, xpRequired: next.xpThreshold });
    session.debugMutate((s) => {
      s.sides[0].xp = next.xpThreshold;
      s.sides[0].gold = next.ageUpCost - 10;
    });
    expect(session.check(ageUpCommand())).toEqual({ ok: false, reason: 'notEnoughGold', missingGold: 10 });
    session.debugMutate((s) => {
      s.sides[0].gold = next.ageUpCost;
    });
    expect(session.check(ageUpCommand())).toEqual({ ok: true });
    session.pause();
    expect(session.check(ageUpCommand())).toEqual({ ok: false, reason: 'paused' });
    session.resume();
    session.debugMutate((s) => {
      s.sides[0].age = 5;
      s.sides[0].baseMaxHp = mustGetAge(5).baseMaxHp;
      s.sides[0].baseHp = mustGetAge(5).baseMaxHp;
    });
    expect(session.check(ageUpCommand())).toEqual({ ok: false, reason: 'maxAge' });
    session.dispose();
  });

  it('E kısayolu ve düğme aynı yoldan çağ atlar; tekrar eden tuş vuruşu yok sayılır; birlik düğmeleri yeni kadroyu gösterir', () => {
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.sides[0].xp = 100_000;
      s.sides[0].gold = 100_000;
    });
    expect(KEY_AGE_UP).toBe('KeyE');
    expect(availableUnitIds(session)).toEqual(AGES[0]!.unitIds);
    press(session, 'KeyE', true);
    session.advance(50);
    expect(session.state.sides[0].age).toBe(1);
    press(session, 'KeyE');
    session.advance(50);
    expect(session.state.sides[0].age).toBe(2);
    expect(availableUnitIds(session)).toEqual(AGES[1]!.unitIds);
    expect(ageUp(session).ok).toBe(true);
    session.advance(50);
    expect(session.state.sides[0].age).toBe(3);
    expect(availableUnitIds(session)).toEqual(AGES[2]!.unitIds);
    session.dispose();
  });

  it('K-04: kuyruktaki eski çağ siparişleri, çağ değişince de kendi türleriyle gösterilir ve doğar', () => {
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.sides[0].xp = 100_000;
      s.sides[0].gold = 100_000;
    });
    session.submit({ type: 'queueUnit', side: 0, unitId: 'primitive_heavy' });
    session.submit({ type: 'queueUnit', side: 0, unitId: 'primitive_front' });
    session.advance(50);
    ageUp(session);
    session.advance(50);
    const orders = session.state.sides[0].queue.map((o) => o.unitId);
    expect(orders).toEqual(['primitive_heavy', 'primitive_front']);
    for (const id of orders) expect(unitName(id)).not.toBe(tr.unitFallback);
    session.dispose();
  });

  it('araç ipucu: delme ve özel çarpan veriden gösterilir', () => {
    const ballista = unitTooltip('ancient_heavy', '3');
    expect(ballista).toContain('Delici');
    const crossbow = unitTooltip('medieval_ranged', '2');
    expect(crossbow).toContain('Özel çarpan: ön hat hedefe ×1,5');
    expect(unitTooltip('primitive_front', '1')).not.toContain('Özel çarpan');
  });

  it('K-08: yeniden oynama çağları, taşı ve geçiş kayıtlarını sıfırlar', () => {
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.sides[0].xp = 100_000;
      s.sides[0].gold = 100_000;
      s.stone.counter = 100;
      s.stone.owner = 0;
    });
    ageUp(session);
    session.advance(50);
    expect(session.state.sides[0].age).toBe(2);
    session.restart();
    expect(session.state.sides[0].age).toBe(1);
    expect(session.state.sides[0].stats.ageUpTicks).toEqual([]);
    expect(session.state.stone).toEqual({ counter: 0, owner: null });
    session.dispose();
  });
});
