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
  const match = /Tick:\s*(\d+)\s+Karma:\s*([0-9a-f]{8})/.exec(text);
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
