import { defineConfig, devices } from '@playwright/test';

/** E2E için ayrı vite geliştirme sunucusu portu (TDD §10). Oyun `?debug` ile açılır. */
const PORT = 5190;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    /**
     * Dil otomatik seçilir (PRD G-04): varsayılan tarayıcı dili en-US olurdu ve mevcut Türkçe testler İngilizce açılırdı.
     * Tüm projeler tr-TR'de sabitlenir; İngilizce testler (e2e/english.spec.ts) kendi dosyasında en-US'a geçer.
     */
    locale: 'tr-TR',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    env: { DEVIR_E2E: '1' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
