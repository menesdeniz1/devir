import { expect, test } from '@playwright/test';
import {
  KEYS,
  SIZES,
  action,
  debugInfo,
  expectNoHorizontalOverflow,
  openGame,
  pauseGame,
  screen,
  shot,
  startMatch,
} from './helpers';

test.describe('Ekran akışı ve kayıt', () => {
  test('menü → kurulum → Normal başlat; birlik üret; duraklat → yeniden yükle → Devam et: aynı tick ve karma (K-07)', async ({ page }) => {
    await openGame(page);
    // Kayıt yokken Devam et kapalı; Öğretici henüz devre dışı.
    await expect(action(page, 'continue')).toBeDisabled();
    await expect(action(page, 'tutorial')).toBeDisabled();
    await shot(page, 'menu-1280x720');

    await action(page, 'start').click();
    await expect(screen(page, 'setup')).toBeVisible();
    await expect(page.locator('.diff-card')).toHaveCount(3);
    await expect(page.locator('.diff-card[data-selected="true"]')).toContainText('Normal');
    await expect(page.locator('.diff-card__record').first()).toContainText('Galibiyet 0 · Yenilgi 0');
    await shot(page, 'setup-1280x720');
    await action(page, 'begin').click();
    await expect(page.locator('.hud-bottom')).toBeVisible();

    // Birlik üret: kuyrukta üretimdeki sipariş görünür.
    await page.keyboard.press('Digit1');
    await expect(page.locator('.queue-slot[data-kind="producing"]')).toHaveCount(1);
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(20);

    await pauseGame(page);
    await shot(page, 'pause-1280x720');
    await page.waitForTimeout(150);
    const paused = await debugInfo(page);
    const saved = await page.evaluate((key) => localStorage.getItem(key), KEYS.save);
    expect(saved).not.toBeNull();

    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await expect(action(page, 'continue')).toBeEnabled();
    await expect(action(page, 'continue')).toContainText('Normal');
    await action(page, 'continue').click();

    // Kayıttan açılan maç duraklatılmış gelir; tick ve durum karması kaydedilenle aynıdır.
    await expect(screen(page, 'pause')).toBeVisible();
    await page.waitForTimeout(150);
    expect(await debugInfo(page)).toEqual(paused);

    // Devam edince oyun kaldığı yerden sürer.
    await action(page, 'resume').click();
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(paused.tick + 10);
    await expect(page.locator('.queue-slot[data-kind="producing"], .queue-slot[data-kind="empty"]').first()).toBeVisible();
  });

  test('Ana menüye dön maçı kaydeder; Devam et ile dönülür', async ({ page }) => {
    await openGame(page);
    await startMatch(page, 'Kolay');
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(30);
    await page.keyboard.press('Escape');
    await expect(screen(page, 'pause')).toBeVisible();
    const before = await debugInfo(page);
    await action(page, 'to-menu').click();
    await expect(screen(page, 'menu')).toBeVisible();
    await expect(action(page, 'continue')).toBeEnabled();
    await expect(action(page, 'continue')).toContainText('Kolay');
    await action(page, 'continue').click();
    await expect(screen(page, 'pause')).toBeVisible();
    await page.waitForTimeout(150);
    expect(await debugInfo(page)).toEqual(before);
  });

  test('sekme gizlenince oyun duraklar ve kayıt alınır (K-14, ÖK-06)', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(10);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEYS.save)).toBeNull();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(screen(page, 'pause')).toBeVisible();
    const saved = await page.evaluate((key) => localStorage.getItem(key), KEYS.save);
    expect(saved).not.toBeNull();
    const stored = JSON.parse(saved ?? '{}') as { state: { tick: number } };

    // Gizliyken ve geri dönüldüğünde tick ilerlemez; oyun duraklatılmış kalır.
    const tick = (await debugInfo(page)).tick;
    expect(tick).toBe(stored.state.tick);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(400);
    expect((await debugInfo(page)).tick).toBe(tick);
    await expect(screen(page, 'pause')).toBeVisible();
  });

  test('bozuk kayıt: bilgilendirme gösterilir, kayıt silinir, Devam et kapalı', async ({ page }) => {
    await page.goto('/?debug');
    await page.evaluate((key) => localStorage.setItem(key, '{"schemaVersion":1,"bozuk":'), KEYS.save);
    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('Kayıtlı maç bozuk olduğu için silindi.');
    await expect(action(page, 'continue')).toBeDisabled();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEYS.save)).toBeNull();
    await shot(page, 'menu-invalid-save');

    // Sağlama toplamı uyuşmayan (elle değiştirilmiş) geçerli biçimli kayıt da silinir.
    await startMatch(page);
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(5);
    await pauseGame(page);
    await action(page, 'to-menu').click();
    await expect(action(page, 'continue')).toBeEnabled();
    await page.evaluate((key) => {
      const raw = JSON.parse(localStorage.getItem(key) ?? '{}') as { state: { tick: number } };
      raw.state.tick += 5;
      localStorage.setItem(key, JSON.stringify(raw));
    }, KEYS.save);
    await page.reload();
    await expect(page.locator('.toast')).toContainText('bozuk');
    await expect(action(page, 'continue')).toBeDisabled();
  });

  test('kayıt varken yeni maç onay ister; vazgeçince kayıt korunur, onaylayınca silinir (ÖK-08)', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(5);
    await pauseGame(page);
    await action(page, 'to-menu').click();
    await expect(action(page, 'continue')).toBeEnabled();
    const saved = await page.evaluate((key) => localStorage.getItem(key), KEYS.save);

    await action(page, 'start').click();
    await action(page, 'begin').click();
    await expect(screen(page, 'confirm')).toBeVisible();
    await shot(page, 'confirm-1280x720');
    await action(page, 'confirm-no').click();
    await expect(screen(page, 'confirm')).toBeHidden();
    await expect(screen(page, 'setup')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEYS.save)).toBe(saved);

    await action(page, 'begin').click();
    await expect(screen(page, 'confirm')).toBeVisible();
    await action(page, 'confirm-yes').click();
    await expect(page.locator('.hud-bottom')).toBeVisible();
    await expect(screen(page, 'confirm')).toBeHidden();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEYS.save)).toBeNull();
  });

  test('Esc: kurulumdan menüye döner; menüde bir şey yapmaz', async ({ page }) => {
    await openGame(page);
    await action(page, 'start').click();
    await expect(screen(page, 'setup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(screen(page, 'menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyP');
    await expect(screen(page, 'menu')).toBeVisible();
  });
});

test.describe('Ayarlar', () => {
  test('değişiklikler anında saklanır ve yeniden yüklemede korunur (EK-07)', async ({ page }) => {
    await openGame(page);
    await action(page, 'settings').click();
    await expect(screen(page, 'settings')).toBeVisible();
    await expect(page.locator('.settings__version')).toContainText(/\d+\.\d+\.\d+ \(.+\)/);
    await expect(page.locator('.shortcuts__key')).not.toHaveCount(0);
    await shot(page, 'settings-1280x720');

    await page.locator('#setting-music').fill('30');
    await page.locator('#setting-sfx').fill('55');
    await page.locator('#setting-shake').uncheck();
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, KEYS.settings);
    expect(stored).toEqual({ musicVolume: 30, sfxVolume: 55, screenShake: false });

    await page.reload();
    await action(page, 'settings').click();
    await expect(page.locator('#setting-music')).toHaveValue('30');
    await expect(page.locator('#setting-sfx')).toHaveValue('55');
    await expect(page.locator('#setting-shake')).not.toBeChecked();

    // Esc ayarları kapatır; menüye dönülür.
    await page.keyboard.press('Escape');
    await expect(screen(page, 'settings')).toBeHidden();
    await expect(screen(page, 'menu')).toBeVisible();
  });

  test('duraklatma menüsünden ayarlar açılır; Esc yalnız ayarları kapatır, oyun duraklatılmış kalır', async ({ page }) => {
    await openGame(page);
    await startMatch(page);
    await pauseGame(page);
    await action(page, 'pause-settings').click();
    await expect(screen(page, 'settings')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(screen(page, 'settings')).toBeHidden();
    await expect(screen(page, 'pause')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(screen(page, 'pause')).toBeHidden();
  });

  test('bozuk ayar verisi varsayılana döner ve oyun açılır', async ({ page }) => {
    await page.goto('/?debug');
    await page.evaluate((key) => localStorage.setItem(key, '{kırık'), KEYS.settings);
    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await action(page, 'settings').click();
    await expect(page.locator('#setting-music')).toHaveValue('60');
  });
});

for (const size of SIZES) {
  test.describe(`Düzen ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`menüler ve alt panel yatay taşmaz; zafer ekranı ve istatistik tablosu (${size.name})`, async ({ page }) => {
      await openGame(page);
      await expectNoHorizontalOverflow(page);
      await shot(page, `menu-${size.name}`);

      await action(page, 'start').click();
      await expect(screen(page, 'setup')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, `setup-${size.name}`);
      await action(page, 'back').click();

      await action(page, 'settings').click();
      await expect(screen(page, 'settings')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, `settings-${size.name}`);
      await page.keyboard.press('Escape');

      await startMatch(page, 'Kolay');
      await expectNoHorizontalOverflow(page);
      await shot(page, `battle-${size.name}`);
      await pauseGame(page);
      await expectNoHorizontalOverflow(page);
      await shot(page, `pause-${size.name}`);
      await action(page, 'resume').click();
      await expect(screen(page, 'pause')).toBeHidden();

      // Birlik üret, rakip üs canı 1 yap ve 1 hasar ver → Zafer (K-06, EK-06). Sonuç yapay zekâya bağlı olmasın diye hasar elle verilir.
      await page.getByRole('button', { name: 'Hız ×16' }).click();
      const result = screen(page, 'result');
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Digit1');
        await page.waitForTimeout(150);
      }
      await page.getByRole('button', { name: 'Rakip üs canı = 1' }).click();
      await page.getByRole('button', { name: 'Rakip üssüne 1 hasar' }).click();
      await expect(result).toBeVisible();
      await expect(result).toHaveAttribute('data-outcome', 'win');
      await expect(result.locator('.screen__title')).toHaveText('Zafer');
      await expect(result.locator('[data-table="units"] tbody tr').first()).toBeVisible();
      await expect(result.locator('[data-table="units"]')).toContainText('Taşbaltacı');
      await expect(result.locator('[data-table="summary"]')).toContainText('Kazanılan altın');
      await expect(result.locator('[data-table="summary"]')).toContainText('Üsse verilen hasar');
      await expect(result.locator('[data-table="summary"]')).toContainText('Çağ geçişleri');
      await expect(result).toContainText('Ulaşılan çağ');
      await expectNoHorizontalOverflow(page);
      await shot(page, `result-${size.name}`);

      // Kayıt silinmiş, sonuç geçmişe yazılmıştır.
      expect(await page.evaluate((key) => localStorage.getItem(key), KEYS.save)).toBeNull();
      const results = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as { entries: { opponent: string; result: string }[]; totals: Record<string, { wins: number }> }, KEYS.results);
      expect(results.entries[0]).toMatchObject({ opponent: 'easy', result: 'win' });
      expect(results.totals['easy']!.wins).toBe(1);

      // Yeniden oyna: tamamen temiz durum (K-08).
      await action(page, 'replay').click();
      await expect(result).toBeHidden();
      await expect.poll(async () => (await debugInfo(page)).tick, { timeout: 5000 }).toBeLessThan(60);
      await expect(page.locator('.hud-base--enemy .hud-base__hp')).toHaveText(/^(\d+) \/ \1$/);
      await expect(page.locator('.hud-base--player .hud-base__hp')).toHaveText(/^(\d+) \/ \1$/);
      await expect(page.locator('.queue-slot[data-kind="producing"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Hız ×1', exact: true })).toHaveAttribute('aria-pressed', 'true');

      // Ana menü → kurulum: geçmiş ve toplamlar görünür.
      await page.keyboard.press('Escape');
      await action(page, 'to-menu').click();
      await action(page, 'start').click();
      await expect(page.locator('.history__row').first()).toContainText('Zafer · Kolay');
      await expect(page.locator('.diff-card', { hasText: 'Kolay' }).locator('.diff-card__record')).toContainText('Galibiyet 1');
    });
  });
}
