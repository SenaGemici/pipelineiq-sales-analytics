// Satış aşamaları: Prospecting (potansiyel) > Engaging (görüşmede) > Won / Lost
export const opportunityStages = ["Prospecting", "Engaging", "Won", "Lost"] as const;
export type Stage = (typeof opportunityStages)[number];
export const openStages: readonly Stage[] = ["Prospecting", "Engaging"];
export type DateOnly = string;

export interface Company {
  id: string;
  name: string;
  sector: string;
  yearEstablished: number | null;
  /** Yıllık gelir, milyon USD */
  revenue: number | null;
  employees: number | null;
  city: string;
  parentId: string | null;
}
export interface Representative { id: string; name: string; manager: string; region: string }
export interface Product { id: string; name: string; series: string; price: number }
export interface OpportunityRecord {
  id: string;
  companyId: string | null;
  productId: string;
  ownerId: string | null;
  stage: Stage;
  /** Gerçekleşen satış tutarı. Açık fırsatlarda genellikle boştur; tahmin ürün liste fiyatından gelir. */
  value: number | null;
  probability: number;
  /** Engaging aşamasına geçiş (görüşme başlangıcı) tarihi */
  createdAt: DateOnly | null;
  closedAt: DateOnly | null;
}
export type OpportunityInput = Omit<OpportunityRecord, "id" | "closedAt">;
export type CompanyInput = Omit<Company, "id">;
export interface Preferences {
  currencyDisplay: "symbol" | "code";
  dateFormat: "tr" | "iso";
}
export interface CrmState {
  schemaVersion: 2;
  companies: Company[];
  opportunities: OpportunityRecord[];
  representatives: Representative[];
  products: Product[];
  preferences: Preferences;
}
/** Tablo ve grafikler için okuma modeli; saklanan kayıtlar normalize anahtarları korur. */
export interface OpportunityView extends OpportunityRecord {
  company: string;
  sector: string | null;
  owner: string;
  region: string | null;
  product: string;
  listPrice: number;
  /** Hesaplamalarda kullanılan tutar: gerçekleşen tutar, yoksa açık fırsatta liste fiyatı. */
  amount: number;
  estimated: boolean;
  /** Son hareket tarihi: kapanış, yoksa görüşme tarihi. */
  activityDate: DateOnly | null;
}
