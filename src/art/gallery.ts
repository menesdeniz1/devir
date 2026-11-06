import { Application, ColorMatrixFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { UnitAnimInput, UnitRig } from './anim';
import { BaseRig, baseAtlasStats, baseDamageAtlasStats } from './baseRig';
import type { ArtAge, ArtSide } from './palette';
import { STONE_SWAP_MS, StoneRig } from './stoneArt';
import { STONE_STORE_STEPS } from './stoneStore';
import { SLOT_SCALE, TowerSlot, towerAtlasStats } from './towerRig';
import { createUnitRig, unitAtlasStats } from './unitArt';
import { createBackground, createBaseView, setBaseAge, setTowerSlot, towerLaunchPoint, triggerTowerFire } from '../render/scene';
import { SCENE_HEIGHT, UNIT_FEET_Y } from '../render/constants';
import { AbilityFx } from '../render/abilityFx';
import { UnitView } from '../render/unitView';
import { ABILITIES } from '../data/abilities';
import { WORLD } from '../data/world';
import type { AbilityDef } from '../data/types';
import type { AbilityZoneState, PendingStrikeState, SideId, UnitState } from '../sim/types';
import { mustGetUnit } from '../sim/compile';
import { abilityAtlasStats } from './abilityArt';
import { backgroundsView, baseDamageView, gameView, projectilesView, stressView } from './galleryFx';
import { fxAtlasStats } from './projectileArt';

/**
 * Yalnız geliştirme vitrini (GDD §14 denetimi için). Oyuna ve derlemeye girmez; metin içermez.
 * Görünümler (`?view=`):
 *   units   — her çağ × taraf satırı: üç rol, üç poz (durma, yürüme, vuruş) + 32 px gri siluetler
 *   gray    — aynı satırlar gri tonlamada, can çubuğu taklidiyle (takım ayrımı renk dışı: yön, amblem, çubuk)
 *   bases   — 5 çağ × 2 taraf üs
 *   rebuild — çağ geçişi film şeridi (oyuncu 1→2, rakip 4→5), sabit zaman kareleri
 *   stone   — Maden: çağ satırları × durumlar (tarafsız, ilerleme, oyuncu/rakip sahip) + canlı ele geçirme +
 *             depo yığını basamakları (küçük, orta, büyük); altta canlı çağ geçişi (`age=` süzgeci satırlara uygulanır)
 *   live    — `age=n` çağında canlı döngü (yürü → saldır → öl)
 *   towers  — 5 çağ üssü, yuvalarla: satır 1–2 (oyuncu/rakip) A + B + kilitli; satır 3 boş + eski çağ
 *             kuleleri; satır 4 (rakip) atış kareleri + boş yuva. Statik kareler.
 *   towerparts — her kule yakından: dinlenme, atış karesi, rakip + 32 px gri siluetler (A, B)
 *   scene   — oyun sahnesi ölçeğinde (1920×1080): arka plan, iki üs `age=n` çağında, kuleler, birlikler;
 *             mermi çıkış noktaları işaretli (okunurluk: pencereyi 1366×768 / 1920×1080 yapın)
 *   towerfx — durum geçişi film şeritleri (çağ satırları): kilit açılması, kurulum (belirme), satış (sökülme)
 *   towerlive  — canlı: atış döngüsü, kilit açma → kurma → satma; çağ atlayan rakip üssü (kuleler kalır)
 *   abilities  — her yetenek (çağ satırı) için zaman şeridi: oyuncu başlangıç/orta/bitiş | rakip aynı; alanda
 *             karşı tarafın üç birliği. Altta durum görselleri: sersem (yıldız) ve donmuş (buz) birlikler,
 *             oyuncu ve rakip. Statik kareler (gerçek efekt sınıfı, sabit adımlı zamanla sürülür).
 *   abilitylive — aynı hücreler canlı döngüde (iki taraf).
 *   projectiles — çağ satırları: birlik menzilli/ağır, hızlı/ağır kule mermileri; solda durağan dokular
 *             (üst oyuncu, alt rakip yönü), sağda canlı uçuş ve çarpma etkileri (gerçek ProjectileLayer).
 *   backgrounds — beş çağ arka planı küçük boy + altta canlı çağ geçişi (her 3 sn bir sonraki çağ).
 *   basedamage — çağ satırları: üs × hasar (can %100, %70, %45, %20) + rakip %20.
 *   game    — gerçek oyun sahnesi (createRenderer + Session), iki yapay zekâ; betik tutamağı globalThis.__game.
 *   stress  — en kötü sahne (TDD §6), age=n: 120 birlik + 80 mermi + etkiler; ölçüm globalThis.__stress.
 * `age=2,3` çağ süzgeci (units/gray/bases).
 */

const ROLES = [
  { role: 'front', prefix: 'front', interval: 1000, cell: 70 },
  { role: 'ranged', prefix: 'ranged', interval: 1200, cell: 96 },
  { role: 'heavy', prefix: 'heavy', interval: 3000, cell: 150 },
] as const;
const AGE_PREFIX = ['primitive', 'ancient', 'medieval', 'industrial', 'future'] as const;

function input(over: Partial<UnitAnimInput>): UnitAnimInput {
  return { walkDist: 0, walkBlend: 0, sinceAttackMs: Infinity, attackIntervalMs: 1000, engaged: false, sinceHitMs: Infinity, timeMs: 0, ...over };
}

const POSES: ReadonlyArray<Partial<UnitAnimInput>> = [{}, { walkBlend: 1, walkDist: 7 }, { engaged: true, sinceAttackMs: 70 }];

function rig(age: ArtAge, roleIndex: number, side: ArtSide): UnitRig {
  const t = ROLES[roleIndex]!;
  const r = createUnitRig(`${AGE_PREFIX[age - 1]}_${t.prefix}`, t.role, side, age);
  r.root.scale.x = side === 0 ? 1 : -1;
  return r;
}

const params = new URLSearchParams(globalThis.location.search);
const VIEW = params.get('view') ?? 'units';
const AGES: ArtAge[] = (params.get('age') ?? '1,2,3,4,5')
  .split(',')
  .map((v) => Number(v))
  .filter((v) => v >= 1 && v <= 5) as ArtAge[];

/** Can çubuğu taklidi (UnitView ile aynı biçim: oyuncu düz, rakip çentikli). */
function hpBar(r: UnitRig, side: ArtSide): Graphics {
  const g = new Graphics();
  const w = r.hpBarW;
  const x = -w / 2;
  const y = r.hpBarY;
  g.rect(x, y, w, 6).fill(0x2a2438);
  g.rect(x, y, w * 0.6, 6).fill(side === 0 ? 0x6ee06e : 0xe8432d);
  g.rect(x, y, w, 6).stroke({ width: 2, color: 0x1d1b2b });
  if (side === 1) for (let i = 1; i <= 3; i++) g.moveTo(x + (w * i) / 4, y - 2).lineTo(x + (w * i) / 4, y + 8).stroke({ width: 2, color: 0x1d1b2b });
  return g;
}

function silhouette(app: Application, r: UnitRig): Sprite {
  r.pose(input({}));
  const holder = new Container();
  holder.addChild(r.root);
  const b = holder.getLocalBounds();
  holder.scale.set(32 / b.height);
  const outer = new Container();
  outer.addChild(holder);
  const tex: Texture = app.renderer.generateTexture({ target: outer, resolution: 1, antialias: true });
  tex.source.scaleMode = 'nearest';
  const sp = new Sprite(tex);
  sp.scale.set(2.5);
  return sp;
}

function unitRows(app: Application, world: Container, gray: boolean): { w: number; h: number } {
  const rowH = 118;
  let y = 108;
  let maxX = 0;
  const filter = new ColorMatrixFilter();
  filter.desaturate();
  for (const age of AGES) {
    for (const side of [0, 1] as const) {
      const row = new Container();
      world.addChild(row);
      let x = 20;
      ROLES.forEach((t, ri) => {
        for (const p of POSES) {
          const r = rig(age, ri, side);
          r.pose(input({ ...p, attackIntervalMs: t.interval }));
          r.root.position.set(x + t.cell / 2, y);
          row.addChild(r.root);
          if (gray && p === POSES[0]) {
            const bar = hpBar(r, side);
            bar.position.copyFrom(r.root.position);
            row.addChild(bar);
          }
          x += t.cell;
        }
        x += 16;
      });
      if (!gray) {
        const sil = new Container();
        sil.position.set(x + 10, y - 86);
        let sx = 0;
        ROLES.forEach((_, ri) => {
          const sp = silhouette(app, rig(age, ri, side));
          sp.x = sx;
          sx += sp.width + 14;
          sil.addChild(sp);
        });
        sil.filters = [filter];
        world.addChild(sil);
        x += sx + 20;
      }
      if (gray) row.filters = [filter];
      maxX = Math.max(maxX, x);
      // Satır ayracı: çağ başında kalın.
      const sep = new Graphics().rect(0, y + 8, maxX, side === 1 ? 3 : 1).fill({ color: 0x1d1b2b, alpha: side === 1 ? 0.6 : 0.15 });
      world.addChild(sep);
      y += rowH;
    }
  }
  return { w: maxX + 20, h: y - rowH + 30 };
}

function bases(world: Container, app: Application): { w: number; h: number } {
  const cellW = 210;
  AGES.forEach((age, ci) => {
    for (const side of [0, 1] as const) {
      const b = new BaseRig(side, age);
      const holder = new Container();
      holder.addChild(b.root);
      holder.position.set(side === 0 ? 20 + ci * cellW : 20 + ci * cellW + 185, 260 + side * 270);
      if (side === 1) holder.scale.x = -1;
      world.addChild(holder);
      app.ticker.add((tk) => b.update(tk.deltaMS));
    }
  });
  return { w: 30 + AGES.length * cellW, h: 560 };
}

function rebuild(world: Container): { w: number; h: number } {
  const frames = [0, 150, 300, 450, 600, 750, 900, 1000];
  const runs: Array<{ side: ArtSide; from: ArtAge; to: ArtAge }> = [
    { side: 0, from: 1, to: 2 },
    { side: 1, from: 4, to: 5 },
  ];
  runs.forEach((run, ri) => {
    frames.forEach((ms, fi) => {
      const b = new BaseRig(run.side, run.from);
      b.setTowerSlot(0, towerId(run.from, 'fast'), true);
      b.setTowerSlot(1, towerId(run.from, 'heavy'), true);
      b.setTowerSlot(2, null, false);
      b.update(16);
      b.setAge(run.to);
      b.update(ms);
      const holder = new Container();
      holder.addChild(b.root);
      const x = 10 + fi * 250;
      holder.position.set(run.side === 0 ? x : x + 235, 300 + ri * 320);
      if (run.side === 1) holder.scale.x = -1;
      world.addChild(holder);
    });
  });
  return { w: 10 + frames.length * 250, h: 660 };
}

function towerId(age: ArtAge, kind: 'fast' | 'heavy'): string {
  return `${AGE_PREFIX[age - 1]}_tower_${kind}`;
}

/** Atış karesi zamanı (ms): hareketin en okunur anı. */
const FIRE_FRAME_MS: Record<'fast' | 'heavy', Record<ArtAge, number>> = {
  fast: { 1: 30, 2: 30, 3: 30, 4: 20, 5: 40 },
  heavy: { 1: 200, 2: 200, 3: 200, 4: 45, 5: 45 },
};

function towers(world: Container): { w: number; h: number } {
  const cellW = 250;
  const rowH = 330;
  const g = new Graphics();
  world.addChild(g);
  type SlotSpec = { type: string | null; unlocked: boolean };
  const own = (a: ArtAge): SlotSpec[] => [
    { type: towerId(a, 'fast'), unlocked: true },
    { type: towerId(a, 'heavy'), unlocked: true },
    { type: null, unlocked: false },
  ];
  const rows: Array<{ side: ArtSide; fire: boolean; slots: (age: ArtAge) => SlotSpec[] }> = [
    { side: 0, fire: false, slots: own },
    { side: 1, fire: false, slots: own },
    {
      side: 0,
      fire: false,
      slots: (a) => {
        const old = (a === 1 ? 5 : a - 1) as ArtAge;
        return [
          { type: null, unlocked: true },
          { type: towerId(old, 'fast'), unlocked: true },
          { type: towerId(old, 'heavy'), unlocked: true },
        ];
      },
    },
    {
      side: 1,
      fire: true,
      slots: (a) => [
        { type: towerId(a, 'fast'), unlocked: true },
        { type: towerId(a, 'heavy'), unlocked: true },
        { type: null, unlocked: true },
      ],
    },
  ];
  rows.forEach((row, ri) => {
    const y = 320 + ri * rowH;
    groundStrip(g, 0, y + 4, 40 + AGES.length * cellW);
    AGES.forEach((age, ci) => {
      const b = new BaseRig(row.side, age);
      row.slots(age).forEach((sp, i) => b.setTowerSlot(i, sp.type, sp.unlocked));
      b.update(16);
      if (row.fire) {
        // Ağır kule önce tetiklenir; iki kule kendi atış karesinde durur.
        const fast = FIRE_FRAME_MS.fast[age];
        const heavy = FIRE_FRAME_MS.heavy[age];
        b.fireTower(1);
        b.update(Math.max(0, heavy - fast));
        b.fireTower(0);
        b.update(fast);
      }
      const holder = new Container();
      holder.addChild(b.root);
      const x = 20 + ci * cellW;
      holder.position.set(row.side === 0 ? x : x + 220, y);
      if (row.side === 1) holder.scale.x = -1;
      world.addChild(holder);
    });
  });
  return { w: 40 + AGES.length * cellW, h: 320 + (rows.length - 1) * rowH + 60 };
}

function towerParts(app: Application, world: Container): { w: number; h: number } {
  const scale = 1.5;
  // Yuva kökü kendi ölçeğini taşır (SLOT_SCALE); hücreler etkin ölçekle boyutlanır.
  const e = scale * SLOT_SCALE;
  const cellW = 86 * e;
  const rowH = 112 * e;
  const filter = new ColorMatrixFilter();
  filter.desaturate();
  let y = 76 * e;
  let maxX = 0;
  for (const age of AGES) {
    let x = 20;
    for (const kind of ['fast', 'heavy'] as const) {
      const frames: ReadonlyArray<readonly [ArtSide, number | null]> = [
        [0, null],
        [0, FIRE_FRAME_MS[kind][age]],
        [1, null],
      ];
      for (const [side, fireMs] of frames) {
        const slot = new TowerSlot(side, 0, age);
        slot.set(towerId(age, kind), true);
        slot.update(16);
        if (fireMs !== null) {
          slot.fire();
          slot.update(fireMs);
        }
        slot.root.position.set(0, 0);
        const holder = new Container();
        holder.addChild(slot.root);
        holder.position.set(x + (side === 0 ? 32 * e : 54 * e), y);
        holder.scale.set(side === 0 ? scale : -scale, scale);
        world.addChild(holder);
        x += cellW;
      }
      x += 12;
    }
    // 32 px gri siluetler (iki tür, oyuncu).
    const sil = new Container();
    sil.position.set(x + 20, y - 60 * e);
    let sx = 0;
    for (const kind of ['fast', 'heavy'] as const) {
      const slot = new TowerSlot(0, 0, age);
      slot.set(towerId(age, kind), true);
      slot.update(16);
      slot.setPlatformVisible(false);
      slot.root.position.set(0, 0);
      const holder = new Container();
      holder.addChild(slot.root);
      const b = holder.getLocalBounds();
      holder.scale.set(32 / b.height);
      const outer = new Container();
      outer.addChild(holder);
      const tex: Texture = app.renderer.generateTexture({ target: outer, resolution: 1, antialias: true });
      tex.source.scaleMode = 'nearest';
      const sp = new Sprite(tex);
      sp.scale.set(3);
      sp.x = sx;
      sx += sp.width + 18;
      sil.addChild(sp);
    }
    sil.filters = [filter];
    world.addChild(sil);
    x += sx + 30;
    maxX = Math.max(maxX, x);
    world.addChild(new Graphics().rect(0, y + 34 * e, maxX, 2).fill({ color: 0x1d1b2b, alpha: 0.4 }));
    y += rowH;
  }
  return { w: maxX + 20, h: y - rowH + 40 * e };
}

function towerLive(world: Container, app: Application): { w: number; h: number } {
  const cellW = 250;
  const g = new Graphics();
  world.addChild(g);
  groundStrip(g, 0, 324, 40 + (AGES.length + 1) * cellW);
  const rigs: BaseRig[] = [];
  AGES.forEach((age, ci) => {
    const b = new BaseRig(0, age);
    b.setTowerSlot(0, towerId(age, 'fast'), true);
    b.setTowerSlot(1, towerId(age, 'heavy'), true);
    b.setTowerSlot(2, null, false);
    const holder = new Container();
    holder.addChild(b.root);
    holder.position.set(20 + ci * cellW, 320);
    world.addChild(holder);
    rigs.push(b);
  });
  // Rakip: çağ atlar (1 → 5); kuleler eski çağlarının görünümüyle kalır ve yeni bağlama noktasına kayar.
  const enemy = new BaseRig(1, 1);
  enemy.setTowerSlot(0, towerId(1, 'fast'), true);
  enemy.setTowerSlot(1, towerId(1, 'heavy'), true);
  enemy.setTowerSlot(2, null, false);
  const eh = new Container();
  eh.addChild(enemy.root);
  eh.position.set(20 + AGES.length * cellW + 220, 320);
  eh.scale.x = -1;
  world.addChild(eh);
  let clock = 0;
  let nextFast = 0;
  let nextHeavy = 300;
  const cycle: ReadonlyArray<{ kind: 'fast' | 'heavy' | null; unlocked: boolean }> = [
    { kind: null, unlocked: false },
    { kind: null, unlocked: true },
    { kind: 'fast', unlocked: true },
    { kind: 'heavy', unlocked: true },
    { kind: null, unlocked: true },
  ];
  app.ticker.add((tk) => {
    clock += tk.deltaMS;
    const fireFast = clock >= nextFast;
    const fireHeavy = clock >= nextHeavy;
    if (fireFast) nextFast += 600;
    if (fireHeavy) nextHeavy += 2000;
    const c = cycle[Math.floor(clock / 1500) % cycle.length]!;
    rigs.forEach((b, i) => {
      const age = AGES[i]!;
      b.setTowerSlot(2, c.kind === null ? null : towerId(age, c.kind), c.unlocked);
      if (fireFast) b.fireTower(0);
      if (fireHeavy) b.fireTower(1);
      if ((fireFast && c.kind === 'fast') || (fireHeavy && c.kind === 'heavy')) b.fireTower(2);
      b.update(tk.deltaMS);
    });
    const ea = ((Math.floor(clock / 2500) % 5) + 1) as ArtAge;
    if (ea !== enemy.currentAge) {
      if (ea === 1) {
        enemy.snapTowers();
        enemy.setAge(1, false);
        enemy.setTowerSlot(2, null, false);
      } else {
        enemy.setAge(ea);
      }
      if (ea === 3) enemy.setTowerSlot(2, towerId(3, 'fast'), true);
    }
    if (fireFast) {
      enemy.fireTower(0);
      enemy.fireTower(2);
    }
    if (fireHeavy) enemy.fireTower(1);
    enemy.update(tk.deltaMS);
  });
  return { w: 60 + (AGES.length + 1) * cellW, h: 400 };
}

function sceneView(world: Container, app: Application): { w: number; h: number } {
  const age = AGES[0] ?? 1;
  world.addChild(createBackground(age));
  const marks = new Graphics();
  for (const side of [0, 1] as const) {
    const v = createBaseView(side);
    setBaseAge(v, age, false);
    setTowerSlot(v, 0, towerId(age, 'fast'), true);
    setTowerSlot(v, 1, towerId(age, 'heavy'), true);
    setTowerSlot(v, 2, side === 0 ? null : towerId(age === 1 ? 1 : ((age - 1) as ArtAge), 'fast'), side === 0 ? false : true);
    world.addChild(v.container);
    let clock = 0;
    let nf = 200;
    let nh = 500;
    app.ticker.add((tk) => {
      clock += tk.deltaMS;
      if (clock >= nf) {
        nf += 600;
        triggerTowerFire(v, 0);
        if (side === 1) triggerTowerFire(v, 2);
      }
      if (clock >= nh) {
        nh += 2000;
        triggerTowerFire(v, 1);
      }
      v.rig.update(tk.deltaMS);
    });
    for (let i = 0; i < 3; i++) {
      const p = towerLaunchPoint(v, i);
      marks.circle(p.x, p.y, 3).stroke({ width: 1.5, color: 0xff00ff });
    }
    ROLES.forEach((_, ri) => {
      const r = rig(age, ri, side);
      r.pose(input({ walkBlend: 1, walkDist: 9 }));
      r.root.position.set(side === 0 ? 200 + ri * 90 : 1720 - ri * 90, UNIT_FEET_Y);
      world.addChild(r.root);
    });
  }
  world.addChild(marks);
  return { w: 1920, h: SCENE_HEIGHT };
}

function towerFx(world: Container): { w: number; h: number } {
  const e = 1.4 * SLOT_SCALE;
  const cellW = 62 * e;
  const rowH = 100 * e;
  type Step = { from: [string | null, boolean]; to: [string | null, boolean]; ms: number[] };
  const steps = (age: ArtAge): Step[] => [
    { from: [null, false], to: [null, true], ms: [0, 90, 180, 280] },
    { from: [null, true], to: [towerId(age, 'fast'), true], ms: [40, 110, 200, 340] },
    { from: [towerId(age, 'heavy'), true], to: [null, true], ms: [60, 140, 220, 300] },
  ];
  let y = 70 * e;
  let maxX = 0;
  for (const age of AGES) {
    let x = 30 * e;
    for (const st of steps(age)) {
      for (const ms of st.ms) {
        const slot = new TowerSlot(0, 1, age);
        slot.set(st.from[0], st.from[1]);
        slot.update(16);
        slot.set(st.to[0], st.to[1]);
        slot.update(ms);
        slot.root.position.set(0, 0);
        const holder = new Container();
        holder.addChild(slot.root);
        holder.position.set(x, y);
        holder.scale.set(1.4);
        world.addChild(holder);
        x += cellW;
      }
      x += 20;
    }
    maxX = Math.max(maxX, x);
    y += rowH;
  }
  return { w: maxX, h: y - rowH + 40 * e };
}

function groundStrip(g: Graphics, x: number, y: number, w: number): void {
  g.rect(x, y - 90, w, 90).fill(0x93ad6b);
  g.rect(x, y, w, 70).fill(0xd2ab72);
  g.rect(x, y + 4, w, 60).fill(0xc49b63);
}

/** Vitrin zemin şeridi renkleri (arka plan, yaka, yol), çağın arka planına yakın. */
const STONE_STRIP: Record<ArtAge, { sky: number; collar: number; path: number; earth: number }> = {
  1: { sky: 0xbfe0f0, collar: 0x88a858, path: 0xc49b63, earth: 0xd2ab72 },
  2: { sky: 0xf3dcae, collar: 0xb7ae66, path: 0xe3d2ad, earth: 0xdaa676 },
  3: { sky: 0xa9cde6, collar: 0x7fa556, path: 0xb99062, earth: 0x9cb664 },
  4: { sky: 0xb9a998, collar: 0x8c8460, path: 0xa39b8f, earth: 0xa69176 },
  5: { sky: 0x1f2547, collar: 0x7a85b6, path: 0x8f98c2, earth: 0x6770a0 },
};

function stoneStrip(g: Graphics, age: ArtAge, x: number, footY: number, w: number): void {
  const c = STONE_STRIP[age];
  g.rect(x, footY - 200, w, 200).fill(c.sky);
  g.rect(x, footY - 40, w, 40).fill(c.collar);
  g.rect(x, footY - 12, w, 60).fill(c.path);
  g.rect(x, footY + 48, w, 22).fill(c.earth);
}

/**
 * Maden: satır başına bir çağ (madenin çağ görünümü), sütunlar tarafsız / oyuncuya doğru / oyuncu sahip /
 * rakibe doğru / rakip sahip + canlı ele geçirme döngüsü (depo dolar, söküldüğünde boşalır) + depo yığını
 * basamakları (oyuncu sahip; küçük, orta, büyük). Altta canlı çağ geçişi (her 2,5 sn bir sonraki çağ):
 * oyuncu/rakip sahipken ve tarafsızken; kazanç işaretinin başlangıç yüksekliği (taş tepesi + boşluk) sarı çizgi.
 * En altta Orta → Endüstri geçişinin sabit zaman kareleri (0, 15, 30, 50, 70, 100 %).
 */
function stone(world: Container, app: Application): { w: number; h: number } {
  const states: Array<{ counter: number; owner: ArtSide | null; stored: number }> = [
    { counter: 0, owner: null, stored: 0 },
    { counter: 45, owner: null, stored: 0 },
    { counter: 100, owner: 0, stored: 0 },
    { counter: -70, owner: null, stored: 0 },
    { counter: -100, owner: 1, stored: 0 },
  ];
  // Depo basamakları (eşikler stoneStore.ts): küçük, orta, büyük.
  const stores = [STONE_STORE_STEPS.small + 1, STONE_STORE_STEPS.medium, STONE_STORE_STEPS.large].map((stored) => ({ counter: 100, owner: 0 as ArtSide | null, stored }));
  const cellW = 230;
  const rowH = 280;
  const layout = { halfWidth: 92, pathTop: -12, pathBottom: 48 };
  const g = new Graphics();
  world.addChild(g);
  const liveCycle = (r: StoneRig, phaseMs: number): void => {
    // Tarafsız → oyuncu sahip → rakip geri alır.
    let clock = phaseMs;
    let counter = 0;
    let owner: ArtSide | null = null;
    let stored = 0;
    app.ticker.add((tk) => {
      clock += tk.deltaMS;
      const target = Math.floor(clock / 7000) % 2 === 0 ? 100 : -100;
      counter += Math.sign(target - counter);
      const was = owner;
      if (counter >= 100) owner = 0;
      else if (counter <= -100) owner = 1;
      else if ((owner === 0 && counter <= 0) || (owner === 1 && counter >= 0)) owner = null;
      // Sahipken depo dolar; sahibinden sökülünce boşalır.
      if (owner !== null) stored += tk.deltaMS * 0.12;
      else if (was !== null) stored = 0;
      r.setStored(stored);
      r.update(counter, owner, 100, tk.deltaMS);
    });
  };
  AGES.forEach((age, row) => {
    const footY = 210 + row * rowH;
    const cells = [...states, null, ...stores];
    cells.forEach((st, col) => {
      const x0 = 20 + col * cellW;
      stoneStrip(g, age, x0 + 4, footY, cellW - 8);
      const r = new StoneRig(layout, { age });
      r.root.position.set(x0 + cellW / 2, footY);
      world.addChild(r.root);
      if (st !== null) {
        r.setStored(st.stored);
        r.update(st.counter, st.owner, 100, 0);
        app.ticker.add((tk) => r.update(st.counter, st.owner, 100, tk.deltaMS));
      } else liveCycle(r, row * 900);
    });
  });
  // Canlı çağ geçişi.
  const footY = 210 + AGES.length * rowH;
  const swaps: Array<{ owner: ArtSide | null; counter: number; stored: number }> = [
    { owner: 0, counter: 100, stored: STONE_STORE_STEPS.medium },
    { owner: 1, counter: -100, stored: STONE_STORE_STEPS.large },
    { owner: null, counter: 0, stored: 0 },
  ];
  swaps.forEach((st, col) => {
    const x0 = 20 + col * cellW;
    stoneStrip(g, 3, x0 + 4, footY, cellW - 8);
    const r = new StoneRig(layout);
    r.setStored(st.stored);
    r.root.position.set(x0 + cellW / 2, footY);
    world.addChild(r.root);
    const top = new Graphics();
    r.root.parent!.addChild(top);
    let clock = col * 400;
    let age: ArtAge = 1;
    const mark = (): void => {
      top.clear();
      const y = footY + r.topY - 28;
      top.moveTo(x0 + 30, y).lineTo(x0 + cellW - 30, y).stroke({ width: 2, color: 0xffd25a });
    };
    mark();
    app.ticker.add((tk) => {
      clock += tk.deltaMS;
      if (clock > 2500) {
        clock = 0;
        age = ((age % 5) + 1) as ArtAge;
        r.setAge(age);
        mark();
      }
      r.update(st.counter, st.owner, 100, tk.deltaMS);
    });
  });
  // Geçiş film şeridi (Orta → Endüstri, oyuncu sahip): sabit zaman kareleri.
  const stripY = footY + rowH;
  [0, 0.15, 0.3, 0.5, 0.7, 1].forEach((f, col) => {
    const x0 = 20 + col * cellW;
    stoneStrip(g, 4, x0 + 4, stripY, cellW - 8);
    const r = new StoneRig(layout, { age: 3 });
    r.setStored(STONE_STORE_STEPS.medium);
    r.root.position.set(x0 + cellW / 2, stripY);
    world.addChild(r.root);
    r.update(100, 0, 100, 0);
    r.setAge(4);
    r.update(100, 0, 100, f * STONE_SWAP_MS);
  });
  return { w: 40 + (6 + stores.length) * cellW, h: stripY + 80 };
}

function live(world: Container, app: Application): { w: number; h: number } {
  const age = AGES[0] ?? 1;
  const items: Array<{ rig: UnitRig; ri: number; clock: number }> = [];
  for (const side of [0, 1] as const) {
    ROLES.forEach((_, ri) => {
      const r = rig(age, ri, side);
      r.root.position.set(90 + ri * 170 + side * 560, 160);
      world.addChild(r.root);
      items.push({ rig: r, ri, clock: ri * 400 });
    });
  }
  app.ticker.add((tk) => {
    for (const l of items) {
      l.clock += tk.deltaMS;
      const t = ROLES[l.ri]!;
      const cycle = l.clock % 8000;
      if (cycle < 2000) {
        l.rig.root.alpha = 1;
        l.rig.pose(input({ walkBlend: 1, walkDist: cycle * 0.06, timeMs: l.clock, attackIntervalMs: t.interval }));
      } else if (cycle < 6800) {
        const since = (cycle - 2000) % t.interval;
        l.rig.pose(input({ engaged: true, sinceAttackMs: since, timeMs: l.clock, attackIntervalMs: t.interval, sinceHitMs: (cycle - 2300) % 900 }));
      } else {
        const d = Math.min(1, (cycle - 6800) / 600);
        l.rig.poseDeath(d);
        l.rig.root.alpha = d < 0.25 ? 1 : Math.max(0, 1 - (d - 0.25) / 0.75);
      }
    }
  });
  return { w: 1160, h: 220 };
}

// ---- Yetenek efektleri ----

const ABILITY_CELL = { w: 460, h: 330, groundY: 268, padX: 80 } as const;
/** Kare zamanları (ms, kullanımdan beri): başlangıç, orta, bitiş. Çağ sırasıyla. */
const ABILITY_FRAMES: Record<number, readonly [number, number, number]> = {
  1: [140, 330, 720],
  2: [420, 3000, 5650],
  3: [520, 5000, 9600],
  4: [300, 1360, 1720],
  5: [420, 2000, 3820],
};
const ABILITY_LOOP_MS: Record<number, number> = { 1: 2600, 2: 7200, 3: 11000, 4: 3800, 5: 5200 };
let runnerIds = 1;

/** Koridor şeridi (gök, çim, yol), dünya koordinatında. */
function corridorStrip(g: Graphics, x: number, w: number): void {
  const y = UNIT_FEET_Y;
  g.rect(x, y - 300, w, 270).fill(0x9ed0e6);
  g.rect(x, y - 110, w, 80).fill(0x93ad6b);
  g.rect(x, y - 30, w, 100).fill(0xd2ab72);
  g.rect(x, y - 22, w, 50).fill(0xc49b63);
}

function galleryUnit(side: SideId, type: string, x: number): { state: UnitState; view: UnitView; maxHp: number } {
  const maxHp = mustGetUnit(type).def.hp;
  const state: UnitState = { id: runnerIds++, side, type, x, hp: maxHp, cooldown: 0, mode: 'attack', stunTicks: 0, vulnTicks: 0, vulnPct: 0 };
  return { state, view: new UnitView(state), maxHp };
}

/**
 * Bir yetenek kullanımını simülasyonsuz sürer: olaylar ve durum (alan/vuruş/birlik durumları) veriden,
 * tick saatine göre üretilir; çizim gerçek AbilityFx ve UnitView ile yapılır.
 */
class AbilityRunner {
  readonly fx = new AbilityFx();
  private readonly units: Array<{ view: UnitView; state: UnitState; maxHp: number; nextAttack: number }> = [];
  private t = 0;
  private tick = 0;
  private id = 0;
  private readonly zoneTicks: number;
  private readonly strikeTicks: number;
  private readonly statusTicks: number;

  constructor(
    private readonly def: AbilityDef,
    private readonly side: SideId,
    private readonly x0: number,
    private readonly x1: number,
    unitLayer: Container,
  ) {
    const tr = WORLD.tickRate;
    this.zoneTicks = def.zone ? def.zone.durationSec * tr : 0;
    this.strikeTicks = def.delaySec ? Math.round(def.delaySec * tr) : 0;
    this.statusTicks = def.status ? def.status.durationSec * tr : 0;
    const enemy: SideId = side === 0 ? 1 : 0;
    const w = x1 - x0;
    const at = side === 0 ? [0.22, 0.5, 0.8] : [0.78, 0.5, 0.2];
    ['front', 'ranged', 'heavy'].forEach((role, i) => {
      const u = galleryUnit(enemy, `${AGE_PREFIX[def.age - 1]}_${role}`, x0 + w * at[i]!);
      unitLayer.addChild(u.view.container);
      this.units.push({ ...u, nextAttack: 300 + i * 250 });
    });
    this.start();
  }

  private start(): void {
    this.fx.clear();
    this.t = 0;
    this.tick = 0;
    this.id++;
    for (const u of this.units) {
      u.state.hp = u.maxHp;
      u.state.stunTicks = 0;
      u.state.vulnTicks = 0;
      u.nextAttack = 300;
    }
    const d = this.def;
    this.fx.onCast(this.side, d.id, this.x0, this.x1);
    if (d.delaySec === undefined && (d.impactDamage !== undefined || d.status !== undefined)) this.impact();
  }

  private impact(): void {
    this.fx.onImpact(this.side, this.def.id, this.x0, this.x1, this.units.length);
    for (const u of this.units) {
      u.state.hp = Math.max(1, u.state.hp - u.maxHp * 0.12);
      if (this.statusTicks > 0) {
        u.state.stunTicks = this.statusTicks;
        if (this.def.status?.kind === 'freeze') {
          u.state.vulnTicks = this.statusTicks;
          u.state.vulnPct = this.def.status.damageTakenPct ?? 0;
        }
      }
    }
  }

  step(dt: number, loopMs?: number): void {
    if (loopMs !== undefined && this.t + dt >= loopMs) this.start();
    this.t += dt;
    const ms = 1000 / WORLD.tickRate;
    while ((this.tick + 1) * ms <= this.t) {
      this.tick++;
      for (const u of this.units) {
        if (u.state.stunTicks > 0) u.state.stunTicks--;
        if (u.state.vulnTicks > 0) u.state.vulnTicks--;
      }
      if (this.zoneTicks > 0 && this.tick <= this.zoneTicks && this.tick % WORLD.tickRate === 0) this.impact();
      if (this.strikeTicks > 0 && this.tick === this.strikeTicks) this.impact();
    }
    const zones: AbilityZoneState[] =
      this.zoneTicks > 0 && this.tick < this.zoneTicks
        ? [{ id: this.id, side: this.side, abilityId: this.def.id, x0: this.x0, x1: this.x1, ticksLeft: this.zoneTicks - this.tick }]
        : [];
    const strikes: PendingStrikeState[] =
      this.strikeTicks > 0 && this.tick < this.strikeTicks
        ? [{ id: this.id, side: this.side, abilityId: this.def.id, x0: this.x0, x1: this.x1, ticksLeft: this.strikeTicks - this.tick }]
        : [];
    this.fx.sync(zones, strikes, dt);
    for (const u of this.units) {
      if (u.state.stunTicks === 0 && this.t >= u.nextAttack) {
        u.view.startAttack();
        u.nextAttack = this.t + 900;
      }
      u.view.update(u.state, u.state.x, dt);
    }
  }

  runTo(ms: number): void {
    while (this.t + 16 <= ms) this.step(16);
    if (ms > this.t) this.step(ms - this.t);
  }
}

/** Hücre: maskeli kap; içi dünya koordinatında (zemin çizgisi UNIT_FEET_Y). Katmanlar: zemin efekti < birlikler < ön efekt. */
function abilityCell(parent: Container, cx: number, cy: number, def: AbilityDef, side: SideId): AbilityRunner {
  const C = ABILITY_CELL;
  const cell = new Container();
  cell.position.set(cx, cy);
  parent.addChild(cell);
  const mask = new Graphics().rect(0, 0, C.w, C.h).fill(0xffffff);
  cell.addChild(mask);
  cell.mask = mask;
  const inner = new Container();
  const x0 = 1000;
  const x1 = x0 + def.width;
  inner.position.set(C.w / 2 - (x0 + x1) / 2, C.groundY - UNIT_FEET_Y);
  cell.addChild(inner);
  const g = new Graphics();
  corridorStrip(g, x0 - 400, def.width + 800);
  inner.addChild(g);
  const units = new Container();
  units.sortableChildren = true;
  const runner = new AbilityRunner(def, side, x0, x1, units);
  // Zemin katmanı birliklerin altına taşınır (renderer için önerilen düzen).
  inner.addChild(runner.fx.ground, units, runner.fx.container);
  cell.addChild(new Graphics().rect(0, 0, C.w, C.h).stroke({ width: 3, color: 0x1d1b2b }));
  return runner;
}

function statusCell(parent: Container, x: number, y: number, age: ArtAge, role: string, side: SideId, kind: 'stun' | 'freeze', ms: number): void {
  const u = galleryUnit(side, `${AGE_PREFIX[age - 1]}_${role}`, 0);
  u.state.hp = u.maxHp * 0.7;
  u.state.stunTicks = 60;
  if (kind === 'freeze') {
    u.state.vulnTicks = 60;
    u.state.vulnPct = 30;
  }
  const holder = new Container();
  holder.position.set(x, y - UNIT_FEET_Y);
  holder.addChild(u.view.container);
  parent.addChild(holder);
  for (let t = 0; t < ms; t += 16) u.view.update(u.state, 0, 16);
}

function abilities(world: Container, app: Application | null): { w: number; h: number } {
  const C = ABILITY_CELL;
  const defs = ABILITIES.filter((d) => AGES.includes(d.age as ArtAge));
  const runners: Array<{ r: AbilityRunner; loop: number }> = [];
  const gap = 40;
  const colsPerSide = app === null ? 3 : 1;
  defs.forEach((def, ri) => {
    const y = 20 + ri * (C.h + 16);
    const frames = ABILITY_FRAMES[def.age] ?? [200, 1000, 2000];
    for (const side of [0, 1] as const) {
      const cols = app === null ? frames : [0];
      cols.forEach((ms, fi) => {
        const x = 20 + side * (colsPerSide * C.w + gap) + fi * C.w;
        const r = abilityCell(world, x, y, def, side);
        if (app === null) r.runTo(ms);
        else runners.push({ r, loop: ABILITY_LOOP_MS[def.age] ?? 4000 });
      });
    }
  });
  let h = 20 + defs.length * (C.h + 16);
  let w = 40 + 2 * colsPerSide * C.w + gap;
  if (app !== null) {
    app.ticker.add((tk) => {
      const dt = Math.min(tk.deltaMS, 50);
      for (const { r, loop } of runners) r.step(dt, loop);
    });
    return { w, h };
  }
  // Durum görselleri: her çağ satırı; oyuncu ve rakip için üç rol × (sersem, donmuş).
  const g = new Graphics();
  world.addChild(g);
  const cellW = 112;
  const rowH = 150;
  AGES.forEach((age, ai) => {
    const y = h + ai * rowH + 125;
    g.rect(20, y - 125, 12 * cellW + gap, rowH - 6).fill(0xc49b63);
    let x = 20 + cellW / 2;
    for (const side of [0, 1] as const) {
      for (const kind of ['stun', 'freeze'] as const) {
        for (const role of ['front', 'ranged', 'heavy']) {
          statusCell(world, x, y, age, role, side, kind, kind === 'stun' ? 200 + ((x / cellW) % 5) * 90 : 600);
          x += cellW;
        }
      }
      x += gap;
    }
  });
  h += AGES.length * rowH + 10;
  w = Math.max(w, 40 + 12 * cellW + gap);
  return { w, h };
}

async function main(): Promise<void> {
  const host = document.getElementById('gallery')!;
  if (VIEW === 'game') {
    await gameView(host);
    return;
  }
  const app = new Application();
  const W = globalThis.innerWidth;
  const H = globalThis.innerHeight;
  await app.init({ width: W, height: H, background: 0xd2ab72, antialias: true, resolution: globalThis.devicePixelRatio || 1, autoDensity: true, preference: 'webgl' });
  host.appendChild(app.canvas);
  const world = new Container();
  app.stage.addChild(world);

  let size: { w: number; h: number };
  if (VIEW === 'bases') size = bases(world, app);
  else if (VIEW === 'rebuild') size = rebuild(world);
  else if (VIEW === 'stone') size = stone(world, app);
  else if (VIEW === 'live') size = live(world, app);
  else if (VIEW === 'towers') size = towers(world);
  else if (VIEW === 'towerparts') size = towerParts(app, world);
  else if (VIEW === 'towerlive') size = towerLive(world, app);
  else if (VIEW === 'scene') size = sceneView(world, app);
  else if (VIEW === 'towerfx') size = towerFx(world);
  else if (VIEW === 'abilities') size = abilities(world, null);
  else if (VIEW === 'abilitylive') size = abilities(world, app);
  else if (VIEW === 'projectiles') size = projectilesView(world, app, AGES);
  else if (VIEW === 'backgrounds') size = backgroundsView(world, app);
  else if (VIEW === 'basedamage') size = baseDamageView(world, app, AGES);
  else if (VIEW === 'stress') size = stressView(world, app, AGES[0] ?? 5);
  else size = unitRows(app, world, VIEW === 'gray');

  const fit = Math.min(W / size.w, H / size.h);
  // `s` ölçek, `ox`/`oy` mantıksal kaydırma (dar pencerede yakından inceleme).
  const scale = Number(params.get('s') ?? fit);
  world.scale.set(scale);
  world.position.set(-Number(params.get('ox') ?? 0) * scale, -Number(params.get('oy') ?? 0) * scale);

  const stats = { units: unitAtlasStats(), bases: baseAtlasStats(), towers: towerAtlasStats(), abilities: abilityAtlasStats(), fx: fxAtlasStats(), baseDamage: baseDamageAtlasStats() };
  (globalThis as { __galleryApp?: Application; __atlasStats?: typeof stats }).__galleryApp = app;
  (globalThis as { __atlasStats?: typeof stats }).__atlasStats = stats;
  // Tembel pişirilen atlaslar sonradan oluşur: güncel boyutlar için.
  (globalThis as { __atlasStatsNow?: () => typeof stats }).__atlasStatsNow = () => ({
    units: unitAtlasStats(),
    bases: baseAtlasStats(),
    towers: towerAtlasStats(),
    abilities: abilityAtlasStats(),
    fx: fxAtlasStats(),
    baseDamage: baseDamageAtlasStats(),
  });
}

void main();
