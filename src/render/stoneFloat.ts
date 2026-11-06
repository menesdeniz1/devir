import { Container, Text } from 'pixi.js';
import { STONE } from '../data/stone';
import type { SideId } from '../sim/types';
import { fmt, tr } from '../i18n';
import { INK } from '../art/palette';
import { UNIT_FEET_Y } from './constants';
import { stoneTopWorldY, type StoneView } from './scene';

/**
 * Sınır Taşı kazanç işareti: taşın sahibi her saniye gelir aldığında taşın üstünden "+N" yükselir ve söner.
 * Taşın ne işe yaradığı sahnede görünsün diye (insan oyun testi: "Sınır Taşı ne işe yarıyor anlamadım").
 * Taşın boyu çağa göre değişir (GDD §8): işaret, doğduğu anda gösterilen çağ taşının tepesinin üstünden başlar.
 */

/** İşaretin taban çizgisi ile taş tepesi arası boşluk (dünya birimi). */
export const STONE_FLOAT_GAP = 28;
/** Maden görünümü verilmezse: İlkel madenin tepesinin üstü (taban UNIT_FEET_Y − 22, tepe −108; stoneVariants.ts). */
const DEFAULT_START_Y = UNIT_FEET_Y - 22 - 108 - STONE_FLOAT_GAP;
/** Yükselme mesafesi ve ömür. */
const RISE = 60;
const LIFE_MS = 900;
/** Aynı anda en fazla bu kadar işaret (saniyede bir doğar; ömür < 1 sn, normal hızda üst üste binmez). */
const MAX_LIVE = 3;
const FILL: Record<SideId, number> = { 0: 0xffd25a, 1: 0xff9a7a };
/** Kazan etiketi (GDD §8): taşın tepesinin üstünde durur; işaretler onun üstünden doğar. */
const POT_LABEL_H = 40;
const POT_FILL = 0xffe9a8;

interface Pop {
  text: Text;
  ageMs: number;
  /** Doğduğu andaki başlangıç y'si (dünya). */
  startY: number;
}

export class StoneFloat {
  readonly container = new Container();
  private readonly live: Pop[] = [];
  private readonly pool: Text[] = [];

  private readonly stone: StoneView | undefined;
  private potLabel: Text | null = null;
  private potShown = -1;

  /** `stone`: işaretin başlangıç yüksekliği bu taşın (çağ görünümünün) tepesini izler. */
  constructor(stone?: StoneView) {
    this.stone = stone;
    this.container.position.set(STONE.zoneStart + (STONE.zoneEnd - STONE.zoneStart) / 2, 0);
  }

  /** Yeni işaretin taban çizgisinin dünya y'si (taş tepesinin STONE_FLOAT_GAP üstü). */
  get startY(): number {
    const base = this.baseY;
    return this.potLabel !== null && this.potLabel.visible ? base - POT_LABEL_H : base;
  }

  /** Taş tepesinin STONE_FLOAT_GAP üstü (kazan etiketinin taban çizgisi). */
  private get baseY(): number {
    return this.stone === undefined ? DEFAULT_START_Y : stoneTopWorldY(this.stone) - STONE_FLOAT_GAP;
  }

  /** Taştaki kazanın altını; 0 ise etiket gizlenir. Metin yalnız değer değişince yeniden yazılır. */
  setPot(gold: number): void {
    if (gold === this.potShown) return;
    this.potShown = gold;
    if (gold <= 0) {
      if (this.potLabel !== null) this.potLabel.visible = false;
      return;
    }
    if (this.potLabel === null) {
      this.potLabel = new Text({
        text: '',
        style: { fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif', fontSize: 28, fontWeight: '800', fill: POT_FILL, stroke: { color: INK, width: 6 } },
      });
      this.potLabel.anchor.set(0.5, 1);
      this.container.addChild(this.potLabel);
    }
    this.potLabel.text = fmt(tr.hud.stonePotLabel, { gold });
    this.potLabel.visible = true;
    this.potLabel.y = this.baseY;
  }

  get potText(): string | null {
    return this.potLabel !== null && this.potLabel.visible ? this.potLabel.text : null;
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
    const startY = this.startY;
    text.position.set(0, startY);
    this.container.addChild(text);
    this.live.push({ text, ageMs: 0, startY });
  }

  /** animMs duraklatmada 0'dır: işaretler de donar. */
  update(animMs: number): void {
    // Taş çağla boy değiştirir (ve Gelecek taşı süzülür): etiket tepeyi izler.
    if (this.potLabel !== null && this.potLabel.visible) this.potLabel.y = this.baseY;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.ageMs += animMs;
      const t = p.ageMs / LIFE_MS;
      if (t >= 1) {
        this.live.splice(i, 1);
        this.release(p);
        continue;
      }
      p.text.y = p.startY - RISE * t;
      // Hızlı belirir, son üçte birde söner.
      p.text.alpha = t < 0.15 ? t / 0.15 : t > 0.66 ? (1 - t) / 0.34 : 1;
    }
  }

  clear(): void {
    while (this.live.length > 0) this.release(this.live.pop()!);
    this.setPot(0);
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
    this.potLabel?.destroy();
    this.potLabel = null;
    this.pool.length = 0;
    this.container.destroy();
  }
}
