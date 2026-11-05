"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Plus, UserRound } from "lucide-react";
import { useCrm } from "./crm-provider";
import { OpportunityEditor } from "./opportunity-editor";
import { EmptyState, Notice, PageHeading, SearchField, ShowMore, usePaged } from "./crm-ui";
import { Amount } from "./dashboard";
import { dashboardClass as css } from "./dashboard-styles";
import styles from "./crm.module.css";
import { opportunityStages, type OpportunityView, type Stage } from "@/lib/models";
import { formatNumber, stageColors, stageLabels } from "@/lib/presentation";
import { summarize } from "@/lib/pipeline";
import { isStalled } from "@/lib/selectors";

const PAGE = 25;

function Column({ stage, records, resetKey, over, dragging, onOver, onLeave, onDrop, onDragStart, onDragEnd, onSelect, onMove }: {
  stage: Stage; records: OpportunityView[]; resetKey: string; over: boolean; dragging: string | null;
  onOver: () => void; onLeave: () => void; onDrop: (id: string) => void; onDragStart: (id: string) => void; onDragEnd: () => void;
  onSelect: (id: string) => void; onMove: (id: string, stage: Stage) => void;
}) {
  const { formatMoney, formatDate } = useCrm();
  const { visible, remaining, more } = usePaged(records, PAGE, resetKey);
  return <section data-stage={stage} aria-label={`${stageLabels[stage]} aşaması`} className={`${styles.column} ${over ? styles.columnOver : ""}`}
    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onOver(); }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onLeave(); }}
    onDrop={e => { e.preventDefault(); onDrop(e.dataTransfer.getData("text/plain")); }}>
    <div className={styles.columnHeading}><h2><span className={styles.stageDot} style={{ background: stageColors[stage] }}/>{stageLabels[stage]}</h2><span>{formatNumber(records.length)}</span></div>
    <p className={styles.columnTotal}>{stage === "Lost" ? "Kaybedilen fırsatlarda tutar yok" : `${stage === "Won" ? "" : "≈ "}${formatMoney(records.reduce((sum, op) => sum + op.amount, 0))}`}</p>
    {visible.map(op => <article key={op.id} data-opportunity-id={op.id} draggable className={`${styles.card} ${dragging === op.id ? styles.cardDragging : ""}`}
      onDragStart={e => { e.dataTransfer.setData("text/plain", op.id); e.dataTransfer.effectAllowed = "move"; onDragStart(op.id); }} onDragEnd={onDragEnd}>
      <button type="button" className={styles.cardTitle} aria-label={`${op.company} ${op.product} fırsat detayları`} onClick={() => onSelect(op.id)}>
        <span className={op.companyId ? undefined : styles.missing}>{op.company}</span><small>{op.product} · {op.id}</small></button>
      <p className={styles.cardAmount}>{op.stage === "Lost" ? <span className={styles.estimate}>Kaybedildi</span> : <Amount op={op} format={formatMoney}/>}</p>
      <p className={styles.cardMeta}><UserRound size={13}/>{op.owner}</p>
      <p className={styles.cardMeta}><CalendarDays size={13}/>{op.closedAt ? `Kapanış ${formatDate(op.closedAt)}` : op.createdAt ? `Görüşme ${formatDate(op.createdAt)}${isStalled(op) ? " · takılmış" : ""}` : "Görüşme başlamadı"}</p>
      <select aria-label={`${op.company} ${op.id} aşamasını değiştir`} value={op.stage} onChange={e => onMove(op.id, e.target.value as Stage)}>{opportunityStages.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select>
    </article>)}
    <ShowMore remaining={remaining} step={PAGE} onClick={more} label="fırsat"/>
    {!records.length && <EmptyState>Bu aşamada fırsat yok.</EmptyState>}
  </section>;
}

export function OpportunitiesPage() {
  const { state, opportunities, dispatch, formatMoney } = useCrm();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [owner, setOwner] = useState("all");
  const [product, setProduct] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [notice, setNotice] = useState("");
  const stats = useMemo(() => summarize(opportunities), [opportunities]);
  const normalized = query.toLocaleLowerCase("tr-TR");
  const filtered = useMemo(() => opportunities
    .filter(op => (stage === "all" || op.stage === stage) && (product === "all" || op.productId === product)
      && (owner === "all" || (owner === "unassigned" ? !op.ownerId : op.ownerId === owner))
      && `${op.company} ${op.product} ${op.owner} ${op.id}`.toLocaleLowerCase("tr-TR").includes(normalized))
    .sort((a, b) => (b.activityDate ?? "").localeCompare(a.activityDate ?? "")), [opportunities, stage, product, owner, normalized]);
  const byStage = useMemo(() => Object.fromEntries(opportunityStages.map(s => [s, filtered.filter(op => op.stage === s)])) as Record<Stage, OpportunityView[]>, [filtered]);
  const columns = stage === "all" ? opportunityStages : opportunityStages.filter(value => value === stage);
  const resetKey = `${query}|${stage}|${owner}|${product}`;
  function move(id: string, stage: Stage) {
    try { dispatch({ type: "move-opportunity", id, stage }); setNotice(`${id} fırsatı ${stageLabels[stage]} aşamasına taşındı.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Aşama değiştirilemedi."); }
    setDragging(null); setOver(null);
  }
  return <main id="main" tabIndex={-1}>
    <PageHeading title="Satış Fırsatları" description="Fırsatları aşamalar arasında taşıyın, filtreleyin ve eksik bilgileri tamamlayın."><button type="button" className={css("primary-button")} onClick={() => setCreating(true)}><Plus size={16}/>Yeni fırsat</button></PageHeading>
    <p className={styles.summary}><strong>{formatNumber(opportunities.length)}</strong> fırsat · <strong>{formatNumber(stats.open.length)}</strong> açık · <strong>≈ {formatMoney(stats.total)}</strong> açık pipeline · <strong>{formatNumber(stats.stalled.length)}</strong> takılmış</p>
    <div className={styles.toolbar}><SearchField value={query} onChange={setQuery} label="Satış fırsatlarında ara" placeholder="Şirket, ürün, sorumlu veya fırsat no…"/>
      <label className={styles.filter}>Aşama<select aria-label="Aşama filtresi" value={stage} onChange={e => setStage(e.target.value)}><option value="all">Tüm aşamalar</option>{opportunityStages.map(stage => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
      <label className={styles.filter}>Ürün<select aria-label="Ürün filtresi" value={product} onChange={e => setProduct(e.target.value)}><option value="all">Tüm ürünler</option>{state.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className={styles.filter}>Sorumlu<select aria-label="Sorumlu filtresi" value={owner} onChange={e => setOwner(e.target.value)}><option value="all">Tüm sorumlular</option><option value="unassigned">Atanmamış</option>{state.representatives.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}</select></label>
    </div>
    {notice && <Notice>{notice}</Notice>}
    <div className={styles.boardViewport} tabIndex={0} role="region" aria-label="Satış fırsatları Kanban panosu"><div className={styles.board} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(250px, 1fr))` }}>
      {columns.map(stage => <Column key={stage} stage={stage} records={byStage[stage]} resetKey={resetKey} over={over === stage} dragging={dragging}
        onOver={() => setOver(stage)} onLeave={() => setOver(null)} onDrop={id => { if (state.opportunities.some(op => op.id === id)) move(id, stage); }}
        onDragStart={setDragging} onDragEnd={() => { setDragging(null); setOver(null); }} onSelect={setSelected} onMove={move}/>)}
    </div></div>
    <p className={styles.formHint}>{formatNumber(filtered.length)} fırsat filtreye uyuyor; her sütunda en yeni {PAGE} kayıt gösterilir. Kartları sürükleyerek veya kart altındaki aşama seçimiyle taşıyabilirsiniz. Kazanılan fırsatın tutarı boşsa liste fiyatı yazılır; kaybedilen fırsatın tutarı kaynak veriyle uyumlu olarak 0&apos;dır.</p>
    {(creating || selected) && <OpportunityEditor key={selected ?? "new"} opportunity={state.opportunities.find(op => op.id === selected)} onClose={() => { setSelected(null); setCreating(false); }} onSaved={() => setNotice("Satış fırsatı kaydedildi. Tüm ekranlardaki veriler güncellendi.")}/>}
  </main>;
}
