-- İş sorusu: Bir aşamada uzun beklemek kazanma şansını düşürüyor mu?
-- Aşamada geçen süre dilimine göre bir sonraki aşamaya geçme (kaybedilmeme) oranı.
WITH transitions AS (
    SELECT
        stage,
        date_diff('day', entered_date, lead(entered_date) OVER w) AS days,
        lead(stage) OVER w                                        AS next_stage
    FROM stage_history
    WINDOW w AS (PARTITION BY opportunity_id ORDER BY entered_date, stage_order(stage))
)
SELECT
    stage,
    CASE WHEN days <= 7 THEN '0-7' WHEN days <= 14 THEN '8-14' WHEN days <= 30 THEN '15-30' ELSE '30+' END AS days_bucket,
    min(days)                                  AS bucket_start,
    count(*)                                   AS exits,
    round(avg((next_stage <> 'Lost')::INT), 4) AS advance_rate
FROM transitions
WHERE next_stage IS NOT NULL AND stage NOT IN ('Won', 'Lost')
GROUP BY stage, days_bucket
ORDER BY stage_order(stage), bucket_start;
