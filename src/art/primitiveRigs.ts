import { Container, Sprite, type Texture } from 'pixi.js';
import {
  attackPhase,
  clamp01,
  dampedWobble,
  easeInOut,
  easeInQuad,
  easeOutBounce,
  easeOutCubic,
  hitJolt,
  lerp,
  walkPhase,
  type UnitAnimInput,
  type UnitRig,
} from './anim';
import { BACK_LIMB_TINT, type ArtSide } from './palette';
import { FRONT_JOINTS, HEAVY_JOINTS, RANGED_JOINTS } from './primitiveParts';

/**
 * İlkel Çağ iskeletleri: parça sprite'ları eklem noktalarına yerleştirilir ve her karede yalnız dönüşümleri
 * (konum/açı/ölçek/görünürlük) güncellenir. Açılar radyan; kollar "aşağı sarkan" çizilir, açı 0 = aşağı,
 * artan açı saat yönünde (sağa bakan birlikte: aşağı → geri → yukarı → ileri).
 */

export type TextureLookup = (name: string) => Texture;

function sprite(tex: TextureLookup, name: string, parent: Container, x = 0, y = 0): Sprite {
  const s = new Sprite(tex(name));
  s.position.set(x, y);
  parent.addChild(s);
  return s;
}

/** (x,y) noktasını açıyla döndürür (Pixi ekran yönü). */
function rotate(x: number, y: number, a: number): { x: number; y: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

function shadow(tex: TextureLookup, root: Container, halfWidth: number, x = 0): Sprite {
  const s = sprite(tex, 'shadow', root, x, 0);
  s.scale.set(halfWidth / 20, 1);
  return s;
}

// ---- Zamanlama (ms) ----
const SPARK_MS = 170;

/** Kıvılcım: vuruş anında kısa parlama. */
function poseSpark(spark: Sprite, sinceMs: number, startMs: number, x: number, y: number, size: number): void {
  const t = sinceMs - startMs;
  if (!(t >= 0 && t < SPARK_MS)) {
    spark.visible = false;
    return;
  }
  const k = t / SPARK_MS;
  spark.visible = true;
  spark.position.set(x, y);
  spark.scale.set(size * (0.55 + 0.6 * k));
  spark.alpha = 1 - k * k;
  spark.rotation = k * 0.7;
}

// =====================================================================
// Taşbaltacı — geniş gövde, önde büyük kalkan, omuzda taş balta.
// =====================================================================

const FRONT = {
  stride: 28,
  legSwing: 0.5,
  bob: 2.2,
  carry: 2.36,
  raised: 2.95,
  impact: 5.05,
  strikeMs: 80,
  recoverMs: 280,
  windupShare: 0.45,
  lunge: 5,
  sparkAtMs: 50,
} as const;

export class FrontRig implements UnitRig {
  readonly root = new Container();
  readonly hpBarY = -84;
  readonly hpBarW = 38;
  readonly footprint = 19;
  readonly launch = { x: 28, y: -20 };
  private readonly body = new Container();
  private readonly upper = new Container();
  private readonly legB: Sprite;
  private readonly legF: Sprite;
  private readonly arm: Sprite;
  private readonly head: Sprite;
  private readonly shield: Sprite;
  private readonly spark: Sprite;
  private armAngle: number = FRONT.carry;

  constructor(tex: TextureLookup, side: ArtSide) {
    const J = FRONT_JOINTS;
    shadow(tex, this.root, this.footprint);
    this.root.addChild(this.body);
    this.body.pivot.x = -8;
    this.legB = sprite(tex, 'front.leg', this.body, -J.legX, J.hipY);
    this.legB.tint = BACK_LIMB_TINT;
    this.legF = sprite(tex, 'front.leg', this.body, J.legX, J.hipY);
    this.body.addChild(this.upper);
    this.arm = sprite(tex, 'front.axeArm', this.upper, J.shoulder.x, J.shoulder.y);
    sprite(tex, `front.torso.${side}`, this.upper);
    this.head = sprite(tex, `front.head.${side}`, this.upper, J.neck.x, J.neck.y);
    this.shield = sprite(tex, `front.shield.${side}`, this.upper, J.shield.x, J.shield.y);
    this.spark = sprite(tex, 'spark', this.upper);
    this.spark.visible = false;
  }

  pose(i: UnitAnimInput): void {
    const J = FRONT_JOINTS;
    const ph = walkPhase(i.walkDist, FRONT.stride);
    const s = Math.sin(ph);
    const wb = i.walkBlend;
    this.legB.rotation = -FRONT.legSwing * s * wb;
    this.legF.rotation = FRONT.legSwing * s * wb;
    const bob = Math.abs(Math.cos(ph)) * FRONT.bob * wb;
    const breathe = (1 - wb) * Math.sin(i.timeMs / 520) * 0.7;

    const ap = attackPhase(i, FRONT.strikeMs, FRONT.recoverMs, FRONT.windupShare);
    const lunge = ap.strike < 1 ? easeOutCubic(ap.strike) : 1 - easeOutCubic(ap.recover);
    const jolt = hitJolt(i.sinceHitMs, 150);
    this.body.x = -8 + lunge * FRONT.lunge - jolt * 3;
    this.body.rotation = 0;
    this.body.y = 0;
    this.upper.y = J.hipY - bob + breathe;
    this.upper.rotation = 0.05 * s * wb + lunge * 0.16 - jolt * 0.1 - ap.windup * 0.07;
    this.head.rotation = -this.upper.rotation * 0.4;

    let th: number;
    if (ap.strike < 1) th = lerp(FRONT.raised, FRONT.impact, easeInQuad(ap.strike));
    else th = lerp(lerp(FRONT.impact, FRONT.carry, easeOutCubic(ap.recover)), FRONT.raised, ap.windup);
    th += 0.1 * s * wb;
    this.armAngle = th;
    this.arm.rotation = th;

    this.shield.x = J.shield.x + lunge * 2.5;
    this.shield.y = J.shield.y + 0.8 * s * wb;
    this.shield.rotation = -lunge * 0.1;

    const tip = rotate(J.axeTip.x, J.axeTip.y, FRONT.impact);
    poseSpark(this.spark, i.sinceAttackMs, FRONT.sparkAtMs, J.shoulder.x + tip.x, J.shoulder.y + tip.y, 0.9);
  }

  poseDeath(t: number): void {
    const f = easeOutBounce(clamp01(t / 0.55));
    this.body.rotation = -1.42 * f;
    this.body.x = -8 - 4 * f;
    this.legB.rotation = lerp(this.legB.rotation, 0.25, f);
    this.legF.rotation = lerp(this.legF.rotation, -0.15, f);
    this.arm.rotation = lerp(this.armAngle, 1.3, f);
    this.spark.visible = false;
  }
}

// =====================================================================
// Mızrak Savuran — ince gövde, öne eğik, atlatl ile omuz üstünde uzun mızrak; sırtta demet.
// =====================================================================

const RANGED = {
  stride: 30,
  legSwing: 0.55,
  bob: 2,
  ready: 2.62,
  back: 2.25,
  follow: 4.9,
  spearReady: -0.14,
  spearBack: -0.32,
  aim: 4.45,
  strikeMs: 90,
  recoverMs: 360,
  windupShare: 0.4,
  /** Mızrak elden çıktıktan sonra yenisi bu sürede kavranır. */
  releaseMs: 25,
  reloadMs: 450,
  reloadFadeMs: 120,
} as const;

export class RangedRig implements UnitRig {
  readonly root = new Container();
  readonly hpBarY = -82;
  readonly hpBarW = 34;
  readonly footprint = 15;
  readonly launch = { x: 15, y: -57 };
  private readonly body = new Container();
  private readonly upper = new Container();
  private readonly legB: Sprite;
  private readonly legF: Sprite;
  private readonly throwArm = new Container();
  private readonly spear: Sprite;
  private readonly head: Sprite;
  private readonly frontArm: Sprite;
  private readonly spark: Sprite;
  private armAngle: number = RANGED.ready;

  constructor(tex: TextureLookup, side: ArtSide) {
    const J = RANGED_JOINTS;
    shadow(tex, this.root, this.footprint);
    this.root.addChild(this.body);
    this.body.pivot.x = -6;
    this.legB = sprite(tex, 'ranged.leg', this.body, -J.legX, J.hipY);
    this.legB.tint = BACK_LIMB_TINT;
    this.legF = sprite(tex, 'ranged.leg', this.body, J.legX, J.hipY);
    this.body.addChild(this.upper);
    // Nişan kolu uzak tarafta (gövdenin arkasında); atış kolu gövdenin önünde, başın arkasından mızrağı yukarıda tutar.
    this.frontArm = sprite(tex, 'ranged.armFront', this.upper, J.backShoulder.x, J.backShoulder.y);
    this.frontArm.tint = BACK_LIMB_TINT;
    sprite(tex, `ranged.torso.${side}`, this.upper);
    this.upper.addChild(this.throwArm);
    this.throwArm.position.set(J.frontShoulder.x, J.frontShoulder.y);
    this.spear = sprite(tex, 'ranged.spear', this.throwArm, J.hand.x, J.hand.y);
    sprite(tex, 'ranged.armThrow', this.throwArm);
    this.head = sprite(tex, `ranged.head.${side}`, this.upper, J.neck.x, J.neck.y);
    this.spark = sprite(tex, 'spark', this.upper);
    this.spark.visible = false;
  }

  pose(i: UnitAnimInput): void {
    const J = RANGED_JOINTS;
    const ph = walkPhase(i.walkDist, RANGED.stride);
    const s = Math.sin(ph);
    const wb = i.walkBlend;
    this.legB.rotation = -RANGED.legSwing * s * wb;
    this.legF.rotation = RANGED.legSwing * s * wb;
    const bob = Math.abs(Math.cos(ph)) * RANGED.bob * wb;
    const breathe = (1 - wb) * Math.sin(i.timeMs / 480) * 0.6;

    const ap = attackPhase(i, RANGED.strikeMs, RANGED.recoverMs, RANGED.windupShare);
    const throwK = ap.strike < 1 ? easeInQuad(ap.strike) : 1 - easeOutCubic(ap.recover);
    const jolt = hitJolt(i.sinceHitMs, 150);
    this.body.x = -6 + throwK * 2.5 - jolt * 3;
    this.body.rotation = 0;
    this.upper.y = J.hipY - bob + breathe;
    this.upper.rotation = J.lean + 0.14 * throwK - 0.07 * ap.windup + 0.04 * s * wb - jolt * 0.12;
    this.head.rotation = -0.55 * this.upper.rotation + 0.08;

    let th: number;
    if (ap.strike < 1) th = lerp(RANGED.back, RANGED.follow, easeInQuad(ap.strike));
    else th = lerp(lerp(RANGED.follow, RANGED.ready, easeOutCubic(ap.recover)), RANGED.back, ap.windup);
    th += 0.06 * s * wb;
    this.armAngle = th;
    this.throwArm.rotation = th;
    // Mızrak gövde çerçevesinde ileri-yukarı bakar.
    this.spear.rotation = lerp(RANGED.spearReady, RANGED.spearBack, ap.windup) - th;
    const t = i.sinceAttackMs;
    if (Number.isFinite(t) && t >= RANGED.releaseMs && t < RANGED.reloadMs) {
      this.spear.visible = false;
    } else {
      this.spear.visible = true;
      this.spear.alpha = Number.isFinite(t) && t < RANGED.reloadMs + RANGED.reloadFadeMs ? clamp01((t - RANGED.reloadMs) / RANGED.reloadFadeMs) : 1;
    }
    this.frontArm.rotation = lerp(RANGED.aim, 3.55, throwK * 0.85) + 0.22 * s * wb;

    const hand = rotate(J.hand.x, J.hand.y, th);
    poseSpark(this.spark, t, RANGED.releaseMs, J.frontShoulder.x + hand.x, J.frontShoulder.y + hand.y, 0.55);
  }

  poseDeath(t: number): void {
    const f = easeOutBounce(clamp01(t / 0.55));
    this.body.rotation = -1.4 * f;
    this.body.x = -6 - 4 * f;
    this.throwArm.rotation = lerp(this.armAngle, 1.0, f);
    this.legB.rotation = lerp(this.legB.rotation, 0.3, f);
    this.legF.rotation = lerp(this.legF.rotation, -0.1, f);
    this.spark.visible = false;
  }
}

// =====================================================================
// Kaya Kaldıracı — kütük tekerlekli araba, çatallı direkte kaldıraç kirişi (kova + karşı ağırlık),
// önde takım renkli deri siper; arkada iten küçük figür.
// =====================================================================

const HEAVY = {
  rest: -0.55,
  pull: -0.74,
  fire: 2.2,
  swingMs: 120,
  holdMs: 700,
  returnMs: 1000,
  /** Kayanın kovaya yeniden konduğu an. */
  reloadMs: 1750,
  popMs: 160,
  windupShare: 0.3,
  recoilPx: 7,
  pusherStride: 24,
} as const;

export class HeavyRig implements UnitRig {
  readonly root = new Container();
  readonly hpBarY = -100;
  readonly hpBarW = 52;
  readonly footprint = 50;
  readonly launch = { x: 45, y: -95 };
  private readonly body = new Container();
  private readonly pusher = new Container();
  private readonly pLegB: Sprite;
  private readonly pLegF: Sprite;
  private readonly pBody: Sprite;
  private readonly cart = new Container();
  private readonly beam = new Container();
  private readonly rock: Sprite;
  private readonly wheelB: Sprite;
  private readonly wheelF: Sprite;
  private readonly spark: Sprite;
  private beamAngle: number = HEAVY.rest;

  constructor(tex: TextureLookup, side: ArtSide) {
    const J = HEAVY_JOINTS;
    shadow(tex, this.root, this.footprint, -6);
    this.root.addChild(this.body);

    // İten figür (arabanın arkasında, onun altında çizilir).
    this.body.addChild(this.pusher);
    this.pusher.pivot.x = -4;
    this.pusher.x = J.pusherX - 4;
    this.pLegB = sprite(tex, 'ranged.leg', this.pusher, -3, J.pusherHipY);
    this.pLegB.tint = BACK_LIMB_TINT;
    this.pLegB.scale.set(J.pusherLegScale);
    this.pLegF = sprite(tex, 'ranged.leg', this.pusher, 3, J.pusherHipY);
    this.pLegF.scale.set(J.pusherLegScale);
    this.pBody = sprite(tex, `heavy.pusher.${side}`, this.pusher, 0, J.pusherHipY);

    // Araba: arka tekerlek ekseni etrafında eğilir (geri tepme).
    this.body.addChild(this.cart);
    this.cart.pivot.set(J.wheelBack.x, J.wheelBack.y);
    this.cart.position.set(J.cartX + J.wheelBack.x, J.wheelBack.y);
    sprite(tex, `heavy.chassis.${side}`, this.cart);
    this.cart.addChild(this.beam);
    this.beam.position.set(J.pivot.x, J.pivot.y);
    sprite(tex, 'heavy.beam', this.beam);
    this.rock = sprite(tex, 'heavy.rock', this.beam, J.rock.x, J.rock.y);
    this.wheelB = sprite(tex, 'heavy.wheel', this.cart, J.wheelBack.x, J.wheelBack.y);
    this.wheelF = sprite(tex, 'heavy.wheel', this.cart, J.wheelFront.x, J.wheelFront.y);
    this.spark = sprite(tex, 'spark', this.cart);
    this.spark.visible = false;
  }

  pose(i: UnitAnimInput): void {
    const J = HEAVY_JOINTS;
    const wb = i.walkBlend;
    const t = i.sinceAttackMs;
    const fired = Number.isFinite(t);
    // Geri tepme: hızlı geri itiş, yavaş sönüm.
    const k = !fired ? 0 : t < 60 ? t / 60 : Math.exp(-(t - 60) / 200);
    const jolt = hitJolt(i.sinceHitMs, 150);
    this.body.x = -HEAVY.recoilPx * k - jolt * 2;
    this.body.rotation = 0;

    const roll = (i.walkDist - HEAVY.recoilPx * k) / J.wheelR;
    this.wheelB.rotation = roll;
    this.wheelF.rotation = roll;
    this.cart.y = J.wheelBack.y - Math.abs(Math.sin(roll * 1.5)) * 0.9 * wb;
    this.cart.rotation = -0.07 * k + 0.012 * Math.sin(roll * 2) * wb;

    const ap = attackPhase(i, HEAVY.swingMs, HEAVY.reloadMs, HEAVY.windupShare);
    let th: number;
    if (!fired) th = HEAVY.rest;
    else if (t < HEAVY.swingMs) th = lerp(HEAVY.pull, HEAVY.fire, easeInQuad(t / HEAVY.swingMs));
    else if (t < HEAVY.holdMs) th = HEAVY.fire + 0.16 * dampedWobble(t - HEAVY.swingMs, 300, 180);
    else th = lerp(HEAVY.fire, HEAVY.rest, easeInOut(clamp01((t - HEAVY.holdMs) / HEAVY.returnMs)));
    th = lerp(th, HEAVY.pull, ap.windup) + 0.01 * Math.sin(i.timeMs / 700);
    this.beamAngle = th;
    this.beam.rotation = th;

    const reloading = fired && t < HEAVY.reloadMs;
    this.rock.visible = !reloading;
    const pop = fired && t >= HEAVY.reloadMs ? clamp01((t - HEAVY.reloadMs) / HEAVY.popMs) : 1;
    this.rock.scale.set(0.4 + 0.6 * easeOutCubic(pop));

    // İten figür.
    const ph = walkPhase(i.walkDist, HEAVY.pusherStride);
    const s = Math.sin(ph);
    this.pLegB.rotation = -0.5 * s * wb;
    this.pLegF.rotation = 0.5 * s * wb;
    this.pBody.y = J.pusherHipY - Math.abs(Math.cos(ph)) * 1.6 * wb;
    this.pBody.rotation = 0.05 * s * wb - 0.16 * k;
    this.pusher.rotation = 0;

    const bucket = rotate(J.rock.x, J.rock.y, th);
    poseSpark(this.spark, t, 0, J.pivot.x + bucket.x, J.pivot.y + bucket.y, 1.1);
  }

  poseDeath(t: number): void {
    const f = easeOutBounce(clamp01(t / 0.6));
    this.cart.rotation = 0.22 * f;
    this.beam.rotation = lerp(this.beamAngle, -0.95, f);
    this.pusher.rotation = -1.35 * f;
    this.rock.visible = false;
    this.spark.visible = false;
  }
}
