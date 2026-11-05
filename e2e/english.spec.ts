import { expect, test, type Page } from '@playwright/test';
import { AGES } from '../src/data/ages';
import { fmt } from '../src/i18n';
import { en } from '../src/i18n/en';
import { KEYS, action, debugInfo, dismissTutorialOfferInit, expectNoHorizontalOverflow, openGame, pauseGame, screen, shot } from './helpers';

/**
 * İngilizce arayüz (PRD G-04). Playwright yapılandırması varsayılanı tr-TR'ye sabitler; bu dosya en-US'a geçer, böylece
 * ayar saklı değilken tarayıcı dili otomatik İngilizceyi seçer.
 */
test.use({ locale: 'en-US', viewport: { width: 1280, height: 720 } });

const storage = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);
const storedSettings = async (page: Page): Promise<Record<string, unknown>> =>
  JSON.parse((await storage(page, KEYS.settings)) ?? '{}') as Record<string, unknown>;

/** Ana menü → kurulum → zorluk seç → Başlat (İngilizce etiketlerle). */
async function startMatchEn(page: Page, difficulty: 'Easy' | 'Normal' | 'Hard' = 'Normal'): Promise<void> {
  await action(page, 'start').click();
  await expect(screen(page, 'setup')).toBeVisible();
  await page.locator('.diff-card', { hasText: difficulty }).click();
  await action(page, 'begin').click();
  await expect(page.locator('.hud-bottom')).toBeVisible();
}

/** Geliştirme paneli düğmesini fare olayı üretmeden tıklar. */
async function debugClick(page: Page, name: string, times = 1): Promise<void> {
  await page.evaluate(
    ([label, n]) => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('.debug button')].find((b) => b.textContent === label);
      for (let i = 0; i < Number(n); i++) button?.click();
    },
    [name, times] as const,
  );
}

/** Ayarlar ekranında dili seçer; sayfanın yeniden yüklenmesini beklemez (sonraki beklemeler yeniden dener). */
async function chooseLanguage(page: Page, code: 'tr' | 'en'): Promise<void> {
  await page.locator('#setting-language').selectOption(code);
}

test.describe('İngilizce: açılış ve oynanış', () => {
  test('tarayıcı dili en-US: ayar yokken menü İngilizce açılır', async ({ page }) => {
    await page.goto('/?debug');
    await expect(screen(page, 'menu')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Devir');
    await expect(page.locator('.menu__logo')).toHaveText('Devir');
    await expect(page.locator('.menu__tagline')).toHaveText(en.menu.tagline);
    await expect(action(page, 'start')).toHaveText('Start game');
    await expect(action(page, 'continue')).toContainText('Continue');
    await expect(action(page, 'continue')).toBeDisabled();
    await expect(action(page, 'settings')).toHaveText('Settings');
    // İlk açılış önerisi de İngilizcedir.
    await expect(screen(page, 'tutorial-offer')).toBeVisible();
    await expect(screen(page, 'tutorial-offer')).toContainText(en.tutorial.offerTitle);
    // Dil seçimi henüz saklanmadı: otomatik.
    expect(await storage(page, KEYS.settings)).toBeNull();
    await shot(page, 'en-menu-offer');
  });

  test('maç başlat ve birlik üret: HUD metinleri İngilizce', async ({ page }) => {
    await dismissTutorialOfferInit(page);
    await openGame(page);
    await action(page, 'start').click();
    await expect(screen(page, 'setup')).toBeVisible();
    await expect(page.locator('.diff-card')).toHaveCount(3);
    await expect(page.locator('.diff-card[data-selected="true"]')).toContainText('Normal');
    await expect(page.locator('.diff-card__record').first()).toContainText('Wins 0 · Losses 0');
    await shot(page, 'en-setup');
    await action(page, 'begin').click();
    await expect(page.locator('.hud-bottom')).toBeVisible();

    await expect(page.locator('.hud-base--player .hud-base__name')).toHaveText('You');
    await expect(page.locator('.hud-base--enemy .hud-base__name')).toHaveText('Enemy');
    await expect(page.locator('.hud-stone__label')).toHaveText('Border Stone');
    await expect(page.locator('.hud-stone__value')).toHaveText('Neutral');
    await expect(page.locator('.hud-base--player .hud-base__age')).toHaveText('Primitive Age');
    await expect(page.locator('.btn--age')).toContainText('Age Up');

    const produce = page.getByRole('button', { name: /^Produce: Stone Axeman, \d+ gold, shortcut 1/ });
    await expect(produce).toBeVisible();
    await page.keyboard.press('Digit1');
    await expect(page.locator('.queue-slot[data-kind="producing"]')).toHaveCount(1);
    await expect(page.locator('.queue-slot[data-kind="producing"] .queue-slot__mark')).toHaveText(en.roleMark.front);
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(20);

    // Araç ipucu İngilizce ve ondalık ayracı noktadır.
    const title = (await produce.getAttribute('title')) ?? '';
    expect(title).toContain('Stone Axeman');
    expect(title).toContain('HP ');
    expect(title).toMatch(/Build \d+(\.\d)?s/);
    expect(title).not.toMatch(/\d,\d/);
    await shot(page, 'en-battle');
  });
});

test.describe('İngilizce: dil değiştirme', () => {
  test('Ayarlar → Türkçe: sayfa yenilenir, arayüz Türkçe olur ve seçim kalıcıdır; geri İngilizceye dönülür', async ({ page }) => {
    await dismissTutorialOfferInit(page);
    await openGame(page);
    await action(page, 'settings').click();
    await expect(screen(page, 'settings')).toBeVisible();
    const select = page.locator('#setting-language');
    await expect(page.locator('label[for="setting-language"]')).toHaveText('Language');
    // Her dil kendi adıyla gösterilir.
    await expect(select.locator('option')).toHaveText(['Türkçe', 'English']);
    await expect(select).toHaveValue('en');
    await expect(select).toBeEnabled();
    await shot(page, 'en-settings');

    await chooseLanguage(page, 'tr');
    await expect(screen(page, 'menu')).toBeVisible();
    await expect(action(page, 'start')).toHaveText('Oyuna başla');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
    expect((await storedSettings(page))['language']).toBe('tr');

    // Kalıcı: yeniden yükleme Türkçe açar; ayarlar ekranı seçimi gösterir.
    await page.reload();
    await expect(action(page, 'start')).toHaveText('Oyuna başla');
    await action(page, 'settings').click();
    await expect(page.locator('#setting-language')).toHaveValue('tr');
    await expect(page.locator('label[for="setting-language"]')).toHaveText('Dil');

    // Geri: İngilizce.
    await chooseLanguage(page, 'en');
    await expect(action(page, 'start')).toHaveText('Start game');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect((await storedSettings(page))['language']).toBe('en');
  });

  test('açık dil seçimi tarayıcı dilini ezer: tr kayıtlıysa en-US tarayıcıda da Türkçe açılır', async ({ page }) => {
    await dismissTutorialOfferInit(page);
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ musicVolume: 33, language: 'tr' })), KEYS.settings);
    await openGame(page);
    await expect(action(page, 'start')).toHaveText('Oyuna başla');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  });

  test('eski ayar kaydı (dil alanı yok) çalışır: tarayıcı dilinden İngilizce açılır, ses ayarları korunur', async ({ page }) => {
    await dismissTutorialOfferInit(page);
    await page.addInitScript(
      (key) => {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify({ musicVolume: 35, sfxVolume: 45, screenShake: false }));
      },
      KEYS.settings,
    );
    await openGame(page);
    await expect(action(page, 'start')).toHaveText('Start game');
    await action(page, 'settings').click();
    await expect(page.locator('#setting-music')).toHaveValue('35');
    await expect(page.locator('#setting-sfx')).toHaveValue('45');
    await expect(page.locator('#setting-shake')).not.toBeChecked();
  });

  test('maç sürerken dil değişir: yenilemeden sonra Devam et aynı maçı sürdürür', async ({ page }) => {
    await dismissTutorialOfferInit(page);
    await openGame(page);
    await startMatchEn(page, 'Easy');
    await page.keyboard.press('Digit1');
    await expect(page.locator('.queue-slot[data-kind="producing"]')).toHaveCount(1);
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(20);

    await pauseGame(page);
    await expect(screen(page, 'pause')).toContainText('Paused');
    await page.waitForTimeout(150);
    const before = await debugInfo(page);
    await action(page, 'pause-settings').click();
    await expect(screen(page, 'settings')).toBeVisible();
    await chooseLanguage(page, 'tr');

    // Yenilemeden sonra ana menü Türkçe; kayıt var ve "Devam et" açık.
    await expect(action(page, 'start')).toHaveText('Oyuna başla');
    await expect(action(page, 'continue')).toBeEnabled();
    await expect(action(page, 'continue')).toContainText('Kolay');
    await action(page, 'continue').click();

    // Aynı maç: tick ve durum karması aynı, duraklatma ekranı Türkçe.
    await expect(screen(page, 'pause')).toBeVisible();
    await expect(screen(page, 'pause')).toContainText('Duraklatıldı');
    await page.waitForTimeout(150);
    expect(await debugInfo(page)).toEqual(before);
    await expect(page.locator('.hud-base--player .hud-base__name')).toHaveText('Sen');
    await expect(page.locator('.queue-slot[data-kind="producing"], .queue-slot[data-kind="empty"]').first()).toBeVisible();
    await action(page, 'resume').click();
    await expect.poll(async () => (await debugInfo(page)).tick).toBeGreaterThan(before.tick + 10);
    await shot(page, 'en-switch-continue-tr');
  });

  test('öğretici sırasında dil seçicisi kilitlidir ve ipucu gösterilir; maç kaydedilmez', async ({ page }) => {
    await page.goto('/?debug');
    await action(page, 'tutorial-offer-start').click();
    await expect(page.locator('.tutorial')).toBeVisible();
    await pauseGame(page);
    await action(page, 'pause-settings').click();
    await expect(screen(page, 'settings')).toBeVisible();
    await expect(page.locator('#setting-language')).toBeDisabled();
    await expect(page.locator('#setting-language-hint')).toBeVisible();
    await expect(page.locator('#setting-language-hint')).toHaveText(en.settings.languageLocked);
    await expect(page.locator('#setting-language')).toHaveAttribute('aria-describedby', 'setting-language-hint');
    await shot(page, 'en-settings-tutorial-locked');
    expect(await storage(page, KEYS.save)).toBeNull();
    expect((await storedSettings(page))['language']).toBeUndefined();

    // Öğretici bitince (atlanınca) seçici yeniden açılır ve ipucu kaybolur.
    await page.keyboard.press('Escape');
    await action(page, 'tutorial-skip').click();
    await expect(screen(page, 'menu')).toBeVisible();
    await action(page, 'settings').click();
    await expect(page.locator('#setting-language')).toBeEnabled();
    await expect(page.locator('#setting-language-hint')).toBeHidden();
  });
});

/** Üst şerit ve alt panelde kesilen metin, taşan ya da üst üste binen öğe yok. */
async function expectHudFits(page: Page, label: string): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = (node: Element): boolean => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    };
    const name = (node: Element): string => `${node.tagName.toLowerCase()}.${(node as HTMLElement).className}`;
    // Kesilen metin: kutu içeriği kutudan büyük.
    for (const node of document.querySelectorAll<HTMLElement>('.hud-top *, .hud-bottom *')) {
      if (!visible(node) || getComputedStyle(node).display === 'inline') continue;
      // Yetenek düğmesinin kısayol rozeti bilerek köşeden taşar (style.css .ability__key); yetenek adı ve durumu ayrıca denetlenir.
      if (node.matches('.hud-ability, .btn--ability')) continue;
      if (node.scrollWidth > node.clientWidth + 1) out.push(`kesiliyor (yatay): ${name(node)} ${node.scrollWidth}>${node.clientWidth} "${node.textContent?.slice(0, 40)}"`);
      // Dikeyde yalnız düğmeler ve taşması gizlenen kutular denetlenir (satır yüksekliği küçük rakam kutularında yanlış alarm verir).
      const clipsVertically = node.tagName === 'BUTTON' || getComputedStyle(node).overflowY !== 'visible';
      if (clipsVertically && node.scrollHeight > node.clientHeight + 1) out.push(`kesiliyor (dikey): ${name(node)} ${node.scrollHeight}>${node.clientHeight} "${node.textContent?.slice(0, 40)}"`);
    }
    const rectOf = (selector: string): DOMRect | null => {
      const node = document.querySelector(selector);
      return node !== null && visible(node) ? node.getBoundingClientRect() : null;
    };
    const overlap = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    // Üst şerit sütunları birbirine girmez.
    const top = ['.hud-top .hud-base--player', '.hud-top .hud-center', '.hud-top .hud-base--enemy'].map(rectOf);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i];
        const b = top[j];
        if (a && b && overlap(a, b)) out.push(`üst şerit sütunları çakışıyor (${i}/${j})`);
      }
    }
    // Alt panel çocukları birbirine girmez ve ekranın içinde kalır.
    const kids = [...document.querySelectorAll('.hud-bottom > *')].filter(visible);
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i]!.getBoundingClientRect();
      if (a.right > vw + 1 || a.left < -1 || a.bottom > vh + 1) out.push(`alt panel öğesi taşıyor: ${name(kids[i]!)}`);
      for (let j = i + 1; j < kids.length; j++) {
        if (overlap(a, kids[j]!.getBoundingClientRect())) out.push(`alt panel öğeleri çakışıyor: ${name(kids[i]!)} / ${name(kids[j]!)}`);
      }
    }
    const bottom = rectOf('.hud-bottom');
    if (bottom && bottom.bottom > vh + 1) out.push(`alt panel ekran dışında (${Math.round(bottom.bottom)} > ${vh})`);
    return out;
  });
  expect(problems, label).toEqual([]);
}

/** Sınır Taşı değeri için ayrılan genişlik (CSS min-width: 25ch) olası en uzun metinlere yeter. */
async function expectStoneTextsFit(page: Page): Promise<void> {
  const owners = [en.hud.you, en.hud.enemy];
  const texts = [en.hud.stoneNeutral];
  for (const owner of owners) {
    texts.push(fmt(en.hud.stoneLeaning, { owner, pct: 100 }));
    for (const age of AGES) texts.push(fmt(en.hud.stoneOwned, { owner, gold: age.stoneGoldPerSec, xp: age.stoneXpPerSec }));
  }
  const tooWide = await page.evaluate((candidates) => {
    const host = document.querySelector('.hud-stone');
    if (host === null) return ['.hud-stone yok'];
    const probe = document.createElement('span');
    probe.className = 'hud-stone__value';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    host.appendChild(probe);
    const reserved = parseFloat(getComputedStyle(probe).minWidth);
    const wide: string[] = [];
    for (const text of candidates) {
      probe.textContent = text;
      const width = probe.getBoundingClientRect().width;
      if (width > reserved + 0.5) wide.push(`"${text}" ${width.toFixed(1)} > ${reserved.toFixed(1)}`);
    }
    probe.remove();
    return wide;
  }, texts);
  expect(tooWide).toEqual([]);
}

test.describe('İngilizce: düzen 1280x720', () => {
  test('menüler, üst şerit, alt panel (tüm çağlar), kule menüsü, öğretici paneli ve sonuç ekranı taşmaz', async ({ page }) => {
    test.setTimeout(180_000);
    await dismissTutorialOfferInit(page);
    await openGame(page);
    await expectNoHorizontalOverflow(page);
    await shot(page, 'en-1280x720-menu');

    await action(page, 'start').click();
    await expect(screen(page, 'setup')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, 'en-1280x720-setup');
    await action(page, 'back').click();

    await action(page, 'settings').click();
    await expect(screen(page, 'settings')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, 'en-1280x720-settings');
    await page.keyboard.press('Escape');

    await startMatchEn(page, 'Easy');
    await expectNoHorizontalOverflow(page);
    await expectHudFits(page, 'age 1');
    await expectStoneTextsFit(page);
    await shot(page, 'en-1280x720-battle-age1');
    await pauseGame(page);
    await expectNoHorizontalOverflow(page);
    await shot(page, 'en-1280x720-pause');
    await action(page, 'resume').click();
    await expect(screen(page, 'pause')).toBeHidden();

    // Her çağda: birlik adları, kuyruk işaretleri, çağ düğmesi ve kule menüsü sığar.
    const slot = page.locator('.hud-defense .slot-cell:nth-child(1) button');
    for (let age = 1; age <= AGES.length; age++) {
      if (age > 1) {
        await debugClick(page, '+1000 XP', 5);
        await debugClick(page, '+500 gold', 5);
        await page.keyboard.press('KeyE');
        await expect(page.locator('.hud-base--player .hud-base__age')).toHaveText(en.age[age]!);
      }
      await debugClick(page, '+500 gold', 2);
      for (const key of ['Digit1', 'Digit2', 'Digit3']) await page.keyboard.press(key);
      await expect(page.locator('.queue-slot:not([data-kind="empty"])').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectHudFits(page, `age ${age}`);
      await shot(page, `en-1280x720-battle-age${age}`);

      await slot.click();
      await expect(page.locator('.slot-menu')).toBeVisible();
      await expect(page.locator('.slot-menu__build')).toHaveCount(2);
      const menuProblems = await page.evaluate(() => {
        const menu = document.querySelector('.slot-menu')!.getBoundingClientRect();
        const out: string[] = [];
        if (menu.left < 0 || menu.right > window.innerWidth || menu.top < 0 || menu.bottom > window.innerHeight) out.push('kule menüsü ekran dışında');
        for (const node of document.querySelectorAll<HTMLElement>('.slot-menu button, .slot-menu button *')) {
          if (node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).display !== 'inline') out.push(`menü düğmesi kesiliyor: ${node.textContent?.slice(0, 40)}`);
        }
        return out;
      });
      expect(menuProblems, `kule menüsü, çağ ${age}`).toEqual([]);
      if (age === AGES.length) await shot(page, 'en-1280x720-tower-menu-age5');
      await page.keyboard.press('Escape');
      await expect(page.locator('.slot-menu')).toBeHidden();
    }

    // Öğretici paneli: en uzun adımlar bile alt panele inmez ve sağa taşmaz.
    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await action(page, 'tutorial').click();
    await expect(page.locator('.tutorial')).toBeVisible();
    for (const [id, step] of Object.entries(en.tutorial.steps)) {
      const geometry = await page.evaluate(
        ([title, text]) => {
          const panel = document.querySelector<HTMLElement>('.tutorial')!;
          panel.querySelector('.tutorial__title')!.textContent = title!;
          panel.querySelector('.tutorial__text')!.textContent = text!;
          const r = panel.getBoundingClientRect();
          const bottom = document.querySelector('.hud-bottom')!.getBoundingClientRect();
          return { right: r.right, bottom: r.bottom, hudTop: bottom.top, vw: window.innerWidth, clipped: panel.scrollHeight > panel.clientHeight + 1 };
        },
        [step.title, step.text] as const,
      );
      expect(geometry.right, id).toBeLessThanOrEqual(geometry.vw);
      expect(geometry.bottom, `${id}: öğretici paneli alt panele iniyor`).toBeLessThan(geometry.hudTop);
      expect(geometry.clipped, id).toBe(false);
    }
    await shot(page, 'en-1280x720-tutorial');
    await action(page, 'tutorial-skip').click();
    await expect(screen(page, 'menu')).toBeVisible();
    // Yukarıdaki yenileme maçı kaydetti; yeni maç onay istemesin diye kayıt silinir.
    await page.evaluate((key) => localStorage.removeItem(key), KEYS.save);
    await page.reload();
    await expect(screen(page, 'menu')).toBeVisible();
    await expect(action(page, 'continue')).toBeDisabled();

    // Zafer ekranı ve istatistik tabloları (tüm çağların uzun birlik adlarıyla).
    await startMatchEn(page, 'Easy');
    await page.getByRole('button', { name: 'Speed ×16' }).click();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(150);
    }
    await page.getByRole('button', { name: 'Enemy base HP = 1' }).click();
    await page.getByRole('button', { name: 'Hit enemy base for 1' }).click();
    const result = screen(page, 'result');
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute('data-outcome', 'win');
    await expect(result.locator('.screen__title')).toHaveText('Victory');
    await expect(result.locator('[data-table="units"]')).toContainText('Stone Axeman');
    await expect(result.locator('[data-table="summary"]')).toContainText('Gold earned');
    await expect(result.locator('[data-table="summary"]')).toContainText('Base damage dealt');
    await expect(result.locator('[data-table="summary"]')).toContainText('Age-ups');
    await expect(result).toContainText('Age reached');
    await expectNoHorizontalOverflow(page);
    await shot(page, 'en-1280x720-result');

  });
});
