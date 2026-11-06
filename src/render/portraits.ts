import { Container, Sprite } from 'pixi.js';
import { abilityTexture, BOAR_RIG } from '../art/abilityArt';
import type { UnitAnimInput } from '../art/anim';
import { TowerSlot, towerInfo } from '../art/towerRig';
import { createUnitRig } from '../art/unitArt';
import { getAge, getUnit } from '../sim/compile';

/**
 * Arayüz portreleri (GDD §11): birliklerin durma pozu, kulelerin kurulu hâli ve yetenek simgesi, oyunun kendi
 * `src/art` iskeletlerinden küçük, saydam zeminli resimlere çizilir. Oyuncu tarafının renkleriyle, sağa bakar.
 *
 * Maliyet: portre, sprite'ların atlas kaynak tuvalinden Canvas 2D ile çizilir (Pixi çizimi / GPU piksel okuması yok) ve
 * PNG'ye kodlanır: GPU'lu tarayıcıda portre başına ≈ 1–5 ms; bir çağın atlası henüz pişmediyse o çağın ilk portresi
 * atlası da pişirir (oyun bunu o çağın ilk birliği doğarken zaten öderdi). İlk çağınkiler açılışta (`drain`), sonrakiler
 * tembel ve sıralı üretilir: `get` hazır değilse işi kuyruğa alır ve null döner; `pump` (çizicinin her karesinde) kare
 * başına bir süre bütçesi içinde iş bitirir. Arayüz hazır olana kadar yer tutucuyu gösterir.
 */

export type PortraitKind = 'unit' | 'tower' | 'ability';

/** Portre yüksekliği (mantıksal px): arayüzdeki en büyük kullanım (kule menüsü) ≈ 48 CSS px. */
export const PORTRAIT_SIZE = 64;
/**
 * Geniş figürler (uzun tüfek, mancınık): en çok bu en/boy oranına kadar sığdırılır (daha genişse küçülür), sonra en
 * çok `PORTRAIT_MAX_ASPECT` genişlikte sağdan kırpılır (silah ucu çerçeveden taşar gibi; gövde solda tam kalır).
 */
export const PORTRAIT_FIT_ASPECT = 2;
export const PORTRAIT_MAX_ASPECT = 1.5;
/** Doku pikseli / mantıksal px: yüksek yoğunluklu ekranlarda da keskin kalsın. */
export const PORTRAIT_RESOLUTION = 2;
/** Kare başına portre üretimine ayrılan süre (ms). En az bir iş her karede biter. */
export const PORTRAIT_BUDGET_MS = 4;

export type PortraitGenerator = (kind: PortraitKind, id: string) => string;

export interface PortraitStats {
  /** Üretilen portre sayısı ve toplam / en uzun üretim süresi (ms; atlas pişirme dahil). */
  generated: number;
  failed: number;
  totalMs: number;
  maxMs: number;
  /** Kuyrukta bekleyen iş. */
  pending: number;
}

const keyOf = (kind: PortraitKind, id: string): string => `${kind}:${id}`;

/** Önbellek ve iş kuyruğu (Pixi'siz; üretici dışarıdan verilir, birim testlenebilir). */
export class PortraitCache {
  private readonly ready = new Map<string, string>();
  private readonly failed = new Set<string>();
  private readonly queue: Array<{ kind: PortraitKind; id: string; key: string }> = [];
  private readonly queued = new Set<string>();
  private readonly counters = { generated: 0, failed: 0, totalMs: 0, maxMs: 0 };

  constructor(
    private readonly generate: PortraitGenerator,
    private readonly now: () => number,
    private readonly budgetMs = PORTRAIT_BUDGET_MS,
  ) {}

  /** Hazır portre (veri URL'si) ya da null; hazır değilse iş kuyruğa alınır. Üretilemeyen portre için hep null. */
  get(kind: PortraitKind, id: string): string | null {
    const key = keyOf(kind, id);
    const hit = this.ready.get(key);
    if (hit !== undefined) return hit;
    this.enqueue(kind, id, key);
    return null;
  }

  /** İşi önceden kuyruğa alır (ör. açılışta ilk çağ). */
  prefetch(kind: PortraitKind, id: string): void {
    const key = keyOf(kind, id);
    if (!this.ready.has(key)) this.enqueue(kind, id, key);
  }

  /** Bütçe içinde kuyruktaki işleri üretir (en az bir); bu çağrıda biten iş sayısını döndürür. */
  pump(): number {
    const start = this.now();
    let done = 0;
    while (this.queue.length > 0 && (done === 0 || this.now() - start < this.budgetMs)) {
      this.runNext();
      done++;
    }
    return done;
  }

  /** Kuyruğun tamamını bütçesiz üretir (açılışta, yükleme sırasında); biten iş sayısını döndürür. */
  drain(): number {
    let done = 0;
    while (this.queue.length > 0) {
      this.runNext();
      done++;
    }
    return done;
  }

  private runNext(): void {
    const job = this.queue.shift()!;
    this.queued.delete(job.key);
    const t0 = this.now();
    try {
      this.ready.set(job.key, this.generate(job.kind, job.id));
      this.counters.generated++;
    } catch {
      // Üretilemeyen portre yeniden denenmez; arayüz yer tutucuda kalır (oyun etkilenmez).
      this.failed.add(job.key);
      this.counters.failed++;
    }
    const ms = this.now() - t0;
    this.counters.totalMs += ms;
    this.counters.maxMs = Math.max(this.counters.maxMs, ms);
  }

  get stats(): PortraitStats {
    return { ...this.counters, pending: this.queue.length };
  }

  private enqueue(kind: PortraitKind, id: string, key: string): void {
    if (this.queued.has(key) || this.failed.has(key)) return;
    this.queued.add(key);
    this.queue.push({ kind, id, key });
  }
}

/** Bir çağın arayüzde görünen portrelerini (3 birlik, 2 kule, yetenek) kuyruğa alır. */
export function prefetchAge(cache: PortraitCache, age: number): void {
  const def = getAge(age);
  if (def === undefined) return;
  for (const id of def.unitIds) cache.prefetch('unit', id);
  for (const id of def.towerIds) cache.prefetch('tower', id);
  cache.prefetch('ability', def.abilityId);
}

/** Durma pozu: yürümüyor, saldırmıyor, vurulmamış; nefes evresi sabit (her portre aynı). */
const IDLE: UnitAnimInput = {
  walkDist: 0,
  walkBlend: 0,
  sinceAttackMs: Infinity,
  attackIntervalMs: 1000,
  engaged: false,
  sinceHitMs: Infinity,
  timeMs: 0,
};

/** Zemin gölgesi portrede çizilmez (saydam zeminde leke gibi durur ve kırpmayı genişletir). */
function hideShadows(root: Container): void {
  for (const child of root.children) {
    if (child instanceof Sprite && child.texture.label === 'shadow') child.visible = false;
  }
}

function unitFigure(id: string): Container {
  const unit = getUnit(id);
  if (unit === undefined) throw new Error(`Bilinmeyen birlik: ${id}`);
  const rig = createUnitRig(id, unit.role, 0, unit.def.age);
  rig.pose(IDLE);
  hideShadows(rig.root);
  return rig.root;
}

function towerFigure(id: string): Container {
  const slot = new TowerSlot(0, 0, towerInfo(id).age);
  slot.set(id, true);
  slot.setPlatformVisible(false);
  slot.root.position.set(0, 0);
  slot.root.scale.set(1);
  return slot.root;
}

function part(root: Container, name: string, x: number, y: number, rotation = 0, scale = 1): Sprite {
  const s = new Sprite(abilityTexture(name));
  s.position.set(x, y);
  s.rotation = rotation;
  s.scale.set(scale);
  root.addChild(s);
  return s;
}

/** Yetenek simgesi: yetenek efektinin parçalarından küçük bir kompozisyon (oyuncu renkleri). */
function abilityFigure(id: string): Container {
  const root = new Container();
  const age = id.split('_')[0];
  switch (age) {
    case 'primitive': {
      // Sürü Hücumu: domuz (arka ve ön bacak çiftleri + gövde).
      const r = BOAR_RIG;
      for (const x of [r.hipX - r.legSpread, r.shoulderX - r.legSpread]) part(root, 'boar.leg', x, r.jointY).tint = 0xbdb3c4;
      part(root, 'boar.body.0', 0, 0);
      for (const x of [r.hipX + r.legSpread, r.shoulderX + r.legSpread]) part(root, 'boar.leg', x, r.jointY);
      break;
    }
    case 'ancient':
      part(root, 'flame.b', -9, 0, -0.1, 0.85);
      part(root, 'flame.a', 6, 0);
      part(root, 'flame.lip', 0, 0);
      break;
    case 'medieval':
      part(root, 'caltrop.b', -13, 6, 0, 0.9);
      part(root, 'caltrop.a', 12, 4, 0.3, 0.9);
      part(root, 'caltrop.a', 0, -6);
      break;
    case 'industrial':
      part(root, 'burst', -10, 22, 0, 0.75);
      part(root, 'shell.0', 6, 0, 0.6, 0.75);
      break;
    default:
      part(root, 'status.crystal', 0, 0);
      part(root, 'glint', 12, -18, 0, 0.8);
      break;
  }
  return root;
}

/** 2B afin matris (Pixi/Canvas sırası: x' = a·x + c·y + tx, y' = b·x + d·y + ty). */
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

interface Item {
  sprite: Sprite;
  m: Affine;
  alpha: number;
  tint: number;
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

function multiplyTint(a: number, b: number): number {
  if (a === 0xffffff) return b;
  if (b === 0xffffff) return a;
  const ch = (v: number, shift: number): number => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255) << shift;
  return ch(0, 16) | ch(0, 8) | ch(0, 0);
}

/** Görünür sprite'ları çizim sırasıyla, kök yerel matrisleri, saydamlık ve renk çarpanlarıyla toplar. */
function collect(node: Container, parent: Affine, alpha: number, tint: number, out: Item[]): void {
  if (!node.visible || node.alpha <= 0) return;
  node.updateLocalTransform();
  const l = node.localTransform;
  const m: Affine = {
    a: l.a * parent.a + l.b * parent.c,
    b: l.a * parent.b + l.b * parent.d,
    c: l.c * parent.a + l.d * parent.c,
    d: l.c * parent.b + l.d * parent.d,
    tx: l.tx * parent.a + l.ty * parent.c + parent.tx,
    ty: l.tx * parent.b + l.ty * parent.d + parent.ty,
  };
  const a = alpha * node.alpha;
  const t = multiplyTint(tint, node instanceof Sprite ? node.tint : 0xffffff);
  if (node instanceof Sprite) out.push({ sprite: node, m, alpha: a, tint: t });
  for (const child of node.children) collect(child, m, a, t, out);
}

/** Sprite dörtgeni (anchor'a göre, doku çerçevesi boyutunda) yerel koordinatta. */
function quad(sprite: Sprite): { x: number; y: number; w: number; h: number } {
  const f = sprite.texture.frame;
  return { x: -sprite.anchor.x * f.width, y: -sprite.anchor.y * f.height, w: f.width, h: f.height };
}

/** Atlas parçalarının çizimsiz kenar payı (mantıksal px; `atlas.ts` MARGIN ≈ 3): sınır kutusunda yok sayılır. */
const QUAD_INSET = 2.5;

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

let scratch: HTMLCanvasElement | null = null;

/**
 * Figürü GPU'ya dokunmadan, atlasların kaynak tuvallerinden Canvas 2D ile çizer: piksel geri okuma (GPU eşzamanlaması)
 * yoktur, maliyet yalnız birkaç `drawImage` ve PNG kodlamasıdır. Uzun kenar `PORTRAIT_SIZE` mantıksal px,
 * `PORTRAIT_RESOLUTION` katı piksel; zemin saydam.
 */
function paint(figure: Container): string {
  const items: Item[] = [];
  collect(figure, IDENTITY, 1, 0xffffff, items);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { sprite, m } of items) {
    const q = quad(sprite);
    const i = Math.min(QUAD_INSET, q.w / 4, q.h / 4);
    for (const [px, py] of [
      [q.x + i, q.y + i],
      [q.x + q.w - i, q.y + i],
      [q.x + i, q.y + q.h - i],
      [q.x + q.w - i, q.y + q.h - i],
    ] as const) {
      const x = m.a * px + m.c * py + m.tx;
      const y = m.b * px + m.d * py + m.ty;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (!(bw > 0 && bh > 0)) throw new Error('Boş portre');
  const scale = PORTRAIT_SIZE / Math.max(bh, bw / PORTRAIT_FIT_ASPECT);
  const k = scale * PORTRAIT_RESOLUTION;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(Math.min(bw, bh * PORTRAIT_MAX_ASPECT) * k));
  canvas.height = Math.max(1, Math.ceil(bh * k));
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D bağlamı alınamadı');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const { sprite, m, alpha, tint } of items) {
    const tex = sprite.texture;
    const source = tex.source.resource as CanvasImageSource | undefined;
    if (source === undefined) continue;
    const r = tex.source.resolution;
    const f = tex.frame;
    const q = quad(sprite);
    // Çıktı matrisi: figür yereli → portre pikseli (sınır kutusu sol üstte).
    const set = (c: CanvasRenderingContext2D, ox: number, oy: number): void =>
      c.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, (m.tx - x0) * k - ox, (m.ty - y0) * k - oy);
    const draw = (c: CanvasRenderingContext2D): void => c.drawImage(source, f.x * r, f.y * r, f.width * r, f.height * r, q.x, q.y, q.w, q.h);
    if (tint === 0xffffff) {
      ctx.globalAlpha = alpha;
      set(ctx, 0, 0);
      draw(ctx);
      continue;
    }
    // Renk çarpanı (arka uzuvlar): ayrı tuvalde çiz, çarp, alfayı geri al, sonra bindir.
    scratch ??= document.createElement('canvas');
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const sc = scratch.getContext('2d');
    if (sc === null) continue;
    set(sc, 0, 0);
    draw(sc);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = 'multiply';
    sc.fillStyle = hex(tint);
    sc.fillRect(0, 0, scratch.width, scratch.height);
    sc.globalCompositeOperation = 'destination-in';
    set(sc, 0, 0);
    draw(sc);
    sc.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(scratch, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Portre üreticisi: figürü (birlik iskeleti, kule yuvası, yetenek parçaları) kurar, Canvas 2D ile çizer ve PNG veri
 * URL'si döndürür. Figürün sprite'ları sonra yok edilir (dokular atlasa aittir, korunur).
 */
export function createPortraitGenerator(): PortraitGenerator {
  return (kind, id) => {
    const figure = kind === 'unit' ? unitFigure(id) : kind === 'tower' ? towerFigure(id) : abilityFigure(id);
    try {
      return paint(figure);
    } finally {
      figure.destroy({ children: true });
    }
  };
}
