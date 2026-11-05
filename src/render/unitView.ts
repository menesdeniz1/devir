import { Container, Graphics } from 'pixi.js';
import type { UnitAnimInput, UnitRig } from '../art/anim';
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
  HEAVY_Z_OFFSET,
  HP_NOTCHES,
  UNIT_ART_SCALE,
  UNIT_FEET_Y,
  UNIT_HP_BAR_H,
  WALK_BLEND_PER_MS,
} from './constants';
import { paletteOf } from './scene';

/** Kimliğe göre görsel derinlik kayması (yalnızca çizim). */
export function depthOffset(unitId: number): number {
  return ((unitId % DEPTH_LEVELS) - Math.floor(DEPTH_LEVELS / 2)) * DEPTH_STEP_PX;
}

/** Ölümde solmanın başladığı an (devrilme önce görünsün), süre oranı. */
const DEATH_FADE_START = 0.25;

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

  constructor(unit: UnitState) {
    this.unitId = unit.id;
    this.side = unit.side;
    this.dir = unit.side === 0 ? 1 : -1;
    const def = mustGetUnit(unit.type).def;
    this.maxHp = def.hp;
    this.lastHp = unit.hp;

    this.rig = createUnitRig(unit.type, def.role, unit.side);
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

  /** Canlı birliği günceller: interpolasyonlu konum, animasyonlar, can çubuğu. */
  update(unit: UnitState, x: number, animMs: number): void {
    const a = this.anim;
    a.walkDist += Math.abs(x - this.lastX);
    this.lastX = x;
    a.timeMs += animMs;
    a.sinceAttackMs += animMs;
    a.sinceHitMs += animMs;
    a.engaged = unit.mode === 'attack';
    const target = unit.mode === 'walk' ? 1 : 0;
    const step = animMs * WALK_BLEND_PER_MS;
    a.walkBlend = a.walkBlend < target ? Math.min(target, a.walkBlend + step) : Math.max(target, a.walkBlend - step);
    if (unit.hp < this.lastHp) a.sinceHitMs = 0;
    this.lastHp = unit.hp;

    this.container.x = x;
    this.rig.pose(a);
    this.setHp(unit.hp);
  }

  /** Ölen birlik: devrilir ve solar (son bilinen konumda). */
  updateDying(animMs: number): void {
    this.dyingMs += animMs;
    const t = Math.min(1, this.dyingMs / DEATH_FADE_MS);
    this.rig.poseDeath(t);
    this.container.alpha = t < DEATH_FADE_START ? 1 : 1 - (t - DEATH_FADE_START) / (1 - DEATH_FADE_START);
    this.container.x = this.lastX;
    this.hpBar.visible = false;
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
