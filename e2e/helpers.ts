import { expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Ekran görüntüleri buraya kaydedilir (E2E_SHOTS ile değiştirilebilir). */
export const SHOT_DIR =
  process.env['E2E_SHOTS'] ?? 'C:\\Users\\enes\\AppData\\Local\\Temp\\claude\\7631c3268075e685\\7811c735-11e6-4885-a7c8-d58dd9d38786\\scratchpad\\e2e-shots';

export const KEYS = {
  save: 'devir.save.v1',
  settings: 'devir.settings.v1',
  results: 'devir.results.v1',
  tutorial: 'devir.tutorial.v1',
} as const;

export const SIZES = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
] as const;

/** İlk açılış öğretici önerisi tıklamaları örtmesin: öneri daha önce yanıtlanmış sayılır (her sayfa yüklemesinde). */
export async function dismissTutorialOfferInit(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ status: 'dismissed' }));
  }, KEYS.tutorial);
}

export const screen = (page: Page, name: string): Locator => page.locator(`.screen[data-screen="${name}"]`);
export const action = (page: Page, name: string): Locator => page.locator(`[data-action="${name}"]`);

/** Oyunu ?debug ile açar ve ana menünün görünmesini bekler. */
export async function openGame(page: Page): Promise<void> {
  await page.goto('/?debug');
  await expect(screen(page, 'menu')).toBeVisible();
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) });
}

/** Geliştirme panelindeki tick ve durum karması. */
export async function debugInfo(page: Page): Promise<{ tick: number; hash: string }> {
  const text = (await page.locator('.debug__info').textContent()) ?? '';
  const match = /Tick:\s*(\d+)\s+(?:Karma|Hash):\s*([0-9a-f]{8})/.exec(text);
  if (match === null) throw new Error(`Geliştirme paneli okunamadı: "${text}"`);
  return { tick: Number(match[1]), hash: match[2]! };
}

/** Ana menü → kurulum → zorluk seç → Başlat. */
export async function startMatch(page: Page, difficulty: 'Kolay' | 'Normal' | 'Zor' = 'Normal'): Promise<void> {
  await action(page, 'start').click();
  await expect(screen(page, 'setup')).toBeVisible();
  await page.locator('.diff-card', { hasText: difficulty }).click();
  await action(page, 'begin').click();
  await expect(page.locator('.hud-bottom')).toBeVisible();
}

export async function pauseGame(page: Page): Promise<void> {
  await page.locator('.btn--pause').click();
  await expect(screen(page, 'pause')).toBeVisible();
}

/** Yatay taşma yok: sayfa, alt panel ve görünür kartlar pencere genişliğine sığar. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const doc = document.documentElement;
    if (doc.scrollWidth > vw) out.push(`sayfa scrollWidth ${doc.scrollWidth} > ${vw}`);
    const visible = (node: Element): boolean => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    };
    for (const node of document.querySelectorAll('.hud-bottom, .hud-top, .screen__card, .screen')) {
      if (!visible(node)) continue;
      const r = node.getBoundingClientRect();
      const el = node as HTMLElement;
      if (r.right > vw + 1 || r.left < -1) out.push(`${el.className} dışarı taşıyor (${Math.round(r.left)}..${Math.round(r.right)} / ${vw})`);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} yatay kayıyor (${el.scrollWidth} > ${el.clientWidth})`);
    }
    for (const node of document.querySelectorAll('.hud-bottom > *')) {
      if (!visible(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.right > vw + 1) out.push(`alt panel öğesi ${node.className} taşıyor (${Math.round(r.right)} > ${vw})`);
    }
    return out;
  });
  expect(problems).toEqual([]);
}

/** WebGL yokken oyun açıklayıcı hata ekranı gösterir (TDD §12): başlık, açıklama ve teknik ayrıntı. */
export async function expectFatalScreen(page: Page): Promise<void> {
  const fatal = page.locator('.fatal');
  await expect(fatal).toBeVisible();
  await expect(fatal).toHaveAttribute('role', 'alert');
  await expect(fatal.locator('h1')).toHaveText('Oyun başlatılamadı');
  await expect(fatal).toContainText('WebGL2');
  await expect(fatal).toContainText('Ayrıntı:');
  // Oyun arayüzü kurulmamıştır.
  await expect(page.locator('.hud-bottom')).toHaveCount(0);
}

/**
 * Portreler yüklendi (GDD §11): seçicideki her görünür resmin adresi var, yüklenmiş ve doğal genişliği > 0; resimler
 * süstür (alt="" ve aria-hidden). En az `min` resim beklenir. Portreler kareler içinde üretildiği için yoklanır.
 */
export async function expectPortraitsLoaded(page: Page, selector: string, min: number): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((sel) => {
          const imgs = [...document.querySelectorAll<HTMLImageElement>(sel)].filter((i) => !i.hidden);
          const bad = imgs.filter((i) => !(i.complete && i.naturalWidth > 0) || i.alt !== '' || i.getAttribute('aria-hidden') !== 'true');
          return bad.length > 0 ? -1 : imgs.length;
        }, selector),
      { message: `portreler yüklenmedi: ${selector}`, timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(min);
}

/** Üst şerit ve alt panelde kesilen metin, taşan ya da üst üste binen öğe yok (portreler dahil). */
export async function expectHudFits(page: Page, label: string): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = (node: Element): boolean => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    };
    const name = (node: Element): string => `${node.tagName.toLowerCase()}.${(node as HTMLElement).className}`;
    // Kesilen metin: kutu içeriği kutudan büyük.
    for (const node of document.querySelectorAll<HTMLElement>('.hud-top *, .hud-bottom *')) {
      if (!visible(node) || getComputedStyle(node).display === 'inline') continue;
      // Yetenek düğmesinin kısayol rozeti bilerek köşeden taşar (style.css .ability__key); yetenek adı ve durumu ayrıca denetlenir.
      if (node.matches('.hud-ability, .btn--ability')) continue;
      if (node.scrollWidth > node.clientWidth + 1) out.push(`kesiliyor (yatay): ${name(node)} ${node.scrollWidth}>${node.clientWidth} "${node.textContent?.slice(0, 40)}"`);
      // Dikeyde yalnız düğmeler ve taşması gizlenen kutular denetlenir (satır yüksekliği küçük rakam kutularında yanlış alarm verir).
      const clipsVertically = node.tagName === 'BUTTON' || getComputedStyle(node).overflowY !== 'visible';
      if (clipsVertically && node.scrollHeight > node.clientHeight + 1) out.push(`kesiliyor (dikey): ${name(node)} ${node.scrollHeight}>${node.clientHeight} "${node.textContent?.slice(0, 40)}"`);
    }
    // Portre resimleri kendi çerçevesinin (pencere / kuyruk kutusu / halka) içinde kalır.
    for (const img of document.querySelectorAll<HTMLImageElement>('.hud-bottom img')) {
      if (!visible(img)) continue;
      const r = img.getBoundingClientRect();
      const f = img.parentElement!.getBoundingClientRect();
      if (r.left < f.left - 1 || r.right > f.right + 1 || r.top < f.top - 1 || r.bottom > f.bottom + 1) out.push(`portre çerçeveden taşıyor: ${img.className}`);
    }
    const rectOf = (selector: string): DOMRect | null => {
      const node = document.querySelector(selector);
      return node !== null && visible(node) ? node.getBoundingClientRect() : null;
    };
    const overlap = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    // Üst şerit sütunları birbirine girmez.
    const top = ['.hud-top .hud-base--player', '.hud-top .hud-center', '.hud-top .hud-base--enemy'].map(rectOf);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i];
        const b = top[j];
        if (a && b && overlap(a, b)) out.push(`üst şerit sütunları çakışıyor (${i}/${j})`);
      }
    }
    // Alt panel çocukları birbirine girmez ve ekranın içinde kalır.
    const kids = [...document.querySelectorAll('.hud-bottom > *')].filter(visible);
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i]!.getBoundingClientRect();
      if (a.right > vw + 1 || a.left < -1 || a.bottom > vh + 1) out.push(`alt panel öğesi taşıyor: ${name(kids[i]!)}`);
      for (let j = i + 1; j < kids.length; j++) {
        if (overlap(a, kids[j]!.getBoundingClientRect())) out.push(`alt panel öğeleri çakışıyor: ${name(kids[i]!)} / ${name(kids[j]!)}`);
      }
    }
    const bottom = rectOf('.hud-bottom');
    if (bottom && bottom.bottom > vh + 1) out.push(`alt panel ekran dışında (${Math.round(bottom.bottom)} > ${vh})`);
    // Alt panel birliklerin yürüdüğü bandın altında kalır (GDD §11: ekranın alt ≈ %22'si; 1280×720'de ≤ 164 px).
    if (bottom && bottom.height > vh * 0.23) out.push(`alt panel çok yüksek (${Math.round(bottom.height)} > ${Math.round(vh * 0.23)})`);
    return out;
  });
  expect(problems, label).toEqual([]);
}
