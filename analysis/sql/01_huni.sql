-- İş sorusu: Fırsatlar hunide hangi aşamada kayboluyor?
-- Yalnızca sonuçlanmış (kazanılan/kaybedilen) fırsatlar alınır: açık fırsatlar huniyi henüz
-- tamamlamadığı için dahil edilseler dönüşüm oranlarını olduğundan düşük gösterirler.
WITH resolved AS (
    SELECT opportunity_id FROM opportunities WHERE deal_stage IN ('Won', 'Lost')
),
reached AS (
    SELECT h.stage, count(DISTINCT h.opportunity_id) AS deals
    FROM stage_history h
    JOIN resolved r USING (opportunity_id)
    WHERE h.stage <> 'Lost'
    GROUP BY h.stage
)
SELECT
    stage,
    stage_order(stage)                                                      AS step,
    deals,
    round(deals / first_value(deals) OVER (ORDER BY stage_order(stage)), 4) AS share_of_leads,
    round(deals / lag(deals) OVER (ORDER BY stage_order(stage)), 4)         AS conversion_from_previous
FROM reached
ORDER BY step;
