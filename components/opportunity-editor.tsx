"use client";

import { useState, type FormEvent } from "react";
import { useCrm } from "./crm-provider";
import { Modal } from "./crm-ui";
import { Amount, StageBadge } from "./dashboard";
import { dashboardClass as css } from "./dashboard-styles";
import styles from "./crm.module.css";
import { opportunityStages, type OpportunityRecord, type Stage } from "@/lib/models";
import { asOfDate, defaultProbability, leadSources, lossReasons } from "@/lib/seed";
import { stageLabels } from "@/lib/presentation";
import { scoreOpportunity } from "@/lib/quality";
import { daysBetween } from "@/lib/dates";

const newId = () => `NEW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

export function OpportunityEditor({ opportunity, companyId, startEditing = false, onClose, onSaved }: {
  opportunity?: OpportunityRecord; companyId?: string; startEditing?: boolean; onClose: () => void; onSaved?: () => void;
}) {
  const { state, viewById, dispatch, formatMoney, formatDate } = useCrm();
  const [editing, setEditing] = useState(!opportunity || startEditing);
  const [form, setForm] = useState({
    companyId: opportunity ? opportunity.companyId ?? "" : companyId ?? "",
    productId: opportunity?.productId ?? state.products[0]?.id ?? "",
    value: opportunity?.value?.toString() ?? "",
    stage: opportunity?.stage ?? "Prospecting" as Stage,
    probability: opportunity?.probability ?? defaultProbability.Prospecting,
    ownerId: opportunity?.ownerId ?? "",
    createdAt: opportunity?.createdAt ?? asOfDate,
    leadSource: opportunity?.leadSource ?? "",
    lossReason: opportunity?.lossReason ?? "",
    discount: opportunity?.discount?.toString() ?? "",
  });
  const [error, setError] = useState("");
  const view = opportunity ? viewById.get(opportunity.id) : undefined;
  const quality = opportunity ? scoreOpportunity(opportunity) : null;
  const listPrice = state.products.find(product => product.id === form.productId)?.price;
  const closed = form.stage === "Won" || form.stage === "Lost";
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      dispatch({ type: "save-opportunity", id: opportunity?.id ?? newId(), input: {
        companyId: form.companyId || null, productId: form.productId, stage: form.stage, ownerId: form.ownerId || null,
        value: form.value === "" ? null : Number(form.value), probability: Number(form.probability), createdAt: form.createdAt || null,
        leadSource: form.leadSource || null, lossReason: form.stage === "Lost" ? form.lossReason || null : null,
        discount: form.discount === "" ? null : Number(form.discount),
      } });
      onSaved?.(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Fırsat kaydedilemedi."); }
  }
  function setStage(stage: Stage) {
    setForm(previous => ({ ...previous, stage, probability: defaultProbability[stage] }));
  }
  const cycle = opportunity?.createdAt && opportunity.closedAt ? daysBetween(opportunity.createdAt, opportunity.closedAt) : null;
  const inStage = opportunity?.stageEnteredAt && !opportunity.closedAt ? daysBetween(opportunity.stageEnteredAt, asOfDate) : null;
  return <Modal title={!opportunity ? "Yeni Satış Fırsatı" : editing ? `Fırsatı Düzenle · ${opportunity.id}` : `Fırsat ${opportunity.id}`} onClose={onClose}>
    {!editing && opportunity && view ? <div className={styles.modalBody}>
      <dl className={styles.details}>
        <div><dt>Şirket</dt><dd className={opportunity.companyId ? undefined : styles.missing}>{view.company}</dd></div><div><dt>Aşama</dt><dd><StageBadge stage={opportunity.stage}/></dd></div>
        <div><dt>Ürün</dt><dd>{view.product} · liste {formatMoney(view.listPrice)}</dd></div><div><dt>Tutar</dt><dd><Amount op={view} format={formatMoney}/>{view.estimated && <small className={styles.rowSubtext}>Liste fiyatı{opportunity.discount ? ` − %${opportunity.discount} indirim` : ""} üzerinden tahmin</small>}</dd></div>
        <div><dt>Kaynak kanal</dt><dd className={opportunity.leadSource ? undefined : styles.missing}>{opportunity.leadSource ?? "Belirtilmedi"}</dd></div><div><dt>İndirim</dt><dd>{opportunity.discount !== null ? `%${opportunity.discount}` : "—"}</dd></div>
        <div><dt>Sorumlu kişi</dt><dd>{view.owner}{view.region && <small className={styles.rowSubtext}>{view.region} bölgesi</small>}</dd></div><div><dt>Kazanılma olasılığı</dt><dd>%{opportunity.probability}</dd></div>
        <div><dt>Oluşturulma</dt><dd>{formatDate(opportunity.createdAt)}</dd></div>
        <div><dt>{opportunity.closedAt ? "Kapanış · satış süresi" : "Bu aşamada"}</dt><dd>{opportunity.closedAt ? `${formatDate(opportunity.closedAt)}${cycle !== null ? ` · ${cycle} gün` : ""}` : inStage !== null ? `${inStage} gün` : "—"}</dd></div>
        {opportunity.stage === "Lost" && <div><dt>Kayıp nedeni</dt><dd className={opportunity.lossReason ? undefined : styles.missing}>{opportunity.lossReason ?? "Belirtilmedi"}</dd></div>}
        <div><dt>Veri kalitesi</dt><dd>{quality?.score}/100</dd></div>
      </dl>
      {quality && quality.issues.length > 0 && <p className={styles.formHint}>{quality.issues.map(issue => issue.label).join(" · ")}</p>}
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={onClose}>Kapat</button><button type="button" className={css("primary-button")} onClick={() => setEditing(true)}>Düzenle</button></div>
    </div> : <form className={styles.form} onSubmit={save}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.full}`}>Şirket<select name="companyId" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}><option value="">Şirket atanmamış</option>{state.companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label className={styles.field}>Ürün *<select name="productId" required value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value })}>{state.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className={styles.field}>Aşama<select name="stage" value={form.stage} onChange={e => setStage(e.target.value as Stage)}>{opportunityStages.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
        <label className={styles.field}>Tutar (USD)<input name="value" type="number" min="0" max="1000000000" step="1" placeholder={listPrice !== undefined ? `Liste fiyatı: ${listPrice}` : "Belirtilmedi"} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })}/><small>{closed ? "Gerçekleşen satış tutarı." : "Boş bırakılırsa indirimli liste fiyatı tahmin olarak kullanılır."}</small></label>
        <label className={styles.field}>Kazanılma olasılığı (%)<input name="probability" type="number" min="0" max="100" step="1" required disabled={closed} value={form.probability} onChange={e => setForm({ ...form, probability: Number(e.target.value) })}/></label>
        <label className={styles.field}>Sorumlu kişi<select name="ownerId" value={form.ownerId} onChange={e => setForm({ ...form, ownerId: e.target.value })}><option value="">Atanmamış</option>{state.representatives.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}</select></label>
        <label className={styles.field}>Oluşturulma tarihi<input name="createdAt" type="date" max={asOfDate} value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })}/></label>
        <label className={styles.field}>Kaynak kanal<select name="leadSource" value={form.leadSource} onChange={e => setForm({ ...form, leadSource: e.target.value })}><option value="">Belirtilmedi</option>{leadSources.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
        <label className={styles.field}>İndirim (%)<input name="discount" type="number" min="0" max="100" step="0.1" placeholder="Yok" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })}/></label>
        {form.stage === "Lost" && <label className={styles.field}>Kayıp nedeni<select name="lossReason" value={form.lossReason} onChange={e => setForm({ ...form, lossReason: e.target.value })}><option value="">Belirtilmedi</option>{lossReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>}
      </div>
      <p className={styles.formHint}>* Zorunlu alan. Şirketi veya sorumlusu olmayan fırsatlar kritik, kaynak kanalı veya kayıp nedeni eksik olanlar uyarı düzeyinde veri kalitesi sorunu sayılır. Kapanan fırsatların olasılığı otomatik belirlenir; yeni kapanan fırsatın kapanış tarihi analiz tarihidir ({formatDate(asOfDate)}).</p>
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={onClose}>Vazgeç</button><button type="submit" className={css("primary-button")}>Kaydet</button></div>
    </form>}
  </Modal>;
}
