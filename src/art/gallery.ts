import { Application, ColorMatrixFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { UnitAnimInput, UnitRig } from './anim';
import type { ArtSide } from './palette';
import { BaseRig } from './primitiveBase';
import { createUnitRig } from './unitArt';

/**
 * Yalnız geliştirme vitrini (GDD §14 denetimi için): pozlar, canlı döngü, üsler ve
 * 32 px gri tonlama siluet şeridi. Oyuna ve derlemeye girmez; metin içermez.
 */

const TYPES = [
  { id: 'primitive_front', role: 'front', interval: 1000, cell: 66 },
  { id: 'primitive_ranged', role: 'ranged', interval: 1200, cell: 66 },
  { id: 'primitive_heavy', role: 'heavy', interval: 3000, cell: 128 },
] as const;

function input(over: Partial<UnitAnimInput>): UnitAnimInput {
  return { walkDist: 0, walkBlend: 0, sinceAttackMs: Infinity, attackIntervalMs: 1000, engaged: false, sinceHitMs: Infinity, timeMs: 0, ...over };
}

const POSES: ReadonlyArray<Partial<UnitAnimInput>> = [
  {},
  { walkBlend: 1, walkDist: 7 },
  { engaged: true },
  { engaged: true, sinceAttackMs: 70 },
  { engaged: true, sinceAttackMs: 260 },
];

function rig(typeIndex: number, side: ArtSide): UnitRig {
  const t = TYPES[typeIndex]!;
  const r = createUnitRig(t.id, t.role, side);
  r.root.scale.x = side === 0 ? 1 : -1;
  return r;
}

async function main(): Promise<void> {
  const host = document.getElementById('gallery')!;
  const app = new Application();
  await app.init({ width: 1700, height: 1240, background: 0xd2ab72, antialias: true, resolution: 1, preference: 'webgl' });
  host.appendChild(app.canvas);
  const S = Number(new URLSearchParams(globalThis.location.search).get('s') ?? 1.4);
  const world = new Container();
  world.scale.set(S);
  world.x = -Number(new URLSearchParams(globalThis.location.search).get('ox') ?? 0) * S;
  app.stage.addChild(world);

  // 1–2. satır: sabit pozlar (oyuncu, rakip).
  for (const side of [0, 1] as const) {
    let x = 30;
    const y = 110 + side * 125;
    TYPES.forEach((t, ti) => {
      for (const p of POSES) {
        const r = rig(ti, side);
        r.pose(input({ ...p, attackIntervalMs: t.interval }));
        r.root.position.set(x + t.cell / 2, y);
        world.addChild(r.root);
        // Atış/vuruş noktası işareti.
        const mark = new Graphics().circle(0, 0, 1.6).fill(0xff2bd6);
        mark.position.set(x + t.cell / 2 + (side === 0 ? 1 : -1) * r.launch.x, y + r.launch.y);
        world.addChild(mark);
        x += t.cell;
      }
      x += 14;
    });
  }

  // 3. satır: canlı döngü (yürü → saldır → öl).
  const live: Array<{ rig: UnitRig; ti: number; clock: number }> = [];
  for (const side of [0, 1] as const) {
    TYPES.forEach((_, ti) => {
      const r = rig(ti, side);
      r.root.position.set(90 + ti * 150 + side * 480, 370);
      world.addChild(r.root);
      live.push({ rig: r, ti, clock: ti * 400 });
    });
  }

  // 4. satır: üsler.
  for (const side of [0, 1] as const) {
    const b = new BaseRig(side);
    const holder = new Container();
    holder.addChild(b.root);
    holder.position.set(side === 0 ? 120 : 1000, 640);
    if (side === 1) holder.scale.x = -1;
    world.addChild(holder);
    app.ticker.add((tk) => b.update(tk.deltaMS));
  }

  // 5. satır: 32 px gri tonlama siluetleri (her rol 32 px yüksekliğe indirgenmiş), ×4 büyütülmüş.
  const check = new Container();
  check.position.set(40, 1000);
  app.stage.addChild(check);
  let cx = 0;
  for (const side of [0, 1] as const) {
    TYPES.forEach((t, ti) => {
      const r = rig(ti, side);
      r.pose(input({ attackIntervalMs: t.interval }));
      const holder = new Container();
      holder.addChild(r.root);
      const b = holder.getLocalBounds();
      holder.scale.set(32 / b.height);
      const outer = new Container();
      outer.addChild(holder);
      const tex: Texture = app.renderer.generateTexture({ target: outer, resolution: 1, antialias: true });
      tex.source.scaleMode = 'nearest';
      const sp = new Sprite(tex);
      sp.scale.set(4);
      sp.position.set(cx, 0);
      check.addChild(sp);
      cx += sp.width + 30;
    });
    cx += 40;
  }
  const gray = new ColorMatrixFilter();
  gray.desaturate();
  check.filters = [gray];
  const frame = new Graphics();
  frame.rect(30, 990, cx, 150).stroke({ width: 2, color: 0x1d1b2b });
  app.stage.addChild(frame);

  app.ticker.add((tk) => {
    for (const l of live) {
      l.clock += tk.deltaMS;
      const t = TYPES[l.ti]!;
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
  (globalThis as { __galleryApp?: Application }).__galleryApp = app;
}

void main();
