import { expect, test, type Page } from '@playwright/test';
import { KEYS, action, debugInfo, dismissTutorialOfferInit, expectNoHorizontalOverflow, openGame, screen, shot, startMatch } from './helpers';

/** Oyun hızı (PRD G-08): HUD düğmesi, F kısayolu, Ayarlar seçicisi, kalıcılık ve gerçek tick hızı. */

test.beforeEach(async ({ page }) => {
  await dismissTutorialOfferInit(page);
});

const speedButton = (page: Page) => action(page, 'speed');

async function storedSpeed(page: Page): Promise<unknown> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').gameSpeed, KEYS.settings);
}

/** Gerçek sürede ilerleyen tick sayısı (oyun hızının etkisi). */
async function ticksIn(page: Page, ms: number): Promise<number> {
  const t0 = (await debugInfo(page)).tick;
  await page.waitForTimeout(ms);
  return (await debugInfo(page)).tick - t0;
}

test.describe('Oyun hızı', () => {
  test('HUD düğmesi ve F döngüsel geçer, ayar saklanır, maç hızlanır', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGame(page);
    await startMatch(page);
    await expect(speedButton(page)).toHaveText('1×');
    const normal = await ticksIn(page, 2000);

    await speedButton(page).click();
    await expect(speedButton(page)).toHaveText('1,5×');
    await page.keyboard.press('KeyF');
    await expect(speedButton(page)).toHaveText('2×');
    await page.keyboard.press('KeyF');
    await expect(speedButton(page)).toHaveText('3×');
    await expect.poll(() => storedSpeed(page)).toBe(3);

    // 3×'te aynı gerçek sürede belirgin olarak daha çok adım atılır (kare hızı dalgalanmasına pay bırakılır).
    const fast = await ticksIn(page, 2000);
    expect(fast).toBeGreaterThan(normal * 2);
    await expectNoHorizontalOverflow(page);
    await shot(page, 'speed-3x-1280x720');

    await page.keyboard.press('KeyF');
    await expect(speedButton(page)).toHaveText('1×');
    await expect.poll(() => storedSpeed(page)).toBe(1);
  });

  test('Ayarlar seçicisi hızı değiştirir; yeniden yüklemede ve yeni maçta korunur', async ({ page }) => {
    await openGame(page);
    await action(page, 'settings').click();
    const select = page.locator('#setting-speed');
    await expect(select).toHaveValue('1');
    await select.selectOption('2');
    await expect.poll(() => storedSpeed(page)).toBe(2);
    await action(page, 'settings-back').click();

    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await startMatch(page);
    await expect(speedButton(page)).toHaveText('2×');

    // Duraklatma menüsündeki Ayarlar da aynı seçiciyi gösterir.
    await page.keyboard.press('KeyP');
    await action(page, 'pause-settings').click();
    await expect(page.locator('#setting-speed')).toHaveValue('2');
  });

  test('duraklatılmışken hız değişir ama oyun ilerlemez', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await page.keyboard.press('KeyP');
    const t0 = (await debugInfo(page)).tick;
    await page.keyboard.press('KeyF');
    await expect(speedButton(page)).toHaveText('1,5×');
    await page.waitForTimeout(600);
    expect((await debugInfo(page)).tick).toBe(t0);
  });
});
