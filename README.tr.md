# PipelineIQ · CRM Verisinden Satış Kararlarına

[English](README.md) · **Türkçe**

Bir B2B yazılım şirketinin CRM verisini **temizleyen, analiz eden ve satış kararlarına çeviren** uçtan uca bir veri analizi
vaka çalışması: Python ile veri hazırlama, DuckDB ile SQL analizleri, lojistik regresyon ile kazanma olasılığı modeli,
geriye dönük tahmin testi, Jupyter notebook'ları, Power BI paketi ve sonuçları sunan bir web uygulaması.

> **Veri hakkında:** Tüm veri sentetiktir. [`pipeline/generate_raw.py`](pipeline/generate_raw.py), Türkiye'de kurumsal
> yazılım satan kurgusal bir şirketin CRM dışa aktarımını sabit bir seed ile üretir (6.658 fırsat satırı, 22.035 aşama
> geçişi, 85 şirket, 30 temsilci, 7 ürün; Ocak 2025 – Ekim 2026). Şirketler, kişiler ve ürünler kurgusaldır.
> Gerçek CRM verisinde sık görülen sorunlar (mükerrer kayıtlar, yazım farkları, karışık tarih biçimleri, eksik alanlar)
> ve iş örüntüleri (kanal kalitesi farkları, ekip yapısı, indirimin azalan getirisi, unutulan fırsatlar) **bilerek**
> eklenmiştir. Projenin gösterdiği beceri, örüntüleri "keşfetmek" değil; onları doğru yöntemlerle ölçmek, yanlış
> yorumlardan (karıştırıcı etkenler, sansürleme, veri sızıntısı, küçük örneklem) kaçınmak ve karara çevirmektir.

## İş problemi

Satış yönetimi üç soruya güvenilir cevap istiyor:

1. **Önümüzdeki dönemde ne kadar gelir bekleyebiliriz?** CRM'in "ağırlıklı pipeline" rakamına güvenilebilir mi?
2. **Fırsatları nerede ve neden kaybediyoruz?** Hangi kanal, hangi aşama, hangi indirim politikası?
3. **Ekipte kim gerçekten iyi performans gösteriyor?** Prim ve koçluk kararları neye dayanmalı?

## Bulgular ve öneriler

| # | Bulgu | Öneri |
|---|---|---|
| 1 | **CRM'in standart tahmini geliri ~3 kat yüksek gösteriyor.** Aşamaya göre ağırlıklı pipeline önümüzdeki 120 gün için 2,37 milyon $ öngörüyor; kazanma modeli 0,80 milyon $. Geçmiş 10 ayda test edildiğinde standart yöntemin ortalama hatası **%174**, modelin **%26**. | Gelir planlaması model tahminiyle yapılmalı; geriye dönük test her ay tekrarlanmalı. |
| 2 | **Açık fırsatların %58'i takılmış.** 724 açık fırsatın 420'si bulunduğu aşamada, o aşamadan çıkan fırsatların %90'ından uzun süredir bekliyor (3,57 milyon $ pipeline). Model bunların 120 gün içinde kazanılma olasılığını ortalama %8, aktif fırsatlarda %24 buluyor. | Takılmış fırsatlar 2 hafta içinde güncellenmeli ya da kayıp nedeniyle kapatılmalı. |
| 3 | **Referans kanalı fırsat başına Outbound'un 2,5 katı gelir getiriyor** (2.165 $ / 863 $). Kazanma oranı %36'ya karşı %15; medyan satış süresi 26'ya karşı 42 gün. Ortalama satış tutarı kanallar arasında benzer: fark kanal kalitesinden geliyor. | Müşteri tavsiye programı; Outbound daha iyi hedeflenmiş hesaplara odaklanmalı. |
| 4 | **%15 üzeri indirim kazanma şansını artırmıyor, geliri düşürüyor.** Müzakeredeki fırsatlarda liste fiyatının her dolarından elde edilen beklenen gelir %10-15 diliminde zirve yapıyor (%74), %20+ diliminde %59'a iniyor. | %15 indirim üst sınırı ve üzeri için onay akışı; politika değişikliğinden önce A/B testi (analiz gözlemsel). |
| 5 | **En zayıf huni adımı Teklif → Müzakere (%64).** Bu aşamadaki kayıpların başlıca nedenleri fiyat (%36) ve rakip (%27). | Teklif aşaması için değer anlatımı (ROI, referans müşteri) ve rakip karşılaştırması. |
| 6 | **Ham kazanma oranı temsilci performansını yanlış sıralıyor.** Soğuk arama ağırlıklı çalışan temsilciler ham oranda haksız biçimde geride görünüyor; ürün × kanal karışımına göre düzeltildiğinde sıralama 5 sıraya kadar değişiyor. 7 temsilcinin güven aralığı tamamen şirket ortalamasının altında. | Prim ve koçluk kararları düzeltilmiş endeks ve güven aralığıyla verilmeli. |

Bulgu metinleri sabit yazılmadı: [`pipeline/analyze.py`](pipeline/analyze.py) her çalıştırmada sayıları hesaplayıp metinleri
bunlardan üretir; veri değişirse bulgular da değişir.

## Yöntem

```text
generate_raw.py ──► data/raw/ ──► build_dataset.py ──► data/clean/ ──┬──► analysis/sql/*.sql (DuckDB) ──┐
 (sentetik CRM       (kirli         (pandas: temizlik,    (temiz        │                                  ├──► analyze.py ──► lib/generated/analysis.ts (uygulama)
  dışa aktarımı)      veri)          doğrulama, profil)    tablolar)     └──► analytics.py (model, test) ───┘              └──► data/analysis/*.csv
                                                                                                                        export_powerbi.py ──► data/powerbi/ (yıldız şeması)
```

### 1. Veri hazırlama ([`build_dataset.py`](pipeline/build_dataset.py))

Her adım etkilediği satır sayısıyla günlüğe yazılır; uygulamadaki **Veri Hazırlama** ekranı bu günlüğü gösterir.

| Tür | Adım | Satır |
| --- | --- | --- |
| Düzeltme | Tüm alanları aynı olan tekrarlanan satırlar silindi | 45 |
| Düzeltme | `GG.AA.YYYY` tarihler ISO biçimine; `%12,5` gibi indirimler sayıya çevrildi | 490 + 190 |
| Düzeltme | Ürün ve temsilci adları ana tablolarla eşleştirildi (büyük/küçük harf, bitişik yazım, boşluk) | 304 |
| Düzeltme | Kaynak kanal, sektör ve şehir yazımları birleştirildi (`Referral` → `Referans`, `Teknolji` → `Teknoloji`, `İST` → `İstanbul`); en sık yazım referans, yazım hataları benzerlikle eşleştirilir | 299 |
| Düzeltme | Mükerrer şirketler birleştirildi (`LODOS LOJİSTİK AS` = `Lodos Lojistik A.Ş.`): hukuki ek, harf ve noktalama farkı yok sayılır, eksik alanlar kopyadan tamamlanır, fırsatlar asıl kayda taşınır | 4 şirket |
| Düzeltme | Kapanıştan sonraya düşen oluşturulma tarihleri, aşama geçmişindeki ilk kayıttan geri kazanıldı (tablolar arası onarım) | 16 |
| İşaretleme | Şirketi, kaynak kanalı, kazanılan tutarı veya kayıp nedeni eksik kayıtlar (uydurulmaz; Veri Kalitesi ekranına gider) | 895 |
| Türetme | Aşama olasılıkları (aşamaya ulaşmış fırsatların tarihsel kazanma oranı) ve aşama bazında takılma eşikleri (P90) | — |

Temizlikten sonra 14 bütünlük kontrolü çalışır (tekil kimlik, tarih tutarlılığı, aşama geçmişi ↔ güncel aşama, tablolar arası
referanslar, tekil şirket adları). Bilerek açık bırakılan tek sorun "şirketi olmayan fırsatlar"dır; uygulamada düzeltilir.

### 2. SQL analizleri ([`analysis/sql/`](analysis/sql))

Her dosya bir iş sorusunu cevaplar ve temiz CSV'ler üzerinde DuckDB ile çalışır: huni, kanal performansı, aşama süreleri,
bekleme ile ilerleme ilişkisi, kayıp nedenleri, karışıma göre düzeltilmiş temsilci performansı (Wilson güven aralığıyla),
indirim etkisi, ürün ve satış süresi, aylık trend. Pencere fonksiyonları (`lead`, `lag`, `first_value`), CTE'ler ve
yüzdelik fonksiyonları kullanılır.

### 3. Kazanma olasılığı modeli ([`analytics.py`](pipeline/analytics.py), [notebook 02](notebooks/02_kazanma_modeli.ipynb))

- **Model:** Lojistik regresyon (one-hot + standartlaştırma + L2). Özellikler: o anki aşama, aşamada geçen süre, fırsat yaşı,
  kanal, ürün, temsilci, bölge, sektör, şirket büyüklüğü, teklif indirimi.
- **Eğitim satırları:** Her fırsat, ziyaret ettiği her aşamada 0, 7, 14, 30… günlerde birer kontrol noktası üretir; model
  "aşamaya yeni girmiş" ile "aylardır bekleyen" fırsatı ayırt etmeyi öğrenir.
- **Hedef: "önümüzdeki 120 günde kazanıldı mı".** Yalnızca sonuçlanmış fırsatlarla "eninde sonunda kazanıldı mı" hedefi
  **sansürleme yanlılığı** yaratır: hiç kapanmayan, unutulmuş fırsatlar eğitime girmez ve model onları tanıyamaz.
  Ufuk tabanlı hedefte bu fırsatlar "kazanılmadı" olarak eğitime girer; notebook'ta iki yaklaşım takılmış fırsatlar
  üzerinde karşılaştırılır (sansürlenmiş model iki kattan fazla olasılık veriyor).
- **Özellik kararı:** "İndirim var mı" bayrağı, geç aşamalarla %94 aynı bilgiyi taşıdığı için çıkarıldı (çoklu doğrusallık);
  ayırt etme gücü kaybı ihmal edilebilir, katsayılar kararlı ve yorumlanabilir hale geliyor.
- **Doğrulama:** Zamana göre bölme (1 Mart 2026 öncesi eğitim, sonrası test). ROC AUC **0,747** (aşama oranı 0,668),
  Brier **0,175** (0,191). Kalibrasyon grafiği köşegene yakın: olasılıklar gelire çevrilebilir.

### 4. Geriye dönük tahmin testi ([notebook 03](notebooks/03_tahmin_geriye_donuk_test.ipynb))

Ekim 2025 – Temmuz 2026 arasında her ayın başında: o gün açık olan fırsatlar aşama geçmişinden yeniden kurulur, model
**yalnızca o güne kadar bilinen veriyle** eğitilir ve önümüzdeki 120 günün geliri üç yöntemle tahmin edilip gerçekleşenle
karşılaştırılır. Sızıntıyı önlemek için her tahmin yalnızca o tarihte bilinen alanları kullanır.

| Yöntem | Ortalama mutlak hata | Ortalama sapma |
|---|---|---|
| Aşama olasılığı (CRM standardı) | %174 | +%174 |
| Genel kazanma oranı | %68 | +%68 |
| **Kazanma modeli** | **%26** | +%26 |

### 5. Temsilci performansı

Ham kazanma oranı, temsilcinin becerisinin yanında hangi kanaldan fırsat aldığını da ölçer (soğuk arama ağırlıklı
temsilcilerde Outbound payı ile ham oran korelasyonu −0,31). Her fırsat için aynı ürün × kanal grubundaki şirket oranı
"beklenen" kabul edilir; düzeltilmiş endeks = gerçekleşen kazanç / beklenen kazanç (bu korelasyon 0,05'e iniyor).
Belirsizlik Wilson %95 güven aralığıyla gösterilir.

## Sınırlamalar

- Veri sentetik; örüntülerin varlığı üreticide tanımlı. Değerlendirilmesi gereken, kullanılan yöntemlerin doğruluğudur.
- İndirim analizi gözlemseldir: yüksek indirim verilen fırsatlar zaten zor fırsatlar olabilir. Nedensellik için deney gerekir.
- Model doğrusal; indirimin azalan getirisi gibi doğrusal olmayan ilişkileri tam yakalamaz. Kontrol noktaları aynı fırsattan
  birden çok satır ürettiği için katsayı standart hataları olduğundan dar görünür (tahmin için sorun değil).
- Modelde de pozitif bir sapma var (+%26); ilk aylarda eğitim verisinin az olması bunun bir nedeni. İzlenmeli.

## Proje yapısı

| Yol | İçerik |
| --- | --- |
| [`pipeline/`](pipeline) | `generate_raw.py` (sentetik veri) → `build_dataset.py` (temizlik) → `analyze.py` (SQL + model + bulgular) → `export_powerbi.py`; ortak kütüphane `analytics.py` |
| [`analysis/sql/`](analysis/sql) | İş sorusu başına bir DuckDB sorgusu |
| [`notebooks/`](notebooks) | 01 keşifsel analiz · 02 kazanma modeli · 03 tahmin ve geriye dönük test (çıktılarıyla) |
| [`data/`](data) | `raw/` (kirli) · `clean/` (temiz) · `analysis/` (analiz sonuçları) · [`powerbi/`](data/powerbi) (yıldız şeması, DAX ölçüleri, kurulum rehberi) |
| `app/`, `components/`, `lib/` | Web uygulaması (Next.js, TypeScript, Recharts) |

## Yeniden üretme

```bash
pip install -r pipeline/requirements.txt
python pipeline/generate_raw.py      # ham veri (sabit seed: her seferinde aynı)
python pipeline/build_dataset.py     # temizlik, doğrulama, uygulama verisi
python pipeline/analyze.py           # SQL analizleri, model, geriye dönük test, bulgular
python pipeline/export_powerbi.py    # Power BI tabloları

npm install && npm run dev           # uygulama: http://localhost:3000
node --test scripts/check-data.mjs   # veri, temizlik, metrik ve analiz tutarlılığı testleri
```

## Web uygulaması

| Bölüm | Ekranlar |
| --- | --- |
| **Analiz** | Bulgular ve Öneriler · Huni ve Kanallar · Satış Tahmini (geriye dönük test, kalibrasyon, odds oranları, açık fırsat skorları) · Ekip Performansı (güven aralıkları, düzeltilmiş endeks, indirim etkisi) · Satış Süresi |
| **Veri** | Veri Hazırlama (ham veri profili, temizlik günlüğü, bütünlük kontrolleri) · Veri Kalitesi (7 kural, kayıt bazında puan, doğrudan düzeltme) |
| **CRM** | Pipeline · Satış Fırsatları (6 aşamalı Kanban) · Şirketler · Ayarlar |

Analiz ekranları temel veri üzerinden hesaplanmış raporlardır; CRM ekranları ise canlıdır (düzenlemeler tarayıcıda saklanır,
veri sürümüyle etiketlenir). `check-data.mjs`, uygulamanın hesapladığı tutarların ve takılmış fırsat tanımının Python analiz
katmanıyla birebir aynı olduğunu da test eder.

> `scripts/check-dashboard.mjs` ve `scripts/check-crm.mjs` tarayıcı testleri önceki demo verisine göre yazılmıştır ve
> güncellenmeleri gerekir.
