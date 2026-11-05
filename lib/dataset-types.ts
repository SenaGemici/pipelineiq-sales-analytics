import type { Company, Product, Representative, Stage } from "./models";

/** pipeline/build_dataset.py çıktısı: lib/generated/crm-data.ts (veri pipeline/generate_raw.py ile üretilen sentetik dışa aktarımdan gelir) */
export interface GeneratedDataset {
  meta: { version: string; asOf: string; stallDays: number; winRate: number; defaultProbability: Record<Stage, number> };
  companies: Company[];
  representatives: Representative[];
  products: Product[];
  /** [id, şirket sırası (-1 = yok), ürün sırası, temsilci sırası, aşama sırası, tutar, görüşme tarihi, kapanış tarihi] */
  opportunities: [string, number, number, number, number, number | null, string | null, string | null][];
}

export type StepKind = "fix" | "flag" | "derive" | "note";
/** pipeline/build_dataset.py çıktısı: lib/generated/data-profile.ts */
export interface DataProfile {
  asOf: string;
  tables: { name: string; rawRows: number; cleanRows: number; columns: { name: string; nulls: number; distinct: number }[] }[];
  steps: { table: string; column: string; kind: StepKind; title: string; detail: string; rows: number }[];
  checks: { name: string; detail: string; failing: number; total: number }[];
  metrics: { winRate: number; cycleMedian: number; cycleP90: number; engagingAgeMedian: number; stalled: number; engaging: number; openMissingAccount: number; open: number; dateRange: [string, string] };
}
