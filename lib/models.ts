// Satış hunisi: Potansiyel > Nitelendirme > Teklif > Müzakere > Kazanıldı / Kaybedildi
export const opportunityStages = ["Prospecting", "Qualification", "Proposal", "Negotiation", "Won", "Lost"] as const;
export type Stage = (typeof opportunityStages)[number];
export const openStages = ["Prospecting", "Qualification", "Proposal", "Negotiation"] as const;
export type OpenStage = (typeof openStages)[number];
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
  /** Gerçekleşen satış tutarı. Açık fırsatlarda boştur; tahmin liste fiyatı ve indirimden hesaplanır. */
  value: number | null;
  probability: number;
  createdAt: DateOnly | null;
  /** Şu anki aşamaya giriş tarihi; aşamada geçen süre ve takılma kuralı buna göre hesaplanır. */
  stageEnteredAt: DateOnly | null;
  closedAt: DateOnly | null;
  leadSource: string | null;
  lossReason: string | null;
  /** Teklifte verilen indirim, yüzde */
  discount: number | null;
}
export type OpportunityInput = Omit<OpportunityRecord, "id" | "closedAt" | "stageEnteredAt">;
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
  /** Son hareket tarihi: kapanış, yoksa şu anki aşamaya giriş tarihi. */
  activityDate: DateOnly | null;
}
