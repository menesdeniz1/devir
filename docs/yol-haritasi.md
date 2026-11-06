# Devir — Yol Haritası

Her aşama **çalıştırılabilir** bir sürümle ve **komutla doğrulanabilir** bir bitti ölçütüyle kapanır.
İlk aşamalar küçüktür; nihai kapsam [PRD §15](prd.md)'in tamamıdır.

**Sahipler:** **L** = lead (tasarım kararları, sözleşmeler, tarayıcıda doğrulama, aşama raporu) ·
**H** = haiku-high (arama, veri girişi, mekanik işler) · **S** = sonnet-high (uygulama, test, refactor) ·
**O** = opus-high (zor hata ayıklama, inceleme, yapay zekâ ve determinizm tasarımı) · **K** = kullanıcı (onay, oyun testi).

**Her aşamanın ortak kapısı:**

1. `npm run check` (typecheck + test + build) yeşil.
2. L, oyunu yerleşik tarayıcıda oynar; ekran görüntüleriyle doğrular.
3. Aşama raporu: tamamlananlar, doğrulama sonuçları (gerçek komut çıktısı), kalan sorunlar.
4. K onayıyla commit. Önceki aşamaların testleri yeşil kalır (çalışan özellik korunur).

## Durum

| Aşama | Konu | Durum |
|---|---|---|
| 0 | Planlama ve dokümanlar | Tamamlandı (2026-11-05): kararlar verildi, çapraz kontrol bulguları işlendi |
| 1 | Uçtan uca minimum maç | Tamamlandı (2026-11-05): 80 test, soak 500 ihlalsiz, tarayıcıda kazanma/kaybetme doğrulandı |
| 2 | Roller, savaş derinliği, stil prototipi | Tamamlandı (2026-11-05): 136 test, karşılık senaryoları geçti, stil kullanıcı onaylı |
| 3 | Çağlar (+ Sınır Taşı) | Tamamlandı (2026-11-05): 180 test, soak 500 ihlalsiz, tarayıcıda 1→5 çağ geçişi doğrulandı |
| 4 | Savunmalar | Tamamlandı (2026-11-05): 236 test, soak ihlalsiz, 10 kule ve yuva arayüzü tarayıcıda doğrulandı; savunmacı bot ölçümü Aşama 6 |
| 5 | Özel yetenekler | Tamamlandı (2026-11-05): 5 yetenek, hedefleme arayüzü, efektler; tarayıcıda kullanım doğrulandı |
| 6 | Bilgisayar rakibi ve ilk denge turu | Tamamlandı (2026-11-05): 3 zorluk, yetenek kullanımı; saf ön hat baskınlığı giderildi (Sürü 120 → 60); Zor–Normal %70,5, Normal–Kolay %92, tek rol botları ≤ %22,5 |
| 7 | Ekranlar, ayarlar, kayıt | Tamamlandı (2026-11-05): menüler, ayarlar, kayıt/devam, sonuç ekranı, ses bağlantısı |
| 8 | Öğretici | Tamamlandı (2026-11-05): 10 adım, atla, ilk açılış önerisi; kayda ve sonuçlara yazılmaz |
| 9 | Üretim kalitesinde görsel ve ses | Tamamlandı (2026-11-05): özgün siluetler, çağa özgü mermiler, arka planlar, üs hasarı, sarsıntı; sentez ses ve 5 çağ müziği |
| 10 | Denge, kalite ve yayın | Tamamlandı (2026-11-05): kod incelemesi düzeltmeleri, perf paneli, WebGL yok ekranı, üç tarayıcılı E2E, sürüm 1.0.0 paketi. Yayında (2026-11-06): https://menesdeniz.itch.io/devir; önce 1.0.1, aynı gün 1.1.0 (İngilizce sayfa; itch.io sunucusundaki paket yerel derlemeyle bayt bayt aynı; oradan İngilizce ve Türkçe açılış, maç ve üretim konsol hatasız). İlk insan oyun testi yapıldı (2026-11-06; bkz. Sürüm 1.1.0). Kullanıcı 1.1.0'ın yeni seslerini dinledi ve beğendi (2026-11-06). Açık: Normal'in zorluğu için daha fazla insan oyuncu |

**Sürüm 1.0.0 sonrası düzeltmeler:** ikinci ve üçüncü denge turu (üs canı eğrisi; Yürüyen Kale hasarı; iki tohum
kümesinde Normal–Normal medyan ≈ 10:45, zaman aşımı ≤ %7,5; Zor–Zor zaman aşımı ≤ %8,5), ölçüme dayalı ses
normalizasyonu (kırpılma, DC sapması, çağlar arası düzey farkı) ve BS.1770 K-ağırlıklı gürlük (LUFS) ile frekans
dengesi.

**Sürüm 1.0.1:** 1280×720'de deneyim başlığında etiket ile değerin bitişip bölünmesi düzeltildi (sıkışık alt panelde deneyim sütunu genişletildi); CI action'ları Node 24 kullanan v7 sürümlerine geçti. Son tarayıcı doğrulaması (Chromium, 1280×720): öğretici baştan sona 2:34'te tamamlandı; kayıt → Ana menü → Devam et aynı durumu geri getirdi; düğmelere tıklayan basit betikli oyuncu Normal'e karşı 5 maçın 5'ini 10:43–12:55 arasında kaybetti (konsol hatası 0, reddedilen komut 0). Ardından lead, her birkaç oyun saniyesinde duraklatıp yalnız ekrandaki bilgiye bakarak karar verdiği canlı bir maçı gerçek klavye ve fareyle oynadı: erken iki hızlı kule, kümelere yetenek, eşik dolar dolmaz çağ atlama. Normal'e karşı **10:54'te zafer** (çağ geçişleri 04:04 · 06:52 · 09:20; rakip 05:08 · 07:53; Normal 4. çağa çıkamadan üssü düştü; hata 0). Betikli oyuncunun kayıpları Normal'in kötü takası cezalandırdığını, canlı maç da bilinçli oyunla yenilebildiğini gösteriyor.

**Sürüm 1.1.0 (2026-11-06) — ilk insan oyun testi:** kullanıcı oynadı ve beğendi; iki sorun bildirdi. (1) "Sınır
Taşı ne işe yarıyor anlamadım": gelir satırı taşı saymıyordu; artık gelir satırı, taş göstergesi, bildirimler ve
taşın üstünden yükselen "+N altın" getiriyi gösterir (GDD §8). (2) "Sesler hafif itici": bant dengeleyicinin
eklediği yapay hışırtı ve tık gibi başlangıçlar giderildi; efektlerin 4 kHz üstü payı ortalama %10,3 → %0,3
(GDD §15, tests/audio-timbre). Ayrıca İngilizce dil desteği (PRD G-04; Ayarlar → Dil) ve kayıt uyumluluğu
semver'e göre: 1.0 kayıtları 1.1'de açılır (TDD §9).

**Sürüm 1.2.0 (2026-11-07, kullanıcı oynayıp onayladı: "beğendim"):** kullanıcı istekleri — oyun hızı 1×/1,5×/2×/3×
(PRD G-08), düğmelerde birlik/kule portreleri ve arayüz cilası, Sınır Taşı handikapı ve ardından kullanıcının
önerisiyle **Maden**: ortadaki hedef yalnız altın verir (2/4/6/10/16), yarısı depoya gider, madeni sahibinden alan
depoyu yağmalar; çağla büyüyen maden çizimi ve depo yığını; deneyim öldürmeler ve üs baskısından (her 100 hasar 15,
PRD E-10); isteğe bağlı aşınma (GDD §8, §8.1; PRD K-17, K-18). Ölçüm yolu: 20+ değişken (Normal–Normal 200 maç);
taş hem kartopu motoru hem çıkmaz kırıcıydı; madeni ilk alanın kazanma oranı %81,5 → %50,5. Gerçek kodla: N–N
%47,5/%52,5, kilitlenen %0, medyan 14:08; Zor–Normal %77; Normal–Kolay %96,5; soak 500 ihlalsiz; 647 birim testi,
E2E üç tarayıcıda 112 geçti. Kullanıcı yeni kuralları ve madeni oynadı, onayladı (ikinci insan oyun testi).
itch.io'da yayında (2026-11-07): https://menesdeniz.itch.io/devir 1.2.0; oradaki paket yerel derlemeyle bayt bayt aynı,
İngilizce ve Türkçe açılış, maç ve üretim konsol hatasız.

**Bilinen açık noktalar:** saf ön hat yığınıyla oynanan aynalı maçlar (normal-front – Normal) çoğunlukla 20
dakikayı aşar (kazanamaz, %27–28,5); ses ve müziğin tınısı yalnız ölçümle (LUFS, bant dengesi) doğrulandı, kulakla
dinlenmedi; öğretici ve maç süresi gerçek bir insan oyuncuyla ölçülmedi (betikli oyuncu ve lead'in canlı maçıyla tarayıcıda doğrulandı; ilk kez oynayan birinin Normal'i ne kadar zor bulduğu bilinmiyor).

---

## Aşama 0 — Planlama

- **Çıktı:** Ürün tanımı, PRD v1.1, GDD, TDD, yol haritası, `CLAUDE.md`, worker tanımları.
- **Bitti:** K, PRD §17'deki A1, A2, A7 kararlarını verdi; dokümanlarda `[ONAY BEKLİYOR]` kalmadı.

## Aşama 1 — Uçtan uca minimum maç

Hedef: iki üs, tek birlik türü (İlkel ön hat), otomatik savaş, gelir ve ödül, kazanma/kaybetme/beraberlik —
tarayıcıda baştan sona oynanabilir.

### 1A — İskelet ve simülasyon çekirdeği

| Sahip | İş |
|---|---|
| S | Vite + TypeScript + Vitest + PixiJS iskeleti; `git init`; `dev`, `build`, `typecheck`, `test`, `sim`, `check` betikleri |
| L | `GameState`, komut ve veri şeması sözleşmesi; İlkel ön hat, üs ve ekonomi verisi (`src/data/`) |
| S | Sistemler: gelir, üretim kuyruğu (5, ödeme, iptal/iade, doğma bekletme), hareket/sıralama/engelleme, hedefleme, yakın dövüş, eşzamanlı hasar, ölüm ve ödül, sonuç |
| S | Basit rakip botu: komut API'siyle ön hat üretir; üretim hızı bilerek kısıtlı (GDD §10, aynalı takas) |
| S | `npm run sim -- match` ve `soak` |
| O | Simülasyon çekirdeği incelemesi: determinizm, ilerleme garantisi, ödül tekliği |

- **Testler:** K-01, K-02, K-03, K-05, K-06, K-08, K-10, K-15; değişmez denetimi; mimari bağımlılık testi.
- **Bitti:** `npm run check` yeşil · `npm run sim -- match --seed 1` sonuçla biter ve özet yazar ·
  `npm run sim -- soak --games 500` ihlalsiz.

### 1B — Tarayıcıda oynanabilir sürüm

| Sahip | İş |
|---|---|
| S | Sabit adımlı döngü + interpolasyon; duraklatma; sekme gizlenince duraklama |
| S | Pixi sahnesi: yer tutucu şekiller, ama bakış yönü ve amblemle takım ayrımı |
| S | DOM HUD: üs canları, altın, birlik düğmesi + ret nedeni, kuyruk + iptal, süre, duraklat; kısayollar 1 / Backspace / P / Esc |
| S | Sonuç ekranı (Zafer/Yenilgi/Beraberlik, süre) ve Yeniden oyna; `?debug` paneli |
| L | Tarayıcıda uçtan uca oynayış: bir kazanma, bir kaybetme, duraklatma ve sekme gizleme |

- **Testler:** K-09 (sentetik kare akışları), K-14, K-08 (yeniden oyna temiz durum), K-16 (ret nedenleri).
- **Bitti:** `npm run check` yeşil · L'nin raporunda kazanma ve kaybetme ekran görüntüleri, duraklatma doğrulaması.

## Aşama 2 — Roller, savaş derinliği ve stil prototipi

| Sahip | İş |
|---|---|
| S | Üç rol, hasar matrisi, mermiler, alan hasarı ve delme, boyuta göre sıralama; birlik düğmeleri 2–3 ve kısayolları; araç ipuçları |
| S | Bot karma üretim yapar |
| S | Aşama 1 incelemesinden gelen borç: rol çarpanlı hasar `compile`'da tamsayı tabloya çevrilir ve `Number.isInteger(can)` değişmezi eklenir; hareketteki "boşluğun yarısı" sınırı senaryo testiyle kapsanır; hedefleme taraf başına x'e göre sıralı dizilerle yapılır |
| O | İlkel Çağ'ın 3 birliği ve üssü hedef stilde (parçalı vektör; yürüme, saldırı, ölüm animasyonu) |
| K | Stil prototipini onaylar veya düzeltme ister |

- **Testler:** Karşılık senaryoları (eşit altın: ön hat > ağır; ağır > menzilli kümesi; ön hat + menzilli > yalnız ön hat);
  alan hasarı ve geç gelen mermide ödül tekliği (K-03); kule olmadan K-02'nin mermi sürümü.
- **Bitti:** `npm run check` yeşil · senaryo testleri geçer · K stil onayı.

## Aşama 3 — Çağlar ve Sınır Taşı

| Sahip | İş |
|---|---|
| H | 15 birliğin verisini GDD §5 formülleriyle `src/data/`'ya gir; GDD tablolarını veri bağlantısıyla değiştir |
| S | Deneyim, eşikler, çağ atlama komutu (ücret, can yüzdesi), çağa göre gelir; kuyrukta eski siparişler; 5 üs görünümü (yer tutucu varyantlar); Çağ Atla düğmesi, E kısayolu, ret nedenleri |
| S | Sınır Taşı kuralları ve HUD göstergesi |
| S | Bot, eşik geçince çağ atlar |

- **Testler:** K-04; çağlar sırayla ve atlanamaz; deneyim harcanmaz; çağ ücreti bir kez (K-01); taş kontrol kuralları.
- **Bitti:** `npm run check` yeşil · `npm run sim -- match` raporunda maçlar 5. çağa ulaşabiliyor · L tarayıcıda çağ geçişini doğrular.

## Aşama 4 — Savunmalar

| Sahip | İş |
|---|---|
| H | 10 kule verisi |
| S | 3 yuva, açma ücretleri, kule hedefleme ve mermileri, satış/değiştirme, yuva menüsü |
| S | Bot basit kule kullanır |

- **Testler:** K-01 (yuva/kule), K-02 (kule menzil ve aralığı), K-03 (kule öldürmesi), K-11; maç bitince kuleler durur.
- **Bitti:** `npm run check` yeşil · savunma ağırlıklı bot (kule + gecikmeli saldırı), karma bota karşı 200 maçta
  < %40 kazanır (GDD §10 eşiği; Aşama 6'da gerçek yapay zekâyla yeniden ölçülür) · L tarayıcı kontrolü.

## Aşama 5 — Özel yetenekler

| Sahip | İş |
|---|---|
| H | 5 yetenek verisi |
| S | Durum etkileri (sersemletme, yavaşlatma, savunmasızlık, donma), alanlar, gecikmeli vuruş; hedefleme arayüzü, önizleme, bekleme göstergesi, Q kısayolu |
| S | Bot yeteneği basit kuralla kullanır |

- **Testler:** K-12; alan sınırları; dost birlik ve üs etkilenmez; yetenek öldürmelerinde ödül tekliği.
- **Bitti:** `npm run check` yeşil · L, beş yeteneği tarayıcıda dener.

## Aşama 6 — Bilgisayar rakibi ve ilk denge turu

| Sahip | İş |
|---|---|
| O | Gözlem katmanı, karar modülleri, üç zorluk profili (GDD §9) |
| S | Turnuva aracı, denge raporu, tek tip ve savunmacı test botları |
| L | Denge ayarı — yalnızca `src/data/` değişir. Aşama 2 gözlemleri: önceden dizilmiş 480 altınlık çatışmalarda 3 ağır tüm karma dizilişleri yeniyor (alan hasarı + 300 menzil); sınırlı üretimli basit bota karşı yalnız ön hat üreten bot kazanıyor. İkisi de gerçek yapay zekâyla yeniden ölçülecek (`npm run sim -- matchup`, turnuva). Aşama 3 gözlemi: aynalı basit botlarla her çağ ≈4,5–6 dk sürüyor ve 5. çağa ≈20. dakikada ulaşılıyor (GDD §4 tahmini ≈11. dk); aynalı çıkmazda iki taraf da bölgede olduğu için taş donuyor |
| K | Oyun testi: Normal'i yenmek mümkün ama zahmetli mi? |

- **Testler:** K-13 (gizli bilgi); yapay zekâ tüm eylem türlerini kullanır; soak.
- **Bitti:** `npm run check` yeşil · `npm run sim -- tournament` GDD §10 hedeflerini karşılar · K geri bildirimi işlendi.

## Aşama 7 — Ekranlar, ayarlar ve kayıt

| Sahip | İş |
|---|---|
| S | Ana menü (Devam et koşullu), maç kurulumu, duraklatma menüsü, ayarlar, tam sonuç ekranı, sonuç geçmişi |
| S | Otomatik kayıt ve devam; geçersiz/eski kayıt yönetimi |
| S | Playwright kurulumu ve kritik akış testleri |
| O | Kayıt determinizmi ve yaşam döngüsü incelemesi |

- **Testler:** K-07; K-08 (E2E); K-14 (E2E); ayarların kalıcılığı; ÖK-08 onay akışı.
- **Bitti:** `npm run check` ve `npm run e2e` yeşil.

## Aşama 8 — Öğretici

| Sahip | İş |
|---|---|
| S | Olaylara bağlı adım çalıştırıcı, öğretici maç yapılandırması, vurgulama katmanı, atla, ilk açılış önerisi, menüden tekrar |

- **Testler:** E2E — öğreticiyi tamamlama ve atlama yolları; öğretici kayda ve sonuçlara yazılmaz.
- **Bitti:** `npm run check` ve `npm run e2e` yeşil · L öğreticiyi baştan sona oynar · K oyun testi: öğretici
  5 dakikanın altında biter (ürün tanımı, başarı ölçütleri).

## Aşama 9 — Üretim kalitesinde görsel ve ses

| Sahip | İş |
|---|---|
| O / S | 12 birliğin ve 4 üssün Aşama 3 çağ varyantlarından (palet + aksesuar) özgün tasarımlara geçişi, 10 kule, 5 yetenek efekti, çağa özgü mermiler (ok, cıvata, mermi, plazma), çağ arka planları, vuruş/ölüm/üs hasarı efektleri |
| S | Sentez efektleri, çağ müzikleri, mikser; arayüz görsel cilası |
| K | Görsel ve ses onayı |

- **Bitti:** GDD §14 denetim listesi ekran görüntüleriyle karşılanır · TDD §6 bütçesi `?debug` performans
  panelinde (TDD §4) karşılanır · WebGL2 yoksa hata ekranı gösterilir (TDD §12) · K onayı.

## Aşama 10 — Denge, kalite ve yayın

| Sahip | İş |
|---|---|
| L + O | İkinci denge turu (turnuva + K oyun testi) |
| S | Tarayıcı matrisi E2E (Chromium, Firefox, WebKit); erişilebilirlik denetimi |
| O | Son kod incelemesi |
| S | Yayın derlemesi, dağıtım (PRD A7), sürüm notları |

- **Bitti:** K-01…K-16'nın tamamı yeşil testlerle bağlı · tarayıcı matrisi yeşil · yayın bağlantısı çalışıyor.
