"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCrm } from "./crm-provider";
import { Kpi, Panel, tooltipStyle } from "./dashboard";
import { PageHeading } from "./crm-ui";
import { dashboardClass as css } from "./dashboard-styles";
import styles from "./crm.module.css";
import { summarize } from "@/lib/pipeline";
import { monthKeys, monthlyRevenue, productPerformance, representativePerformance, salesCycle } from "@/lib/selectors";
import { formatAxis, formatNumber, formatPercent, orDash, stageColors, stageLabels } from "@/lib/presentation";

export function AnalyticsPage() {
  const { state, opportunities, formatMoney } = useCrm();
  const [region, setRegion] = useState("all");
  const [owner, setOwner] = useState("all");
  const regions = [...new Set(state.representatives.map(rep => rep.region))].sort();
  const reps = state.representatives.filter(rep => region === "all" || rep.region === region);
  const data = useMemo(() => opportunities.filter(op => (region === "all" || op.region === region) && (owner === "all" || (op.ownerId ?? "unassigned") === owner)), [opportunities, region, owner]);
  const stats = useMemo(() => summarize(data), [data]);
  const cycle = useMemo(() => salesCycle(data), [data]);
  const performance = useMemo(() => representativePerformance(data, reps).filter(rep => (owner === "all" || rep.id === owner) && (rep.id !== "unassigned" || rep.open + rep.won + rep.lost > 0)).sort((a, b) => b.revenue - a.revenue), [data, reps, owner]);
  const products = useMemo(() => productPerformance(data, state.products).sort((a, b) => b.revenue - a.revenue), [data, state.products]);
  const revenue = useMemo(() => {
    const closed = opportunities.filter(op => op.closedAt).map(op => op.closedAt!).sort();
    return closed.length ? monthlyRevenue(data, monthKeys(closed[0], closed.at(-1)!)) : [];
  }, [data, opportunities]);
  const distribution = stats.stages.map(stage => ({ label: stageLabels[stage.stage], count: stage.count, fill: stageColors[stage.stage] }));
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Analizler" description="Satış sonuçlarını, ekip ve ürün performansını aynı veri üzerinden karşılaştırın.">
      <label className={styles.filter}><span className={css("sr-only")}>Bölge</span><select aria-label="Bölge filtresi" value={region} onChange={e => { setRegion(e.target.value); setOwner("all"); }}><option value="all">Tüm bölgeler</option>{regions.map(item => <option key={item} value={item}>{orDash(item)}</option>)}</select></label>
      <label className={styles.filter}><span className={css("sr-only")}>Analiz sorumlusu</span><select aria-label="Analiz sorumlusu" value={owner} onChange={e => setOwner(e.target.value)}><option value="all">Tüm temsilciler</option>{reps.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}<option value="unassigned">Atanmamış</option></select></label>
    </PageHeading>
    <dl className={css("kpi-strip")} aria-label="Satış analizi özeti">
      <Kpi title="Kazanma Oranı" value={formatPercent(stats.winRate)} detail={`${formatNumber(stats.wonCount)} kazanılan / ${formatNumber(stats.closedCount)} kapanan`} explanation="Kazanılan fırsat sayısı, kazanılan ve kaybedilen fırsatların toplamına bölünür. Açık fırsatlar paydaya dahil edilmez."/>
      <Kpi title="Kazanılan Gelir" value={formatMoney(stats.wonRevenue)} detail={`Kaçan potansiyel ≈ ${formatMoney(stats.lostPotential)}`} explanation="Kaybedilen fırsatların tutarı kaynakta 0 olduğu için kaçan potansiyel, ürün liste fiyatıyla hesaplanır."/>
      <Kpi title="Ağırlıklı Satış Tahmini" value={formatMoney(stats.weighted)} detail={`${formatNumber(stats.open.length)} açık fırsat üzerinden`} explanation="Açık fırsatlarda tutar × kazanılma olasılığı toplamı. Tutar yoksa liste fiyatı kullanılır."/>
      <Kpi title="Satış Süresi" value={cycle.days === null ? "—" : `${formatNumber(cycle.days, 1)} gün`} detail={cycle.median !== null ? `Medyan ${formatNumber(cycle.median)} gün · ${formatNumber(cycle.count)} kazanılan` : "Uygun kayıt yok"} explanation="Görüşme başlangıcından kazanılmaya kadar geçen süre. Ortalama ve medyan birlikte gösterilir; aralarındaki fark dağılımın çarpıklığını gösterir."/>
    </dl>
    <div className={css("chart-grid")}>
      <Panel title="Aşamalara Göre Fırsat Dağılımı" description="Açık ve kapanmış tüm fırsatların sayısı">
        <div className={css("chart-wrap")} role="img" aria-label={distribution.map(stage => `${stage.label}: ${stage.count} fırsat`).join(", ")}><ResponsiveContainer width="100%" height="100%"><BarChart data={distribution} layout="vertical" margin={{ top: 14, right: 24, left: 4, bottom: 0 }} barSize={22}><CartesianGrid horizontal={false} stroke="#edf1f5"/><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }}/><YAxis type="category" dataKey="label" width={90} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }}/><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} formatter={value => [`${formatNumber(Number(value))} fırsat`, "Fırsat sayısı"]}/><Bar dataKey="count" name="Fırsat sayısı" radius={[0, 4, 4, 0]} isAnimationActive={false}>{distribution.map(item => <Cell key={item.label} fill={item.fill}/>)}</Bar></BarChart></ResponsiveContainer></div>
        <p className={styles.chartFooter}>{formatNumber(data.length)} fırsatın {formatNumber(stats.open.length)} tanesi açık; bunların {formatNumber(stats.stalled.length)} tanesi takılmış durumda.</p>
      </Panel>
      <Panel title="Kazanılan Satışların Aylık Trendi" description={revenue.length ? `${revenue[0].label} – ${revenue.at(-1)!.label} · USD` : "USD"}>
        <div className={css("chart-wrap")} role="img" aria-label={revenue.map(month => `${month.label}: ${formatMoney(month.revenue)}`).join(", ")}><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenue} margin={{ top: 14, right: 22, left: 0, bottom: 0 }}><defs><linearGradient id="analyticsRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.1}/><stop offset="100%" stopColor="#4f46e5" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1f5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={12}/><YAxis width={62} tickFormatter={formatAxis} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }}/><Tooltip contentStyle={tooltipStyle} formatter={value => [formatMoney(Number(value)), "Kazanılan satış"]}/><Area dataKey="revenue" name="Kazanılan satış" type="monotone" stroke="#4f46e5" strokeWidth={2} fill="url(#analyticsRevenue)" isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
        <p className={styles.chartFooter}>Kazanılan fırsatlar kapanış ayına göre gruplanır; tutarı eksik kazanılan fırsatlar 0 sayılır.</p>
      </Panel>
    </div>
    <Panel title="Satış Temsilcisi Performansı" description="Kazanılan gelire göre sıralı · USD">
      <div className={`${styles.tableScroll} ${styles.performance}`} role="region" aria-label="Satış temsilcisi performansı" tabIndex={0}><table><thead><tr><th scope="col">Satış temsilcisi</th><th scope="col">Yönetici / bölge</th><th scope="col" className={css("numeric")}>Açık</th><th scope="col" className={css("numeric")}>Kazanılan</th><th scope="col" className={css("numeric")}>Kaybedilen</th><th scope="col" className={css("numeric")}>Kazanma oranı</th><th scope="col" className={css("numeric")}>Kazanılan gelir</th></tr></thead><tbody>{performance.map(rep => <tr key={rep.id}><td>{rep.name}{rep.open + rep.won + rep.lost === 0 && <small className={styles.rowSubtext}>Hiç fırsatı yok</small>}</td><td>{rep.manager}<small className={styles.rowSubtext}>{orDash(rep.region)}</small></td><td className={css("numeric")}>{formatNumber(rep.open)}</td><td className={css("numeric")}>{formatNumber(rep.won)}</td><td className={css("numeric")}>{formatNumber(rep.lost)}</td><td className={css("numeric")}>{rep.won + rep.lost ? formatPercent(rep.winRate) : "—"}</td><td className={css("numeric")}>{formatMoney(rep.revenue)}</td></tr>)}</tbody></table></div>
    </Panel>
    <div className={styles.sectionGap}/>
    <Panel title="Ürün Performansı" description="Fiyat oranı: gerçekleşen satış fiyatının liste fiyatına ortalama oranı (%100 altı indirim)">
      <div className={`${styles.tableScroll} ${styles.performance}`} role="region" aria-label="Ürün performansı" tabIndex={0}><table><thead><tr><th scope="col">Ürün</th><th scope="col" className={css("numeric")}>Liste fiyatı</th><th scope="col" className={css("numeric")}>Kazanılan</th><th scope="col" className={css("numeric")}>Kazanma oranı</th><th scope="col" className={css("numeric")}>Fiyat oranı</th><th scope="col" className={css("numeric")}>Açık pipeline</th><th scope="col" className={css("numeric")}>Kazanılan gelir</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td>{product.name}<small className={styles.rowSubtext}>{product.series} serisi</small></td><td className={css("numeric")}>{formatMoney(product.price)}</td><td className={css("numeric")}>{formatNumber(product.won)}</td><td className={css("numeric")}>{product.won + product.lost ? formatPercent(product.winRate) : "—"}</td><td className={css("numeric")}>{product.priceRatio === null ? "—" : formatPercent(product.priceRatio * 100)}</td><td className={css("numeric")}>≈ {formatMoney(product.pipeline)}</td><td className={css("numeric")}>{formatMoney(product.revenue)}</td></tr>)}</tbody></table></div>
    </Panel>
    <p className={styles.definition}>Metrik kapsamı: kazanma oranı yalnızca kapanmış fırsatları, ağırlıklı tahmin yalnızca açık fırsatları kapsar. Açık fırsatların tutarı kaynakta olmadığı için ürün liste fiyatı kullanılır ve &quot;≈&quot; ile gösterilir. Satış süresi görüşme başlangıcından kapanışa kadar ölçülür; potansiyel aşamasında geçen süre kaynakta yoktur.</p>
  </main>;
}
