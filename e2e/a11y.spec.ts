import { expect, test, type Page } from '@playwright/test';
import { action, dismissTutorialOfferInit, openGame, pauseGame, screen, shot, startMatch } from './helpers';

test.beforeEach(async ({ page }) => {
  await dismissTutorialOfferInit(page);
});

/** Geliştirme paneli düğmesini fare olayı üretmeden tıklar (menü dışı tıklama menüyü kapatmasın). */
async function debugClick(page: Page, name: string, times = 1): Promise<void> {
  await page.evaluate(
    ([label, n]) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('.debug button')].find((b) => b.textContent === label);
      for (let i = 0; i < Number(n); i++) button?.click();
    },
    [name, times] as const,
  );
}

test.describe('Erişilebilirlik ve klavye', () => {
  test('yetenek klavyeyle kullanılır: Q → ← → → Enter; Esc iptal eder', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'Kolay');
    const ability = page.locator('.btn--ability');
    await page.getByRole('button', { name: 'Hız ×16' }).click();
    await expect(ability).toHaveAttribute('data-state', 'ready', { timeout: 40_000 });
    await page.getByRole('button', { name: 'Hız ×1', exact: true }).click();

    // Esc iptal eder (oyun duraklamaz).
    await page.keyboard.press('KeyQ');
    await expect(ability).toHaveAttribute('data-state', 'targeting');
    await page.keyboard.press('Escape');
    await expect(ability).toHaveAttribute('data-state', 'ready');
    await expect(screen(page, 'pause')).toBeHidden();

    // Q → oklar → Enter uygular.
    await page.keyboard.press('KeyQ');
    await expect(page.locator('.hud-target-hint')).toBeVisible();
    await expect(page.locator('.hud-target-hint')).toContainText('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await shot(page, 'a11y-keyboard-targeting');
    await page.keyboard.press('Enter');
    await expect(ability).toHaveAttribute('data-state', 'cooldown');
    await expect(page.locator('.hud-target-hint')).toBeHidden();
  });

  test('kule menüsü: odak ilk seçeneğe gider, kapanınca yuva düğmesine döner; çağ atlanınca menü güncellenir', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    const slot = page.locator('.hud-defense .slot-cell:nth-child(1) button');
    await slot.click();
    const firstOption = page.locator('.slot-menu__option').first();
    await expect(firstOption).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.slot-menu')).toBeHidden();
    await expect(slot).toBeFocused();

    // Menü açıkken çağ atla: kule listesi yeni çağın kuleleriyle yenilenir.
    await slot.click();
    await expect(firstOption).toContainText('Sapan Direği');
    await debugClick(page, '+1000 deneyim', 3);
    await debugClick(page, '+500 altın', 3);
    await page.keyboard.press('KeyE');
    await expect(page.locator('.hud-base--player .hud-base__age')).not.toContainText('İlkel');
    await expect(page.locator('.slot-menu__build').first()).not.toContainText('Sapan Direği');
    await expect(page.locator('.slot-menu__build')).toHaveCount(2);
    await expect(page.locator('.slot-menu__build').first()).toBeFocused();
  });

  test('modal odak tuzağı ve tek modal: duraklatmada Tab dışarı çıkmaz; ayarlar açılınca duraklatma gizlenir', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await pauseGame(page);
    const insideOf = (name: string) => page.evaluate((n) => document.activeElement?.closest(`.screen[data-screen="${n}"]`) !== null, name);
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      expect(await insideOf('pause')).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await insideOf('pause')).toBe(true);
    }

    await action(page, 'pause-settings').click();
    await expect(screen(page, 'settings')).toBeVisible();
    await expect(screen(page, 'pause')).toBeHidden();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await insideOf('settings')).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(screen(page, 'settings')).toBeHidden();
    await expect(screen(page, 'pause')).toBeVisible();
  });

  test('HUD etiketleri görünen değeri ezmez: çağ ve süre erişilebilir adlarında değer vardır; ana menü Devam et adı bilgiyi içerir', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await expect(page.locator('.hud-base--player .hud-base__age')).toHaveAttribute('aria-label', /İlkel Çağ/);
    await expect(page.locator('.hud-clock')).toHaveAttribute('aria-label', /\d\d:\d\d/);
    await pauseGame(page);
    await action(page, 'to-menu').click();
    const resume = action(page, 'continue');
    await expect(resume).toBeEnabled();
    expect(await resume.getAttribute('aria-label')).toBeNull();
    await expect(page.getByRole('button', { name: /Devam et.*Normal/ })).toBeVisible();
  });
});
