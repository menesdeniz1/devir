import { expect, test, type Page } from '@playwright/test';
import { AGES } from '../src/data/ages';
import { tr } from '../src/i18n/tr';
import { SIZES, dismissTutorialOfferInit, expectHudFits, expectNoHorizontalOverflow, expectPortraitsLoaded, openGame, shot, startMatch } from './helpers';

/**
 * Arayüz portreleri (GDD §11), Türkçe, iki çözünürlükte, beş çağda: birlik kartları, kuyruk kutuları, yetenek
 * simgesi, kule menüsü (kur ve sat) ve kurulu yuva portreleri yüklenir; alt panel taşmaz ve yürüme bandının altında
 * kalır. İngilizce düzen e2e/english.spec.ts'te aynı denetimlerden geçer.
 */

async function debugClick(page: Page, label: string, times = 1): Promise<void> {
  await page.evaluate(
    ([name, n]) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('.debug button')].find((b) => b.textContent === name);
      for (let i = 0; i < Number(n); i++) button?.click();
    },
    [label, times] as const,
  );
}

for (const size of SIZES) {
  test.describe(`Portreler ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`birlik, kuyruk, yetenek, kule menüsü ve kurulu yuva portreleri her çağda yüklenir; HUD sığar (${size.name})`, async ({ page }) => {
      test.setTimeout(180_000);
      await dismissTutorialOfferInit(page);
      await openGame(page);
      await startMatch(page, 'Kolay');
      const gold = '+500 altın';
      const slot = page.locator('.hud-defense .slot-cell:nth-child(1) button');
      for (let age = 1; age <= AGES.length; age++) {
        if (age > 1) {
          await debugClick(page, '+1000 deneyim', 5);
          await debugClick(page, gold, 5);
          await page.keyboard.press('KeyE');
          await expect(page.locator('.hud-base--player .hud-base__age')).toHaveText(tr.age[age]!);
        }
        await debugClick(page, gold, 4);
        for (const key of ['Digit1', 'Digit2', 'Digit3']) await page.keyboard.press(key);
        await expect(page.locator('.queue-slot:not([data-kind="empty"])').nth(2)).toBeVisible();
        await expectPortraitsLoaded(page, '.hud-units .btn__portrait', 3);
        await expectPortraitsLoaded(page, '.queue-slot:not([data-kind="empty"]) .queue-slot__portrait', 3);
        // Dolu her kuyruk kutusunda mini portre var (rol işareti de görünür).
        await expect(page.locator('.queue-slot:not([data-kind="empty"]):not([data-portrait="ready"])')).toHaveCount(0);
        await expect(page.locator('.queue-slot:not([data-kind="empty"]) .queue-slot__mark').first()).toBeVisible();
        await expectPortraitsLoaded(page, '.hud-ability .ability__icon', 1);

        // Yuva 1: önceki çağın kulesi varsa satılır (sat menüsünde kulenin portresi), sonra bu çağın kulesi kurulur.
        if (age > 1) {
          await slot.click();
          await expect(page.locator('.slot-menu__sell')).toBeVisible();
          await expectPortraitsLoaded(page, '.slot-menu .slot-menu__portrait', 1);
          await page.locator('.slot-menu__sell').click();
          await expect(slot).toHaveAttribute('data-kind', 'empty');
          await expect(slot).toHaveAttribute('data-portrait', 'none');
        }
        await slot.click();
        await expect(page.locator('.slot-menu__build')).toHaveCount(2);
        await expectPortraitsLoaded(page, '.slot-menu .slot-menu__portrait', 2);
        if (age === 3) await shot(page, `portraits-tr-${size.name}-tower-menu-age${age}`);
        await page.locator('.slot-menu__build').first().click();
        await expect(slot).toHaveAttribute('data-kind', 'built');
        await expectPortraitsLoaded(page, '.hud-defense .slot-btn__portrait', 1);
        await expect(slot).toHaveAttribute('data-portrait', 'ready');

        await expectNoHorizontalOverflow(page);
        await expectHudFits(page, `TR ${size.name} çağ ${age}`);
        await shot(page, `portraits-tr-${size.name}-age${age}`);
      }
    });
  });
}
