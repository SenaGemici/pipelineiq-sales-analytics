"use client";

import { ArrowRight } from "lucide-react";
import { useCrm } from "../crm-provider";
import { Kpi } from "../dashboard";
import { PageHeading } from "../crm-ui";
import { dashboardClass as css } from "../dashboard-styles";
import { analysis, InsightLink, Method, pct } from "./shared";
import styles from "./analysis.module.css";

const pageNames: Record<string, string> = { "/tahmin": "Satış Tahmini", "/satis-suresi": "Satış Süresi", "/huni": "Huni ve Kanallar", "/performans": "Ekip Performansı" };

export function InsightsPage() {
  const { formatMoney } = useCrm();
  const { forecast, backtest, horizonDays, insights } = analysis;
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Bulgular ve Öneriler" description={`CRM verisinden çıkan, satış kararlarını doğrudan etkileyen ${insights.length} bulgu. Her bulgu ayrıntılı analiz ekranına bağlanır.`}/>
    <dl className={css("kpi-strip")} aria-label="Yönetici özeti">
      <Kpi title={`${horizonDays} Günlük Gelir Tahmini`} value={formatMoney(forecast.model)} detail="Kazanma modeli ile"
        explanation={`Açık fırsatların önümüzdeki ${horizonDays} gün içinde kazanılma olasılığı × tahmini tutar toplamı.`}/>
      <Kpi title="Standart Yöntemin Tahmini" value={formatMoney(forecast.stage)} detail={`Modelin ${(forecast.stage / forecast.model).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} katı`}
        explanation="CRM'lerin varsayılan 'aşamaya göre ağırlıklı pipeline' hesabı: tutar × aşamanın tarihsel kazanma oranı."/>
      <Kpi title="Geçmişteki Tahmin Hatası" value={`${pct(backtest.errors.model.mape)} / ${pct(backtest.errors.stage.mape)}`} detail="Model / standart yöntem"
        explanation={`Son ${backtest.rows.length} ayın her başında yapılmış tahminlerin, sonraki ${horizonDays} günde gerçekleşen gelirden ortalama mutlak sapması.`}/>
      <Kpi title="Takılmış Pipeline" value={formatMoney(forecast.stalledPipeline)} detail={`${forecast.stalledDeals} / ${forecast.openDeals} açık fırsat`}
        explanation="Bulunduğu aşamada, o aşamadan çıkan fırsatların %90'ından uzun süre bekleyen fırsatların toplam tutarı."/>
    </dl>
    <div className={styles.insights}>
      {insights.map((insight, index) => <article key={insight.id} className={styles.insight} aria-labelledby={`insight-${insight.id}`}>
        <div className={styles.insightHead}><span className={styles.insightNumber}>{index + 1}</span><h2 id={`insight-${insight.id}`}>{insight.title}</h2></div>
        <p className={styles.insightMetric}>{insight.metric}</p>
        <p>{insight.finding}</p>
        <p className={styles.recommendation}><strong>Öneri: </strong>{insight.recommendation}</p>
        <InsightLink href={insight.page}>{pageNames[insight.page] ?? "Ayrıntılar"} ekranında incele <ArrowRight size={13} style={{ display: "inline", verticalAlign: "-2px" }}/></InsightLink>
      </article>)}
    </div>
    <Method sql={["01_huni.sql", "02_kanal_performansi.sql", "06_temsilci_performansi.sql", "07_indirim_etkisi.sql"]} notebook="02_kazanma_modeli.ipynb">
      Bulgu metinleri sabit yazılmadı; <code className={styles.code}>pipeline/analyze.py</code> her çalıştırmada sayıları hesaplayıp metni bunlardan üretir.
    </Method>
  </main>;
}
