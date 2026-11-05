import { roundMoney } from "./dates";
import { opportunityStages, type OpportunityView } from "./models";
import { isOpen, isStalled } from "./selectors";

export function summarize(data: OpportunityView[]) {
  const open = data.filter(isOpen), won = data.filter(op => op.stage === "Won"), lost = data.filter(op => op.stage === "Lost");
  const closedCount = won.length + lost.length;
  const total = (items: OpportunityView[], value: (op: OpportunityView) => number = op => op.amount) => roundMoney(items.reduce((sum, op) => sum + value(op), 0));
  return {
    open, won, lost, closedCount, wonCount: won.length,
    total: total(open),
    weighted: total(open, op => op.amount * op.probability / 100),
    wonRevenue: total(won),
    // Kaybedilen fırsatlarda kaynak tutar 0'dır; kaçan potansiyel liste fiyatıyla hesaplanır.
    lostPotential: total(lost, op => op.listPrice),
    winRate: closedCount ? won.length / closedCount * 100 : 0,
    stages: opportunityStages.map(stage => {
      const records = data.filter(op => op.stage === stage);
      return { stage, count: records.length, amount: total(records) };
    }),
    stalled: open.filter(op => isStalled(op)),
    missingCompany: data.filter(op => !op.companyId),
  };
}

export interface Period { key: string; label: string; start: string; end: string }
/** Kapanış tarihlerinin kapsadığı çeyrekler, en yeniden eskiye. */
export function quarterPeriods(dates: (string | null)[]): Period[] {
  const valid = dates.filter((date): date is string => !!date).sort();
  if (!valid.length) return [];
  const periods: Period[] = [];
  const toQuarter = (date: string) => ({ year: Number(date.slice(0, 4)), quarter: Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1 });
  let { year, quarter } = toQuarter(valid[0]);
  const last = toQuarter(valid.at(-1)!);
  while (year < last.year || (year === last.year && quarter <= last.quarter)) {
    const startMonth = (quarter - 1) * 3 + 1;
    const end = new Date(Date.UTC(year, startMonth + 2, 0)).toISOString().slice(0, 10);
    periods.push({ key: `${year}-Q${quarter}`, label: `${year} ${quarter}. çeyrek`, start: `${year}-${String(startMonth).padStart(2, "0")}-01`, end });
    if (++quarter > 4) { quarter = 1; year += 1; }
  }
  return periods.reverse();
}
export const inPeriod = (date: string | null, period: Period | undefined) => !period || (!!date && date >= period.start && date <= period.end);
