-- İş sorusu: Fırsatları neden ve hangi aşamada kaybediyoruz?
WITH steps AS (
    SELECT
        opportunity_id,
        stage,
        lag(stage) OVER (PARTITION BY opportunity_id ORDER BY entered_date, stage_order(stage)) AS previous_stage
    FROM stage_history
)
SELECT
    s.previous_stage                                                       AS lost_at_stage,
    coalesce(o.loss_reason, 'Belirtilmedi')                                 AS reason,
    count(*)                                                               AS deals,
    round(count(*) / sum(count(*)) OVER (PARTITION BY s.previous_stage), 4) AS share_in_stage
FROM steps s
JOIN opportunities o USING (opportunity_id)
WHERE s.stage = 'Lost'
GROUP BY s.previous_stage, reason
ORDER BY stage_order(s.previous_stage), deals DESC;
