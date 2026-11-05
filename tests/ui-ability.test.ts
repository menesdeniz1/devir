import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ABILITIES } from '../src/data/abilities';
import { AGES } from '../src/data/ages';
import { WORLD } from '../src/data/world';
import { Session, type SessionEvent } from '../src/game/session';
import { abilityName, fmt, rejectText, tr } from '../src/i18n/tr';
import { battlefieldBounds } from '../src/sim/geometry';
import { abilityDescription, abilityReasonText, abilityTooltip, castAbilityAt, castCommand, checkAbility, cooldownSeconds, playerAbility } from '../src/ui/ability';
import { KEY_ABILITY } from '../src/ui/constants';
import { mountKeyboard } from '../src/ui/keyboard';
import { createTargeting } from '../src/ui/targeting';
import { mountTargetingPointer } from '../src/ui/targetingPointer';

const FIELD = battlefieldBounds();

afterEach(() => {
  vi.unstubAllGlobals();
});

function quietSession(): Session {
  const session = new Session({ createControllers: () => [null, null] });
  session.debugMutate((s) => {
    s.sides[0].abilityCooldown = 0;
  });
  return session;
}

function setAge(session: Session, age: number): void {
  session.debugMutate((s) => {
    s.sides[0].age = age;
    s.sides[0].baseMaxHp = AGES[age - 1]!.baseMaxHp;
    s.sides[0].baseHp = AGES[age - 1]!.baseMaxHp;
    s.sides[0].stats.ageUpTicks = Array.from({ length: age - 1 }, () => 0);
  });
}

function collect(session: Session): { events: SessionEvent[]; stop: () => void } {
  const events: SessionEvent[] = [];
  const stop = session.subscribe((e) => events.push(e));
  return { events, stop };
}

describe('K-12 / Y-07: duraklatma ve maç sonu (oturum katmanı)', () => {
  it('K-12: duraklatmada oturum yeteneği "paused" ile reddeder; komut kuyruğa girmez; bekleme ve süreler ilerlemez', () => {
    const session = quietSession();
    session.pause();
    expect(session.check(castCommand(900))).toEqual({ ok: false, reason: 'paused' });
    expect(castAbilityAt(session, 900)).toEqual({ ok: false, reason: 'paused' });
    expect(session.pendingCommandCount).toBe(0);
    expect(checkAbility(session)).toEqual({ ok: false, reason: 'paused' });
    // Bekleme sürerken de zaman ilerlemez: kare süresi ne olursa olsun tick sabit.
    session.debugMutate((s) => {
      s.sides[0].abilityCooldown = 100;
    });
    session.advance(5000);
    expect(session.tick).toBe(0);
    expect(session.state.sides[0].abilityCooldown).toBe(100);
    // Devam edince kullanılabilir olmaz (bekleme sürüyor), süre yeniden akar.
    session.resume();
    session.advance(50);
    expect(session.state.sides[0].abilityCooldown).toBe(99);
    session.dispose();
  });

  it('K-12/K-14: duraklatma sırasında alan ve gecikmeli vuruş da donar', () => {
    const session = quietSession();
    setAge(session, 4);
    session.debugMutate((s) => {
      s.units.push({ id: s.nextId, side: 1, type: 'primitive_heavy', x: 800, hp: 420, cooldown: 100_000, mode: 'wait', stunTicks: 0, vulnTicks: 0, vulnPct: 0 });
      s.nextId += 1;
    });
    expect(session.submit(castCommand(800)).ok).toBe(true);
    session.advance(50);
    const left = session.state.strikes[0]!.ticksLeft;
    session.pause();
    session.advance(10_000);
    expect(session.state.strikes[0]!.ticksLeft).toBe(left);
    session.resume();
    session.advance(50);
    expect(session.state.strikes[0]!.ticksLeft).toBe(left - 1);
    session.dispose();
  });

  it('K-12: bitmiş maçta yetenek "matchOver" ile reddedilir', () => {
    const session = quietSession();
    session.debugMutate((s) => {
      s.outcome = { kind: 'win', winner: 0, tick: 3 };
    });
    expect(session.check(castCommand(900))).toEqual({ ok: false, reason: 'matchOver' });
    expect(castAbilityAt(session, 900).ok).toBe(false);
    session.dispose();
  });

  it('EK-04: bekleme reddi kalan tick değerini taşır; metin "Bekleme: 12 sn" (yukarı yuvarlanır)', () => {
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.sides[0].abilityCooldown = 12 * WORLD.tickRate;
    });
    const check = session.check(castCommand(900));
    expect(check).toEqual({ ok: false, reason: 'abilityCooldown', cooldownTicks: 12 * WORLD.tickRate });
    if (check.ok) throw new Error('beklenmiyor');
    expect(abilityReasonText(check)).toBe('Bekleme: 12 sn');
    session.debugMutate((s) => {
      s.sides[0].abilityCooldown = 12 * WORLD.tickRate - 1;
    });
    const almost = session.check(castCommand(900));
    if (almost.ok) throw new Error('beklenmiyor');
    expect(abilityReasonText(almost)).toBe('Bekleme: 12 sn');
    expect(cooldownSeconds(1)).toBe(1);
    expect(cooldownSeconds(WORLD.tickRate)).toBe(1);
    expect(cooldownSeconds(WORLD.tickRate + 1)).toBe(2);
    expect(rejectText('abilityCooldown', undefined, undefined, 7)).toBe('Bekleme: 7 sn');
    session.dispose();
  });

  it('Y-05: çağ değişince yetenek yeni çağın yeteneğidir ve kalan bekleme korunur', () => {
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.sides[0].gold = 100_000;
      s.sides[0].xp = 100_000;
      s.sides[0].abilityCooldown = 500;
    });
    expect(playerAbility(session)?.def.id).toBe('primitive_stampede');
    expect(session.submit({ type: 'ageUp', side: 0 }).ok).toBe(true);
    session.advance(50);
    expect(playerAbility(session)?.def.id).toBe('ancient_fire_trench');
    expect(session.state.sides[0].abilityCooldown).toBe(499);
    session.dispose();
  });
});

describe('Y-02: hedefleme', () => {
  it('Y-02: bekleme sürerken hedefleme açılmaz; hazırken Q/düğme açar', () => {
    const session = new Session({ createControllers: () => [null, null] });
    const targeting = createTargeting(session);
    expect(targeting.begin()).toBe(false);
    expect(targeting.active).toBe(false);
    session.debugMutate((s) => {
      s.sides[0].abilityCooldown = 0;
    });
    expect(targeting.begin()).toBe(true);
    expect(targeting.active).toBe(true);
    session.dispose();
  });

  it('Y-02: önizleme yalnız etkin hedeflemede ve imleç koridordayken; alan yetenek genişliğinde ve savaş alanına kırpılmış', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    expect(targeting.previewArea()).toBeNull();
    targeting.begin();
    expect(targeting.previewArea()).toBeNull(); // imleç yok
    targeting.setCursor(1000);
    const width = playerAbility(session)!.def.width;
    expect(targeting.previewArea()).toEqual({ x0: 1000 - width / 2, x1: 1000 + width / 2 });
    targeting.setCursor(FIELD.x0 + 5);
    expect(targeting.previewArea()).toEqual({ x0: FIELD.x0, x1: FIELD.x0 + 5 + width / 2 });
    targeting.setCursor(FIELD.x1 - 5);
    expect(targeting.previewArea()).toEqual({ x0: FIELD.x1 - 5 - width / 2, x1: FIELD.x1 });
    targeting.setCursor(null);
    expect(targeting.previewArea()).toBeNull();
    session.dispose();
  });

  it('Y-02: yetenek genişliği çağla değişir (önizleme yeni yeteneğin genişliğinde)', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    targeting.begin();
    targeting.setCursor(1000);
    for (const a of ABILITIES) {
      setAge(session, a.age);
      const area = targeting.previewArea()!;
      expect(area.x1 - area.x0, a.id).toBe(a.width);
    }
    session.dispose();
  });

  it('Y-02: sol tık (uygula) komutu kabul ettirir ve hedeflemeyi kapatır; sonraki adımda abilityCast olayı gelir', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    const { events } = collect(session);
    targeting.begin();
    // İmleç koridorda değilken uygulanmaz.
    expect(targeting.applyAtCursor()).toBe(false);
    expect(targeting.active).toBe(true);
    targeting.setCursor(900);
    expect(targeting.applyAtCursor()).toBe(true);
    expect(targeting.active).toBe(false);
    session.advance(50);
    const simEvents = events.filter((e): e is Extract<SessionEvent, { type: 'sim' }> => e.type === 'sim').flatMap((e) => [...e.events]);
    expect(simEvents.find((e) => e.type === 'abilityCast')).toMatchObject({ side: 0, abilityId: 'primitive_stampede', x0: 780, x1: 1020 });
    // Bekleme başladı: yeniden hedefleme açılmaz.
    expect(targeting.begin()).toBe(false);
    session.dispose();
  });

  it('Y-02: sağ tık/Esc (cancel) hedeflemeyi kapatır ve komut göndermez; kapalıyken cancel false döner', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    expect(targeting.cancel()).toBe(false);
    targeting.begin();
    targeting.setCursor(900);
    expect(targeting.cancel()).toBe(true);
    expect(targeting.active).toBe(false);
    expect(session.pendingCommandCount).toBe(0);
    expect(targeting.applyAtCursor()).toBe(false);
    session.dispose();
  });

  it('Y-02: Q (pressKey) önce hedeflemeyi açar, ikinci basış imleç konumunda uygular; imleç yoksa uygulamaz', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    targeting.pressKey();
    expect(targeting.active).toBe(true);
    targeting.pressKey(); // imleç koridorda değil
    expect(targeting.active).toBe(true);
    expect(session.pendingCommandCount).toBe(0);
    targeting.setCursor(1200);
    targeting.pressKey();
    expect(targeting.active).toBe(false);
    expect(session.pendingCommandCount).toBe(1);
    session.dispose();
  });

  it('Y-07: duraklatma ve maç sonu hedeflemeyi kapatır; hedefleme açılamaz', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    targeting.begin();
    targeting.setCursor(900);
    session.pause();
    targeting.update();
    expect(targeting.active).toBe(false);
    expect(targeting.begin()).toBe(false);
    expect(targeting.applyAtCursor()).toBe(false);
    session.resume();
    expect(targeting.begin()).toBe(true);
    session.debugMutate((s) => {
      s.outcome = { kind: 'draw', tick: 1 };
    });
    targeting.update();
    expect(targeting.active).toBe(false);
    session.dispose();
  });

  it('Y-07: yeniden oyna (yeni maç) hedeflemeyi kapatır (başlangıç beklemesi başladı)', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    targeting.begin();
    session.restart();
    targeting.update();
    expect(targeting.active).toBe(false);
    session.dispose();
  });
});

describe('Y-02: klavye (Q) ve fare', () => {
  function mountKeys(session: Session, targeting: ReturnType<typeof createTargeting>, menu: { dismiss(): boolean } | null = null) {
    vi.stubGlobal('HTMLElement', class FakeElement {});
    let handler: ((event: KeyboardEvent) => void) | null = null;
    const target = {
      addEventListener: (_type: string, fn: EventListenerOrEventListenerObject) => {
        handler = fn as (event: KeyboardEvent) => void;
      },
      removeEventListener: () => {
        handler = null;
      },
    };
    const unmount = mountKeyboard(session, target as unknown as Document, menu, targeting);
    const prevented: boolean[] = [];
    const press = (code: string, repeat = false): void => {
      handler!({ code, repeat, ctrlKey: false, metaKey: false, altKey: false, target: {}, preventDefault: () => prevented.push(true) } as unknown as KeyboardEvent);
    };
    return { press, unmount, prevented };
  }

  it('Q hedeflemeyi açar, tekrar eden tuş yok sayılır, ikinci Q imleç konumunda uygular', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    const keys = mountKeys(session, targeting);
    expect(KEY_ABILITY).toBe('KeyQ');
    keys.press('KeyQ');
    expect(targeting.active).toBe(true);
    keys.press('KeyQ', true);
    expect(targeting.active).toBe(true);
    targeting.setCursor(1000);
    keys.press('KeyQ');
    expect(targeting.active).toBe(false);
    expect(session.pendingCommandCount).toBe(1);
    keys.unmount();
    session.dispose();
  });

  it('Esc önce hedeflemeyi iptal eder (duraklatmaz); hedefleme yokken duraklatır', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    const keys = mountKeys(session, targeting, { dismiss: () => targeting.cancel() });
    keys.press('KeyQ');
    expect(targeting.active).toBe(true);
    keys.press('Escape');
    expect(targeting.active).toBe(false);
    expect(session.paused).toBe(false);
    keys.press('Escape');
    expect(session.paused).toBe(true);
    keys.unmount();
    session.dispose();
  });

  it('Q duraklatmada hedeflemeyi açmaz', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    const keys = mountKeys(session, targeting);
    session.pause();
    keys.press('KeyQ');
    expect(targeting.active).toBe(false);
    keys.unmount();
    session.dispose();
  });

  it('hedefleme verilmeden kurulan klavye Q tuşunu işlemez (geriye uyumluluk)', () => {
    vi.stubGlobal('HTMLElement', class FakeElement {});
    const session = quietSession();
    let handler: ((event: KeyboardEvent) => void) | null = null;
    const target = {
      addEventListener: (_t: string, fn: EventListenerOrEventListenerObject) => {
        handler = fn as (event: KeyboardEvent) => void;
      },
      removeEventListener: () => undefined,
    };
    mountKeyboard(session, target as unknown as Document);
    handler!({ code: 'KeyQ', repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: {}, preventDefault: () => undefined } as unknown as KeyboardEvent);
    expect(session.pendingCommandCount).toBe(0);
    session.dispose();
  });

  it('fare: imleç koridordaysa izlenir, dışındaysa null; sol tık uygular; sağ tık bağlam menüsünü engelleyip iptal eder', () => {
    const session = quietSession();
    const targeting = createTargeting(session);
    const handlers = new Map<string, (event: unknown) => void>();
    const host = {
      addEventListener: (type: string, fn: (event: unknown) => void) => handlers.set(type, fn),
      removeEventListener: (type: string) => handlers.delete(type),
    };
    // Sahte izdüşüm: istemci x'i dünya x'ine bire bir; y < 100 koridor dışı.
    const projection = { screenToWorldX: (x: number) => x, isInCorridor: (_x: number, y: number) => y >= 100 };
    const unmount = mountTargetingPointer(host as unknown as HTMLElement, projection, targeting);
    const fire = (type: string, event: Record<string, unknown> = {}): void => handlers.get(type)!(event);

    // Hedefleme kapalıyken tık ve sağ tık hiçbir şey yapmaz (bağlam menüsü engellenmez).
    let prevented = 0;
    fire('pointerdown', { button: 0, clientX: 900, clientY: 300 });
    fire('contextmenu', { preventDefault: () => (prevented += 1) });
    expect(session.pendingCommandCount).toBe(0);
    expect(prevented).toBe(0);

    targeting.begin();
    fire('pointermove', { clientX: 1000, clientY: 300 });
    expect(targeting.cursorX).toBe(1000);
    fire('pointermove', { clientX: 1000, clientY: 20 });
    expect(targeting.cursorX).toBeNull();
    // Koridor dışına tık uygulamaz, hedefleme sürer.
    fire('pointerdown', { button: 0, clientX: 1000, clientY: 20 });
    expect(targeting.active).toBe(true);
    // Orta tık uygulamaz.
    fire('pointerdown', { button: 1, clientX: 1000, clientY: 300 });
    expect(targeting.active).toBe(true);
    // Sol tık koridorda uygular.
    fire('pointerdown', { button: 0, clientX: 1100, clientY: 300 });
    expect(targeting.active).toBe(false);
    expect(session.pendingCommandCount).toBe(1);

    // Sağ tık: iptal.
    session.advance(50);
    session.debugMutate((s) => {
      s.sides[0].abilityCooldown = 0;
    });
    targeting.begin();
    fire('contextmenu', { preventDefault: () => (prevented += 1) });
    expect(prevented).toBe(1);
    expect(targeting.active).toBe(false);

    // İmleç ekrandan çıkınca önizleme biter.
    targeting.begin();
    fire('pointermove', { clientX: 1000, clientY: 300 });
    fire('pointerleave');
    expect(targeting.cursorX).toBeNull();

    unmount();
    expect(handlers.size).toBe(0);
    session.dispose();
  });
});

describe('Metinler ve araç ipuçları (EK-03, EK-04, Y-06)', () => {
  it('her yeteneğin adı ve açıklaması tr.ts içindedir; açıklama sayıları veriden gelir, yer tutucu kalmaz', () => {
    expect(abilityName('primitive_stampede')).toBe('Sürü Hücumu');
    expect(abilityName('ancient_fire_trench')).toBe('Ateş Hendeği');
    expect(abilityName('medieval_caltrops')).toBe('Çivi Kapanı');
    expect(abilityName('industrial_barrage')).toBe('Baraj Ateşi');
    expect(abilityName('future_stasis')).toBe('Durağanlık Alanı');
    expect(Object.keys(tr.ability).sort()).toEqual(ABILITIES.map((a) => a.id).sort());
    for (const age of AGES) {
      const session = new Session({ createControllers: () => [null, null] });
      setAge(session, age.age);
      const ability = playerAbility(session)!;
      expect(ability.def.id).toBe(age.abilityId);
      const desc = abilityDescription(ability);
      expect(desc.trim().length).toBeGreaterThan(10);
      expect(desc, age.abilityId).not.toContain('{');
      const tip = abilityTooltip(ability, 'Q');
      expect(tip).toContain(abilityName(age.abilityId));
      expect(tip).toContain('[Q]');
      expect(tip).toContain(`Alan ${ability.def.width}`);
      expect(tip).toContain(`Bekleme ${ability.def.cooldownSec} sn`);
      expect(abilityTooltip(ability, 'Q', 'Bekleme: 12 sn').startsWith('Bekleme: 12 sn\n')).toBe(true);
      session.dispose();
    }
    expect(abilityDescription(playerAbilityOf('primitive_stampede'))).toContain(String(ABILITIES[0]!.impactDamage));
    expect(abilityDescription(playerAbilityOf('medieval_caltrops'))).toContain('%50');
    expect(abilityDescription(playerAbilityOf('future_stasis'))).toContain('%30');
    expect(abilityDescription(playerAbilityOf('industrial_barrage'))).toContain('1,5');
  });

  it('hedefleme ipucu ve arayüz metinleri', () => {
    expect(tr.abilityUi.targetHint).toBe('Hedef seç: sol tık uygula, sağ tık veya Esc iptal');
    expect(tr.abilityUi.key).toBe('Q');
    expect(fmt(tr.abilityUi.castFoe, { name: 'Sürü Hücumu' })).toBe('Rakip Sürü Hücumu kullandı');
    expect(fmt(tr.abilityUi.ariaBlocked, { name: 'Sürü Hücumu', key: 'Q', reason: 'Bekleme: 12 sn' })).toContain('Bekleme: 12 sn');
  });
});

function abilityWidthPx(): number {
  const css = readFileSync(join(__dirname, '..', 'src', 'ui', 'style.css'), 'utf8');
  const block = css.slice(css.indexOf('.hud-ability {'));
  return parseInt(block.slice(block.indexOf('width:') + 6), 10);
}

describe('Düzen: alt panel (1280×720 bütçesi)', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'ui', 'style.css'), 'utf8');

  it('yetenek grubu 130 px genişliğindedir ve 1880 px altı iki satırlı düzende ilk satırdadır (order 1)', () => {
    expect(/\.hud-ability\s*\{[^}]*width:\s*130px/.test(css)).toBe(true);
    const media = css.slice(css.indexOf('@media (max-width: 1879px)'));
    expect(media).toMatch(/\.hud-gold,\s*\.hud-age,\s*\.hud-units,\s*\.hud-ability\s*\{\s*order:\s*1/);
  });

  it('tek satırlı geniş düzenin toplam genişliği 1880 px altında kalır (yetenek grubu dahil)', () => {
    // Genişlikler style.css'teki sabit değerlerdir; toplam: dolgu 32 + gruplar + 5 boşluk (24).
    const gold = 110;
    const age = 190;
    const units = 3 * 170 + 2 * 12;
    const ability = abilityWidthPx();
    const queue = 5 * 62 + 4 * 8;
    const defense = 3 * 128 + 2 * 8;
    const total = 32 + gold + age + units + queue + defense + ability + 5 * 24;
    expect(total).toBeLessThan(1880);
    expect(css).toContain('--p');
  });

  it('1280 px düzeninde ilk satır (altın, çağ, 3 birlik, yetenek) 1280 px içinde kalır', () => {
    const ability = abilityWidthPx();
    expect(ability).toBeLessThanOrEqual(130);
    const total = 24 + 96 + 240 + (3 * 150 + 2 * 12) + ability + 4 * 16;
    expect(total).toBeLessThanOrEqual(1280);
  });
});

function playerAbilityOf(id: string) {
  const session = new Session({ createControllers: () => [null, null] });
  const age = AGES.find((a) => a.abilityId === id)!.age;
  setAge(session, age);
  const ability = playerAbility(session)!;
  session.dispose();
  return ability;
}
