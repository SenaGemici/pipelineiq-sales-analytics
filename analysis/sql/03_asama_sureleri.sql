-- İş sorusu: Fırsatlar her aşamada ne kadar bekliyor? "Takılmış" eşiği nedir?
-- Aşamadan çıkış (bir sonraki aşamaya geçiş veya kayıp) yaşanmış kayıtlar üzerinden hesaplanır.
WITH transitions AS (
    SELECT
        opportunity_id,
        stage,
        entered_date,
        lead(entered_date) OVER w AS left_date,
        lead(stage)        OVER w AS next_stage
    FROM stage_history
    WINDOW w AS (PARTITION BY opportunity_id ORDER BY entered_date, stage_order(stage))
)
SELECT
    stage,
    count(*)                                                      AS exits,
    median(date_diff('day', entered_date, left_date))             AS median_days,
    quantile_cont(date_diff('day', entered_date, left_date), 0.9) AS p90_days,
    round(avg((next_stage = 'Lost')::INT), 4)                     AS lost_share
FROM transitions
WHERE left_date IS NOT NULL AND stage NOT IN ('Won', 'Lost')
GROUP BY stage
ORDER BY stage_order(stage);
