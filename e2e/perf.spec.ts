import { expect, test } from '@playwright/test';
import { dismissTutorialOfferInit, openGame, shot, startMatch } from './helpers';

test('performans paneli: fps, adım süresi, çizim sayıları ve tick görünür (yalnız ?debug)', async ({ page }) => {
  await dismissTutorialOfferInit(page);
  await openGame(page);
  await startMatch(page, 'Kolay');
  await page.keyboard.press('Digit1');
  const frame = page.locator('[data-role="perf-frame"]');
  const render = page.locator('[data-role="perf-render"]');
  await expect(frame).toHaveText(/^FPS [1-9]\d* · Adım ort \d+\.\d+ \/ en kötü \d+\.\d+ ms$/);
  await expect(render).toHaveText(/^Çizim \d+\.\d+ ms · Birlik \d+ · Mermi \d+ · Efekt \d+$/);
  await expect(page.locator('.debug__info')).toContainText('Tick:');
  await shot(page, `perf-panel-${test.info().project.name}`);

  // ?debug olmadan panel yoktur.
  await page.goto('/');
  await expect(page.locator('.debug')).toHaveCount(0);
});
