import { opportunityStages, type Company, type CompanyInput, type CrmState, type OpportunityInput, type OpportunityRecord, type Preferences, type Stage } from "./models";
import { validDate, roundMoney } from "./dates";
import { isOpen } from "./selectors";
import { asOfDate, createInitialState, dataVersion, defaultProbability } from "./seed";

export type CrmAction =
  | { type: "save-opportunity"; id: string; input: OpportunityInput }
  | { type: "move-opportunity"; id: string; stage: Stage }
  | { type: "save-company"; id: string; input: CompanyInput }
  | { type: "preferences"; input: Partial<Preferences> }
  | { type: "reset" };

/** Mükerrer kontrolü için ad anahtarı: büyük/küçük harf, Türkçe ı/i ve noktalama farkı yok sayılır (pipeline ile aynı kural). */
export const companyNameKey = (name: string) => name.toLocaleLowerCase("tr-TR").replaceAll("ı", "i").normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");
const optionalNumber = (value: unknown, min: number, max: number) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);

export function validateOpportunity(input: OpportunityInput, state: CrmState) {
  if (input.companyId !== null && !state.companies.some(company => company.id === input.companyId)) throw new Error("Geçerli bir şirket seçin.");
  if (!state.products.some(product => product.id === input.productId)) throw new Error("Geçerli bir ürün seçin.");
  if (!opportunityStages.includes(input.stage)) throw new Error("Geçerli bir aşama seçin.");
  if (!optionalNumber(input.value, 0, 1_000_000_000)) throw new Error("Tutar 0 ile 1 milyar USD arasında olmalıdır.");
  if (!optionalNumber(input.probability, 0, 100) || input.probability === null) throw new Error("Olasılık 0–100 arasında olmalıdır.");
  if (input.ownerId !== null && !state.representatives.some(rep => rep.id === input.ownerId)) throw new Error("Geçerli bir sorumlu seçin.");
  if (input.createdAt !== null && (!validDate(input.createdAt) || input.createdAt > asOfDate)) throw new Error("Görüşme tarihi analiz tarihinden sonra olamaz.");
}

export function validateCompany(id: string, input: CompanyInput, state: CrmState): Company {
  const company = { id, ...input, name: input.name.trim(), sector: input.sector.trim(), city: input.city.trim() };
  if (!company.name || !company.sector || !company.city) throw new Error("Şirket adı, sektör ve şehir zorunludur.");
  if (!optionalNumber(company.yearEstablished, 1800, Number(asOfDate.slice(0, 4))) || (company.yearEstablished !== null && !Number.isInteger(company.yearEstablished))) throw new Error("Kuruluş yılı geçerli bir yıl olmalıdır.");
  if (!optionalNumber(company.revenue, 0, 10_000_000)) throw new Error("Yıllık gelir 0 veya daha büyük olmalıdır.");
  if (!optionalNumber(company.employees, 0, 10_000_000) || (company.employees !== null && !Number.isInteger(company.employees))) throw new Error("Çalışan sayısı tam sayı olmalıdır.");
  if (company.parentId !== null && (company.parentId === id || !state.companies.some(c => c.id === company.parentId))) throw new Error("Geçerli bir ana şirket seçin.");
  const key = companyNameKey(company.name);
  if (state.companies.some(c => c.id !== id && companyNameKey(c.name) === key)) throw new Error("Bu isimde bir şirket zaten var.");
  return company;
}

export function applyAction(state: CrmState, action: CrmAction): CrmState {
  switch (action.type) {
    case "reset": return createInitialState();
    case "save-company": {
      const company = validateCompany(action.id, action.input, state);
      const exists = state.companies.some(c => c.id === action.id);
      return { ...state, companies: exists ? state.companies.map(c => c.id === action.id ? company : c) : [...state.companies, company] };
    }
    case "save-opportunity": {
      validateOpportunity(action.input, state);
      const previous = state.opportunities.find(op => op.id === action.id);
      const input = action.input;
      const closed = !isOpen(input);
      const closedAt = closed ? (previous && !isOpen(previous) && previous.closedAt ? previous.closedAt : asOfDate) : null;
      if (input.createdAt && closedAt && closedAt < input.createdAt) throw new Error("Görüşme tarihi kapanış tarihinden sonra olamaz.");
      const opportunity: OpportunityRecord = { ...input, id: action.id,
        value: input.value === null ? null : roundMoney(input.value),
        probability: closed ? defaultProbability[input.stage] : input.probability,
        closedAt,
      };
      return { ...state, opportunities: previous ? state.opportunities.map(op => op.id === action.id ? opportunity : op) : [...state.opportunities, opportunity] };
    }
    case "move-opportunity": {
      const opportunity = state.opportunities.find(op => op.id === action.id);
      if (!opportunity) throw new Error("Fırsat bulunamadı.");
      if (opportunity.stage === action.stage) return state;
      const listPrice = state.products.find(product => product.id === opportunity.productId)?.price ?? null;
      // Kaynak veri kuralları: kazanılan fırsatın tutarı varsayılan olarak liste fiyatı, kaybedilenin 0'dır; yeniden açılan fırsat tahmine döner.
      const value = action.stage === "Won" ? opportunity.value || listPrice : action.stage === "Lost" ? 0 : isOpen(opportunity) ? opportunity.value : null;
      const createdAt = opportunity.createdAt ?? (action.stage === "Prospecting" ? null : asOfDate);
      return applyAction(state, { type: "save-opportunity", id: action.id, input: { ...opportunity, stage: action.stage, value, createdAt, probability: defaultProbability[action.stage] } });
    }
    case "preferences": {
      const preferences = { ...state.preferences, ...action.input };
      if (!["symbol", "code"].includes(preferences.currencyDisplay) || !["tr", "iso"].includes(preferences.dateFormat)) throw new Error("Gösterim tercihi geçersiz.");
      return { ...state, preferences };
    }
  }
}

/** Saklanan değişiklikler, verinin başka bir sürümüne aittir (veri yeniden üretilmiş). */
export class StaleDataError extends Error { constructor() { super("Kayıtlar verinin eski bir sürümüne ait."); } }

/** Tarayıcıda yalnızca değişen kayıtlar saklanır; 8.800 fırsatın tamamı her seferinde yazılmaz. */
export interface StoredChanges {
  schemaVersion: 2;
  dataVersion: string;
  companies: Company[];
  opportunities: OpportunityRecord[];
  preferences: Preferences;
}
export function mergeStoredChanges(base: CrmState, raw: string): CrmState {
  const stored = JSON.parse(raw) as StoredChanges;
  if (stored?.dataVersion !== dataVersion) throw new StaleDataError();
  if (stored?.schemaVersion !== 2 || !Array.isArray(stored.companies) || !Array.isArray(stored.opportunities) || !stored.preferences) throw new Error("Kayıt biçimi geçersiz.");
  let state = applyAction(base, { type: "preferences", input: stored.preferences });
  // Önce bütün şirketler eklenir; böylece ana şirket ve fırsat referansları sıralamadan bağımsız doğrulanır.
  const changedCompanies = new Map(stored.companies.map(c => [c.id, c]));
  if (changedCompanies.size !== stored.companies.length) throw new Error("Yinelenen şirket kimliği.");
  const baseCompanyIds = new Set(state.companies.map(c => c.id));
  state = { ...state, companies: [...state.companies.map(c => changedCompanies.get(c.id) ?? c), ...stored.companies.filter(c => !baseCompanyIds.has(c.id))] };
  for (const company of stored.companies) validateCompany(company.id, company, state);
  const changed = new Map(stored.opportunities.map(op => [op.id, op]));
  if (changed.size !== stored.opportunities.length) throw new Error("Yinelenen fırsat kimliği.");
  for (const op of stored.opportunities) {
    if (typeof op.id !== "string" || !op.id) throw new Error("Fırsat kimliği geçersiz.");
    validateOpportunity(op, state);
    const consistent = isOpen(op) ? op.closedAt === null : validDate(op.closedAt) && op.probability === defaultProbability[op.stage] && (!op.createdAt || op.createdAt <= op.closedAt!);
    if (!consistent) throw new Error("Fırsat tarihleri veya olasılığı tutarsız.");
  }
  const existing = new Set(state.opportunities.map(op => op.id));
  return { ...state, opportunities: [...state.opportunities.map(op => changed.get(op.id) ?? op), ...stored.opportunities.filter(op => !existing.has(op.id))] };
}
