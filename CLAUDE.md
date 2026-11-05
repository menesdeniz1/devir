# Devir

Tarayıcıda çalışan, çağlar arasında ilerlenen, tek koridorlu, tek oyunculu strateji oyunu.

## Dokümanlar — her bilginin tek sahibi vardır

| Dosya | İçerik |
|---|---|
| `docs/urun-tanimi.md` | Neden, kimin için, başarı ölçütleri, riskler |
| `docs/prd.md` | Ürün davranışı, kabul kriterleri (K-xx), açık kararlar |
| `docs/oyun-tasarimi.md` | Kurallar, formüller, içerik kadrosu, yapay zekâ, arayüz, görsel/ses yönü |
| `docs/teknik-tasarim.md` | Mimari, simülasyon, kayıt, test stratejisi, ortam |
| `docs/yol-haritasi.md` | Aşamalar, sahipler, bitti ölçütleri, durum |

Bir bilgi yalnızca sahibi olan belgede yazılır; diğerleri bölüm numarasıyla başvurur.

## Kesin kurallar

- Denge ve içerik sayıları yalnızca `src/data/` içinde. Mantık kodunda sihirli sayı yok.
- `src/data`, `src/sim`, `src/ai`: DOM, Pixi, `Math.random`, `Date`, zamanlayıcı kullanmaz; deterministiktir.
- Oyun durumu düz, JSON'a serileştirilebilir veridir.
- Arayüz metinleri yalnızca `src/i18n/tr.ts`.
- Her oynanış kuralı değişikliği bir testle gelir; önceki aşamaların testleri yeşil kalır.
- Kapsam dışı büyük özellik eklenmez; önce PRD/GDD'de karara bağlanır.
- Kalite kapısı: `npm run check` (typecheck + Vitest + build); arayüz akışları için `npm run e2e` (Playwright).

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu; `?debug` geliştirici panelini açar |
| `npm run check` | typecheck + birim testleri + üretim derlemesi |
| `npm run e2e` | Playwright uçtan uca testleri (kendi dev sunucusunu açar) |
| `npm run sim -- match --a <bot> --b <bot>` | Tek headless maç özeti |
| `npm run sim -- tournament --a <bot> --b <bot> --games 200` | Denge turnuvası (GDD §10 hedefleri) |
| `npm run sim -- soak --games 500` | Değişmez ve kilitlenme denetimli toplu maç |
| `npm run sim -- matchup` | Önceden dizilmiş ordu karşılık matrisi |

Botlar: `easy`, `normal`, `hard` (oyunun rakipleri) ve test araçları (`basic`, `random`, `stacker`, `idle`,
`defender`, `mono-*`, `normal-*`). Görsel vitrin: `/src/art/gallery.html?view=...` (yalnız geliştirme).

## Ekip

Worker tanımları `../.claude/agents/` altındadır: `haiku-high`, `sonnet-high`, `opus-high`.
