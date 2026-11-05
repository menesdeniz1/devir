import { test } from '@playwright/test';
import { expectFatalScreen, shot } from './helpers';

test.describe('WebGL yok', () => {
  test('tüm tarayıcılar: WebGL bağlamı oluşturulamıyorsa hata ekranı görünür', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (typeof type === 'string' && type.startsWith('webgl')) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as typeof original;
      Object.defineProperty(navigator, 'gpu', { configurable: true, get: () => undefined });
    });
    await page.goto('/?debug');
    await expectFatalScreen(page);
    await shot(page, 'no-webgl-stub');
  });
});
