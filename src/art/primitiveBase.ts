import { Container, Sprite, type Texture } from 'pixi.js';
import { clamp01, easeOutCubic } from './anim';
import { buildAtlas, mustTexture, type PartSpec } from './atlas';
import { circle, detail, emblem, eye, lashing, line, rr, shape, soft, stick, stroke, type Ctx, type PathFn } from './paint';
import { INK, MAT, TEAM, type ArtSide, type Tone } from './palette';

/**
 * İlkel Çağ üssü: deri çadır (tipi) + oyma totem + palisat + fildişi kemer + ateş ve duman.
 * Yerel koordinat: (0,0) üs tabanının arka-alt köşesi, x 0…160 üs ayak izi, sağa (düşmana) bakar; y yukarı eksi.
 * Rakip üssü aynı dokunun aynalanmasıdır. Amblem çadırda ve totemin tepesinde.
 */

export const BASE_ART_RESOLUTION = 2;

const EARTH: Tone = { base: 0xa27a4a, shade: 0x7d5a33 };
const SMOKE: Tone = { base: 0xeae3d6, shade: 0xc9bfb0 };

/** Ateş çukurunun yerel konumu (alev ve duman buradan çıkar). */
const FIRE = { x: 14, y: -8 } as const;
const SMOKE_PUFFS = 5;
const SMOKE_LIFE_MS = 2800;
const SMOKE_RISE_PX = 170;
const FLAME_FLICKER_MS = 90;

// ---- Çizim ----

function coneX(y: number, a: number, b: number): number {
  // Çadır kenarı: taban y=-8 → tepe y=-190 arasında doğrusal.
  return a + ((b - a) * (-8 - y)) / 182;
}

function drawTent(c: Ctx, side: ArtSide): void {
  const team = TEAM[side];
  // Sırıklar (tepeden taşar).
  stick(c, [58, -170, 46, -222], 4, MAT.wood);
  stick(c, [78, -170, 90, -220], 4, MAT.wood);
  stick(c, [68, -176, 68, -228], 4, MAT.wood);
  const cone: PathFn = soft([18, -8, 118, -8, 73, -188, 63, -188], 4);
  shape(c, cone, MAT.hide, { shadePath: soft([68, -188, 118, -8, 80, -8], 3) });
  // Deri dikiş çizgileri.
  for (const x of [38, 56, 80, 98]) detail(c, line([68 + (x - 68) * 0.08, -184, x, -10]), MAT.hide.shade, 1.6);
  // Takım rengi bant + dişli süs.
  const y0 = -104;
  const y1 = -130;
  shape(c, soft([coneX(y0, 18, 63), y0, coneX(y0, 118, 73), y0, coneX(y1, 118, 73), y1, coneX(y1, 18, 63), y1], 1.5), team.cloth, { shadeOffset: [3, 3] });
  const teeth: number[] = [];
  const l = coneX(y0, 18, 63);
  const r = coneX(y0, 118, 73);
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const x = l + ((r - l) * i) / n;
    teeth.push(x, y0);
    if (i < n) teeth.push(x + (r - l) / n / 2, y0 + 10);
  }
  teeth.push(r, y0 - 1, l, y0 - 1);
  shape(c, soft(teeth, 1), team.trim, { shadeOffset: [1, 1.5], line: 2.4 });
  // Bant çadır kenarına taşmasın: dış kontur yeniden çizilir.
  stroke(c, cone, 3.5);
  // Kapı ve büyük amblem.
  shape(c, soft([52, -8, 84, -8, 68, -50], 3), INK, { line: 3 });
  shape(c, soft([68, -50, 84, -8, 76, -8, 70, -32], 2), MAT.hide.shade, { line: 2.4 });
  emblem(c, side, 68, -76, 15, 3.2);
}

function totemFace(c: Ctx, side: ArtSide, cx: number, top: number, h: number, mood: 0 | 1 | 2): void {
  const team = TEAM[side];
  shape(c, rr(cx - 16, top, 32, h, 7), MAT.wood, { shadeOffset: [4, 3] });
  const ey = top + h * 0.36;
  // Kaşlar.
  stroke(c, line(mood === 0 ? [cx - 11, ey - 9, cx - 2, ey - 5] : [cx - 11, ey - 7, cx - 3, ey - 9]), 3.4, INK);
  stroke(c, line(mood === 0 ? [cx + 11, ey - 9, cx + 2, ey - 5] : [cx + 11, ey - 7, cx + 3, ey - 9]), 3.4, INK);
  // Takım renkli göz boyası.
  shape(c, circle(cx - 7, ey, 4.6), team.trim, { line: 2.4, shadeOffset: [1, 1] });
  shape(c, circle(cx + 7, ey, 4.6), team.trim, { line: 2.4, shadeOffset: [1, 1] });
  eye(c, cx - 6.5, ey, 1.9);
  eye(c, cx + 7.5, ey, 1.9);
  shape(c, soft([cx - 3, ey + 2, cx + 3, ey + 2, cx + 4.5, ey + 10, cx - 4.5, ey + 10], 2), MAT.wood, { line: 2.2 });
  const my = top + h * 0.78;
  if (mood === 0) {
    shape(c, rr(cx - 10, my - 4, 20, 8, 3), INK, { line: 0 });
    for (let i = 0; i < 4; i++) shape(c, rr(cx - 9 + i * 4.7, my - 4, 3.6, 4, 1), MAT.bone, { line: 0 });
  } else if (mood === 1) {
    shape(c, circle(cx, my, 5), INK, { line: 2 });
  } else {
    shape(c, soft([cx - 11, my - 4, cx + 11, my - 4, cx, my + 5], 3), INK, { line: 0 });
    shape(c, soft([cx - 8, my - 4, cx + 8, my - 4, cx, my - 1], 1), MAT.bone, { line: 0 });
  }
  detail(c, line([cx - 15, top + h - 1, cx + 15, top + h - 1]), MAT.wood.shade, 2);
}

function drawTotem(c: Ctx, side: ArtSide): void {
  const team = TEAM[side];
  const cx = 138;
  // Kanatlar (takım rengi).
  const wing: PathFn = soft([cx - 6, -176, cx - 38, -196, cx - 33, -186, cx - 40, -180, cx - 30, -174, cx - 34, -166, cx - 6, -162], 2.5);
  const wingR: PathFn = soft([cx + 6, -176, cx + 38, -196, cx + 33, -186, cx + 40, -180, cx + 30, -174, cx + 34, -166, cx + 6, -162], 2.5);
  stick(c, [cx, 2, cx, -20], 22, MAT.wood);
  shape(c, wing, team.cloth, { shadeOffset: [2, 3] });
  shape(c, wingR, team.cloth, { shadeOffset: [2, 3] });
  totemFace(c, side, cx, -58, 50, 0);
  totemFace(c, side, cx, -110, 52, 1);
  totemFace(c, side, cx, -162, 52, 2);
  // Tepe: amblem levhası.
  stick(c, [cx, -164, cx, -186], 6, MAT.wood);
  shape(c, circle(cx, -204, 19), MAT.wood, { shadeOffset: [3, 3] });
  emblem(c, side, cx, -204, 12.5, 3);
}

function stake(c: Ctx, x: number, h: number, w: number, tip: Tone | null): void {
  const top = -h;
  shape(c, soft([x - w / 2, 0, x + w / 2, 0, x + w / 2, top + 9, x, top, x - w / 2, top + 9], 2), MAT.wood, { shadeOffset: [2.5, 2] });
  if (tip !== null) {
    shape(c, soft([x - w / 2 + 0.5, top + 9.5, x, top + 1, x + w / 2 - 0.5, top + 9.5, x + w / 2 - 0.5, top + 14, x - w / 2 + 0.5, top + 14], 1.5), tip, { line: 2.2 });
  }
}

function drawPalisade(c: Ctx, side: ArtSide, from: number, to: number, seed: number): void {
  const w = 11;
  let i = 0;
  for (let x = from; x <= to; x += w - 1, i++) {
    const h = 44 + (((i + seed) * 37) % 13);
    stake(c, x, h, w, i % 3 === 1 ? TEAM[side].trim : null);
  }
  // Bağ halatı.
  stick(c, [from - 6, -20, to + 6, -18], 2.4, MAT.rope);
  for (let x = from; x <= to; x += (w - 1) * 2) lashing(c, x, -24, 5, 8, MAT.rope, 1);
}

function tusk(c: Ctx, x0: number, x1: number, peak: number): void {
  const path: PathFn = (p) => {
    p.moveTo(x0, 0);
    p.quadraticCurveTo(x0, peak * 0.9, x1, peak);
  };
  stroke(c, path, 13, INK);
  stroke(c, path, 7.5, MAT.bone.base);
  c.save();
  c.translate(1.5, 1.5);
  stroke(c, path, 2.5, MAT.bone.shade);
  c.restore();
}

function drawFirePit(c: Ctx): void {
  stick(c, [FIRE.x - 12, FIRE.y + 3, FIRE.x + 10, FIRE.y - 3], 4, MAT.wood);
  stick(c, [FIRE.x - 10, FIRE.y - 3, FIRE.x + 12, FIRE.y + 3], 4, MAT.wood);
  for (const dx of [-15, -8, 0, 8, 15]) shape(c, circle(FIRE.x + dx, FIRE.y + 5, 4.2), MAT.stone, { line: 2.2, shadeOffset: [1, 1] });
}

function drawBase(side: ArtSide) {
  return (c: Ctx): void => {
    shape(c, soft([-10, 6, 172, 6, 166, -6, 120, -11, 40, -12, -4, -6], 6), EARTH, { line: 0, shadeOffset: [0, -4] });
    drawTent(c, side);
    drawTotem(c, side);
    drawPalisade(c, side, 26, 50, 0);
    drawPalisade(c, side, 92, 164, 2);
    tusk(c, 49, 66, -66);
    tusk(c, 91, 74, -66);
    stick(c, [64, -66, 76, -66], 3, MAT.rope);
    drawFirePit(c);
  };
}

function flameDraw(c: Ctx): void {
  shape(c, soft([-7, 0, 7, 0, 5, -10, 1, -22, -2, -13, -5, -16], 3.5), MAT.flame, { line: 2.2, shadePath: soft([-7, 0, 7, 0, 5, -10, 0, -6], 2) });
  shape(c, soft([-3, -1, 3, -1, 1, -9, -1, -7], 1.5), 0xfff6d0, { line: 0 });
}

function smokeDraw(c: Ctx): void {
  const puff: PathFn = (p) => {
    p.arc(-5, 1, 8, 0, Math.PI * 2);
    p.moveTo(14, 0);
    p.arc(5, -1, 9, 0, Math.PI * 2);
    p.moveTo(9, -8);
    p.arc(0, -7, 8, 0, Math.PI * 2);
  };
  shape(c, puff, SMOKE, { line: 0, shadeOffset: [2, -3] });
}

function baseParts(): PartSpec[] {
  const parts: PartSpec[] = [
    { name: 'flame', x0: -8, y0: -23, x1: 8, y1: 1, draw: flameDraw },
    { name: 'smoke', x0: -14, y0: -16, x1: 15, y1: 10, draw: smokeDraw },
  ];
  for (const side of [0, 1] as const) {
    const draw = drawBase(side);
    parts.push({ name: `base.${side}`, x0: -12, y0: -232, x1: 180, y1: 7, draw });
    parts.push({ name: `base.flash.${side}`, x0: -12, y0: -232, x1: 180, y1: 7, draw, silhouette: true });
  }
  return parts;
}

let baseAtlas: Map<string, Texture> | null = null;

function textures(): Map<string, Texture> {
  baseAtlas ??= buildAtlas('art.base.primitive', baseParts(), BASE_ART_RESOLUTION, 1024);
  return baseAtlas;
}

interface Puff {
  sprite: Sprite;
  offsetMs: number;
}

/** Üs görünümü: sabit doku + titreyen alev + yükselen duman + vuruş silueti. Kök sağa bakar. */
export class BaseRig {
  readonly root = new Container();
  readonly flash: Sprite;
  private readonly flame: Sprite;
  private readonly puffs: Puff[] = [];
  private clockMs = 0;

  constructor(side: ArtSide) {
    const map = textures();
    const tex = (n: string): Texture => mustTexture(map, n);
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const s = new Sprite(tex('smoke'));
      this.root.addChild(s);
      this.puffs.push({ sprite: s, offsetMs: (i * SMOKE_LIFE_MS) / SMOKE_PUFFS });
    }
    this.root.addChild(new Sprite(tex(`base.${side}`)));
    this.flame = new Sprite(tex('flame'));
    this.flame.position.set(FIRE.x, FIRE.y + 2);
    this.root.addChild(this.flame);
    this.flash = new Sprite(tex(`base.flash.${side}`));
    this.flash.alpha = 0;
    this.root.addChild(this.flash);
  }

  update(animMs: number): void {
    this.clockMs += animMs;
    const t = this.clockMs;
    const step = Math.floor(t / FLAME_FLICKER_MS);
    const flick = ((step * 7919) % 13) / 13;
    this.flame.scale.set(0.9 + flick * 0.25, 0.85 + ((step * 104729) % 11) / 11 * 0.45);
    this.flame.skew.x = (flick - 0.5) * 0.25;
    for (const p of this.puffs) {
      const k = ((t + p.offsetMs) % SMOKE_LIFE_MS) / SMOKE_LIFE_MS;
      const e = easeOutCubic(k);
      p.sprite.position.set(FIRE.x - 2 - e * 26 + Math.sin(k * 6 + p.offsetMs) * 4, FIRE.y - 18 - k * SMOKE_RISE_PX);
      p.sprite.scale.set(0.45 + k * 1.1);
      p.sprite.alpha = clamp01(k * 6) * (1 - k) * 0.85;
    }
  }
}
