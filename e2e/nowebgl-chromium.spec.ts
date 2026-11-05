import { test } from '@playwright/test';
import { expectFatalScreen, shot } from './helpers';

// Chromium'u WebGL'siz başlatır (gerçek bayraklar; yazılım GL bayrakları kullanılmaz).
test.skip(({ browserName }) => browserName !== 'chromium', 'Bayraklar yalnız Chromium için');
test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis', '--disable-gpu', '--disable-gpu-compositing'] } });

test('Chromium --disable-webgl/--disable-gpu: açıklayıcı hata ekranı görünür', async ({ page }) => {
  await page.goto('/?debug');
  await expectFatalScreen(page);
  await shot(page, 'no-webgl-chromium-flags');
});
