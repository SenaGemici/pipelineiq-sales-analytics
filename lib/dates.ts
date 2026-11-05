export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function daysBetween(start: string, end: string) {
  if (!validDate(start) || !validDate(end)) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
export function addDays(date: string, days: number) {
  if (!validDate(date)) throw new Error("Geçerli bir tarih girin.");
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function formatDate(date: string | null | undefined, format: "tr" | "iso" = "tr") {
  if (!date || !validDate(date)) return "Belirtilmedi";
  if (format === "iso") return date;
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
