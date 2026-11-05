import type { OpportunityView, Stage } from "./models";

export const stageLabels: Record<Stage, string> = {
  Prospecting: "Potansiyel",
  Qualification: "Nitelendirme",
  Proposal: "Teklif",
  Negotiation: "Müzakere",
  Won: "Kazanıldı",
  Lost: "Kaybedildi",
};
export const stageColors: Record<Stage, string> = { Prospecting: "#93c5fd", Qualification: "#60a5fa", Proposal: "#a78bfa", Negotiation: "#fbbf24", Won: "#10b981", Lost: "#e87979" };

/** Boş değerleri tabloda "—" olarak gösterir. */
export const orDash = (value: string | null | undefined) => value || "—";

export const formatMoney = (value: number, display: "symbol" | "code" = "symbol") => new Intl.NumberFormat("tr-TR", {
  style: "currency", currency: "USD", currencyDisplay: display === "code" ? "code" : "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(value);
export const formatNumber = (value: number, digits = 0) => value.toLocaleString("tr-TR", { maximumFractionDigits: digits });
export const formatPercent = (value: number, digits = 1) => `%${formatNumber(value, digits)}`;
export function formatAxis(value: number) {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} mn`;
  return `${formatNumber(value / 1000)} bin`;
}

export function buildCsv(data: OpportunityView[]) {
  const headers = ["Fırsat No", "Şirket", "Ürün", "Aşama", "Tutar (USD)", "Tutar türü", "Olasılık (%)", "Sorumlu", "Bölge", "Kaynak Kanal", "İndirim (%)", "Oluşturulma", "Kapanış", "Kayıp Nedeni"];
  const rows = data.map(op => [op.id, op.company, op.product, stageLabels[op.stage], op.amount, op.estimated ? "Tahmini" : "Gerçekleşen",
    op.probability, op.owner, orDash(op.region), op.leadSource ?? "", op.discount ?? "", op.createdAt ?? "", op.closedAt ?? "", op.lossReason ?? ""]);
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return String.fromCharCode(0xfeff) /* Excel için UTF-8 BOM */ + [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
}
