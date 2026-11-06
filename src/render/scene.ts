import { Container, Graphics } from 'pixi.js';
import { createAgeBackground } from './background';
import { BaseRig } from '../art/baseRig';
import { StoneRig } from '../art/stoneArt';
import { prewarmTowerArt } from '../art/towerRig';
import { artAge, prewarmUnitArt } from '../art/unitArt';
import type { ArtAge } from '../art/palette';
import { STONE } from '../data/stone';
import { baseDamageLevel } from './fxMath';
import { WORLD } from '../data/world';
import type { SideId, StoneState } from '../sim/types';
import {
  BASE_BOTTOM_Y,
  BASE_FLASH_ALPHA,
  BASE_FLASH_MS,
  COLOR_EMBLEM,
  COLOR_OUTLINE,
  PALETTE_ENEMY,
  PALETTE_PLAYER,
  UNIT_FEET_Y,
  type TeamPalette,
} from './constants';

export function paletteOf(side: SideId): TeamPalette {
  return side === 0 ? PALETTE_PLAYER : PALETTE_ENEMY;
}

/** Takım amblemi: oyuncu daire, rakip elmas. (cx, cy) merkez, r yarıçap. */
export function drawEmblem(g: Graphics, side: SideId, cx: number, cy: number, r: number, color: number = COLOR_EMBLEM): void {
  if (side === 0) {
    g.circle(cx, cy, r);
  } else {
    g.poly([cx, cy - r * 1.25, cx + r * 1.05, cy, cx, cy + r * 1.25, cx - r * 1.05, cy]);
  }
  g.fill(color).stroke({ width: 2, color: COLOR_OUTLINE });
}

// ---- Arka plan (GDD §14 çağ kimlikleri; çizim src/render/background.ts) ----

/** Bir çağın sabit arka planı (vitrin ve testler için); oyunda `BackgroundView` çağ geçişini yönetir. */
export function createBackground(age = 1): Container {
  return createAgeBackground(artAge(age));
}

// ---- Üsler ----

export interface BaseView {
  container: Container;
  /** Kalan parlama süresi (ms). */
  flashMs: number;
  /** Vuruş parlaması (üssün beyaz silueti). */
  flash: Container;
  /** Çizim iskeleti (duman, alev). */
  rig: BaseRig;
}

/** İlkel Çağ üssü (çadır, totem, palisat, ateş). Oyuncu solda sağa bakar; rakip sağda, aynalanmış. */
export function createBaseView(side: SideId): BaseView {
  // Birlik atlası da sahne kurulurken pişirilsin (ilk doğumda takılma olmasın).
  prewarmUnitArt();
  prewarmTowerArt(1);
  const rig = new BaseRig(side);
  const container = new Container();
  container.addChild(rig.root);
  if (side === 0) {
    container.x = 0;
  } else {
    container.x = WORLD.worldWidth;
    container.scale.x = -1;
  }
  container.y = BASE_BOTTOM_Y;
  return { container, flashMs: 0, flash: rig.flash, rig };
}

/** Üs görünümünü bir kare ilerletir: vuruş parlaması, alev ve duman. */
export function updateBaseFlash(view: BaseView, animMs: number): void {
  if (view.flashMs > 0) view.flashMs = Math.max(0, view.flashMs - animMs);
  view.flash.alpha = (view.flashMs / BASE_FLASH_MS) * BASE_FLASH_ALPHA;
  view.rig.update(animMs);
}

export function triggerBaseFlash(view: BaseView): void {
  view.flashMs = BASE_FLASH_MS;
}

/** Üs hasar katmanı (GDD §14: çatlaklar %75 / %50 / %25): renderer her kare can oranını verir. */
export function setBaseDamage(view: BaseView, hpFraction: number): void {
  view.rig.setDamage(baseDamageLevel(hpFraction));
}

// ---- Aşama 3 sözleşmesi (lead): renderer bunları çağırır ----

/**
 * Üssü sahibinin çağına göre giydirir (1..5). Aynı çağ için tekrar çağrılırsa bir şey yapmaz (her kare
 * çağrılabilir). Çağ değişince 1 sn'lik yeniden inşa + ışık dalgası oynar ve o çağın birlik atlası
 * şimdi pişirilir (ilk birlik doğarken takılma olmasın; geçiş animasyonu bunu örter).
 */
export function setBaseAge(view: BaseView, age: number, animate = true): void {
  const a = artAge(age);
  // Yeni maçta yuvalar da animasyonsuz (kurulum/satış efekti oynamadan) yeni duruma geçer.
  if (!animate) view.rig.snapTowers();
  if (a === view.rig.currentAge) return;
  prewarmUnitArt(a);
  prewarmTowerArt(a);
  // Yeni maçta (yeniden oyna) çağ geri döner; o zaman yeniden inşa animasyonu oynatılmaz.
  view.rig.setAge(a, animate);
}

// ---- Aşama 4 sözleşmesi (lead): kuleler. Renderer çağırır; art sahibi uygular. ----

/**
 * Yuvayı çizer: kilitli yuva işareti (unlocked=false), boş yuva (towerType=null) veya kurulu kule (TowerDef.id).
 * Renderer her kare çağırabilir; değişmediyse bir şey yapmaz. Animasyonlar updateBaseFlash içinde ilerler.
 * Değişim algılanır: kurulumda belirme, satışta sökülme, kilit açılınca kapağın fırlaması.
 */
export function setTowerSlot(view: BaseView, slot: number, towerType: string | null, unlocked: boolean): void {
  view.rig.setTowerSlot(slot, towerType, unlocked);
}

/** Kulenin atış animasyonunu tetikler ('towerFired' olayında). */
export function triggerTowerFire(view: BaseView, slot: number): void {
  view.rig.fireTower(slot);
}

/** Kule mermisinin sahne koordinatındaki çıkış noktası (mermi görseli buradan başlar). */
export function towerLaunchPoint(view: BaseView, slot: number): { x: number; y: number } {
  const p = view.rig.towerLaunch(slot);
  const c = view.container;
  return { x: c.x + c.scale.x * p.x, y: c.y + c.scale.y * p.y };
}

/** Koridorun ortasındaki Sınır Taşı görünümü. Kapsayıcı dünya koordinatındadır (arka plan ile birlikler arası katman). */
export interface StoneView {
  container: Container;
  rig: StoneRig;
}

/** Taşın tabanı yürüme yolunun arka kenarına yakın durur; birlikler önünden geçer. */
const STONE_FOOT_Y = UNIT_FEET_Y - 22;
const PATH_TOP_Y = UNIT_FEET_Y - 34;
const PATH_BOTTOM_Y = UNIT_FEET_Y + 26;

/** `age`: savaş alanının (oyuncunun) çizim çağı; taş bu çağın görünümüyle geçişsiz başlar. */
export function createStoneView(age: ArtAge = 1): StoneView {
  const half = (STONE.zoneEnd - STONE.zoneStart) / 2;
  const rig = new StoneRig({ halfWidth: half, pathTop: PATH_TOP_Y - STONE_FOOT_Y, pathBottom: PATH_BOTTOM_Y - STONE_FOOT_Y }, { age });
  rig.root.position.set(STONE.zoneStart + half, STONE_FOOT_Y);
  rig.update(0, null, STONE.counterMax, 0);
  return { container: rig.root, rig };
}

/**
 * Taş savaş alanının çağını izler (arka planla aynı: oyuncunun çağı, GDD §8/§14). Her karede çağrılabilir: çağ
 * değişmedikçe hiçbir şey yapmaz. `animate` false (yeni maç) ise geçişsiz atlar.
 */
export function setStoneAge(view: StoneView, age: ArtAge, animate = true): void {
  view.rig.setAge(age, animate);
}

/** Taş tepesinin dünya y'si (hedef çağın görünümü); kazanç işareti bunun üstünden doğar. */
export function stoneTopWorldY(view: StoneView): number {
  return view.container.y + view.container.scale.y * view.rig.topY;
}

/** Taşı durumuna göre çizer: sahibin amblemi/rengi ve ele geçirme ilerlemesi (counter / counterMax). */
export function updateStoneView(view: StoneView, stone: StoneState, animMs: number): void {
  view.rig.update(stone.counter, stone.owner, STONE.counterMax, animMs);
}
