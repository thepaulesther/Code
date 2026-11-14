import { monthOf, shiftMonth, type Transaction, type TxType } from './budget';

/** A transaction that repeats every month on `day` (clamped to short months). */
export interface RecurringRule {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
  day: number; // 1..31
  startMonth: string; // YYYY-MM of the first occurrence
  lastGenerated?: string; // YYYY-MM of the latest occurrence already turned into a transaction
  paused?: boolean;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The date a rule falls on in a given month, e.g. day 31 in February -> the 28th/29th. */
export const dateForMonth = (month: string, day: number) =>
  `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;

const firstPendingMonth = (rule: RecurringRule) => {
  const afterLast = rule.lastGenerated ? shiftMonth(rule.lastGenerated, 1) : rule.startMonth;
  return afterLast > rule.startMonth ? afterLast : rule.startMonth;
};

/** Dates (YYYY-MM-DD) of occurrences that are due by `today` and not yet created. */
export function dueOccurrences(rule: RecurringRule, today: string): string[] {
  if (rule.paused) return [];
  const out: string[] = [];
  const end = monthOf(today);
  for (let m = firstPendingMonth(rule); m <= end; m = shiftMonth(m, 1)) {
    const date = dateForMonth(m, rule.day);
    if (date > today) break;
    out.push(date);
  }
  return out;
}

/** The next date this rule will add a transaction, or null when paused. */
export function nextOccurrence(rule: RecurringRule, today: string): string | null {
  if (rule.paused) return null;
  const due = dueOccurrences(rule, today);
  if (due.length) return due[0];
  let m = firstPendingMonth(rule);
  while (dateForMonth(m, rule.day) <= today) m = shiftMonth(m, 1);
  return dateForMonth(m, rule.day);
}

/**
 * Turn every due occurrence into a transaction. Transaction ids are derived from
 * the rule and month, so running this twice never creates duplicates.
 */
export function materialize(
  rules: RecurringRule[],
  today: string,
): { created: Transaction[]; rules: RecurringRule[] } {
  const created: Transaction[] = [];
  let changed = false;
  const next = rules.map((r) => {
    const dates = dueOccurrences(r, today);
    if (!dates.length) return r;
    changed = true;
    for (const date of dates) {
      created.push({
        id: `${r.id}:${monthOf(date)}`,
        type: r.type,
        amount: r.amount,
        category: r.category,
        note: r.note,
        date,
        recurringId: r.id,
      });
    }
    return { ...r, lastGenerated: monthOf(dates[dates.length - 1]) };
  });
  return { created, rules: changed ? next : rules };
}

/** Resume a paused rule without back-filling the months it was paused for. */
export function resumeRule(rule: RecurringRule, today: string): RecurringRule {
  const cur = monthOf(today);
  const skipThrough = dateForMonth(cur, rule.day) <= today ? cur : shiftMonth(cur, -1);
  const last = rule.lastGenerated && rule.lastGenerated > skipThrough ? rule.lastGenerated : skipThrough;
  return { ...rule, paused: false, lastGenerated: last };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
