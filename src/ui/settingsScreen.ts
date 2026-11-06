import type { Flow } from '../game/flow';
import { VOLUME_MAX, VOLUME_MIN } from '../game/constants';
import { versionLabel } from '../game/version';
import { fmt, formatSpeed, getLanguage, isLanguage, LANGUAGES, tr } from '../i18n';
import { GAME_SPEEDS } from '../game/constants';
import { isGameSpeed } from '../game/settings';
import { VOLUME_STEP } from './constants';
import { el } from './dom';
import { fallbackLabel, loadKeyLabeler, shortcutRows, type KeyLabeler } from './shortcuts';
import type { MountedScreen } from './menuScreens';
import { actionButton, createScreen, heading, visibilityToggle } from './widgets';

/**
 * Ayarlar (PRD EK-07): değişiklik anında uygulanır ve saklanır; kısayol listesi salt görüntülemedir.
 * Dil değişince (PRD G-04) ayar saklanır ve sayfa yeniden yüklenir: süren maç önce kaydedilir, böylece "Devam et" sürdürür.
 */
export function mountSettings(
  root: HTMLElement,
  flow: Flow,
  reloadPage: () => void = () => globalThis.location.reload(),
): MountedScreen & { dismiss(): boolean } {
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

  // Oyun hızı (PRD G-08): seçim saklanır ve hemen uygulanır.
  const speedRow = el('div', 'settings__row', form);
  const speedLabel = el('label', 'settings__label', speedRow);
  speedLabel.htmlFor = 'setting-speed';
  speedLabel.textContent = tr.settings.speed;
  const speed = el('select', 'settings__select', speedRow);
  speed.id = 'setting-speed';
  for (const n of GAME_SPEEDS) {
    const option = el('option', undefined, speed);
    option.value = String(n);
    option.textContent = fmt(tr.settings.speedOption, { n: formatSpeed(n) });
  }
  const speedHint = el('p', 'settings__hint', form);
  speedHint.id = 'setting-speed-hint';
  speedHint.textContent = tr.settings.speedHint;
  speed.setAttribute('aria-describedby', speedHint.id);
  speed.addEventListener('change', () => {
    const next = Number(speed.value);
    if (isGameSpeed(next)) flow.settings.update({ gameSpeed: next });
  });

  const languageRow = el('div', 'settings__row', form);
  const languageLabel = el('label', 'settings__label', languageRow);
  languageLabel.htmlFor = 'setting-language';
  languageLabel.textContent = tr.settings.language;
  const language = el('select', 'settings__select', languageRow);
  language.id = 'setting-language';
  for (const code of LANGUAGES) {
    const option = el('option', undefined, language);
    option.value = code;
    option.textContent = tr.settings.languageOptions[code];
  }
  language.value = getLanguage();
  const languageHint = el('p', 'settings__hint', form);
  languageHint.id = 'setting-language-hint';
  languageHint.textContent = tr.settings.languageLocked;
  languageHint.hidden = true;
  language.addEventListener('change', () => {
    const next = language.value;
    if (!isLanguage(next) || next === getLanguage() || flow.tutorial !== null) {
      language.value = getLanguage();
      return;
    }
    // Süren maç kaydedilir (öğretici maçı kaydedilmez ve zaten kilitlidir); yenilemeden sonra "Devam et" sürdürür.
    flow.saveNow();
    flow.settings.update({ language: next });
    reloadPage();
  });

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
    speed.value = String(s.gameSpeed);
  });

  const toggle = visibilityToggle(screen, () => music.input, true);
  function update(): void {
    toggle(flow.settingsOpen);
    // Öğretici sırasında dil seçicisi kilitlidir (öğretici maçı kaydedilmez, yenileme onu kaybettirirdi).
    const locked = flow.tutorial !== null;
    if (language.disabled !== locked) {
      language.disabled = locked;
      languageHint.hidden = !locked;
      if (locked) language.setAttribute('aria-describedby', languageHint.id);
      else language.removeAttribute('aria-describedby');
    }
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
