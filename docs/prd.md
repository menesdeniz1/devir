# Devir — Ürün Gereksinimleri Dokümanı (PRD)

**Sürüm 1.1 · 2026-11-05.** Kullanıcının PRD v1.0'ı temel alındı. v1.0'da olmayan veya belirsiz olup
netleştirilen maddeler **(N)** ile işaretlidir. §17'deki açık kararlar 2026-11-05'te kullanıcı onayıyla kapatıldı.

Bu belge ürünün **ne yapması gerektiğini** tanımlar. Sayılar, formüller ve içerik ayrıntısı
[oyun-tasarimi.md](oyun-tasarimi.md)'de (GDD), uygulama kararları [teknik-tasarim.md](teknik-tasarim.md)'de (TDD)
tutulur. Ürün vizyonu ve başarı ölçütleri: [urun-tanimi.md](urun-tanimi.md).

---

## 0. v1.0'a göre başlıca değişiklikler

1. Birliklerin koridorda sıraya girmesi ve birbirini engellemesi tanımlandı (S-04, S-05). v1.0'daki
   "menzilli korunmaya ihtiyaç duyar" ifadesi ancak bu kuralla anlam kazanır.
2. "Kuşatma savunma kırmakta etkilidir" ile "kuleler ayrı hedef değildir" arasındaki çelişki giderildi (B-03).
3. Deneyimin yalnızca öldürmeyle kazanılmasının yarattığı kaplumbağa/kilitlenme riski için koruma eklendi (E-10).
4. Sonuç ekranına beraberlik eklendi (EK-06); v1.0'da beraberlik kuralı vardı ama ekranı yoktu.
5. Kuyruk kapasitesi, doğma noktası doluyken davranış, iadeler, duraklatmada komutlar, yetenek hedeflemesi,
   yapay zekânın "görünür durum" tanımı ve kayıt geçerliliği netleştirildi.
6. Kabul kriterlerine kimlik verildi (K-01…K-16) ve netleştirmelerden doğan kriterler eklendi.

---

## 1. Ürün özeti

Oyuncunun kendi üssünü savunurken birlik üreterek düşman üssünü yok etmeye çalıştığı, çağlar arasında gelişim
içeren, iki boyutlu ve yandan görünümlü bir strateji oyunu. Savaş, iki üssü bağlayan tek bir yatay koridorda
geçer. Oyuncu birlikleri tek tek yönetmez; birlikler otomatik ilerler, menzilindeki düşmanla savaşır, yol
açılınca rakip üsse saldırır. Oyuncunun işi kaynaklarını birlik üretimi, üs savunması ve çağ gelişimi arasında
paylaştırmaktır.

## 2. Ürün hedefi

Kolay öğrenilen, kısa oturumlarda oynanan ve farklı stratejileri teşvik eden bir deneyim. Oyuncu sürekli şu
kararlarla karşılaşır:

- Hemen saldırmalı mıyım, daha güçlü bir ordu mu hazırlamalıyım?
- Kaynaklarımı savunmaya mı, birliklere mi ayırmalıyım?
- Çağ atlamak için biriktirmeli miyim?
- Rakibin ordusuna karşı hangi birlikleri üretmeliyim?
- Özel yeteneğimi şimdi mi kullanmalıyım?

Derinlik, çok sayıda düğmeden değil, bu kararların sonuçlarından doğar.

## 3. Platform ve kapsam

- **G-01** Masaüstü tarayıcıda çalışır. Desteklenen tarayıcılar ve referans cihaz: TDD §12.
- **G-02** Tek oyunculu; bilgisayar rakibine karşı.
- **G-03** Fare ile eksiksiz oynanır; temel eylemlerin klavye kısayolu vardır (liste: GDD §11).
- **G-04** Arayüz Türkçedir. **(N)** Tüm metinler tek bir metin tablosunda tutulur (ileride çeviriye hazır).
- **G-05** Normal zorlukta hedef maç süresi 10–15 dakikadır.
- **G-06** Hesap açmadan oynanır; sunucu gerekmez.
- **G-07 (N)** Koridorun tamamı tek ekranda görünür; kamera kaydırma yoktur.
- **G-08** Mobil, çevrimiçi çok oyunculu mod ve hesap sistemi sonraki sürümlerde değerlendirilecektir.

## 4. Temel oyun döngüsü

1. **(N)** Oyuncu sahada birlik olmadan; başlangıç altını, tam canlı üssü ve İlkel Çağ birlik seçenekleriyle başlar.
2. Birlik üretir ve savunma kurar.
3. Birlikler otomatik savaşır.
4. Zamanla ve düşman birliklerini yenerek kaynak kazanılır.
5. Koşullar sağlanınca yeni çağa geçilir.
6. Yeni birlikler, kuleler ve yetenek açılır.
7. Bir üs yıkılana kadar döngü sürer.

## 5. Savaş kuralları

- **S-01** Oyuncunun üssü solda, rakibinki sağdadır.
- **S-02** Birlikler kendi üslerinin önünde doğar ve tek eksen üzerinde rakibe doğru ilerler.
- **S-03** Menziline düşman giren birlik durur ve saldırır. **(N)** Menzil, iki tarafın birbirine bakan
  kenarları arasındaki mesafedir.
- **S-04 (N)** Dost birlikler üst üste binmez: öndeki dost birliğin arkasında sıraya girer. Menzili yeten
  arka sıradaki birlik, öndekinin üzerinden saldırabilir.
- **S-05 (N)** Birlikler düşman birliklerinin içinden geçemez.
- **S-06** Hedef önceliği: menzilde düşman birliği varsa **en yakın** düşman birliği **(N)**; yoksa ve rakip
  üs menzildeyse üs.
- **S-07** Hedefi yok olan birlik **(N)** bir sonraki saldırısında yeniden hedef seçer; hedef yoksa ilerler.
- **S-08** Canı sıfıra düşen birlik **(N)** aynı adımda savaş alanından kaldırılır.
- **S-09 (N)** Aynı simülasyon adımındaki hasarlar eşzamanlı uygulanır; iki birlik aynı adımda birbirini
  yok edebilir.
- **S-10** Üs canı sıfıra düşen taraf kaybeder. İki üs aynı adımda yıkılırsa beraberlik olur.
- **S-11** Sonuç belirlenince tüm oyun işlemleri (simülasyon, gelir, üretim, yetenek, yapay zekâ) durur.
- **S-12 (N)** Savaşta rastgelelik yoktur (ıska veya hasar sapması yok): aynı girdiler aynı sonucu verir.
- **S-13 (N)** Kilitlenme olmaz: temas eden iki düşman her zaman birbirine hasar verebilir; bekleyen her birlik,
  önünde saldırmakta olan bir birliğe veya süreli bir etkiye (ör. sersemletme) bağlı olarak bekler.

## 6. Kaynaklar

### Altın

- **E-01** Düzenli temel gelir vardır. **(N)** Gelir, oyuncunun çağıyla artar.
- **E-02** Düşman birliğini yenen taraf altın ödülü alır. **(N)** Öldürme birlik, kule veya yetenekle olabilir.
- **E-03** Maliyet, işlem kabul edildiği anda bir kez düşülür. Reddedilen işlem hiçbir kaynağı değiştirmez.
- **E-04** Yetersiz altınla işlem yapılamaz; altın hiçbir durumda negatif olmaz.
- **E-05 (N)** İadeler: başlamamış üretim siparişi %100; kule satışı, o kule için ödenen fiyatın %50'si
  (aşağı yuvarlanır). Yuva açma ve çağ atlama ücretleri iade edilmez.
- **E-06** Temel gelir, ordusu tamamen yok edilmiş oyuncuya yeniden savaşa katılma imkânı sağlar. **(N)** Ölçüt:
  altını tükenmiş olsa bile güncel çağının ön hat birliğini makul sürede sipariş edebilir (hedef süre: GDD §4).

### Deneyim

- **E-07** Düşman birliklerini yenerek kazanılır (birlik, kule veya yetenekle).
- **E-08** Toplam deneyim sonraki çağın eşiğine ulaşınca o çağa geçiş açılır; geçiş ayrıca altın ister.
- **E-09** Deneyim harcanmaz; toplam ilerlemeyi gösterir.
- **E-10 (N)** Yalnızca savunma yaparak rakibin deneyim kazanmasını tamamen kesmek mümkün olmamalıdır.
  Koridorun ortasındaki Sınır Taşı'nı tutan taraf ek gelir ve deneyim kazanır (GDD §8).

## 7. Çağlar ve gelişim

- **Ç-01** Beş çağ: İlkel Çağ, Antik Çağ, Orta Çağ, Endüstri Çağı, Gelecek Çağı.
- **Ç-02** Çağlar sırayla açılır, atlanamaz. İki taraf birbirinden bağımsız gelişir.
- **Ç-03 (N)** Çağ geçişi anlıktır.
- **Ç-04** Geçiş, sahadaki birlikleri kaldırmaz. **(N)** Mevcut birlikler ve kuleler eski çağ değerlerini korur.
- **Ç-05** Kuyruktaki siparişler, verildikleri çağın birliği olarak tamamlanır. Geçişten sonraki yeni
  siparişler güncel çağdan verilir.
- **Ç-06** Mevcut kuleler korunur. **(N)** Yeni kurulabilecek kuleler yalnızca güncel çağın kuleleridir.
- **Ç-07** Üs canının yüzdesi korunur (yeni azami can × eski yüzde); geçiş ücretsiz tam iyileşme sağlamaz.
- **Ç-08** Son çağa ulaşmak otomatik galibiyet sağlamaz.
- **Ç-09** Her çağda üs görünümü, birlikler, kuleler ve özel yetenek değişir.

## 8. Birlikler

- **B-01** Her çağda üç rol vardır: **ön hat** (dayanıklı, yakın dövüş), **menzilli** (uzaktan hasar,
  korunmaya muhtaç), **ağır/kuşatma** (yavaş, pahalı, savunma kırmada etkili).
- **B-02** Her birliğin maliyeti, üretim süresi, canı, hasarı, saldırı aralığı, menzili, hareket hızı,
  boyutu **(N)** ve yenilgi ödülü (altın + deneyim **(N)**) tanımlıdır.
- **B-03 (N)** Roller arasında karşılık ilişkisi vardır (hasar çarpanları: GDD §3). Kuleler hedef
  alınamadığı için "savunma kırma" şöyle karşılanır: ağır/kuşatma birlikleri üsse çarpanlı hasar verir ve aynı
  çağın hızlı kulesinden biraz uzun menzille üssü kule ateşinin dışından dövebilir.
- **B-04 (N)** Tek bir üretim hattı vardır; siparişler sırayla üretilir. Kuyruk, üretimdeki dahil en fazla
  beş sipariş tutar.
- **B-05** Üretimi başlamamış sipariş tam iade ile iptal edilebilir; üretimi başlamış sipariş iptal edilemez.
- **B-06 (N)** Doğma noktası dost birlikle doluysa tamamlanan birlik bekler ve alan açılınca doğar; bu sırada
  sonraki sipariş başlamaz. Düşman birlikleri doğmayı engellemez. Doğmayı bekleyen birlik kuyrukta bir yer tutar ve iptal edilemez.
- **B-07** Tek bir birlik türü her durumda en iyi seçenek olmamalıdır (ölçüm: GDD §10).
- **B-08 (N)** Sahada sabit bir birlik sınırı yoktur; koridor uzunluğu ve B-06 doğal bir sınır oluşturur.
  Performans bütçesi TDD §6'dadır.

## 9. Savunma sistemi

- **D-01** Her üste üç savunma yuvası vardır. İlki açıktır; diğerleri altınla **(N)** sırayla açılır.
- **D-02** Her yuvaya bir kule yerleştirilebilir.
- **D-03** Kuleler menzilindeki **en yakın (N)** düşman birliğine otomatik saldırır. **(N)** Kule menzili üssün
  ön yüzünden ölçülür.
- **D-04** Kuleler ayrı hedef değildir; üs yıkılınca maç biter ve kuleler de durur.
- **D-05** Mevcut kule satılıp yerine başka kule kurulabilir. Satışta ödenen fiyatın %50'si geri alınır.
- **D-06 (N)** Kulelerin öldürdüğü birlikler tam ödül verir.
- **D-07** Savunmalar toparlanma fırsatı sunar, ancak yalnızca savunma kurarak risksiz kazanmak mümkün değildir:
  kuleler üsse hasar vermez ve ağır birlikler hızlı kulenin menzili dışından üssü vurabilir.

## 10. Özel yetenekler

- **Y-01** Her çağın bir aktif yeteneği vardır; **(N)** oyuncu yalnızca güncel çağının yeteneğini kullanır.
- **Y-02 (N)** Hedefleme: oyuncu yeteneği seçer, koridorda bir noktaya tıklar. Etki alanı tıklamadan önce
  önizlenir. Sağ tık veya Esc hedeflemeyi iptal eder.
- **Y-03** Yetenek düşman birliklerine veya savaş alanına etki eder; rakip üsse doğrudan hasar vermez.
  **(N)** Dost birliklere zarar vermez.
- **Y-04** Kullanımdan sonra bekleme süresine girer. **(N)** Maç da bir başlangıç bekleme süresiyle başlar.
- **Y-05** Çağ geçişi bekleme süresini sıfırlamaz. **(N)** Kalan süre korunur, ancak yeni yeteneğin tam
  bekleme süresini aşamaz.
- **Y-06** Etki alanı, kullanılabilirlik ve kalan süre açıkça gösterilir.
- **Y-07** Duraklatılmış veya tamamlanmış maçta kullanılamaz.
- **Y-08 (N)** Yeteneğin öldürdüğü birlikler ödül verir.

## 11. Bilgisayar rakibi

- **R-01** Rakip birlik üretir, kule kurar ve satar, yetenek kullanır, çağ atlar.
- **R-02** Oyuncuyla aynı kurallar, maliyetler ve gelirle, kendi bütçesiyle oynar. Gizli hasar veya kaynak
  bonusu yoktur.
- **R-03 (N)** Yalnızca görünür durumu kullanır: sahadaki birlikler ve canları, kuleler, iki üssün canı, iki
  tarafın çağı, aktif yetenek alanları ve Sınır Taşı durumu. Oyuncunun altınını, deneyimini,
  üretim kuyruğunu ve yetenek bekleme süresini **göremez** — oyuncu da rakibinkileri görmez.
- **R-04** Kolay, Normal ve Zor seviyeleri vardır. Zorluk; karar sıklığı, ordu bileşimi, kaynak yönetimi ve
  **(N)** kule/yetenek kullanım kalitesi üzerinden değişir.
- **R-05 (N)** Zorluk sıralaması ölçülebilir olmalıdır (eşikler: GDD §10).

## 12. Ekranlar

- **EK-01 Ana menü:** Oyuna başla, Devam et (**(N)** yalnızca geçerli kayıt varsa etkin), Öğretici, Ayarlar.
- **EK-02 Maç kurulumu:** Zorluk seçimi ve maça başlama. **(N)** Zorluk başına kazanma/kaybetme sayısı gösterilir.
- **EK-03 Savaş ekranı:** İki tarafın üs canı ve çağı; altın; deneyim (sonraki eşiğe ilerleme); birlik
  seçenekleri; üretim kuyruğu; kule yuvaları; özel yetenek; çağ atlama; duraklatma; **(N)** maç süresi ve
  Sınır Taşı durumu.
- **EK-04** Kullanılamayan işlemin nedeni gösterilir: yetersiz altın (eksik miktarla), dolu kuyruk, yetersiz
  deneyim (mevcut/eşik), **(N)** kilitli yuva, bekleme süresi, son çağa ulaşıldı, oyun duraklatıldı.
- **EK-05 (N) Duraklatma menüsü:** Devam et, Ayarlar, Ana menüye dön (maç kaydedilir).
- **EK-06 Sonuç ekranı:** Zafer, yenilgi veya **(N)** beraberlik; süre; iki tarafın ulaştığı çağ; birlik
  istatistikleri (tür başına üretilen, kaybedilen, öldürülen); **(N)** kazanılan ve harcanan altın;
  Yeniden oyna (aynı zorlukla) ve Ana menü.
- **EK-07 Ayarlar:** Müzik ve efekt ses düzeyi ayrı ayrı; ekran sarsıntısı aç/kapat; kısayolların listesi.
  **(N)** Değişiklik anında uygulanır ve saklanır.

## 13. Öğretici ve kayıt

- **ÖK-01** İlk açılışta öğretici önerilir; atlanabilir; menüden tekrar açılabilir. Etkileşimlidir: her adım
  oyuncunun istenen eylemi yapmasıyla ilerler.
- **ÖK-02** Ayarlar, öğreticinin tamamlanma durumu ve maç sonuçları cihazda saklanır.
- **ÖK-03** Aktif maç düzenli aralıklarla kaydedilir. **(N)** En geç her 10 sn oyun süresinde, ayrıca
  duraklatmada, sekme gizlendiğinde, ana menüye dönüşte ve sayfa kapanırken.
- **ÖK-04 (N)** Tek bir kayıt yuvası vardır. Geçerli kayıt: bitmemiş bir maça ait, sürümü uyumlu ve bütünlük
  kontrolünü geçen kayıttır. Geçersiz kayıt oyuncuya bilgi verilerek silinir.
- **ÖK-05** Geçerli kayıt varsa oyun yeniden açıldığında maça devam edilebilir. **(N)** Devam eden maç, hiç
  kesilmemiş gibi aynı durumdan sürer (birlikler, mermiler, kuyruk, zamanlayıcılar, yapay zekâ belleği).
- **ÖK-06** Sekme arka plana geçince oyun otomatik duraklar. **(N)** Geri dönüldüğünde duraklatılmış kalır;
  oyuncu devam ettirir.
- **ÖK-07** Duraklatmada kaynaklar, üretim, yetenek süreleri ve **(N)** yapay zekâ ilerlemez; oyun
  komutları kabul edilmez.
- **ÖK-08 (N)** Kayıt varken yeni maç başlatmak onay ister ve eski kaydı siler. Maç bitince kayıt silinir.
  Öğretici maçı kaydedilmez ve sonuçlara yazılmaz.

## 14. Görsel ve ses yönü

- **GR-01** Özgün çizimler, sesler, animasyonlar ve arayüz kullanılır. **(N)** Müzik de özgündür; başka bir
  oyunun içeriği kullanılmaz.
- **GR-02** Birlik rolleri siluetlerinden anlaşılır.
- **GR-03** Çağ ilerlemesi belirgin biçimde hissedilir.
- **GR-04** Kalabalık çatışmalarda ekran okunabilir kalır.
- **GR-05** Dost/düşman ayrımı yalnızca renge bağlı değildir. **(N)** Renk dışında en az iki ipucu
  kullanılır (bakış yönü, amblem şekli, can çubuğu biçimi).
- **GR-06 (N)** Saniyede üçten fazla tam ekran parlama olmaz; ekran sarsıntısı kapatılabilir.

Stil ve üretim yolu (A2): görseller ve sesler kodla üretilir; ayrıntı GDD §14–§15.

## 15. İlk tam sürümün içeriği

- Beş çağ.
- 15 birlik türü (çağ başına 3).
- 10 kule türü (çağ başına 2).
- Beş özel yetenek (çağ başına 1).
- Bir savaş haritası.
- Üç zorluk seviyesi.
- Öğretici, ayarlar ve sonuç ekranları.
- Yerel kayıt ve devam etme.
- **(N)** Ayırt edici mekanik: Sınır Taşı.

## 16. Kabul kriterleri

Her kriterin nasıl doğrulandığı TDD §10'da, hangi aşamada geldiği [yol-haritasi.md](yol-haritasi.md)'de.

| Kimlik | Kriter |
|---|---|
| K-01 | Satın almalar (birlik, kule, yuva, çağ) bir kez ücretlendirilir; kaynaklar hiçbir adımda negatif olmaz. |
| K-02 | Birlikler ve kuleler menzil dışındaki ana hedefe saldırı başlatmaz ve tanımlı saldırı aralığından sık saldırmaz. **(N)** Alan hasarı ve delmenin ikincil hedefleri GDD §3'e uyar. |
| K-03 | Yok edilen birliğin ödülü yalnızca bir kez verilir. |
| K-04 | Çağ geçişi sahadaki birlikleri, kuleleri ve kuyruk siparişlerini korur; üs can yüzdesini korur. |
| K-05 | Birlikler kalıcı olarak sıkışmaz; hedef arama oyunu kilitlemez. |
| K-06 | Maç sonucu yalnızca bir kez hesaplanır; sonrasında oyun durumu değişmez. |
| K-07 | Kaydı yüklenen maç tutarlı biçimde devam eder; **(N)** kesintisiz oynanmış maçla aynı durumu üretir. |
| K-08 | Yeni maç, önceki maçtan kalan birlik, kaynak veya zamanlayıcı içermez. |
| K-09 | Oyun hızı görüntülenen kare sayısından etkilenmez. |
| K-10 (N) | Başlamamış sipariş iptali tam iade eder; başlamış sipariş iptal edilemez; kuyruk beşi aşamaz. |
| K-11 (N) | Kule satışı ödenen fiyatın %50'sini iade eder; yuva ve çağ ücretleri iade edilmez. |
| K-12 (N) | Yetenek üsse ve dost birliklere hasar vermez; duraklatılmış/bitmiş maçta kullanılamaz; çağ geçişi bekleme süresini sıfırlamaz. |
| K-13 (N) | Yapay zekâ gizli bilgiye erişmez ve oyuncuyla aynı kurallarla oynar. |
| K-14 (N) | Duraklatmada (elle veya sekme gizlenince) oyun zamanı ilerlemez ve komut kabul edilmez. |
| K-15 (N) | İki üs aynı adımda yıkılırsa sonuç beraberliktir. |
| K-16 (N) | Kullanılamayan her işlem, nedenini arayüzde gösterir. |

## 17. Açık kararlar

| # | Konu | Durum | Karar |
|---|---|---|---|
| A1 | Oyunun adı ve ayırt edici özelliği | Karar verildi | Ad "Devir" (yayından önce değiştirilebilir); ayırt edici özellik Sınır Taşı |
| A2 | Görsel tarz, evren ve üretim yolu | Karar verildi | Kodla çizilen "kesik kâğıt" vektör stil, kodla üretilen ses; renkli, hafif mizahi, kansız |
| A3 | Teknoloji ve oyun motoru | Karar verildi | TypeScript + Vite + PixiJS + DOM arayüz (TDD §1) |
| A4 | Birlik istatistikleri ve ekonomi dengesi | Başlangıç değerleri hazır | GDD §3–§7; simülasyonla ayarlanır |
| A5 | Çağ eşikleri ve yetenek etkileri | Başlangıç değerleri hazır | GDD §4, §7 |
| A6 | Tarayıcılar ve referans cihaz | Karar verildi | TDD §12 |
| A7 | Dağıtım kanalı ve gelir modeli | Karar verildi | itch.io, ücretsiz; portal/reklam sonraki karar |
