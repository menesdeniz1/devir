import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNITS } from '../src/data/units';
import { Session } from '../src/game/session';
import { fmt, rejectText, tr, unitName } from '../src/i18n/tr';
import { getUnit } from '../src/sim/compile';
import { availableUnitIds, produceUnit, queueCommand } from '../src/ui/actions';
import { UNIT_SHORTCUT_CODES, UNIT_SHORTCUT_LABELS } from '../src/ui/constants';
import { mountKeyboard } from '../src/ui/keyboard';
import { formatNumber, roleMarkOf, roleNameOf, unitTooltip, unitTooltipLines } from '../src/ui/unitInfo';
import { arcHeightFor, arcLift, effectProgress, fadeAlpha, flightProgress } from '../src/render/projectileMath';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Arayüz: üç birlik', () => {
  it('düğme sırası ve kısayollar: İlkel Çağ üç birlik sunar; kısayollar Digit1/2/3 ve etiketler 1/2/3', () => {
    const session = new Session();
    expect(availableUnitIds(session)).toEqual(['primitive_front', 'primitive_ranged', 'primitive_heavy']);
    expect([...UNIT_SHORTCUT_CODES]).toEqual(['Digit1', 'Digit2', 'Digit3']);
    expect([...UNIT_SHORTCUT_LABELS]).toEqual(['1', '2', '3']);
    session.dispose();
  });

  it('tr.ts: her birliğin adı, her rolün adı, işareti ve karşılık açıklaması vardır', () => {
    expect(unitName('primitive_front')).toBe('Taşbaltacı');
    expect(unitName('primitive_ranged')).toBe('Mızrak Savuran');
    expect(unitName('primitive_heavy')).toBe('Kaya Kaldıracı');
    for (const u of UNITS) {
      expect(tr.unit[u.id], u.id).toBeDefined();
      expect(tr.role[u.role].length).toBeGreaterThan(0);
      expect(tr.roleMark[u.role].length).toBeGreaterThan(0);
      expect(tr.roleHint[u.role].length).toBeGreaterThan(0);
      expect(roleNameOf(u.id)).toBe(tr.role[u.role]);
      expect(roleMarkOf(u.id)).toBe(tr.roleMark[u.role]);
    }
    // Kuyruk işaretleri rolleri birbirinden ayırır.
    expect(new Set(Object.values(tr.roleMark)).size).toBe(3);
    expect(tr.roleHint.front).toContain('Ağır birliklere karşı güçlü');
  });

  it('araç ipucu: can, hasar, menzil, hız, üretim süresi ve rol açıklaması veriden gelir', () => {
    const front = unitTooltip('primitive_front', '1');
    expect(front).toContain('Taşbaltacı');
    expect(front).toContain('50 altın');
    expect(front).toContain('[1]');
    expect(front).toContain('Can 180');
    expect(front).toContain('Hasar 20');
    expect(front).toContain('Menzil 12');
    expect(front).toContain('Hız 60');
    expect(front).toContain('Üretim 3 sn');
    expect(front).toContain(tr.roleHint.front);

    const ranged = unitTooltip('primitive_ranged', '2');
    expect(ranged).toContain('Can 90');
    expect(ranged).toContain('Menzil 190');
    expect(ranged).toContain('Üretim 3,5 sn');

    const heavy = unitTooltip('primitive_heavy', '3');
    expect(heavy).toContain('Can 420');
    expect(heavy).toContain('Hasar 48');
    expect(heavy).toContain('Menzil 300');
    expect(heavy).toContain('Hız 32');
    expect(heavy).toContain('Üretim 6 sn');
    expect(heavy).toContain(fmt(tr.unitStats.splash, { radius: getUnit('primitive_heavy')!.def.splash!.radius }));
    expect(front).not.toContain('Alan hasarı (');
    expect(formatNumber(3.5)).toBe('3,5');
    expect(formatNumber(6)).toBe('6');
  });

  it('kullanılamıyorsa neden ipucunun ilk satırıdır ve değerler yine gösterilir', () => {
    const lines = unitTooltipLines('primitive_heavy', '3', 'Yetersiz altın (100 eksik)');
    expect(lines[0]).toBe('Yetersiz altın (100 eksik)');
    expect(lines.join('\n')).toContain('Can 420');
  });

  it('K-16: ret nedenleri her düğme için ayrıdır (eksik altın birliğe göre değişir)', () => {
    const session = new Session();
    session.debugMutate((s) => {
      s.sides[0].gold = 60;
    });
    const reasons = availableUnitIds(session).map((id) => {
      const check = session.check(queueCommand(id));
      return check.ok ? 'ok' : rejectText(check.reason, check.missingGold);
    });
    expect(reasons).toEqual(['ok', 'Yetersiz altın (10 eksik)', 'Yetersiz altın (100 eksik)']);
    session.dispose();
  });

  it('düğme/kısayol yolu: index birliği sipariş eder (0 ön hat, 1 menzilli, 2 ağır), geçersiz index null', () => {
    const session = new Session();
    session.debugMutate((s) => {
      s.sides[0].gold = 10_000;
    });
    for (const index of [0, 1, 2]) expect(produceUnit(session, index)?.ok).toBe(true);
    expect(produceUnit(session, 3)).toBeNull();
    session.advance(50);
    expect(session.state.sides[0].queue.map((o) => o.unitId)).toEqual(['primitive_front', 'primitive_ranged', 'primitive_heavy']);
    session.dispose();
  });

  it('klavye: Digit1/2/3 sırasıyla ön hat, menzilli ve ağır sipariş eder; tekrar eden tuş yok sayılır', () => {
    vi.stubGlobal('HTMLElement', class FakeElement {});
    const session = new Session();
    session.debugMutate((s) => {
      s.sides[0].gold = 10_000;
    });
    let handler: ((event: KeyboardEvent) => void) | null = null;
    const target = {
      addEventListener: (_type: string, fn: EventListenerOrEventListenerObject) => {
        handler = fn as (event: KeyboardEvent) => void;
      },
      removeEventListener: () => {
        handler = null;
      },
    };
    const unmount = mountKeyboard(session, target as unknown as Document);
    expect(handler).not.toBeNull();
    const press = (code: string, repeat = false): void => {
      handler!({ code, repeat, ctrlKey: false, metaKey: false, altKey: false, target: {}, preventDefault: () => undefined } as unknown as KeyboardEvent);
    };
    press('Digit3');
    press('Digit2');
    press('Digit1');
    press('Digit1', true);
    session.advance(50);
    expect(session.state.sides[0].queue.map((o) => o.unitId)).toEqual(['primitive_heavy', 'primitive_ranged', 'primitive_front']);
    unmount();
    expect(handler).toBeNull();
    session.dispose();
  });

  it('Session.previousProjectileX: atıldığı tick için yok, sonraki tick için bir önceki konum', () => {
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.units.push({ id: s.nextId, side: 0, type: 'primitive_ranged', x: 500, hp: 90, cooldown: 0, mode: 'wait' });
      s.nextId += 1;
      s.units.push({ id: s.nextId, side: 1, type: 'primitive_front', x: 500 + 15 + 150 + 18, hp: 180, cooldown: 0, mode: 'wait' });
      s.nextId += 1;
    });
    session.advance(50);
    const fired = session.state.projectiles[0]!;
    expect(fired).toBeDefined();
    expect(session.previousProjectileX(fired.id)).toBeUndefined();
    const x0 = fired.x;
    session.advance(50);
    const next = session.state.projectiles.find((p) => p.id === fired.id);
    if (next !== undefined) expect(session.previousProjectileX(fired.id)).toBe(x0);
    session.restart();
    expect(session.previousProjectileX(fired.id)).toBeUndefined();
    session.dispose();
  });
});

describe('Mermi çizimi: saf matematik', () => {
  it('uçuş ilerlemesi 0..1 aralığındadır; sıfır mesafede 1', () => {
    expect(flightProgress(100, 100, 400)).toBe(0);
    expect(flightProgress(100, 250, 400)).toBeCloseTo(0.5, 9);
    expect(flightProgress(100, 400, 400)).toBe(1);
    expect(flightProgress(100, 999, 400)).toBe(1);
    expect(flightProgress(100, -5, 400)).toBe(0);
    expect(flightProgress(400, 300, 100)).toBeCloseTo(1 / 3, 9);
    expect(flightProgress(100, 100, 100)).toBe(1);
  });

  it('yay: uçlarda 0, ortada tepe yüksekliği, simetrik', () => {
    expect(arcLift(0, 80)).toBe(0);
    expect(arcLift(1, 80)).toBe(0);
    expect(arcLift(0.5, 80)).toBe(80);
    expect(arcLift(0.25, 80)).toBeCloseTo(arcLift(0.75, 80), 9);
    expect(arcHeightFor(100, 0.2, 50)).toBe(20);
    expect(arcHeightFor(-1000, 0.2, 50)).toBe(50);
  });

  it('solma ve etki ilerlemesi sınırlıdır', () => {
    expect(fadeAlpha(0)).toBe(1);
    expect(fadeAlpha(1)).toBe(0);
    expect(fadeAlpha(2)).toBe(0);
    expect(effectProgress(100, 400)).toBe(0.25);
    expect(effectProgress(999, 400)).toBe(1);
    expect(effectProgress(10, 0)).toBe(1);
  });
});
