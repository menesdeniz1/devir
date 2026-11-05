import { afterEach, describe, expect, it, vi } from 'vitest';
import { Session } from '../src/game/session';
import { tr } from '../src/i18n';
import { battlefieldBounds } from '../src/sim/geometry';
import { TARGET_KEY_STEP } from '../src/ui/constants';
import { mountKeyboard } from '../src/ui/keyboard';
import { shortcutRows } from '../src/ui/shortcuts';
import { createTargeting } from '../src/ui/targeting';
import { menuNeedsRebuild } from '../src/ui/towers';

afterEach(() => vi.unstubAllGlobals());

function readySession(): Session {
  const session = new Session({ opponent: 'none' });
  session.debugMutate((s) => void (s.sides[0].abilityCooldown = 0));
  return session;
}

const center = (): number => {
  const f = battlefieldBounds();
  return (f.x0 + f.x1) / 2;
};

describe('Yetenek hedeflemesi: klavye imleci', () => {
  it('hedefleme kapalıyken nudge ve Enter etkisizdir', () => {
    const session = readySession();
    const t = createTargeting(session);
    expect(t.nudge(1)).toBe(false);
    expect(t.applyFromKeyboard()).toBe(false);
    expect(t.cursorX).toBeNull();
  });

  it('imleç yoksa ilk ok savaş alanının ortasında başlatır; sonra adım adım kayar ve sınırlara kırpılır', () => {
    const session = readySession();
    const t = createTargeting(session);
    expect(t.begin()).toBe(true);
    expect(t.nudge(1)).toBe(true);
    expect(t.cursorX).toBe(center());
    t.nudge(1);
    expect(t.cursorX).toBe(center() + TARGET_KEY_STEP);
    t.nudge(-1);
    t.nudge(-1);
    expect(t.cursorX).toBe(center() - TARGET_KEY_STEP);
    for (let i = 0; i < 1000; i++) t.nudge(-1);
    expect(t.cursorX).toBe(battlefieldBounds().x0);
    for (let i = 0; i < 1000; i++) t.nudge(1);
    expect(t.cursorX).toBe(battlefieldBounds().x1);
  });

  it('önizleme klavye imlecini izler', () => {
    const session = readySession();
    const t = createTargeting(session);
    t.begin();
    expect(t.previewArea()).toBeNull();
    t.nudge(1);
    const area = t.previewArea();
    expect(area).not.toBeNull();
    expect((area!.x0 + area!.x1) / 2).toBeCloseTo(center(), 5);
  });

  it('Enter imleç konumunda uygular (imleç yoksa merkezde); komut kuyruğa girer, hedefleme kapanır', () => {
    const session = readySession();
    const t = createTargeting(session);
    t.begin();
    expect(t.applyFromKeyboard()).toBe(true);
    expect(t.active).toBe(false);
    expect(session.hasPendingCommand((c) => c.type === 'castAbility')).toBe(true);
  });

  it('kaydırılmış imleçte Q uygular', () => {
    const session = readySession();
    const t = createTargeting(session);
    t.begin();
    t.nudge(1);
    t.nudge(1);
    t.pressKey();
    expect(t.active).toBe(false);
    const pending: number[] = [];
    session.hasPendingCommand((c) => (c.type === 'castAbility' && pending.push(c.x), false));
    expect(pending).toEqual([center() + TARGET_KEY_STEP]);
  });

  it('Esc (cancel) hedeflemeyi kapatır', () => {
    const session = readySession();
    const t = createTargeting(session);
    t.begin();
    t.nudge(1);
    expect(t.cancel()).toBe(true);
    expect(t.active).toBe(false);
  });
});

describe('Klavye: hedeflemede ←/→/Enter', () => {
  function keyHandler(session: Session, targeting: ReturnType<typeof createTargeting>) {
    vi.stubGlobal('HTMLElement', class {});
    let handler: ((e: KeyboardEvent) => void) | null = null;
    const target = { addEventListener: (_: string, h: (e: KeyboardEvent) => void) => void (handler = h), removeEventListener: () => undefined };
    mountKeyboard(session, target as unknown as Document, null, targeting);
    return (code: string): { prevented: boolean } => {
      let prevented = false;
      handler!({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: {}, preventDefault: () => (prevented = true) } as unknown as KeyboardEvent);
      return { prevented };
    };
  }

  it('hedefleme açıkken oklar imleci taşır, Enter uygular; kapalıyken tuşlar yutulmaz', () => {
    const session = readySession();
    const t = createTargeting(session);
    const press = keyHandler(session, t);
    expect(press('ArrowRight').prevented).toBe(false);
    expect(press('Enter').prevented).toBe(false);
    expect(t.cursorX).toBeNull();

    press('KeyQ');
    expect(t.active).toBe(true);
    expect(press('ArrowRight').prevented).toBe(true);
    expect(press('ArrowRight').prevented).toBe(true);
    expect(t.cursorX).toBe(center() + TARGET_KEY_STEP);
    expect(press('ArrowLeft').prevented).toBe(true);
    expect(t.cursorX).toBe(center());
    expect(press('Enter').prevented).toBe(true);
    expect(t.active).toBe(false);
    expect(session.hasPendingCommand((c) => c.type === 'castAbility')).toBe(true);
  });
});

describe('Kısayol listesi ve metinler', () => {
  it('klavye hedefleme satırları listededir; ipucu metni tr.ts içindedir', () => {
    const rows = shortcutRows();
    const move = rows.find((r) => r.action === tr.shortcuts.targetMove);
    const apply = rows.find((r) => r.action === tr.shortcuts.targetApply);
    expect(move?.keys).toEqual(['←', '→']);
    expect(apply?.keys).toEqual(['Enter', 'Q']);
    expect(tr.abilityUi.targetHintKeys.length).toBeGreaterThan(0);
  });
});

describe('Kule menüsü: bayat menü', () => {
  it('kule kimlikleri güncel çağınkilerle aynıysa yeniden kurulmaz; çağ değişince kurulur', () => {
    expect(menuNeedsRebuild(['a_fast', 'a_heavy'], ['a_fast', 'a_heavy'])).toBe(false);
    expect(menuNeedsRebuild(['a_fast', 'a_heavy'], ['b_fast', 'b_heavy'])).toBe(true);
    expect(menuNeedsRebuild(['a_fast'], ['a_fast', 'a_heavy'])).toBe(true);
    // Satış menüsünde (towerId null) kule listesi yoktur: boş açık liste yalnız boş güncel listeyle eşleşir.
    expect(menuNeedsRebuild([null], [])).toBe(false);
  });
});
