"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createDemoStore } from "@/lib/demo-store";
import { buildLookups, selectOpportunities, type Lookups } from "@/lib/selectors";
import { formatMoney as money } from "@/lib/presentation";
import { formatDate as date } from "@/lib/dates";
import type { CrmAction } from "@/lib/crm-state";
import type { CrmState, OpportunityView } from "@/lib/models";

type CrmContextValue = {
  state: CrmState; lookups: Lookups; opportunities: OpportunityView[]; viewById: Map<string, OpportunityView>;
  warning: string | null; dispatch: (action: CrmAction) => void;
  formatMoney: (value: number) => string; formatDate: (value: string | null | undefined) => string;
};
const CrmContext = createContext<CrmContextValue | null>(null);
export function CrmProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDemoStore);
  const { state, warning } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const value = useMemo<CrmContextValue>(() => {
    const lookups = buildLookups(state);
    const opportunities = selectOpportunities(state, lookups);
    return { state, lookups, opportunities, viewById: new Map(opportunities.map(op => [op.id, op])), warning, dispatch: store.dispatch,
      formatMoney: value => money(value, state.preferences.currencyDisplay),
      formatDate: value => date(value, state.preferences.dateFormat) };
  }, [state, warning, store]);
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}
export function useCrm() {
  const context = useContext(CrmContext);
  if (!context) throw new Error("CRM veri sağlayıcısı bulunamadı.");
  return context;
}
