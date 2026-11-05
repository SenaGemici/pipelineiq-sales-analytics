-- İş sorusu: Hangi temsilci gerçekten iyi performans gösteriyor?
-- Ham kazanma oranı yanıltıcıdır: kolay ürünleri veya kaliteli kanallardan gelen fırsatları satan
-- temsilci, beceriden bağımsız olarak yüksek oran yakalar. Bu yüzden her fırsat için (ürün × kanal)
-- grubunun genel kazanma oranı "beklenen" kabul edilir; temsilcinin gerçekleşen kazanç sayısı
-- beklenene bölünür (karışıma göre düzeltilmiş endeks; 1'in üstü beklenenden iyi).
-- Wilson %95 güven aralığı, az fırsatı olan temsilcilerde sonucun ne kadar belirsiz olduğunu gösterir.
WITH resolved AS (
    SELECT *, (deal_stage = 'Won')::INT AS won, coalesce(lead_source, 'Bilinmiyor') AS source
    FROM opportunities
    WHERE deal_stage IN ('Won', 'Lost')
),
baseline AS (
    SELECT product, source, avg(won) AS expected
    FROM resolved
    GROUP BY product, source
),
per_rep AS (
    SELECT
        r.sales_agent,
        t.manager,
        t.regional_office,
        count(*)                                                        AS deals,
        sum(won)                                                        AS won,
        avg(won)                                                        AS win_rate,
        sum(b.expected)                                                 AS expected_won,
        sum(CASE WHEN won = 1 THEN coalesce(close_value, 0) ELSE 0 END) AS revenue,
        avg(discount_pct)                                               AS avg_discount
    FROM resolved r
    JOIN baseline b USING (product, source)
    JOIN sales_teams t USING (sales_agent)
    GROUP BY r.sales_agent, t.manager, t.regional_office
)
SELECT
    *,
    round(won / expected_won, 3) AS mix_adjusted_index,
    (win_rate + pow(1.96, 2) / (2 * deals) - 1.96 * sqrt(win_rate * (1 - win_rate) / deals + pow(1.96, 2) / (4 * pow(deals, 2)))) / (1 + pow(1.96, 2) / deals) AS ci_low,
    (win_rate + pow(1.96, 2) / (2 * deals) + 1.96 * sqrt(win_rate * (1 - win_rate) / deals + pow(1.96, 2) / (4 * pow(deals, 2)))) / (1 + pow(1.96, 2) / deals) AS ci_high
FROM per_rep
ORDER BY mix_adjusted_index DESC;
