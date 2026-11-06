# itch.io sayfası — Devir

Yayında: https://menesdeniz.itch.io/devir.
- 2026-11-06: 1.0.1 olarak yayınlandı, aynı gün 1.1.0'a güncellendi (İngilizce sayfa).
- 1.2.0: bu dosyadaki adımlarla güncellenir.

Görseller bu klasörde (1.2.0 arayüzü): `en-*` İngilizce, önek olmayanlar Türkçe.
Paket: GitHub sürüm sayfasındaki `devir-1.2.0-html5.zip` (yerelde `release/devir-1.2.0-html5.zip`).

## Mevcut sayfayı 1.2.0'a güncelleme (adım adım)

1. https://menesdeniz.itch.io/devir → üstteki **Edit game**.
2. **Uploads:**
   - Eski `devir-1.1.0-html5.zip` dosyasını çöp kutusuyla sil.
   - **Upload files** ile `devir-1.2.0-html5.zip` dosyasını yükle.
   - Yeni dosyada **This file will be played in the browser** kutusunu işaretle.
   - **Embed options** bölümünde 1280 × 720 ve **Fullscreen button** açık mı, kontrol et. Yeni yüklemede ayarlar sıfırlanabilir.
3. **Short description or tagline:** aşağıdaki satırla değiştir (70 karakter; sınır 120).
4. **Description:** aşağıdaki bloğun tamamını yapıştır.
5. **Cover image:** `en-kapak-630x500.png` yükle.
6. **Screenshots:** eski görselleri kaldır, `en-ekran-1` … `en-ekran-5` dosyalarını sırayla yükle.
7. **AI generation disclosure:** Yes; Graphics, Sounds, Text & Dialog, Code (değişmedi).
8. **Save.** Sonra sayfada **Run game** ile kısa bir deneme yap. Kontrol edilecekler:
   - ana menünün altında "Version 1.2.0" ya da "Sürüm 1.2.0" yazıyor
   - maç kurulumunda **Erosion / Aşınma** seçeneği görünüyor
   - üst şeritte hız düğmesi var
9. İstersen **Devlog → Create new post** ile aşağıdaki güncelleme notunu paylaş; takipçilere bildirim gider.

## Short description or tagline

```text
One lane, five ages: build an army, hold the mine and raid your rival.
```

## Description

```text
Devir is a single-player age-progression strategy game for the browser. Two bases, one lane and five ages: a war that runs from the Primitive Age through the Ancient, Medieval and Industrial ages to the Future Age.

HOW TO PLAY
• Train frontline, ranged and heavy units; they march down the lane on their own.
• Kill enemy units and hit the enemy base to earn XP. When the XP bar fills, age up: every age unlocks stronger units, towers and a new special ability.
• Build towers in the slots in front of your base; towers defend without losses.
• Hold the gold mine in the middle of the lane: while only your units stand next to it, it is yours. Every second it digs up gold: half goes to you right away, half piles up in the mine's store. Take the mine from its owner to raid the whole store. The mine grows with every age.
• Destroy the enemy base to win. A match takes about 12–15 minutes.

FEATURES
• 5 ages, 15 units, 10 towers, 5 special abilities (Stampede, Fire Trench, Caltrops, Barrage, Stasis Field)
• Easy / Normal / Hard computer opponent that only uses what it can see and gets no extra resources
• Erosion (on by default): after 13:00 both bases slowly erode, so a match can't stall; turn it off for a long game
• Game speed 1× / 1.5× / 2× / 3× (button next to Pause, or F)
• 10-step skippable tutorial, autosave and continue, detailed results screen
• Original code-drawn art with unit and tower portraits, synthesized sound effects and music for every age
• English and Turkish (Settings → Language)

CONTROLS
• 1 / 2 / 3: train frontline / ranged / heavy unit
• Backspace: cancel the last waiting order
• Q: special ability. Aim, then press Q again or click to cast (← → to move, Enter to cast)
• E: age up
• F: change game speed
• P / Esc: pause / resume
Fully playable with the mouse too.

REQUIREMENTS
A current desktop browser with WebGL2 (Chrome, Edge, Firefox, Safari 17+), window at least 1280×720.

— Türkçe —
Devir, tarayıcıda oynanan tek oyunculu bir çağ ilerleme stratejisi. İki üs, tek koridor, beş çağ. Birlik üret, rakibi öldürüp ve üssüne vurup deneyim kazan, çağ atla, kule kur. Koridorun ortasındaki madeni tut: her saniye altın çıkarır, yarısı hemen sana gelir, yarısı depoda birikir; madeni rakipten alırsan deposunu yağmalarsın. Maden her çağda büyür. Aşınma (isteğe bağlı) maçın kilitlenmesini önler; oyun hızı 3×'e kadar. Arayüz Türkçe ve İngilizce (Ayarlar → Dil).
```

## Devlog güncelleme notu (isteğe bağlı)

```text
Update 1.2.0: the Gold Mine, game speed and unit portraits

Thanks to playtest feedback:
• The Border Stone is now a Gold Mine that grows with every age. It pays only gold: half goes to the holder right away, half piles up in its store, and whoever takes the mine from its owner raids the whole store. Holding the middle no longer decides the match on its own.
• XP now comes from kills and from damaging the enemy base, which rewards pressure.
• Erosion: after 13:00 both bases slowly erode so matches can't stall. You can switch it off in match setup for a long game.
• Game speed: 1× / 1.5× / 2× / 3× (button next to Pause, or F).
• Unit and tower portraits on the buttons, a polished interface, and a shorter bottom panel.
Your saves from 1.0 and 1.1 still load.
```

## Proje ayarları (başvuru)

| Alan | Değer |
|---|---|
| Kind of project | HTML |
| Pricing | No payments |
| Uploads | `devir-1.2.0-html5.zip` → This file will be played in the browser |
| Viewport | 1280 × 720; Fullscreen button açık; Mobile friendly, Automatically start, Enable scrollbars, SharedArrayBuffer kapalı |
| Genre | Strategy |
| Tags | 2d, singleplayer, real-time-strategy, tower-defense, medieval, science-fiction, cartoon |
| AI generation disclosure | Yes: Graphics, Sounds, Text & Dialog, Code |
| Community | Comments |

## Statement of AI usage (isteğe bağlı, sayfada herkese görünür)

```text
The code, the code-drawn art, the synthesized sound and music, and the texts were created with the help of an AI assistant (Claude), then reviewed and playtested by me.
```
