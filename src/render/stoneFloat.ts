import { Container, Text } from 'pixi.js';
import { STONE } from '../data/stone';
import type { SideId } from '../sim/types';
import { fmt, tr } from '../i18n/tr';
import { INK } from '../art/palette';
import { UNIT_FEET_Y } from './constants';

/**
 * Sınır Taşı kazanç işareti: taşın sahibi her saniye gelir aldığında taşın üstünden "+N" yükselir ve söner.
 * Taşın ne işe yaradığı sahnede görünsün diye (insan oyun testi: "Sınır Taşı ne işe yarıyor anlamadım").
 */

/** Taşın tepesinin hemen üstü (dünya birimi; taş gövdesi ≈ 140 birim). */
const START_Y = UNIT_FEET_Y - 22 - 160;
/** Yükselme mesafesi ve ömür. */
const RISE = 60;
const LIFE_MS = 900;
/** Aynı anda en fazla bu kadar işaret (saniyede bir doğar; ömür < 1 sn, normal hızda üst üste binmez). */
const MAX_LIVE = 3;
const FILL: Record<SideId, number> = { 0: 0xffd25a, 1: 0xff9a7a };

interface Pop {
  text: Text;
  ageMs: number;
}

export class StoneFloat {
  readonly container = new Container();
  private readonly live: Pop[] = [];
  private readonly pool: Text[] = [];

  constructor() {
    this.container.position.set(STONE.zoneStart + (STONE.zoneEnd - STONE.zoneStart) / 2, START_Y);
  }

  /** Sahibin bu saniyeki taş altını. */
  pop(side: SideId, gold: number): void {
    if (gold <= 0) return;
    if (this.live.length >= MAX_LIVE) this.release(this.live.shift()!);
    const text =
      this.pool.pop() ??
      new Text({
        text: '',
        style: { fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif', fontSize: 34, fontWeight: '800', fill: FILL[0], stroke: { color: INK, width: 6 } },
      });
    text.text = fmt(tr.hud.stoneFloat, { gold });
    text.style.fill = FILL[side];
    text.anchor.set(0.5, 1);
    text.alpha = 0;
    text.position.set(0, 0);
    this.container.addChild(text);
    this.live.push({ text, ageMs: 0 });
  }

  /** animMs duraklatmada 0'dır: işaretler de donar. */
  update(animMs: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.ageMs += animMs;
      const t = p.ageMs / LIFE_MS;
      if (t >= 1) {
        this.live.splice(i, 1);
        this.release(p);
        continue;
      }
      p.text.y = -RISE * t;
      // Hızlı belirir, son üçte birde söner.
      p.text.alpha = t < 0.15 ? t / 0.15 : t > 0.66 ? (1 - t) / 0.34 : 1;
    }
  }

  clear(): void {
    while (this.live.length > 0) this.release(this.live.pop()!);
  }

  get count(): number {
    return this.live.length;
  }

  private release(p: Pop): void {
    p.text.removeFromParent();
    this.pool.push(p.text);
  }

  destroy(): void {
    this.clear();
    for (const t of this.pool) t.destroy();
    this.pool.length = 0;
    this.container.destroy();
  }
}
