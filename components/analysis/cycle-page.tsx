"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCrm } from "../crm-provider";
import { Kpi, Panel } from "../dashboard";
import { PageHeading } from "../crm-ui";
import { dashboardClass as css } from "../dashboard-styles";
import { formatAxis, stageColors } from "@/lib/presentation";
import type { Stage } from "@/lib/models";
import { analysis, axisTick, chartTooltip, gridStroke, Method, num, pct, RateBar, series, stageName } from "./shared";
import styles from "./analysis.module.css";

const buckets = ["0-7", "8-14", "15-30", "30+"];
const monthLabel = (month: string) => new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

export function CyclePage() {
  const { formatMoney } = useCrm();
  const { stageDurations, waitAdvance, products, monthly, forecast } = analysis;
  const stages = stageDurations.map(row => row.stage!);
  // Bekleme süresi dilimine göre ilerleme oranı: her aşama ayrı bir çizgi.
  const waitData = buckets.map(bucket => Object.fromEntries([["bucket", `${bucket} gün`], ...stages.map(stage => [stage, (waitAdvance.find(row => row.stage === stage && row.days_bucket === bucket)?.advance_rate ?? null) as number | null])
    .map(([key, value]) => [key, value === null ? null : Number(value) * 100])]));
  const cycleData = products.map(product => ({ label: product.product, median: product.median_cycle_days, p90: product.p90_cycle_days }));
  const monthlyData = monthly.map(row => ({ ...row, label: monthLabel(row.month!) }));
  const slowest = [...products].sort((a, b) => (b.median_cycle_days ?? 0) - (a.median_cycle_days ?? 0))[0];
  const fastest = [...products].sort((a, b) => (a.median_cycle_days ?? 0) - (b.median_cycle_days ?? 0))[0];
  const proposal = waitAdvance.filter(row => row.stage === "Proposal");
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Satış Süresi" description="Fırsatlar her aşamada ne kadar bekliyor, uzun beklemek kazanma şansını nasıl etkiliyor ve hangi ürünlerde süreç uzun?"/>
    <dl className={css("kpi-strip")} aria-label="Satış süresi özeti">
      <Kpi title="Takılmış Fırsat" value={`${num(forecast.stalledDeals)} / ${num(forecast.openDeals)}`} detail={`${formatMoney(forecast.stalledPipeline)} pipeline`}
        explanation="Bulunduğu aşamada, o aşamadan çıkan fırsatların %90'ından (P90) uzun süre kalmış açık fırsatlar."/>
      <Kpi title="Takılmış Fırsatın Kazanılma Olasılığı" value={pct(forecast.avgProbabilityStalled, 1)} detail={`Aktif fırsatlarda ${pct(forecast.avgProbabilityActive, 1)}`}/>
      <Kpi title="En Yavaş Ürün" value={slowest?.product ?? "—"} detail={`Medyan ${num(slowest?.median_cycle_days)} gün`}/>
      <Kpi title="En Hızlı Ürün" value={fastest?.product ?? "—"} detail={`Medyan ${num(fastest?.median_cycle_days)} gün`}/>
    </dl>
    <div className={styles.row}>
      <Panel title="Aşama Süreleri ve Takılma Eşikleri" description="Aşamadan çıkmış (ilerlemiş veya kaybedilmiş) fırsatlar">
        <div className={`${styles.tableWrap} ${css("table-scroll")}`}><table>
          <thead><tr><th scope="col">Aşama</th><th scope="col" className={css("numeric")}>Çıkış</th><th scope="col" className={css("numeric")}>Medyan</th><th scope="col" className={css("numeric")}>P90 = takılma eşiği</th><th scope="col">Bu aşamada kaybedilen</th></tr></thead>
          <tbody>{stageDurations.map(row => <tr key={row.stage}>
            <td><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 8, background: stageColors[row.stage as Stage], marginRight: 8 }}/>{stageName(row.stage)}</td>
            <td className={css("numeric")}>{num(row.exits)}</td><td className={css("numeric")}>{num(row.median_days)} gün</td><td className={css("numeric")}><strong>{num(row.p90_days)} gün</strong></td>
            <td><RateBar value={row.lost_share ?? 0} max={0.6} tone="bad"/>{pct(row.lost_share)}</td>
          </tr>)}</tbody>
        </table></div>
        <p className={styles.note}>Takılma eşiği keyfi bir sayı değil, verinin kendisinden gelir: o aşamadan çıkan fırsatların %90&apos;ı bu süre içinde çıkmış. Bu süreyi aşan bir fırsat, geçmişteki fırsatların neredeyse hiçbirinin yaşamadığı bir beklemede demektir.</p>
      </Panel>
      <Panel title="Beklemek Şansı Azaltıyor mu?" description="Aşamada geçen süre dilimine göre bir sonraki aşamaya geçme oranı · %">
        <div className={css("chart-wrap")} role="img" aria-label={`Teklif aşamasında: ${proposal.map(row => `${row.days_bucket} gün %${((row.advance_rate ?? 0) * 100).toFixed(0)}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={waitData} margin={{ top: 16, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={gridStroke}/><XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={axisTick}/><YAxis width={42} domain={[0, 100]} tickFormatter={v => `%${v}`} axisLine={false} tickLine={false} tick={axisTick}/>
            <Tooltip contentStyle={chartTooltip} formatter={(value, name) => [`%${Number(value).toFixed(1)}`, stageName(String(name))]}/>
            {stages.map(stage => <Line key={stage} dataKey={stage} name={stage} stroke={stageColors[stage as Stage]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false}/>)}
          </LineChart></ResponsiveContainer>
        </div>
        <div className={styles.legend}>{stages.map(stage => <span key={stage}><i style={{ background: stageColors[stage as Stage] }}/>{stageName(stage)}</span>)}</div>
        <p className={styles.note}>Kaybedilen fırsatlar genellikle daha uzun bekledikten sonra kaybediliyor; bu yüzden uzun bekleyen fırsatların ilerleme oranı düşüyor. Bu, takılmış fırsatların erken uyarı işareti olarak kullanılabileceğini gösterir.</p>
      </Panel>
    </div>
    <div className={styles.row}>
      <Panel title="Ürüne Göre Satış Süresi" description="Kazanılan fırsatlar, oluşturmadan kazanmaya · gün">
        <div className={css("chart-wrap")} role="img" aria-label={cycleData.map(row => `${row.label}: medyan ${row.median} gün`).join(", ")}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={cycleData} layout="vertical" margin={{ top: 12, right: 24, left: 8, bottom: 4 }} barGap={2}>
            <CartesianGrid horizontal={false} stroke={gridStroke}/><XAxis type="number" axisLine={false} tickLine={false} tick={axisTick}/><YAxis type="category" dataKey="label" width={112} axisLine={false} tickLine={false} tick={axisTick}/>
            <Tooltip contentStyle={chartTooltip} cursor={{ fill: "#f8fafc" }} formatter={(value, name) => [`${num(Number(value))} gün`, name]}/>
            <Bar dataKey="median" name="Medyan" fill="#818cf8" barSize={10} radius={[0, 3, 3, 0]} isAnimationActive={false}/>
            <Bar dataKey="p90" name="P90" fill="#c7d2fe" barSize={10} radius={[0, 3, 3, 0]} isAnimationActive={false}/>
          </BarChart></ResponsiveContainer>
        </div>
        <div className={styles.legend}><span><i style={{ background: "#818cf8", height: 8 }}/>Medyan</span><span><i style={{ background: "#c7d2fe", height: 8 }}/>P90</span></div>
        <p className={styles.note}>Pahalı ürünlerde karar süreci uzuyor. Tahmin ve kapasite planlamasında tek bir ortalama satış süresi yerine ürün bazında süre kullanılmalı.</p>
      </Panel>
      <Panel title="Aylık Hacim ve Gelir" description="Yeni fırsat sayısı ve kazanılan gelir (kapanış ayına göre)">
        <div className={css("chart-wrap")} role="img" aria-label={monthlyData.map(row => `${row.label}: ${row.new_deals} yeni fırsat, ${formatMoney(row.won_revenue ?? 0)} gelir`).join("; ")}>
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlyData} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={gridStroke}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} minTickGap={14}/>
            <YAxis yAxisId="deals" width={40} axisLine={false} tickLine={false} tick={axisTick}/><YAxis yAxisId="revenue" orientation="right" width={58} tickFormatter={formatAxis} axisLine={false} tickLine={false} tick={axisTick}/>
            <Tooltip contentStyle={chartTooltip} formatter={(value, name) => [name === "Kazanılan gelir" ? formatMoney(Number(value)) : num(Number(value)), name]}/>
            <Bar yAxisId="deals" dataKey="new_deals" name="Yeni fırsat" fill="#e2e8f0" radius={[3, 3, 0, 0]} isAnimationActive={false}/>
            <Line yAxisId="revenue" dataKey="won_revenue" name="Kazanılan gelir" stroke={series.model} strokeWidth={2} dot={false} isAnimationActive={false}/>
          </ComposedChart></ResponsiveContainer>
        </div>
        <div className={styles.legend}><span><i style={{ background: "#e2e8f0", height: 8 }}/>Yeni fırsat (sol eksen)</span><span><i style={{ background: series.model }}/>Kazanılan gelir (sağ eksen)</span></div>
        <p className={styles.note}>Son ayın geliri düşük görünür: o ay açılan fırsatların çoğu henüz sonuçlanmadı.</p>
      </Panel>
    </div>
    <Method sql={["03_asama_sureleri.sql", "04_bekleme_ve_ilerleme.sql", "08_urun_ve_satis_suresi.sql", "09_aylik_trend.sql"]} notebook="01_kesifsel_analiz.ipynb">
      Aşama süreleri aşama geçmişi tablosundan (stage_history) pencere fonksiyonlarıyla hesaplanır.
    </Method>
  </main>;
}
