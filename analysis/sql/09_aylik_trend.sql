-- İş sorusu: Fırsat hacmi ve kazanılan gelir aylara göre nasıl değişiyor?
WITH created AS (
    SELECT date_trunc('month', created_date) AS month, count(*) AS new_deals
    FROM opportunities
    GROUP BY 1
),
closed AS (
    SELECT
        date_trunc('month', close_date)                                            AS month,
        sum((deal_stage = 'Won')::INT)                                             AS won_deals,
        sum((deal_stage = 'Lost')::INT)                                            AS lost_deals,
        sum(CASE WHEN deal_stage = 'Won' THEN coalesce(close_value, 0) ELSE 0 END) AS won_revenue
    FROM opportunities
    WHERE close_date IS NOT NULL
    GROUP BY 1
)
SELECT
    strftime(month, '%Y-%m') AS month,
    coalesce(new_deals, 0)   AS new_deals,
    coalesce(won_deals, 0)   AS won_deals,
    coalesce(lost_deals, 0)  AS lost_deals,
    coalesce(won_revenue, 0) AS won_revenue
FROM created
FULL JOIN closed USING (month)
ORDER BY month;
