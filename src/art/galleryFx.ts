import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { BackgroundView } from '../render/background';
import { SCENE_HEIGHT, UNIT_FEET_Y } from '../render/constants';
import { PROJECTILE_LOOKS, projectileKindOf } from '../render/projectileKinds';
import { ProjectileLayer } from '../render/projectileView';
import { createBackground, createBaseView, setBaseAge, setBaseDamage, setTowerSlot } from '../render/scene';
import { UnitView } from '../render/unitView';
import { WORLD } from '../data/world';
import { mustGetUnit } from '../sim/compile';
import type { ProjectileState, SideId, UnitState } from '../sim/types';
import type { ArtAge } from './palette';
import { fxTexture } from './projectileArt';

/**
 * Vitrin görünümleri (Aşama 9): mermiler, arka planlar, üs hasarı, en kötü sahne performansı.
 * Yalnız geliştirme; oyuna ve derlemeye girmez. Bkz. gallery.ts başlığındaki görünüm listesi.
 */

const AGE_PREFIX = ['primitive', 'ancient', 'medieval', 'industrial', 'future'] as const;

function unitType(age: ArtAge, role: 'front' | 'ranged' | 'heavy'): string {
  return `${AGE_PREFIX[age - 1]}_${role}`;
}

function towerType(age: ArtAge, kind: 'fast' | 'heavy'): string {
  return `${AGE_PREFIX[age - 1]}_tower_${kind}`;
}

function fakeProjectile(id: number, side: SideId, sourceKind: 'unit' | 'tower', sourceType: string, x: number, targetX: number): ProjectileState {
  return { id, side, sourceKind, sourceType, sourceId: 0, targetId: null, x, targetX, targetLost: false };
}

interface Flight {
  p: ProjectileState;
  prev: number;
  x0: number;
  x1: number;
  speed: number;
  wait: number;
}

/** ProjectileLayer'ı sahte olaylarla sürer: mermi atılır, hedefe uçar, çarpar, kısa bekleyip yeniden. */
class FlightRunner {
  readonly layer = new ProjectileLayer();
  private readonly flights: Flight[] = [];
  private nextId = 1;

  /** Çarpmadan sonra yeniden atışa kadar bekleme (ms). */
  constructor(private readonly reloadMs = 450) {}

  add(side: SideId, kind: 'unit' | 'tower', type: string, x0: number, x1: number, speed: number, delay = 0): void {
    const p = fakeProjectile(this.nextId++, side, kind, type, x0, x1);
    this.flights.push({ p, prev: x0, x0, x1, speed, wait: Math.max(1, delay) });
  }

  step(ms: number): void {
    const live: ProjectileState[] = [];
    const prevOf = new Map<number, number>();
    for (const f of this.flights) {
      if (f.wait > 0) {
        f.wait -= ms;
        if (f.wait > 0) continue;
        f.p = fakeProjectile(this.nextId++, f.p.side, f.p.sourceKind, f.p.sourceType, f.x0, f.x1);
        f.prev = f.x0;
        this.layer.handleEvent({ type: 'projectileFired', side: f.p.side, id: f.p.id, sourceType: f.p.sourceType, target: 'base' });
      }
      f.prev = f.p.x;
      const dir = Math.sign(f.x1 - f.x0);
      f.p.x += dir * f.speed * ms;
      if ((f.p.x - f.x1) * dir >= 0) {
        this.layer.handleEvent({ type: 'projectileImpact', side: f.p.side, id: f.p.id, x: f.x1, hits: 1, hitBase: false });
        f.wait = this.reloadMs;
        continue;
      }
      prevOf.set(f.p.id, f.prev);
      live.push(f.p);
    }
    this.layer.update(live, (id) => prevOf.get(id), 1, ms);
  }
}

/** Çağ satırları: solda durağan dokular (üstte oyuncu, altta rakip yönü), sağda canlı uçuş + çarpma. */
export function projectilesView(world: Container, app: Application, ages: readonly ArtAge[]): { w: number; h: number } {
  const rowH = 130;
  const sources: Array<{ kind: 'unit' | 'tower'; type: (a: ArtAge) => string; speed: number }> = [
    { kind: 'unit', type: (a) => unitType(a, 'ranged'), speed: 0.75 },
    { kind: 'unit', type: (a) => unitType(a, 'heavy'), speed: 0.45 },
    { kind: 'tower', type: (a) => towerType(a, 'fast'), speed: 0.9 },
    { kind: 'tower', type: (a) => towerType(a, 'heavy'), speed: 0.4 },
  ];
  const rows: FlightRunner[] = [];
  ages.forEach((age, ai) => {
    const y0 = 10 + ai * rowH;
    const bg = new Graphics();
    bg.rect(0, y0, 1500, rowH - 6).fill(ai % 2 === 0 ? 0xc49b63 : 0xb88f58);
    bg.rect(430, y0 + rowH - 22, 1070, 3).fill(0x9a7246);
    world.addChild(bg);
    const row = new FlightRunner();
    sources.forEach((src, si) => {
      const type = src.type(age);
      const look = PROJECTILE_LOOKS[projectileKindOf(src.kind, type)];
      for (const side of [0, 1] as const) {
        const sp = new Sprite(fxTexture(look.texture));
        sp.scale.set((side === 0 ? 1 : -1) * 2, 2);
        sp.position.set(55 + si * 95, y0 + 34 + side * 54);
        world.addChild(sp);
      }
      const side: SideId = si % 2 === 0 ? 0 : 1;
      const x0 = side === 0 ? 470 : 1460;
      const x1 = side === 0 ? 1010 + si * 60 : 920 - si * 60;
      row.add(side, src.kind, type, x0, x1, src.speed, si * 200);
    });
    // Mermi katmanı zemin çizgisi UNIT_FEET_Y'ye göre çizer; satıra kaydırılır.
    row.layer.container.y = y0 + rowH - 22 - UNIT_FEET_Y;
    world.addChild(row.layer.container);
    rows.push(row);
  });
  app.ticker.add((tk) => {
    for (const r of rows) r.step(Math.min(50, tk.deltaMS));
  });
  return { w: 1500, h: 20 + ages.length * rowH };
}

/** Beş çağ arka planı küçük boy + altta canlı çağ geçişi (her 3 sn bir sonraki çağ). */
export function backgroundsView(world: Container, app: Application): { w: number; h: number } {
  const thumb = 0.3;
  const all: ArtAge[] = [1, 2, 3, 4, 5];
  all.forEach((age, i) => {
    const bg = createBackground(age);
    bg.scale.set(thumb);
    bg.position.set(10 + i * (WORLD.worldWidth * thumb + 10), 10);
    world.addChild(bg);
  });
  const view = new BackgroundView(1);
  view.container.scale.set(0.8);
  view.container.position.set(10, 30 + SCENE_HEIGHT * thumb);
  world.addChild(view.container);
  let clock = 0;
  let age: ArtAge = 1;
  app.ticker.add((tk) => {
    clock += tk.deltaMS;
    if (clock > 3000) {
      clock = 0;
      age = ((age % 5) + 1) as ArtAge;
      view.setAge(age);
    }
    view.update(tk.deltaMS);
  });
  return { w: 20 + 5 * (WORLD.worldWidth * thumb + 10), h: 40 + SCENE_HEIGHT * (thumb + 0.8) };
}

/** Her çağın üssü × hasar düzeyi (can %100, %70, %45, %20); son sütun rakip %20. */
export function baseDamageView(world: Container, app: Application, ages: readonly ArtAge[]): { w: number; h: number } {
  const cellW = 230;
  const rowH = 255;
  const cells: Array<[SideId, number]> = [
    [0, 1],
    [0, 0.7],
    [0, 0.45],
    [0, 0.2],
    [1, 0.2],
  ];
  const views: Array<ReturnType<typeof createBaseView>> = [];
  ages.forEach((age, ai) => {
    cells.forEach(([side, f], ci) => {
      const v = createBaseView(side);
      setBaseAge(v, age, false);
      setBaseDamage(v, f);
      const x = 20 + ci * cellW;
      v.container.position.set(side === 0 ? x : x + 180, 245 + ai * rowH);
      world.addChild(v.container);
      views.push(v);
    });
  });
  app.ticker.add((tk) => {
    for (const v of views) v.rig.update(tk.deltaMS);
  });
  return { w: 40 + cells.length * cellW, h: 20 + ages.length * rowH };
}

/** Performans ölçümü (gallery `stress`); `__stress` genel nesnesine yazılır. */
export interface StressStats {
  frames: number;
  avgFrameMs: number;
  p95FrameMs: number;
  /** Görünüm güncellemesi (birlik + mermi + etkiler) CPU süresi, ms. */
  avgUpdateMs: number;
  /** Son karedeki WebGL çizim çağrısı. */
  drawCalls: number;
  particles: number;
  projectiles: number;
  units: number;
}

/** En kötü sahne (TDD §6): arka plan + iki üs (3 kule, hasarlı) + 120 birlik + 80 mermi + çarpma etkileri. */
export function stressView(world: Container, app: Application, age: ArtAge): { w: number; h: number } {
  world.addChild(createBackground(age));
  for (const side of [0, 1] as const) {
    const v = createBaseView(side);
    setBaseAge(v, age, false);
    setTowerSlot(v, 0, towerType(age, 'fast'), true);
    setTowerSlot(v, 1, towerType(age, 'heavy'), true);
    setTowerSlot(v, 2, towerType(age, 'fast'), true);
    setBaseDamage(v, 0.4);
    world.addChild(v.container);
    app.ticker.add((tk) => v.rig.update(tk.deltaMS));
  }
  const unitLayer = new Container();
  unitLayer.sortableChildren = true;
  world.addChild(unitLayer);
  const units: Array<{ state: UnitState; view: UnitView; maxHp: number; t: number }> = [];
  const roles = ['front', 'ranged', 'heavy'] as const;
  for (let i = 0; i < 120; i++) {
    const side: SideId = i % 2 === 0 ? 0 : 1;
    const a = ((Math.floor(i / 6) % 5) + 1) as ArtAge;
    const type = unitType(a, roles[i % 3]!);
    const k = Math.floor(i / 2);
    const x = side === 0 ? 300 + k * 10 : 1620 - k * 10;
    const maxHp = mustGetUnit(type).def.hp;
    const state: UnitState = { id: 10_000 + i, side, type, x, hp: maxHp, cooldown: 0, mode: i % 4 === 0 ? 'walk' : 'attack', stunTicks: 0, vulnTicks: 0, vulnPct: 0 };
    const view = new UnitView(state);
    unitLayer.addChild(view.container);
    units.push({ state, view, maxHp, t: i * 53 });
  }
  const runner = new FlightRunner(1);
  for (let i = 0; i < 80; i++) {
    const side: SideId = i % 2 === 0 ? 0 : 1;
    const a = (((i >> 2) % 5) + 1) as ArtAge;
    const kinds: Array<['unit' | 'tower', string]> = [
      ['unit', unitType(a, 'ranged')],
      ['unit', unitType(a, 'heavy')],
      ['tower', towerType(a, 'fast')],
      ['tower', towerType(a, 'heavy')],
    ];
    const [kind, type] = kinds[i % 4]!;
    const x0 = side === 0 ? 400 + (i % 10) * 40 : 1520 - (i % 10) * 40;
    runner.add(side, kind, type, x0, side === 0 ? x0 + 420 : x0 - 420, 0.35 + (i % 5) * 0.08, (i * 37) % 600);
  }
  world.addChild(runner.layer.container);

  // Çizim çağrısı sayacı (WebGL drawElements/drawArrays) ve kare süresi.
  const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  let calls = 0;
  if (gl !== undefined) {
    const de = gl.drawElements.bind(gl);
    gl.drawElements = ((mode: number, count: number, type: number, offset: number) => {
      calls++;
      de(mode, count, type, offset);
    }) as WebGL2RenderingContext['drawElements'];
    const da = gl.drawArrays.bind(gl);
    gl.drawArrays = ((mode: number, first: number, count: number) => {
      calls++;
      da(mode, first, count);
    }) as WebGL2RenderingContext['drawArrays'];
  }
  const frames: number[] = [];
  const updates: number[] = [];
  const stats: StressStats = { frames: 0, avgFrameMs: 0, p95FrameMs: 0, avgUpdateMs: 0, drawCalls: 0, particles: 0, projectiles: 0, units: units.length };
  (globalThis as { __stress?: StressStats }).__stress = stats;
  app.ticker.add((tk) => {
    stats.drawCalls = calls;
    calls = 0;
    const t0 = performance.now();
    const ms = Math.min(50, tk.deltaMS);
    for (const u of units) {
      const s = u.state;
      u.t += ms;
      if (s.mode === 'walk') {
        s.x += (s.side === 0 ? 1 : -1) * 0.03 * ms;
        if (s.x > 1700 || s.x < 220) s.x = s.side === 0 ? 300 : 1620;
      }
      if (u.t >= 900) {
        u.t -= 900;
        u.view.startAttack();
        s.hp = s.hp - u.maxHp * 0.08 <= u.maxHp * 0.1 ? u.maxHp - 1 : s.hp - u.maxHp * 0.08;
      }
      u.view.update(s, s.x, ms);
    }
    runner.step(ms);
    updates.push(performance.now() - t0);
    frames.push(tk.deltaMS);
    if (frames.length > 240) frames.shift();
    if (updates.length > 240) updates.shift();
    const sorted = [...frames].sort((x, y) => x - y);
    stats.frames++;
    stats.avgFrameMs = frames.reduce((x, y) => x + y, 0) / frames.length;
    stats.p95FrameMs = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    stats.avgUpdateMs = updates.reduce((x, y) => x + y, 0) / updates.length;
    stats.particles = runner.layer.effectCount;
    stats.projectiles = runner.layer.projectileViewCount;
  });
  return { w: WORLD.worldWidth, h: SCENE_HEIGHT };
}

/**
 * Gerçek oyun sahnesi (vitrin `game`): `createRenderer` + `Session`, iki zor yapay zekâ karşılıklı oynar.
 * Arayüz yoktur; durum `__game` üzerinden betikle sürülür (çağ atlatma, altın, sarsıntı aç/kapa, ölçüm).
 * Görünürlük duraklatması kapalıdır (yerleşik tarayıcı bölmesi arka planda olsa da maç sürer).
 */
export async function gameView(host: HTMLElement): Promise<void> {
  const { Session } = await import('../game/session');
  const { createAiBot } = await import('../ai/strategy');
  const { createRenderer } = await import('../render/renderer');
  host.style.width = '100vw';
  host.style.height = '100vh';
  const seed = 7;
  const session = new Session({ seed, opponent: 'none', visibility: null, createControllers: () => [createAiBot('hard', seed, 0), createAiBot('hard', seed + 1, 1)] });
  session.restart();
  const renderer = await createRenderer(host, session);
  let last = performance.now();
  const frame = (now: number): void => {
    const ms = Math.min(250, now - last);
    last = now;
    session.advance(ms);
    renderer.render(ms);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (globalThis as { __game?: unknown }).__game = { session, renderer };
}
