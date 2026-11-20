import { monthDiff, monthOf, round2, shiftMonth, type Transaction, type TxType } from './budget';

/** A transaction that repeats every month (or every year) on `day` (clamped to short months). */
export interface RecurringRule {
  id: string;
  type: TxType;
  /** In `currency` when set, otherwise in the base currency. */
  amount: number;
  /** Paid in another currency, e.g. a USD salary with an NGN base. Converted on each occurrence. */
  currency?: string;
  /** Last rate used (base units per 1 `currency`); the fallback when no live rate is available. */
  rate?: number;
  category: string;
  note: string;
  day: number; // 1..31
  startMonth: string; // YYYY-MM of the first occurrence
  /** 1 = monthly (default), 12 = yearly. */
  everyMonths?: number;
  /** Each payment counts across this many months (e.g. yearly rent spread over 12). */
  spreadMonths?: number;
  lastGenerated?: string; // YYYY-MM of the latest occurrence already turned into a transaction
  paused?: boolean;
  /** Part of the example data; its transactions are examples too. */
  sample?: boolean;
  /** When this record last changed (ISO time), for merging two devices later. */
  updatedAt?: string;
}

export const intervalOf = (rule: Pick<RecurringRule, 'everyMonths'>) =>
  rule.everyMonths && rule.everyMonths > 1 ? rule.everyMonths : 1;

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The date a rule falls on in a given month, e.g. day 31 in February -> the 28th/29th. */
export const dateForMonth = (month: string, day: number) =>
  `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;

const firstPendingMonth = (rule: RecurringRule) => {
  const afterLast = rule.lastGenerated ? shiftMonth(rule.lastGenerated, intervalOf(rule)) : rule.startMonth;
  return afterLast > rule.startMonth ? afterLast : rule.startMonth;
};

/** Dates (YYYY-MM-DD) of occurrences that are due by `today` and not yet created. */
export function dueOccurrences(rule: RecurringRule, today: string): string[] {
  if (rule.paused) return [];
  const out: string[] = [];
  const end = monthOf(today);
  const step = intervalOf(rule);
  for (let m = firstPendingMonth(rule); m <= end; m = shiftMonth(m, step)) {
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
  while (dateForMonth(m, rule.day) <= today) m = shiftMonth(m, intervalOf(rule));
  return dateForMonth(m, rule.day);
}

/** One payment of the rule in the base currency, using `rateFor` or the rule's last rate. */
export function ruleBaseAmount(rule: RecurringRule, rateFor?: (currency: string) => number | null): number {
  if (!rule.currency) return rule.amount;
  const rate = rateFor?.(rule.currency) ?? rule.rate ?? 1;
  return round2(rule.amount * rate);
}

/** What the rule costs (or brings in) per month on average: a ₦3M yearly rent is ₦250k a month. */
export const ruleMonthlyAmount = (rule: RecurringRule, rateFor?: (currency: string) => number | null) =>
  round2(ruleBaseAmount(rule, rateFor) / intervalOf(rule));

/**
 * Turn every due occurrence into a transaction. Transaction ids are derived from
 * the rule and month, so running this twice never creates duplicates.
 * Foreign-currency rules convert at `rateFor(currency)` (latest known rate), else the rule's last rate.
 */
export function materialize(
  rules: RecurringRule[],
  today: string,
  rateFor?: (currency: string) => number | null,
): { created: Transaction[]; rules: RecurringRule[] } {
  const created: Transaction[] = [];
  let changed = false;
  const next = rules.map((r) => {
    const dates = dueOccurrences(r, today);
    if (!dates.length) return r;
    changed = true;
    const rate = r.currency ? (rateFor?.(r.currency) ?? r.rate ?? 1) : undefined;
    for (const date of dates) {
      created.push({
        id: `${r.id}:${monthOf(date)}`,
        type: r.type,
        amount: ruleBaseAmount(r, () => rate ?? null),
        category: r.category,
        note: r.note,
        date,
        recurringId: r.id,
        ...(r.currency && rate ? { original: { amount: r.amount, currency: r.currency, rate } } : {}),
        ...(r.spreadMonths && r.spreadMonths > 1 ? { spread: r.spreadMonths } : {}),
        ...(r.sample ? { sample: true } : {}),
      });
    }
    return { ...r, lastGenerated: monthOf(dates[dates.length - 1]), ...(rate ? { rate } : {}) };
  });
  return { created, rules: changed ? next : rules };
}

/** The latest month on the rule's schedule that is at or before `month`, or null if before the start. */
function scheduledAtOrBefore(rule: RecurringRule, month: string): string | null {
  const diff = monthDiff(rule.startMonth, month);
  if (diff < 0) return null;
  return shiftMonth(rule.startMonth, diff - (diff % intervalOf(rule)));
}

/** Resume a paused rule without back-filling the occurrences it was paused for. */
export function resumeRule(rule: RecurringRule, today: string): RecurringRule {
  let skip = scheduledAtOrBefore(rule, monthOf(today));
  if (skip && dateForMonth(skip, rule.day) > today) skip = scheduledAtOrBefore(rule, shiftMonth(skip, -1));
  const last = skip && (!rule.lastGenerated || skip > rule.lastGenerated) ? skip : rule.lastGenerated;
  const resumed: RecurringRule = { ...rule, paused: false };
  if (last) resumed.lastGenerated = last;
  return resumed;
}

/**
 * An active repeating item that looks like the same bill or income as `tx`: same type and category,
 * and the same note when both have one. Used to offer "stop the old one" when adding a replacement.
 */
export function findSimilarRule(
  rules: RecurringRule[],
  tx: { type: TxType; category: string; note: string },
): RecurringRule | undefined {
  const note = tx.note.trim().toLowerCase();
  return rules.find(
    (r) =>
      !r.paused &&
      r.type === tx.type &&
      r.category === tx.category &&
      (!note || !r.note.trim() || r.note.trim().toLowerCase() === note),
  );
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
