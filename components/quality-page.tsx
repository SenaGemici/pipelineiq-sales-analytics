"use client";

import { useMemo, useState } from "react";
import { useCrm } from "./crm-provider";
import { OpportunityEditor } from "./opportunity-editor";
import { Kpi, StageBadge } from "./dashboard";
import { EmptyState, Notice, PageHeading, SearchField, ShowMore, usePaged } from "./crm-ui";
import { dashboardClass as css } from "./dashboard-styles";
import styles from "./crm.module.css";
import { overallQuality, qualityRules } from "@/lib/quality";
import { asOfDate } from "@/lib/seed";
import { isOpen } from "@/lib/selectors";
import { formatNumber, stageLabels } from "@/lib/presentation";

const PAGE = 50;
export function QualityPage() {
  const { state, viewById, formatMoney, formatDate } = useCrm();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [code, setCode] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const quality = useMemo(() => overallQuality(state.opportunities), [state.opportunities]);
  const normalized = query.toLocaleLowerCase("tr-TR");
  const records = useMemo(() => quality.problematic.filter(record => {
    const view = viewById.get(record.opportunity.id);
    return (severity === "all" || record.severity === severity) && (code === "all" || record.issues.some(issue => issue.code === code))
      && `${view?.company} ${view?.product} ${view?.owner} ${record.opportunity.id}`.toLocaleLowerCase("tr-TR").includes(normalized);
  }).sort((a, b) => a.severity === b.severity ? a.score - b.score || (b.age ?? 0) - (a.age ?? 0) : a.severity === "critical" ? -1 : 1),
  [quality, viewById, severity, code, normalized]);
  const { visible, remaining, more } = usePaged(records, PAGE, `${query}|${severity}|${code}`);
  const atRisk = quality.problematic.filter(record => isOpen(record.opportunity)).reduce((sum, record) => sum + (viewById.get(record.opportunity.id)?.amount ?? 0), 0);
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Veri Kalitesi" description="Eksik, sahipsiz ve güncelliğini yitirmiş kayıtları bulun; raporlarınızı güvenilir tutun."/>
    <dl className={css("kpi-strip")} aria-label="Veri kalitesi özeti">
      <Kpi title="Genel Kalite Skoru" value={`${formatNumber(quality.score, 1)}/100`} detail={`${formatNumber(state.opportunities.length)} fırsatın ortalama puanı`} explanation="Her fırsat 100 puanla başlar. Kurallara takılan her sorun puan düşürür. Genel skor tüm fırsatların aritmetik ortalamasıdır."/>
      <Kpi title="Sorunlu Fırsatlar" value={formatNumber(quality.problematic.length)} detail={`Kayıtların %${formatNumber(quality.problematic.length / Math.max(1, state.opportunities.length) * 100, 1)} kadarı`}/>
      <Kpi title="Kritik Kayıtlar" value={formatNumber(quality.critical)} detail="Şirketi, sorumlusu veya kazanılan tutarı eksik"/>
      <Kpi title="Risk Altındaki Pipeline" value={`≈ ${formatMoney(atRisk)}`} detail="Sorunlu açık fırsatların tutarı"/>
    </dl>
    {notice && <Notice>{notice}</Notice>}
    <div className={styles.toolbar}><SearchField value={query} onChange={setQuery} label="Sorunlu fırsatlarda ara" placeholder="Şirket, ürün, sorumlu veya fırsat no…"/>
      <label className={styles.filter}>Sorun türü<select aria-label="Sorun türü filtresi" value={code} onChange={e => setCode(e.target.value)}><option value="all">Tüm sorunlar</option>{qualityRules.map(rule => <option key={rule.code} value={rule.code}>{rule.label} ({formatNumber(quality.byCode[rule.code])})</option>)}</select></label>
      <label className={styles.filter}>Önem derecesi<select aria-label="Önem derecesi filtresi" value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">Tümü</option><option value="critical">Kritik</option><option value="warning">Uyarı</option></select></label></div>
    <div className={styles.tableBox}><div className={styles.tableScroll} role="region" aria-label="Veri kalitesi sorunları" tabIndex={0}><table><thead><tr><th scope="col">Şirket / Fırsat</th><th scope="col">Aşama</th><th scope="col">Puan</th><th scope="col">Önem</th><th scope="col">Sorunlar</th><th scope="col">İşlem</th></tr></thead><tbody>{visible.map(record => {
      const op = viewById.get(record.opportunity.id)!;
      return <tr key={op.id} data-quality-opportunity={op.id}><td><strong className={op.companyId ? undefined : styles.missing}>{op.company}</strong><small className={styles.rowSubtext}>{op.product} · {op.id} · {op.owner}</small></td><td><StageBadge stage={op.stage}/></td><td><span className={styles.score}>{record.score}<span className={styles.scoreTrack} aria-hidden="true"><span style={{ width: `${record.score}%` }}/></span></span></td><td><span className={`${styles.badge} ${record.severity === "critical" ? styles.critical : styles.warning}`}>{record.severity === "critical" ? "Kritik" : "Uyarı"}</span></td><td><ul className={styles.issueList}>{record.issues.map(issue => <li key={issue.code}>{issue.code === "stalled" && record.age !== null ? `${record.age} gündür ${stageLabels[record.opportunity.stage].toLocaleLowerCase("tr-TR")} aşamasında` : issue.label}</li>)}</ul></td><td><button type="button" className={styles.rowLink} aria-label={`${op.id} fırsatını düzelt`} onClick={() => setSelected(op.id)}>Düzelt</button></td></tr>;
    })}</tbody></table>{!records.length && <EmptyState>{quality.problematic.length ? "Seçtiğiniz filtrelere uygun sorun bulunamadı." : "Tüm fırsatlar eksiksiz ve güncel. Veri kaliteniz 100/100."}</EmptyState>}</div>
      <div className={styles.tableFooterAction}><ShowMore remaining={remaining} step={PAGE} onClick={more}/></div>
      <div className={css("table-footer")}><span>{formatNumber(records.length)} sorunlu fırsattan {formatNumber(visible.length)} tanesi gösteriliyor</span><span>Analiz tarihi: {formatDate(asOfDate)}</span></div></div>
    <details className={styles.rules} open><summary>Kalite kuralları</summary><ul>{qualityRules.map(rule => <li key={rule.code}><strong>{rule.label}</strong> · −{rule.penalty} puan · {rule.severity === "critical" ? "Kritik" : "Uyarı"} · {formatNumber(quality.byCode[rule.code])} kayıt. {rule.description}</li>)}</ul><p>Puan 0–100 aralığında tutulur. Birden fazla sorunu olan kayıt sorunlu fırsat sayısına bir kez girer. Güncellik kuralları sabit analiz tarihine ({formatDate(asOfDate)}) göre çalışır.</p></details>
    {selected && <OpportunityEditor key={selected} opportunity={state.opportunities.find(op => op.id === selected)} startEditing onClose={() => setSelected(null)} onSaved={() => setNotice("Fırsat düzeltildi. Veri kalitesi puanı yeniden hesaplandı.")}/>}
  </main>;
}
