import { describe, expect, it } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { STONE_SWAP_MS, StoneRig, stonePartNames } from '../src/art/stoneArt';
import { STONE_VARIANTS } from '../src/art/stoneVariants';
import type { ArtAge } from '../src/art/palette';
import { stoneTopWorldY, type StoneView } from '../src/render/scene';
import { STONE_FLOAT_GAP, StoneFloat } from '../src/render/stoneFloat';

/**
 * Sınır Taşı'nın çağ görünümleri (GDD §8 "Görsel"). Düğümde tuval yok: taş sahte dokularla kurulur
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

describe('Sınır Taşı çağ görünümleri (GDD §8)', () => {
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

  it('görünüm verisi: yuva gövdede, halka taşın tepesinin altında, tepe en yüksek parçada', () => {
    for (const age of AGES) {
      const v = STONE_VARIANTS[age];
      const parts = [v.body, v.float, v.lamp].filter((p) => p !== undefined);
      const highest = Math.min(...parts.map((p) => p.y0));
      expect(v.top, `çağ ${age}`).toBeLessThanOrEqual(highest + 3);
      expect(v.top - v.bob.amp, `çağ ${age}`).toBeGreaterThanOrEqual(highest - v.bob.amp - 3);
      expect(v.socket.y - RING_OUTER).toBeGreaterThan(v.top);
      const holder = v.float ?? v.body;
      expect(v.socket.y).toBeGreaterThan(holder.y0);
      expect(v.socket.y).toBeLessThan(holder.y1);
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

describe('Sınır Taşı kazanç işareti başlangıç yüksekliği', () => {
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
