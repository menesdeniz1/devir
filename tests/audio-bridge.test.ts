import { describe, expect, it } from 'vitest';
import type { AudioEngine } from '../src/audio';
import type { AudioEventContext } from '../src/audio';
import { connectAudio } from '../src/app/audioBridge';
import { Flow } from '../src/game/flow';
import { Session } from '../src/game/session';
import { createSave, parseSave, serializeSave } from '../src/game/save';
import type { AudioEvent } from '../src/audio';
import { MemoryStorage } from './persistence-helpers';
import { FRONT_ID } from './helpers';

/** Yalnız çağrıları kaydeden sahte ses motoru. */
function fakeAudio(): { audio: AudioEngine; calls: { events: readonly AudioEvent[]; context?: AudioEventContext }[] } {
  const calls: { events: readonly AudioEvent[]; context?: AudioEventContext }[] = [];
  const noop = (): void => undefined;
  const audio = {
    unlock: noop,
    unlocked: false,
    setMusicVolume: noop,
    setSfxVolume: noop,
    pause: noop,
    resume: noop,
    paused: false,
    setAge: noop,
    setTension: noop,
    playUi: noop,
    handleEvents: (events: readonly AudioEvent[], context?: AudioEventContext) => calls.push(context === undefined ? { events } : { events, context }),
    playStinger: noop,
    resetMatch: noop,
    stopMusic: noop,
    warmup: noop,
    dispose: noop,
  } as unknown as AudioEngine;
  return { audio, calls };
}

describe('Ses köprüsü: olay bağlamı', () => {
  it('handleEvents bağlamına yaşayan birlikler (kimlik → tür) eklenir; kayıttan devamda tür yedeği çalışır', () => {
    // Birlikli bir durum kaydet, yeni oturumda yükle, bir kare ilerlet.
    const first = new Session({ seed: 3, opponent: 'none' });
    first.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    for (let i = 0; i < 120 && first.state.units.length === 0; i++) first.advance(50);
    expect(first.state.units.length).toBeGreaterThan(0);
    const parsed = parseSave(serializeSave(createSave(first.state, '0.1.0', 0)), '0.1.0');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const session = new Session({ opponent: 'none' });
    const flow = new Flow({ session, storage: new MemoryStorage(), gameVersion: '0.1.0' });
    const { audio, calls } = fakeAudio();
    const doc = { addEventListener: () => undefined, removeEventListener: () => undefined };
    connectAudio(audio, flow, doc);
    session.startMatch(parsed.save.matchConfig, parsed.save.state);
    // Oyuncuya ait yeni bir olay: birlik saldırısı/hareketi yoksa bile bir kare sim olayı üretmek için komut ver.
    session.submit({ type: 'queueUnit', side: 0, unitId: FRONT_ID });
    for (let i = 0; i < 5; i++) session.advance(50);
    expect(calls.length).toBeGreaterThan(0);
    const context = calls[0]!.context!;
    expect(context.playerSide).toBe(0);
    expect(context.ages).toEqual([1, 1]);
    expect(context.units).toBeDefined();
    const ids = context.units!.map((u) => u.id).sort();
    expect(ids).toEqual(parsed.save.state.units.map((u) => u.id).sort());
    for (const u of context.units!) expect(u.type).toBe(parsed.save.state.units.find((x) => x.id === u.id)!.type);
  });
});
