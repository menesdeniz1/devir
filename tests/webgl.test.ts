import { describe, expect, it } from 'vitest';
import { probeWebgl2 } from '../src/ui/webgl';

type FakeContext = { getExtension: (name: string) => { loseContext(): void } | null };

function docWith(getContext: (type: string) => FakeContext | null): Pick<Document, 'createElement'> {
  return { createElement: () => ({ getContext }) } as unknown as Pick<Document, 'createElement'>;
}

describe('WebGL2 yoklaması (TDD §12)', () => {
  it('bağlam yoksa ayrıntılı hata döner', () => {
    expect(probeWebgl2(docWith(() => null))).toContain('WebGL2');
  });

  it('bağlam varsa null döner ve yoklama bağlamı serbest bırakılır', () => {
    let lost = 0;
    const ctx: FakeContext = { getExtension: () => ({ loseContext: () => (lost += 1) }) };
    expect(probeWebgl2(docWith((type) => (type === 'webgl2' ? ctx : null)))).toBeNull();
    expect(lost).toBe(1);
  });

  it('yalnız webgl2 istenir (WebGL1 yeterli sayılmaz); istisna hata metnine çevrilir', () => {
    const asked: string[] = [];
    probeWebgl2(docWith((type) => (asked.push(type), null)));
    expect(asked).toEqual(['webgl2']);
    const throwing = { createElement: () => { throw new Error('engellendi'); } } as unknown as Pick<Document, 'createElement'>;
    expect(probeWebgl2(throwing)).toBe('engellendi');
  });
});
