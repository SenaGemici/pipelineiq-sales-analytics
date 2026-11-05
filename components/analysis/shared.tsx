"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FileCode2 } from "lucide-react";
import { analysis } from "@/lib/generated/analysis";
import type { ForecastMethod } from "@/lib/analysis-types";
import { formatDate } from "@/lib/dates";
import { stageLabels } from "@/lib/presentation";
import type { Stage } from "@/lib/models";
import styles from "./analysis.module.css";

export { analysis };
export const axisTick = { fontSize: 11, fill: "#64748b" };
export const gridStroke = "#edf1f5";
export const chartTooltip = { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px #0f172a0a" };
export const series = { actual: "#0f172a", model: "#4f46e5", stage: "#e87979", naive: "#f59e0b", muted: "#94a3b8", good: "#10b981" };
export const methodLabels: Record<ForecastMethod, string> = { naive: "Genel kazanma oranı", stage: "Aşama olasılığı (CRM standardı)", model: "Kazanma modeli" };

export const stageName = (stage: string | null) => stage ? stageLabels[stage as Stage] ?? stage : "—";
export const pct = (value: number | null | undefined, digits = 0) => value === null || value === undefined ? "—" : `%${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
export const num = (value: number | null | undefined, digits = 0) => value === null || value === undefined ? "—" : value.toLocaleString("tr-TR", { maximumFractionDigits: digits });

/** Analiz ekranlarının alt bilgisi: sonuçların nereden geldiğini ve nasıl yeniden üretileceğini söyler. */
export function Method({ sql, notebook, children }: { sql?: string[]; notebook?: string; children?: ReactNode }) {
  return <aside className={styles.method}>
    <FileCode2 size={16} aria-hidden="true"/>
    <div>
      <p>{children} Analizler temel veri üzerinden, analiz tarihi {formatDate(analysis.asOf)} itibarıyla hesaplanır; CRM ekranlarında yaptığınız düzenlemeler bu sonuçları değiştirmez.</p>
      {(sql?.length || notebook) && <p className={styles.sources}>Kaynak: {sql?.map(file => <code key={file}>analysis/sql/{file}</code>)}{notebook && <code>notebooks/{notebook}</code>}</p>}
    </div>
  </aside>;
}

export function RateBar({ value, max = 1, tone = "default" }: { value: number; max?: number; tone?: "default" | "good" | "bad" }) {
  return <span className={styles.bar} aria-hidden="true"><span className={styles[tone]} style={{ width: `${Math.max(0, Math.min(100, value / max * 100))}%` }}/></span>;
}

export function InsightLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className={styles.insightLink}>{children}</Link>;
}
