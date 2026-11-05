/** pipeline/analyze.py çıktısı: lib/generated/analysis.ts. Analizler temel veri üzerinden hesaplanır;
 * uygulamada yapılan düzenlemeler bu sonuçları değiştirmez (CRM ekranları canlı, analiz ekranları rapordur). */
type Nullable<T> = { [K in keyof T]: T[K] | null };

export interface Insight { id: string; page: string; title: string; metric: string; finding: string; recommendation: string }
export interface BacktestRow { cutoff: string; open_deals: number; pipeline: number; actual: number; naive: number; stage: number; model: number }
export type ForecastMethod = "naive" | "stage" | "model";

export interface Analysis {
  asOf: string;
  horizonDays: number;
  overallWinRate: number;
  funnel: Nullable<{ stage: string; step: number; deals: number; share_of_leads: number; conversion_from_previous: number }>[];
  sources: Nullable<{ lead_source: string; deals: number; to_qualification: number; to_proposal: number; to_negotiation: number; win_rate: number; avg_won_value: number; revenue_per_deal: number; median_cycle_days: number }>[];
  stageDurations: Nullable<{ stage: string; exits: number; median_days: number; p90_days: number; lost_share: number }>[];
  waitAdvance: Nullable<{ stage: string; days_bucket: string; bucket_start: number; exits: number; advance_rate: number }>[];
  lossReasons: Nullable<{ lost_at_stage: string; reason: string; deals: number; share_in_stage: number }>[];
  reps: Nullable<{ sales_agent: string; manager: string; regional_office: string; deals: number; won: number; win_rate: number; expected_won: number; revenue: number; avg_discount: number; mix_adjusted_index: number; ci_low: number; ci_high: number }>[];
  discount: Nullable<{ discount_band: string; band_order: number; deals: number; win_rate: number; realized_price_ratio: number; expected_revenue_ratio: number }>[];
  products: Nullable<{ product: string; series: string; list_price: number; deals: number; win_rate: number; revenue: number; median_cycle_days: number; p90_cycle_days: number }>[];
  monthly: Nullable<{ month: string; new_deals: number; won_deals: number; lost_deals: number; won_revenue: number }>[];
  model: {
    trainRows: number; testRows: number; trainEnd: string;
    auc: number; aucStage: number; brier: number; brierStage: number; baseRate: number;
    calibration: { bin: number; predicted: number; actual: number; n: number }[];
    coefficients: { group: string; level: string; reference: string; oddsRatio: number }[];
  };
  backtest: { rows: BacktestRow[]; errors: Record<ForecastMethod, { mape: number; bias: number }> };
  forecast: {
    openDeals: number; pipeline: number; naive: number; stage: number; model: number;
    stalledDeals: number; stalledPipeline: number; stalledModel: number; avgProbabilityStalled: number; avgProbabilityActive: number;
  };
  /** Açık fırsat no → [model olasılığı, aşama olasılığı] (önümüzdeki `horizonDays` gün içinde kazanılma) */
  scores: Record<string, [number, number]>;
  insights: Insight[];
}
