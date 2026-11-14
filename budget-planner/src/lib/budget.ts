import type { RecurringRule } from './recurring';

export type TxType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TxType;
  amount: number; // in the base currency; always positive, sign comes from `type`
  category: string;
  note: string;
  date: string; // YYYY-MM-DD
  recurringId?: string; // set when created by a repeating rule
  /** Set when entered in another currency: `amount` = round(original.amount * original.rate). */
  original?: Money;
  /**
   * Count this payment across this many months (2+), starting the month it was paid.
   * E.g. ₦3,000,000 yearly rent with spread 12 counts as ₦250,000 a month.
   */
  spread?: number;
}

/** A transaction as it counts in one month: spread payments appear as their monthly share. */
export interface Entry extends Transaction {
  share?: { index: number; of: number; total: number };
}

/** An amount in a non-base currency and the rate used: `rate` base units per 1 unit of `currency`. */
export interface Money {
  amount: number;
  currency: string;
  rate: number;
}

/** Monthly spending limit per expense category, e.g. { Groceries: 400 } */
export type Budgets = Record<string, number>;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Housing',
  'Groceries',
  'Dining',
  'Transport',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Other',
];

export const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Gifts', 'Other income'];

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CHF', 'SEK', 'NOK',
  'DKK', 'PLN', 'INR', 'CNY', 'HKD', 'SGD', 'KRW', 'MXN', 'BRL', 'ZAR',
];

const PALETTE_SIZE = 12;

/** Stable colour per expense category (CSS tokens --cat-1..12; --cat-0 for unknown/deleted ones). */
export function categoryColor(category: string, expenseCategories: readonly string[]): string {
  const i = expenseCategories.indexOf(category);
  return i === -1 ? 'var(--cat-0)' : `var(--cat-${(i % PALETTE_SIZE) + 1})`;
}

/** Round to cents, correcting float noise (1200.5 * 1520.35 = …0.17499999 should be …0.18). */
export const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(15))) / 100;

/** "2026-11-14" -> "2026-11" */
export const monthOf = (date: string): string => date.slice(0, 7);

/** Shift a "YYYY-MM" key by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string, style: 'long' | 'short' = 'long'): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

export const shortDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const inMonth = (txs: Transaction[], month: string) =>
  txs.filter((t) => monthOf(t.date) === month);

/** Whole months from `from` to `to` ("2026-11" -> "2027-02" = 3). */
export function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** The k-th (0-based) of n equal shares; the last one absorbs rounding so the shares add up exactly. */
export function shareAmount(total: number, n: number, k: number): number {
  const each = round2(total / n);
  return k === n - 1 ? round2(total - each * (n - 1)) : each;
}

export const isSpread = (t: Pick<Transaction, 'spread'>) => !!t.spread && t.spread > 1;

/**
 * What counts in `month`: ordinary transactions dated that month, plus this month's share of any
 * payment spread over several months (like yearly rent). Use this for totals, budgets and charts.
 */
export function effectiveInMonth(txs: Transaction[], month: string): Entry[] {
  const out: Entry[] = [];
  for (const t of txs) {
    if (!isSpread(t)) {
      if (monthOf(t.date) === month) out.push(t);
      continue;
    }
    const n = t.spread!;
    const k = monthDiff(monthOf(t.date), month);
    if (k < 0 || k >= n) continue;
    out.push({ ...t, amount: shareAmount(t.amount, n, k), share: { index: k + 1, of: n, total: t.amount } });
  }
  return out;
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
  savingsRate: number; // 0..1, or 0 when there is no income
}

export function totals(txs: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  const net = income - expense;
  return { income, expense, net, savingsRate: income > 0 ? Math.max(net, 0) / income : 0 };
}

/** Expense totals by category, largest first. */
export function spendingByCategory(txs: Transaction[]): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Income/expense for the `count` months ending at `endMonth` (oldest first). */
export function monthlyTrend(txs: Transaction[], endMonth: string, count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(endMonth, i - (count - 1));
    const { income, expense } = totals(effectiveInMonth(txs, month));
    return { month, income, expense };
  });
}

export interface BudgetStatus {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  ratio: number; // spent / limit
  state: 'ok' | 'warn' | 'over';
}

export function budgetStatus(txs: Transaction[], budgets: Budgets): BudgetStatus[] {
  const spent = new Map(spendingByCategory(txs).map((s) => [s.category, s.amount]));
  return Object.entries(budgets)
    .filter(([, limit]) => limit > 0)
    .map(([category, limit]) => {
      const s = spent.get(category) ?? 0;
      const ratio = s / limit;
      return {
        category,
        limit,
        spent: s,
        remaining: limit - s,
        ratio,
        state: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok',
      } satisfies BudgetStatus;
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Parse a user-entered amount like "1,234.50", "$12" or "€9". Returns null if invalid or <= 0. */
export function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(txs: Transaction[]): string {
  const header = ['date', 'type', 'category', 'amount', 'note', 'original_amount', 'original_currency', 'rate', 'spread_months'];
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) =>
      [
        t.date,
        t.type,
        t.category,
        t.amount.toFixed(2),
        t.note,
        t.original ? t.original.amount.toFixed(2) : '',
        t.original?.currency ?? '',
        t.original ? String(t.original.rate) : '',
        isSpread(t) ? String(t.spread) : '',
      ]
        .map(csvCell)
        .join(','),
    );
  return [header.join(','), ...rows].join('\n');
}

const fmtCache = new Map<string, Intl.NumberFormat>();

/**
 * Format an amount. `narrow` (used for the base currency) prefers the local sign, e.g. ₦ rather than "NGN";
 * without it, foreign amounts keep the standard symbol so "$" isn't confused with another dollar.
 */
export function formatMoney(
  n: number,
  currency = 'USD',
  opts: { compact?: boolean; narrow?: boolean } = {},
): string {
  const key = `${currency}|${opts.compact ? 'c' : 's'}|${opts.narrow ? 'n' : ''}`;
  let f = fmtCache.get(key);
  if (!f) {
    const display = opts.narrow ? ({ currencyDisplay: 'narrowSymbol' } as const) : {};
    try {
      f = new Intl.NumberFormat(
        undefined,
        opts.compact
          ? { style: 'currency', currency, ...display, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }
          : { style: 'currency', currency, ...display },
      );
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    fmtCache.set(key, f);
  }
  return f.format(n);
}

export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export function currencyName(currency: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Sample data so the first visit isn't an empty screen. Rent and salary are repeating rules. */
export function sampleData(month: string): {
  transactions: Transaction[];
  budgets: Budgets;
  recurring: RecurringRule[];
} {
  const d = (m: string, day: number) => `${m}-${String(day).padStart(2, '0')}`;
  const recurring: RecurringRule[] = [
    { id: 'sample-salary', type: 'income', amount: 4200, category: 'Salary', note: 'Paycheck', day: 1, startMonth: shiftMonth(month, -3), lastGenerated: month },
    { id: 'sample-rent', type: 'expense', amount: 1450, category: 'Housing', note: 'Rent', day: 2, startMonth: shiftMonth(month, -3), lastGenerated: month },
  ];
  const transactions: Transaction[] = [];
  for (let i = 0; i < 4; i++) {
    const m = shiftMonth(month, -i);
    const wobble = (base: number, k: number) => Math.round(base * (1 + ((i * 7 + k) % 5) * 0.06));
    for (const r of recurring) {
      transactions.push({ id: `${r.id}:${m}`, type: r.type, amount: r.amount, category: r.category, note: r.note, date: d(m, r.day), recurringId: r.id });
    }
    transactions.push(
      { id: newId(), type: 'expense', amount: wobble(320, 1), category: 'Groceries', note: 'Weekly shops', date: d(m, 6) },
      { id: newId(), type: 'expense', amount: wobble(140, 2), category: 'Dining', note: 'Eating out', date: d(m, 9) },
      { id: newId(), type: 'expense', amount: wobble(95, 3), category: 'Transport', note: 'Transit pass', date: d(m, 3) },
      { id: newId(), type: 'expense', amount: wobble(160, 4), category: 'Utilities', note: 'Power & internet', date: d(m, 12) },
      { id: newId(), type: 'expense', amount: wobble(80, 0), category: 'Entertainment', note: 'Streaming & cinema', date: d(m, 14) },
    );
    if (i % 2 === 0)
      transactions.push({ id: newId(), type: 'income', amount: 650, category: 'Freelance', note: 'Side project', date: d(m, 10) });
  }
  return {
    transactions,
    budgets: { Groceries: 380, Dining: 150, Transport: 120, Entertainment: 100, Shopping: 200 },
    recurring,
  };
}
