import type { OpportunityRecord } from "./models";
import { ageInDays, isStalled } from "./selectors";
import { asOfDate, stallDays } from "./seed";

export type Severity = "critical" | "warning";
export type QualityCode = "company" | "owner" | "amount" | "stalled" | "engage-date";
export interface QualityIssue { code: QualityCode; label: string; severity: Severity; penalty: number }
type Rule = QualityIssue & { description: string; check: (op: OpportunityRecord, date: string) => boolean };

export const qualityRules: Rule[] = [
  { code: "company", label: "Şirket bağlantısı yok", severity: "critical", penalty: 30,
    description: "Fırsat hiçbir şirkete bağlı değil. Hesap bazlı raporlarda görünmez ve kime satış yapıldığı bilinmez.",
    check: op => !op.companyId },
  { code: "owner", label: "Sorumlu kişi yok", severity: "critical", penalty: 30,
    description: "Sahipsiz fırsat takip edilmez ve temsilci raporlarına girmez.",
    check: op => !op.ownerId },
  { code: "amount", label: "Kazanılan tutar eksik", severity: "critical", penalty: 30,
    description: "Kazanılan fırsatın gerçekleşen tutarı boş veya 0. Gelir raporlarını eksik gösterir.",
    check: op => op.stage === "Won" && (op.value === null || op.value <= 0) },
  { code: "stalled", label: `Takılmış fırsat (${stallDays}+ gün görüşmede)`, severity: "warning", penalty: 20,
    description: `Kazanılan fırsatların %90'ı ${stallDays} gün içinde kapanmış. Bu süreyi aşan görüşmeler büyük olasılıkla ölü fırsattır ve pipeline'ı şişirir.`,
    check: (op, date) => isStalled(op, date) },
  { code: "engage-date", label: "Görüşme tarihi eksik", severity: "warning", penalty: 15,
    description: "Prospecting dışındaki aşamalarda görüşme başlangıç tarihi olmalı. Yoksa satış süresi ve yaş hesaplanamaz.",
    check: op => op.stage !== "Prospecting" && !op.createdAt },
];

export function scoreOpportunity(op: OpportunityRecord, referenceDate = asOfDate) {
  const issues: QualityIssue[] = qualityRules.filter(rule => rule.check(op, referenceDate)).map(({ code, label, severity, penalty }) => ({ code, label, severity, penalty }));
  const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + issue.penalty, 0));
  const severity: Severity | null = issues.some(issue => issue.severity === "critical") ? "critical" : issues.length ? "warning" : null;
  return { score, issues, severity, age: ageInDays(op, referenceDate) };
}
export function overallQuality(data: OpportunityRecord[], referenceDate = asOfDate) {
  const records = data.map(op => ({ opportunity: op, ...scoreOpportunity(op, referenceDate) }));
  const byCode = Object.fromEntries(qualityRules.map(rule => [rule.code, 0])) as Record<QualityCode, number>;
  for (const record of records) for (const issue of record.issues) byCode[issue.code] += 1;
  return { score: records.length ? Math.round(records.reduce((sum, record) => sum + record.score, 0) / records.length * 10) / 10 : 100,
    records, problematic: records.filter(record => record.issues.length), critical: records.filter(record => record.severity === "critical").length, byCode };
}
