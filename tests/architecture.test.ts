import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const LAYERS = ['data', 'sim', 'ai', 'match'] as const;
type Layer = (typeof LAYERS)[number];

/** Katmanın içe aktarabileceği katmanlar: data ← sim ← ai ← match. */
const ALLOWED: Record<Layer, readonly Layer[]> = {
  data: ['data'],
  sim: ['data', 'sim'],
  ai: ['data', 'sim', 'ai'],
  match: ['data', 'sim', 'ai', 'match'],
};

const FORBIDDEN_NAMES = ['document', 'window', 'Math.random', 'Date', 'performance', 'setTimeout', 'setInterval'];
const FORBIDDEN_IMPORTS = ['render', 'ui', 'audio', 'game', 'pixi.js'];

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

describe('Mimari: katman kuralları ve yasaklı genel adlar', () => {
  for (const layer of LAYERS) {
    const files = listFiles(join(SRC, layer));
    it(`${layer}: dosyalar var, yasaklı içe aktarma ve genel ad yok, bağımlılık yönü doğru`, () => {
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const code = stripComments(readFileSync(file, 'utf8'));
        const rel = relative(SRC, file);
        for (const spec of importsOf(code)) {
          for (const bad of FORBIDDEN_IMPORTS) {
            expect(spec === bad || spec.includes(`/${bad}/`) || spec.endsWith(`/${bad}`), `${rel} yasaklı içe aktarma: ${spec}`).toBe(false);
          }
          if (spec.startsWith('.')) {
            const target = relative(SRC, join(file, '..', spec)).split(/[\\/]/)[0] as Layer;
            expect(ALLOWED[layer].includes(target), `${rel} -> ${spec} katman yönünü bozuyor`).toBe(true);
          } else {
            expect(spec.startsWith('node:'), `${rel} dış bağımlılık: ${spec}`).toBe(false);
          }
        }
        for (const name of FORBIDDEN_NAMES) {
          const re = new RegExp(`(^|[^\\w.])${name.replace('.', '\\.')}(?![\\w])`);
          expect(re.test(code), `${rel} yasaklı ad içeriyor: ${name}`).toBe(false);
        }
      }
    });
  }
});
