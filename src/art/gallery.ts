import { Application, ColorMatrixFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { UnitAnimInput, UnitRig } from './anim';
import { BaseRig, baseAtlasStats } from './baseRig';
import type { ArtAge, ArtSide } from './palette';
import { StoneRig } from './stoneArt';
import { createUnitRig, unitAtlasStats } from './unitArt';

/**
 * Yalnız geliştirme vitrini (GDD §14 denetimi için). Oyuna ve derlemeye girmez; metin içermez.
 * Görünümler (`?view=`):
 *   units   — her çağ × taraf satırı: üç rol, üç poz (durma, yürüme, vuruş) + 32 px gri siluetler
 *   gray    — aynı satırlar gri tonlamada, can çubuğu taklidiyle (takım ayrımı renk dışı: yön, amblem, çubuk)
 *   bases   — 5 çağ × 2 taraf üs
 *   rebuild — çağ geçişi film şeridi (oyuncu 1→2, rakip 4→5), sabit zaman kareleri
 *   stone   — Sınır Taşı durumları + canlı döngü
 *   live    — `age=n` çağında canlı döngü (yürü → saldır → öl)
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
      b.update(16);
      b.setAge(run.to);
      b.update(ms);
      const holder = new Container();
      holder.addChild(b.root);
      const x = 10 + fi * 200;
      holder.position.set(run.side === 0 ? x : x + 185, 255 + ri * 270);
      if (run.side === 1) holder.scale.x = -1;
      world.addChild(holder);
    });
  });
  return { w: 10 + frames.length * 200, h: 560 };
}

function groundStrip(g: Graphics, x: number, y: number, w: number): void {
  g.rect(x, y - 90, w, 90).fill(0x93ad6b);
  g.rect(x, y, w, 70).fill(0xd2ab72);
  g.rect(x, y + 4, w, 60).fill(0xc49b63);
}

function stone(world: Container, app: Application): { w: number; h: number } {
  const states: Array<{ counter: number; owner: ArtSide | null }> = [
    { counter: 0, owner: null },
    { counter: 40, owner: null },
    { counter: -70, owner: null },
    { counter: 100, owner: 0 },
    { counter: -100, owner: 1 },
    { counter: 55, owner: 0 },
    { counter: -20, owner: 1 },
  ];
  const cellW = 300;
  const g = new Graphics();
  world.addChild(g);
  const cells = [...states, null];
  cells.forEach((st, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = 20 + col * cellW + cellW / 2;
    const footY = 200 + row * 250;
    groundStrip(g, 20 + col * cellW + 4, footY + 4, cellW - 8);
    const r = new StoneRig({ halfWidth: 100, pathTop: -12, pathBottom: 48 });
    r.root.position.set(cx, footY);
    world.addChild(r.root);
    if (st !== null) {
      r.update(st.counter, st.owner, 100, 0);
      app.ticker.add((tk) => r.update(st.counter, st.owner, 100, tk.deltaMS));
    } else {
      // Canlı döngü: tarafsız → oyuncu sahip → rakip geri alır.
      let clock = 0;
      let counter = 0;
      let owner: ArtSide | null = null;
      app.ticker.add((tk) => {
        clock += tk.deltaMS;
        const target = Math.floor(clock / 7000) % 2 === 0 ? 100 : -100;
        counter += Math.sign(target - counter);
        if (counter >= 100) owner = 0;
        else if (counter <= -100) owner = 1;
        else if ((owner === 0 && counter <= 0) || (owner === 1 && counter >= 0)) owner = null;
        r.update(counter, owner, 100, tk.deltaMS);
      });
    }
  });
  return { w: 40 + 4 * cellW, h: 540 };
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

async function main(): Promise<void> {
  const host = document.getElementById('gallery')!;
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
  else size = unitRows(app, world, VIEW === 'gray');

  const fit = Math.min(W / size.w, H / size.h);
  // `s` ölçek, `ox`/`oy` mantıksal kaydırma (dar pencerede yakından inceleme).
  const scale = Number(params.get('s') ?? fit);
  world.scale.set(scale);
  world.position.set(-Number(params.get('ox') ?? 0) * scale, -Number(params.get('oy') ?? 0) * scale);

  const stats = { units: unitAtlasStats(), bases: baseAtlasStats() };
  (globalThis as { __galleryApp?: Application; __atlasStats?: typeof stats }).__galleryApp = app;
  (globalThis as { __atlasStats?: typeof stats }).__atlasStats = stats;
}

void main();
