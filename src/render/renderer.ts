import { Application, Container } from 'pixi.js';
import { prewarmUnitArt } from '../art/unitArt';
import { WORLD } from '../data/world';
import type { Session, SessionEvent } from '../game/session';
import { COLOR_SKY_TOP, MAX_ANIM_FRAME_MS, MAX_RESOLUTION, SCENE_HEIGHT, WINDOW_MARGIN } from './constants';
import {
  createBackground,
  createBaseView,
  createStoneView,
  setBaseAge,
  triggerBaseFlash,
  updateBaseFlash,
  updateStoneView,
  type BaseView,
} from './scene';
import { ProjectileLayer } from './projectileView';
import { UnitView } from './unitView';

export interface Renderer {
  /** Bir kare çizer. frameMs: gerçek kare süresi (animasyonlar için; duraklatmada animasyon durur). */
  render(frameMs: number): void;
  /** Canlı ve solmakta olan birlik görünümü sayısı (test/hata ayıklama). */
  readonly unitViewCount: number;
  destroy(): void;
}

/**
 * Pixi sahnesini kurar (v8, async init). WebGL başlatılamazsa `init` hatası çağırana yayılır.
 * 1920×1080 mantıksal sahne pencereye kenar boşluğuyla sığdırılır; devicePixelRatio en fazla 2.
 */
export async function createRenderer(host: HTMLElement, session: Session): Promise<Renderer> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(globalThis.devicePixelRatio || 1, MAX_RESOLUTION),
    background: COLOR_SKY_TOP,
    preference: 'webgl',
    autoStart: false,
  });
  app.ticker.stop();
  host.appendChild(app.canvas);
  // Birlik parçalarını açılışta bir kez dokuya pişir (ilk birlik doğduğunda takılma olmasın).
  prewarmUnitArt();

  const world = new Container();
  const units = new Container();
  units.sortableChildren = true;
  const bases: [BaseView, BaseView] = [createBaseView(0), createBaseView(1)];
  const projectiles = new ProjectileLayer();
  const stone = createStoneView();
  world.addChild(createBackground(), bases[0].container, bases[1].container, stone.container, units, projectiles.container);
  app.stage.addChild(world);

  const views = new Map<number, UnitView>();
  let lastW = -1;
  let lastH = -1;

  function layout(): void {
    const w = app.screen.width;
    const h = app.screen.height;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    const scale = Math.max(0.05, Math.min((w - 2 * WINDOW_MARGIN) / WORLD.worldWidth, (h - 2 * WINDOW_MARGIN) / SCENE_HEIGHT));
    world.scale.set(scale);
    world.x = (w - WORLD.worldWidth * scale) / 2;
    world.y = (h - SCENE_HEIGHT * scale) / 2;
  }

  function clearViews(): void {
    for (const view of views.values()) view.destroy();
    views.clear();
  }

  const unsubscribe = session.subscribe((event: SessionEvent) => {
    if (event.type === 'reset') {
      clearViews();
      projectiles.clear();
      // Yeni maç: üsler ve taş yeni durumdan çizilir; taşın görsel durumu da baştan başlar.
      setBaseAge(bases[0], session.state.sides[0].age, false);
      setBaseAge(bases[1], session.state.sides[1].age, false);
      updateStoneView(stone, session.state.stone, 0);
      return;
    }
    if (event.type !== 'sim') return;
    for (const e of event.events) {
      projectiles.handleEvent(e);
      if (e.type === 'attack') views.get(e.attackerId)?.startAttack();
      else if (e.type === 'baseDamaged') triggerBaseFlash(bases[e.side]);
      else if (e.type === 'unitDied') views.get(e.id)?.startDying();
    }
  });

  return {
    render(frameMs: number): void {
      layout();
      const animMs = session.paused ? 0 : Math.min(Math.max(frameMs, 0), MAX_ANIM_FRAME_MS);
      const alpha = session.renderAlpha;
      const state = session.state;

      const alive = new Set<number>();
      for (const unit of state.units) {
        alive.add(unit.id);
        let view = views.get(unit.id);
        if (view === undefined) {
          view = new UnitView(unit);
          views.set(unit.id, view);
          units.addChild(view.container);
        }
        const prev = session.previousX(unit.id) ?? unit.x;
        view.update(unit, prev + (unit.x - prev) * alpha, animMs);
      }
      for (const [id, view] of views) {
        if (alive.has(id)) continue;
        view.startDying();
        view.updateDying(animMs);
        if (view.finished) {
          view.destroy();
          views.delete(id);
        }
      }
      // Maç bitince mermiler donar; sonuç ekranında havada asılı kalmasın diye gizlenir.
      projectiles.setVisible(!session.ended);
      projectiles.update(
        state.projectiles,
        (id) => session.previousProjectileX(id),
        alpha,
        animMs,
        (sourceId) => views.get(sourceId)?.launchPoint(),
      );
      setBaseAge(bases[0], state.sides[0].age);
      setBaseAge(bases[1], state.sides[1].age);
      updateStoneView(stone, state.stone, animMs);
      updateBaseFlash(bases[0], animMs);
      updateBaseFlash(bases[1], animMs);
      app.render();
    },
    get unitViewCount(): number {
      return views.size;
    },
    destroy(): void {
      unsubscribe();
      clearViews();
      projectiles.destroy();
      app.destroy(true, { children: true });
    },
  };
}
