# PipelineIQ · Power BI Raporu Kurulumu

Bu klasör, analizlerin Power BI'da yeniden kurulabilmesi için yıldız şeması (star schema) biçiminde hazırlanmış tabloları içerir.
Tablolar `python pipeline/export_powerbi.py` ile üretilir.

## Tablolar

| Tablo | Tür | Satır | Açıklama |
| --- | --- | --- | --- |
| `fact_opportunity` | Olgu | ~6.600 | Her fırsat: aşama, tarihler, tutar, indirim, kanal, kayıp nedeni, takılma bayrağı, model ve aşama olasılığı |
| `fact_stage_history` | Olgu | ~22.000 | Her aşama geçişi: giriş/çıkış tarihi, aşamada geçen gün, sonraki aşama |
| `fact_backtest` | Olgu | 10 | Geriye dönük test: her ay başı için gerçekleşen gelir ve üç yöntemin tahmini |
| `dim_company` | Boyut | 86 | Şirket, sektör, şehir, çalışan, ana şirket (`company_key = 0`: şirket atanmamış) |
| `dim_rep` | Boyut | 30 | Temsilci, yönetici, bölge |
| `dim_product` | Boyut | 7 | Ürün, seri, liste fiyatı |
| `dim_date` | Boyut | ~790 | Takvim tablosu (yıl, çeyrek, ay, hafta) |

## Kurulum adımları

1. **Veri al → Metin/CSV** ile yedi CSV dosyasını yükleyin (dosyalar UTF-8 BOM'ludur, Türkçe karakterler doğru okunur).
2. **Model görünümünde ilişkileri kurun** (hepsi tek yönlü, çoktan bire):
   - `fact_opportunity[company_key]` → `dim_company[company_key]`
   - `fact_opportunity[rep_key]` → `dim_rep[rep_key]`
   - `fact_opportunity[product_key]` → `dim_product[product_key]`
   - `fact_opportunity[created_date]` → `dim_date[date]` (etkin)
   - `fact_opportunity[close_date]` → `dim_date[date]` (etkin olmayan; gelir raporlarında `USERELATIONSHIP` ile kullanın)
   - `fact_stage_history[opportunity_id]` → `fact_opportunity[opportunity_id]`
3. `dim_date` tablosunu **Tarih tablosu olarak işaretleyin** (Tablo araçları → Tarih tablosu olarak işaretle → `date`).
4. `fact_opportunity[stage]` ve `fact_stage_history[stage]` sütunlarını **Sütuna göre sırala → `stage_order`** yapın.
5. `olculer.dax` içindeki ölçüleri `fact_opportunity` tablosuna ekleyin. Biçim: oranlar yüzde, tutarlar para birimi ($).

## Önerilen rapor sayfaları

| Sayfa | Görseller |
| --- | --- |
| **Yönetici Özeti** | Kartlar: Tahmin - Model, Tahmin - Aşama Olasılığı, Takılmış Pipeline Payı, Kazanma Oranı · Çizgi: `fact_backtest` gerçekleşen vs. model vs. aşama |
| **Huni ve Kanallar** | Huni görseli: `fact_stage_history[stage]` × Aşamaya Ulaşan · Tablo: kanal × Kazanma Oranı, Fırsat Başına Gelir, Medyan Satış Süresi · Yığılmış çubuk: kayıp nedeni × aşama |
| **Pipeline Sağlığı** | Çubuk: aşama × Açık Pipeline (takılmış / aktif) · Tablo: açık fırsatlar, `p_model` ve `p_stage` yan yana, `expected_amount × p_model`'e göre sıralı · Dilimleyici: temsilci, bölge |
| **Ekip Performansı** | Matris: temsilci × Kazanma Oranı, Fırsat Başına Gelir, ortalama indirim · Dağılım grafiği: Outbound payı × Kazanma Oranı (karışım etkisini gösterir) |

> Karışıma göre düzeltilmiş temsilci endeksi ve güven aralıkları SQL'de hesaplanır (`analysis/sql/06_temsilci_performansi.sql`);
> sonuçları `data/analysis/06_temsilci_performansi.csv` ayrı bir tablo olarak da eklenebilir.

## Notlar

- `p_model` ve `p_stage` yalnızca açık fırsatlarda doludur ve **önümüzdeki 120 gün** içinde kazanılma olasılığını ifade eder.
- `expected_amount`, açık fırsatın tahmini tutarıdır: liste fiyatı, teklif verildiyse indirim düşülerek.
- Analiz tarihi 31.10.2026'dır; `is_stalled` ve `days_in_stage` bu tarihe göre hesaplanmıştır.
