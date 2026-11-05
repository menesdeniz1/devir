# Devir — Teknik Tasarım Dokümanı (TDD)

Bu belge oyunun **nasıl inşa edildiğini** tanımlar. Ürün davranışı: [prd.md](prd.md). Kurallar ve sayılar:
[oyun-tasarimi.md](oyun-tasarimi.md). Aşamalar: [yol-haritasi.md](yol-haritasi.md).

---

## 1. Teknoloji seçimi

| Katman | Seçim | Gerekçe |
|---|---|---|
| Dil | TypeScript (strict) | Veri tanımları ve durum modeli için tip güvenliği; güvenli refactor |
| Geliştirme ve derleme | Vite | Hızlı yeniden yükleme, sıfıra yakın yapılandırma, statik çıktı |
| Çizim | PixiJS v8 | WebGL ile toplu çizim; kodla çizilen şekillerden doku üretimi; filtreler. Yalnız çizimcidir, oyun döngüsünü ve simülasyonu bize bırakır |
| Arayüz | DOM + CSS, framework yok | Türkçe metin, araç ipuçları, erişilebilirlik ve düzen için en kolay yol; ekran sayısı az, durum zaten simülasyonda |
| Ses | Web Audio API (doğrudan) | Sentezlenen efektler ve müzik; ek kütüphane gerekmez |
| Kalıcılık | localStorage (JSON, sürümlü) | Hesapsız, yerel; boyut < 1 MB |
| Test | Vitest; Aşama 7'den itibaren Playwright | Simülasyon testleri hızlı ve tarayıcısız; kritik akışlar gerçek tarayıcıda |
| Araç | tsx ile çalışan headless simülasyon CLI'ı | Denge turnuvaları ve hata yakalama |
| Sunucu | Yok | Tamamen statik dağıtım |

Sürümler kurulumda güncel kararlı sürümden alınır; kesin sürümlerin tek kaynağı `package-lock.json`'dır.

### Değerlendirilen alternatifler

- **Phaser 4:** Eksiksiz bir motor (sahne, ses, girdi, tween, parçacık). Motordan bağımsız, deterministik
  simülasyonumuz onun döngü ve sahne modeliyle çakışır; metin ağırlıklı HUD için yine DOM gerekir.
  Kullanılmayacak çok şey taşır. Çalışır ama gereksiz.
- **Godot / Unity web dışa aktarımı:** 10–40 MB yük ve yavaş açılış; localStorage, DOM arayüzü ve sekme
  görünürlüğü gibi web API'lerine dolaylı erişim. Tarayıcı öncelikli bir ürün için ağır.
- **Saf Canvas 2D:** Bağımlılık yok, ama kalabalık sahnede toplu çizim, doku önbelleği ve filtreleri kendimiz
  yazmamız gerekir. PixiJS bunu küçük bir bedelle çözer.
- **React / Vue:** Altı ekran ve bir HUD için gereksiz katman.

## 2. Mimari

```
 Fare/klavye ──► UI (DOM) ──komut──► Oturum ve döngü ──komut + tick──► Simülasyon (saf, deterministik)
                    ▲                    │   ▲                                 │
                    │                    │   └──── AI: gözlem → komut ◄────────┤ gözlem
                    │                    ▼                                     │
                    │                 Kayıt ◄──────────── durum (JSON) ────────┤
                    └──────── Çizim (Pixi), Ses, İstatistik ◄──── olaylar ─────┘
```

**Bağımlılık yönü:** `data` ← `sim` ← `ai` ← `match` ← `game` ← (`render`, `audio`, `ui`). `sim` yapay zekâyı
çağırmaz: `match` orkestrasyon katmanı her tick'te önce denetleyicilerin (yapay zekâ) kararlarını alır, sonra
`sim.step`'i çağırır; headless CLI de bu katmanı kullanır. `data`, `sim`, `ai` ve `match` hiçbir üst katmanı,
DOM'u veya Pixi'yi içe aktarmaz; bir mimari testi bunu denetler.

### Klasör yapısı

```
devir/
  docs/                  bu belgeler
  src/
    data/                denge ve içerik verisi (tek kaynak): world, ages, units, combat, towers, abilities, stone, ai
    sim/                 saf simülasyon: types, create, validate, commands, step, combat, targeting, abilities,
                         compile (veri → tick ve tamsayı hasar tabloları), rng, hash, invariants
    ai/                  observation, controller, basicBot/testBots (test araçları), strategy/ (Kolay/Normal/Zor)
    match/               headless orkestrasyon: denetleyici kararları + sim adımı; matchup senaryoları
    game/                döngü, oturum (session), ekran akışı (flow), kayıt, ayarlar, sonuç geçmişi, özet, sürüm
    app/                 tarayıcı köprüleri (audioBridge: oturum olayları → ses motoru)
    render/              Pixi sahnesi, arka plan, görünüm nesneleri, mermiler, yetenek efektleri, sarsıntı
    art/                 kodla çizilen birlik/kule/üs/yetenek parçaları, atlaslar, iskeletler, vitrin (gallery)
    audio/               mikser, sentez efektleri, müzik sıralayıcı
    ui/                  ekranlar (menü, kurulum, HUD, duraklatma, sonuç, ayarlar, öğretici katmanı)
    i18n/tr.ts           Türkçe metin tablosu (kaynak; anahtar yapısı buradan türetilir)
    i18n/en.ts           İngilizce metin tablosu (aynı anahtarlar)
    i18n/index.ts        etkin dilin seçimi ve tablo erişimi
    main.ts
  tools/sim-cli.ts       headless maç, turnuva ve denge raporu
  e2e/                   Playwright testleri (Aşama 7+)
```

## 3. Simülasyon

### Zaman

- Sabit adım: **20 tick/sn** (adım = 50 ms). Sabit `TICK_RATE` olarak tek yerde tanımlanır.
- Verideki tüm süreler (saniye) yükleme anında tamsayı tick'e **yukarı** yuvarlanarak çevrilir (en az 1); böylece
  hiçbir süre tanımlıdan kısa olmaz (PRD K-02). Sayaçlar tamsayıdır; kayan noktalı zaman birikimi yoktur.
- Altın ve deneyim tamsayıdır; yüzdeli gelir bonusları tamsayı kalan biriktiricisiyle uygulanır. Konum ve can
  kayan noktalı olabilir.

### Durum

`GameState` düz, JSON'a serileştirilebilir bir nesnedir (sınıf örneği, `Map`, fonksiyon, döngüsel başvuru yok):

- `tick`, `nextId`, `outcome` (`null | zafer(taraf) | beraberlik`), `rng` durumları
- `sides[2]`: altın, deneyim, çağ, üs canı ve azami canı, kuyruk (birlik türü kimliği + ilerleme), doğma
  bekletmesi, yuvalar (açık mı, kule türü, ödenen fiyat, saldırı sayacı), yetenek beklemesi, istatistikler
- `units[]`: kimlik, taraf, tür kimliği, x, can, saldırı sayacı, durum etkileri
- `projectiles[]`, `zones[]` (süreli yetenek alanları), `pendingStrikes[]` (gecikmeli vuruşlar), `stone`
- `ai[2]`: yapay zekâ belleği (karar zamanlayıcısı, plan, rezerv)

### Komutlar ve doğrulama

- Komutlar: `QueueUnit`, `CancelOrder`, `UnlockSlot`, `BuildTower`, `SellTower`, `CastAbility`, `AgeUp`.
  Duraklatma bir simülasyon komutu değildir; döngü düzeyindedir.
- Tek bir `validate(state, command) → ok | reason` fonksiyonu vardır. Arayüz, düğmelerin etkinliğini ve
  "neden kullanılamaz" metnini bu fonksiyondan alır (PRD K-16). Böylece arayüzün gösterdiği ile simülasyonun
  kabul ettiği asla ayrışmaz. Duraklatma simülasyon durumunda olmadığından "oyun duraklatıldı" reddi döngü
  katmanında verilir; metni aynı ret nedeni tablosundan gelir.
- Kabul edilen komutun maliyeti anında ve bir kez düşülür; reddedilen komut durumu değiştirmez (PRD K-01).

### Adım sırası (her tick, sabit)

1. Sonuç belirlenmişse hiçbir şey yapma (PRD S-11, K-06).
2. Bu tick'e damgalı komutları uygula (önce taraf 0, sonra taraf 1). Yapay zekâ komutları `match` katmanında,
   bu adımdan hemen önce gözlemden üretilir.
3. Ekonomi: temel gelir (+ Sınır Taşı bonusu).
4. Üretim: aktif siparişi ilerlet; tamamlanınca doğma alanı boşsa doğur, değilse beklet (PRD B-06).
5. Durum etkileri ve alanlar: süreleri azalt, alan etkilerini **bekleyen hasara** ekle.
6. Hedefleme: tüm birlikler tick başındaki konumlara göre hedef seçer (iki taraf aynı anlık görüntüyü görür).
7. Hareket: her taraf önden arkaya işlenir. Sınırlar: öndeki dost birliğin arka kenarı − aralık; karşı
   tarafın tick başındaki en ön kenarına kalan boşluğun yarısı (iki taraf aynı adımda iç içe geçmez); rakip üs ön yüzü.
8. Saldırılar: tüm sayaçlar 1 azalır (0'ın altına inmez); sayacı sıfır ve hedefi menzilde olan birlikler saldırır; yakın dövüş bekleyen hasara, diğerleri mermi üretir.
9. Mermiler ilerler; çarpanlar bekleyen hasara eklenir. Kuleler saldırır. Gecikmeli vuruşlar patlar.
10. **Bekleyen hasar eşzamanlı uygulanır** (PRD S-09). Canı ≤ 0 olan birlikler kaldırılır, ödül karşı tarafa
    verilir; birlik listeden aynı adımda çıktığı için ödül ikinci kez verilemez (PRD K-03).
11. Sınır Taşı kontrol değeri güncellenir.
12. Sonuç: iki üs ≤ 0 → beraberlik; biri ≤ 0 → diğeri kazanır; `outcome` bir kez yazılır (PRD K-06, K-15).
13. `tick++`, istatistikler.

### Olaylar

Adım, durumu değiştirirken bir olay listesi üretir (`UnitSpawned`, `Attack`, `ProjectileFired`, `UnitDied`,
`BaseDamaged`, `AgeUp`, `TowerBuilt`, `TowerSold`, `AbilityCast`, `MatchEnded`…). Çizim, ses, arayüz ve
öğretici bu olayları dinler. Olaylar duruma yazılmaz; kalıcı olması gereken her şey (istatistikler dâhil)
durumun içindedir.

### Determinizm

- `sim` ve `ai` içinde `Math.random`, `Date`, `performance`, zamanlayıcı ve DOM kullanılmaz.
- Rastgelelik tohumlu, durumu serileştirilebilen bir üreteçle (ör. sfc32) ve ayrı akışlarla sağlanır
  (her yapay zekâ için bir akış). Savaş hesapları rastgelelik kullanmaz (PRD S-12).
- Simülasyonda trigonometrik/üstel fonksiyon kullanılmaz; ölçekleme değerleri veride hazır tamsayıdır.
- Yineleme yalnızca diziler üzerinden ve sabit sırayla yapılır.
- Aynı tohum + aynı komut dizisi → aynı durum karması. Bu, kayıt/devam ve hata tekrarının temelidir.

### İlerleme garantisi (PRD S-13, K-05)

GDD §2'deki argümana ek olarak: soak testlerinde bir **kilitlenme dedektörü** çalışır — sahada en az bir birlik
varken 30 sn oyun süresi boyunca hiçbir birlik konum değiştirmez ve hiç hasar oluşmazsa test başarısız olur.

## 4. Oyun döngüsü

- `requestAnimationFrame` + biriktirici: `acc += min(kareSüresi, 250 ms)`; `acc ≥ adım` oldukça `step()`.
  Çizim, son iki tick arasında `alpha = acc / adım` ile interpolasyon yapar. Böylece oyun hızı kare hızından
  bağımsızdır (PRD K-09).
- Arayüz komutları bir kuyruğa yazılır ve bir sonraki tick'e damgalanır.
- **Duraklatma:** döngü `step()` çağırmaz, biriktirici sıfırlanır, arayüz komut düğmelerini kapatır
  (PRD ÖK-07, K-14). `visibilitychange` (gizli) → duraklat + kaydet. `pagehide` → kaydet.
- Geliştirme bayrağı `?debug`: hız ×1/×4/×16 (kare başına adım sayısı), menzil çizimi, altın ver, üs canını
  ayarla, durum karmasını göster, performans paneli (fps, adım ms, çizim çağrısı, birlik/mermi sayısı). Üretim derlemesine girmez.

## 5. Yapay zekâ ve headless araçlar

- `buildObservation(state, side)` yalnızca görünür bilgiyi kopyalar (PRD R-03).
- Denetleyici arayüzü `decide(observation, memory, tick) → { commands, memory }` saf bir fonksiyondur; zorluk
  profili denetleyici kurulurken verilir. Rastgele üreteç durumu bellekte tutulur ve ilk değeri
  `config.seed` ile taraftan türetilir; böylece denetleyici yalnız `config`'ten yeniden kurulabilir. `match`
  katmanı onu her tick, `sim.step`'ten hemen önce çağırır. Ürettiği komutlar oyuncununkilerle aynı `validate` yolundan geçer (PRD R-02).
- Bellek `state.ai[side]` içindedir; kayda girer (PRD ÖK-05).
- **Gizli bilgi testi (PRD K-13):** oyuncunun altını, deneyimi, kuyruğu ve yetenek beklemesi değiştirilmiş iki
  durumdan alınan kararlar birebir aynı olmalıdır.
- `npm run sim` alt komutları:
  - `match --a normal --b hard --seed 1` → tek maç özeti
  - `tournament --a normal --b easy --games 200` → kazanma oranı, süre dağılımı, çağ geçiş zamanları,
    rol kullanım payları (GDD §10 hedefleri)
  - `soak --games 500` → değişmez denetimleri ve kilitlenme dedektörü
- Denge raporu, hedef eşiklerin altında kalan satırları işaretler.

## 6. Çizim ve performans

- Pixi uygulaması 1920×1080 mantıksal sahne kullanır; pencereye sığacak şekilde ölçeklenir (kenar boşluklu).
  `devicePixelRatio` en fazla 2.
- Katmanlar: arka plan, üsler, kuleler, birlikler (ağır arkada), mermiler, efektler, yetenek önizlemesi, debug.
- Görünüm nesneleri simülasyon varlık kimliğine bağlıdır; olaylar ve durum farkıyla oluşturulup silinir.
  Görsel durum (animasyon karesi vb.) simülasyonda tutulmaz; kayıttan dönüşte yeniden kurulur.
- `src/art/`: her birlik, kule ve üs için parça tanımları (şekil, renk belirteci, eksen noktası) ve animasyon
  fonksiyonları. Açılışta her parça bir kez dokuya çizilir; sprite havuzu kullanılır. Bu soyutlama, ileride
  dışarıdan sprite sayfası ile değiştirmeye izin verir.
- **Bütçe (referans cihaz, 1080p):** en kötü sahnede 120 birlik + 80 mermi + 150 parçacıkla 60 fps;
  simülasyon adımı < 1 ms; çizim çağrısı < 50. İlk yükleme paketi < 1,5 MB (sıkıştırılmış).

## 7. Arayüz

- DOM katmanı tuvalin üstündedir. Ekranlar `mount/unmount` olan küçük modüllerdir. HUD her karede değil,
  değer değiştiğinde DOM'a yazar.
- Tüm metinler `src/i18n/` metin tablolarındadır (`tr.ts`, `en.ts`); kod içinde görünen metin yazılmaz. Etkin
  dil açılışta, arayüz kurulmadan önce bir kez seçilir (kayıtlı ayar, yoksa `navigator.language`); dil
  değişince sayfa yeniden yüklenir (canlı geçiş yok: kurulmuş DOM metinleri yeniden yazılmaz). Tarayıcı
  algılaması uygulama katmanında yapılır; `game` katmanı DOM/`navigator` kullanmaz, dili parametre olarak alır.
- Düğmeler gerçek `<button>` öğeleridir; odak görünür, `aria-label` ve araç ipucu vardır.
- Kısayollar `KeyboardEvent.code` (fiziksel tuş) ile dinlenir. Etiketler Keyboard Map API varsa kullanıcının
  düzenine göre, yoksa Türkçe Q klavye varsayımıyla gösterilir.

## 8. Ses

- `AudioContext` ilk kullanıcı etkileşiminde oluşturulur. Ana çıkış → müzik ve efekt kazanç düğümleri;
  ayar değeri (0–100) algısal eğriyle kazanca çevrilir.
- Efektler küçük "tarif" fonksiyonlarıyla (osilatör/gürültü/zarf/filtre) açılışta `AudioBuffer`'a üretilir.
- Müzik, ileri bakışlı zamanlayıcıyla çalan bir adım sıralayıcıdır; oyunla birlikte duraklar.
- Eşzamanlı ses sınırı: aynı efekt en fazla 4, toplam 24.

## 9. Kalıcılık

| Anahtar | İçerik |
|---|---|
| `devir.settings.v1` | Ses düzeyleri, ekran sarsıntısı |
| `devir.results.v1` | Son 20 sonuç, zorluk başına toplamlar |
| `devir.tutorial.v1` | Öğretici tamamlandı mı |
| `devir.save.v1` | Aktif maç kaydı (tek yuva) |

- **Kayıt biçimi:** `{ schemaVersion, gameVersion, savedAt, matchConfig, state, checksum }`. `checksum`,
  `state`'in JSON metninin FNV-1a karmasıdır. `savedAt` yalnızca bilgi amaçlıdır; simülasyona girmez.
- **Ne zaman:** kurallar PRD ÖK-03 ve ÖK-08'de. Uygulama: periyodik kayıt her 200 tick'te (10 sn oyun süresi);
  anlık kayıtlar duraklatma, `visibilitychange` (gizli), ana menüye dönüş ve `pagehide` anlarında.
- **Yükleme:** ayrıştır → sürüm → bütünlük karması → yapısal doğrulama → veri başvuruları (tür kimlikleri
  mevcut mu) → simülasyon değişmezleri (`checkInvariants`; ör. birbirini tamamen geçmiş düşman birlik yok). Herhangi biri başarısızsa kayıt silinir ve oyuncu bilgilendirilir (PRD ÖK-04).
- İlk sürümde kayıt göçü yoktur: uyumsuz sürüm bilgilendirilerek silinir.
- Tüm `localStorage` erişimleri `try/catch` içindedir; yazma başarısız olursa (gizli pencere, kota) oyun
  sürer ve bir kez uyarı gösterilir.

## 10. Test ve doğrulama

| Tür | Kapsam | Araç / komut |
|---|---|---|
| Birim | Sistemler: ekonomi, üretim, hareket, hedefleme, savaş, kule, yetenek, çağ, taş, sonuç | Vitest — `npm test` |
| Senaryo | Belirli konumlardaki birliklerle beklenen sonuç (karşılık ilişkileri, çağ değeri) | Vitest |
| Bulanık (fuzz) | Tohumlu rastgele komut dizileri; her tick değişmez denetimi | Vitest (ek kütüphane yok) |
| Determinizm | Aynı tohum + komutlar → aynı karma; kaydet-yükle-devam → aynı karma | Vitest |
| Döngü | Farklı sentetik kare akışları → aynı tick sayısı ve karma | Vitest |
| Soak | Çok sayıda yapay zekâ maçı: biter, kilitlenmez, değişmezler korunur | `npm run sim -- soak` |
| Mimari | `data`/`sim`/`ai` üst katman veya DOM/Pixi içe aktarmaz | Vitest |
| E2E | Kritik akışlar: başlat, duraklat, sekme gizle, kaydet, yeniden yükle, devam, öğretici | Playwright — `npm run e2e` |
| Denge | GDD §10 hedefleri | `npm run sim -- tournament` |
| Elle | Her aşama sonunda lead'in tarayıcıda oynaması, ekran görüntüleri | Yerleşik tarayıcı |

**Değişmezler (her tick):** altın ≥ 0; 0 ≤ can ≤ azami can; birlik kimlikleri tekil; aynı taraftaki birlikler
üst üste binmez; kuyruk ≤ 5; sonuç yazıldıysa durum değişmez.

### Kabul kriterlerinin doğrulanması

| Kriter | Doğrulama |
|---|---|
| K-01 | Bulanık test + değişmez (altın ≥ 0) + her satın alma türü için "bir kez düşülür" birim testi |
| K-02 | Birim: menzil dışından saldırı yok; ardışık saldırılar arası ≥ aralık (birlik ve kule) |
| K-03 | Birim: aynı adımda çoklu öldürücü kaynak, alan hasarı ve geç gelen mermiyle ödül tekliği |
| K-04 | Birim: çağ geçişi öncesi/sonrası birlik, kule, kuyruk ve can yüzdesi karşılaştırması |
| K-05 | Soak + kilitlenme dedektörü; doğma bekletme senaryosu |
| K-06 | Birim: sonuçtan sonra ek adımlar durumu değiştirmez; sonuç olayı tek |
| K-07 | Determinizm: kesintisiz koşu ile ortada kaydet-yükle-devam koşusunun son karmaları eşit; E2E yeniden yükleme |
| K-08 | Birim + E2E: maç → yeni maç; durum, döngü ve görünüm nesneleri sıfırdan |
| K-09 | Döngü testi: 30/60/144 fps ve titreşimli kare akışları |
| K-10 | Birim: iptal iadesi, başlamış siparişi iptal reddi, 6. siparişin reddi |
| K-11 | Birim: satış iadesi (tek ve çift fiyatlarda aşağı yuvarlama), yuva/çağ iadesizliği |
| K-12 | Birim: yetenek üsse/dostlara hasarsız, duraklatma/bitiş reddi, çağ geçişinde bekleme aktarımı |
| K-13 | Gizli bilgi testi (§5); yapay zekâ komutlarının `validate`'ten geçtiği testi |
| K-14 | Döngü testi + E2E: `visibilitychange` sonrası tick sayısı sabit; duraklatmada komut reddi |
| K-15 | Birim: iki üs aynı adımda sıfırlanır → beraberlik |
| K-16 | Birim: her ret nedeninin bir arayüz metni vardır; E2E örnek denetim |

**Kalite kapısı:** `npm run check` = `typecheck` + `test` + `build`. Her aşama bu komutla kapanır.

## 11. Derleme ve yayın

- `npm run build` → `dist/` statik çıktı, `base: './'` (göreli yollar; itch.io ve alt dizinlerde çalışır).
- Oyun sürümü `package.json`'dan ve git kısa karmasından derleme anında eklenir; Ayarlar ekranında görünür.
- Dağıtım hedefi (PRD A7): itch.io HTML5, ücretsiz (zip yükleme veya `butler`). Aynı statik çıktı
  GitHub Pages / Cloudflare Pages'te de çalışır.
- İlk sürümde analitik veya izleme yoktur.

## 12. Desteklenen ortam

- **Tarayıcılar:** Chrome, Edge, Firefox — son iki ana sürüm; Safari 17+ (macOS).
- **Ekran:** en az 1280×720; referans 1920×1080 ve 1366×768.
- **Referans cihaz:** ~4 yıllık orta sınıf dizüstü, tümleşik GPU (Intel Iris Xe veya Radeon Vega 8 sınıfı), 8 GB RAM.
- WebGL2 gerekir; yoksa açıklayıcı bir hata ekranı gösterilir.

## 13. Kod kuralları

Kesin kurallar proje kökündeki `CLAUDE.md`'dedir. Ek ayrıntılar:

- Durum şemasına eklenen alan kayıt biçimini etkiliyorsa `schemaVersion` artırılır; eski kayıtlar §9'a göre işlenir.
- Kabul kriterini doğrulayan testin adı kriter kimliğini içerir (ör. "K-03: …").
- Yeni bir ret nedeni eklendiğinde arayüz metni de `tr.ts`'e eklenir (PRD K-16).
