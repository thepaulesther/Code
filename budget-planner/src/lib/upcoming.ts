import { monthOf, round2, shiftMonth, shortDate, type Transaction } from './budget';
import { nextOccurrence, ruleBaseAmount, type RecurringRule } from './recurring';

/**
 * What repeating bills and income are on their way. Repeating items are added to the transactions
 * automatically on their date; until then they aren't in the balance, so this is how they're seen.
 * Display only: nothing here changes a calculation.
 */
export interface UpcomingItem {
  rule: RecurringRule;
  date: string;
  /** One payment in the base currency (at the latest rate for foreign-currency items). */
  amount: number;
}

export interface Upcoming {
  /** Still due later this month (after today). Totals use only these. */
  thisMonth: UpcomingItem[];
  /** Due early next month, within the look-ahead window. Shown, not totalled. */
  nextMonth: UpcomingItem[];
  /** Repeating payments added automatically today. */
  addedToday: Transaction[];
  /** How many repeating items are paused. */
  paused: number;
  /** Whether there are any repeating items at all, paused or not. */
  hasRules: boolean;
}

const DAY_MS = 86_400_000;
const utc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS);

/** `date` plus `n` days, as YYYY-MM-DD. */
export const addDays = (date: string, n: number) => new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10);

/** "Tomorrow", "In 3 days", or the date itself once it's a week or more away. */
export function dueLabel(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n < 7) return `In ${n} days`;
  return shortDate(date);
}

const byDate = (a: UpcomingItem, b: UpcomingItem) => a.date.localeCompare(b.date) || a.rule.id.localeCompare(b.rule.id);

/**
 * Repeating items still to come: the rest of this month, plus anything early next month that falls
 * within `daysAhead` days of today (so a bill on the 1st is visible from late in the month before).
 */
export function upcoming(
  rules: RecurringRule[],
  transactions: Transaction[],
  today: string,
  { rateFor, daysAhead = 7 }: { rateFor?: (currency: string) => number | null; daysAhead?: number } = {},
): Upcoming {
  const month = monthOf(today);
  const next = shiftMonth(month, 1);
  const horizon = addDays(today, daysAhead);
  const thisMonth: UpcomingItem[] = [];
  const nextMonth: UpcomingItem[] = [];
  for (const rule of rules) {
    const date = nextOccurrence(rule, today);
    if (!date || date <= today) continue; // paused, or due now (added by applyRecurring)
    const item = { rule, date, amount: ruleBaseAmount(rule, rateFor) };
    if (monthOf(date) === month) thisMonth.push(item);
    else if (monthOf(date) === next && date <= horizon) nextMonth.push(item);
  }
  const ruleIds = new Set(rules.map((r) => r.id));
  return {
    thisMonth: thisMonth.sort(byDate),
    nextMonth: nextMonth.sort(byDate),
    addedToday: transactions.filter((t) => t.date === today && !!t.recurringId && ruleIds.has(t.recurringId)),
    paused: rules.filter((r) => r.paused).length,
    hasRules: rules.length > 0,
  };
}

/** Repeating items still due later this month, in date order. */
export const upcomingThisMonth = (rules: RecurringRule[], today: string, rateFor?: (currency: string) => number | null) =>
  upcoming(rules, [], today, { rateFor }).thisMonth;

/** Totals for this month's items: what's still to pay and what's still to come in. */
export function upcomingTotals(items: UpcomingItem[]): { out: number; in: number } {
  let out = 0;
  let inc = 0;
  for (const i of items) {
    if (i.rule.type === 'expense') out += i.amount;
    else inc += i.amount;
  }
  return { out: round2(out), in: round2(inc) };
}
