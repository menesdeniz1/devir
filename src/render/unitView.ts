import { Container, Graphics } from 'pixi.js';
import { mustGetUnit } from '../sim/compile';
import type { SideId, UnitState } from '../sim/types';
import {
  ATTACK_ANIM_MS,
  ATTACK_LUNGE_PX,
  ATTACK_SWING_RAD,
  COLOR_EMBLEM,
  COLOR_HP_BACK,
  COLOR_HP_FILL,
  COLOR_OUTLINE,
  COLOR_SKIN,
  COLOR_STONE,
  COLOR_WOOD,
  DEATH_FADE_MS,
  DEATH_SINK_PX,
  DEPTH_LEVELS,
  DEPTH_STEP_PX,
  HP_NOTCHES,
  ROLE_SCALE,
  UNIT_BODY_H,
  UNIT_BODY_W,
  UNIT_FEET_Y,
  UNIT_HEAD_R,
  UNIT_HP_BAR_H,
  UNIT_HP_BAR_W,
  UNIT_HP_BAR_Y,
  UNIT_LINE_WIDTH,
  WALK_BOB_PERIOD_MS,
  WALK_BOB_PX,
} from './constants';
import { drawEmblem, paletteOf } from './scene';

/** Kimliğe göre görsel derinlik kayması (yalnızca çizim). */
export function depthOffset(unitId: number): number {
  return ((unitId % DEPTH_LEVELS) - Math.floor(DEPTH_LEVELS / 2)) * DEPTH_STEP_PX;
}

/**
 * Bir birliğin görünümü. Simülasyon kimliğine bağlıdır; animasyon durumu yalnız burada tutulur (TDD §6).
 * Yönlenme: oyuncu sağa, rakip sola bakar. Gövdede amblem (daire / elmas). Can çubuğu: oyuncu düz, rakip çentikli.
 */
export class UnitView {
  readonly container = new Container();
  readonly unitId: number;
  readonly side: SideId;
  private readonly dir: 1 | -1;
  private readonly body = new Container();
  private readonly weapon = new Container();
  private readonly hpBar = new Graphics();
  private readonly maxHp: number;
  private lastHpFraction = 1;
  private attackMs = 0;
  private animClockMs = 0;
  private dyingMs = -1;
  private lastX = 0;

  constructor(unit: UnitState) {
    this.unitId = unit.id;
    this.side = unit.side;
    this.dir = unit.side === 0 ? 1 : -1;
    const def = mustGetUnit(unit.type).def;
    this.maxHp = def.hp;
    const pal = paletteOf(unit.side);
    const dir = this.dir;
    const line = { width: UNIT_LINE_WIDTH, color: COLOR_OUTLINE };

    // Bacaklar.
    const legs = new Graphics();
    legs.roundRect(-9, -8, 7, 8, 2).fill(pal.dark).stroke(line);
    legs.roundRect(2, -8, 7, 8, 2).fill(pal.dark).stroke(line);
    this.body.addChild(legs);

    // Gövde + gölge yarısı.
    const torso = new Graphics();
    const top = -8 - UNIT_BODY_H;
    torso.roundRect(-UNIT_BODY_W / 2, top, UNIT_BODY_W, UNIT_BODY_H, 6).fill(pal.main).stroke(line);
    torso.rect(dir === 1 ? -UNIT_BODY_W / 2 + 2 : 1, top + 3, UNIT_BODY_W / 2 - 3, UNIT_BODY_H - 6).fill({ color: pal.dark, alpha: 0.5 });
    // Gövde amblemi.
    drawEmblem(torso, unit.side, 0, top + UNIT_BODY_H / 2, 5.5, COLOR_EMBLEM);
    this.body.addChild(torso);

    // Baş (bakış yönüne kaymış) + göz.
    const head = new Graphics();
    const headY = top - UNIT_HEAD_R + 3;
    head.circle(dir * 2, headY, UNIT_HEAD_R).fill(COLOR_SKIN).stroke(line);
    head.circle(dir * 6, headY - 1, 1.8).fill(COLOR_OUTLINE);
    // Saç bandı: takım rengi.
    head.rect(dir * 2 - UNIT_HEAD_R + 1, headY - 6, UNIT_HEAD_R * 2 - 2, 4).fill(pal.accent);
    this.body.addChild(head);

    // Kalkan: önde, bakış yönünde.
    const shield = new Graphics();
    shield.roundRect(dir === 1 ? 8 : -17, top + 2, 9, 22, 4).fill(pal.accent).stroke(line);
    this.body.addChild(shield);

    // Silah (balta): kolun ucunda, sallanır.
    const axe = new Graphics();
    axe.moveTo(0, 0).lineTo(dir * 22, -16).stroke({ width: 5, color: COLOR_WOOD });
    axe.circle(dir * 24, -18, 7).fill(COLOR_STONE).stroke(line);
    this.weapon.addChild(axe);
    this.weapon.x = dir * 8;
    this.weapon.y = top + 16;
    this.body.addChild(this.weapon);

    this.container.addChild(this.body);
    this.container.addChild(this.hpBar);
    this.hpBar.visible = false;
    this.container.scale.set(ROLE_SCALE[def.role] ?? 1);
    this.container.y = UNIT_FEET_Y + depthOffset(unit.id);
    this.container.zIndex = this.container.y;
    this.lastX = unit.x;
    this.container.x = unit.x;
  }

  get dying(): boolean {
    return this.dyingMs >= 0;
  }

  /** Ölüm solması bitti mi (görünüm kaldırılabilir). */
  get finished(): boolean {
    return this.dyingMs >= DEATH_FADE_MS;
  }

  startAttack(): void {
    this.attackMs = ATTACK_ANIM_MS;
  }

  startDying(): void {
    if (this.dyingMs < 0) this.dyingMs = 0;
  }

  /** Canlı birliği günceller: interpolasyonlu konum, animasyonlar, can çubuğu. */
  update(unit: UnitState, x: number, animMs: number): void {
    this.animClockMs += animMs;
    this.lastX = x;
    this.attackMs = Math.max(0, this.attackMs - animMs);
    const lungeT = this.attackMs > 0 ? 1 - this.attackMs / ATTACK_ANIM_MS : 0;
    const lunge = this.attackMs > 0 ? Math.sin(Math.PI * lungeT) : 0;
    const bob = unit.mode === 'walk' ? Math.abs(Math.sin((this.animClockMs / WALK_BOB_PERIOD_MS) * Math.PI)) * WALK_BOB_PX : 0;
    this.container.x = x;
    this.body.x = this.dir * ATTACK_LUNGE_PX * lunge;
    this.body.y = -bob;
    this.weapon.rotation = this.dir * ATTACK_SWING_RAD * lunge;
    this.setHp(unit.hp);
  }

  /** Ölen birliği solar (son bilinen konumda). */
  updateDying(animMs: number): void {
    this.dyingMs += animMs;
    const t = Math.min(1, this.dyingMs / DEATH_FADE_MS);
    this.container.alpha = 1 - t;
    this.body.y = DEATH_SINK_PX * t;
    this.body.x = 0;
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
    const w = UNIT_HP_BAR_W;
    const h = UNIT_HP_BAR_H;
    const x = -w / 2;
    const y = UNIT_HP_BAR_Y;
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
