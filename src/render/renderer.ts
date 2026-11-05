import { Application, Container, Graphics } from 'pixi.js';
import { prewarmUnitArt } from '../art/unitArt';
import { WORLD } from '../data/world';
import type { Session, SessionEvent } from '../game/session';
import { battlefieldBounds } from '../sim/geometry';
import { AbilityFx } from './abilityFx';
import { COLOR_SKY_TOP, GROUND_BOTTOM_Y, GROUND_TOP_Y, MAX_ANIM_FRAME_MS, MAX_RESOLUTION, SCENE_HEIGHT, WINDOW_MARGIN } from './constants';
import {
  createBackground,
  createBaseView,
  createStoneView,
  setBaseAge,
  setTowerSlot,
  towerLaunchPoint,
  triggerBaseFlash,
  triggerTowerFire,
  updateBaseFlash,
  updateStoneView,
  type BaseView,
} from './scene';
import { ProjectileLayer } from './projectileView';
import { UnitView } from './unitView';

/** Hedefleme önizlemesi: sahne her karede bu işlevi sorar; alan (dünya x0..x1) ya da null (önizleme yok). */
export interface RendererOptions {
  preview?: () => { x0: number; x1: number } | null;
}

/** Hedefleme önizlemesinin renkleri ve ölçüleri (görsel; denge değil). */
const PREVIEW_FILL = 0xffd25a;
const PREVIEW_EDGE = 0xfff3c4;
const PREVIEW_FILL_ALPHA = 0.22;
const PREVIEW_EDGE_ALPHA = 0.95;
const PREVIEW_EDGE_WIDTH = 4;
/** Önizleme bandının zeminin üstüne taşan yüksekliği (mantıksal px). */
const PREVIEW_RISE = 130;

export interface Renderer {
  /** Bir kare çizer. frameMs: gerçek kare süresi (animasyonlar için; duraklatmada animasyon durur). */
  render(frameMs: number): void;
  /** Ekran (istemci) x'ini dünya x'ine çevirir. */
  screenToWorldX(clientX: number): number;
  /** İmleç (istemci koordinatı) koridorda mı: dünya x'i üsler arası savaş alanında ve sahne yüksekliği içinde. */
  isInCorridor(clientX: number, clientY: number): boolean;
  /** Canlı ve solmakta olan birlik görünümü sayısı (test/hata ayıklama). */
  readonly unitViewCount: number;
  destroy(): void;
}

/**
 * Pixi sahnesini kurar (v8, async init). WebGL başlatılamazsa `init` hatası çağırana yayılır.
 * 1920×1080 mantıksal sahne pencereye kenar boşluğuyla sığdırılır; devicePixelRatio en fazla 2.
 */
export async function createRenderer(host: HTMLElement, session: Session, options: RendererOptions = {}): Promise<Renderer> {
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
  const abilityFx = new AbilityFx();
  const preview = new Graphics();
  preview.visible = false;
  let previewKey = '';
  const stone = createStoneView();
  // Yetenek zemin efektleri (hendek, çiviler, hedef bandı) birliklerin altında; diğer efektler üstünde.
  world.addChild(
    createBackground(),
    bases[0].container,
    bases[1].container,
    stone.container,
    abilityFx.ground,
    units,
    projectiles.container,
    abilityFx.container,
    preview,
  );
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
      abilityFx.clear();
      // Yeni maç: üsler ve taş yeni durumdan çizilir; taşın görsel durumu da baştan başlar.
      setBaseAge(bases[0], session.state.sides[0].age, false);
      setBaseAge(bases[1], session.state.sides[1].age, false);
      for (const side of [0, 1] as const) {
        session.state.sides[side].slots.forEach((slot, i) => setTowerSlot(bases[side], i, slot.tower?.type ?? null, slot.unlocked));
      }
      updateStoneView(stone, session.state.stone, 0);
      return;
    }
    if (event.type !== 'sim') return;
    for (const e of event.events) {
      projectiles.handleEvent(e);
      if (e.type === 'abilityCast') abilityFx.onCast(e.side, e.abilityId, e.x0, e.x1);
      else if (e.type === 'abilityImpact') abilityFx.onImpact(e.side, e.abilityId, e.x0, e.x1, e.hits);
      if (e.type === 'attack') views.get(e.attackerId)?.startAttack();
      else if (e.type === 'towerFired') triggerTowerFire(bases[e.side], e.slot);
      else if (e.type === 'baseDamaged') triggerBaseFlash(bases[e.side]);
      else if (e.type === 'unitDied') views.get(e.id)?.startDying();
    }
  });

  /** Hedefleme önizlemesi: yalnız alan değişince yeniden çizilir. */
  function updatePreview(area: { x0: number; x1: number } | null): void {
    if (area === null) {
      preview.visible = false;
      previewKey = '';
      return;
    }
    preview.visible = true;
    const key = `${area.x0}|${area.x1}`;
    if (key === previewKey) return;
    previewKey = key;
    const top = GROUND_TOP_Y - PREVIEW_RISE;
    const height = GROUND_BOTTOM_Y - top;
    preview.clear();
    preview.rect(area.x0, top, area.x1 - area.x0, height).fill({ color: PREVIEW_FILL, alpha: PREVIEW_FILL_ALPHA });
    preview.moveTo(area.x0, top).lineTo(area.x0, top + height).stroke({ width: PREVIEW_EDGE_WIDTH, color: PREVIEW_EDGE, alpha: PREVIEW_EDGE_ALPHA });
    preview.moveTo(area.x1, top).lineTo(area.x1, top + height).stroke({ width: PREVIEW_EDGE_WIDTH, color: PREVIEW_EDGE, alpha: PREVIEW_EDGE_ALPHA });
  }

  function localOf(clientX: number, clientY: number): { x: number; y: number } {
    const rect = app.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  return {
    screenToWorldX(clientX: number): number {
      return (localOf(clientX, 0).x - world.x) / world.scale.x;
    },
    isInCorridor(clientX: number, clientY: number): boolean {
      const local = localOf(clientX, clientY);
      const worldX = (local.x - world.x) / world.scale.x;
      const worldY = (local.y - world.y) / world.scale.y;
      const field = battlefieldBounds();
      return worldX >= field.x0 && worldX <= field.x1 && worldY >= 0 && worldY <= SCENE_HEIGHT;
    },
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
        (p) => (p.sourceKind === 'tower' ? towerLaunchPoint(bases[p.side], p.sourceId) : views.get(p.sourceId)?.launchPoint()),
      );
      setBaseAge(bases[0], state.sides[0].age);
      setBaseAge(bases[1], state.sides[1].age);
      for (const side of [0, 1] as const) {
        state.sides[side].slots.forEach((slot, i) => setTowerSlot(bases[side], i, slot.tower?.type ?? null, slot.unlocked));
      }
      updateStoneView(stone, state.stone, animMs);
      abilityFx.sync(state.zones, state.strikes, animMs);
      updatePreview(options.preview?.() ?? null);
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
      abilityFx.destroy();
      preview.destroy();
      app.destroy(true, { children: true });
    },
  };
}
