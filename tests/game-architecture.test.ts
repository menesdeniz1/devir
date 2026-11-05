import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importsOf(code: string): string[] {
  const found: string[] = [];
  const re = /(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(re)) found.push((m[1] ?? m[2] ?? m[3])!);
  return found;
}

function layerOf(file: string, spec: string): string {
  return relative(SRC, join(file, '..', spec)).split(/[\\/]/)[0]!;
}

describe('Mimari: game katmanı başsızdır (TDD §2)', () => {
  it('game: render, ui, audio ve pixi.js içe aktarmaz; document/window kullanmaz', () => {
    const files = listFiles(join(SRC, 'game'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const rel = relative(SRC, file);
      for (const spec of importsOf(code)) {
        expect(spec, `${rel} dış bağımlılık`).toMatch(/^\./);
        const target = layerOf(file, spec);
        expect(['data', 'sim', 'ai', 'match', 'game', 'i18n'], `${rel} -> ${spec} katman yönünü bozuyor`).toContain(target);
      }
      for (const name of ['document', 'window', 'localStorage']) {
        expect(new RegExp(`(^|[^\\w.])${name}(?![\\w])`).test(code), `${rel} yasaklı ad: ${name}`).toBe(false);
      }
    }
  });

  it('render ve ui: yalnızca alt katmanları kullanır; birbirini içe aktarmaz', () => {
    const allowed: Record<string, string[]> = {
      render: ['data', 'sim', 'game', 'i18n', 'render'],
      ui: ['data', 'sim', 'game', 'i18n', 'ui'],
    };
    for (const layer of ['render', 'ui']) {
      for (const file of listFiles(join(SRC, layer))) {
        const code = stripComments(readFileSync(file, 'utf8'));
        const rel = relative(SRC, file);
        for (const spec of importsOf(code)) {
          if (!spec.startsWith('.')) continue;
          expect(allowed[layer]!, `${rel} -> ${spec} katman yönünü bozuyor`).toContain(layerOf(file, spec));
        }
      }
    }
  });

  it('render ve ui: sim durumunu doğrudan değiştiren çağrılar yalnızca debug panelinde', () => {
    // UI/render sim.step veya stepMatch çağırmaz; durumu yalnızca oturum üzerinden ilerletir.
    for (const layer of ['render', 'ui']) {
      for (const file of listFiles(join(SRC, layer))) {
        const code = stripComments(readFileSync(file, 'utf8'));
        const rel = relative(SRC, file);
        expect(/\bstepMatch\b|sim\/step/.test(code), `${rel} simülasyonu doğrudan adımlıyor`).toBe(false);
        if (!rel.endsWith('debugPanel.ts')) expect(code.includes('debugMutate'), `${rel} durumu doğrudan değiştiriyor`).toBe(false);
      }
    }
  });
});
