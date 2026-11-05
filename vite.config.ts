import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/** Oyun sürümü: package.json + kısa git karması (TDD §11). Git yoksa ya da depo değilse "dev". */
function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string };
  return pkg.version ?? '0.0.0';
}

function readCommit(): string {
  try {
    const out = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out.length > 0 ? out : 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(readVersion()),
    __APP_COMMIT__: JSON.stringify(readCommit()),
  },
  // E2E sırasında (DEVIR_E2E) sıcak yenileme kapalıdır: kaynak dosyalar değişince sayfa kendiliğinden yenilenip testi bozmaz.
  server: { hmr: process.env['DEVIR_E2E'] === undefined },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
