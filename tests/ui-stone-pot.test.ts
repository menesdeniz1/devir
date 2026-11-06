import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGES } from '../src/data/ages';
import { EROSION, STONE } from '../src/data/stone';
import { WORLD } from '../src/data/world';
import { Session } from '../src/game/session';
import { fmt, tr } from '../src/i18n';
import { mountHud } from '../src/ui/hud';
import { FakeDocument } from './fake-dom';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Taş kazanı ve aşınmanın arayüzde görünmesi (GDD §8, §8.1; PRD K-17, K-18). */
function mount(erosion?: boolean) {
  const doc = new FakeDocument();
  vi.stubGlobal('document', doc);
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const session = new Session({ createControllers: () => [null, null] });
  if (erosion !== undefined) session.startMatch({ seed: 1, opponent: 'none', erosion });
  const hud = mountHud(root as unknown as HTMLElement, session, undefined, {});
  return { root, session, hud };
}

const keep = (n: number): number => Math.round(n * (1 - STONE.potShare));

describe('Arayüz: Sınır Taşı kazanı', () => {
  it('taş sendeyken gösterge hemen alınan payı, rozet kazanı gösterir; gelir satırı payı sayar', () => {
    const { root, session, hud } = mount();
    session.debugMutate((s) => {
      s.stone.counter = STONE.counterMax;
      s.stone.owner = 0;
      s.stone.potGold = 120;
      s.stone.potXp = 80;
    });
    hud.update(16);
    const age = AGES[0]!;
    expect(root.querySelector('.hud-stone__value')!.textContent).toBe(
      fmt(tr.hud.stoneOwned, { owner: tr.hud.you, gold: keep(age.stoneGoldPerSec), xp: keep(age.stoneXpPerSec) }),
    );
    const pot = root.querySelector('.hud-stone__pot')!;
    expect(pot.getAttribute('data-shown')).toBe('true');
    expect(pot.textContent).toBe(fmt(tr.hud.stonePot, { gold: 120 }));
    expect(pot.getAttribute('aria-label')).toBe(fmt(tr.hud.stonePotAria, { gold: 120, xp: 80 }));
    expect(root.querySelector('.hud-gold__income')!.textContent).toBe(
      fmt(tr.hud.incomeWithStone, { n: age.incomePerSec + keep(age.stoneGoldPerSec), stone: keep(age.stoneGoldPerSec) }),
    );
  });

  it('kazan boşken rozet gizli ama yeri ayrılı kalır (düzen zıplamaz)', () => {
    const { root, hud } = mount();
    hud.update(16);
    const pot = root.querySelector('.hud-stone__pot')!;
    expect(pot.getAttribute('data-shown')).toBe('false');
    expect(pot.textContent).toBe('');
  });

  it('kazanı söken bildirim alır: biz söktüysek altın ve deneyim, rakip söktüyse altın', () => {
    const { root, session, hud } = mount();
    const notice = () => root.querySelector('.hud-notice')!;
    session.debugMutate((s) => {
      s.stone.counter = 0;
      s.stone.owner = 1;
      s.stone.potGold = 340;
      s.stone.potXp = 250;
      s.units.push({ id: s.nextId++, side: 0, type: 'primitive_front', x: (STONE.zoneStart + STONE.zoneEnd) / 2, hp: 180, cooldown: 0, mode: 'wait', stunTicks: 0, vulnTicks: 0, vulnPct: 0 });
    });
    session.advance(1000 / WORLD.tickRate);
    hud.update(16);
    expect(notice().textContent).toBe(fmt(tr.hud.noticePotClaimed, { gold: 340, xp: 250 }));
  });
});

describe('Arayüz: aşınma', () => {
  it('başlangıcında bildirim, sürerken saat uyarı renginde ve ipucu var', () => {
    const { root, session, hud } = mount();
    session.debugMutate((s) => {
      s.tick = EROSION.startSec * WORLD.tickRate - 1;
    });
    hud.update(16);
    expect(root.querySelector('.hud-clock')!.getAttribute('data-eroding')).toBe('false');
    session.advance(1000 / WORLD.tickRate);
    hud.update(16);
    expect(root.querySelector('.hud-notice')!.textContent).toBe(tr.hud.noticeErosion);
    const clock = root.querySelector('.hud-clock')!;
    expect(clock.getAttribute('data-eroding')).toBe('true');
    expect(clock.getAttribute('title')).toBe(tr.hud.erosionTip);
  });

  it('kapalı maçta saat uyarıya geçmez', () => {
    const { root, session, hud } = mount(false);
    session.debugMutate((s) => {
      s.tick = (EROSION.startSec + 60) * WORLD.tickRate;
    });
    hud.update(16);
    expect(root.querySelector('.hud-clock')!.getAttribute('data-eroding')).toBe('false');
    expect(root.querySelector('.hud-clock')!.getAttribute('title')).toBeNull();
  });
});
