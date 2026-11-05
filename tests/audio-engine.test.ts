import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAudioEngine, type AudioEngine } from '../src/audio/engine';
import type { AudioEvent, SfxRequest } from '../src/audio/eventMapper';
import { MIX } from '../src/audio/config';
import { volumeToGain } from '../src/audio/volume';
import { UNITS } from '../src/data/units';
import { FakeContext, FakeGain, FakeParam, FakeTimer } from './audio-helpers';

function setup(opts: { minGapScale?: number } = {}) {
  const ctx = new FakeContext();
  const timer = new FakeTimer();
  const requests: SfxRequest[] = [];
  let factoryCalls = 0;
  const engine = createAudioEngine({
    contextFactory: () => {
      factoryCalls++;
      return ctx;
    },
    timer,
    random: () => 0.5,
    onSfx: (r) => requests.push(r),
    minGapScale: opts.minGapScale ?? 0,
  });
  return { ctx, timer, engine, requests, factoryCalls: () => factoryCalls };
}

const cast = (abilityId: string): AudioEvent => ({ type: 'abilityCast', side: 0, abilityId });

function callEverything(engine: AudioEngine): void {
  engine.setMusicVolume(30);
  engine.setSfxVolume(70);
  engine.setAge(2);
  engine.setTension(0.5);
  engine.pause();
  engine.resume();
  engine.playUi('click');
  engine.playUi('error');
  engine.playUi('notice');
  engine.playStinger('win');
  engine.playStinger('loss');
  engine.playStinger('draw');
  engine.handleEvents([{ type: 'attack', side: 0, attackerId: 1, target: 2, damage: 3 }], { playerSide: 0 });
  engine.handleEvents([]);
  engine.resetMatch();
  engine.warmup(3);
  engine.stopMusic();
}

describe('AudioEngine: kilit açılmadan önce', () => {
  it('tüm çağrılar istisnasız no-op; bağlam üretilmez', () => {
    const { engine, factoryCalls, requests } = setup();
    expect(engine.unlocked).toBe(false);
    expect(() => callEverything(engine)).not.toThrow();
    expect(() => engine.dispose()).not.toThrow();
    expect(factoryCalls()).toBe(0);
    expect(requests).toEqual([]);
  });

  it('AudioContext bulunmayan ortamda (varsayılan üretici) unlock güvenle başarısız olur', () => {
    const engine = createAudioEngine();
    expect(() => {
      engine.unlock();
      callEverything(engine);
      engine.dispose();
    }).not.toThrow();
    expect(engine.unlocked).toBe(false);
  });

  it('üretici null veya hata verirse kilit açılmaz, çağrılar yine güvenlidir', () => {
    for (const factory of [() => null, () => { throw new Error('yok'); }]) {
      const engine = createAudioEngine({ contextFactory: factory });
      expect(() => {
        engine.unlock();
        callEverything(engine);
      }).not.toThrow();
      expect(engine.unlocked).toBe(false);
    }
  });
});

describe('AudioEngine: kilit açma ve mikser', () => {
  it('unlock bağlamı bir kez oluşturur; askıdaysa devam ettirir', async () => {
    const { ctx, engine, factoryCalls } = setup();
    ctx.state = 'suspended';
    engine.unlock();
    engine.unlock();
    engine.unlock();
    expect(engine.unlocked).toBe(true);
    expect(factoryCalls()).toBe(1);
    await Promise.resolve();
    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
  });

  it('kilit açılmadan verilen ses düzeyleri saklanır ve açılışta uygulanır', () => {
    const { ctx, engine } = setup();
    engine.setMusicVolume(40);
    engine.setSfxVolume(90);
    engine.unlock();
    const values = ctx.gains.map((g) => g.gain.value);
    expect(values).toContain(volumeToGain(40));
    expect(values).toContain(volumeToGain(90));
  });

  it('kilit açıldıktan sonra düzeyler algısal eğriyle hedeflenir ve aralık dışı kırpılır', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    engine.setMusicVolume(50);
    engine.setSfxVolume(200);
    const targets = ctx.gains.flatMap((g) => g.gain.targets);
    expect(targets).toContain(0.25);
    expect(targets).toContain(1);
    engine.setMusicVolume(Number.NaN); // geçersiz değer yok sayılır
  });

  it('ana çıkış -> hedef; müzik/efekt kanalları ana çıkışa bağlıdır', () => {
    const { ctx, engine } = setup();
    engine.unlock();
    const master = ctx.gains.find((g) => g.connections.includes(ctx.destination))!;
    expect(master.gain.value).toBe(MIX.masterGain);
    const feeders = ctx.gains.filter((g) => g.connections.includes(master));
    expect(feeders.length).toBe(2); // müzik ve efekt kanalları
  });
});

describe('AudioEngine: sınırlayıcı', () => {
  it('bağlam DynamicsCompressor destekliyorsa ana çıkış sınırlayıcı üzerinden hedefe bağlanır', () => {
    class LimiterContext extends FakeContext {
      comp = Object.assign(new FakeGain(), {
        threshold: new FakeParam(),
        knee: new FakeParam(),
        ratio: new FakeParam(),
        attack: new FakeParam(),
        release: new FakeParam(),
      });
      createDynamicsCompressor() {
        return this.comp;
      }
    }
    const ctx = new LimiterContext();
    const engine = createAudioEngine({ contextFactory: () => ctx, timer: new FakeTimer() });
    engine.unlock();
    const master = ctx.gains.find((g) => g.connections.includes(ctx.comp))!;
    expect(master).toBeDefined();
    expect(ctx.comp.connections).toContain(ctx.destination);
    expect(ctx.comp.ratio.value).toBe(MIX.limiter.ratio);
    expect(ctx.comp.threshold.value).toBe(MIX.limiter.thresholdDb);
  });
});

describe('AudioEngine: olay -> ses', () => {
  it('SimEvent dizisi uygun efektleri ister (veriden çağ ve rol bulunur)', () => {
    const { engine, requests, ctx } = setup();
    engine.unlock();
    const ranged = UNITS.find((u) => u.age === 3 && u.role === 'ranged')!;
    engine.handleEvents(
      [
        { type: 'unitSpawned', side: 0, id: 1, unitType: ranged.id },
        { type: 'projectileFired', side: 0, id: 7, sourceType: ranged.id, target: 2 },
        { type: 'baseDamaged', side: 1, amount: 30 },
        { type: 'agedUp', side: 0, age: 3, paid: 0, baseHp: 1, baseMaxHp: 1 },
      ],
      { playerSide: 0, ages: [3, 1] },
    );
    expect(requests.map((r) => [r.sfx, r.age]).sort()).toEqual([
      ['ageUp', 3],
      ['baseHit', 1],
      ['shootRanged', 3],
      ['unitSpawn', 3],
    ]);
    expect(ctx.activeSources()).toHaveLength(4);
  });

  it('aynı karedeki yinelenen olaylar tek sese birleşir', () => {
    const { engine, ctx } = setup();
    engine.unlock();
    const events: AudioEvent[] = Array.from({ length: 10 }, (_, i) => ({ type: 'attack', side: 0, attackerId: i, target: 99, damage: 5 }));
    engine.handleEvents(events, { ages: [1, 1] });
    expect(ctx.activeSources()).toHaveLength(1);
  });

  it('kendi birliklerinin sesi rakibinkinden belirgindir (kazanç)', () => {
    const { engine, ctx } = setup();
    engine.unlock();
    engine.handleEvents([{ type: 'attack', side: 0, attackerId: 1, target: 2, damage: 5 }], { ages: [1, 1] });
    engine.handleEvents([{ type: 'attack', side: 1, attackerId: 2, target: 1, damage: 5 }], { ages: [1, 1] });
    const [own, enemy] = ctx.activeSources();
    expect(own!.gainNode!.gain.value).toBeGreaterThan(enemy!.gainNode!.gain.value);
  });

  it('aynı efekt aynı anda en fazla 4 kez çalar', () => {
    const { engine, ctx } = setup();
    engine.unlock();
    for (let i = 0; i < 10; i++) engine.handleEvents([cast('primitive_stampede')]);
    expect(ctx.activeSources()).toHaveLength(MIX.maxPerSfx);
    expect(ctx.sources.length).toBe(10);
  });

  it('toplam eşzamanlı ses en fazla 24; efekt başına 4', () => {
    const { engine, ctx } = setup();
    engine.unlock();
    const tower = 'primitive_tower_fast';
    const events: AudioEvent[][] = [
      [cast('primitive_stampede')],
      [cast('ancient_fire_trench')],
      [cast('medieval_caltrops')],
      [cast('industrial_barrage')],
      [cast('future_stasis')],
      [{ type: 'agedUp', side: 0, age: 2, paid: 0, baseHp: 1, baseMaxHp: 1 }],
      [{ type: 'towerBuilt', side: 0, slot: 0, towerType: tower, paid: 1 }],
      [{ type: 'towerSold', side: 0, slot: 0, towerType: tower, refund: 1 }],
    ];
    for (let round = 0; round < 6; round++) for (const e of events) engine.handleEvents(e);
    for (const s of ctx.activeSources()) expect(s.buffer).not.toBeNull();
    expect(ctx.activeSources().length).toBeLessThanOrEqual(MIX.maxTotal);
    expect(ctx.activeSources().length).toBeGreaterThan(MIX.maxPerSfx);
    const perBuffer = new Map<unknown, number>();
    for (const s of ctx.activeSources()) perBuffer.set(s.buffer, (perBuffer.get(s.buffer) ?? 0) + 1);
    for (const n of perBuffer.values()) expect(n).toBeLessThanOrEqual(MIX.maxPerSfx);
  });

  it('süresi dolan sesler yer açar (onended)', () => {
    const { engine, ctx } = setup();
    engine.unlock();
    for (let i = 0; i < 4; i++) engine.handleEvents([cast('primitive_stampede')]);
    ctx.currentTime = 100;
    engine.handleEvents([cast('primitive_stampede')]);
    expect(ctx.activeSources().filter((s) => s.startedAt === 100)).toHaveLength(1);
    expect(ctx.activeSources()).toHaveLength(5);
  });

  it('efekt başına en kısa aralık: çok sık gelen vuruşlar süzülür', () => {
    const { engine, ctx } = setup({ minGapScale: 1 });
    engine.unlock();
    for (let i = 0; i < 5; i++) engine.handleEvents([{ type: 'attack', side: 0, attackerId: i, target: 9, damage: 1 }], { ages: [1, 1] });
    expect(ctx.activeSources()).toHaveLength(1);
    ctx.currentTime = 1;
    engine.handleEvents([{ type: 'attack', side: 0, attackerId: 1, target: 9, damage: 1 }], { ages: [1, 1] });
    expect(ctx.activeSources()).toHaveLength(2);
  });

  it('arayüz sesleri ve stinger çalar; stinger maç başına bir kez (resetMatch ile yenilenir)', () => {
    const { engine, requests } = setup();
    engine.unlock();
    engine.playUi('click');
    engine.playUi('error');
    engine.playUi('notice');
    expect(requests.map((r) => r.sfx)).toEqual(['uiClick', 'uiError', 'uiNotice']);
    requests.length = 0;
    const end: AudioEvent = { type: 'matchEnded', outcome: { kind: 'win', winner: 0, tick: 10 } };
    engine.handleEvents([end]);
    engine.handleEvents([end]);
    expect(requests.map((r) => r.sfx)).toEqual(['stingerWin']);
    engine.resetMatch();
    engine.handleEvents([{ type: 'matchEnded', outcome: { kind: 'draw', tick: 10 } }]);
    expect(requests.map((r) => r.sfx)).toEqual(['stingerWin', 'stingerDraw']);
    requests.length = 0;
    engine.playStinger('loss');
    expect(requests.map((r) => r.sfx)).toEqual(['stingerLoss']);
  });
});

describe('AudioEngine: duraklatma', () => {
  it('pause oyun seslerini ve müziği keser, olayları yok sayar; arayüz sesi sürer; resume geri getirir', () => {
    const { engine, ctx, timer, requests } = setup();
    engine.unlock();
    engine.setAge(1);
    expect(timer.running).toBe(true);
    engine.handleEvents([cast('primitive_stampede')]);
    const gameSources = ctx.activeSources().length;
    expect(gameSources).toBeGreaterThan(0);

    engine.pause();
    expect(engine.paused).toBe(true);
    expect(timer.running).toBe(false);
    expect(ctx.activeSources()).toHaveLength(0);
    // Oyun kanalları sıfırlanır.
    const targets = ctx.gains.flatMap((g) => g.gain.targets);
    expect(targets).toContain(0);

    requests.length = 0;
    engine.handleEvents([cast('primitive_stampede')]);
    expect(requests).toEqual([]);
    engine.playUi('click');
    expect(requests.map((r) => r.sfx)).toEqual(['uiClick']);

    engine.resume();
    expect(engine.paused).toBe(false);
    expect(timer.running).toBe(true);
    engine.handleEvents([cast('primitive_stampede')]);
    expect(requests.map((r) => r.sfx)).toEqual(['uiClick', 'abilityStampede']);
  });

  it('kilit açılmadan önce pause edilmiş oyun, açılışta duraklı başlar', () => {
    const { engine, timer } = setup();
    engine.pause();
    engine.setAge(2);
    engine.unlock();
    expect(engine.paused).toBe(true);
    expect(timer.running).toBe(false);
    engine.resume();
    expect(timer.running).toBe(true);
  });
});

describe('AudioEngine: müzik ve yaşam döngüsü', () => {
  it('setAge kilit açılmadan verilebilir; açılışta o çağın müziği başlar; çağ değişince geçiş yapılır', () => {
    const { engine, ctx, timer } = setup();
    engine.setAge(4);
    engine.unlock();
    expect(timer.running).toBe(true);
    const firstSources = ctx.sources.length;
    expect(firstSources).toBeGreaterThan(0);
    ctx.currentTime = 10;
    engine.setAge(5);
    ctx.currentTime = 11;
    timer.fire();
    expect(ctx.sources.length).toBeGreaterThan(firstSources);
    engine.stopMusic();
  });

  it('efektler çağ başına bir kez üretilip önbelleğe alınır', () => {
    const { engine, ctx } = setup();
    engine.unlock();
    engine.handleEvents([cast('future_stasis')]);
    const buffers = ctx.buffers.length;
    ctx.currentTime = 50;
    engine.handleEvents([cast('future_stasis')]);
    expect(ctx.buffers.length).toBe(buffers);
    expect(ctx.sources[0]!.buffer).toBe(ctx.sources[1]!.buffer);
  });

  it('dispose bağlamı kapatır ve sonrasında her çağrı güvenli no-op olur', async () => {
    const { engine, ctx, timer } = setup();
    engine.unlock();
    engine.setAge(2);
    engine.dispose();
    await Promise.resolve();
    expect(ctx.closed).toBe(true);
    expect(timer.running).toBe(false);
    expect(engine.unlocked).toBe(false);
    expect(() => {
      engine.unlock();
      callEverything(engine);
      engine.dispose();
    }).not.toThrow();
    expect(engine.unlocked).toBe(false);
  });
});

describe('Mimari: src/audio DOM kullanmaz', () => {
  function listFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...listFiles(full));
      else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
  }
  const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const SRC = join(__dirname, '..', 'src');

  it('document, window, navigator, depolama ve çizim döngüsü adları yok; yalnızca alt katmanlar içe aktarılır', () => {
    const files = listFiles(join(SRC, 'audio'));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const code = strip(readFileSync(file, 'utf8'));
      const rel = relative(SRC, file);
      for (const name of ['document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'requestAnimationFrame', 'HTMLElement']) {
        expect(new RegExp(`(^|[^\\w.])${name}(?![\\w])`).test(code), `${rel}: ${name}`).toBe(false);
      }
      for (const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        expect(spec.startsWith('.'), `${rel}: dış bağımlılık ${spec}`).toBe(true);
        const layer = relative(SRC, join(file, '..', spec)).split(/[\\/]/)[0];
        expect(['audio', 'data', 'sim'], `${rel} -> ${spec}`).toContain(layer);
      }
    }
  });
});
