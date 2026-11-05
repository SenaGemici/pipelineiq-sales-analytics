import { daysBetween, roundMoney } from "./dates";
import { asOfDate, stallDays } from "./seed";
import type { Company, CrmState, OpportunityRecord, OpportunityView, Product, Representative, Stage } from "./models";

export const isOpen = (op: { stage: Stage }) => op.stage === "Prospecting" || op.stage === "Engaging";
/** Görüşmesi, kazanılan fırsatların %90'ının kapandığı süreden uzun süren açık fırsat. */
export const isStalled = (op: { stage: Stage; createdAt: string | null }, referenceDate = asOfDate) =>
  op.stage === "Engaging" && !!op.createdAt && (daysBetween(op.createdAt, referenceDate) ?? 0) > stallDays;
export const ageInDays = (op: { createdAt: string | null }, referenceDate = asOfDate) => op.createdAt ? daysBetween(op.createdAt, referenceDate) : null;
const sum = <T,>(items: T[], value: (item: T) => number) => roundMoney(items.reduce((total, item) => total + value(item), 0));

export interface Lookups { companies: Map<string, Company>; representatives: Map<string, Representative>; products: Map<string, Product> }
export function buildLookups(state: CrmState): Lookups {
  return {
    companies: new Map(state.companies.map(company => [company.id, company])),
    representatives: new Map(state.representatives.map(rep => [rep.id, rep])),
    products: new Map(state.products.map(product => [product.id, product])),
  };
}
/** Açık fırsatta tutar yoksa ürün liste fiyatı tahmin olarak kullanılır; kapanan fırsatta eksik tutar 0 sayılır. */
export function amountOf(op: Pick<OpportunityRecord, "stage" | "value">, product: Product | undefined) {
  return op.value ?? (isOpen(op) ? product?.price ?? 0 : 0);
}
export function selectOpportunities(state: CrmState, lookups = buildLookups(state)): OpportunityView[] {
  return state.opportunities.map(op => {
    const company = op.companyId ? lookups.companies.get(op.companyId) : undefined;
    const product = lookups.products.get(op.productId);
    const rep = op.ownerId ? lookups.representatives.get(op.ownerId) : undefined;
    return { ...op, company: company?.name ?? "Şirket atanmamış", sector: company?.sector ?? null, owner: rep?.name ?? "Atanmamış", region: rep?.region ?? null,
      product: product?.name ?? "Bilinmeyen ürün", listPrice: product?.price ?? 0, amount: amountOf(op, product),
      estimated: op.value === null && isOpen(op), activityDate: op.closedAt ?? op.createdAt };
  });
}

/** "YYYY-MM" anahtarları, iki uç dahil. */
export function monthKeys(start: string, end: string) {
  const keys: string[] = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 7) <= end.slice(0, 7)) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}
export function monthlyRevenue(views: OpportunityView[], months: string[]) {
  const totals = new Map(months.map(key => [key, { revenue: 0, count: 0 }]));
  for (const op of views) {
    if (op.stage !== "Won" || !op.closedAt) continue;
    const bucket = totals.get(op.closedAt.slice(0, 7));
    if (bucket) { bucket.revenue += op.amount; bucket.count += 1; }
  }
  return months.map(key => ({ key, ...totals.get(key)!, revenue: roundMoney(totals.get(key)!.revenue),
    label: new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`)) }));
}
/** Görüşme başlangıcından kazanılmaya kadar geçen süre. */
export function salesCycle(records: Pick<OpportunityRecord, "stage" | "createdAt" | "closedAt">[]) {
  const durations = records.filter(op => op.stage === "Won" && op.createdAt && op.closedAt)
    .map(op => daysBetween(op.createdAt!, op.closedAt!)).filter((days): days is number => days !== null && days >= 0).sort((a, b) => a - b);
  const median = durations.length ? (durations.length % 2 ? durations[(durations.length - 1) / 2] : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2) : null;
  return { days: durations.length ? durations.reduce((total, days) => total + days, 0) / durations.length : null, median, count: durations.length };
}

function performance(records: OpportunityView[]) {
  const open = records.filter(isOpen), won = records.filter(op => op.stage === "Won"), lost = records.filter(op => op.stage === "Lost");
  return { open: open.length, won: won.length, lost: lost.length, revenue: sum(won, op => op.amount), pipeline: sum(open, op => op.amount),
    weighted: sum(open, op => op.amount * op.probability / 100), winRate: won.length + lost.length ? won.length / (won.length + lost.length) * 100 : 0 };
}
function groupBy(views: OpportunityView[], key: (op: OpportunityView) => string) {
  const groups = new Map<string, OpportunityView[]>();
  for (const op of views) {
    const id = key(op);
    const group = groups.get(id);
    if (group) group.push(op); else groups.set(id, [op]);
  }
  return groups;
}
export function representativePerformance(views: OpportunityView[], representatives: Representative[]) {
  const groups = groupBy(views, op => op.ownerId ?? "unassigned");
  const rows = representatives.map(rep => ({ id: rep.id, name: rep.name, manager: rep.manager, region: rep.region, ...performance(groups.get(rep.id) ?? []) }));
  if (groups.has("unassigned")) rows.push({ id: "unassigned", name: "Atanmamış", manager: "—", region: "—", ...performance(groups.get("unassigned")!) });
  return rows;
}
export function productPerformance(views: OpportunityView[], products: Product[]) {
  const groups = groupBy(views, op => op.productId);
  return products.map(product => {
    const records = groups.get(product.id) ?? [];
    const won = records.filter(op => op.stage === "Won" && op.value !== null && product.price > 0);
    // Gerçekleşen satış fiyatının liste fiyatına oranı: <1 indirim, >1 liste üstü satış.
    const priceRatio = won.length ? won.reduce((total, op) => total + op.value! / product.price, 0) / won.length : null;
    return { id: product.id, name: product.name, series: product.series, price: product.price, priceRatio, ...performance(records) };
  });
}
export function companyMetrics(views: OpportunityView[]) {
  const groups = groupBy(views.filter(op => op.companyId), op => op.companyId!);
  return new Map([...groups].map(([id, records]) => [id, { records, ...performance(records) }]));
}
