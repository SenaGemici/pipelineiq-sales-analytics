import type { Company, OpenStage, Product, Representative, Stage } from "./models";

/** pipeline/build_dataset.py çıktısı: lib/generated/crm-data.ts (veri pipeline/generate_raw.py ile üretilen sentetik dışa aktarımdan gelir) */
export interface GeneratedDataset {
  meta: {
    version: string; asOf: string; winRate: number;
    /** Aşamadan çıkan fırsatların %90'ının o aşamada kaldığı gün sayısı */
    stallDays: Record<OpenStage, number>;
    /** Aşamaya ulaşmış fırsatların tarihsel kazanılma oranı (%) */
    defaultProbability: Record<Stage, number>;
    leadSources: string[]; lossReasons: string[];
  };
  companies: Company[];
  representatives: Representative[];
  products: Product[];
  /** [id, şirket, ürün, temsilci, aşama, tutar, oluşturulma, aşamaya giriş, kapanış, kaynak kanal, kayıp nedeni, indirim]; ilişkiler dizi sırası, -1 = boş */
  opportunities: [string, number, number, number, number, number | null, string | null, string | null, string | null, number, number, number | null][];
}

export type StepKind = "fix" | "flag" | "derive" | "note";
/** pipeline/build_dataset.py çıktısı: lib/generated/data-profile.ts */
export interface DataProfile {
  asOf: string;
  tables: { name: string; rawRows: number; cleanRows: number; columns: { name: string; nulls: number; distinct: number }[] }[];
  steps: { table: string; column: string; kind: StepKind; title: string; detail: string; rows: number }[];
  checks: { name: string; detail: string; failing: number; total: number }[];
  metrics: { winRate: number; stalled: number; open: number; openMissingAccount: number; dateRange: [string, string] };
}
