# itch.io sayfası — Devir

Yayında: https://menesdeniz.itch.io/devir. 1.0.1 olarak 2026-11-06'da yayınlandı; 1.1.0 bu dosyadaki adımlarla
güncellenir. Görseller bu klasörde: `en-*` İngilizce (1.1.0), önek olmayanlar Türkçe (1.0.1 arayüzü).
Paket: GitHub sürüm sayfasındaki `devir-1.1.0-html5.zip` (yerelde `release/devir-1.1.0-html5.zip`).

## Mevcut sayfayı 1.1.0'a güncelleme (adım adım)

1. https://menesdeniz.itch.io/devir → üstteki **Edit game**.
2. **Uploads:**
   - Eski `devir-1.0.1-html5.zip` dosyasının yanındaki çöp kutusuyla onu sil.
   - **Upload files** ile `devir-1.1.0-html5.zip` dosyasını yükle.
   - Yeni dosyada **This file will be played in the browser** kutusunu işaretle.
   - Embed options aynı kalır: 1280 × 720 ve Fullscreen button.
3. **Short description or tagline:** aşağıdaki İngilizce satırla değiştir.
4. **Description:** aşağıdaki "Description" bloğunun tamamını yapıştır. İngilizce önde, Türkçe altta.
5. **Cover image:** `en-kapak-630x500.png` yükle.
6. **Screenshots:** eski görselleri kaldır, `en-ekran-1` … `en-ekran-5` dosyalarını sırayla yükle.
7. **Tags:** mevcutlar kalsın; istersen `english` ekle (en fazla 10).
8. **Save.** Sonra sayfada **Run game** ile kısa bir deneme yap:
   - Ana menünün altında "Version 1.1.0" ya da "Sürüm 1.1.0" yazmalı.
   - Ayarlar → Dil çalışmalı.
9. İstersen sayfadaki **Devlog → Create new post** ile aşağıdaki güncelleme notunu paylaş. Takipçilere bildirim gider.

## Short description or tagline

itch.io sınırı 120 karakter; bu satır 81 karakter.

```text
One lane, five ages: build an army, hold the Border Stone and out-age your rival.
```

## Description

```text
Devir is a single-player age-progression strategy game for the browser. Two bases, one lane and five ages: a war that runs from the Primitive Age through the Ancient, Medieval and Industrial ages to the Future Age.

HOW TO PLAY
• Train frontline, ranged and heavy units; they march down the lane on their own.
• Kill enemy units to earn gold and XP. When the XP bar fills, age up: every age unlocks stronger units, towers and a new special ability.
• Build towers in the slots in front of your base; towers defend without losses.
• Hold the Border Stone in the middle of the lane: while only your units stand next to it, it becomes yours and pays extra gold and XP every second.
• Destroy the enemy base to win. A match takes about 10–12 minutes.

FEATURES
• 5 ages, 15 units, 10 towers, 5 special abilities (Stampede, Fire Trench, Caltrops, Barrage, Stasis Field)
• Easy / Normal / Hard computer opponent that only uses what it can see and gets no extra resources
• 10-step skippable tutorial, autosave and continue, detailed results screen
• Original code-drawn art, synthesized sound effects and music for every age
• English and Turkish (Settings → Language)

CONTROLS
• 1 / 2 / 3: train frontline / ranged / heavy unit
• Backspace: cancel the last waiting order
• Q: special ability. Aim, then press Q again or click to cast (← → to move, Enter to cast)
• E: age up
• P / Esc: pause / resume
Fully playable with the mouse too.

REQUIREMENTS
A current desktop browser with WebGL2 (Chrome, Edge, Firefox, Safari 17+), window at least 1280×720.

— Türkçe —
Devir, tarayıcıda oynanan tek oyunculu bir çağ ilerleme stratejisi. İki üs, tek koridor, beş çağ. Birlik üret, rakibi öldürüp altın ve deneyim kazan, çağ atla, kule kur ve koridorun ortasındaki Sınır Taşı'nı tut: taş sendeyken her saniye ek altın ve deneyim kazanırsın. Rakip üssü yıkan kazanır. Arayüz Türkçe ve İngilizce (Ayarlar → Dil).
```

## Devlog güncelleme notu (isteğe bağlı)

```text
Update 1.1.0 — English, a clearer Border Stone and softer sound

Thanks to the first playtest feedback:
• English language support (Settings → Language). The game picks your browser language on first launch.
• The Border Stone's reward is now visible: the income line shows the stone's share, the stone indicator shows the owner's bonus, and "+N gold" rises from the stone every second.
• Softer, more natural sound effects: the harsh high hiss and clicky starts are gone, and frequent sounds vary and stack less in big fights.
Your 1.0 saves still load.
```

## Proje ayarları (ilk oluşturma için başvuru)

| Alan | Değer |
|---|---|
| Kind of project | HTML |
| Pricing | No payments |
| Uploads | `devir-1.1.0-html5.zip` → This file will be played in the browser |
| Viewport | 1280 × 720; Fullscreen button açık; Mobile friendly, Automatically start, Enable scrollbars, SharedArrayBuffer kapalı |
| Genre | Strategy |
| Tags | 2d, singleplayer, real-time-strategy, tower-defense, medieval, science-fiction, cartoon (isteğe bağlı english, turkish) |
| AI generation disclosure | Yes; türler: Graphics, Sounds, Text & Dialog, Code (dördü de). İsteğe bağlı açıklama aşağıda |
| Community | Comments |

## Statement of AI usage (isteğe bağlı, sayfada herkese görünür)

```text
The code, the code-drawn art, the synthesized sound and music, and the texts were created with the help of an AI assistant (Claude), then reviewed and playtested by me.
```
