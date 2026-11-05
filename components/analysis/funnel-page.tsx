"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCrm } from "../crm-provider";
import { Kpi, Panel } from "../dashboard";
import { PageHeading } from "../crm-ui";
import { dashboardClass as css } from "../dashboard-styles";
import { stageColors } from "@/lib/presentation";
import type { Stage } from "@/lib/models";
import { analysis, axisTick, chartTooltip, gridStroke, Method, num, pct, RateBar, stageName } from "./shared";
import styles from "./analysis.module.css";

export function FunnelPage() {
  const { formatMoney } = useCrm();
  const { funnel, sources, lossReasons } = analysis;
  const funnelData = funnel.map(step => ({ ...step, label: stageName(step.stage), fill: stageColors[step.stage as Stage] }));
  const weakest = funnel.filter(step => step.conversion_from_previous !== null).sort((a, b) => (a.conversion_from_previous ?? 1) - (b.conversion_from_previous ?? 1))[0];
  const known = sources.filter(source => source.lead_source !== "Bilinmiyor");
  const best = known[0];
  const sourceData = [...sources].sort((a, b) => (b.revenue_per_deal ?? 0) - (a.revenue_per_deal ?? 0)).map(source => ({ ...source, label: source.lead_source }));
  const stages = [...new Set(lossReasons.map(row => row.lost_at_stage))];
  const maxRevenue = Math.max(...sources.map(source => source.revenue_per_deal ?? 0));
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Huni ve Kanallar" description="Fırsatların hangi aşamada kaybolduğu, hangi kanalın en verimli olduğu ve kayıpların nedenleri."/>
    <dl className={css("kpi-strip")} aria-label="Huni özeti">
      <Kpi title="Baştan Sona Kazanma" value={pct(funnel.at(-1)?.share_of_leads, 1)} detail={`${num(funnel[0]?.deals)} sonuçlanmış fırsattan ${num(funnel.at(-1)?.deals)} kazanıldı`}
        explanation="Potansiyel aşamasına giren ve sonuçlanmış fırsatların kazanılma oranı. Açık fırsatlar huniyi tamamlamadığı için dahil edilmez."/>
      <Kpi title="En Zayıf Geçiş" value={pct(weakest?.conversion_from_previous)} detail={`${stageName(funnel.find(step => step.step === (weakest?.step ?? 0) - 1)?.stage ?? null)} → ${stageName(weakest?.stage ?? null)}`}/>
      <Kpi title="En Verimli Kanal" value={best?.lead_source ?? "—"} detail={`Fırsat başına ${formatMoney(best?.revenue_per_deal ?? 0)} gelir`}
        explanation="Fırsat başına gelir = kanalın kazanılan toplam geliri / kanaldan gelen sonuçlanmış fırsat sayısı. Kazanma oranı ve satış tutarını birlikte yansıtır."/>
      <Kpi title="Kaynağı Bilinmeyen" value={num(sources.find(source => source.lead_source === "Bilinmiyor")?.deals)} detail="Kanal alanı boş fırsat"/>
    </dl>
    <div className={styles.row}>
      <Panel title="Satış Hunisi" description="Her aşamaya ulaşan sonuçlanmış fırsat sayısı ve bir önceki aşamadan geçiş oranı">
        <div className={css("chart-wrap")} role="img" aria-label={funnelData.map(step => `${step.label}: ${step.deals} fırsat`).join(", ")}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={funnelData} layout="vertical" margin={{ top: 12, right: 72, left: 8, bottom: 4 }} barSize={26}>
            <CartesianGrid horizontal={false} stroke={gridStroke}/><XAxis type="number" axisLine={false} tickLine={false} tick={axisTick}/><YAxis type="category" dataKey="label" width={92} axisLine={false} tickLine={false} tick={axisTick}/>
            <Tooltip contentStyle={chartTooltip} cursor={{ fill: "#f8fafc" }} formatter={(value, _name, item) => [`${num(Number(value))} fırsat · önceki aşamadan geçiş ${pct(item.payload.conversion_from_previous)}`, "Ulaşan"]}/>
            <Bar dataKey="deals" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {funnelData.map(step => <Cell key={step.stage} fill={step.fill}/>)}
              <LabelList dataKey="conversion_from_previous" position="right" formatter={(value: unknown) => value === null || value === undefined ? "" : pct(Number(value))} style={{ fontSize: 11, fill: "#475569" }}/>
            </Bar>
          </BarChart></ResponsiveContainer>
        </div>
        <p className={styles.note}>Çubuk sonundaki oran, bir önceki aşamadan bu aşamaya geçen fırsatların payıdır.</p>
      </Panel>
      <Panel title="Kanala Göre Fırsat Başına Gelir" description="Kazanılan gelir / sonuçlanmış fırsat sayısı · USD">
        <div className={css("chart-wrap")} role="img" aria-label={sourceData.map(source => `${source.label}: ${formatMoney(source.revenue_per_deal ?? 0)}`).join(", ")}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={sourceData} layout="vertical" margin={{ top: 12, right: 24, left: 8, bottom: 4 }} barSize={22}>
            <CartesianGrid horizontal={false} stroke={gridStroke}/><XAxis type="number" axisLine={false} tickLine={false} tick={axisTick}/><YAxis type="category" dataKey="label" width={86} axisLine={false} tickLine={false} tick={axisTick}/>
            <Tooltip contentStyle={chartTooltip} cursor={{ fill: "#f8fafc" }} formatter={value => [formatMoney(Number(value)), "Fırsat başına gelir"]}/>
            <Bar dataKey="revenue_per_deal" radius={[0, 4, 4, 0]} isAnimationActive={false}>{sourceData.map(source => <Cell key={source.label} fill={source.label === "Bilinmiyor" ? "#cbd5e1" : "#818cf8"}/>)}</Bar>
          </BarChart></ResponsiveContainer>
        </div>
        <p className={styles.note}>Fırsat başına gelir, kanala ayrılan satış eforunun getirisini karşılaştırmanın en doğrudan ölçüsüdür.</p>
      </Panel>
    </div>
    <div className={styles.stack}><Panel title="Kanal Karşılaştırması" description="Huni geçişleri, kazanma oranı, satış tutarı ve hız">
      <div className={`${styles.tableWrap} ${css("table-scroll")}`} role="region" aria-label="Kanal karşılaştırması" tabIndex={0}><table>
        <thead><tr><th scope="col">Kanal</th><th scope="col" className={css("numeric")}>Fırsat</th><th scope="col" className={css("numeric")}>Nitelendirmeye</th><th scope="col" className={css("numeric")}>Teklife</th><th scope="col" className={css("numeric")}>Müzakereye</th><th scope="col">Kazanma oranı</th><th scope="col" className={css("numeric")}>Ort. satış</th><th scope="col">Fırsat başına gelir</th><th scope="col" className={css("numeric")}>Medyan süre</th></tr></thead>
        <tbody>{sources.map(source => <tr key={source.lead_source}>
          <td><strong>{source.lead_source}</strong></td><td className={css("numeric")}>{num(source.deals)}</td>
          <td className={css("numeric")}>{pct(source.to_qualification)}</td><td className={css("numeric")}>{pct(source.to_proposal)}</td><td className={css("numeric")}>{pct(source.to_negotiation)}</td>
          <td><RateBar value={source.win_rate ?? 0} max={0.5}/>{pct(source.win_rate)}</td><td className={css("numeric")}>{formatMoney(source.avg_won_value ?? 0)}</td>
          <td><RateBar value={source.revenue_per_deal ?? 0} max={maxRevenue} tone="good"/>{formatMoney(source.revenue_per_deal ?? 0)}</td><td className={css("numeric")}>{num(source.median_cycle_days)} gün</td>
        </tr>)}</tbody>
      </table></div>
      <p className={styles.note}>Ortalama satış tutarı kanallar arasında benzer; fark büyük ölçüde kazanma oranından ve hızdan geliyor. Yani kanal kalitesi, satılan ürünün büyüklüğünden daha belirleyici.</p>
    </Panel></div>
    <Panel title="Kayıp Nedenleri" description="Fırsatın kaybedildiği aşamaya göre kayıp nedenlerinin dağılımı">
      <div className={styles.row} style={{ padding: "8px 22px 18px", marginBottom: 0 }}>
        {stages.map(stage => <div key={stage ?? "?"}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: "6px 0 10px" }}>{stageName(stage)} aşamasında kaybedilenler</h3>
          <table><tbody>{lossReasons.filter(row => row.lost_at_stage === stage).map(row => <tr key={row.reason}>
            <td style={{ width: "42%" }}>{row.reason}</td><td><RateBar value={row.share_in_stage ?? 0} tone={row.reason === "Belirtilmedi" ? "default" : "bad"}/>{pct(row.share_in_stage)}</td><td className={css("numeric")}>{num(row.deals)}</td>
          </tr>)}</tbody></table>
        </div>)}
      </div>
      <p className={styles.note}>Erken aşamalarda kayıpların çoğu &quot;yanıt yok&quot; ve &quot;ihtiyaç yok&quot;: bunlar niteleme sorunudur. Teklif ve müzakerede ise fiyat ve rakip öne çıkıyor: bunlar değer anlatımı ve fiyatlandırma sorunudur. &quot;Belirtilmedi&quot; payı, kayıp nedeni alanının veri kalitesini gösterir.</p>
    </Panel>
    <Method sql={["01_huni.sql", "02_kanal_performansi.sql", "05_kayip_nedenleri.sql"]} notebook="01_kesifsel_analiz.ipynb">
      Huni yalnızca sonuçlanmış fırsatlarla hesaplanır; açık fırsatlar henüz huniyi tamamlamadığı için dahil edilseler oranları olduğundan düşük gösterirdi.
    </Method>
  </main>;
}
