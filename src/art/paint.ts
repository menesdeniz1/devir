import { EMBLEM_FILL, INK, INK_THIN, INK_WIDTH, type ArtSide, type Tone } from './palette';

/**
 * "Kesik kâğıt / çıkartma" boyama yardımcıları (Canvas 2D). Yalnız açılışta, dokuya pişirme sırasında çalışır.
 * Her şekil: düz ton → şeklin içine kırpılmış gölge hilali → kalın koyu kontur (yuvarlak birleşim).
 */

export type Ctx = CanvasRenderingContext2D;
export type PathFn = (ctx: Ctx) => void;

export function css(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export interface ShapeOptions {
  /**
   * Gölge hilali: düz ton bu kadar yukarı-geri kaydırılarak çizilir, kalan şerit gölge olur.
   * Varsayılan [2.5, 3.5]. `null`: gölge yok.
   */
  shadeOffset?: readonly [number, number] | null;
  /** Gölge için özel yol (şeklin içine kırpılır); verilirse hilal yerine kullanılır. */
  shadePath?: PathFn;
  /** Kontur kalınlığı; 0 ise kontur yok. */
  line?: number;
}

const DEFAULT_SHADE: readonly [number, number] = [2.5, 3.5];

/** İki tonlu, konturlu şekil. */
export function shape(ctx: Ctx, path: PathFn, tone: Tone | number, opts: ShapeOptions = {}): void {
  const base = typeof tone === 'number' ? tone : tone.base;
  const shade = typeof tone === 'number' ? undefined : tone.shade;
  const offset = opts.shadeOffset === undefined ? DEFAULT_SHADE : opts.shadeOffset;
  const line = opts.line ?? INK_WIDTH;

  ctx.save();
  ctx.beginPath();
  path(ctx);
  if (shade !== undefined && (offset !== null || opts.shadePath)) {
    ctx.clip();
    ctx.fillStyle = css(base);
    ctx.fill();
    ctx.fillStyle = css(shade);
    if (opts.shadePath) {
      ctx.beginPath();
      opts.shadePath(ctx);
      ctx.fill();
    } else if (offset !== null) {
      // Önce tümü gölge, sonra kaydırılmış düz ton: alt-ön kenarda gölge hilali kalır.
      ctx.fill();
      ctx.translate(-offset[0], -offset[1]);
      ctx.beginPath();
      path(ctx);
      ctx.fillStyle = css(base);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = css(base);
    ctx.fill();
  }
  ctx.restore();

  if (line > 0) stroke(ctx, path, line);
}

/** Yalnız kontur. */
export function stroke(ctx: Ctx, path: PathFn, width = INK_WIDTH, color = INK): void {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.lineWidth = width;
  ctx.strokeStyle = css(color);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/** Konturlu kalın çizgi (sap, sopa): önce mürekkep, üstüne renk. */
export function stick(ctx: Ctx, pts: readonly number[], width: number, tone: Tone, ink = INK_WIDTH): void {
  const path: PathFn = (c) => {
    c.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  };
  stroke(ctx, path, width + ink * 2, INK);
  stroke(ctx, path, width, tone.base);
  // Alt kenarda ince gölge şeridi.
  ctx.save();
  ctx.translate(0, width * 0.28);
  stroke(ctx, path, width * 0.4, tone.shade);
  ctx.restore();
}

/** İnce iç çizgi (dikiş, halka, çatlak). */
export function detail(ctx: Ctx, path: PathFn, color = INK, width = INK_THIN): void {
  stroke(ctx, path, width, color);
}

// ---- Yol yardımcıları ----

export function rr(x: number, y: number, w: number, h: number, r: number): PathFn {
  return (c) => c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function circle(cx: number, cy: number, r: number): PathFn {
  return (c) => c.arc(cx, cy, r, 0, Math.PI * 2);
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): PathFn {
  return (c) => c.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
}

/** Köşeleri yuvarlatılmış çokgen (yumuşak köşeler). pts: [x0,y0,x1,y1,...]. */
export function soft(pts: readonly number[], r = 3): PathFn {
  return (c) => {
    const n = pts.length / 2;
    const px = (i: number): number => pts[((i + n) % n) * 2]!;
    const py = (i: number): number => pts[((i + n) % n) * 2 + 1]!;
    c.moveTo((px(-1) + px(0)) / 2, (py(-1) + py(0)) / 2);
    for (let i = 0; i < n; i++) c.arcTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2, r);
    c.closePath();
  };
}

export function line(pts: readonly number[]): PathFn {
  return (c) => {
    c.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  };
}

// ---- Ortak motifler ----

/** Takım amblemi: oyuncu daire, rakip elmas (GDD §14). Krem dolgu, koyu kontur. */
export function emblem(ctx: Ctx, side: ArtSide, cx: number, cy: number, r: number, lineWidth = 2.5): void {
  const path: PathFn =
    side === 0 ? circle(cx, cy, r) : soft([cx, cy - r * 1.3, cx + r * 1.08, cy, cx, cy + r * 1.3, cx - r * 1.08, cy], r * 0.18);
  shape(ctx, path, EMBLEM_FILL, { line: lineWidth });
}

/** Göz: koyu nokta + küçük parıltı. */
export function eye(ctx: Ctx, x: number, y: number, r: number): void {
  shape(ctx, circle(x, y, r), INK, { line: 0 });
  shape(ctx, circle(x + r * 0.35, y - r * 0.35, r * 0.38), 0xffffff, { line: 0 });
}

/** Halat sargısı: birkaç kısa çapraz çizgi. */
export function lashing(ctx: Ctx, x: number, y: number, w: number, h: number, tone: Tone, turns = 3): void {
  for (let i = 0; i < turns; i++) {
    const yy = y + (h * (i + 0.5)) / turns;
    const path = line([x - w / 2, yy - 1.2, x + w / 2, yy + 1.2]);
    stroke(ctx, path, 4.4, INK);
    stroke(ctx, path, 2.2, tone.base);
  }
}
