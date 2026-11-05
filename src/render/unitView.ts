import { Container, Graphics, Sprite } from 'pixi.js';
import { abilityTexture } from '../art/abilityArt';
import { clamp01, easeOutCubic, TAU, type UnitAnimInput, type UnitRig } from '../art/anim';
import { fxTexture } from '../art/projectileArt';
import { createUnitRig } from '../art/unitArt';
import { mustGetUnit } from '../sim/compile';
import type { SideId, UnitState } from '../sim/types';
import {
  COLOR_HP_BACK,
  COLOR_HP_FILL,
  COLOR_OUTLINE,
  DEATH_FADE_MS,
  DEPTH_LEVELS,
  DEPTH_STEP_PX,
  FREEZE_CRYSTAL_FOOTPRINT,
  FREEZE_GLINT_COLOR,
  FREEZE_GLINT_MS,
  FREEZE_GROW_MS,
  FREEZE_TINT,
  HEAVY_Z_OFFSET,
  HP_NOTCHES,
  STUN_LIFT_PX,
  STUN_ORBIT_RX,
  STUN_ORBIT_RY,
  STUN_PERIOD_MS,
  STUN_STARS,
  STUN_STAR_SCALE,
  UNIT_ART_SCALE,
  UNIT_FEET_Y,
  UNIT_HP_BAR_H,
  WALK_BLEND_PER_MS,
} from './constants';
import { hitFlashAlpha } from './fxMath';
import { paletteOf } from './scene';

/** Kimliğe göre görsel derinlik kayması (yalnızca çizim). */
export function depthOffset(unitId: number): number {
  return ((unitId % DEPTH_LEVELS) - Math.floor(DEPTH_LEVELS / 2)) * DEPTH_STEP_PX;
}

/** Vuruş parlaması halesi: renk ve birliğe göre boyut (ayak izi ve can çubuğu yüksekliği oranı). */
const HIT_HALO_TINT = 0xfff4d8;
const HIT_HALO_W = 2.7;
const HIT_HALO_H = 1.0;
/** Hale dokusunun yarıçapı (src/art/projectileArt.ts `fx.halo`). */
const HALO_TEX_RADIUS = 32;

/** Ölümde solmanın başladığı an (devrilme önce görünsün), süre oranı. */
const DEATH_FADE_START = 0.25;

/**
 * Durum işaretleri (GDD §7): sersemlikte başın üstünde dönen yıldızlar; donmada ayakları saran kristaller
 * ve gövdede parıltılar (birliğin kendisi buz tonuna boyanır). İlk gerektiğinde kurulur (çoğu birlik hiç
 * sersemlemez: sprite maliyeti yalnız etkilenenlerde), sonra gizlenip yeniden kullanılır.
 * Konteyner aynalanmaz: yıldızların dönüşü iki tarafta aynıdır; takım ipucu birliğin kendisinde kalır.
 */
class StatusMarks {
  readonly container = new Container();
  private readonly stars: Sprite[] = [];
  private readonly crystal: Sprite;
  private readonly glints: Sprite[] = [];
  private stunMs = 0;
  private freezeMs = -1;

  constructor(private readonly rig: UnitRig) {
    for (let i = 0; i < STUN_STARS; i++) {
      const s = new Sprite(abilityTexture('status.star'));
      this.stars.push(s);
      this.container.addChild(s);
    }
    this.crystal = new Sprite(abilityTexture('status.crystal'));
    this.container.addChild(this.crystal);
    for (let i = 0; i < 2; i++) {
      const g = new Sprite(abilityTexture('glint'));
      g.tint = FREEZE_GLINT_COLOR;
      this.glints.push(g);
      this.container.addChild(g);
    }
  }

  update(stunned: boolean, frozen: boolean, animMs: number): void {
    const r = this.rig;
    const scale = UNIT_ART_SCALE;
    // Sersemlik: başın (can çubuğu hizasının) üstünde eğik yörüngede dönen yıldızlar; öndeki büyük görünür.
    if (stunned) this.stunMs += animMs;
    else this.stunMs = 0;
    const headY = r.hpBarY * scale - STUN_LIFT_PX;
    this.stars.forEach((s, i) => {
      s.visible = stunned;
      if (!stunned) return;
      const a = (this.stunMs / STUN_PERIOD_MS) * TAU + (i * TAU) / this.stars.length;
      const front = Math.sin(a);
      s.position.set(Math.cos(a) * STUN_ORBIT_RX, headY + front * STUN_ORBIT_RY);
      s.scale.set(STUN_STAR_SCALE * (0.75 + 0.25 * front) * Math.min(1, 0.4 + this.stunMs / 120));
      s.rotation = a * 0.5;
      s.alpha = 0.75 + 0.25 * front;
    });

    // Donma: kristaller ayaktan büyür, parıltılar gövdede yanıp söner (yerel, yumuşak).
    if (frozen) this.freezeMs = this.freezeMs < 0 ? 0 : this.freezeMs + animMs;
    else this.freezeMs = -1;
    this.crystal.visible = frozen;
    for (const g of this.glints) g.visible = frozen;
    if (!frozen) return;
    const grow = easeOutCubic(clamp01(this.freezeMs / FREEZE_GROW_MS));
    const k = (r.footprint * scale) / FREEZE_CRYSTAL_FOOTPRINT;
    this.crystal.position.set(0, 2);
    this.crystal.scale.set(Math.min(2.2, Math.max(0.85, k)) * grow, Math.min(1.35, Math.max(0.85, k)) * grow);
    const spots: ReadonlyArray<readonly [number, number]> = [
      [-0.45, 0.42],
      [0.4, 0.75],
    ];
    this.glints.forEach((g, i) => {
      const [fx, fy] = spots[i]!;
      const p = ((this.freezeMs + i * FREEZE_GLINT_MS * 0.5) % FREEZE_GLINT_MS) / FREEZE_GLINT_MS;
      g.position.set(fx * r.footprint * scale, fy * r.hpBarY * scale);
      g.scale.set(0.75 * Math.max(0, Math.sin(p * Math.PI)) * grow);
      g.rotation = p * 0.6;
    });
  }

  hide(): void {
    this.container.visible = false;
  }
}

/**
 * Bir birliğin görünümü. Simülasyon kimliğine bağlıdır; animasyon durumu yalnız burada tutulur (TDD §6).
 * Çizim `src/art` iskeletindedir (atlas sprite'ları; karede yeniden çizim yok).
 * Takım ayrımı: yön (oyuncu sağa, rakip sola), amblem (daire / elmas), can çubuğu (düz / çentikli), renk.
 */
export class UnitView {
  readonly container = new Container();
  readonly unitId: number;
  readonly side: SideId;
  private readonly dir: 1 | -1;
  private readonly rig: UnitRig;
  private readonly hpBar = new Graphics();
  private readonly maxHp: number;
  private readonly anim: UnitAnimInput;
  private lastHpFraction = 1;
  private lastHp: number;
  private dyingMs = -1;
  private lastX = 0;
  private status: StatusMarks | null = null;
  private frozenTint = false;
  /** Vuruş parlaması: gövdenin arkasında açık hale (takım rengi değişmez). İlk vuruşta kurulur. */
  private halo: Sprite | null = null;
  private sinceHitMs = Infinity;

  constructor(unit: UnitState) {
    this.unitId = unit.id;
    this.side = unit.side;
    this.dir = unit.side === 0 ? 1 : -1;
    const def = mustGetUnit(unit.type).def;
    this.maxHp = def.hp;
    this.lastHp = unit.hp;

    this.rig = createUnitRig(unit.type, def.role, unit.side, def.age);
    this.rig.root.scale.set(this.dir * UNIT_ART_SCALE, UNIT_ART_SCALE);
    this.container.addChild(this.rig.root);
    this.container.addChild(this.hpBar);
    this.hpBar.visible = false;

    this.anim = {
      walkDist: unit.id * 7,
      walkBlend: unit.mode === 'walk' ? 1 : 0,
      sinceAttackMs: Infinity,
      attackIntervalMs: def.attackIntervalSec * 1000,
      engaged: unit.mode === 'attack',
      sinceHitMs: Infinity,
      timeMs: unit.id * 137,
    };

    this.container.y = UNIT_FEET_Y + depthOffset(unit.id);
    this.container.zIndex = this.container.y + (def.role === 'heavy' ? HEAVY_Z_OFFSET : 0);
    this.lastX = unit.x;
    this.container.x = unit.x;
    this.rig.pose(this.anim);
  }

  get dying(): boolean {
    return this.dyingMs >= 0;
  }

  /** Ölüm solması bitti mi (görünüm kaldırılabilir). */
  get finished(): boolean {
    return this.dyingMs >= DEATH_FADE_MS;
  }

  /**
   * İsteğe bağlı kanca: silahın vuruş/atış noktası, dünya koordinatında (mermi çıkışı, yakın dövüş kıvılcımı).
   * Mızrak elden, kaya kovadan çıkar; çizici kullanmazsa davranış değişmez.
   */
  launchPoint(): { x: number; y: number } {
    const l = this.rig.launch;
    return { x: this.container.x + this.dir * l.x * UNIT_ART_SCALE, y: this.container.y + l.y * UNIT_ART_SCALE };
  }

  /** Saldırı olayı (vuruş veya atış anı). */
  startAttack(): void {
    this.anim.sinceAttackMs = 0;
  }

  startDying(): void {
    if (this.dyingMs < 0) this.dyingMs = 0;
  }

  /**
   * Canlı birliği günceller: interpolasyonlu konum, animasyonlar, can çubuğu, durum işaretleri.
   * Sersem/donmuşken (stunTicks > 0) yürüme ve saldırı animasyonu durur (poz donar). Sersemlikte vuruş
   * sarsılması görünür; donmuş birlik heykel gibi kalır. vulnTicks > 0: buz tonu ve kristaller.
   */
  update(unit: UnitState, x: number, animMs: number): void {
    const a = this.anim;
    const held = unit.stunTicks > 0;
    const frozen = unit.vulnTicks > 0;
    const hit = unit.hp < this.lastHp;
    this.lastHp = unit.hp;
    if (!held) {
      a.walkDist += Math.abs(x - this.lastX);
      a.timeMs += animMs;
      a.sinceAttackMs += animMs;
      a.sinceHitMs += animMs;
      a.engaged = unit.mode === 'attack';
      const target = unit.mode === 'walk' ? 1 : 0;
      const step = animMs * WALK_BLEND_PER_MS;
      a.walkBlend = a.walkBlend < target ? Math.min(target, a.walkBlend + step) : Math.max(target, a.walkBlend - step);
      if (hit) a.sinceHitMs = 0;
      this.rig.pose(a);
    } else if (!frozen) {
      a.sinceHitMs = hit ? 0 : a.sinceHitMs + animMs;
      this.rig.pose(a);
    }
    this.sinceHitMs = hit ? 0 : this.sinceHitMs + animMs;
    this.poseHalo();
    this.lastX = x;
    this.container.x = x;
    this.setHp(unit.hp);
    this.setStatus(held && !frozen, frozen, animMs);
  }

  /** Vuruş parlaması (GDD §14): kısa açık hale, gövde çevresinde; birliğin arkasında çizilir. */
  private poseHalo(): void {
    const a = hitFlashAlpha(this.sinceHitMs);
    if (a <= 0) {
      if (this.halo !== null) this.halo.visible = false;
      return;
    }
    if (this.halo === null) {
      const h = new Sprite(fxTexture('fx.halo'));
      h.tint = HIT_HALO_TINT;
      const r = this.rig;
      h.scale.set((r.footprint * HIT_HALO_W * UNIT_ART_SCALE) / (2 * HALO_TEX_RADIUS), (Math.abs(r.hpBarY) * HIT_HALO_H * UNIT_ART_SCALE) / (2 * HALO_TEX_RADIUS));
      h.position.set(0, r.hpBarY * 0.48 * UNIT_ART_SCALE);
      this.halo = h;
      this.container.addChildAt(h, 0);
    }
    this.halo.visible = true;
    this.halo.alpha = a;
  }

  /** Vuruş parlaması görünür mü (test/vitrin). */
  get flashing(): boolean {
    return this.halo?.visible === true;
  }

  private setStatus(stunned: boolean, frozen: boolean, animMs: number): void {
    if (frozen !== this.frozenTint) {
      this.frozenTint = frozen;
      this.rig.root.tint = frozen ? FREEZE_TINT : 0xffffff;
    }
    if (this.status === null) {
      if (!stunned && !frozen) return;
      this.status = new StatusMarks(this.rig);
      // Can çubuğunun altında, iskeletin üstünde.
      this.container.addChildAt(this.status.container, this.container.getChildIndex(this.hpBar));
    }
    this.status.update(stunned, frozen, animMs);
  }

  /** Ölen birlik: devrilir ve solar (son bilinen konumda). */
  updateDying(animMs: number): void {
    this.dyingMs += animMs;
    const t = Math.min(1, this.dyingMs / DEATH_FADE_MS);
    this.rig.poseDeath(t);
    this.container.alpha = t < DEATH_FADE_START ? 1 : 1 - (t - DEATH_FADE_START) / (1 - DEATH_FADE_START);
    this.container.x = this.lastX;
    this.hpBar.visible = false;
    if (this.halo !== null) this.halo.visible = false;
    this.status?.hide();
    if (this.frozenTint) {
      this.frozenTint = false;
      this.rig.root.tint = 0xffffff;
    }
  }

  private setHp(hp: number): void {
    const fraction = Math.max(0, Math.min(1, hp / this.maxHp));
    if (fraction === this.lastHpFraction) return;
    this.lastHpFraction = fraction;
    // Yalnızca hasar alınca görünür.
    this.hpBar.visible = fraction < 1;
    this.drawHpBar(fraction);
  }

  private drawHpBar(fraction: number): void {
    const g = this.hpBar;
    g.clear();
    const w = this.rig.hpBarW * UNIT_ART_SCALE;
    const h = UNIT_HP_BAR_H;
    const x = -w / 2;
    const y = this.rig.hpBarY * UNIT_ART_SCALE;
    g.rect(x, y, w, h).fill(COLOR_HP_BACK);
    const pal = paletteOf(this.side);
    g.rect(x, y, w * fraction, h).fill(this.side === 0 ? COLOR_HP_FILL : pal.accent);
    g.rect(x, y, w, h).stroke({ width: 2, color: COLOR_OUTLINE });
    if (this.side === 1) {
      // Çentikli can çubuğu: rakip.
      for (let i = 1; i <= HP_NOTCHES; i++) {
        const nx = x + (w * i) / (HP_NOTCHES + 1);
        g.moveTo(nx, y - 2).lineTo(nx, y + h + 2).stroke({ width: 2, color: COLOR_OUTLINE });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
