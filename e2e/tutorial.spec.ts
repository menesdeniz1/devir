import { expect, test, type Page } from '@playwright/test';
import { KEYS, SIZES, action, expectNoHorizontalOverflow, pauseGame, screen, shot, startMatch } from './helpers';

const panel = (page: Page) => page.locator('.tutorial');
const expectStep = (page: Page, id: string) => expect(panel(page)).toHaveAttribute('data-step', id, { timeout: 60_000 });
const storage = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test.describe('Öğretici', () => {
  for (const size of SIZES) {
    test(`baştan sona tamamlanır; kayda ve sonuçlara yazılmaz (${size.name})`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      const name = (n: string): string => `tutorial-${n}-${size.name}`;

      // İlk açılış: öğretici önerilir.
      await page.goto('/?debug');
      await expect(screen(page, 'menu')).toBeVisible();
      await expect(screen(page, 'tutorial-offer')).toBeVisible();
      await shot(page, name('00-offer'));
      await action(page, 'tutorial-offer-start').click();
      await expect(panel(page)).toBeVisible();

      // 1. Hoş geldin (bilgi adımı: Devam).
      await expectStep(page, 'welcome');
      await expect(page.locator('.tutorial-highlight')).toBeVisible();
      await expect(action(page, 'tutorial-skip')).toBeVisible();
      await shot(page, name('01-welcome'));
      await action(page, 'tutorial-next').click();

      // 2. Ön hat birliği üret.
      await expectStep(page, 'produceFront');
      await expect(action(page, 'tutorial-next')).toBeHidden();
      await shot(page, name('02-produce-front'));
      await page.keyboard.press('Digit1');

      // 3. İlk çatışma (hızlandırarak bekle).
      await expectStep(page, 'firstKill');
      await shot(page, name('03-first-kill'));
      await page.getByRole('button', { name: 'Hız ×16' }).click();

      // 4. Menzilli birlik.
      await expectStep(page, 'produceRanged');
      await page.getByRole('button', { name: 'Hız ×1', exact: true }).click();
      await shot(page, name('04-produce-ranged'));
      await page.keyboard.press('Digit2');

      // 5. İki sipariş ver, bekleyeni iptal et.
      await expectStep(page, 'cancelOrder');
      await page.keyboard.press('Digit1');
      await page.keyboard.press('Digit1');
      const waiting = page.locator('.queue-slot[data-kind="waiting"]').first();
      await expect(waiting).toBeVisible();
      await shot(page, name('05-cancel-order'));
      await waiting.click();

      // 6. Kule kur.
      await expectStep(page, 'buildTower');
      await shot(page, name('06-build-tower'));
      await page.locator('.hud-defense .slot-cell:nth-child(1) button').click();
      await page.locator('.slot-menu__option').first().click();

      // 7. Küme hâlinde rakip: yeteneği kullan (Q → imleç → Q).
      await expectStep(page, 'useAbility');
      await expect(page.locator('.tutorial__text')).toContainText('küme');
      await shot(page, name('07-use-ability'));
      await page.keyboard.press('KeyQ');
      await page.mouse.move(Math.round(size.width * 0.55), Math.round(size.height * 0.6));
      await page.keyboard.press('KeyQ');

      // 8. Çağ atla (deneyim eşiği betikle dolduruldu).
      await expectStep(page, 'ageUp');
      await shot(page, name('08-age-up'));
      await page.keyboard.press('KeyE');

      // 9. Sınır Taşı.
      await expectStep(page, 'captureStone');
      await shot(page, name('09-capture-stone'));
      await page.getByRole('button', { name: 'Hız ×16' }).click();
      for (let i = 0; i < 100 && (await panel(page).getAttribute('data-step')) === 'captureStone'; i++) {
        await page.keyboard.press('Digit1');
        await page.waitForTimeout(150);
      }

      // 10. Rakip üssü yık.
      await expectStep(page, 'destroyBase');
      await shot(page, name('10-destroy-base'));
      const done = screen(page, 'tutorial-done');
      for (let i = 0; i < 200 && !(await done.isVisible()); i++) {
        await page.keyboard.press('Digit1');
        await page.waitForTimeout(150);
      }
      await expect(done).toBeVisible();
      await expect(done).toContainText('Öğretici tamamlandı');
      await expect(screen(page, 'result')).toBeHidden();
      await shot(page, name('11-done'));

      // Kayıt ve sonuç geçmişine yazılmadı; durum saklandı.
      expect(await storage(page, KEYS.save)).toBeNull();
      expect(await storage(page, KEYS.results)).toBeNull();
      expect(JSON.parse((await storage(page, KEYS.tutorial)) ?? 'null')).toEqual({ status: 'completed' });

      await action(page, 'tutorial-done-menu').click();
      await expect(screen(page, 'menu')).toBeVisible();
      await expect(screen(page, 'tutorial-offer')).toBeHidden();
      await expect(action(page, 'continue')).toBeDisabled();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('atlama yolu: durum saklanır, var olan kayıt ve Devam et korunur; duraklatmada da Atla görünür', async ({ page }) => {
    await page.goto('/?debug');
    await expect(screen(page, 'tutorial-offer')).toBeVisible();
    // "Şimdi değil" saklanır; yeniden yüklemede öneri gelmez, menüden açılabilir.
    await action(page, 'tutorial-later').click();
    await expect(screen(page, 'tutorial-offer')).toBeHidden();
    expect(JSON.parse((await storage(page, KEYS.tutorial)) ?? 'null')).toEqual({ status: 'dismissed' });
    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await expect(screen(page, 'tutorial-offer')).toBeHidden();

    // Kayıtlı bir maç oluştur.
    await startMatch(page, 'Kolay');
    await pauseGame(page);
    await action(page, 'to-menu').click();
    const saved = await storage(page, KEYS.save);
    expect(saved).not.toBeNull();

    // Öğreticiyi aç, duraklat: Atla hâlâ erişilebilir ve kayıt metni "kaydedilmez" der.
    await action(page, 'tutorial').click();
    await expect(panel(page)).toBeVisible();
    await shot(page, 'tutorial-skip-1-running');
    await pauseGame(page);
    await expect(screen(page, 'pause')).toContainText('Öğretici maçı kaydedilmez');
    await shot(page, 'tutorial-skip-2-paused');
    await action(page, 'tutorial-skip').click();

    await expect(screen(page, 'menu')).toBeVisible();
    expect(JSON.parse((await storage(page, KEYS.tutorial)) ?? 'null')).toEqual({ status: 'skipped' });
    expect(await storage(page, KEYS.save)).toBe(saved);
    expect(await storage(page, KEYS.results)).toBeNull();
    await expect(action(page, 'continue')).toBeEnabled();
    await action(page, 'continue').click();
    await expect(screen(page, 'pause')).toBeVisible();
  });

  test('ilk açılış önerisi: Esc "Şimdi değil" sayılır ve saklanır', async ({ page }) => {
    await page.goto('/?debug');
    await expect(screen(page, 'tutorial-offer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(screen(page, 'tutorial-offer')).toBeHidden();
    await expect(screen(page, 'menu')).toBeVisible();
    expect(JSON.parse((await storage(page, KEYS.tutorial)) ?? 'null')).toEqual({ status: 'dismissed' });
  });

  test('sekme gizlenince öğretici durur', async ({ page }) => {
    await page.goto('/?debug');
    await action(page, 'tutorial-offer-start').click();
    await expect(panel(page)).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(screen(page, 'pause')).toBeVisible();
    expect(await storage(page, KEYS.save)).toBeNull();
  });
});
