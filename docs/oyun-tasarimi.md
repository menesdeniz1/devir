# Devir — Oyun Tasarım Dokümanı (GDD)

Bu belge kuralların **nasıl** işlediğini, formülleri, içerik kadrosunu, yapay zekâ davranışını, arayüzü ve
görsel/ses yönünü tanımlar. Ürün davranışı ve kabul kriterleri: [prd.md](prd.md). Uygulama: [teknik-tasarim.md](teknik-tasarim.md).

> **Sayısal değerlerin tek kaynağı kuralı.** Buradaki tablolar **başlangıç değerleridir**. Aşama 1–5 boyunca
> ilgili tablolar `src/data/` altındaki veri dosyalarına taşınır ve buradan silinerek yerine dosya bağlantısı
> konur. Sonrasında bu belgede yalnızca formüller, roller arası ilişkiler ve denge hedefleri kalır; sayı
> değişiklikleri yalnızca veri dosyasında yapılır.

---

## 1. Koridor ve geometri

Savaş tek boyutludur: her birliğin koridor üzerinde bir `x` konumu ve bir `genişlik` değeri vardır. Dikey
konum yalnızca görseldir.

| Sabit | Değer |
|---|---|
| Dünya genişliği | 1920 birim (1920×1080 mantıksal sahne) |
| Üs genişliği | 160 birim — oyuncu 0–160, rakip 1760–1920 |
| Savaş alanı | Üs ön yüzleri arası: 160 → 1760 (1600 birim) |
| Dost birlik aralığı | 6 birim |
| Doğma konumu | Birliğin arka kenarı kendi üssünün ön yüzünde |
| Görsel derinlik kayması | Birlik kimliğine göre ±6 px dikey (yalnızca görsel, okunabilirlik için) |

Ön hat birliği koridoru yaklaşık 27 sn'de geçer (1600 / 60).

## 2. Birlik davranışı

Her birlik her adımda şu durumlardan birindedir:

| Durum | Koşul |
|---|---|
| **Saldırıyor** | Menzilde hedef var (önce birlik, yoksa üs — PRD S-06) |
| **Yürüyor** | Hedef yok ve önü açık |
| **Bekliyor** | Hedef yok, önündeki dost birlik yolu kapatıyor (PRD S-04) |
| **Etkisiz** | Sersemletme/donma etkisi altında (süreli) |

- Mesafe, birbirine bakan kenarlar arasında ölçülür. Hedef seçimi her saldırı anında yeniden yapılır.
- Menzildeki en yakın düşman birliği hedeflenir. Koridor tek boyutlu olduğundan "en yakın" = en öndeki düşman.
- Birlik düşmanla temas edince ilerleyemez (PRD S-05). Tüm birliklerin menzili > 0 olduğundan temas eden
  düşman her zaman menzildedir.
- **Saldırı zamanlaması:** Her birliğin bir saldırı sayacı vardır. Sayaç her adım azalır; menzilde hedef
  varken sayaç sıfırsa saldırı yapılır ve sayaç `saldırı aralığı`na kurulur. Yeni doğan birliğin sayacı sıfırdır. Sayaç saldırı kontrolünden önce azaltılır; süreler tick'e yukarı
  yuvarlanır (TDD §3), böylece hiçbir saldırı tanımlı aralıktan sık olmaz.
- **İlerleme garantisi (PRD S-13):** Bir birlik ya saldırır, ya yürür, ya süreli bir etki altındadır, ya da
  önündeki dost birliği bekler. Bekleme zinciri her zaman saldıran veya etkisi süreli bir birlikte biter ve
  her rol her role sıfırdan büyük hasar verir (birlikler arası en küçük çarpan 0,6). Bu nedenle kalıcı kilitlenme oluşamaz.

## 3. Savaş hesapları

**Hasar = taban hasar × rol çarpanı (saldıran, hedef) × hedefin aldığı hasar çarpanı (durum etkileri).**

### Rol çarpanları

Birlik rollerinin çarpanları ve mermi hızları `src/data/combat.ts`'te, kule türlerininki `src/data/towers.ts`'te
(tek kaynak). Simülasyon bunları yüklerken tür başına tamsayı hasar tablosuna çevirir. Yeteneklerin çarpanı
tüm rollere 1,0'dır ve üsse etki etmez (PRD Y-03); veriye Aşama 5'te girer.

Amaçlanan karşılık döngüsü:

- **Ön hat > Ağır:** Kuşatma makinesi yakın dövüşte savunmasızdır.
- **Ağır > Menzilli:** Alan hasarı, ön hattın arkasında kümelenen kırılgan menzillileri ezer.
- **Menzilli > Ön hat:** Ön hat menzilliye ulaşana kadar korunaklı konumdan hasar yer.
- **Ağır > Kuleler/üs:** Üsse ×2,5 hasar ve hızlı kulenin menzilinin dışından atış (PRD B-03).
- **Kuleler > Menzilli ve ön hat baskısı;** ama ağır birliğe karşı yetersiz → savunma tek başına yetmez.

Karşılık döngüsü **dizilişe** bağlıdır: tek şeritte birlikler birbirini geçemediği için ön hat + menzilli düzeni
ancak üretim sırası ön hattı önde tuttuğunda işler. Önceden dizilmiş senaryolardaki (`npm run sim -- matchup`)
üstünlük, sürekli akan üretimde zayıflar; denge ölçümü bu yüzden gerçek maç turnuvalarıyla yapılır (§10).

### Alan hasarı, delme ve mermiler

- **Alan hasarı:** Ana hedef tam hasar alır; çarpma noktasına `yarıçap` içindeki diğer düşman birlikleri
  %50 alır. Üs alan hasarından etkilenmez.
- **Delme:** Ana hedef ve onun arkasındaki en yakın `n` düşman birliği (ana hedeften en fazla 100 birim
  uzakta) tam hasar alır.
- **Yakın dövüş** hasarı anında uygulanır. **Menzilli, ağır ve kule** saldırıları mermi oluşturur.
- Mermi hedefini takip eder. Hedef mermi varmadan ölürse: tek hedefli mermi kaybolur; alan hasarlı mermi
  hedefin son konumuna düşer ve patlar. Böylece fazla öldürme olsa bile ödül tektir (PRD K-03).
- Mermi hızları `src/data/combat.ts`'te; kule mermisi (başlangıç 700 birim/sn) Aşama 4'te eklenir.
  Ağır birliğin mermisi görselde yay çizer.

### Yenilgi ödülü

- Altın ödülü = maliyetin %60'ı; deneyim ödülü = maliyetin %50'si (5'e yuvarlanmış değerler veride tutulur).
- Birlik öldüğünde karşı taraf ödülü o adımda bir kez alır. Öldürme birlik, kule veya yetenekten gelebilir.

## 4. Ekonomi ve çağlar

Çağ başına deneyim eşiği (toplam), geçiş ücreti, üs azami canı, temel gelir ve Sınır Taşı bonusları
`src/data/ages.ts`'tedir (tek kaynak). Tasarım niyeti: gelir ve maliyetler çağ başına ×1,75 büyür. Üs canı ise
çağlarla **yavaş** büyür (≈ 11000 × 1,03^(n−1)): erken çağda tek çağ farkı üssü hızla düşüremez (geride kalanın
toparlanma süresi olur), geç çağda güçlenen birlikler üssü bitirebilir (çıkmaz oluşmaz). İlk değerlerdeki ×1,6
büyüme, erken üssü bir dakikada düşürüp geç üssü yıkılmaz yaptığı için Aşama 10 denge turunda değiştirildi.

- **Başlangıç:** 150 altın, 0 deneyim, İlkel Çağ, tam üs canı, yuva 1 açık ve boş, yetenek 30 sn beklemede.
- **Geri dönüş hedefi (PRD E-06):** Sıfır altından, temel gelirle güncel çağın ön hat birliği **≤ 13 sn**'de
  sipariş verilebilir (üretim süresi hariç; örn. İlkel: 50 / 4 = 12,5 sn).
- **Tempo:** İlk tahmin her çağın ≈ 2,5–3 dk sürmesiydi. Aşama 6 ölçümünde 2. çağ eşiği bilerek yüksek tutuldu
  (≈ 800): daha düşük eşik erken ön hat akınını ödüllendirip maçı ilk çağ farkıyla bitiriyordu. Hızlı tempo
  sonraki çağların daha sıkışık eşikleriyle sağlanır; Normal–Normal maçlarının ≈ %40'ı 4., ≈ %25'i 5. çağı görür.
- **Çağın değeri:** Lanchester yaklaşımıyla aynı altına bir çağ öndeki ordu ≈ %30 daha güçlüdür (can ve
  hasar ×2, maliyet ×1,75). Çağ atlamak değerlidir ama tek başına belirleyici değildir.

## 5. Birlikler

### İlkel Çağ taban değerleri

Üç rolün İlkel Çağ değerleri `src/data/units.ts`'tedir (tek kaynak); aşağıdaki ölçekleme bu değerlerden
diğer çağları türetir.

### Çağ ölçekleme (çağ `n` için, `n` = 1…5)

| Değer | Formül |
|---|---|
| Maliyet | taban × 1,75^(n−1), en yakın 5'e yuvarla (tam ortada yukarı) |
| Can, hasar | taban × 2^(n−1) |
| Üretim süresi | taban × 1,08^(n−1) |
| Ödüller | maliyetten (§3) |
| Menzil, hız, genişlik | rol tabanı × birliğin değiştiricisi (aşağıda) |

Hesaplanan değerler veri dosyasına tamsayı/sabit ondalık olarak yazılır; çalışma anında üs alma yapılmaz.

### Kadro (15 birlik)

| Çağ | Ön hat | Menzilli | Ağır / kuşatma |
|---|---|---|---|
| 1 İlkel | **Taşbaltacı** — taban | **Mızrak Savuran** — taban | **Kaya Kaldıracı** — alan hasarı, yarıçap 50 |
| 2 Antik | **Kalkanlı Mızrakçı** — can +%15, hasar −%10 | **Atlı Okçu** — hız +%40, can −%10 | **Balista** — delme (hedef + 2), alan yok |
| 3 Orta | **Zırhlı Muhafız** — can +%10 | **Arbaletçi** — aralık 1,8 sn, hasar +%60, ön hata çarpan 1,5 | **Mancınık** — menzil +%15, hız −%15, alan 70 |
| 4 Endüstri | **Süngülü Er** — hız +%10 | **Nişancı** — menzil +%15 | **Buharlı Top Arabası** — can +%20, alan 60 |
| 5 Gelecek | **Plazma Muhafızı** — can ve hasar +%10 | **Ray Tüfekçisi** — delme (hedef + 1) | **Yürüyen Kale** — can +%25, hız −%10, alan 80, hasar ×2 (çağ istisnası: geç oyun ağır düellosunu kısaltır, §10) |

Kadro adları ve görsel kavramları özgündür; türün bilinen oyunlarındaki birlik adları ve tasarımları kullanılmaz.

## 6. Savunma

- Yuva 1 açık; diğer ikisi sırayla, altınla açılır; açma ücreti iade edilmez.
- Kuruluma yalnızca güncel çağın iki kulesi açıktır (PRD Ç-06). Kule kendi çağının değerlerini korur.
- Satış ve iade kuralları: PRD E-05 ve D-05.
- Menzil üssün ön yüzünden koridora doğru ölçülür. Tasarım niyeti: hızlı kule (A) ağır birliklerden biraz kısa
  menzillidir, böylece aynı çağın ağır birliği üssü A kulesinin menzili dışından döver (PRD B-03). Ağır kule (B)
  kısa menzilli alan hasarı verir ve kümelenen menzillileri cezalandırır.
- Kule değerleri, yuva ücretleri, satış oranı ve kule mermisi hızı `src/data/towers.ts`'tedir (tek kaynak).
  Ölçekleme birliklerle aynıdır: maliyet × 1,75^(n−1), hasar × 2^(n−1); menzil ve aralık sabit.

| Çağ | A (hızlı) | B (ağır, alan) |
|---|---|---|
| 1 İlkel | Sapan Direği | Kaya Oluğu |
| 2 Antik | Ok Burcu | Kızgın Kum Kazanı |
| 3 Orta | Arbalet Mazgalı | Kaynar Yağ Oluğu |
| 4 Endüstri | Makineli Yuva | Havan Mevzisi |
| 5 Gelecek | Darbe Lazeri | Plazma Havanı |

## 7. Özel yetenekler

Hedefleme: koridorda bir merkez noktası seçilir; alan, merkez ± genişliğin yarısıdır ve savaş alanı sınırına
kırpılır. Yalnızca düşman birliklerini etkiler; üsse ve dost birliklere etki etmez (PRD Y-03).

| Çağ | Yetenek | Etki | Alan genişliği | Bekleme |
|---|---|---|---|---|
| 1 | **Sürü Hücumu** | Yaban hayvanı sürüsü geçer: anında hasar + kısa sersemletme | 240 | 50 sn |
| 2 | **Ateş Hendeği** | Alana 6 sn süren ateş: içindeki düşmanlara saniyelik hasar | 220 | 55 sn |
| 3 | **Çivi Kapanı** | 10 sn: içindeki düşmanlar yavaşlar ve saniyelik hasar alır | 300 | 55 sn |
| 4 | **Baraj Ateşi** | Gecikmeli (alan önceden gösterilir) ağır vuruş | 320 | 60 sn |
| 5 | **Durağanlık Alanı** | Dondurma; donmuş düşmanlar daha fazla hasar alır | 260 | 60 sn |

Kesin hasar, süre ve genişlik değerleri `src/data/abilities.ts`'tedir (tek kaynak; yukarıdaki tablo niyeti anlatır).
**Tasarım kuralı:** anlık yetenek hasarı aynı çağın menzilli birliğini tek vuruşta öldürmez; yetenek ordunun
arka sırasını silmez, aşındırır (Aşama 6 denge bulgusu: Sürü Hücumu 120 → 60, aksi hâlde saf ön hat baskın oluyordu).

- **Bekleme aktarımı (PRD Y-05):** çağ geçişinde kalan süre = min(kalan süre, yeni yeteneğin beklemesi).
- **Durum etkileri:** sersemletme ve donma (hareket ve saldırı yok), yavaşlatma (hız çarpanı), savunmasızlık
  (alınan hasar çarpanı). Aynı tür etki üst üste binmez; süresi yenilenir.

## 8. Sınır Taşı

- **Bölge:** koridorun ortası, x = 860–1060.
- **Ele geçirme:** Kontrol, −100 (rakip) ile +100 (oyuncu) arasında bir tamsayı sayaçtır. Gövdesi bölgeyle
  kesişen birlikler bölgede sayılır. Bölgede yalnız bir tarafın birliği varsa sayaç her tick o tarafa doğru 1
  ilerler (tarafsızdan tam kontrole 100 tick = 5 sn). İki taraf da varsa veya kimse yoksa sayaç değişmez.
  Sayaç ±100'e ulaşınca o taraf **sahip** olur; sayaç sıfırı geçince sahiplik düşer.
- **Ödül (sahip tarafa):** sahibin çağına göre saniyede ek altın (temel gelirin ≈%30'u) ve deneyim
  (≈ 1,5 × 1,75^(çağ−1)); tamsayı değerler `src/data/ages.ts`'te, bölge `src/data/stone.ts`'te.
- **Kazan (1.2, kullanıcı kararı):** ödülün `potShare` (%50) kadarı sahibine hemen ödenmez, taşın **kazanında**
  birikir (sahibe `round(ödül × (1 − potShare))`, kalanı kazana; toplam korunur). Taşı sahibinden **söken** taraf
  (sayaç sıfırı geçince) kazanın tamamını, altın ve deneyim olarak alır; kazan boşalır. Taşı hiç kaybetmeyen
  sahibin kazanı kimseye geçmez. Amaç: taşı tutmak hedef olmak demektir, sökmek büyük ödüldür; kartopu kırılır.
  Ölçüm (Normal–Normal, 200 maç, aşınmayla; deney 2026-11-07): taşı ilk alan %81,5 → %48,2 kazanır, uzun tutan
  %91,5 → %61,3; Zor–Normal %77,5, Normal–Kolay %98,5 (beceri farkı korunur). Kazan payı %80'de taşı ilk almak
  dezavantaja döner (%40,5); %60–70 benzer ama zayıf tarafı güçlendirir.
- **8.1 Aşınma (1.2):** maç kurulumunda açıksa (varsayılan; kapalısı "uzun maç") 13:00'ten sonra iki üs de her
  saniye azami canının binde 5'ini kaybeder (`src/data/stone.ts` `EROSION`). Neden: taşın kartopu kırılınca
  eşit güçteki ordular ortada kilitlenebilir (kazan tek başına: %33 maç 20 dakikayı aşar); üs hasarını artırmak
  işe yaramaz çünkü birlikler üsse ulaşmaz. Aşınma birlikten bağımsızdır, maçı en geç ≈17 dakikada bitirir ve o
  ana kadar rakibe daha çok hasar vermiş tarafı ödüllendirir; iki üs aynı adımda düşerse beraberlik (K-15).
  Öğretici aşınmasız kurulur.
- **Görsel:** taş, sahibinin amblemini ve rengini taşır; ilerleme halkası gösterilir. Sahibi her saniye gelir
  aldığında taşın üstünden taşın altın payı ("+2 altın") yükselir; işaret o anki taşın tepesinin üstünden doğar.
- **Çağa göre taş (insan oyun testi, 1.1.0):** getirisi çağla arttığı için taşın görünüşü de çağla değişir.
  Taş savaş alanının çağını, yani arka plan gibi oyuncunun çağını izler; çağ değişince kısa (≈0,65 sn) yumuşak
  geçiş yapar (eski taş hafifçe şişerek söner, yenisi büyüyerek belirir), yeni maçta geçişsiz başlar.
  İlkel: oyma spiralli, yosunlu kaba dikili taş. Antik: basamaklı kaide üstünde bronz tepelikli, terakota frizli
  mermer dikilitaş. Orta: demir kuşaklı, arduvaz başlıklı yontma sınır taşı; yuva armalı kalkan. Endüstri: tuğla
  kaide üstünde dökme demir fener direği; yuva pirinç çerçeveli gösterge, fener camı sahibin renginde yanar.
  Gelecek: altıgen yayıcı üstünde hafifçe süzülen eflatun kristal; yuva parlayan çekirdek. Her görünümde amblem,
  ilerleme halkası, tarafsız işaret (yuvada üç çentik) ve bölge işaretleri aynıdır. Sahip halesi çağla biraz
  güçlenir (büyür ve koyulaşır) ama yarı saydam ve yavaş nefes alır (yanıp sönme yok, PRD GR-06); birliklerin
  arkasında kalır.
- **Arayüzde getiri (insan oyun testi, 1.1.0):** ilk insan testinde taşın ne işe yaradığı anlaşılmadı; gelir
  satırı taşı saymıyordu. Artık gelir satırı taş sendeyken toplamı ve taşın payını ("+9/sn · taş +2"), üst
  şeritteki taş göstergesi sahibin kazancını ("Sen · +2 altın, +3 XP/sn"), yakalama/kaybetme bildirimleri de
  kazancı söyler; ipucu ve öğretici adımı kuralı açıkça anlatır.
- **Yedek plan:** Denge testlerinde taş, yalnız savunma stratejisini önlemekte yetersiz kalırsa üsse verilen
  her 100 hasar 15 deneyim kazandırır (PRD E-10). Varsayılan olarak kapalıdır (veride 0).

## 9. Bilgisayar rakibi

### Bilgi

Yapay zekâ yalnızca **gözlem** nesnesini görür: kendi tam durumu ve PRD R-03'te sayılan görünür bilgiler
(uygulama: TDD §5).

### Karar modülleri

Her karar anında sırayla çalışır ve oyuncunun kullandığı komutların aynısını üretir:

1. **Tehdit değerlendirmesi:** kendi üssüne yakın düşman gücü, üs canı eğilimi, orduların güç oranı.
2. **Çağ planı:** deneyim eşiği geçildiyse ve tehdit düşükse çağ ücretini biriktirir (rezerv). Bir çağ gerideyse
   tehdit altında da biriktirir (tek geri dönüş yolu); Zor her zaman biriktirir.
3. **Savunma:** tehdit yüksekse yuva açar / kule kurar; düşman bileşimine göre A veya B seçer; eski çağ
   kulesini satıp yenisini kurmayı değerlendirir.
4. **Ordu bileşimi:** görünür düşman ordusuna göre bir **duruş** seçer ve ordusunu oranla değil duruşun
   **üretim dizisiyle** kurar (ör. ön hatta karşı ön-ön-menzilli), çünkü sipariş sırası dizilişi belirler (§3).
   Açılış dizisi maç başında karışık seçilir; karar anları rastgele dağılır, böylece aynı tohumlu iki yapay zekâ
   aynı oyunu oynamaz. Saf ön hat yığınına karşı daha kalın ön hat dizisi (ön-ön-ön-menzilli) kullanır. Kuyruğu
   hedef uzunlukta tutar.
5. **Yetenek:** alan içindeki düşman değerini en çok yapan noktayı tarar; eşik üstündeyse kullanır.
6. **Sınır Taşı:** taş kaybedilmişse ve güç oranı uygunsa ileri itmeyi ağırlıklandırır.

### Zorluk parametreleri

| Parametre | Kolay | Normal | Zor |
|---|---|---|---|
| Karar aralığı | 3,0 sn | 1,5 sn | 0,6 sn |
| Doğru karşılık seçme olasılığı | %35 | %70 | %95 |
| Çağ atlama gecikmesi (koşullar oluştuktan sonra) | 20–60 sn | 5–15 sn | 0–3 sn |
| Kule kullanımı | Üs canı %50'nin altına inince, yalnız yuva 1 | Baskı altındayken, en fazla 2 yuva | Baskıyı öngörür, 3 yuva, uygun tür, yenileme |
| Yetenek eşiği ve nişan | ≥1 hedef, ±80 birim sapma, rastgele gecikme | ≥3 hedef veya eşik değeri | En yüksek değerli nokta, savunma anlarında öncelik |
| Kuyruk ve altın | Altın boşta bekler, kuyruk 1 | Kuyruk 2–3 | Kuyruk dolu, çağ rezervi hesaplı |
| Sınır Taşı | Yok sayar | Dikkate alır | Aktif hedefler |

"Doğru karşılık seçme olasılığı", her kararda duruşun güncellenme olasılığıdır (sipariş başına değil). Kesin
profil değerleri `src/data/ai.ts`'tedir. Rastgele seçimler, kayda giren tohumlu üreteçten gelir (TDD §3).
Hiçbir seviye ek kaynak veya hasar almaz.

## 10. Denge hedefleri ve ölçümü

Headless turnuva aracı (TDD §5) ile ölçülür. Her eşleşme en az 200 maç, taraflar dönüşümlü.

| Hedef | Eşik |
|---|---|
| Maç süresi | PRD hedefi insan oyuncu ile Normal arasında 10–15 dk; bu oyun testinde doğrulanır. Yapay zekâ vekil ölçüsü: Normal–Normal medyanı (zaman aşımı dahil) 8–15 dk |
| Zorluk sıralaması | Zor, Normal'e karşı ≥ %70; Normal, Kolay'a karşı ≥ %70 kazanır |
| Tek tip ordu yok (PRD B-07) | Yalnız tek rol üreten bot (diğer kararları Normal) Normal bota karşı < %35 kazanır — her rol için; Normal ve Zor'da hiçbir rol harcanan altının %65'inden fazlası değildir |
| Yalnız savunma yok (PRD D-07) | Savunma ağırlıklı bot (yalnızca kule + gecikmeli saldırı) Normal bota karşı < %40 kazanır |
| Çağın değeri | Eşit harcamalı senaryoda bir çağ önde olan taraf %65–80 kazanır |
| Geri dönüş | Sıfırdan ön hat birliği ≤ 13 sn (§4) |

**Aynalı takas (Aşama 1 bulgusu).** Birlikler koridorda sıraya girdiğinden aynı türden iki ordu yalnızca ön
çiftleriyle dövüşür ve eş birlikler aynı adımda birbirini öldürür. Her düello süresinde bir birlik yenileyebilen
taraf geri itilemez; gelir × düello süresi + ödül ≥ maliyet olduğunda bu kolaydır. Bu yüzden sayı üstünlüğü
ancak birden çok birliğin aynı anda vurabildiği durumlarda (ön hattın arkasındaki menzilliler) ve karşılık
ilişkileri, kuleler, yetenekler ve çağ farkıyla sonuca dönüşür. Sonuçları:

- Yalnız ön hat veya yalnız menzilli ordu verimsizdir; bu PRD B-07 ile uyumludur.
- Aşama 1'in tek birlikli sürümünde rakip botun üretimi bilerek kısıtlıdır (`src/data/ai.ts`).
- Aşama 6'da aynalı yapay zekâ maçlarının süresi bu koşula karşı izlenir; gerekirse ödül oranı düşürülür.

**Maç süresi ve geri dönüş (Aşama 6–10 bulgusu).** İlk değerlerle Normal–Normal maçlarının çoğu, önce çağ atlayan
tarafın geride kalanı üssüne sıkıştırmasıyla 5–8. dakikada bitiyordu. Reddedilen iki çözüm: geride kalana çağ
ücreti indirimi (%20–40; zaman aşımı %18 → %45) ve çağ başına can/hasar çarpanını ×1,8–1,7'ye yumuşatmak (zaman
aşımı %31–41). İkisi de maçları uzatmak yerine çıkmaza çevirdi. İşe yarayan kaldıraç üs canı eğrisidir (§4):
maçların %71'i 4., %33'ü 5. çağı görür. Kalan zaman aşımları 5. çağdaki ağır düellosundan geliyordu (iki
Yürüyen Kale 300 menzilden birbirini döverken arkadaki ordu geçemiyordu); bu yüzden Yürüyen Kale formülün iki
katı hasar verir (§5). Son ölçüm, iki ayrı tohum kümesinde (200'er maç): Normal–Normal medyan 10:52 / 10:40,
zaman aşımı %5,5 / %7,5; Zor–Zor zaman aşımı %8,5 / %6,5.

## 11. Arayüz ve kontroller

### Savaş ekranı düzeni (16:9, 1920×1080 mantıksal)

- **Üst şerit:** sol — oyuncu üs canı ve çağ simgesi; orta — maç süresi, Sınır Taşı göstergesi, oyun hızı (PRD G-08), duraklat
  düğmesi; sağ — rakip üs canı ve çağ simgesi.
- **Orta:** koridor, üsler, kuleler, birlikler, mermiler, yetenek önizlemesi.
- **Alt panel (soldan sağa):** altın (sikke simgesi) ve gelir/sn · deneyim çubuğu (yıldız simgesi, mevcut/eşik) ve
  **Çağ Atla** (ücretiyle) · 3 birlik kartı (portre, ad, maliyet, kısayol rozeti, rol rengi şeridi) · 5 kutulu üretim
  kuyruğu (kutuda birliğin mini portresi ve rol işareti; ilk kutuda ilerleme şeridi; bekleyen kutuya tıklamak iptal
  eder) · 3 kule yuvası (kilitli / boş / dolu; dolu yuvada kurulu kulenin portresi; tıklayınca kur–sat menüsü, her
  seçenekte kulenin portresi) · yetenek düğmesi (bekleme halkası içinde yetenek simgesi, kalan sn).
- **Portreler:** birliğin durma pozu, kulenin kurulu hâli ve yetenek simgesi oyunun kendi kodla çizilmiş
  iskeletlerinden (§14) oyuncu renkleriyle küçük resimlere çizilir; ayrı resim dosyası yoktur. Portreler süstür
  (erişilebilir ad düğme metninden gelir). İlk çağınkiler açılışta, sonrakiler çağ değişince kare başına küçük bir
  süre bütçesiyle üretilir; hazır olana kadar kart yer tutucuyla (harf / rol işareti) çizilir.
- **Panel ölçüsü:** portreler kartın kendi yüksekliğine sığar; alt panel birliklerin yürüdüğü bandın altında kalır
  (1280×720'de ekranın alt ≈ %22'si). 1880 px'ten dar pencerelerde alt panel iki satırdır (üstte altın · çağ ·
  birlikler · yetenek, altta kuyruk · savunma). Değer değişince öğeler kaymaz (sabit genişlikler).
- **Görünüm:** kartlar, menüler ve ekranlar kesik kâğıt çıkartma biçimindedir (koyu kontur, üstte ince ışık, altta
  kâğıt gölgesi); panel kenarı ve portre zemini oyuncunun çağının paletinden hafif bir vurgu alır (§14). Düğme
  durumları: üzerine gelince hafif yükselme, basınca inme, kapalıyken soluk ve gri portre, klavye odağında beyaz
  halka. Metinler WCAG AA kontrastındadır; yanıp sönen öğe yoktur (PRD GR-06).
- Her düğmenin araç ipucu, değerleri ve kullanılamıyorsa nedenini gösterir (PRD EK-04), örneğin
  "Yetersiz altın (35 eksik)", "Kuyruk dolu", "Deneyim yetersiz (320/800)", "Bekleme: 12 sn".

### Kısayollar

| Eylem | Fare | Klavye |
|---|---|---|
| Ön hat / menzilli / ağır üret | Birlik düğmesi | 1 / 2 / 3 |
| Son bekleyen siparişi iptal et | Kuyruk kutusuna tık | Backspace |
| Yetenek hedeflemesi | Yetenek düğmesi → koridora tık | Q → tık (Q'ya tekrar basmak imleç konumunda uygular) |
| Hedeflemeyi iptal et | Sağ tık | Esc |
| Çağ atla | Çağ Atla düğmesi | E |
| Duraklat / devam et | Duraklat düğmesi | P veya Esc (hedefleme yokken) |
| Oyun hızı (1× → 1,5× → 2× → 3×) | Hız düğmesi | F |
| Kule kur / sat | Yuvaya tık → menü | — (ilk sürümde yalnız fare) |

Kısayollar fiziksel tuş konumuna bağlıdır; etiketler klavye düzenine göre gösterilir (TDD §7).

## 12. Öğretici akışı

Öğretici, özel yapılandırmalı bir maçtır: rakip pasif ve betiklidir, eşikler ve rakip üs canı düşüktür,
başlangıç altını yüksektir. Her adım bir oyun olayıyla tamamlanır; "Atla" her zaman görünür.

1. Hoş geldin: iki üs ve amaç (rakip üssü yık).
2. Ön hat birliği üret (1 veya düğme). → sipariş verildiğinde ilerler.
3. Birliğin kendiliğinden ilerler; rakip tek birlik gönderir. → ilk öldürmede altın ve deneyim ödülü anlatılır.
4. Menzilli birlik üret; ön hattın arkasında güvende ateş eder. → doğduğunda ilerler.
5. İki sipariş ver ve bekleyeni kuyruktan iptal et; tam iade. → iptalde ilerler.
6. Yuva 1'e kule kur. → kurulunca ilerler.
7. Rakip küme hâlinde gelir; yeteneği kullan. → kullanınca ilerler.
8. Deneyim eşiği doldu; çağ atla. → geçişte ilerler.
9. Sınır Taşı'nı ele geçir. → sahiplikte ilerler.
10. Rakip üssü yık. → "Öğretici tamamlandı", ana menü.

## 13. Sonuç ekranı ve istatistikler

- Başlık: **Zafer / Yenilgi / Beraberlik**; maç süresi; iki tarafın ulaştığı çağ.
- Birlik tablosu (oyuncu): tür başına üretilen, kaybedilen, öldürülen.
- Özet (iki taraf): kazanılan ve harcanan altın, üsse verilen hasar, kule ve yetenek öldürmeleri, çağ geçiş zamanları.
- Saklanan sonuç kaydı: tarih, zorluk, sonuç, süre, ulaşılan çağ. Son 20 kayıt ve zorluk başına toplamlar tutulur.

## 14. Görsel yön

**Stil (PRD A2): "kesik kâğıt / çıkartma" düz vektör, kodla çizilir.** Kalın koyu kontur, şekil başına iki ton (düz + gölge),
yumuşak köşeler. Karakterler parçalardan (kafa, gövde, kollar, silah, kalkan) kodla kurulur ve kodla
canlandırılır: yürüme salınımı, saldırı yayı, geri tepme, ölümde devrilip solma. Ton: renkli, hafif mizahi,
kansız; 13 yaş üstü ve aileye uygun.

### Rol siluetleri

| Rol | Boy | Siluet |
|---|---|---|
| Ön hat | ≈ 56 px | Geniş gövde, önde büyük kalkan |
| Menzilli | ≈ 52 px | İnce gövde, uzun silah, eğik duruş |
| Ağır | ≈ 80–96 px | Makine veya büyük düzenek; tekerlek/ayak, belirgin namlu/kol |

Kontrol: 32 px'e küçültülmüş gri tonlamalı görüntüde üç rol ayırt edilebilmelidir.

### Takım ayrımı (renk + en az iki ipucu, PRD GR-05)

1. **Bakış yönü:** oyuncu birlikleri sağa, rakip birlikleri sola bakar.
2. **Amblem:** oyuncu — daire, rakip — elmas; kalkanda, sancakta veya gövdede.
3. **Can çubuğu:** oyuncu — düz, rakip — çentikli.
4. **Renk:** oyuncu mavi–camgöbeği, rakip turuncu–kızıl (renk körlüğüne dayanıklı çift).

### Çağ kimlikleri

| Çağ | Palet | Malzeme ve üs | Arka plan |
|---|---|---|---|
| İlkel | Toprak, okr, yosun yeşili | Ahşap, deri, taş; çit ve totem | Kayalık vadi, ateş dumanları |
| Antik | Terakota, bronz, krem | Taş sütunlar, bronz kalkanlar | Zeytinlikler, tapınak siluetleri |
| Orta | Taş grisi, lacivert, sancak kırmızısı | Surlar, kuleler, sancaklar | Ormanlı tepeler, kale uzakta |
| Endüstri | Tuğla, dökme demir, buhar beyazı | Bacalar, perçinli levhalar | Fabrika silueti, is |
| Gelecek | Koyu lacivert, neon camgöbeği/eflatun | Altıgen paneller, enerji kalkanları | Gece gökyüzü, ışık şeritleri |

Her üs kendi sahibinin çağını gösterir; arka plan ve Sınır Taşı (§8) oyuncunun çağını izler.

### Okunabilirlik ve efektler

- Can çubuğu yalnız hasar alınca görünür; ölüler 0,6 sn'de solar; ağır birlikler arka katmanda çizilir.
- Mermiler küçük ama yüksek kontrastlıdır. Vuruş kıvılcımı, toz, üs hasar çatlakları (%75 / %50 / %25).
- Çağ geçişi: üs 1 sn'lik yeniden inşa animasyonu ve kısa bir ışık dalgası.
- Ekran sarsıntısı üs vuruşlarında ve büyük yeteneklerde; ayarlardan kapatılabilir.

### Denetim listesi (Aşama 9 kapısı)

1. **Siluet:** Her çağda üç rol, 32 px'e küçültülmüş gri tonlamalı görüntüde ayırt edilir.
2. **Renk dışı ayrım:** Gri tonlamada takımlar bakış yönü, amblem ve can çubuğundan ayırt edilir.
3. **Kalabalık:** Her tarafta 50+ birlik ve yoğun mermi varken roller ve takımlar ekran görüntüsünde okunur.
4. **Parlama:** Saniyede üçten fazla tam ekran parlama yoktur (PRD GR-06).

## 15. Ses yönü

- **Efektler:** Web Audio ile sentezlenen özgün sesler (osilatör, gürültü, zarf, filtre): vuruş, atış,
  patlama, doğma, ölüm, üs hasarı, çağ geçişi, arayüz tıkı, hata uyarısı. Tını çağla değişir
  (ahşap/taş → metal → barut → elektronik).
- **Müzik:** Çağ başına 60–90 sn'lik döngü; kodla sıralanan ritim ve melodi. Enstrüman paleti çağ ilerledikçe
  değişir (davul ve kemik flüt → lir → org ve yaylılar → bakır nefesliler ve mekanik ritim → sentezleyici).
  Kodla üretilen müziğin kalitesi sınırlıdır; dışarıdan müzik tercih edilirse aynı mikser üzerinden eklenir.
- **Mikser:** müzik ve efekt ayrı kanallar; ses ilk kullanıcı etkileşimiyle başlar (tarayıcı kuralı).
- **Tını yönü: yumuşak ve organik.** İlk insan oyun testinde efektler "hafif itici" bulundu; gürlük zaten
  normalleştirilmişti, sorun tınıydı. Ölçülen kök nedenler: bant dengeleyicinin her efekte eklediği 5,5 kHz üstü
  hışırtı (efektlerin ≈%10'u 4 kHz üstündeydi), 1–2 ms'lik anlık başlangıçlar (tıklama), çiğ testere/kare dalgalar,
  süzgeçsiz tiz gürültü ve çınlama, rezonanslı dar bant gürültü, sık seslerin birebir tekrarı. Kurallar:
  - Darbeler ahşap/taş/metal "tok" sesidir: süzgeçli, bant sınırlı gürültü + kısa sönen çınlama; bip ve cızırtı değil.
    Elektronik çağda bile vınlama üçgen dalga ve orta bant gürültüdür.
  - Testere/kare dalga perdeyi izleyen alçak geçirenle yuvarlatılır; gürültü 7 kHz üstünde kesilir, rezonans (Q > 1) yok;
    çınlamanın yüksek kısmileri doğal biçimde zayıflar.
  - Her katman en az 5 ms'de yükselir (ölçülen yükselme ≥ 3 ms; yalnız telli çalgı çekişi bilinçli olarak daha hızlı);
    çarpma gibi kısa seslere yumuşak bir "toz/gövde" kuyruğu eklenir.
  - Efekt veriyolu: 3,5 kHz üstüne −4 dB yumuşak raf + 10 kHz alçak geçiren; dengeleyici tiz banda dolgu eklemez.
  - Sık savaş sesleri (vuruş, atış, çarpma, patlama, doğma, ölüm, üs ve kule sesleri) üç tını çeşidiyle çalar
    (art arda aynısı gelmez), her çalışta ±%5 perde ve ±1,5 dB düzey sapması alır; aynı sesten en çok 3 kopya
    çalar, üst üste binen kopyalar kısılır; toplam eşzamanlı ses 16, aynı karede birleşen olay en çok +3 dB.
  - Efektler müziğe göre ≈1 dB geri çekildi (müzik, tipik savaş efektinin ≈9,5 LU altında).
  - Müzikte tiz vurmalılar (çalkalayıcı, zil, buhar, trampet) orta banda indirildi; sentezleyici süzgecinde rezonans yok.
  - Ölçüm ve hedefler: `src/audio/analysis.ts` (4 kHz üstü pay, spektral ağırlık merkezi, yükselme süresi, tepe, LUFS;
    önce → sonra tablosu) ve `tests/audio-timbre.test.ts`.
