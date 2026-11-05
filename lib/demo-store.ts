import { applyAction, mergeStoredChanges, StaleDataError, type CrmAction, type StoredChanges } from "./crm-state";
import { createInitialState, dataVersion } from "./seed";
import type { CrmState } from "./models";

export const storageKey = "pipelineiq.crm.v2";
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface StoreSnapshot { state: CrmState; warning: string | null }

/** Başlangıç verisinden farklı olan kayıtları çıkarır. Saklanan veri küçük kalır. */
export function diffState(base: CrmState, state: CrmState): StoredChanges {
  const baseCompanies = new Map(base.companies.map(c => [c.id, c]));
  const baseOpportunities = new Map(base.opportunities.map(op => [op.id, op]));
  // Kayıtlar düz (iç içe olmayan) alanlardan oluşur; anahtar sırası farkı değişiklik sayılmaz.
  const differs = <T extends object>(a: T | undefined, b: T) => {
    if (!a) return true;
    const keys = Object.keys(b) as (keyof T)[];
    return keys.length !== Object.keys(a).length || keys.some(key => a[key] !== b[key]);
  };
  return {
    schemaVersion: 2,
    dataVersion,
    companies: state.companies.filter(c => differs(baseCompanies.get(c.id), c)),
    opportunities: state.opportunities.filter(op => differs(baseOpportunities.get(op.id), op)),
    preferences: state.preferences,
  };
}

export function createDemoStore(getStorage: () => StorageAdapter | null = () => typeof window === "undefined" ? null : window.localStorage) {
  const base = createInitialState();
  const initial: StoreSnapshot = { state: base, warning: null };
  let snapshot = initial;
  let loaded = false;
  const listeners = new Set<() => void>();
  const read = (raw: string | null | undefined) => raw ? mergeStoredChanges(base, raw) : base;
  function load() {
    if (loaded) return;
    loaded = true;
    try { snapshot = { state: read(getStorage()?.getItem(storageKey)), warning: null }; }
    catch (error) {
      snapshot = { state: base, warning: error instanceof StaleDataError
        ? "Veri seti güncellendiği için bu tarayıcıda kaydettiğiniz önceki değişiklikler uygulanmadı. Ayarlar ekranından sıfırlayarak bu uyarıyı kaldırabilirsiniz."
        : "Kaydedilmiş değişiklikler okunamadı. Başlangıç verileri yüklendi; Ayarlar ekranından sıfırlayabilirsiniz." };
    }
  }
  function receiveStorage(event: StorageEvent) {
    if (event.key !== storageKey && event.key !== null) return;
    try { snapshot = { state: read(event.newValue), warning: null }; }
    catch { snapshot = { ...snapshot, warning: "Başka sekmedeki değişiklikler okunamadı. Bu sekmedeki kayıtlar korundu." }; }
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot() { load(); return snapshot; },
    getServerSnapshot() { return initial; },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", receiveStorage);
      return () => { listeners.delete(listener); if (!listeners.size && typeof window !== "undefined") window.removeEventListener("storage", receiveStorage); };
    },
    dispatch(action: CrmAction) {
      load();
      const state = applyAction(snapshot.state, action);
      if (state === snapshot.state) return;
      let warning: string | null = null;
      try {
        const storage = getStorage();
        if (!storage) throw new Error("No storage");
        if (action.type === "reset") storage.removeItem(storageKey);
        else storage.setItem(storageKey, JSON.stringify(diffState(base, state)));
      } catch { warning = "Tarayıcıya kayıt yapılamadı. Değişiklikler bu oturumda kullanılabilir; sayfayı yenilerseniz kaybolabilir."; }
      snapshot = { state, warning };
      listeners.forEach(listener => listener());
    },
  };
}
