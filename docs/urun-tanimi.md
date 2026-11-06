# Devir — Ürün Tanımı

> Oyunun adı **Devir**'dir (PRD §17 A1; yayından önce değiştirilebilir).
> Bu belge ürünün **neden** ve **kimin için** yapıldığını ve **başarının nasıl ölçüleceğini** anlatır.
> Ürün davranışı → [prd.md](prd.md) · Kurallar ve içerik → [oyun-tasarimi.md](oyun-tasarimi.md) ·
> Uygulama → [teknik-tasarim.md](teknik-tasarim.md) · Aşamalar → [yol-haritasi.md](yol-haritasi.md)

## Bir cümlede

İlkel Çağ'dan Gelecek Çağı'na uzanan tek bir koridorda ordunu, savunmanı ve çağ atlama zamanını
dengeleyerek rakip üssü yıktığın, 10–15 dakikalık, tek oyunculu bir tarayıcı strateji oyunu.

## Hedef oyuncu

- **Birincil:** Tarayıcıda kısa oturumlar oynayan, Türkçe konuşan, 13 yaş üstü oyuncu. Strateji sever ama
  birlik birlik mikro yönetim istemez.
- **İkincil:** Koridor savaşı / kule savaşı türünü bilen ve yeni bir yorum arayan oyuncu.

## Tasarım ilkeleri

1. **Az düğme, ağır karar.** Her harcama bir fırsat takasıdır: şimdi saldırı mı, savunma mı, çağ mı?
2. **Okunabilir savaş.** Kalabalıkta bile kimin kim olduğu ve neyin neyi yendiği görülür.
3. **Çağ sıçraması hissedilir.** Her çağ geçişi görselde, seste ve oynanışta belirgin bir değişimdir.
4. **Adil rakip.** Bilgisayar hile yapmaz; zorluk, karar kalitesinden gelir.
5. **Kesintisiz oturum.** Duraklat, kapat, geri gel, kaldığın yerden devam et.

## Ayırt edici özellik: Maden (A1; 1.1'e kadar adı Sınır Taşı)

Koridorun ortasındaki taşı elinde tutan taraf ek gelir ve deneyim kazanır.
Kuralları [GDD §8](oyun-tasarimi.md)'de.

Neden bu özellik:

- PRD'nin ilk kararını ("hemen saldırmalı mıyım?") her an somut hâle getirir: ileri itmenin ödülü vardır.
- Yalnızca savunarak rakibin deneyim kazanmasını kesip ondan kaçmayı önler (kaplumbağa koruması).
- Uygulaması küçüktür ve tek koridor yapısına doğal biçimde oturur; türün bilinen örneklerinden oyunu ayırır.

## Konumlandırma ve özgünlük

Oyun, "çağ ilerlemeli tek koridor savaşı" türündedir. Bu türün iyi bilinen örnekleri vardır; Devir onların
içeriğini (birlik ve yetenek adları, görseller, sesler, arayüz düzeni) kopyalamaz. Özgünlük üç yerden gelir:
ayırt edici mekanik, özgün birlik/yetenek/kule kadrosu ve kodla üretilen özgün görsel-işitsel dil.

## Başarı ölçütleri (ilk tam sürüm)

| Alan | Ölçüt | Nasıl ölçülür |
|---|---|---|
| Doğruluk | PRD kabul kriterlerinin (K-01…K-16) tamamı otomatik testle doğrulanır | Test paketi |
| Maç süresi | Normal zorlukta medyan 10–15 dk | Headless simülasyon + oyun testi |
| Karar çeşitliliği | Tek tip ordu ve yalnız savunma stratejileri kazanma yolu olmaz | GDD §10 denge hedefleri |
| Öğrenilebilirlik | Yeni oyuncu öğreticiyi 5 dakikanın altında bitirir ve ilk Kolay maçını kazanabilir | Oyun testi gözlemi |
| Zorluk | Zor > Normal > Kolay sıralaması ölçülebilir | Yapay zekâ turnuvası |
| Teknik | Referans cihazda 60 fps; geniş bantta ilk açılış < 3 sn; kayıttan devam tutarlı | Performans paneli, E2E test |

## Kapsam

İlk tam sürümün platformu, kapsamı ve içerik listesi [PRD §3](prd.md) ve
[PRD §15](prd.md)'tedir. Mobil, çevrimiçi çok oyunculu ve hesap sistemi sonraki
sürümlerin konusudur.

## Yayın ve gelir (A7)

İlk sürüm itch.io'da ücretsiz HTML5 oyunu olarak yayınlanır. Derleme tamamen statik olduğundan
aynı paket kendi alan adında veya başka bir statik barındırmada da çalışır. Reklam/portal SDK'sı (ör. web
oyun portalları) sonraki bir karar olarak bırakılır; mimari buna bir bağdaştırıcı katmanıyla izin verir.

## Başlıca riskler

| Risk | Etki | Önlem |
|---|---|---|
| Görsel üretim yükü (15 birlik, 10 kule, 5 üs, 5 yetenek) | Takvim | Kodla üretilen vektör stil; Aşama 2'de erken stil prototipi ve onay |
| Denge ve maç süresi tutmaması | Oynanış | Veri odaklı değerler + headless yapay zekâ turnuvası |
| Hile yapmayan yapay zekânın Zor seviyede yetersiz kalması | Oynanış | Karar kalitesi parametreleri, turnuvayla ölçüm |
| Türün bilinen örneklerine fazla benzeme | Ürün kimliği | Ayırt edici mekanik + özgün içerik |
