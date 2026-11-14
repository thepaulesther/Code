export type TxType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TxType;
  amount: number; // always positive; sign comes from `type`
  category: string;
  note: string;
  date: string; // YYYY-MM-DD
}

/** Monthly spending limit per expense category, e.g. { Groceries: 400 } */
export type Budgets = Record<string, number>;

export const EXPENSE_CATEGORIES = [
  'Housing',
  'Groceries',
  'Dining',
  'Transport',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Other',
] as const;

export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Gifts', 'Other income'] as const;

/** Stable categorical colour per expense category (CSS tokens --cat-1..9 in index.css). */
export const categoryColor = (category: string) => {
  const i = (EXPENSE_CATEGORIES as readonly string[]).indexOf(category);
  return `var(--cat-${i === -1 ? 9 : i + 1})`;
};

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

export const inMonth = (txs: Transaction[], month: string) =>
  txs.filter((t) => monthOf(t.date) === month);

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
    const { income, expense } = totals(inMonth(txs, month));
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

/** Parse a user-entered amount like "1,234.50" or "$12". Returns null if invalid or <= 0. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(txs: Transaction[]): string {
  const header = ['date', 'type', 'category', 'amount', 'note'];
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.type, t.category, t.amount.toFixed(2), t.note].map(csvCell).join(','));
  return [header.join(','), ...rows].join('\n');
}

export const formatMoney = (n: number, opts: { compact?: boolean } = {}) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 2,
  }).format(n);

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Sample data so the first visit isn't an empty screen. */
export function sampleData(month: string): { transactions: Transaction[]; budgets: Budgets } {
  const d = (m: string, day: number) => `${m}-${String(day).padStart(2, '0')}`;
  const transactions: Transaction[] = [];
  for (let i = 0; i < 4; i++) {
    const m = shiftMonth(month, -i);
    const wobble = (base: number, k: number) => Math.round(base * (1 + ((i * 7 + k) % 5) * 0.06));
    transactions.push(
      { id: newId(), type: 'income', amount: 4200, category: 'Salary', note: 'Paycheck', date: d(m, 1) },
      { id: newId(), type: 'expense', amount: 1450, category: 'Housing', note: 'Rent', date: d(m, 2) },
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
  };
}
