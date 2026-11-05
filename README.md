# Devir

İlkel Çağ'dan Gelecek Çağı'na uzanan tek bir koridorda ordunu, savunmanı ve çağ atlama zamanını dengeleyerek rakip
üssü yıktığın, tek oyunculu bir tarayıcı strateji oyunu. Hesap gerekmez; kayıtlar tarayıcıda tutulur.

**Oyna:** https://menesdeniz.itch.io/devir — arayüz Türkçe ve İngilizce (Ayarlar → Dil; ilk açılışta tarayıcı diline göre).

## Nasıl oynanır

- **Amaç:** rakibin üssünü yık, kendi üssünü koru.
- **Birlikler** kendi üssünden çıkıp kendiliğinden ilerler ve savaşır. Üç rol vardır: ön hat, ağır birliği yener;
  ağır birlik, menzilli kümesini ezer; menzilli birlik, ön hattı yıpratır.
- **Altın** zamanla ve düşman öldürerek gelir. **Deneyim** öldürerek birikir ve yeni çağın kilidini açar.
- **Kuleler** üssünü savunur ama üssü tek başına korumaz. **Özel yetenek** her çağda değişir.
- **Sınır Taşı:** koridorun ortasındaki taşı tutan taraf ek altın ve deneyim kazanır.
- İlk açılışta öğretici önerilir; ana menüden istediğin zaman tekrar açabilirsin.

| Eylem | Klavye |
|---|---|
| Ön hat / menzilli / ağır üret | 1 / 2 / 3 |
| Son bekleyen siparişi iptal et | Backspace |
| Özel yetenek | Q, sonra koridora tıkla (veya ←/→ ile hedefle, Enter/Q ile uygula) |
| Hedeflemeyi iptal et | Esc veya sağ tık |
| Çağ atla | E |
| Duraklat / devam et | P veya Esc |

Kuleler fareyle kurulur ve satılır. Tüm kısayollar Ayarlar ekranında listelenir.

## Geliştirme

Gereksinim: Node.js 20+ (geliştirmede Node 24 kullanıldı).

```bash
npm ci
npm run dev        # http://localhost:5173 — ?debug ile geliştirici paneli
npm run check      # tip denetimi + birim testleri + üretim derlemesi
npm run e2e        # Playwright uçtan uca testleri
```

Denge araçları ve diğer komutlar için [CLAUDE.md](CLAUDE.md); tasarım ve mimari için `docs/` klasörü
([ürün tanımı](docs/urun-tanimi.md), [PRD](docs/prd.md), [oyun tasarımı](docs/oyun-tasarimi.md),
[teknik tasarım](docs/teknik-tasarim.md), [yol haritası](docs/yol-haritasi.md)).

## Yayın (itch.io, HTML5)

1. `npm run build` — tamamen statik çıktı `dist/` klasörüne yazılır (göreli yollar; alt dizinde çalışır).
2. `dist/` klasörünün **içeriğini** zip'le (zip'in kökünde `index.html` olmalı).
3. itch.io'da yeni proje → Kind of project: **HTML** → zip'i yükle → "This file will be played in the browser".
   Önerilen gömme boyutu 1280×720, "Fullscreen button" açık. Alternatif: `butler push dist <kullanıcı>/devir:html5`.
4. Sayfa metni (İngilizce + Türkçe), sayfayı güncelleme adımları, kapak (630×500) ve ekran görüntüleri `store/` klasöründedir:
   [`store/itch-sayfasi.md`](store/itch-sayfasi.md).

Aynı `dist/` klasörü GitHub Pages veya Cloudflare Pages gibi herhangi bir statik barındırmada da çalışır.
Desteklenen tarayıcılar: Chrome, Edge, Firefox (son iki ana sürüm), Safari 17+; WebGL2 gerekir.
