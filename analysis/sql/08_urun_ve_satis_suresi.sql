-- İş sorusu: Hangi ürünlerde satış süreci uzun? Ürün bazında kazanma oranı ve gelir nasıl?
SELECT
    o.product,
    p.series,
    p.sales_price                                                                                              AS list_price,
    count(*)                                                                                                   AS deals,
    round(avg((o.deal_stage = 'Won')::INT), 4)                                                                 AS win_rate,
    sum(CASE WHEN o.deal_stage = 'Won' THEN coalesce(o.close_value, 0) ELSE 0 END)                             AS revenue,
    median(CASE WHEN o.deal_stage = 'Won' THEN date_diff('day', o.created_date, o.close_date) END)             AS median_cycle_days,
    quantile_cont(CASE WHEN o.deal_stage = 'Won' THEN date_diff('day', o.created_date, o.close_date) END, 0.9) AS p90_cycle_days
FROM opportunities o
JOIN products p USING (product)
WHERE o.deal_stage IN ('Won', 'Lost')
GROUP BY o.product, p.series, p.sales_price
ORDER BY list_price;
