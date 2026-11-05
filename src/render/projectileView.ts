import { Container, Graphics } from 'pixi.js';
import { getTower, getUnit, mustGetTower, mustGetUnit } from '../sim/compile';
import type { ProjectileState, SideId, SimEvent } from '../sim/types';
import { arcHeightFor, arcLift, effectProgress, fadeAlpha, flightProgress } from './projectileMath';

// ---- Mermi çizim sabitleri (denge değil; yalnız görünüm) ----
/** Zemin çizgisi (birlik ayaklarıyla aynı seviye, mantıksal px). */
const GROUND_Y = 735;
/** Mermilerin atıldığı gövde yüksekliği (zeminden yukarı, px). */
const LAUNCH_HEIGHT_PX = 46;
const COLOR_OUTLINE = 0x1d1b2b;
const COLOR_SHAFT = 0x8a5a2b;
const COLOR_TIP = 0xe8e3d0;
const COLOR_ROCK = 0x8d8d99;
const COLOR_ROCK_LIGHT = 0xc4c4d0;
const COLOR_DUST = 0xe9d9b4;
const COLOR_RING = 0xfff3c4;
/** Kule cıvatası (hızlı kule): mızraktan kısa ve ince. */
const BOLT_LENGTH_PX = 22;
const BOLT_SHAFT_WIDTH = 2;
const BOLT_TIP_LENGTH = 7;
const BOLT_TIP_HALF_WIDTH = 3;
const COLOR_BOLT = 0xd9d4e8;
const SPEAR_LENGTH_PX = 34;
const SPEAR_SHAFT_WIDTH = 3;
const SPEAR_TIP_LENGTH = 9;
const SPEAR_TIP_HALF_WIDTH = 4;
const ROCK_RADIUS_PX = 9;
/** Kaya yayı: uçuş mesafesinin bu oranı kadar yükselir, en çok MAX px. */
const ARC_RATIO = 0.22;
const ARC_MAX_PX = 95;
const ROCK_SPIN_RAD_PER_MS = 0.012;
const OUTLINE_WIDTH = 2;

// ---- Etki sabitleri ----
const DUST_DURATION_MS = 380;
const DUST_PUFFS = 5;
const DUST_RISE_PX = 18;
const DUST_SPREAD_PX = 22;
const DUST_RADIUS_PX = 5;
const RING_DURATION_MS = 420;
/** Halkanın dikey/yatay oranı (koridor perspektifi). */
const RING_FLATTEN = 0.28;
const RING_START_SCALE = 0.55;
const RING_LINE_WIDTH = 4;
/** Aynı anda en çok etki sayısı (performans sınırı). */
const MAX_EFFECTS = 80;

type ProjectileKind = 'spear' | 'rock' | 'bolt';

/** Merminin görünüm türü: birlikte role, kulede kule türüne göre (hızlı: cıvata, ağır: kaya). */
function kindOf(projectile: ProjectileState): ProjectileKind {
  if (projectile.sourceKind === 'tower') return mustGetTower(projectile.sourceType).def.kind === 'heavy' ? 'rock' : 'bolt';
  return mustGetUnit(projectile.sourceType).role === 'heavy' ? 'rock' : 'spear';
}

/** Kaynağın alan hasarı (birlik ya da kule); yoksa undefined. */
function splashOf(sourceType: string) {
  return (getUnit(sourceType) ?? getTower(sourceType))?.def.splash;
}

/** Atan birliğin silah çıkış noktası (sahne koordinatı). */
export interface LaunchPoint {
  x: number;
  y: number;
}

class ProjectileView {
  readonly container = new Container();
  private readonly dir: 1 | -1;
  private readonly kind: ProjectileKind;
  private readonly shape = new Graphics();
  private readonly startX: number;
  /** Silahın çıkış noktası ile simülasyon başlangıcı arasındaki görsel fark; uçuş boyunca sıfıra iner. */
  private readonly launchOffsetX: number;
  private readonly launchOffsetY: number;
  private clockMs = 0;

  constructor(projectile: ProjectileState, launch?: LaunchPoint) {
    this.dir = projectile.side === 0 ? 1 : -1;
    this.startX = projectile.x;
    this.launchOffsetX = launch === undefined ? 0 : launch.x - projectile.x;
    this.launchOffsetY = launch === undefined ? 0 : launch.y - (GROUND_Y - LAUNCH_HEIGHT_PX);
    this.kind = kindOf(projectile);
    if (this.kind === 'spear') this.drawSpear();
    else if (this.kind === 'bolt') this.drawBolt();
    else this.drawRock();
    this.container.addChild(this.shape);
  }

  private drawSpear(): void {
    const g = this.shape;
    const half = SPEAR_LENGTH_PX / 2;
    // Uç kısmı +x yönüne bakar; yön container.scale.x ile çevrilir.
    g.moveTo(-half, 0).lineTo(half - SPEAR_TIP_LENGTH, 0).stroke({ width: SPEAR_SHAFT_WIDTH + OUTLINE_WIDTH * 2, color: COLOR_OUTLINE });
    g.moveTo(-half, 0).lineTo(half - SPEAR_TIP_LENGTH, 0).stroke({ width: SPEAR_SHAFT_WIDTH, color: COLOR_SHAFT });
    g.poly([half - SPEAR_TIP_LENGTH, -SPEAR_TIP_HALF_WIDTH, half, 0, half - SPEAR_TIP_LENGTH, SPEAR_TIP_HALF_WIDTH])
      .fill(COLOR_TIP)
      .stroke({ width: OUTLINE_WIDTH, color: COLOR_OUTLINE });
    this.container.scale.x = this.dir;
  }

  private drawBolt(): void {
    const g = this.shape;
    const half = BOLT_LENGTH_PX / 2;
    g.moveTo(-half, 0).lineTo(half - BOLT_TIP_LENGTH, 0).stroke({ width: BOLT_SHAFT_WIDTH + OUTLINE_WIDTH * 2, color: COLOR_OUTLINE });
    g.moveTo(-half, 0).lineTo(half - BOLT_TIP_LENGTH, 0).stroke({ width: BOLT_SHAFT_WIDTH, color: COLOR_BOLT });
    g.poly([half - BOLT_TIP_LENGTH, -BOLT_TIP_HALF_WIDTH, half, 0, half - BOLT_TIP_LENGTH, BOLT_TIP_HALF_WIDTH])
      .fill(COLOR_TIP)
      .stroke({ width: OUTLINE_WIDTH, color: COLOR_OUTLINE });
    this.container.scale.x = this.dir;
  }

  private drawRock(): void {
    const g = this.shape;
    g.circle(0, 0, ROCK_RADIUS_PX).fill(COLOR_ROCK).stroke({ width: OUTLINE_WIDTH + 1, color: COLOR_OUTLINE });
    g.circle(-ROCK_RADIUS_PX * 0.3, -ROCK_RADIUS_PX * 0.3, ROCK_RADIUS_PX * 0.35).fill(COLOR_ROCK_LIGHT);
    g.moveTo(ROCK_RADIUS_PX * 0.1, ROCK_RADIUS_PX * 0.2).lineTo(ROCK_RADIUS_PX * 0.55, ROCK_RADIUS_PX * 0.6).stroke({ width: 2, color: COLOR_OUTLINE });
  }

  update(projectile: ProjectileState, x: number, animMs: number): void {
    this.clockMs += animMs;
    const baseY = GROUND_Y - LAUNCH_HEIGHT_PX;
    const t = flightProgress(this.startX, x, projectile.targetX);
    // Silah çıkış noktasından başlayan görsel fark çarpmaya doğru söner; x simülasyondan gelir.
    const fade = 1 - t;
    this.container.x = x + this.launchOffsetX * fade;
    if (this.kind === 'rock') {
      // Yay yalnızca görsel y kaymasıdır.
      const span = projectile.targetX - this.startX;
      this.container.y = baseY - arcLift(t, arcHeightFor(span, ARC_RATIO, ARC_MAX_PX)) + this.launchOffsetY * fade;
      this.shape.rotation = this.dir * this.clockMs * ROCK_SPIN_RAD_PER_MS;
    } else {
      this.container.y = baseY + this.launchOffsetY * fade;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

interface Effect {
  readonly container: Container;
  readonly durationMs: number;
  elapsedMs: number;
  readonly step: (progress: number) => void;
}

/**
 * Mermi katmanı: uçan mermiler (kimliğe bağlı görünümler) ve çarpma etkileri (toz, alan halkası).
 * Olayları `handleEvent` ile alır; durumu her karede `update` ile çizer. Yeniden oynamada `clear` ile temizlenir.
 */
export class ProjectileLayer {
  readonly container = new Container();
  private readonly views = new Map<number, ProjectileView>();
  /** Atılmış mermilerin kaynak türü: çarpma olayında alan yarıçapını bulmak için. */
  private readonly sourceTypes = new Map<number, string>();
  private readonly effects: Effect[] = [];

  handleEvent(event: SimEvent): void {
    if (event.type === 'projectileFired') {
      this.sourceTypes.set(event.id, event.sourceType);
    } else if (event.type === 'projectileImpact') {
      const sourceType = this.sourceTypes.get(event.id);
      this.sourceTypes.delete(event.id);
      this.addDust(event.x, event.side);
      const splash = sourceType === undefined ? undefined : splashOf(sourceType);
      if (splash !== undefined) this.addRing(event.x, splash.radius);
    }
  }

  /** Her kare: mevcut mermileri çizer, bitenleri kaldırır, etkileri ilerletir. */
  update(
    projectiles: readonly ProjectileState[],
    previousX: (id: number) => number | undefined,
    alpha: number,
    animMs: number,
    launchPointOf?: (projectile: ProjectileState) => LaunchPoint | undefined,
  ): void {
    const alive = new Set<number>();
    for (const p of projectiles) {
      alive.add(p.id);
      let view = this.views.get(p.id);
      if (view === undefined) {
        view = new ProjectileView(p, launchPointOf?.(p));
        this.views.set(p.id, view);
        this.container.addChild(view.container);
      }
      const prev = previousX(p.id) ?? p.x;
      view.update(p, prev + (p.x - prev) * alpha, animMs);
    }
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      view.destroy();
      this.views.delete(id);
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]!;
      effect.elapsedMs += animMs;
      const progress = effectProgress(effect.elapsedMs, effect.durationMs);
      effect.step(progress);
      if (progress >= 1) {
        effect.container.destroy({ children: true });
        this.effects.splice(i, 1);
      }
    }
  }

  /** Mermileri ve etkileri gizler/gösterir (maç bitince mermiler donar; sonuç ekranında havada asılı kalmasın). */
  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  /** Tüm mermi görünümlerini ve etkileri siler (yeniden oyna). */
  clear(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.sourceTypes.clear();
    for (const effect of this.effects) effect.container.destroy({ children: true });
    this.effects.length = 0;
    this.container.visible = true;
  }

  get projectileViewCount(): number {
    return this.views.size;
  }

  get effectCount(): number {
    return this.effects.length;
  }

  destroy(): void {
    this.clear();
    this.container.destroy({ children: true });
  }

  private pushEffect(effect: Effect): void {
    if (this.effects.length >= MAX_EFFECTS) {
      const oldest = this.effects.shift();
      oldest?.container.destroy({ children: true });
    }
    this.container.addChild(effect.container);
    this.effects.push(effect);
  }

  private addDust(x: number, side: SideId): void {
    const container = new Container();
    container.x = x;
    container.y = GROUND_Y - 4;
    const puffs: Graphics[] = [];
    for (let i = 0; i < DUST_PUFFS; i++) {
      const puff = new Graphics();
      puff.circle(0, 0, DUST_RADIUS_PX).fill(COLOR_DUST).stroke({ width: 2, color: COLOR_OUTLINE });
      container.addChild(puff);
      puffs.push(puff);
    }
    // Atan taraftan uzağa doğru hafif saçılım (yön yalnızca görünümdür).
    const bias = side === 0 ? -1 : 1;
    this.pushEffect({
      container,
      durationMs: DUST_DURATION_MS,
      elapsedMs: 0,
      step: (progress) => {
        puffs.forEach((puff, i) => {
          const spread = (i / (DUST_PUFFS - 1) - 0.5) * 2;
          puff.x = (spread * DUST_SPREAD_PX + bias * 4) * progress;
          puff.y = -DUST_RISE_PX * progress * (1 - Math.abs(spread) * 0.4);
          puff.scale.set(1 + progress * 0.6);
          puff.alpha = fadeAlpha(progress);
        });
      },
    });
  }

  private addRing(x: number, radius: number): void {
    const container = new Container();
    container.x = x;
    container.y = GROUND_Y - 2;
    const ring = new Graphics();
    ring.ellipse(0, 0, radius, radius * RING_FLATTEN).stroke({ width: RING_LINE_WIDTH, color: COLOR_RING });
    ring.ellipse(0, 0, radius, radius * RING_FLATTEN).stroke({ width: 1.5, color: COLOR_OUTLINE });
    container.addChild(ring);
    this.pushEffect({
      container,
      durationMs: RING_DURATION_MS,
      elapsedMs: 0,
      step: (progress) => {
        ring.scale.set(RING_START_SCALE + (1 - RING_START_SCALE) * Math.min(1, progress * 2));
        ring.alpha = fadeAlpha(progress);
      },
    });
  }
}
