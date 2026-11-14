import { useEffect, useState } from 'react';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  monthOf,
  sampleData,
  todayISO,
  type Budgets,
  type Transaction,
  type TxType,
} from './budget';
import { conversionRate, round2, type RateCache } from './currency';
import { materialize, type RecurringRule } from './recurring';
import { readJSON, writeJSON } from './storage';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  currency: string;
  theme: Theme;
  expenseCategories: string[];
  incomeCategories: string[];
}

export interface AppData {
  version: 2;
  transactions: Transaction[];
  budgets: Budgets;
  recurring: RecurringRule[];
  settings: Settings;
  rates?: RateCache;
}

const KEY = 'bp.data';

export const defaultSettings = (): Settings => ({
  currency: 'USD',
  theme: 'system',
  expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
  incomeCategories: [...DEFAULT_INCOME_CATEGORIES],
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isTxArray = (v: unknown): v is Transaction[] =>
  Array.isArray(v) &&
  v.every((t) => isObj(t) && typeof t.id === 'string' && typeof t.amount === 'number' && typeof t.date === 'string');
const isBudgets = (v: unknown): v is Budgets => isObj(v) && Object.values(v).every((n) => typeof n === 'number');

export function isAppData(v: unknown): v is AppData {
  if (!isObj(v) || v.version !== 2 || !isObj(v.settings)) return false;
  const s = v.settings;
  return (
    isTxArray(v.transactions) &&
    isBudgets(v.budgets) &&
    Array.isArray(v.recurring) &&
    typeof s.currency === 'string' &&
    isStrArr(s.expenseCategories) &&
    isStrArr(s.incomeCategories)
  );
}

export function loadData(today: string): AppData {
  const saved = readJSON(KEY);
  if (isAppData(saved)) return { ...saved, settings: { ...defaultSettings(), ...saved.settings } };

  // Migrate from the first version, which stored two separate keys.
  const oldTx = readJSON('bp.transactions');
  if (isTxArray(oldTx)) {
    const oldBudgets = readJSON('bp.budgets');
    return { version: 2, transactions: oldTx, budgets: isBudgets(oldBudgets) ? oldBudgets : {}, recurring: [], settings: defaultSettings() };
  }

  return { version: 2, ...sampleData(monthOf(today)), settings: defaultSettings() };
}

/** Add any repeating transactions that have come due. Returns the same object when nothing changed. */
export function applyRecurring(data: AppData, today: string): AppData {
  const { created, rules } = materialize(data.recurring, today, (c) =>
    conversionRate(data.rates, c, data.settings.currency),
  );
  if (rules === data.recurring) return data;
  const ids = new Set(data.transactions.map((t) => t.id));
  return { ...data, recurring: rules, transactions: [...data.transactions, ...created.filter((t) => !ids.has(t.id))] };
}

export function emptyData(settings: Settings): AppData {
  return { version: 2, transactions: [], budgets: {}, recurring: [], settings };
}

/* ---------- Base currency ---------- */

/**
 * Switch the base currency.
 * - 'convert': every base amount is multiplied by `rate` (new units per 1 old unit) and keeps a note of
 *   what it was originally, so a $1,450 rent becomes ₦2.2M "from $1,450". Repeating items keep being paid
 *   in their original currency and convert each month.
 * - 'relabel': the numbers stay the same; only the currency they're shown in changes (for data that was
 *   really in the new currency all along).
 * Either way, anything originally in the new currency goes back to its exact original amount.
 */
export function changeBaseCurrency(d: AppData, newBase: string, mode: 'convert' | 'relabel', rate = 1): AppData {
  const oldBase = d.settings.currency;
  if (newBase === oldBase) return d;
  const convert = mode === 'convert';

  const transactions = d.transactions.map((t): Transaction => {
    if (t.original?.currency === newBase) {
      const { original, ...rest } = t;
      return { ...rest, amount: original.amount };
    }
    if (!convert) return t;
    if (t.original) return { ...t, amount: round2(t.amount * rate), original: { ...t.original, rate: t.original.rate * rate } };
    return { ...t, amount: round2(t.amount * rate), original: { amount: t.amount, currency: oldBase, rate } };
  });

  const recurring = d.recurring.map((r): RecurringRule => {
    if (r.currency === newBase) {
      const rest = { ...r };
      delete rest.currency;
      delete rest.rate;
      return rest;
    }
    if (!convert) return r;
    if (r.currency) return { ...r, rate: (r.rate ?? 1) * rate };
    return { ...r, currency: oldBase, rate };
  });

  const budgets = convert
    ? Object.fromEntries(Object.entries(d.budgets).map(([c, v]) => [c, round2(v * rate)]))
    : d.budgets;

  return { ...d, transactions, recurring, budgets, settings: { ...d.settings, currency: newBase } };
}

/* ---------- Categories ---------- */

const listKey = (type: TxType) => (type === 'expense' ? 'expenseCategories' : 'incomeCategories');

export function categoryNameError(list: string[], name: string, except?: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter a name.';
  if (n.length > 24) return 'Keep it to 24 characters or fewer.';
  if (list.some((c) => c !== except && c.toLowerCase() === n.toLowerCase())) return `“${n}” already exists.`;
  return null;
}

export function addCategory(d: AppData, type: TxType, name: string): AppData {
  const k = listKey(type);
  return { ...d, settings: { ...d.settings, [k]: [...d.settings[k], name.trim()] } };
}

/** Rename everywhere: the category list, transactions, repeating rules and budgets. */
export function renameCategory(d: AppData, type: TxType, from: string, to: string): AppData {
  const name = to.trim();
  const k = listKey(type);
  const swap = <T extends { type: TxType; category: string }>(x: T): T =>
    x.type === type && x.category === from ? { ...x, category: name } : x;
  const budgets =
    type === 'expense'
      ? Object.fromEntries(Object.entries(d.budgets).map(([c, v]) => [c === from ? name : c, v]))
      : d.budgets;
  return {
    ...d,
    settings: { ...d.settings, [k]: d.settings[k].map((c) => (c === from ? name : c)) },
    transactions: d.transactions.map(swap),
    recurring: d.recurring.map(swap),
    budgets,
  };
}

/** Remove from the list (and its budget). Existing transactions keep the label. */
export function deleteCategory(d: AppData, type: TxType, name: string): AppData {
  const k = listKey(type);
  const budgets = { ...d.budgets };
  if (type === 'expense') delete budgets[name];
  return { ...d, budgets, settings: { ...d.settings, [k]: d.settings[k].filter((c) => c !== name) } };
}

/* ---------- Hook ---------- */

export function useAppData() {
  const [data, setData] = useState<AppData>(() => applyRecurring(loadData(todayISO()), todayISO()));

  useEffect(() => writeJSON(KEY, data), [data]);

  // If the tab is left open across a due date, add the new transactions when it's shown again.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') setData((d) => applyRecurring(d, todayISO()));
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  return [data, setData] as const;
}
