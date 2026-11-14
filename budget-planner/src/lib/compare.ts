import { effectiveInMonth, shiftMonth, totals, type Entry, type Totals, type Transaction } from './budget';
import { daysInMonth } from './recurring';

/**
 * A month compared with the one before it.
 * For the month that is still running, both sides stop at the same day of the month ("so far" vs
 * "by the same day last month"), so a few days of spending is never set against a whole month.
 */
export interface MonthComparison {
  now: Totals;
  before: Totals;
  /** True when the current month is compared only up to `day`. */
  partial: boolean;
  /** Day of the month the comparison stops at (when partial). */
  day: number;
}

/** Shares of payments spread over several months count in full on both sides; they're a fixed monthly amount. */
const upTo = (entries: Entry[], day: number) =>
  entries.filter((e) => !!e.share || Number(e.date.slice(8, 10)) <= day);

export function compareMonths(txs: Transaction[], month: string, today: string): MonthComparison {
  const prevMonth = shiftMonth(month, -1);
  const thisEntries = effectiveInMonth(txs, month);
  const prevEntries = effectiveInMonth(txs, prevMonth);
  const isCurrent = today.slice(0, 7) === month;
  const day = Number(today.slice(8, 10));
  // A finished month, or the last day of this one, compares whole months.
  if (!isCurrent || day >= daysInMonth(month)) {
    return { now: totals(thisEntries), before: totals(prevEntries), partial: false, day: daysInMonth(month) };
  }
  return {
    now: totals(upTo(thisEntries, day)),
    before: totals(upTo(prevEntries, Math.min(day, daysInMonth(prevMonth)))),
    partial: true,
    day,
  };
}

/** "▲ 12% vs last month", or "… vs same day last month" while the month is running. Null when there's nothing to compare. */
export function changeLabel(now: number, before: number, partial: boolean): string | null {
  if (before === 0) return null;
  const pct = ((now - before) / before) * 100;
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs ${partial ? 'same day last month' : 'last month'}`;
}
