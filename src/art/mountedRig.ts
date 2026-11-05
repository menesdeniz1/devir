import { Container, Sprite } from 'pixi.js';
import { attackPhase, clamp01, easeOutBounce, hitJolt, lerp, walkPhase, type UnitAnimInput, type UnitRig } from './anim';
import { setSpriteTexture } from './atlas';
import { MOUNT_JOINTS } from './mountedParts';
import { BACK_LIMB_TINT, type ArtSide } from './palette';
import type { TextureLookup } from './primitiveRigs';

/**
 * Atlı Okçu iskeleti (Antik Çağ menzilli). At yürür/tırıs gider (çapraz bacak çiftleri), binici yayı öne uzatır;
 * saldırı hazırlığında kiriş gerilir (iki kemikli çekme kolu kirişi izler), atışta ok bırakılır, yenisi takılır.
 * Kök sağa bakar; ayak tabanı (0,0). Bakış yönü dışarıdan scale.x ile verilir.
 */

const M = MOUNT_JOINTS;

const MOUNT = {
  stride: 44,
  legSwing: 0.5,
  bob: 2.2,
  /** Yay kolunun dünya açısı (radyan; -π/2 tam ileri, eksi yukarı). */
  bowArm: -Math.PI / 2 - 0.1,
  strikeMs: 40,
  recoverMs: 300,
  windupShare: 0.55,
  /** Ok bırakıldıktan sonra yenisi bu sürede takılır. */
  reloadMs: 420,
  reloadFadeMs: 110,
  /** Bu gerginliğin üstünde yay "gerili" dokusuyla çizilir. */
  drawnAt: 0.45,
  recoilRad: 0.07,
  sparkMs: 150,
} as const;

function sprite(tex: TextureLookup, name: string, parent: Container, x = 0, y = 0): Sprite {
  const s = new Sprite(tex(name));
  s.position.set(x, y);
  parent.addChild(s);
  return s;
}

export class MountedRig implements UnitRig {
  readonly root = new Container();
  readonly hpBarY = -92;
  readonly hpBarW = 46;
  readonly footprint = 32;
  readonly launch: { x: number; y: number };
  private readonly tex: TextureLookup;
  private readonly body = new Container();
  private readonly horse = new Container();
  private readonly rider = new Container();
  private readonly legs: Sprite[] = [];
  private readonly tail: Sprite;
  private readonly bowArm: Sprite;
  private readonly upper: Sprite;
  private readonly fore: Sprite;
  private readonly bow: Sprite;
  private readonly arrow: Sprite;
  private readonly spark: Sprite;
  private readonly shoulder = { x: M.frontShoulder.x, y: M.frontShoulder.y };
  private bowDrawn = false;

  constructor(tex: TextureLookup, side: ArtSide) {
    this.tex = tex;
    const shadow = sprite(tex, 'shadow', this.root, 2, 0);
    shadow.scale.set(this.footprint / 20, 1.1);
    this.root.addChild(this.body);
    this.body.scale.set(M.scale);

    // At: uzak bacaklar (gölgeli) → kuyruk → gövde → yakın bacaklar.
    this.body.addChild(this.horse);
    const legAt = (x: number, far: boolean): Sprite => {
      const s = sprite(tex, 'mount.leg', this.horse, x + (far ? M.farLegDx : 0), M.legTopY);
      if (far) s.tint = BACK_LIMB_TINT;
      this.legs.push(s);
      return s;
    };
    legAt(M.frontLegX, true);
    legAt(M.backLegX, true);
    this.tail = sprite(tex, 'mount.tail', this.horse, M.tail.x, M.tail.y);
    sprite(tex, `mount.horse.${side}`, this.horse);
    legAt(M.frontLegX, false);
    legAt(M.backLegX, false);

    // Binici: yay kolu (uzak, gölgeli) → bacak → gövde → baş → ok → yay → çekme kolu.
    this.body.addChild(this.rider);
    this.rider.position.set(M.seat.x, M.seat.y);
    this.bowArm = sprite(tex, 'mount.bowArm', this.rider, M.frontShoulder.x, M.frontShoulder.y);
    this.bowArm.tint = BACK_LIMB_TINT;
    this.bowArm.rotation = MOUNT.bowArm;
    sprite(tex, 'mount.riderLeg', this.rider, 0, -1);
    sprite(tex, `ranged.torso.${side}`, this.rider);
    sprite(tex, `ranged.head.${side}`, this.rider, M.neck.x, M.neck.y);
    this.arrow = sprite(tex, 'mount.arrow', this.rider);
    this.bow = sprite(tex, 'mount.bow', this.rider);
    this.upper = sprite(tex, 'mount.upperArm', this.rider, this.shoulder.x, this.shoulder.y);
    this.fore = sprite(tex, 'mount.forearm', this.rider);
    this.spark = sprite(tex, 'spark', this.rider);
    this.spark.visible = false;

    const grip = this.gripPoint();
    const tipX = grip.x + M.stringDrawn + M.arrowLen;
    this.launch = { x: Math.round((M.seat.x + tipX) * M.scale), y: Math.round((M.seat.y + grip.y) * M.scale) };
  }

  /** Yayın sap noktası (binici yereli): omuz + kol yönünde el. */
  private gripPoint(): { x: number; y: number } {
    const a = MOUNT.bowArm;
    return { x: M.frontShoulder.x - Math.sin(a) * M.hand.y, y: M.frontShoulder.y + Math.cos(a) * M.hand.y };
  }

  pose(i: UnitAnimInput): void {
    const wb = i.walkBlend;
    const ph = walkPhase(i.walkDist, MOUNT.stride);
    const s = Math.sin(ph);
    // Çapraz çiftler: yakın-ön ile uzak-arka aynı evrede.
    const [farF, farB, nearF, nearB] = this.legs as [Sprite, Sprite, Sprite, Sprite];
    nearF.rotation = MOUNT.legSwing * s * wb;
    farB.rotation = MOUNT.legSwing * s * wb * 0.9;
    farF.rotation = -MOUNT.legSwing * s * wb;
    nearB.rotation = -MOUNT.legSwing * s * wb * 0.9;
    const bob = Math.abs(Math.sin(ph)) * MOUNT.bob * wb;
    const breathe = (1 - wb) * Math.sin(i.timeMs / 700) * 0.5;
    const jolt = hitJolt(i.sinceHitMs, 150);
    this.horse.y = -bob + breathe;
    this.horse.rotation = 0.025 * Math.sin(ph * 2) * wb;
    this.horse.x = -jolt * 3;
    this.tail.rotation = 0.18 * Math.sin(ph + 1) * wb + 0.06 * Math.sin(i.timeMs / 520);

    // Kiriş gerginliği: hazırlıkta artar, atışta bırakılır.
    const ap = attackPhase(i, MOUNT.strikeMs, MOUNT.recoverMs, MOUNT.windupShare);
    const t = i.sinceAttackMs;
    const fired = Number.isFinite(t);
    const release = fired && t < MOUNT.strikeMs ? 1 - t / MOUNT.strikeMs : 0;
    const draw = Math.max(ap.windup, release);
    const recoil = fired ? Math.exp(-t / 160) * (t < 30 ? t / 30 : 1) : 0;

    this.rider.position.set(M.seat.x + this.horse.x, M.seat.y - bob * 0.8 + breathe);
    this.rider.rotation = 0.05 * s * wb * 0.4 - MOUNT.recoilRad * recoil - jolt * 0.1 - 0.03 * draw;

    const grip = this.gripPoint();
    this.bow.position.set(grip.x - recoil * 1.5, grip.y);
    const drawn = draw > MOUNT.drawnAt;
    if (drawn !== this.bowDrawn) {
      this.bowDrawn = drawn;
      setSpriteTexture(this.bow, this.tex(drawn ? 'mount.bowDrawn' : 'mount.bow'));
    }
    this.bow.scale.x = 1 + (fired && t < 160 ? 0.06 * Math.sin((t / 160) * Math.PI * 3) * (1 - t / 160) : 0);
    const stringX = this.bow.x + lerp(M.stringRest, M.stringDrawn, drawn ? 1 : draw / MOUNT.drawnAt * 0.3);
    this.arrow.position.set(stringX, grip.y);
    if (fired && t < MOUNT.reloadMs) {
      this.arrow.visible = false;
    } else {
      this.arrow.visible = true;
      this.arrow.alpha = fired && t < MOUNT.reloadMs + MOUNT.reloadFadeMs ? clamp01((t - MOUNT.reloadMs) / MOUNT.reloadFadeMs) : 1;
    }
    this.poseDrawArm(stringX, grip.y);

    const k = fired ? t / MOUNT.sparkMs : 1;
    this.spark.visible = k >= 0 && k < 1;
    if (this.spark.visible) {
      this.spark.position.set(this.bow.x + 4, grip.y);
      this.spark.scale.set(0.5 * (0.6 + 0.6 * k));
      this.spark.alpha = 1 - k * k;
    }
  }

  /** İki kemikli çekme kolu: el kirişte; dirsek aşağı-geri kırılır. */
  private poseDrawArm(handX: number, handY: number): void {
    const sx = this.shoulder.x;
    const sy = this.shoulder.y;
    const dx = handX - sx;
    const dy = handY - sy;
    const reach = M.upperLen + M.foreLen;
    const d = Math.max(1, Math.min(reach - 0.01, Math.hypot(dx, dy)));
    const a = Math.atan2(dy, dx);
    // Kosinüs kuralı: omuzdaki açı.
    const cosB = (M.upperLen * M.upperLen + d * d - M.foreLen * M.foreLen) / (2 * M.upperLen * d);
    const b = Math.acos(Math.max(-1, Math.min(1, cosB)));
    // İki çözümden dirseği daha geride ve aşağıda olanı (gerili yayda dirsek geriye, dinlenmede aşağı).
    const score = (e: number): number => Math.cos(e) - 1.5 * Math.sin(e);
    const ea = score(a + b) <= score(a - b) ? a + b : a - b;
    const ex = sx + Math.cos(ea) * M.upperLen;
    const ey = sy + Math.sin(ea) * M.upperLen;
    // Parçalar +y yönünde sarktığı için dönüş = yön açısı − π/2.
    this.upper.position.set(sx, sy);
    this.upper.rotation = ea - Math.PI / 2;
    this.fore.position.set(ex, ey);
    this.fore.rotation = Math.atan2(handY - ey, handX - ex) - Math.PI / 2;
  }

  poseDeath(t: number): void {
    const f = easeOutBounce(clamp01(t / 0.6));
    this.horse.rotation = 0.18 * f;
    this.horse.y = 9 * f;
    const [farF, farB, nearF, nearB] = this.legs as [Sprite, Sprite, Sprite, Sprite];
    nearF.rotation = farF.rotation = lerp(nearF.rotation, -1.2, f);
    nearB.rotation = farB.rotation = lerp(nearB.rotation, 1.1, f);
    this.rider.rotation = -1.35 * f;
    this.rider.position.set(M.seat.x - 12 * f, M.seat.y + 14 * f);
    this.arrow.visible = false;
    this.spark.visible = false;
  }
}
