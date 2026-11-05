"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { useCrm } from "../crm-provider";
import { Kpi, Panel, StageBadge } from "../dashboard";
import { PageHeading, ShowMore, usePaged } from "../crm-ui";
import { dashboardClass as css } from "../dashboard-styles";
import { formatAxis } from "@/lib/presentation";
import { isOpen, isStalled } from "@/lib/selectors";
import type { ForecastMethod } from "@/lib/analysis-types";
import { analysis, axisTick, chartTooltip, gridStroke, Method, methodLabels, num, pct, RateBar, series } from "./shared";
import styles from "./analysis.module.css";

const methods: ForecastMethod[] = ["model", "stage", "naive"];
const monthLabel = (date: string) => new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export function ForecastPage() {
  const { opportunities, formatMoney } = useCrm();
  const [filter, setFilter] = useState<"all" | "stalled" | "active">("all");
  const { forecast, backtest, model, horizonDays, scores } = analysis;
  const backtestData = backtest.rows.map(row => ({ ...row, label: monthLabel(row.cutoff) }));
  const calibration = model.calibration.map(bin => ({ predicted: bin.predicted * 100, actual: bin.actual * 100, n: bin.n }));
  // Eksenler 20'nin katına yuvarlanır; iki eksen aynı ölçekte olmalı ki köşegen "mükemmel kalibrasyon" çizgisi olsun.
  const calibrationMax = Math.ceil(Math.max(...calibration.flatMap(bin => [bin.predicted, bin.actual])) / 20) * 20;
  const calibrationTicks = Array.from({ length: calibrationMax / 20 + 1 }, (_, index) => index * 20);
  const coefficients = model.coefficients.filter(row => row.group !== "product").map(row => ({ ...row, label: row.level, effect: row.oddsRatio }));
  // Açık fırsatlar: model olasılığı ile CRM'in aşama olasılığı yan yana. Skorlar temel veriden hesaplandığı için yalnızca skoru olan kayıtlar listelenir.
  const scored = useMemo(() => opportunities.filter(op => isOpen(op) && scores[op.id])
    .map(op => ({ op, model: scores[op.id][0], stage: scores[op.id][1], stalled: isStalled(op) }))
    .filter(row => filter === "all" || (filter === "stalled") === row.stalled)
    .sort((a, b) => b.op.amount * b.model - a.op.amount * a.model), [opportunities, scores, filter]);
  const { visible, remaining, more } = usePaged(scored, 15, filter);
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Satış Tahmini" description={`Açık pipeline'dan önümüzdeki ${horizonDays} günde ne kadar gelir beklenmeli? Üç yöntem, geçmişte nasıl performans gösterdikleriyle birlikte.`}/>
    <dl className={css("kpi-strip")} aria-label="Tahmin özeti">
      <Kpi title="Kazanma Modeli" value={formatMoney(forecast.model)} detail={`Geçmiş hata ${pct(backtest.errors.model.mape)}`} explanation="Tutar × lojistik regresyon modelinin 'önümüzdeki 120 günde kazanılma' olasılığı."/>
      <Kpi title="Aşama Olasılığı" value={formatMoney(forecast.stage)} detail={`Geçmiş hata ${pct(backtest.errors.stage.mape)}`} explanation="CRM'lerin standart ağırlıklı pipeline hesabı: tutar × aşamaya ulaşmış fırsatların tarihsel kazanma oranı."/>
      <Kpi title="Genel Kazanma Oranı" value={formatMoney(forecast.naive)} detail={`Geçmiş hata ${pct(backtest.errors.naive.mape)}`} explanation="Tüm açık pipeline × şirketin genel kazanma oranı."/>
      <Kpi title="Açık Pipeline" value={formatMoney(forecast.pipeline)} detail={`${num(forecast.openDeals)} açık fırsat`} explanation="Açık fırsatların tahmini tutarlarının ağırlıksız toplamı."/>
    </dl>
    <p className={styles.callout}><strong>Neden bu kadar fark var?</strong> Aşama olasılığı yöntemi bir fırsatın yalnızca hangi aşamada olduğuna bakar. Oysa açık fırsatların {pct(forecast.stalledDeals / forecast.openDeals)} kadarı aylardır aynı aşamada bekliyor ve bunların kazanılma olasılığı çok düşük (model: ortalama {pct(forecast.avgProbabilityStalled, 1)}). Model aşamada geçen süreyi, fırsat yaşını, kanalı, ürünü, temsilciyi ve indirimi birlikte değerlendirdiği için bu fırsatları doğru şekilde düşük puanlıyor.</p>
    <div className={styles.stack}><Panel title="Geriye Dönük Test" description={`Her ayın başında o gün açık olan fırsatlar için yapılmış tahmin ve sonraki ${horizonDays} günde gerçekleşen gelir · USD`}>
      <div className={css("chart-wrap")} style={{ height: 320 }} role="img" aria-label={backtestData.map(row => `${row.label}: gerçekleşen ${formatMoney(row.actual)}, model ${formatMoney(row.model)}, aşama ${formatMoney(row.stage)}`).join("; ")}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={backtestData} margin={{ top: 16, right: 24, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={gridStroke}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick}/><YAxis width={64} tickFormatter={formatAxis} axisLine={false} tickLine={false} tick={axisTick}/>
          <Tooltip contentStyle={chartTooltip} formatter={(value, name) => [formatMoney(Number(value)), name]}/>
          <Line dataKey="actual" name="Gerçekleşen" stroke={series.actual} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false}/>
          <Line dataKey="model" name={methodLabels.model} stroke={series.model} strokeWidth={2} dot={false} isAnimationActive={false}/>
          <Line dataKey="stage" name={methodLabels.stage} stroke={series.stage} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false}/>
          <Line dataKey="naive" name={methodLabels.naive} stroke={series.naive} strokeWidth={1.5} strokeDasharray="2 4" dot={false} isAnimationActive={false}/>
        </LineChart></ResponsiveContainer>
      </div>
      <div className={styles.legend}>{[["Gerçekleşen", series.actual], [methodLabels.model, series.model], [methodLabels.stage, series.stage], [methodLabels.naive, series.naive]].map(([label, color]) => <span key={label}><i style={{ background: color }}/>{label}</span>)}</div>
      <div className={`${styles.tableWrap} ${css("table-scroll")}`}><table>
        <thead><tr><th scope="col">Yöntem</th><th scope="col">Ortalama mutlak hata (MAPE)</th><th scope="col" className={css("numeric")}>Ortalama sapma</th><th scope="col">Yorum</th></tr></thead>
        <tbody>{methods.map(method => <tr key={method}><td><strong>{methodLabels[method]}</strong></td>
          <td><RateBar value={backtest.errors[method].mape} max={Math.max(...methods.map(m => backtest.errors[m].mape))} tone={method === "model" ? "good" : "bad"}/>{pct(backtest.errors[method].mape, 1)}</td>
          <td className={css("numeric")}>{backtest.errors[method].bias > 0 ? "+" : ""}{pct(backtest.errors[method].bias, 1)}</td>
          <td>{method === "model" ? "Takılmış fırsatları düşük puanladığı için gerçeğe en yakın" : method === "stage" ? "Takılmış fırsatları aktif fırsatlar gibi saydığı için sistematik olarak çok yüksek" : "Aşamayı da hesaba katmadığı için kaba ama aşama yönteminden daha az yanlı"}</td></tr>)}</tbody>
      </table></div>
      <p className={styles.note}>Sızıntı yok: her tarihteki model yalnızca o tarihte bilinen veriyle eğitildi ve yalnızca o tarihte bilinen alanları kullandı (o günkü aşama, aşamada geçen süre, o güne kadar verilmiş indirim). Pozitif sapma, modelin de bir miktar fazla tahmin ettiğini gösteriyor; ilk aylarda eğitim verisinin az olması bunun bir nedeni.</p>
    </Panel></div>
    <div className={styles.row}>
      <Panel title="Model Doğrulaması" description={`Zamana göre ayrılmış test: ${model.trainEnd} öncesiyle eğitim, sonrasında test`}>
        <div className={`${styles.tableWrap} ${css("table-scroll")}`}><table>
          <thead><tr><th scope="col">Ölçüt</th><th scope="col" className={css("numeric")}>Model</th><th scope="col" className={css("numeric")}>Aşama oranı</th></tr></thead>
          <tbody>
            <tr><td>ROC AUC <span className={styles.muted}>Kazanılacak ve kazanılmayacak fırsatları ayırt etme (0,5 = rastgele)</span></td><td className={css("numeric")}><strong>{num(model.auc, 3)}</strong></td><td className={css("numeric")}>{num(model.aucStage, 3)}</td></tr>
            <tr><td>Brier skoru <span className={styles.muted}>Olasılık tahminlerinin ortalama karesel hatası (düşük daha iyi)</span></td><td className={css("numeric")}><strong>{num(model.brier, 4)}</strong></td><td className={css("numeric")}>{num(model.brierStage, 4)}</td></tr>
            <tr><td>Test örneği <span className={styles.muted}>Fırsat × aşama içi kontrol noktası</span></td><td className={css("numeric")} colSpan={2}>{num(model.testRows)} (eğitim {num(model.trainRows)})</td></tr>
            <tr><td>Test dönemindeki gerçek oran</td><td className={css("numeric")} colSpan={2}>{pct(model.baseRate, 1)}</td></tr>
          </tbody>
        </table></div>
        <p className={styles.note}>Model: lojistik regresyon (L2 düzenlileştirme). Hedef &quot;önümüzdeki {horizonDays} günde kazanıldı mı&quot;. Bu hedef sayesinde hiç kapanmayan, unutulmuş fırsatlar da eğitime &quot;kazanılmadı&quot; olarak girer; yalnızca sonuçlanmış fırsatlarla eğitmek sansürleme yanlılığı yaratırdı.</p>
      </Panel>
      <Panel title="Kalibrasyon" description="Tahmin edilen olasılık ile gerçekleşen oran (test seti, 10 dilim) · %">
        <div className={css("chart-wrap")} role="img" aria-label={calibration.map(bin => `tahmin %${bin.predicted.toFixed(0)}, gerçekleşen %${bin.actual.toFixed(0)}`).join("; ")}>
          <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={gridStroke}/><XAxis type="number" dataKey="predicted" name="Tahmin" domain={[0, calibrationMax]} ticks={calibrationTicks} tickFormatter={v => `%${Math.round(v)}`} tick={axisTick} axisLine={false} tickLine={false}/>
            <YAxis type="number" dataKey="actual" name="Gerçekleşen" domain={[0, calibrationMax]} ticks={calibrationTicks} width={44} tickFormatter={v => `%${Math.round(v)}`} tick={axisTick} axisLine={false} tickLine={false}/>
            <ZAxis dataKey="n" range={[40, 40]}/>
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: calibrationMax, y: calibrationMax }]} stroke="#cbd5e1" strokeDasharray="4 4" ifOverflow="hidden"/>
            <Tooltip contentStyle={chartTooltip} formatter={(value, name) => [`%${Number(value).toFixed(1)}`, name]}/>
            <Scatter data={calibration} fill={series.model} isAnimationActive={false}/>
          </ScatterChart></ResponsiveContainer>
        </div>
        <p className={styles.note}>Noktalar kesikli çizgiye yakınsa model olasılıkları güvenilirdir: &quot;%30&quot; dediği fırsatların gerçekten yaklaşık %30&apos;u kazanılır. Tahminin toplam gelire çevrilebilmesi için bu şarttır.</p>
      </Panel>
    </div>
    <div className={styles.stack}><Panel title="Kazanma Olasılığını Ne Belirliyor?" description="Odds oranları: 1'in üstü kazanma şansını artırır, altı azaltır">
      <div className={css("chart-wrap")} style={{ height: Math.max(260, coefficients.length * 26) }} role="img" aria-label={coefficients.map(row => `${row.label} (${row.reference} ile kıyasla): ${row.oddsRatio}`).join("; ")}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={coefficients} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 4 }} barSize={14}>
          <CartesianGrid horizontal={false} stroke={gridStroke}/><XAxis type="number" scale="log" domain={[0.3, 12]} ticks={[0.5, 1, 2, 4, 8]} tickFormatter={v => `${v}×`} axisLine={false} tickLine={false} tick={axisTick}/>
          <YAxis type="category" dataKey="label" width={130} axisLine={false} tickLine={false} tick={axisTick}/>
          <ReferenceLine x={1} stroke="#94a3b8"/>
          <Tooltip contentStyle={chartTooltip} cursor={{ fill: "#f8fafc" }} formatter={(value, _name, item) => [`${Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}× · ${item.payload.reference} ile kıyasla`, "Odds oranı"]}/>
          <Bar dataKey="effect" isAnimationActive={false} fill={series.model} radius={[0, 3, 3, 0]}/>
        </BarChart></ResponsiveContainer>
      </div>
      <p className={styles.note}>Aşamalar Potansiyel&apos;e, kanallar Web&apos;e göre karşılaştırılır. Sayısal değişkenlerde oran &quot;1 standart sapma artış&quot;ın etkisidir. Aşamada geçen süre ve fırsat yaşı arttıkça kazanma şansı düşüyor; takılmış fırsatları ayırt eden de bu iki değişken. Temsilci etkileri modelde var ama grafikte gösterilmiyor.</p>
    </Panel></div>
    <Panel title="Açık Fırsatların Skorları" description={`Beklenen gelire (tutar × model olasılığı) göre sıralı · olasılıklar önümüzdeki ${horizonDays} gün için`}
      action={<label className={css("select-control")}><span className={css("sr-only")}>Fırsat filtresi</span><select value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Tüm açık fırsatlar</option><option value="active">Aktif fırsatlar</option><option value="stalled">Takılmış fırsatlar</option></select></label>}>
      <div className={`${styles.tableWrap} ${css("table-scroll")}`} role="region" aria-label="Açık fırsat skorları" tabIndex={0}><table>
        <thead><tr><th scope="col">Fırsat</th><th scope="col">Aşama</th><th scope="col" className={css("numeric")}>Tutar</th><th scope="col">Aşama olasılığı</th><th scope="col">Model olasılığı</th><th scope="col" className={css("numeric")}>Beklenen gelir</th></tr></thead>
        <tbody>{visible.map(({ op, model: p, stage, stalled }) => <tr key={op.id}>
          <td><strong>{op.company}</strong><span className={styles.muted}>{op.id} · {op.product} · {op.owner}{stalled ? " · takılmış" : ""}</span></td>
          <td><StageBadge stage={op.stage}/></td><td className={css("numeric")}>≈ {formatMoney(op.amount)}</td>
          <td><RateBar value={stage} tone="bad"/>{pct(stage)}</td><td><RateBar value={p} tone="good"/>{pct(p)}</td>
          <td className={css("numeric")}>{formatMoney(op.amount * p)}</td>
        </tr>)}</tbody>
      </table></div>
      <div style={{ padding: "0 16px" }}><ShowMore remaining={remaining} step={15} onClick={more} label="fırsat"/></div>
      <p className={styles.note}>{num(scored.length)} fırsat listeleniyor. Model olasılığının aşama olasılığından çok düşük olduğu satırlar, satış ekibinin gözden geçirip kapatması gereken fırsatlardır.</p>
    </Panel>
    <Method sql={["03_asama_sureleri.sql"]} notebook="03_tahmin_geriye_donuk_test.ipynb">
      Model ve geriye dönük test <code className={styles.code}>pipeline/analytics.py</code> içinde; eğitim ve değerlendirme adımları <code className={styles.code}>notebooks/02_kazanma_modeli.ipynb</code> dosyasında açıklamalı olarak yer alıyor.
    </Method>
  </main>;
}
