"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useCrm } from "./crm-provider";
import { OpportunityEditor } from "./opportunity-editor";
import { Amount, StageBadge } from "./dashboard";
import { EmptyState, Modal, Notice, PageHeading, SearchField } from "./crm-ui";
import { dashboardClass as css } from "./dashboard-styles";
import styles from "./crm.module.css";
import type { Company } from "@/lib/models";
import { companyMetrics } from "@/lib/selectors";
import { formatNumber, formatPercent } from "@/lib/presentation";

const RELATED_LIMIT = 20;
type Metrics = ReturnType<typeof companyMetrics> extends Map<string, infer M> ? M : never;
const toNumber = (value: string) => value.trim() === "" ? null : Number(value);

function CompanyPanel({ company, metrics, onClose, onSaved, onOpportunity }: { company?: Company; metrics?: Metrics; onClose: () => void; onSaved: () => void; onOpportunity: (id: string | null, companyId: string) => void }) {
  const { state, lookups, dispatch, formatMoney, formatDate } = useCrm();
  const [editing, setEditing] = useState(!company);
  const [form, setForm] = useState({
    name: company?.name ?? "", sector: company?.sector ?? "", city: company?.city ?? "",
    yearEstablished: company?.yearEstablished?.toString() ?? "", revenue: company?.revenue?.toString() ?? "",
    employees: company?.employees?.toString() ?? "", parentId: company?.parentId ?? "",
  });
  const [error, setError] = useState("");
  const sectors = [...new Set(state.companies.map(c => c.sector))].sort();
  const cities = [...new Set(state.companies.map(c => c.city))].sort((a, b) => a.localeCompare(b, "tr"));
  const subsidiaries = company ? state.companies.filter(c => c.parentId === company.id) : [];
  const related = metrics ? [...metrics.records].sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? "")) : [];
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      dispatch({ type: "save-company", id: company?.id ?? `acc-new-${crypto.randomUUID().slice(0, 8)}`, input: {
        name: form.name, sector: form.sector, city: form.city, parentId: form.parentId || null,
        yearEstablished: toNumber(form.yearEstablished), revenue: toNumber(form.revenue), employees: toNumber(form.employees),
      } });
      onSaved(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Şirket kaydedilemedi."); }
  }
  return <Modal wide={!editing} title={!company ? "Yeni Şirket" : editing ? "Şirketi Düzenle" : company.name} onClose={onClose}>
    {editing ? <form className={styles.form} onSubmit={save}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.full}`}>Şirket adı *<input name="companyName" required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
        <label className={styles.field}>Sektör *<select name="sector" required value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })}><option value="">Sektör seçin</option>{sectors.map(sector => <option key={sector} value={sector}>{sector}</option>)}</select></label>
        <label className={styles.field}>Şehir *<input name="city" required list="company-cities" maxLength={80} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}/><datalist id="company-cities">{cities.map(city => <option key={city} value={city}/>)}</datalist></label>
        <label className={styles.field}>Kuruluş yılı<input name="yearEstablished" type="number" min="1800" step="1" value={form.yearEstablished} onChange={e => setForm({ ...form, yearEstablished: e.target.value })}/></label>
        <label className={styles.field}>Çalışan sayısı<input name="employees" type="number" min="0" step="1" value={form.employees} onChange={e => setForm({ ...form, employees: e.target.value })}/></label>
        <label className={styles.field}>Yıllık gelir (milyon USD)<input name="revenue" type="number" min="0" step="0.01" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })}/></label>
        <label className={styles.field}>Ana şirket<select name="parentId" value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })}><option value="">Yok (bağımsız)</option>{state.companies.filter(c => c.id !== company?.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <p className={styles.formHint}>* Zorunlu alanlar. Aynı isimde ikinci bir şirket oluşturulamaz; böylece mükerrer kayıt oluşmaz.</p>
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={onClose}>Vazgeç</button><button type="submit" className={css("primary-button")}>Kaydet</button></div>
    </form> : company && <div className={styles.modalBody}>
      <dl className={styles.details}>
        <div><dt>Sektör</dt><dd>{company.sector}</dd></div><div><dt>Şehir</dt><dd>{company.city}</dd></div>
        <div><dt>Kuruluş yılı</dt><dd>{company.yearEstablished ?? "—"}</dd></div><div><dt>Çalışan / yıllık gelir</dt><dd>{company.employees !== null ? formatNumber(company.employees) : "—"} · {company.revenue !== null ? `${formatNumber(company.revenue, 1)} mn USD` : "—"}</dd></div>
        <div><dt>Ana şirket</dt><dd>{company.parentId ? lookups.companies.get(company.parentId)?.name : "Bağımsız"}</dd></div><div><dt>İştirakler</dt><dd>{subsidiaries.length ? subsidiaries.map(c => c.name).join(", ") : "—"}</dd></div>
        <div><dt>Açık pipeline</dt><dd>{metrics ? `${metrics.open} fırsat · ≈ ${formatMoney(metrics.pipeline)}` : "—"}</dd></div><div><dt>Kazanılan gelir · kazanma oranı</dt><dd>{metrics ? `${formatMoney(metrics.revenue)} · ${formatPercent(metrics.winRate)}` : "—"}</dd></div>
      </dl>
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setEditing(true)}>Şirketi düzenle</button><button type="button" className={css("primary-button")} onClick={() => onOpportunity(null, company.id)}><Plus size={15}/>Yeni fırsat</button></div>
      <h3 className={styles.subheading}>Son Fırsatlar {related.length > RELATED_LIMIT && <span className={styles.estimate}>· {formatNumber(related.length)} fırsatın en yeni {RELATED_LIMIT} tanesi</span>}</h3>
      <div className={styles.tableScroll}><table><thead><tr><th scope="col">Fırsat</th><th scope="col">Aşama</th><th scope="col">Tutar</th><th scope="col">Tarih</th></tr></thead><tbody>{related.slice(0, RELATED_LIMIT).map(op => <tr key={op.id}><td><button type="button" className={styles.rowLink} onClick={() => onOpportunity(op.id, company.id)}>{op.product}</button><small className={styles.rowSubtext}>{op.id} · {op.owner}</small></td><td><StageBadge stage={op.stage}/></td><td><Amount op={op} format={formatMoney}/></td><td>{formatDate(op.activityDate)}</td></tr>)}</tbody></table></div>
      {!related.length && <EmptyState>Bu şirkete ait satış fırsatı yok.</EmptyState>}
    </div>}
  </Modal>;
}

type SortKey = "name" | "revenue" | "open" | "employees";
export function CompaniesPage() {
  const { state, opportunities, lookups, formatMoney } = useCrm();
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("all");
  const [sort, setSort] = useState<SortKey>("revenue");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [opportunity, setOpportunity] = useState<{ id: string | null; companyId: string } | null>(null);
  const [notice, setNotice] = useState("");
  const metrics = useMemo(() => companyMetrics(opportunities), [opportunities]);
  const sectors = [...new Set(state.companies.map(company => company.sector))].sort((a, b) => a.localeCompare(b, "tr"));
  const normalized = query.toLocaleLowerCase("tr-TR");
  const filtered = state.companies.filter(company => (sector === "all" || company.sector === sector) && `${company.name} ${company.city}`.toLocaleLowerCase("tr-TR").includes(normalized))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "tr") : sort === "employees" ? (b.employees ?? 0) - (a.employees ?? 0)
      : sort === "open" ? (metrics.get(b.id)?.open ?? 0) - (metrics.get(a.id)?.open ?? 0) : (metrics.get(b.id)?.revenue ?? 0) - (metrics.get(a.id)?.revenue ?? 0));
  const unlinked = opportunities.filter(op => !op.companyId).length;
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Şirketler" description="Müşteri hesaplarını, şirket ilişkilerini ve hesap bazlı satış performansını yönetin."><button type="button" className={css("primary-button")} onClick={() => setCreating(true)}><Plus size={16}/>Yeni şirket</button></PageHeading>
    <p className={styles.summary}><strong>{state.companies.length}</strong> şirket · <strong>{state.companies.filter(c => c.parentId).length}</strong> iştirak · <strong>{formatNumber(unlinked)}</strong> fırsat hiçbir şirkete bağlı değil</p>
    <div className={styles.toolbar}><SearchField value={query} onChange={setQuery} label="Şirketlerde ara" placeholder="Şirket veya şehir ara…"/>
      <label className={styles.filter}>Sektör<select aria-label="Sektör filtresi" value={sector} onChange={e => setSector(e.target.value)}><option value="all">Tüm sektörler</option>{sectors.map(sector => <option key={sector} value={sector}>{sector}</option>)}</select></label>
      <label className={styles.filter}>Sıralama<select aria-label="Sıralama" value={sort} onChange={e => setSort(e.target.value as SortKey)}><option value="revenue">Kazanılan gelir</option><option value="open">Açık fırsat</option><option value="employees">Çalışan sayısı</option><option value="name">Ada göre</option></select></label>
    </div>
    {notice && <Notice>{notice}</Notice>}
    <div className={styles.tableBox}><div className={styles.tableScroll} role="region" aria-label="Şirketler tablosu" tabIndex={0}><table><thead><tr><th scope="col">Şirket</th><th scope="col">Sektör</th><th scope="col">Şehir</th><th scope="col" className={css("numeric")}>Çalışan</th><th scope="col" className={css("numeric")}>Açık fırsat</th><th scope="col" className={css("numeric")}>Kazanma oranı</th><th scope="col" className={css("numeric")}>Kazanılan gelir</th></tr></thead>
      <tbody>{filtered.map(company => { const m = metrics.get(company.id); return <tr key={company.id}><td><button type="button" className={styles.rowLink} onClick={() => setSelected(company.id)}>{company.name}</button>{company.parentId && <small className={styles.rowSubtext}>{lookups.companies.get(company.parentId)?.name} iştiraki</small>}</td><td>{company.sector}</td><td>{company.city}</td><td className={css("numeric")}>{company.employees !== null ? formatNumber(company.employees) : "—"}</td><td className={css("numeric")}>{m?.open ?? 0}</td><td className={css("numeric")}>{m && m.won + m.lost ? formatPercent(m.winRate) : "—"}</td><td className={css("numeric")}>{formatMoney(m?.revenue ?? 0)}</td></tr>; })}</tbody>
    </table>{!filtered.length && <EmptyState>Aramanıza uygun şirket bulunamadı.</EmptyState>}</div><div className={css("table-footer")}><span>{filtered.length} şirket gösteriliyor</span><span>Tutarlar USD</span></div></div>
    {(creating || selected) && <CompanyPanel key={selected ?? "new"} company={state.companies.find(company => company.id === selected)} metrics={selected ? metrics.get(selected) : undefined} onClose={() => { setCreating(false); setSelected(null); }} onSaved={() => setNotice("Şirket kaydedildi.")} onOpportunity={(id, companyId) => { setCreating(false); setSelected(null); setOpportunity({ id, companyId }); }}/>}
    {opportunity && <OpportunityEditor key={opportunity.id ?? opportunity.companyId} opportunity={state.opportunities.find(op => op.id === opportunity.id)} companyId={opportunity.companyId} onClose={() => setOpportunity(null)} onSaved={() => setNotice("Satış fırsatı kaydedildi.")}/>}
  </main>;
}
