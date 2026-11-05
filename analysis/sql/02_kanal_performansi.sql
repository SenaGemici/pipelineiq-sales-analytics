-- İş sorusu: Hangi kaynak kanal en verimli? Pazarlama ve satış eforu nereye kaydırılmalı?
-- Kanal başına: huni geçiş oranları, kazanma oranı, ortalama satış tutarı ve fırsat başına gelir.
WITH resolved AS (
    SELECT *, coalesce(lead_source, 'Bilinmiyor') AS source
    FROM opportunities
    WHERE deal_stage IN ('Won', 'Lost')
),
reach AS (
    SELECT
        opportunity_id,
        max((stage = 'Qualification')::INT) AS reached_qualification,
        max((stage = 'Proposal')::INT)      AS reached_proposal,
        max((stage = 'Negotiation')::INT)   AS reached_negotiation
    FROM stage_history
    GROUP BY opportunity_id
)
SELECT
    source                                                                                          AS lead_source,
    count(*)                                                                                        AS deals,
    round(avg(reached_qualification), 4)                                                            AS to_qualification,
    round(avg(reached_proposal), 4)                                                                 AS to_proposal,
    round(avg(reached_negotiation), 4)                                                              AS to_negotiation,
    round(avg((deal_stage = 'Won')::INT), 4)                                                        AS win_rate,
    round(avg(CASE WHEN deal_stage = 'Won' THEN close_value END), 0)                                AS avg_won_value,
    round(sum(CASE WHEN deal_stage = 'Won' THEN coalesce(close_value, 0) ELSE 0 END) / count(*), 0) AS revenue_per_deal,
    median(CASE WHEN deal_stage = 'Won' THEN date_diff('day', created_date, close_date) END)        AS median_cycle_days
FROM resolved
JOIN reach USING (opportunity_id)
GROUP BY source
ORDER BY revenue_per_deal DESC;
