import type { AudioEngine } from '../audio';
import { PLAYER_SIDE } from '../game/constants';
import type { Flow } from '../game/flow';

/**
 * Ses motorunu oyun akışına bağlar: ilk etkileşimde kilit açma, ayarlardaki ses düzeyleri, oturum olayları,
 * duraklatma, çağ müziği ve ana menüde müziğin durması (TDD §8). Döndürülen işlev bağlantıyı söker.
 */
export function connectAudio(audio: AudioEngine, flow: Flow, target: Pick<Document, 'addEventListener' | 'removeEventListener'>): () => void {
  const session = flow.session;
  const unlock = (): void => audio.unlock();
  target.addEventListener('pointerdown', unlock, true);
  target.addEventListener('keydown', unlock, true);

  const stopSettings = flow.settings.subscribe((s) => {
    audio.setMusicVolume(s.musicVolume);
    audio.setSfxVolume(s.sfxVolume);
  });

  const stopSession = session.subscribe((event) => {
    switch (event.type) {
      case 'sim': {
        const sides = session.state.sides;
        audio.handleEvents(event.events, { playerSide: PLAYER_SIDE, ages: [sides[0].age, sides[1].age] });
        for (const e of event.events) if (e.type === 'agedUp' && e.side === PLAYER_SIDE) audio.setAge(e.age);
        break;
      }
      case 'paused':
        if (event.paused) audio.pause();
        else audio.resume();
        break;
      case 'reset':
        audio.resetMatch();
        audio.setAge(session.state.sides[PLAYER_SIDE].age);
        break;
      case 'ended':
        break;
    }
  });

  const stopFlow = flow.subscribe((event) => {
    if (event.type === 'screen' && flow.screen !== 'battle') audio.stopMusic();
  });

  return () => {
    target.removeEventListener('pointerdown', unlock, true);
    target.removeEventListener('keydown', unlock, true);
    stopSettings();
    stopSession();
    stopFlow();
  };
}
