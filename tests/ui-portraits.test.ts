import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGES } from '../src/data/ages';
import { Session } from '../src/game/session';
import { PORTRAIT_BUDGET_MS, PortraitCache, prefetchAge, type PortraitKind } from '../src/render/portraits';
import { produceUnit } from '../src/ui/actions';
import { mountHud } from '../src/ui/hud';
import { portraitBinder } from '../src/ui/portrait';
import { buildTower } from '../src/ui/towers';
import { FakeDocument, type FakeElement } from './fake-dom';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Elle ilerleyen saat (üretici kendi süresini ilerletir). */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('Portre önbelleği (GDD §11)', () => {
  it('hazır değilse null döner ve işi bir kez kuyruğa alır; pump üretir, sonra önbellekten verir', () => {
    const calls: string[] = [];
    const cache = new PortraitCache((kind, id) => {
      calls.push(`${kind}:${id}`);
      return `data:${kind}:${id}`;
    }, () => 0);
    expect(cache.get('unit', 'primitive_front')).toBeNull();
    expect(cache.get('unit', 'primitive_front')).toBeNull();
    expect(cache.stats.pending).toBe(1);
    expect(cache.pump()).toBe(1);
    expect(cache.get('unit', 'primitive_front')).toBe('data:unit:primitive_front');
    expect(cache.get('unit', 'primitive_front')).toBe('data:unit:primitive_front');
    // Aynı kimlik farklı türde ayrı anahtardır.
    expect(cache.get('tower', 'primitive_front')).toBeNull();
    cache.pump();
    expect(calls).toEqual(['unit:primitive_front', 'tower:primitive_front']);
    expect(cache.stats).toMatchObject({ generated: 2, failed: 0, pending: 0 });
  });

  it('pump kare bütçesine uyar: en az bir iş, bütçe dolunca kalan işler sonraki karelere kalır', () => {
    const clock = fakeClock();
    const cache = new PortraitCache(() => {
      clock.advance(3);
      return 'x';
    }, clock.now, PORTRAIT_BUDGET_MS);
    for (let i = 0; i < 6; i++) cache.prefetch('unit', `u${i}`);
    // 4 ms bütçe, iş başı 3 ms: ilk iş 3 ms (< 4) → ikinci iş de başlar; sonra 6 ms ≥ 4 → durur.
    expect(cache.pump()).toBe(2);
    expect(cache.stats.pending).toBe(4);
    // Bütçeden uzun tek iş de biter (kuyruk ilerler).
    const slow = new PortraitCache(() => {
      clock.advance(50);
      return 'y';
    }, clock.now);
    slow.prefetch('tower', 'a');
    slow.prefetch('tower', 'b');
    expect(slow.pump()).toBe(1);
    expect(slow.stats.maxMs).toBe(50);
    expect(slow.drain()).toBe(1);
    expect(slow.stats.pending).toBe(0);
  });

  it('üretilemeyen portre yeniden denenmez ve hep null kalır (oyun etkilenmez)', () => {
    let calls = 0;
    const cache = new PortraitCache(() => {
      calls++;
      throw new Error('tuval yok');
    }, () => 0);
    expect(cache.get('ability', 'primitive_stampede')).toBeNull();
    cache.pump();
    expect(cache.get('ability', 'primitive_stampede')).toBeNull();
    expect(cache.pump()).toBe(0);
    expect(calls).toBe(1);
    expect(cache.stats.failed).toBe(1);
  });

  it('prefetchAge: çağın 3 birliği, 2 kulesi ve yeteneği kuyruğa alınır', () => {
    const jobs: string[] = [];
    const cache = new PortraitCache((kind, id) => {
      jobs.push(`${kind}:${id}`);
      return id;
    }, () => 0);
    for (const age of AGES) {
      jobs.length = 0;
      prefetchAge(cache, age.age);
      cache.drain();
      expect(jobs).toEqual([...age.unitIds.map((id) => `unit:${id}`), ...age.towerIds.map((id) => `tower:${id}`), `ability:${age.abilityId}`]);
    }
  });
});

describe('Portre bağlayıcı (arayüz, DOM yok)', () => {
  it('hazır olana kadar her çağrıda sorar; hazır olunca bir kez yazar ve bir daha sormaz', () => {
    let ready = false;
    const lookups: string[] = [];
    const writes: Array<string | null> = [];
    const set = portraitBinder((kind, id) => {
      lookups.push(id);
      return ready ? `img:${kind}:${id}` : null;
    }, 'unit', (src) => writes.push(src));
    set('a');
    set('a');
    expect(writes).toEqual([null]);
    ready = true;
    set('a');
    set('a');
    set('a');
    expect(writes).toEqual([null, 'img:unit:a']);
    expect(lookups).toEqual(['a', 'a', 'a']);
    set('b');
    set(null);
    set(null);
    expect(writes).toEqual([null, 'img:unit:a', 'img:unit:b', null]);
  });

  it('arama verilmezse hep yer tutucu yazılır (bir kez)', () => {
    const writes: Array<string | null> = [];
    const set = portraitBinder(undefined, 'tower', (src) => writes.push(src));
    set('primitive_tower_fast');
    set('primitive_tower_fast');
    expect(writes).toEqual([null]);
  });
});

describe('HUD portre bağlantısı (sahte portre sağlayıcı, sahte DOM)', () => {
  function mount(provider: (kind: PortraitKind, id: string) => string | null) {
    const doc = new FakeDocument();
    vi.stubGlobal('document', doc);
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.sides[0].gold = 100_000;
    });
    const hud = mountHud(root as unknown as HTMLElement, session, undefined, { portrait: provider });
    return { doc, root, session, hud };
  }
  const imgs = (root: FakeElement, selector: string): FakeElement[] => root.querySelectorAll(selector);

  it('birlik düğmeleri, kuyruk, kule menüsü, kurulu yuva ve yetenek sağlayıcının resmini gösterir; resimler süstür', () => {
    const asked: string[] = [];
    let ready = false;
    const { root, session, hud } = mount((kind, id) => {
      asked.push(`${kind}:${id}`);
      return ready ? `data:image/png;base64,${kind}-${id}` : null;
    });
    const age = AGES[0]!;

    // Hazır değilken: resimler gizli, kart yer tutucuda.
    const unitImgs = imgs(root, '.btn__portrait');
    expect(unitImgs).toHaveLength(3);
    for (const img of unitImgs) {
      expect(img.hidden).toBe(true);
      expect(img.alt).toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
    }
    expect(root.querySelectorAll('.btn--unit').map((b) => b.dataset['portrait'])).toEqual(['none', 'none', 'none']);

    // Sağlayıcı hazır: bir sonraki güncellemede yazılır.
    ready = true;
    hud.update(16);
    expect(unitImgs.map((i) => i.src)).toEqual(age.unitIds.map((id) => `data:image/png;base64,unit-${id}`));
    expect(unitImgs.every((i) => !i.hidden)).toBe(true);
    expect(root.querySelectorAll('.btn--unit').map((b) => b.dataset['portrait'])).toEqual(['ready', 'ready', 'ready']);
    const ability = root.querySelector('.ability__icon')!;
    expect(ability.src).toBe(`data:image/png;base64,ability-${age.abilityId}`);

    // Yazıldıktan sonra her karede yeniden sorulmaz.
    const before = asked.length;
    hud.update(16);
    hud.update(16);
    expect(asked.length).toBe(before);

    // Kuyruk: üretilen birliğin mini portresi; rol işareti korunur, boş kutuda resim yok.
    expect(produceUnit(session, 2)?.ok).toBe(true);
    expect(produceUnit(session, 0)?.ok).toBe(true);
    session.advance(50);
    hud.update(16);
    const queue = root.querySelectorAll('.queue-slot');
    expect(queue[0]!.querySelector('.queue-slot__portrait')!.src).toBe(`data:image/png;base64,unit-${age.unitIds[2]}`);
    expect(queue[0]!.dataset['portrait']).toBe('ready');
    expect(queue[0]!.querySelector('.queue-slot__mark')!.textContent.length).toBeGreaterThan(0);
    expect(queue[1]!.querySelector('.queue-slot__portrait')!.src).toBe(`data:image/png;base64,unit-${age.unitIds[0]}`);
    expect(queue[2]!.dataset['portrait']).toBe('none');
    expect(queue[2]!.querySelector('.queue-slot__portrait')!.hidden).toBe(true);

    // Kule menüsü: her seçenekte kulenin portresi (açılır açılmaz).
    const slotButton = root.querySelectorAll('.slot-btn')[0]!;
    expect(slotButton.dataset['portrait']).toBe('none');
    slotButton.click();
    const options = root.querySelectorAll('.slot-menu__build');
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.querySelector('.slot-menu__portrait')!.src)).toEqual(age.towerIds.map((id) => `data:image/png;base64,tower-${id}`));
    hud.dismissMenu();

    // Kurulu yuva kendi kulesini gösterir; satılınca yer tutucuya döner.
    expect(buildTower(session, 0, age.towerIds[1]!).ok).toBe(true);
    session.advance(50);
    hud.update(16);
    expect(slotButton.querySelector('.slot-btn__portrait')!.src).toBe(`data:image/png;base64,tower-${age.towerIds[1]}`);
    expect(slotButton.dataset['portrait']).toBe('ready');
    hud.destroy();
    session.dispose();
  });

  it('sağlayıcı verilmezse kartlar yer tutucuyla çalışır (harf/rol işareti)', () => {
    const doc = new FakeDocument();
    vi.stubGlobal('document', doc);
    const root = doc.createElement('div');
    const session = new Session({ createControllers: () => [null, null] });
    session.debugMutate((s) => {
      s.sides[0].gold = 1000;
    });
    const hud = mountHud(root as unknown as HTMLElement, session);
    produceUnit(session, 0);
    session.advance(50);
    hud.update(16);
    const slot = root.querySelectorAll('.queue-slot')[0]!;
    expect(slot.dataset['portrait']).toBe('none');
    expect(slot.querySelector('.queue-slot__glyph')!.textContent.length).toBe(1);
    expect(root.querySelectorAll('.btn__portrait').every((i) => i.hidden)).toBe(true);
    hud.destroy();
    session.dispose();
  });
});
