import { Container, Sprite } from 'pixi.js';
import { setSpriteTexture } from '../art/atlas';
import { fxTexture } from '../art/projectileArt';
import { getTower, getUnit } from '../sim/compile';
import type { ProjectileState, SideId, SimEvent } from '../sim/types';
import { PROJECTILE_LOOKS, projectileKindOf, type ImpactKind, type ProjectileLook } from './projectileKinds';
import { arcHeightFor, arcLift, arcSlope, flightProgress } from './projectileMath';

// ---- Mermi çizim sabitleri (denge değil; yalnız görünüm) ----
/** Zemin çizgisi (birlik ayaklarıyla aynı seviye, mantıksal px). */
const GROUND_Y = 735;
/** Mermilerin atıldığı gövde yüksekliği (zeminden yukarı, px). */
const LAUNCH_HEIGHT_PX = 46;
/** Nabız (enerji küreleri): süre ve genlik. */
const PULSE_MS = 260;
const PULSE_AMP = 0.14;

// ---- Etki sabitleri ----
/** Aynı anda en çok parçacık (TDD §6 bütçesi: 150 parçacık; taşma en eskiyi siler). */
const MAX_PARTICLES = 160;
/** Alan halkasının dikey/yatay oranı (koridor perspektifi) ve başlangıç ölçeği. */
const RING_FLATTEN = 0.28;
const RING_START = 0.55;
/** Halka dokusunun yarıçapı (src/art/projectileArt.ts). */
const RING_TEX_RADIUS = 64;
const RING_MS = 420;
const GRAVITY = 0.0012;

const TINT = {
  dust: 0xffffff,
  stone: 0xb7b2a6,
  brass: 0xffd36a,
  violet: 0xe2a0ff,
  orange: 0xffa340,
  oil: 0x4a4450,
  ringWarm: 0xfff3c4,
  ringSand: 0xffc46a,
  ringOil: 0xff8a4a,
  ringPlasma: 0xeab8ff,
} as const;

/** Kaynağın alan hasarı (birlik ya da kule); yoksa undefined. */
function splashOf(sourceType: string) {
  return (getUnit(sourceType) ?? getTower(sourceType))?.def.splash;
}

/** Atan birliğin silah çıkış noktası (sahne koordinatı). */
export interface LaunchPoint {
  x: number;
  y: number;
}

/** Parçacık: havuzdan sprite, doğrusal hız + yerçekimi, ölçek ve solma eğrisi. */
interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  g: number;
  lifeMs: number;
  ageMs: number;
  s0: number;
  s1: number;
  /** Dikey ölçek çarpanı (halka basıklığı). */
  flat: number;
  spin: number;
  a0: number;
  /** Solmanın başladığı ömür oranı. */
  fadeAt: number;
  /** Ölçek ilk yarıda tamamlanır (halka). */
  fastGrow: boolean;
}

interface ParticleSpec {
  tex: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  g?: number;
  lifeMs: number;
  s0: number;
  s1: number;
  flat?: number;
  spin?: number;
  rot?: number;
  a0?: number;
  fadeAt?: number;
  fastGrow?: boolean;
  tint?: number;
}

/** Sabit sözde rastgele (etkiler kararlı ve tekrarlanabilir görünür; oyun durumunu etkilemez). */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

class ProjectileView {
  readonly container = new Container();
  private readonly dir: 1 | -1;
  readonly look: ProjectileLook;
  private readonly head: Sprite;
  private readonly trail: Sprite | null = null;
  private readonly startX: number;
  /** Silahın çıkış noktası ile simülasyon başlangıcı arasındaki görsel fark; uçuş boyunca sıfıra iner. */
  private readonly launchOffsetX: number;
  private readonly launchOffsetY: number;
  private clockMs: number;
  private sincePuffMs = 0;

  constructor(projectile: ProjectileState, launch?: LaunchPoint) {
    this.dir = projectile.side === 0 ? 1 : -1;
    this.startX = projectile.x;
    this.launchOffsetX = launch === undefined ? 0 : launch.x - projectile.x;
    this.launchOffsetY = launch === undefined ? 0 : launch.y - (GROUND_Y - LAUNCH_HEIGHT_PX);
    this.look = PROJECTILE_LOOKS[projectileKindOf(projectile.sourceKind, projectile.sourceType)];
    this.clockMs = projectile.id * 37;
    const scale = this.look.scale ?? 1;
    if (this.look.trail !== undefined) {
      const t = new Sprite(fxTexture('fx.streak'));
      t.tint = this.look.trail.tint;
      t.alpha = this.look.trail.alpha;
      t.scale.set(0, this.look.trail.width * scale);
      this.trail = t;
      this.container.addChild(t);
    }
    this.head = new Sprite(fxTexture(this.look.texture));
    this.head.scale.set(scale);
    this.container.addChild(this.head);
    // Uç +x yönüne bakar; yön container.scale.x ile çevrilir.
    this.container.scale.x = this.dir;
  }

  /** Konumu günceller; uçuşta duman bırakacaksa sahne koordinatını döndürür. */
  update(projectile: ProjectileState, x: number, animMs: number): { x: number; y: number } | null {
    this.clockMs += animMs;
    const look = this.look;
    const baseY = GROUND_Y - LAUNCH_HEIGHT_PX;
    const t = flightProgress(this.startX, x, projectile.targetX);
    // Silah çıkış noktasından başlayan görsel fark çarpmaya doğru söner; x simülasyondan gelir.
    const fade = 1 - t;
    this.container.x = x + this.launchOffsetX * fade;
    const span = projectile.targetX - this.startX;
    let angle = 0;
    if (look.arc !== null) {
      const h = arcHeightFor(span, look.arc.ratio, look.arc.max);
      this.container.y = baseY - arcLift(t, h) + this.launchOffsetY * fade;
      // Yaya teğet açı (ekran y aşağı): aynalı kapta dönüş yönle çarpılır.
      angle = Math.atan(arcSlope(t, h, span) - (this.launchOffsetY / Math.max(1, Math.abs(span))));
    } else {
      this.container.y = baseY + this.launchOffsetY * fade;
      angle = Math.atan(-this.launchOffsetY / Math.max(1, Math.abs(span)));
    }
    const rot = this.dir * angle;
    if (look.orient === 'spin') this.head.rotation = this.clockMs * (look.spin ?? 0);
    else if (look.orient === 'tangent') this.head.rotation = rot;
    if (look.pulse) this.head.scale.set((look.scale ?? 1) * (1 + PULSE_AMP * Math.sin((this.clockMs / PULSE_MS) * Math.PI * 2)));
    if (this.trail !== null && look.trail !== undefined) {
      const travelled = Math.abs(x - this.startX) + Math.abs(this.launchOffsetX) * t;
      this.trail.scale.x = Math.min(look.trail.length, travelled) / 64;
      this.trail.rotation = rot;
    }
    if (look.puffEveryMs !== undefined) {
      this.sincePuffMs += animMs;
      if (this.sincePuffMs >= look.puffEveryMs) {
        this.sincePuffMs = 0;
        return { x: this.container.x, y: this.container.y };
      }
    }
    return null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/**
 * Mermi katmanı: uçan mermiler (kimliğe bağlı görünümler; çağa ve kaynağa özgü dokular) ve çarpma etkileri
 * (toz, kıvılcım, enerji çakması, alan halkası). Etkiler havuzlu sprite parçacıklarıdır (karede çizim yok).
 * Olayları `handleEvent` ile alır; durumu her karede `update` ile çizer. Yeniden oynamada `clear` ile temizlenir.
 */
export class ProjectileLayer {
  readonly container = new Container();
  private readonly flying = new Container();
  private readonly fx = new Container();
  private readonly views = new Map<number, ProjectileView>();
  /** Atılmış mermilerin kaynak türü: çarpma olayında alan yarıçapını ve etki türünü bulmak için. */
  private readonly sources = new Map<number, { kind: 'unit' | 'tower'; type: string }>();
  private readonly particles: Particle[] = [];
  private readonly pool: Sprite[] = [];
  private seq = 0;

  constructor() {
    // Duman ve çarpma etkileri mermilerin arkasında değil önünde; iz dumanı da aynı katmanda.
    this.container.addChild(this.flying, this.fx);
  }

  handleEvent(event: SimEvent): void {
    if (event.type === 'projectileFired') {
      const kind = getTower(event.sourceType) !== undefined ? 'tower' : 'unit';
      this.sources.set(event.id, { kind, type: event.sourceType });
    } else if (event.type === 'projectileImpact') {
      const src = this.sources.get(event.id);
      this.sources.delete(event.id);
      const look = src === undefined ? PROJECTILE_LOOKS.spear : PROJECTILE_LOOKS[projectileKindOf(src.kind, src.type)];
      const splash = src === undefined ? undefined : splashOf(src.type);
      this.impact(look.impact, event.x, event.side, splash?.radius, look.arc !== null && look.arc.max >= 40);
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
        this.flying.addChild(view.container);
      }
      const prev = previousX(p.id) ?? p.x;
      const puffAt = view.update(p, prev + (p.x - prev) * alpha, animMs);
      if (puffAt !== null && animMs > 0) this.trailPuff(puffAt.x, puffAt.y, view.look.puffTint ?? TINT.dust);
    }
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      view.destroy();
      this.views.delete(id);
    }
    this.stepParticles(animMs);
  }

  /** Mermileri ve etkileri gizler/gösterir (maç bitince mermiler donar; sonuç ekranında havada asılı kalmasın). */
  setVisible(visible: boolean): void {
    this.container.visible = visible;
  }

  /** Tüm mermi görünümlerini ve etkileri siler (yeniden oyna). */
  clear(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.sources.clear();
    for (const p of this.particles) this.release(p.sprite);
    this.particles.length = 0;
    this.container.visible = true;
  }

  get projectileViewCount(): number {
    return this.views.size;
  }

  /** Etkin parçacık sayısı (performans paneli). */
  get effectCount(): number {
    return this.particles.length;
  }

  destroy(): void {
    this.clear();
    for (const s of this.pool) s.destroy();
    this.pool.length = 0;
    this.container.destroy({ children: true });
  }

  // ---- Parçacıklar ----

  private acquire(tex: string): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    setSpriteTexture(s, fxTexture(tex));
    s.visible = true;
    s.rotation = 0;
    s.tint = 0xffffff;
    if (s.parent !== this.fx) this.fx.addChild(s);
    return s;
  }

  private release(s: Sprite): void {
    s.visible = false;
    this.pool.push(s);
  }

  private spawn(p: ParticleSpec): void {
    if (this.particles.length >= MAX_PARTICLES) {
      const oldest = this.particles.shift();
      if (oldest !== undefined) this.release(oldest.sprite);
    }
    const sprite = this.acquire(p.tex);
    sprite.position.set(p.x, p.y);
    sprite.rotation = p.rot ?? 0;
    if (p.tint !== undefined) sprite.tint = p.tint;
    const part: Particle = {
      sprite,
      vx: p.vx ?? 0,
      vy: p.vy ?? 0,
      g: p.g ?? 0,
      lifeMs: p.lifeMs,
      ageMs: 0,
      s0: p.s0,
      s1: p.s1,
      flat: p.flat ?? 1,
      spin: p.spin ?? 0,
      a0: p.a0 ?? 1,
      fadeAt: p.fadeAt ?? 0,
      fastGrow: p.fastGrow ?? false,
    };
    this.particles.push(part);
    this.poseParticle(part);
  }

  private poseParticle(p: Particle): void {
    const t = Math.min(1, p.ageMs / p.lifeMs);
    const k = p.fastGrow ? Math.min(1, t * 2) : t;
    const s = p.s0 + (p.s1 - p.s0) * k;
    p.sprite.scale.set(s, s * p.flat);
    p.sprite.alpha = p.a0 * (t <= p.fadeAt ? 1 : 1 - (t - p.fadeAt) / (1 - p.fadeAt));
  }

  private stepParticles(ms: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.ageMs += ms;
      if (p.ageMs >= p.lifeMs) {
        this.release(p.sprite);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * ms;
      p.sprite.x += p.vx * ms;
      p.sprite.y += p.vy * ms;
      p.sprite.rotation += p.spin * ms;
      this.poseParticle(p);
    }
  }

  private rnd(): number {
    return hash01(++this.seq);
  }

  private trailPuff(x: number, y: number, tint: number): void {
    this.spawn({ tex: 'fx.smoke', x, y, vy: -0.012, lifeMs: 420, s0: 0.35, s1: 0.9, tint, a0: 0.55, fadeAt: 0.2 });
  }

  private ring(x: number, radius: number, tint: number): void {
    const s1 = radius / RING_TEX_RADIUS;
    this.spawn({ tex: 'fx.ring', x, y: GROUND_Y - 2, lifeMs: RING_MS, s0: s1 * RING_START, s1, flat: RING_FLATTEN, tint, fastGrow: true });
  }

  private dust(x: number, y: number, side: SideId, puffs: number, size: number): void {
    // Atan taraftan uzağa doğru hafif saçılım (yön yalnızca görünümdür).
    const bias = side === 0 ? -1 : 1;
    for (let i = 0; i < puffs; i++) {
      const spread = puffs === 1 ? 0 : (i / (puffs - 1) - 0.5) * 2;
      this.spawn({
        tex: 'fx.puff',
        x,
        y,
        vx: (spread * 0.058 + bias * 0.01) * size,
        vy: -0.047 * (1 - Math.abs(spread) * 0.4) * size,
        lifeMs: 380,
        s0: 0.8 * size,
        s1: 1.3 * size,
      });
    }
  }

  private chips(x: number, y: number, n: number, tint: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (this.rnd() - 0.5) * 2.2;
      const v = speed * (0.6 + 0.6 * this.rnd());
      this.spawn({
        tex: 'fx.chip',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: GRAVITY,
        lifeMs: 360 + this.rnd() * 160,
        s0: 0.9,
        s1: 0.6,
        spin: (this.rnd() - 0.5) * 0.03,
        tint,
        fadeAt: 0.6,
      });
    }
  }

  private flash(tex: 'fx.spark' | 'fx.zap', x: number, y: number, s0: number, s1: number, lifeMs: number, tint?: number): void {
    this.spawn({ tex, x, y, lifeMs, s0, s1, rot: this.rnd() * Math.PI, spin: 0.002, tint, fadeAt: 0.3 });
  }

  /** Çarpma etkisi: türüne göre toz, kıvılcım, enerji çakması, alan halkası (GDD §14). */
  private impact(kind: ImpactKind, x: number, side: SideId, splashRadius: number | undefined, fromAbove: boolean): void {
    const ground = GROUND_Y - 4;
    const body = GROUND_Y - LAUNCH_HEIGHT_PX + 6;
    switch (kind) {
      case 'light':
        this.dust(x, ground, side, 3, 0.75);
        this.flash('fx.spark', x, body, 0.35, 0.6, 120);
        break;
      case 'spark':
        this.flash('fx.spark', x, body, 0.55, 0.95, 140);
        this.chips(x, body, 2, TINT.brass, 0.18);
        break;
      case 'zap':
        this.flash('fx.zap', x, body, 0.6, 1.3, 220);
        this.chips(x, body, 3, TINT.violet, 0.2);
        break;
      case 'heavy':
        this.dust(x, ground, side, 5, 1);
        this.chips(x, ground - 4, fromAbove ? 4 : 2, TINT.stone, 0.24);
        if (splashRadius !== undefined) this.ring(x, splashRadius, TINT.ringWarm);
        break;
      case 'sand':
        this.chips(x, ground - 4, 8, TINT.orange, 0.26);
        this.spawn({ tex: 'fx.smoke', x, y: ground - 10, vy: -0.02, lifeMs: 520, s0: 1, s1: 2.2, tint: TINT.orange, a0: 0.6, fadeAt: 0.2 });
        if (splashRadius !== undefined) this.ring(x, splashRadius, TINT.ringSand);
        break;
      case 'oil':
        this.chips(x, ground - 4, 5, TINT.oil, 0.22);
        this.flash('fx.spark', x - 10, ground - 8, 0.5, 0.9, 260, TINT.orange);
        this.flash('fx.spark', x + 12, ground - 6, 0.4, 0.8, 300, TINT.orange);
        this.spawn({ tex: 'fx.smoke', x, y: ground - 14, vy: -0.03, lifeMs: 700, s0: 1, s1: 2.4, tint: TINT.oil, a0: 0.5, fadeAt: 0.3 });
        if (splashRadius !== undefined) this.ring(x, splashRadius, TINT.ringOil);
        break;
      case 'plasma':
        this.flash('fx.zap', x, ground - 14, 0.9, 2.1, 300);
        this.chips(x, ground - 8, 4, TINT.violet, 0.24);
        if (splashRadius !== undefined) this.ring(x, splashRadius, TINT.ringPlasma);
        break;
    }
  }
}
