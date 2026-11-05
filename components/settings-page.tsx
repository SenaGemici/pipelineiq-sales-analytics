"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useCrm } from "./crm-provider";
import { Modal, Notice, PageHeading } from "./crm-ui";
import styles from "./crm.module.css";
import { asOfDate, initialCounts } from "@/lib/seed";
import { formatNumber } from "@/lib/presentation";
import type { Preferences } from "@/lib/models";

export function SettingsPage({ version }: { version: string }) {
  const { state, dispatch, formatMoney, formatDate, warning } = useCrm();
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState("");
  function update(input: Partial<Preferences>) {
    dispatch({ type: "preferences", input });
    setNotice("Gösterim tercihi uygulandı.");
  }
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Ayarlar" description="Gösterim tercihlerinizi ve tarayıcıda saklanan değişikliklerinizi yönetin."/>
    <div className={styles.settings}>
      {notice && <Notice>{notice}</Notice>}
      <section className={styles.settingsSection} aria-labelledby="display-settings"><h2 id="display-settings">Gösterim Tercihleri</h2><p>Tercihler tüm ekranlarda anında uygulanır ve bu tarayıcıda saklanır.</p>
        <div className={styles.settingRow}><div><label htmlFor="currency-display">Para birimi gösterimi</label><p>Tüm tutarlar USD’dir. Kur dönüşümü yapılmaz.</p></div><select id="currency-display" value={state.preferences.currencyDisplay} onChange={e => update({ currencyDisplay: e.target.value as Preferences["currencyDisplay"] })}><option value="symbol">Simge ($)</option><option value="code">Para birimi kodu (USD)</option></select></div>
        <div className={styles.settingRow}><div><label htmlFor="date-format">Tarih formatı</label><p>Kart, tablo ve detay panellerindeki tarihler için.</p></div><select id="date-format" value={state.preferences.dateFormat} onChange={e => update({ dateFormat: e.target.value as Preferences["dateFormat"] })}><option value="tr">Türkçe · GG.AA.YYYY</option><option value="iso">ISO · YYYY-AA-GG</option></select></div>
        <div className={styles.settingRow}><div><strong>Önizleme</strong><p>Seçtiğiniz para ve tarih gösterimi</p></div><p data-settings-preview>{formatMoney(12500)} · {formatDate(asOfDate)}</p></div>
      </section>
      <section className={styles.settingsSection} aria-labelledby="demo-settings"><h2 id="demo-settings">Veriler</h2><p>Kayıtlar sentetiktir: Türkiye&apos;de kurumsal yazılım satan kurgusal bir şirketin CRM verisini simüle eder. Tüm şirketler, kişiler ve ürünler kurgusaldır. Yaptığınız değişiklikler yalnızca bu tarayıcıda tutulur; harici bir CRM sistemine gönderilmez. Analiz tarihi veri setinin son günü olan {formatDate(asOfDate)} tarihine sabittir.</p>
        <div className={styles.settingRow}><div><strong>Mevcut kayıtlar</strong><p>Başlangıç verileri {formatNumber(initialCounts.companies)} şirket, {initialCounts.representatives} temsilci, {initialCounts.products} ürün ve {formatNumber(initialCounts.opportunities)} satış fırsatı içerir.</p></div><p>{formatNumber(state.companies.length)} şirket · {formatNumber(state.opportunities.length)} fırsat</p></div>
        <div className={styles.settingRow}><div><strong>Tarayıcıda saklama</strong><p>{warning ? "Kalıcı saklama sorunu var. Üst bölümdeki uyarıyı inceleyin." : "Düzenlemeler aynı tarayıcıda sayfa yenilendiğinde korunur. Gizli modda veya tarayıcı verileri temizlendiğinde silinebilir."}</p></div><span className={`${styles.badge} ${warning ? styles.warning : styles.good}`}>{warning ? "Oturum verisi" : "Tarayıcıda saklanıyor"}</span></div>
        <div className={styles.settingRow}><div><strong>Başlangıç durumuna dön</strong><p>Eklediğiniz kayıtları ve düzenlemeleri kaldırır. Gösterim tercihlerini de sıfırlar.</p></div><button type="button" className={styles.secondary} onClick={() => setConfirmReset(true)}><RotateCcw size={14} style={{ display: "inline", marginRight: 7 }}/>Değişiklikleri sıfırla</button></div>
      </section>
      <section className={styles.settingsSection} aria-labelledby="about"><h2 id="about">PipelineIQ Hakkında</h2><p>CRM verisini temizleme, kalite takibi ve satış analizi için bir portfolyo projesi.</p><div className={styles.settingRow}><div><strong>Uygulama sürümü</strong><p>Portfolyo sürümü</p></div><p>{version}</p></div><div className={styles.settingRow}><div><strong>Veri kaynağı</strong><p>Sentetik veri · pipeline/generate_raw.py (sabit seed)</p></div><p>Analiz tarihi: {formatDate(asOfDate)}</p></div></section>
    </div>
    {confirmReset && <Modal title="Değişiklikleri Sıfırla" onClose={() => setConfirmReset(false)}><div className={styles.modalBody}><p className={styles.summary}>Eklediğiniz tüm şirketler, satış fırsatları ve düzenlemeler kaldırılacak. Başlangıç verileri ve varsayılan gösterim tercihleri geri yüklenecek. Devam etmek istiyor musunuz?</p><div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setConfirmReset(false)}>Vazgeç</button><button type="button" className={styles.danger} onClick={() => { dispatch({ type: "reset" }); setConfirmReset(false); setNotice("Veriler ve gösterim tercihleri başlangıç durumuna döndürüldü."); }}>Evet, sıfırla</button></div></div></Modal>}
  </main>;
}
