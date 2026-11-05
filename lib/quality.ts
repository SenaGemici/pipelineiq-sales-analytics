import type { OpportunityRecord } from "./models";
import { daysInStage, isStalled } from "./selectors";
import { asOfDate } from "./seed";

export type Severity = "critical" | "warning";
export type QualityCode = "company" | "owner" | "amount" | "stalled" | "created-date" | "lead-source" | "loss-reason";
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
  { code: "stalled", label: "Takılmış fırsat", severity: "warning", penalty: 20,
    description: "Bulunduğu aşamada, o aşamadan çıkan fırsatların %90'ından daha uzun süre kalmış. Büyük olasılıkla ölü fırsattır ve pipeline'ı şişirir.",
    check: (op, date) => isStalled(op, date) },
  { code: "created-date", label: "Oluşturulma tarihi eksik", severity: "warning", penalty: 15,
    description: "Oluşturulma tarihi olmadan satış süresi ve huni analizleri hesaplanamaz.",
    check: op => !op.createdAt },
  { code: "lead-source", label: "Kaynak kanal eksik", severity: "warning", penalty: 10,
    description: "Hangi kanaldan geldiği bilinmeyen fırsat, kanal yatırım kararlarında kullanılamaz.",
    check: op => !op.leadSource },
  { code: "loss-reason", label: "Kayıp nedeni eksik", severity: "warning", penalty: 10,
    description: "Neden kaybedildiği bilinmeyen fırsattan ders çıkarılamaz.",
    check: op => op.stage === "Lost" && !op.lossReason },
];

export function scoreOpportunity(op: OpportunityRecord, referenceDate = asOfDate) {
  const issues: QualityIssue[] = qualityRules.filter(rule => rule.check(op, referenceDate)).map(({ code, label, severity, penalty }) => ({ code, label, severity, penalty }));
  const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + issue.penalty, 0));
  const severity: Severity | null = issues.some(issue => issue.severity === "critical") ? "critical" : issues.length ? "warning" : null;
  return { score, issues, severity, age: daysInStage(op, referenceDate) };
}
export function overallQuality(data: OpportunityRecord[], referenceDate = asOfDate) {
  const records = data.map(op => ({ opportunity: op, ...scoreOpportunity(op, referenceDate) }));
  const byCode = Object.fromEntries(qualityRules.map(rule => [rule.code, 0])) as Record<QualityCode, number>;
  for (const record of records) for (const issue of record.issues) byCode[issue.code] += 1;
  return { score: records.length ? Math.round(records.reduce((sum, record) => sum + record.score, 0) / records.length * 10) / 10 : 100,
    records, problematic: records.filter(record => record.issues.length), critical: records.filter(record => record.severity === "critical").length, byCode };
}
