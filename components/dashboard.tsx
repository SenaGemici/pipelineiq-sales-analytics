"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowRight, CalendarDays, Search, ShieldCheck, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useCrm } from "./crm-provider";
import { InfoTooltip } from "./info-tooltip";
import { dashboardClass as css } from "./dashboard-styles";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OpportunityView, Stage } from "@/lib/models";
import { inPeriod, quarterPeriods, summarize } from "@/lib/pipeline";
import { isOpen, monthKeys, monthlyRevenue } from "@/lib/selectors";
import { asOfDate, stallDays } from "@/lib/seed";
import { buildCsv, formatAxis, formatNumber, formatPercent, stageColors, stageLabels } from "@/lib/presentation";

export const tooltipStyle = { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, boxShadow: "0 4px 16px #0f172a0a" };

export function Panel({ title, description, action, children, className = "" }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={css(`panel ${className}`)} aria-label={title}>
    <div className={css("panel-heading")}><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
    {children}
  </section>;
}

export function Kpi({ title, value, detail, explanation }: { title: string; value: string; detail: string; explanation?: string }) {
  return <div className={css("kpi")}>
    <dt><span>{title}</span>{explanation && <InfoTooltip title={title}>{explanation}</InfoTooltip>}</dt>
    <dd>{value}</dd><p>{detail}</p>
  </div>;
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={css(`stage ${stage === "Won" ? "won" : stage === "Lost" ? "lost" : ""}`)}><span/>{stageLabels[stage]}</span>;
}

/** Tahmini (liste fiyatı) tutarları "≈" ile gösterir. */
export function Amount({ op, format }: { op: OpportunityView; format: (value: number) => string }) {
  return <span title={op.estimated ? "Liste fiyatından tahmin edildi" : undefined}>{op.estimated ? "≈ " : ""}{format(op.amount)}</span>;
}

function exportData(data: OpportunityView[]) {
  const url = URL.createObjectURL(new Blob([buildCsv(data)], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pipelineiq-satis-raporu.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Dashboard() {
  const { opportunities, formatMoney, formatDate } = useCrm();
  const [query, setQuery] = useState("");
  const [periodKey, setPeriodKey] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const periods = useMemo(() => quarterPeriods(opportunities.map(op => op.closedAt)), [opportunities]);
  const period = periods.find(item => item.key === periodKey);
  // Açık pipeline analiz tarihindeki anlık durumdur; dönem filtresi kapanan fırsatlara uygulanır.
  const data = useMemo(() => opportunities.filter(op => isOpen(op) || inPeriod(op.closedAt, period)), [opportunities, period]);
  const stats = useMemo(() => summarize(data), [data]);
  const revenue = useMemo(() => {
    const closed = data.filter(op => op.closedAt).map(op => op.closedAt!).sort();
    return monthlyRevenue(data, period ? monthKeys(period.start, period.end) : closed.length ? monthKeys(closed[0], closed.at(-1)!) : []);
  }, [data, period]);
  const normalizedQuery = query.toLocaleLowerCase("tr-TR");
  const filtered = useMemo(() => data.filter(op => `${op.company} ${op.product} ${op.owner} ${op.id}`.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
    .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? "")), [data, normalizedQuery]);
  const recent = filtered.slice(0, expanded ? 25 : 6);
  const stageData = stats.stages.map(s => ({ ...s, label: stageLabels[s.stage], fill: stageColors[s.stage] }));
  const stalledAmount = stats.stalled.reduce((sum, op) => sum + op.amount, 0);
  const missingOpen = stats.missingCompany.filter(isOpen).length;

  return (
      <main id="main" tabIndex={-1}>
        <div className={css("page-heading")}><div><h1>Genel Bakış</h1><p>Pipeline&apos;ın anlık durumu ve seçili dönemde kapanan satışlar.</p></div>
          <div className={css("page-actions")}><label className={css("select-control")}><CalendarDays size={16}/><span className={css("sr-only")}>Kapanış dönemi seçin</span><select value={periodKey} onChange={e => { setPeriodKey(e.target.value); setExpanded(false); }}><option value="all">Tüm dönem</option>{periods.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            <button type="button" className={css("primary-button")} onClick={() => exportData(data)}><ArrowDownToLine size={16}/>Rapor indir</button>
          </div>
        </div>
        <dl className={css("kpi-strip")} aria-label="Satış özeti">
          <Kpi title="Açık Pipeline" value={`≈ ${formatMoney(stats.total)}`} detail={`${formatNumber(stats.open.length)} açık fırsat`} explanation="Açık fırsatların toplamı. Kaynak veride açık fırsatların tutarı olmadığı için ürün liste fiyatı kullanılır."/>
          <Kpi title="Ağırlıklı Satış Tahmini" value={formatMoney(stats.weighted)} detail="Tutar × kazanılma olasılığı" explanation="Görüşmedeki fırsatlar için olasılık, tarihsel kazanma oranından türetilir. Potansiyel aşaması için %20 varsayılır. Takılmış fırsatlar da dahildir; Veri Kalitesi ekranında ayrıca işaretlenir."/>
          <Kpi title="Kazanma Oranı" value={formatPercent(stats.winRate)} detail={`${formatNumber(stats.closedCount)} kapanan fırsattan ${formatNumber(stats.wonCount)} kazanıldı`} explanation="Kazanılan fırsat sayısının, kazanılan ve kaybedilen fırsatların toplamına oranıdır. Seçili döneme göre hesaplanır."/>
          <Kpi title="Kazanılan Gelir" value={formatMoney(stats.wonRevenue)} detail={period ? period.label : "Tüm dönem"} explanation="Kazanılan fırsatların gerçekleşen satış tutarlarının toplamıdır."/>
        </dl>
        <div className={css("chart-grid")}>
          <Panel title="Aşamalara Göre Fırsatlar" description={`Fırsat sayısı · açık aşamalar anlık, kapananlar ${period ? period.label : "tüm dönem"}`}>
            <div className={css("chart-wrap")} role="img" aria-label={stageData.map(s => `${s.label}: ${s.count} fırsat`).join(", ")}>
              <ResponsiveContainer width="100%" height="100%"><BarChart data={stageData} margin={{ top: 20, right: 16, left: 0, bottom: 12 }} barSize={42}>
                <CartesianGrid vertical={false} stroke="#edf1f5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} dy={10} interval={0}/><YAxis width={56} tickFormatter={value => formatNumber(Number(value))} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }}/>
                <Tooltip cursor={{ fill: "#f8fafc" }} formatter={value => [`${formatNumber(Number(value))} fırsat`, "Fırsat sayısı"]} contentStyle={tooltipStyle}/>
                <Bar isAnimationActive={false} dataKey="count" name="Fırsat sayısı" radius={[4, 4, 0, 0]}>{stageData.map(s => <Cell key={s.stage} fill={s.fill}/>)}</Bar>
              </BarChart></ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Kazanılan Satışlar" description={`Aylık · ${period ? period.label : revenue.length ? `${revenue[0].label} – ${revenue.at(-1)!.label}` : "veri yok"}`} action={<div className={css("chart-total")}><strong>{formatMoney(stats.wonRevenue)}</strong><span>Toplam gelir</span></div>}>
            <div className={css("chart-wrap")} role="img" aria-label={revenue.map(m => `${m.label}: ${formatMoney(m.revenue)}`).join(", ")}>
              <ResponsiveContainer width="100%" height="100%"><AreaChart data={revenue} margin={{ top: 20, right: 16, left: 0, bottom: 12 }}>
                <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.09}/><stop offset="100%" stopColor="#4f46e5" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#edf1f5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} dy={10} minTickGap={12}/><YAxis width={64} tickFormatter={formatAxis} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }}/>
                <Tooltip formatter={value => [formatMoney(Number(value)), "Kazanılan satış"]} contentStyle={tooltipStyle}/><Area isAnimationActive={false} type="monotone" dataKey="revenue" name="Kazanılan satış" stroke="#4f46e5" strokeWidth={2} fill="url(#revenueFill)" dot={false} activeDot={{ r: 4 }}/>
              </AreaChart></ResponsiveContainer>
            </div>
          </Panel>
        </div>
        <div className={css("bottom-grid")}>
          <Panel title="Son Hareketler" description="Kapanış veya görüşme tarihine göre en yeni fırsatlar" className="opportunities-panel" action={<button type="button" className={css("text-button")} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Daha az göster" : "Daha fazla göster"}<ArrowRight size={15}/></button>}>
            <label className={css("table-search")}><Search size={17}/><input type="search" aria-label="Satış fırsatlarında ara" placeholder="Şirket, ürün, sorumlu veya fırsat no ara…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" className={css("icon-button")} aria-label="Aramayı temizle" onClick={() => setQuery("")}><X size={15}/></button>}</label>
            <div className={css("table-scroll")} role="region" aria-label="Satış fırsatları tablosu" tabIndex={0}><table><thead><tr><th scope="col">Şirket / Ürün</th><th scope="col">Aşama</th><th scope="col" className={css("numeric")}>Tutar</th><th scope="col">Sorumlu</th></tr></thead>
              <tbody>{recent.map(op => <tr key={op.id}><td><div className={css("company-cell")}><strong>{op.company}</strong><small>{op.product} · {formatDate(op.activityDate)}</small></div></td><td><StageBadge stage={op.stage}/></td><td className={css("numeric deal-value")}><Amount op={op} format={formatMoney}/></td><td><span className={css("owner")} title={op.owner}>{op.owner}</span></td></tr>)}</tbody>
            </table>{!recent.length && <div className={css("empty-state")}><Search size={22}/><strong>Satış fırsatı bulunamadı</strong><p>Aramanızı değiştirin veya başka bir dönem seçin.</p>{query && <button type="button" className={css("text-button")} onClick={() => setQuery("")}>Aramayı temizle</button>}</div>}</div>
            <div className={css("table-footer")}><span aria-live="polite">{formatNumber(filtered.length)} fırsattan {recent.length} tanesi gösteriliyor</span><Link href="/satis-firsatlari" className={css("text-button")}>Tüm fırsatlar</Link></div>
          </Panel>
          <Panel title="Veri Kalitesi Uyarıları" description="Pipeline güvenilirliğini etkileyen açık fırsatlar" className="quality-panel">
            <div className={css("quality-body")}>
              <HealthItem title={`${formatNumber(stats.stalled.length)} fırsat takılmış görünüyor`} detail={`${stallDays} günden uzun süredir görüşmede. Pipeline'ın ≈ ${formatMoney(stalledAmount)} kadarı büyük olasılıkla gerçekçi değil.`} warning={stats.stalled.length > 0}/>
              <HealthItem title={`${formatNumber(missingOpen)} açık fırsatın şirketi yok`} detail="Hesap bazlı raporlarda görünmezler. Veri Kalitesi ekranından şirket atayın." warning={missingOpen > 0}/>
              {!stats.stalled.length && !missingOpen && <p className={css("quality-success")}>Takip gerektiren bir uyarı yok.</p>}
              <p className={css("quality-note")}>Analiz tarihi: {formatDate(asOfDate)} · <Link href="/veri-kalitesi">Ayrıntılar</Link></p>
            </div>
          </Panel>
        </div>
      </main>
  );
}

function HealthItem({ title, detail, warning }: { title: string; detail: string; warning: boolean }) {
  return <div className={css("health-item")}><span className={css(warning ? "warning-icon" : "success-icon")}>{warning ? <TriangleAlert size={18}/> : <ShieldCheck size={18}/>}</span><div><strong>{title}</strong><p>{detail}</p></div></div>;
}
