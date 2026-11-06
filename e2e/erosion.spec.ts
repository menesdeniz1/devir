import { expect, test, type Page } from '@playwright/test';
import { KEYS, action, dismissTutorialOfferInit, expectNoHorizontalOverflow, openGame, screen, shot } from './helpers';

/** Maç kurulumunda aşınma seçeneği (GDD §8.1, PRD K-18). */

test.beforeEach(async ({ page }) => {
  await dismissTutorialOfferInit(page);
});

async function stored(page: Page, key: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

test.describe('Aşınma seçeneği', () => {
  test('varsayılan açık; kapatılınca maç aşınmasız kurulur ve seçim hatırlanır', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGame(page);
    await action(page, 'start').click();
    const setup = screen(page, 'setup');
    await expect(setup).toBeVisible();
    const toggle = page.locator('#setup-erosion');
    await expect(toggle).toBeChecked();
    // Kurulum ekranı seçenekle birlikte 1280×720'e sığar: Başlat görünür ve yatay taşma yok.
    await expect(action(page, 'begin')).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await shot(page, 'setup-erosion-1280x720');

    await toggle.uncheck();
    await expect.poll(async () => (await stored(page, KEYS.settings))?.['erosion']).toBe(false);
    await action(page, 'begin').click();
    await expect(screen(page, 'setup')).toBeHidden();

    // Duraklatma kayıt alır: maç yapılandırması aşınmasız.
    await page.keyboard.press('KeyP');
    await expect.poll(async () => ((await stored(page, KEYS.save))?.['matchConfig'] as Record<string, unknown> | undefined)?.['erosion']).toBe(false);

    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await action(page, 'start').click();
    await expect(page.locator('#setup-erosion')).not.toBeChecked();
  });

  test('açıkken başlatılan maçın kaydında aşınma açık', async ({ page }) => {
    await openGame(page);
    await action(page, 'start').click();
    await expect(page.locator('#setup-erosion')).toBeChecked();
    await action(page, 'begin').click();
    await page.keyboard.press('KeyP');
    await expect.poll(async () => ((await stored(page, KEYS.save))?.['matchConfig'] as Record<string, unknown> | undefined)?.['erosion']).toBe(true);
  });
});
