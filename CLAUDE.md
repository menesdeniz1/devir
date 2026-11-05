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
- Kalite kapısı: `npm run check` (Aşama 1'de kurulur).

## Ekip

Worker tanımları `../.claude/agents/` altındadır: `haiku-high`, `sonnet-high`, `opus-high`.
