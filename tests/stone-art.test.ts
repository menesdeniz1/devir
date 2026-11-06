import { describe, expect, it } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { STONE_SWAP_MS, StoneRig, stonePartNames } from '../src/art/stoneArt';
import { STONE_VARIANTS } from '../src/art/stoneVariants';
import { STONE_STORE_STEPS, pileBounds, storeStep } from '../src/art/stoneStore';
import type { ArtAge } from '../src/art/palette';
import { stoneTopWorldY, type StoneView } from '../src/render/scene';
import { STONE_FLOAT_GAP, StoneFloat } from '../src/render/stoneFloat';

/**
 * Maden'in (kod adı taş) çağ görünümleri ve depo yığını (GDD §8 "Görsel"). Düğümde tuval yok: maden sahte dokularla kurulur
 * (sprite/kapsayıcı yapısı ve geçiş mantığı gerçek koddur, yalnız piksel çizimi atlanır).
 */

const AGES: readonly ArtAge[] = [1, 2, 3, 4, 5];
const LAYOUT = { halfWidth: 100, pathTop: -12, pathBottom: 48 };
const RING_OUTER = 25 + 9 / 2;

function fakeRig(age?: ArtAge): { rig: StoneRig; requests: string[] } {
  const requests: string[] = [];
  const rig = new StoneRig(LAYOUT, {
    age,
    texture: (name) => {
      requests.push(name);
      return Texture.WHITE;
    },
  });
  return { rig, requests };
}

function variantLayers(rig: StoneRig): Container[] {
  const bodies = rig.root.getChildByLabel('stone.bodies')!;
  return bodies.children.filter((c) => c.label.startsWith('stone.variant.')) as Container[];
}

function visibleAges(rig: StoneRig): number[] {
  return variantLayers(rig)
    .filter((l) => l.visible)
    .map((l) => Number(l.label.split('.')[2]))
    .sort();
}

function socketOf(rig: StoneRig): Container {
  return rig.root.getChildByLabel('stone.socket')!;
}

describe('Maden çağ görünümleri (GDD §8)', () => {
  it('çağ değişince görünüm değişir: kısa geçişte iki taş, sonunda yalnız yenisi', () => {
    const { rig } = fakeRig();
    rig.update(100, 0, 100, 16);
    expect(rig.age).toBe(1);
    expect(visibleAges(rig)).toEqual([1]);
    rig.setAge(3);
    expect(rig.age).toBe(3);
    expect(rig.swapping).toBe(true);
    rig.update(100, 0, 100, STONE_SWAP_MS / 2);
    expect(visibleAges(rig)).toEqual([1, 3]);
    const [old, next] = [variantLayers(rig).find((l) => l.label === 'stone.variant.1')!, variantLayers(rig).find((l) => l.label === 'stone.variant.3')!];
    // Yumuşak geçiş: ikisi de ara saydamlıkta (ani değişim yok).
    expect(next.alpha).toBeGreaterThan(0);
    expect(next.alpha).toBeLessThan(1);
    expect(old.alpha).toBeGreaterThan(0);
    expect(old.alpha).toBeLessThan(1);
    rig.update(100, 0, 100, STONE_SWAP_MS / 2 + 1);
    expect(rig.swapping).toBe(false);
    expect(visibleAges(rig)).toEqual([3]);
    expect(next.alpha).toBe(1);
    expect(next.scale.x).toBe(1);
  });

  it('duraklatmada (animMs = 0) geçiş donar', () => {
    const { rig } = fakeRig(2);
    rig.setAge(3);
    for (let i = 0; i < 100; i++) rig.update(0, null, 100, 0);
    expect(rig.swapping).toBe(true);
  });

  it('yeni maç (animate = false): geçişsiz atlar', () => {
    const { rig } = fakeRig(4);
    rig.setAge(5);
    rig.update(0, null, 100, 50);
    rig.setAge(1, false);
    expect(rig.swapping).toBe(false);
    expect(visibleAges(rig)).toEqual([1]);
    const layer = variantLayers(rig).find((l) => l.label === 'stone.variant.1')!;
    expect(layer.alpha).toBe(1);
  });

  it('çağ değişmedikçe yeniden kurma yok; her çağ en fazla bir kez kurulur', () => {
    const { rig, requests } = fakeRig();
    expect(rig.variantBuildCount).toBe(1);
    const afterBuild = requests.length;
    for (let i = 0; i < 200; i++) {
      rig.setAge(1);
      rig.update(i % 2 === 0 ? 40 : 41, null, 100, 16);
    }
    expect(rig.variantBuildCount).toBe(1);
    expect(requests.length).toBe(afterBuild);
    rig.setAge(2);
    for (let i = 0; i < 100; i++) {
      rig.setAge(2);
      rig.update(100, 0, 100, 16);
    }
    expect(rig.variantBuildCount).toBe(2);
    const afterTwo = requests.length;
    // Geri dönüş (ör. yeni maç) var olan görünümü kullanır.
    rig.setAge(1, false);
    rig.setAge(2, false);
    expect(rig.variantBuildCount).toBe(2);
    expect(requests.length).toBe(afterTwo);
    expect(variantLayers(rig)).toHaveLength(2);
  });

  it('her çağda amblem, ilerleme halkası, hale ve iki bölge işareti var; yuva çağın yuvasında', () => {
    for (const age of AGES) {
      const { rig, requests } = fakeRig(age);
      const names = stonePartNames(age);
      expect(requests, `çağ ${age}`).toContain(names.body);
      rig.update(100, 0, 100, 0);
      const socket = socketOf(rig);
      expect(socket.getChildByLabel('stone.ring'), `çağ ${age} halka`).not.toBeNull();
      expect(socket.getChildByLabel('stone.emblem.0')!.visible).toBe(true);
      expect(socket.getChildByLabel('stone.emblem.1')!.visible).toBe(false);
      expect(socket.x).toBeCloseTo(STONE_VARIANTS[age].socket.x);
      expect(socket.y).toBeCloseTo(STONE_VARIANTS[age].socket.y);
      expect(rig.root.getChildByLabel('stone.aura')!.visible).toBe(true);
      expect(rig.root.children.filter((c) => c.label === 'stone.marker')).toHaveLength(2);
      rig.update(-100, 1, 100, 16);
      expect(socket.getChildByLabel('stone.emblem.0')!.visible).toBe(false);
      expect(socket.getChildByLabel('stone.emblem.1')!.visible).toBe(true);
      rig.update(0, null, 100, 16);
      expect(socket.getChildByLabel('stone.emblem.0')!.visible).toBe(false);
      expect(socket.getChildByLabel('stone.emblem.1')!.visible).toBe(false);
      expect(rig.root.getChildByLabel('stone.aura')!.visible).toBe(false);
    }
  });

  it('halka ve amblem taşın önünde; hale ve işaretler arkasında (birlikleri örten katman yok)', () => {
    const { rig } = fakeRig(5);
    const order = rig.root.children.map((c) => c.label);
    expect(order.indexOf('stone.aura')).toBeLessThan(order.indexOf('stone.bodies'));
    expect(order.indexOf('stone.bodies')).toBeLessThan(order.indexOf('stone.socket'));
  });

  it('görünüm verisi: yuva gövdede, halka madenin tepesinin altında, tepe en yüksek parçada', () => {
    for (const age of AGES) {
      const v = STONE_VARIANTS[age];
      const parts = [v.body, v.float, v.lamp].filter((p) => p !== undefined);
      // En büyük depo yığını da tepenin altında kalır (kazanç işareti yığına binmez).
      expect(v.store.y + pileBounds(3, v.store.scale).y0, `çağ ${age} yığın`).toBeGreaterThan(v.top);
      const highest = Math.min(...parts.map((p) => p.y0));
      expect(v.top, `çağ ${age}`).toBeLessThanOrEqual(highest + 3);
      expect(v.top - v.bob.amp, `çağ ${age}`).toBeGreaterThanOrEqual(highest - v.bob.amp - 3);
      expect(v.socket.y - RING_OUTER).toBeGreaterThan(v.top);
      const holder = v.float ?? v.body;
      expect(v.socket.y).toBeGreaterThan(holder.y0);
      expect(v.socket.y).toBeLessThan(holder.y1);
    }
  });

  it('maden çağla büyür: her çağ bir öncekinden yüksek; gövde ve yığın bölge işaretlerinin içinde', () => {
    for (let i = 1; i < AGES.length; i++) {
      expect(STONE_VARIANTS[AGES[i]!].top, `çağ ${AGES[i]}`).toBeLessThan(STONE_VARIANTS[AGES[i - 1]!].top);
    }
    for (const age of AGES) {
      const v = STONE_VARIANTS[age];
      const pile = pileBounds(3, v.store.scale);
      for (const x of [v.body.x0, v.body.x1, v.store.x + pile.x0, v.store.x + pile.x1]) expect(Math.abs(x), `çağ ${age}`).toBeLessThan(LAYOUT.halfWidth);
    }
  });

  it('getiri çağla artar: sahip halesi çağla güçlenir ama ölçülü kalır', () => {
    for (let i = 1; i < AGES.length; i++) {
      const a = STONE_VARIANTS[AGES[i - 1]!].aura;
      const b = STONE_VARIANTS[AGES[i]!].aura;
      expect(b.scale).toBeGreaterThanOrEqual(a.scale);
      expect(b.alpha).toBeGreaterThanOrEqual(a.alpha);
    }
    expect(STONE_VARIANTS[5].aura.alpha).toBeGreaterThan(STONE_VARIANTS[1].aura.alpha);
    // Taban saydamlığı yarıdan az: hale yumuşak kalır (GR-06), taşın ve yolun önünü kapatmaz.
    expect(STONE_VARIANTS[5].aura.alpha).toBeLessThan(0.5);
  });
});

describe('Maden depo yığını (GDD §8)', () => {
  function storeSprites(rig: StoneRig, age: ArtAge): Container[] {
    const layer = variantLayers(rig).find((l) => l.label === `stone.variant.${age}`)!;
    return [1, 2, 3].map((n) => layer.getChildByLabel(`stone.store.${n}`)!) as Container[];
  }
  const shown = (rig: StoneRig, age: ArtAge): number[] => storeSprites(rig, age).map((s) => (s.visible ? 1 : 0));

  it('basamak eşikleri: 0 boş, > 0 küçük, ≥ orta eşiği orta, ≥ büyük eşiği büyük', () => {
    expect(storeStep(0)).toBe(0);
    expect(storeStep(-5)).toBe(0);
    expect(storeStep(Number.NaN)).toBe(0);
    expect(storeStep(1)).toBe(1);
    expect(storeStep(STONE_STORE_STEPS.medium - 1)).toBe(1);
    expect(storeStep(STONE_STORE_STEPS.medium)).toBe(2);
    expect(storeStep(STONE_STORE_STEPS.large - 1)).toBe(2);
    expect(storeStep(STONE_STORE_STEPS.large)).toBe(3);
    expect(storeStep(1e6)).toBe(3);
    expect(STONE_STORE_STEPS.small).toBeLessThan(STONE_STORE_STEPS.medium);
    expect(STONE_STORE_STEPS.medium).toBeLessThan(STONE_STORE_STEPS.large);
  });

  it('her çağda yığın eşiklerde değişir; en fazla bir basamak görünür; başta boş', () => {
    for (const age of AGES) {
      const { rig, requests } = fakeRig(age);
      for (const n of stonePartNames(age).store) expect(requests, `çağ ${age}`).toContain(n);
      expect(rig.storedStep).toBe(0);
      expect(shown(rig, age)).toEqual([0, 0, 0]);
      rig.setStored(1);
      expect(shown(rig, age)).toEqual([1, 0, 0]);
      rig.setStored(STONE_STORE_STEPS.medium);
      expect(shown(rig, age)).toEqual([0, 1, 0]);
      rig.setStored(STONE_STORE_STEPS.large);
      expect(shown(rig, age)).toEqual([0, 0, 1]);
      expect(rig.storedStep).toBe(3);
      // Söküldü: depo boşalır.
      rig.setStored(0);
      expect(shown(rig, age)).toEqual([0, 0, 0]);
    }
  });

  it('basamak içinde hiçbir şey değişmez: doku isteği ve geçiş sayısı sabit', () => {
    const { rig, requests } = fakeRig(3);
    rig.update(100, 0, 100, 16);
    const before = requests.length;
    rig.setStored(5);
    expect(rig.storeSwitchCount).toBe(1);
    for (let g = 5; g < STONE_STORE_STEPS.medium; g += 0.5) {
      rig.setStored(g);
      rig.update(100, 0, 100, 16);
    }
    expect(rig.storeSwitchCount).toBe(1);
    rig.setStored(STONE_STORE_STEPS.medium);
    for (let g = STONE_STORE_STEPS.medium; g < STONE_STORE_STEPS.large; g++) rig.setStored(g);
    expect(rig.storeSwitchCount).toBe(2);
    expect(requests.length).toBe(before);
    expect(rig.variantBuildCount).toBe(1);
  });

  it('çağ değişince yeni görünüm o anki basamağı gösterir; geçişte iki çağ da aynı basamakta', () => {
    const { rig } = fakeRig(1);
    rig.setStored(STONE_STORE_STEPS.medium + 10);
    rig.setAge(2);
    rig.update(100, 0, 100, STONE_SWAP_MS / 2);
    expect(shown(rig, 1)).toEqual([0, 1, 0]);
    expect(shown(rig, 2)).toEqual([0, 1, 0]);
    rig.setStored(STONE_STORE_STEPS.large);
    expect(shown(rig, 1)).toEqual([0, 0, 1]);
    expect(shown(rig, 2)).toEqual([0, 0, 1]);
  });

  it('yığın gövdenin önünde, süzülen parça ve fenerin arkasında; süzülmez', () => {
    for (const age of [4, 5] as const) {
      const { rig } = fakeRig(age);
      rig.setStored(STONE_STORE_STEPS.large);
      const layer = variantLayers(rig).find((l) => l.label === `stone.variant.${age}`)!;
      const order = layer.children.map((c) => c.label);
      expect(order.indexOf('stone.body')).toBeLessThan(order.indexOf('stone.store.1'));
      const after = age === 4 ? 'stone.lamp' : 'stone.float';
      expect(order.indexOf('stone.store.3')).toBeLessThan(order.indexOf(after));
      const pile = layer.getChildByLabel('stone.store.3')!;
      const y0 = pile.y;
      rig.update(100, 0, 100, 800);
      expect(pile.y).toBe(y0);
      expect(pile.x).toBe(STONE_VARIANTS[age].store.x);
    }
  });
});

describe('Maden kazanç işareti başlangıç yüksekliği', () => {
  it('işaret her çağda taşın tepesinin üstünden doğar', () => {
    const { rig } = fakeRig();
    rig.root.position.set(960, 610);
    const view: StoneView = { container: rig.root, rig };
    const float = new StoneFloat(view);
    for (const age of AGES) {
      rig.setAge(age, false);
      const top = 610 + STONE_VARIANTS[age].top;
      expect(stoneTopWorldY(view)).toBeCloseTo(top);
      expect(float.startY, `çağ ${age}`).toBeLessThan(top);
      expect(float.startY).toBeCloseTo(top - STONE_FLOAT_GAP);
      float.pop(0, 5);
      float.update(0);
      const text = float.container.children[float.container.children.length - 1]!;
      // Metnin alt kenarı (anchor y = 1) taşın tepesinin üstünde.
      expect(float.container.y + text.y).toBeLessThan(top);
      float.clear();
    }
    float.destroy();
  });

  it('çağ geçişi süren işaretleri oynatmaz; yeni işaret yeni tepeden başlar', () => {
    const { rig } = fakeRig(1);
    rig.root.position.set(960, 610);
    const float = new StoneFloat({ container: rig.root, rig });
    float.pop(0, 3);
    const first = float.container.children[0]!;
    const y0 = first.y;
    rig.setAge(4);
    float.update(0);
    expect(first.y).toBe(y0);
    float.pop(0, 6);
    const second = float.container.children[1]!;
    expect(second.y).toBeLessThan(y0);
    float.destroy();
  });
});
