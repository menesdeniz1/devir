# itch.io sayfası — Devir

Yayında: https://menesdeniz.itch.io/devir (2026-11-06, sürüm 1.0.1, gömme 1280×720, AI bildirimi işaretli).

Bu dosya, itch.io'da proje oluştururken alanlara olduğu gibi yapıştırılacak metni ve ayarları içerir.
Görseller bu klasördedir. Yüklenecek paket: GitHub sürüm sayfasındaki `devir-1.0.1-html5.zip`
(ya da `npm run build` sonrası `dist/` içeriğinin zip'i; kökte `index.html`).

## Proje ayarları (Create new project)

| Alan | Değer |
|---|---|
| Title | Devir |
| Project URL | `devir` |
| Short description or tagline | Çağlar boyunca tek koridorda savaş: İlkel Çağ'dan Gelecek Çağı'na tek oyunculu strateji. |
| Classification | Games |
| Kind of project | HTML |
| Release status | Released |
| Pricing | No payments (ücretsiz) |
| Uploads | `devir-1.0.1-html5.zip` → **This file will be played in the browser** işaretli |
| Viewport dimensions | 1280 × 720 |
| Frame options | **Fullscreen button** açık; Mobile friendly kapalı; Automatically start on page load kapalı (ses tarayıcıda ilk tıklamayla açılır); Enable scrollbars kapalı |
| SharedArrayBuffer support | Kapalı (gerekmez) |
| Genre | Strategy |
| Tags | strategy, real-time-strategy, 2d, singleplayer, tower-defense, turkish |
| AI generation disclosure | **Yes**: kod, kodla çizilen görseller, kodla üretilen ses/müzik ve metinler yapay zekâ (Claude) yardımıyla üretildi. itch.io bu bildirimi istiyor; dürüst işaretlenmeli. |
| Cover image | `kapak-630x500.png` |
| Screenshots | `ekran-1-ogretici.png` … `ekran-6-zafer.png` (sırasıyla) |
| Visibility & access | Önce **Draft** ile kaydet, oyunu sayfada bir kez deneyip sonra **Public** yap |

## Description (açıklama alanı)

**Devir**, tarayıcıda oynanan tek oyunculu bir çağ ilerleme stratejisi. İki üs, tek bir koridor ve beş çağ:
İlkel Çağ'dan Antik, Orta ve Endüstri çağlarından geçerek Gelecek Çağı'na uzanan bir savaş.

**Nasıl oynanır**
- Ön hat, menzilli ve ağır birlik üret; birlikler koridorda kendiliğinden ilerler.
- Rakip birliklerini öldürerek altın ve deneyim kazan, eşik dolunca çağ atla: her çağda daha güçlü birlikler, kuleler ve yeni bir özel yetenek açılır.
- Üssünün önündeki yuvalara kule kur; kuleler kayıp vermeden savunur.
- Koridorun ortasındaki **Sınır Taşı**'nı tek başına tutan taraf ek altın ve deneyim kazanır.
- Rakip üssü yıkan kazanır. Bir maç yaklaşık 10–12 dakika sürer.

**İçerik**
- 5 çağ, 15 birlik, 10 kule, 5 özel yetenek (Sürü Hücumu, Ateş Hendeği, Çivi Kapanı, Baraj Ateşi, Durağanlık Alanı)
- Kolay / Normal / Zor bilgisayar rakibi: yalnız görünür bilgiyi kullanır, ek kaynak almaz
- 10 adımlık atlanabilir öğretici, otomatik kayıt ve kaldığın yerden devam, ayrıntılı sonuç ekranı
- Kodla çizilmiş özgün görseller, kodla üretilmiş sesler ve her çağa özgü müzik

**Kontroller**

| Tuş | İşlev |
|---|---|
| 1 / 2 / 3 | Ön hat / menzilli / ağır birlik üret |
| Backspace | Son bekleyen siparişi iptal et |
| Q | Özel yetenek: hedefle, tekrar Q ya da tıkla ile uygula (← → ile kaydır, Enter ile uygula) |
| E | Çağ atla |
| P / Esc | Duraklat / devam et |

Fareyle de tamamen oynanır. Arayüz Türkçedir.

**Gereksinimler:** WebGL2 destekleyen güncel bir masaüstü tarayıcı (Chrome, Edge, Firefox, Safari 17+), en az 1280×720 pencere.

## Yayın öncesi son kontrol

1. Draft sayfada oyunu aç: ana menü, öğretici teklifi ve bir maçın ilk dakikası çalışıyor mu?
2. Tam ekran düğmesi ve ses (ilk tıklamadan sonra) çalışıyor mu?
3. Sayfayı yenileyip "Devam et" ile kayıtlı maçın geri geldiğini gör (kayıt itch.io alan adına özel localStorage'dadır).
