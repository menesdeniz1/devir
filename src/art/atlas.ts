import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import type { Ctx } from './paint';

/**
 * Parça dokusu atlası (TDD §6). Her parça açılışta bir kez Canvas 2D ile çizilir ve tek bir dokuda toplanır;
 * birlikler yalnızca sprite'larla kurulur (karede yeniden çizim yok, aynı kaynak → aynı toplu çizim).
 * Parça yerel koordinatlarda çizilir: (0,0) eksen noktasıdır (eklem/pivot); sprite anchor'ı buna ayarlanır.
 * İleride aynı adlarla dışarıdan bir sprite sayfası verilerek değiştirilebilir.
 */

export interface PartSpec {
  name: string;
  /** Yerel sınır kutusu (konturu içermesi yeter; kenar payı otomatik eklenir). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  draw: (ctx: Ctx) => void;
  /** Çizimi beyaz siluete çevir (vuruş parlaması için). */
  silhouette?: boolean;
}

/** Kontur taşmasını karşılayan kenar payı (mantıksal px). */
const MARGIN = 3;
/** Parçalar arası boşluk: mipmap seviyelerinde komşu taşmasını önler. */
const GAP = 4;
const MAX_ATLAS_PX = 4096;

function nextPow2(v: number): number {
  let p = 1;
  while (p < v) p *= 2;
  return p;
}

interface Slot {
  spec: PartSpec;
  x: number;
  y: number;
  w: number;
  h: number;
  bx0: number;
  by0: number;
}

/**
 * Parçaları raf yöntemiyle paketler ve dokuları döndürür.
 * resolution: mantıksal px başına doku pikseli (yakınlaştırmada keskinlik; küçültmede mipmap).
 */
export function buildAtlas(label: string, parts: readonly PartSpec[], resolution: number, widthLogical = 1024): Map<string, Texture> {
  const slots: Slot[] = parts.map((spec) => {
    const bx0 = Math.floor(spec.x0 - MARGIN);
    const by0 = Math.floor(spec.y0 - MARGIN);
    const w = Math.ceil(spec.x1 + MARGIN) - bx0;
    const h = Math.ceil(spec.y1 + MARGIN) - by0;
    return { spec, x: 0, y: 0, w, h, bx0, by0 };
  });
  const order = [...slots].sort((a, b) => b.h - a.h);
  let cx = GAP;
  let cy = GAP;
  let shelfH = 0;
  for (const s of order) {
    if (s.w + GAP * 2 > widthLogical) throw new Error(`Parça atlasa sığmıyor: ${s.spec.name}`);
    if (cx + s.w + GAP > widthLogical) {
      cx = GAP;
      cy += shelfH + GAP;
      shelfH = 0;
    }
    s.x = cx;
    s.y = cy;
    cx += s.w + GAP;
    shelfH = Math.max(shelfH, s.h);
  }
  const pxW = nextPow2(widthLogical * resolution);
  const pxH = nextPow2((cy + shelfH + GAP) * resolution);
  if (pxW > MAX_ATLAS_PX || pxH > MAX_ATLAS_PX) throw new Error(`Atlas çok büyük: ${label} ${pxW}×${pxH}`);

  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D bağlamı alınamadı');

  let scratch: HTMLCanvasElement | null = null;
  for (const s of slots) {
    if (s.spec.silhouette) {
      // Siluet: ayrı tuvalde çiz, beyaza boya, atlasa kopyala (source-in tüm tuvali etkilediği için).
      scratch ??= document.createElement('canvas');
      scratch.width = Math.ceil(s.w * resolution);
      scratch.height = Math.ceil(s.h * resolution);
      const sc = scratch.getContext('2d')!;
      sc.setTransform(resolution, 0, 0, resolution, -s.bx0 * resolution, -s.by0 * resolution);
      s.spec.draw(sc);
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalCompositeOperation = 'source-in';
      sc.fillStyle = '#ffffff';
      sc.fillRect(0, 0, scratch.width, scratch.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(scratch, s.x * resolution, s.y * resolution);
      continue;
    }
    ctx.save();
    ctx.setTransform(resolution, 0, 0, resolution, (s.x - s.bx0) * resolution, (s.y - s.by0) * resolution);
    ctx.beginPath();
    ctx.rect(s.bx0, s.by0, s.w, s.h);
    ctx.clip();
    s.spec.draw(ctx);
    ctx.restore();
  }

  const source = new CanvasSource({
    resource: canvas,
    resolution,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
    label,
  });
  const textures = new Map<string, Texture>();
  for (const s of slots) {
    textures.set(
      s.spec.name,
      new Texture({
        source,
        frame: new Rectangle(s.x, s.y, s.w, s.h),
        defaultAnchor: { x: -s.bx0 / s.w, y: -s.by0 / s.h },
        label: s.spec.name,
      }),
    );
  }
  return textures;
}

export function mustTexture(map: ReadonlyMap<string, Texture>, name: string): Texture {
  const t = map.get(name);
  if (t === undefined) throw new Error(`Parça dokusu yok: ${name}`);
  return t;
}
