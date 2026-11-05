"use client";

import { Kpi, Panel } from "./dashboard";
import { PageHeading } from "./crm-ui";
import { useCrm } from "./crm-provider";
import { dashboardClass as css } from "./dashboard-styles";
import styles from "./crm.module.css";
import { dataProfile } from "@/lib/generated/data-profile";
import type { StepKind } from "@/lib/dataset-types";
import { formatNumber, formatPercent } from "@/lib/presentation";

const kinds: Record<StepKind, { label: string; className: string }> = {
  fix: { label: "Düzeltildi", className: styles.kindFix },
  flag: { label: "İşaretlendi", className: styles.kindFlag },
  derive: { label: "Türetildi", className: styles.kindDerive },
  note: { label: "Bilgi", className: styles.kindNote },
};
const tableLabels: Record<string, string> = { accounts: "Şirketler", products: "Ürünler", sales_teams: "Satış ekibi", sales_pipeline: "Satış fırsatları" };

/** pipeline/build_dataset.py çıktısını gösterir: ham veri profili, temizlik günlüğü ve bütünlük kontrolleri. */
export function DataPrepPage() {
  const { formatDate } = useCrm();
  const { tables, steps, checks, metrics } = dataProfile;
  const rawRows = tables.reduce((sum, table) => sum + table.rawRows, 0);
  const fixedRows = steps.filter(step => step.kind === "fix").reduce((sum, step) => sum + step.rows, 0);
  const passed = checks.filter(check => check.failing === 0).length;
  const missingAccounts = steps.find(step => step.column === "account" && step.kind === "flag")?.rows ?? 0;
  const duplicateCompanies = steps.find(step => step.title === "Mükerrer şirketler birleştirildi")?.rows ?? 0;
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Veri Hazırlama" description="Ham CRM verisinin nasıl profillendiği, temizlendiği ve doğrulandığı. Tüm adımlar pipeline/build_dataset.py ile tekrarlanabilir."/>
    <dl className={css("kpi-strip")} aria-label="Veri hazırlama özeti">
      <Kpi title="Ham Kayıt" value={formatNumber(rawRows)} detail={`${tables.length} tablo · ${formatDate(metrics.dateRange[0])} – ${formatDate(metrics.dateRange[1])}`}/>
      <Kpi title="Düzeltilen Değer" value={formatNumber(fixedRows)} detail={`${steps.filter(step => step.kind === "fix").length} otomatik düzeltme kuralı`} explanation="Yazım hataları ve katalogla eşleşmeyen ürün adları gibi, anlamı değiştirmeden düzeltilebilen değerler."/>
      <Kpi title="Bütünlük Kontrolü" value={`${passed}/${checks.length}`} detail="Başarılı kontrol" explanation="Tekil kimlik, aşama/tarih tutarlılığı ve tablolar arası referans kontrolleri."/>
      <Kpi title="Takılmış Fırsat" value={formatNumber(metrics.stalled)} detail={`${formatNumber(metrics.engaging)} görüşmedeki fırsattan`} explanation={`Kazanılan fırsatların %90'ı ${metrics.cycleP90} gün içinde kapanmış. Görüşmedeki fırsatların medyan yaşı ise ${metrics.engagingAgeMedian} gün.`}/>
    </dl>
    <Panel title="Temel Bulgular" description="Temizlik sırasında ortaya çıkan, karar vericiye aktarılması gereken noktalar">
      <p className={styles.insight}><strong>Pipeline büyük ölçüde şişkin.</strong> Kazanılan fırsatların medyan satış süresi {metrics.cycleMedian} gün, %90&apos;ı ise {metrics.cycleP90} gün içinde kapanıyor. Buna karşın görüşmedeki fırsatların medyan yaşı {metrics.engagingAgeMedian} gün ve {formatNumber(metrics.engaging)} fırsatın {formatNumber(metrics.stalled)} tanesi bu eşiği aşmış. Bu kayıtlar ya kapatılmalı ya da güncellenmeli; aksi halde tahminler gerçeğin üzerinde kalır.</p>
      <p className={styles.insight}><strong>Açık fırsatların %{formatNumber(metrics.openMissingAccount / Math.max(1, metrics.open) * 100)}&apos;i hiçbir şirkete bağlı değil.</strong> Şirketi olmayan {formatNumber(missingAccounts)} kaydın {formatNumber(metrics.openMissingAccount)} tanesi açık aşamalarda. Kayıt girişinde şirket alanı zorunlu değil gibi görünüyor; bu, veriden önce süreç tarafında düzeltilmesi gereken bir sorun.</p>
      <p className={styles.insight}><strong>Mükerrer şirket kayıtları raporları bölüyor.</strong> {formatNumber(duplicateCompanies)} şirket farklı yazımla ikinci kez açılmıştı. Birleştirilmeseydi bu şirketlerin satışları iki ayrı hesapta görünecek ve hesap bazlı analizler yanlış çıkacaktı.</p>
      <p className={styles.insight}><strong>Tarihsel kazanma oranı {formatPercent(metrics.winRate * 100)}.</strong> Kaynakta olasılık alanı olmadığı için görüşmedeki fırsatların kazanılma olasılığı bu orandan türetildi.</p>
    </Panel>
    <div className={styles.sectionGap}/>
    <Panel title="Temizlik Günlüğü" description="Uygulanan her kural, etkilediği satır sayısıyla birlikte">
      <ol className={styles.stepList}>{steps.map((step, index) => <li key={index}>
        <span><span className={`${styles.badge} ${kinds[step.kind].className}`}>{kinds[step.kind].label}</span></span>
        <div><strong>{step.title}</strong><p>{step.detail}</p><code>{step.table}.{step.column}</code></div>
        <span className={styles.stepRows}>{step.rows ? `${formatNumber(step.rows)} satır` : ""}</span>
      </li>)}</ol>
    </Panel>
    <div className={styles.sectionGap}/>
    <Panel title="Bütünlük Kontrolleri" description="Temizlik sonrası veri üzerinde çalıştırılır">
      <div className={`${styles.tableScroll} ${styles.performance}`} role="region" aria-label="Bütünlük kontrolleri" tabIndex={0}><table><thead><tr><th scope="col">Kontrol</th><th scope="col">Kural</th><th scope="col" className={css("numeric")}>Hatalı / toplam</th><th scope="col">Sonuç</th></tr></thead>
        <tbody>{checks.map(check => <tr key={check.name}><td>{check.name}</td><td><small className={styles.rowSubtext}>{check.detail}</small></td><td className={css("numeric")}>{formatNumber(check.failing)} / {formatNumber(check.total)}</td><td><span className={`${styles.badge} ${check.failing ? styles.critical : styles.good}`}>{check.failing ? "Sorun var" : "Geçti"}</span></td></tr>)}</tbody></table></div>
    </Panel>
    <div className={styles.profileGrid}>{tables.map(table => <Panel key={table.name} title={tableLabels[table.name] ?? table.name} description={`${table.name}.csv · ${formatNumber(table.rawRows)} satır · ham veri profili`}>
      <div className={`${styles.tableScroll} ${styles.performance}`}><table><thead><tr><th scope="col">Sütun</th><th scope="col">Boş değer</th><th scope="col" className={css("numeric")}>Farklı değer</th></tr></thead>
        <tbody>{table.columns.map(column => { const share = column.nulls / table.rawRows * 100; return <tr key={column.name}><td><code>{column.name}</code></td><td><span className={styles.nullBar} aria-hidden="true"><span style={{ width: `${share}%` }}/></span>{column.nulls ? `${formatNumber(column.nulls)} (${formatPercent(share)})` : "—"}</td><td className={css("numeric")}>{formatNumber(column.distinct)}</td></tr>; })}</tbody></table></div>
    </Panel>)}</div>
    <p className={styles.definition}>Veri sentetiktir: pipeline/generate_raw.py, Türkiye&apos;de kurumsal yazılım satan kurgusal bir şirketin CRM dışa aktarımını sabit bir seed ile üretir. Mükerrer kayıtlar, yazım farkları, karışık tarih biçimleri ve eksik alanlar gerçek CRM verisinde sık görülen sorunları temsil etmek için bilerek eklenmiştir. Boş değerlerin bir kısmı ise hata değil, aşamanın doğasıdır: örneğin açık fırsatlarda kapanış tarihi olmaz.</p>
  </main>;
}
