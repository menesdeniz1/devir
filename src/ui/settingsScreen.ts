import type { Flow } from '../game/flow';
import { VOLUME_MAX, VOLUME_MIN } from '../game/constants';
import { versionLabel } from '../game/version';
import { fmt, tr } from '../i18n/tr';
import { VOLUME_STEP } from './constants';
import { el } from './dom';
import { fallbackLabel, loadKeyLabeler, shortcutRows, type KeyLabeler } from './shortcuts';
import type { MountedScreen } from './menuScreens';
import { actionButton, createScreen, heading, visibilityToggle } from './widgets';

/** Ayarlar (PRD EK-07): değişiklik anında uygulanır ve saklanır; kısayol listesi salt görüntülemedir. */
export function mountSettings(root: HTMLElement, flow: Flow): MountedScreen & { dismiss(): boolean } {
  const { root: screen, card } = createScreen(root, 'screen--settings', true);
  screen.dataset['screen'] = 'settings';
  heading(card, tr.settings.title, 'settings-title');

  const form = el('div', 'settings__form', card);

  function slider(label: string, key: 'musicVolume' | 'sfxVolume', id: string): { input: HTMLInputElement; value: HTMLElement } {
    const row = el('div', 'settings__row', form);
    const text = el('label', 'settings__label', row);
    text.htmlFor = id;
    text.textContent = label;
    const input = el('input', 'settings__slider', row);
    input.type = 'range';
    input.id = id;
    input.min = String(VOLUME_MIN);
    input.max = String(VOLUME_MAX);
    input.step = String(VOLUME_STEP);
    const value = el('output', 'settings__value', row);
    value.htmlFor = id;
    input.addEventListener('input', () => flow.settings.update({ [key]: Number(input.value) }));
    return { input, value };
  }
  const music = slider(tr.settings.music, 'musicVolume', 'setting-music');
  const sfx = slider(tr.settings.sfx, 'sfxVolume', 'setting-sfx');

  const shakeRow = el('div', 'settings__row', form);
  const shakeLabel = el('label', 'settings__label', shakeRow);
  shakeLabel.htmlFor = 'setting-shake';
  shakeLabel.textContent = tr.settings.shake;
  const shake = el('input', 'settings__check', shakeRow);
  shake.type = 'checkbox';
  shake.id = 'setting-shake';
  const shakeValue = el('output', 'settings__value', shakeRow);
  shakeValue.htmlFor = 'setting-shake';
  shake.addEventListener('change', () => flow.settings.update({ screenShake: shake.checked }));

  const shortcutsTitle = el('h3', 'settings__subtitle', card);
  shortcutsTitle.textContent = tr.settings.shortcuts;
  const list = el('dl', 'shortcuts', card);

  function renderShortcuts(label: KeyLabeler): void {
    list.replaceChildren();
    for (const row of shortcutRows(label)) {
      const term = el('dt', 'shortcuts__action', list);
      term.textContent = row.action;
      const keys = el('dd', 'shortcuts__keys', list);
      for (const k of row.keys) {
        const cap = el('kbd', 'shortcuts__key', keys);
        cap.textContent = k;
      }
    }
  }
  renderShortcuts(fallbackLabel);
  void loadKeyLabeler().then((label) => {
    if (label !== fallbackLabel) renderShortcuts(label);
  });

  const version = el('p', 'settings__version', card);
  version.textContent = `${tr.settings.version}: ${versionLabel()}`;
  version.dataset['role'] = 'version';

  const buttons = el('div', 'screen__buttons', card);
  const back = actionButton(buttons, tr.settings.back, { ariaLabel: tr.settings.backAria, primary: true, onClick: () => flow.closeSettings() });
  back.dataset['action'] = 'settings-back';

  const unsubscribe = flow.settings.subscribe((s) => {
    music.input.value = String(s.musicVolume);
    music.value.textContent = fmt(tr.settings.volumeValue, { n: s.musicVolume });
    sfx.input.value = String(s.sfxVolume);
    sfx.value.textContent = fmt(tr.settings.volumeValue, { n: s.sfxVolume });
    shake.checked = s.screenShake;
    shakeValue.textContent = s.screenShake ? tr.settings.shakeOn : tr.settings.shakeOff;
  });

  const toggle = visibilityToggle(screen, () => music.input, true);
  function update(): void {
    toggle(flow.settingsOpen);
  }
  update();

  return {
    update,
    dismiss(): boolean {
      if (!flow.settingsOpen) return false;
      flow.closeSettings();
      return true;
    },
    destroy(): void {
      unsubscribe();
      screen.remove();
    },
  };
}
