"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCrm } from "../crm-provider";
import { Kpi, Panel } from "../dashboard";
import { PageHeading } from "../crm-ui";
import { dashboardClass as css } from "../dashboard-styles";
import crmStyles from "../crm.module.css";
import { analysis, axisTick, chartTooltip, gridStroke, Method, num, pct, RateBar, series } from "./shared";
import styles from "./analysis.module.css";

type Sort = "adjusted" | "raw" | "revenue";

/** Kazanma oranının %95 güven aralığı; dikey çizgi şirket ortalaması. */
function ConfidenceInterval({ low, high, point, average, scale = 0.5 }: { low: number; high: number; point: number; average: number; scale?: number }) {
  const at = (value: number) => `${Math.min(100, value / scale * 100)}%`;
  const tone = high < average ? styles.below : low > average ? styles.above : "";
  return <span className={styles.ci} aria-label={`${pct(low)} – ${pct(high)}`}>
    <span className={styles.ciTrack}/><span className={`${styles.ciRange} ${tone}`} style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }}/>
    <span className={styles.ciAverage} style={{ left: at(average) }}/><span className={styles.ciPoint} style={{ left: at(point) }}/>
  </span>;
}

export function PerformancePage() {
  const { formatMoney } = useCrm();
  const [sort, setSort] = useState<Sort>("adjusted");
  const { reps, discount, products, overallWinRate } = analysis;
  const ranked = useMemo(() => {
    const rawRank = new Map([...reps].sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0)).map((rep, index) => [rep.sales_agent, index + 1]));
    const adjustedRank = new Map([...reps].sort((a, b) => (b.mix_adjusted_index ?? 0) - (a.mix_adjusted_index ?? 0)).map((rep, index) => [rep.sales_agent, index + 1]));
    const key: Record<Sort, (rep: (typeof reps)[number]) => number> = { adjusted: rep => rep.mix_adjusted_index ?? 0, raw: rep => rep.win_rate ?? 0, revenue: rep => rep.revenue ?? 0 };
    return reps.map(rep => ({ ...rep, rawRank: rawRank.get(rep.sales_agent!)!, adjustedRank: adjustedRank.get(rep.sales_agent!)! })).sort((a, b) => key[sort](b) - key[sort](a));
  }, [reps, sort]);
  const below = reps.filter(rep => (rep.ci_high ?? 1) < overallWinRate);
  const mover = ranked.reduce((best, rep) => Math.abs(rep.rawRank - rep.adjustedRank) > Math.abs(best.rawRank - best.adjustedRank) ? rep : best, ranked[0]);
  const discountData = discount.map(band => ({ ...band, winRate: (band.win_rate ?? 0) * 100, priceRatio: (band.realized_price_ratio ?? 0) * 100, expected: (band.expected_revenue_ratio ?? 0) * 100 }));
  const bestBand = discount.reduce((best, band) => (band.expected_revenue_ratio ?? 0) > (best.expected_revenue_ratio ?? 0) ? band : best, discount[0]);
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Ekip Performansı" description="Temsilcileri fırsat karışımından arındırılmış ölçülerle karşılaştırın; indirim ve ürün kararlarının gelire etkisini görün."/>
    <dl className={css("kpi-strip")} aria-label="Performans özeti">
      <Kpi title="Şirket Kazanma Oranı" value={pct(overallWinRate, 1)} detail="Sonuçlanmış tüm fırsatlar"/>
      <Kpi title="Ortalamanın Anlamlı Altında" value={`${below.length} temsilci`} detail="Güven aralığının üst sınırı bile ortalamanın altında"
        explanation="Wilson %95 güven aralığı. Az fırsatı olan temsilcilerde aralık geniştir; bu yüzden yalnızca aralığın tamamı ortalamanın altında kalanlar işaretlenir."/>
      <Kpi title="En Büyük Sıra Değişimi" value={`${Math.abs(mover.rawRank - mover.adjustedRank)} sıra`} detail={`${mover.sales_agent}: ${mover.rawRank}. → ${mover.adjustedRank}.`}
        explanation="Ham kazanma oranı sıralaması ile ürün ve kanal karışımına göre düzeltilmiş sıralama arasındaki en büyük fark."/>
      <Kpi title="En Verimli İndirim" value={bestBand.discount_band ?? "—"} detail={`Liste fiyatının her dolarından ${pct(bestBand.expected_revenue_ratio)} gelir`}/>
    </dl>
    <p className={styles.callout}><strong>Neden ham kazanma oranı yetmez?</strong> Soğuk arama (Outbound) ağırlıklı çalışan bir temsilcinin fırsatları, referansla gelen fırsatlara göre çok daha düşük oranla kazanılır; bu, temsilcinin becerisinden bağımsızdır. Düzeltilmiş endeks, her fırsat için aynı ürün ve kanaldaki şirket ortalamasını &quot;beklenen&quot; kabul eder ve temsilcinin gerçekleşen kazancını bununla kıyaslar. 1,20 = beklenenden %20 fazla kazanç.</p>
    <div className={styles.stack}><Panel title="Satış Temsilcileri" description="Sonuçlanmış fırsatlar · dikey gri çizgi şirket ortalaması"
      action={<label className={css("select-control")}><span className={css("sr-only")}>Sıralama</span><select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="adjusted">Düzeltilmiş endekse göre</option><option value="raw">Ham kazanma oranına göre</option><option value="revenue">Gelire göre</option></select></label>}>
      <div className={`${styles.tableWrap} ${css("table-scroll")}`} role="region" aria-label="Temsilci performansı" tabIndex={0}><table>
        <thead><tr><th scope="col">Temsilci</th><th scope="col" className={css("numeric")}>Fırsat</th><th scope="col">Kazanma oranı ve %95 güven aralığı</th><th scope="col" className={css("numeric")}>Gerçekleşen / beklenen</th><th scope="col" className={css("numeric")}>Düzeltilmiş endeks</th><th scope="col" className={css("numeric")}>Sıra (ham → düzeltilmiş)</th><th scope="col" className={css("numeric")}>Gelir</th><th scope="col" className={css("numeric")}>Ort. indirim</th></tr></thead>
        <tbody>{ranked.map(rep => { const significant = (rep.ci_high ?? 1) < overallWinRate; const shift = rep.rawRank - rep.adjustedRank; return <tr key={rep.sales_agent}>
          <td><strong>{rep.sales_agent}</strong><span className={styles.muted}>{rep.manager} · {rep.regional_office}</span></td>
          <td className={css("numeric")}>{num(rep.deals)}</td>
          <td><ConfidenceInterval low={rep.ci_low ?? 0} high={rep.ci_high ?? 0} point={rep.win_rate ?? 0} average={overallWinRate}/> {pct(rep.win_rate, 1)}{significant && <span className={`${crmStyles.badge} ${crmStyles.critical}`} style={{ marginLeft: 8 }}>Anlamlı düşük</span>}</td>
          <td className={css("numeric")}>{num(rep.won)} / {num(rep.expected_won, 1)}</td>
          <td className={`${css("numeric")} ${(rep.mix_adjusted_index ?? 1) >= 1 ? styles.positive : styles.negative}`}><strong>{num(rep.mix_adjusted_index, 2)}</strong></td>
          <td className={css("numeric")}>{rep.rawRank}. → {rep.adjustedRank}. {shift !== 0 && <span className={shift > 0 ? styles.positive : styles.negative}>({shift > 0 ? "▲" : "▼"}{Math.abs(shift)})</span>}</td>
          <td className={css("numeric")}>{formatMoney(rep.revenue ?? 0)}</td><td className={css("numeric")}>%{num(rep.avg_discount, 1)}</td>
        </tr>; })}</tbody>
      </table></div>
      <p className={styles.note}>Beklenen kazanç = temsilcinin her fırsatı için aynı ürün ve kanaldaki şirket kazanma oranlarının toplamı. Henüz fırsatı olmayan yeni temsilciler listede yer almaz.</p>
    </Panel></div>
    <div className={styles.row}>
      <Panel title="İndirimin Etkisi" description="Müzakereye ulaşmış fırsatlar, teklif indirimi dilimine göre · %">
        <div className={css("chart-wrap")} role="img" aria-label={discountData.map(band => `${band.discount_band}: kazanma %${band.winRate.toFixed(0)}, beklenen gelir %${band.expected.toFixed(0)}`).join("; ")}>
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={discountData} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={gridStroke}/><XAxis dataKey="discount_band" axisLine={false} tickLine={false} tick={axisTick}/><YAxis width={40} domain={[0, 100]} tickFormatter={v => `%${v}`} axisLine={false} tickLine={false} tick={axisTick}/>
            <Tooltip contentStyle={chartTooltip} formatter={(value, name) => [`%${Number(value).toFixed(1)}`, name]}/>
            <Bar dataKey="winRate" name="Kazanma oranı" fill="#c7d2fe" radius={[4, 4, 0, 0]} isAnimationActive={false}/>
            <Line dataKey="priceRatio" name="Gerçekleşen fiyat / liste" stroke={series.stage} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}/>
            <Line dataKey="expected" name="Beklenen gelir oranı" stroke={series.model} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false}/>
          </ComposedChart></ResponsiveContainer>
        </div>
        <div className={styles.legend}><span><i style={{ background: "#c7d2fe", height: 8 }}/>Kazanma oranı</span><span><i style={{ background: series.stage }}/>Gerçekleşen fiyat / liste</span><span><i style={{ background: series.model }}/>Beklenen gelir oranı</span></div>
        <p className={styles.note}>Beklenen gelir oranı = kazanma oranı × gerçekleşen fiyat oranı: liste fiyatının her dolarından ortalama ne kadar gelir elde edildiği. Zirvesi {bestBand.discount_band} diliminde; daha yüksek indirim kazanma oranını artırmadan fiyatı düşürüyor. Bu bir gözlemsel analizdir: yüksek indirim verilen fırsatlar zaten zor fırsatlar olabilir, bu yüzden kesin nedensellik için A/B testi gerekir.</p>
      </Panel>
      <Panel title="Ürün Performansı" description="Sonuçlanmış fırsatlar · satış süresi oluşturmadan kazanmaya">
        <div className={`${styles.tableWrap} ${css("table-scroll")}`}><table>
          <thead><tr><th scope="col">Ürün</th><th scope="col" className={css("numeric")}>Liste fiyatı</th><th scope="col">Kazanma</th><th scope="col" className={css("numeric")}>Gelir</th><th scope="col" className={css("numeric")}>Medyan / P90 süre</th></tr></thead>
          <tbody>{products.map(product => <tr key={product.product}>
            <td><strong>{product.product}</strong><span className={styles.muted}>{product.series} · {num(product.deals)} fırsat</span></td>
            <td className={css("numeric")}>{formatMoney(product.list_price ?? 0)}</td><td><RateBar value={product.win_rate ?? 0} max={0.5}/>{pct(product.win_rate)}</td>
            <td className={css("numeric")}>{formatMoney(product.revenue ?? 0)}</td><td className={css("numeric")}>{num(product.median_cycle_days)} / {num(product.p90_cycle_days)} gün</td>
          </tr>)}</tbody>
        </table></div>
      </Panel>
    </div>
    <Method sql={["06_temsilci_performansi.sql", "07_indirim_etkisi.sql", "08_urun_ve_satis_suresi.sql"]} notebook="01_kesifsel_analiz.ipynb">
      Güven aralığı Wilson yöntemiyle hesaplanır; küçük örneklemlerde normal yaklaşımdan daha güvenilirdir.
    </Method>
  </main>;
}
