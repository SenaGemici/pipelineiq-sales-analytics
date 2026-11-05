# PipelineIQ

CRM verisini **temizleyen, kalitesini ölçen ve analiz eden** Türkçe bir veri yönetim platformu.

Projenin amacı bir CRM gösterge panosundan fazlasını göstermek: dashboard'ların güvenilir olmasını sağlayan katman,
yani **ham dışa aktarım → temizlik → kalite kuralları → düzeltme → analiz** akışı.

> **Veri hakkında:** Tüm veri sentetiktir. `pipeline/generate_raw.py`, Türkiye'de kurumsal yazılım satan kurgusal bir
> şirketin CRM dışa aktarımını sabit bir seed ile üretir (6.604 satır, 89 şirket satırı, 30 temsilci, 7 ürün;
> Ocak 2025 – Ekim 2026). Şirketler, kişiler ve ürünler kurgusaldır. Gerçek CRM verisinde sık görülen sorunlar
> (mükerrer kayıtlar, yazım farkları, karışık tarih biçimleri, eksik alanlar) **bilerek** eklenmiştir;
> amaç bunları bulup temizleyen süreci göstermektir.

## Öne çıkan bulgular

Temizlenmiş veri üzerinde öne çıkan noktalar:

- **Pipeline şişkin.** Kazanılan fırsatların medyan satış süresi 37 gün, %90'ı 82 gün içinde kapanıyor. Görüşmedeki
  903 fırsatın **370'i (%41)** bu eşiği aşmış; büyük olasılıkla kapatılmayı unutulmuş fırsatlar. Tahmini şişiriyorlar.
- **Açık fırsatların %22'si hiçbir şirkete bağlı değil** (1.323 açık fırsattan 291'i). Bu bir veri girişi süreci sorunu.
- **Temsilciler arasında büyük fark var.** Kazanma oranı temsilciye göre %49 ile %82 arasında değişiyor.
- **Büyük ürünlerde satış süreci uzun.** Medyan satış süresi Bulut Başlangıç'ta 23 gün, Güvenlik Tam'da 66 gün.
- Tarihsel kazanma oranı **%64,2**. Kaynakta olasılık alanı olmadığı için tahminler bu orandan türetildi.

## Ekranlar

| Adres | İçerik |
| --- | --- |
| `/` Genel Bakış | Açık pipeline, ağırlıklı tahmin, kazanma oranı, kazanılan gelir; çeyrek filtresi, aşama grafiği, aylık gelir trendi, CSV dışa aktarma |
| `/satis-firsatlari` | 4 aşamalı Kanban (Potansiyel → Görüşmede → Kazanıldı / Kaybedildi), sürükle-bırak, ürün/sorumlu filtresi, sayfalı sütunlar |
| `/sirketler` | Şirket tablosu (sektör, şehir, çalışan, holding/iştirak ilişkisi), hesap bazlı kazanma oranı ve gelir, düzenleme |
| `/veri-kalitesi` | 5 kalite kuralı, kayıt bazında 0–100 puan, sorun türü/önem filtresi, doğrudan düzeltme |
| `/veri-hazirlama` | Ham veri profili (sütun bazında boş/farklı değer), temizlik günlüğü, bütünlük kontrolleri, temel bulgular |
| `/analizler` | Bölge/temsilci filtresi, satış süresi (ortalama + medyan), temsilci ve ürün performansı, liste fiyatına göre gerçekleşen fiyat oranı |
| `/ayarlar` | Para/tarih gösterimi, tarayıcıdaki değişiklikleri sıfırlama |

## Veri hattı

```text
pipeline/generate_raw.py ──► data/raw/*.csv ──► pipeline/build_dataset.py (pandas) ──► data/clean/*.csv
   (sentetik dışa aktarım)     (kirli veri)                                       ├──► lib/generated/crm-data.ts
                                                                                  └──► lib/generated/data-profile.ts
```

```bash
pip install -r pipeline/requirements.txt
python pipeline/generate_raw.py     # ham veriyi üretir (sabit seed, her seferinde aynı)
python pipeline/build_dataset.py    # temizler, doğrular, uygulama verisini üretir
```

Temizlik hattı her adımı etkilediği satır sayısıyla günlüğe yazar. Uygulamadaki **Veri Hazırlama** ekranı bu günlüğü gösterir.

| Tür | Adım | Satır |
| --- | --- | --- |
| Düzeltme | Tüm alanları aynı olan tekrarlanan satırlar silindi | 45 |
| Düzeltme | `GG.AA.YYYY` tarihler ISO biçimine çevrildi | 489 |
| Düzeltme | Ürün ve temsilci adları ana tablolarla eşleştirildi (büyük/küçük harf, bitişik yazım, fazla boşluk) | 274 |
| Düzeltme | Sektör ve şehir yazımları birleştirildi (`Teknolji` → `Teknoloji`, `İST` → `İstanbul`); en sık yazım referans alınır, yazım hataları benzerlikle eşleştirilir | 17 |
| Düzeltme | Mükerrer şirketler birleştirildi (`LODOS LOJİSTİK AS` = `Lodos Lojistik A.Ş.`); hukuki ek, harf ve noktalama farkı yok sayılır, eksik alanlar kopyadan tamamlanır, fırsatlar asıl kayda taşınır | 4 şirket |
| İşaretleme | Görüşme tarihi kapanıştan sonra görünen kayıtlar: hangi tarihin yanlış olduğu bilinemediği için görüşme tarihi boşaltılır | 16 |
| İşaretleme | Kazanılmış ama tutarı girilmemiş fırsatlar (uydurulmaz, kritik olarak işaretlenir) | 28 |
| İşaretleme | Şirketi olmayan fırsatlar (otomatik çıkarılamaz) | 321 |
| Türetme | Açık fırsat tutarı = ürün liste fiyatı (arayüzde `≈` ile gösterilir) | 1.323 |
| Türetme | Takılmış fırsat eşiği = kazanılan fırsatların satış süresinin 90. yüzdeliği (82 gün) | — |
| Türetme | Aşama olasılıkları: Görüşmede = tarihsel kazanma oranı, Potansiyel = %20 (açıkça belirtilen varsayım) | — |

Temizlikten sonra 12 bütünlük kontrolü çalışır: tekil kimlik, okunabilir tarihler, aşama/tarih tutarlılığı, fırsat → şirket/ürün/temsilci
ve şirket → ana şirket referansları, tekil şirket adları. Bilerek bırakılan tek açık sorun "şirketi olmayan fırsatlar"dır;
bu kayıtlar uygulamada düzeltilir.

## Veri kalitesi kuralları

| Kural | Ceza | Önem |
| --- | --- | --- |
| Şirket bağlantısı yok | 30 | Kritik |
| Sorumlu kişi yok | 30 | Kritik |
| Kazanılan fırsatın tutarı eksik/0 | 30 | Kritik |
| Takılmış fırsat (82+ gün görüşmede) | 20 | Uyarı |
| Potansiyel dışı aşamada görüşme tarihi eksik | 15 | Uyarı |

Her fırsat 100 puanla başlar. Genel skor tüm fırsatların ortalamasıdır. Düzeltmeler anında yeniden puanlanır.
Analiz tarihi veri setinin son günüdür (**31.10.2026**); güncellik kuralları bu tarihe göre çalışır.

## Metrik tanımları

- **Kazanma oranı** = kazanılan / (kazanılan + kaybedilen). Açık fırsatlar paydaya girmez.
- **Açık pipeline** = açık fırsatların tutarı; tutar yoksa ürün liste fiyatı.
- **Ağırlıklı tahmin** = Σ açık fırsat tutarı × olasılık.
- **Satış süresi** = görüşme başlangıcından kazanılmaya kadar geçen gün (ortalama ve medyan).
- **Kaçan potansiyel** = kaybedilen fırsatların liste fiyatı toplamı (kaybedilen fırsatta tutar 0 tutulur).
- **Fiyat oranı** = kazanılan satış tutarı / liste fiyatı ortalaması (%100 altı indirim).

## Mimari

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts. Sunucu veya veritabanı yoktur; uygulama statik olarak derlenir.

- `lib/models.ts`: normalize model (Company, Representative, Product, OpportunityRecord) ve okuma modeli.
- `lib/seed.ts`: üretilen veriden başlangıç durumu ve veri sürümü.
- `lib/crm-state.ts`: saf state geçişleri ve doğrulama (aşama değişiminde tutar/tarih/olasılık kuralları, mükerrer şirket adı kontrolü).
- `lib/demo-store.ts`: tarayıcıda **yalnızca değişen kayıtları** saklar. Kayıtlar veri sürümüyle etiketlenir; veri yeniden üretilirse eski
  değişiklikler yeni veriye karıştırılmaz. Bozuk kayıt uygulamayı çökertmez.
- `lib/selectors.ts`, `lib/pipeline.ts`, `lib/quality.ts`: metrik, gruplama ve kalite hesapları.
- `components/`: ekranlar. Büyük listeler sayfalı gösterilir.

## Kontroller

```bash
npx tsc --noEmit
npm run lint
npm run build
node --test scripts/check-data.mjs
```

`check-data.mjs`, ham veride bilerek eklenen her sorunun temiz veride giderildiğini, uygulamanın hesapladığı metriklerin
pandas'ın ürettiği temiz CSV ile birebir aynı olduğunu, kalite kurallarını, aşama geçişlerini, doğrulamayı ve tarayıcı saklamasını test eder.

> `scripts/check-dashboard.mjs` ve `scripts/check-crm.mjs` tarayıcı testleri önceki demo verisine göre yazılmıştır
> ve yeni veriye göre güncellenmeleri gerekir.
