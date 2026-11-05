import { dataset } from "./generated/crm-data";
import { opportunityStages, type CrmState } from "./models";

/** Analiz tarihi: veri setindeki en son tarih. Güncellik kuralları bu tarihe göre çalışır. */
export const asOfDate = dataset.meta.asOf;
/** Üretilen verinin içerik parmak izi; saklanan değişiklikler yalnızca aynı sürüme uygulanır. */
export const dataVersion = dataset.meta.version;
/** Aşama başına takılma eşiği (gün): o aşamadan çıkan fırsatların %90'ı bu süre içinde çıkmış. */
export const stallDays = dataset.meta.stallDays;
export const leadSources = dataset.meta.leadSources;
export const lossReasons = dataset.meta.lossReasons;
export const historicalWinRate = dataset.meta.winRate;
export const defaultProbability = dataset.meta.defaultProbability;
export const initialCounts = { companies: dataset.companies.length, representatives: dataset.representatives.length, products: dataset.products.length, opportunities: dataset.opportunities.length };

export function createInitialState(): CrmState {
  const { companies, representatives, products } = dataset;
  return {
    schemaVersion: 2,
    companies: companies.map(company => ({ ...company })),
    representatives,
    products,
    preferences: { currencyDisplay: "symbol", dateFormat: "tr" },
    opportunities: dataset.opportunities.map(([id, company, product, owner, stage, value, createdAt, stageEnteredAt, closedAt, source, reason, discount]) => {
      const stageName = opportunityStages[stage];
      return {
        id, companyId: company < 0 ? null : companies[company].id, productId: products[product].id, ownerId: representatives[owner].id,
        stage: stageName, value, probability: defaultProbability[stageName], createdAt, stageEnteredAt, closedAt,
        leadSource: source < 0 ? null : leadSources[source], lossReason: reason < 0 ? null : lossReasons[reason], discount,
      };
    }),
  };
}
