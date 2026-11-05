-- İş sorusu: Müzakerede indirim vermek kazanma şansını artırıyor mu, yoksa sadece geliri mi düşürüyor?
-- Müzakere aşamasına ulaşmış ve sonuçlanmış fırsatlar, teklif indirimi dilimine göre karşılaştırılır.
-- Beklenen gelir oranı = kazanma oranı × (gerçekleşen fiyat / liste fiyatı): liste fiyatının her
-- dolarından ortalama ne kadar gelir elde edildiğini gösterir.
WITH negotiated AS (
    SELECT DISTINCT opportunity_id FROM stage_history WHERE stage = 'Negotiation'
),
deals AS (
    SELECT o.*, p.sales_price, least(floor(o.discount_pct / 5), 4) AS band_order
    FROM opportunities o
    JOIN negotiated USING (opportunity_id)
    JOIN products p USING (product)
    WHERE o.deal_stage IN ('Won', 'Lost') AND o.discount_pct IS NOT NULL
)
SELECT
    CASE band_order WHEN 0 THEN '%0-5' WHEN 1 THEN '%5-10' WHEN 2 THEN '%10-15' WHEN 3 THEN '%15-20' ELSE '%20+' END AS discount_band,
    band_order,
    count(*)                                                                       AS deals,
    round(avg((deal_stage = 'Won')::INT), 4)                                       AS win_rate,
    round(avg(CASE WHEN deal_stage = 'Won' THEN close_value / sales_price END), 4) AS realized_price_ratio,
    round(avg((deal_stage = 'Won')::INT) * avg(CASE WHEN deal_stage = 'Won' THEN close_value / sales_price END), 4) AS expected_revenue_ratio
FROM deals
GROUP BY band_order
ORDER BY band_order;
