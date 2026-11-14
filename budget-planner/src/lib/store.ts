import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  monthOf,
  newId,
  SAMPLE_ONE_OFFS,
  todayISO,
  type Budgets,
  type Transaction,
  type TxType,
} from './budget';
import { conversionRate, round2, type RateCache } from './currency';
import { DEFAULT_PLAN, syncAutoSavings, type AlertLevel, type Goal, type PlanSettings } from './plan';
import { materialize, type RecurringRule } from './recurring';
import { CURRENT_VERSION, migrate, versionOf } from './migrations';
import { keysWithPrefix, readJSON, readRaw, removeKey, writeRaw } from './storage';

export type Theme = 'system' | 'light' | 'dark';

export interface AlertSettings {
  /** Show warnings when spending passes income or the plan. */
  enabled: boolean;
  /** Play a short alarm sound when a new warning appears. */
  sound: boolean;
  /** Also send a system notification (phone or desktop), if the browser allows it. */
  notify: boolean;
}

export const DEFAULT_ALERTS: AlertSettings = { enabled: true, sound: true, notify: false };

export interface Settings {
  currency: string;
  theme: Theme;
  expenseCategories: string[];
  incomeCategories: string[];
  plan?: PlanSettings;
  alerts?: AlertSettings;
}

export interface AppData {
  version: 2;
  transactions: Transaction[];
  budgets: Budgets;
  recurring: RecurringRule[];
  settings: Settings;
  rates?: RateCache;
  /** Savings goals and the emergency fund. */
  goals?: Goal[];
  /** The most serious alert already raised per month (YYYY-MM), so each one sounds only once. */
  alertLog?: Record<string, AlertLevel>;
}

export const planSettingsOf = (s: Settings): PlanSettings => ({ ...DEFAULT_PLAN, ...s.plan });
export const alertSettingsOf = (s: Settings): AlertSettings => ({ ...DEFAULT_ALERTS, ...s.alerts });

/* ---------- Goals ---------- */

/** Add a new goal or replace an existing one with the same id. */
export function saveGoal(d: AppData, goal: Goal): AppData {
  const goals = d.goals ?? [];
  return {
    ...d,
    goals: goals.some((g) => g.id === goal.id) ? goals.map((g) => (g.id === goal.id ? goal : g)) : [...goals, goal],
  };
}

export const deleteGoal = (d: AppData, id: string): AppData => ({ ...d, goals: (d.goals ?? []).filter((g) => g.id !== id) });

/** Put money into a goal (or take it out, with a negative amount). */
export function addToGoal(d: AppData, id: string, amount: number, date: string): AppData {
  return {
    ...d,
    goals: (d.goals ?? []).map((g) =>
      g.id === id ? { ...g, contributions: [...g.contributions, { id: newId(), date, amount }] } : g,
    ),
  };
}

const KEY = 'bp.data';

export const defaultSettings = (): Settings => ({
  currency: '', // none until the user chooses one
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

/**
 * Data saved before examples were flagged: mark the example rent/salary (ids start with "sample-") and
 * the example one-offs (matching note and day) so "Remove examples" can find them. The user's own
 * entries are never matched: anything created by one of their repeating items is skipped.
 */
export function markLegacySamples(d: AppData): AppData {
  const hasLegacy = d.recurring.some((r) => r.id.startsWith('sample-') && !r.sample);
  if (!hasLegacy) return d;
  const oneOff = new Set(SAMPLE_ONE_OFFS.map(([, note, day]) => `${note}|${day}`));
  const isSample = (t: Transaction) =>
    t.id.startsWith('sample-') ||
    (!t.recurringId && !t.spread && oneOff.has(`${t.note}|${Number(t.date.slice(8, 10))}`));
  return {
    ...d,
    recurring: d.recurring.map((r) => (r.id.startsWith('sample-') ? { ...r, sample: true } : r)),
    transactions: d.transactions.map((t) => (isSample(t) ? { ...t, sample: true } : t)),
  };
}

export const hasSamples = (d: AppData) => d.transactions.some((t) => t.sample) || d.recurring.some((r) => r.sample);

/** Delete the example transactions and repeating items. The user's own entries and budgets stay. */
export function removeSamples(d: AppData): { data: AppData; transactions: number; repeating: number } {
  const transactions = d.transactions.filter((t) => !t.sample);
  const recurring = d.recurring.filter((r) => !r.sample);
  return {
    data: { ...d, transactions, recurring },
    transactions: d.transactions.length - transactions.length,
    repeating: d.recurring.length - recurring.length,
  };
}

/** Stop a repeating item. Its past payments stay unless `deletePayments` is set. */
export interface EditOptions {
  /** For a payment made by a repeating item: also change the item, so future payments use the new details. */
  updateFuture?: boolean;
  /** Stop this other repeating item (e.g. an older "Rent" this one replaces). Its past payments stay. */
  replaceRuleId?: string;
}

/** Repeating-item fields that follow a transaction's details. */
function ruleDetailsFrom(tx: Transaction, repeat: 0 | 1 | 12): Omit<RecurringRule, 'id' | 'startMonth'> {
  const rule: Omit<RecurringRule, 'id' | 'startMonth'> = {
    type: tx.type,
    amount: tx.original ? tx.original.amount : tx.amount,
    category: tx.category,
    note: tx.note,
    day: Number(tx.date.slice(8, 10)),
  };
  if (tx.original) {
    rule.currency = tx.original.currency;
    rule.rate = tx.original.rate;
  }
  if (repeat === 12) rule.everyMonths = 12;
  if (tx.spread && tx.spread > 1) rule.spreadMonths = tx.spread;
  return rule;
}

/**
 * Save changes to a transaction, including whether it repeats.
 * - A one-off set to repeat becomes the first payment of a new repeating item; months since then are filled in.
 * - A payment from a repeating item keeps its link; with `updateFuture` the item takes the new details too.
 *   Setting it to not repeat stops the item (payments already recorded stay).
 * Returns the new data and how many payments were filled in.
 */
export function editTransaction(
  d: AppData,
  id: string,
  tx: Transaction,
  repeat: 0 | 1 | 12,
  opts: EditOptions,
  today: string,
): { data: AppData; added: number } {
  const old = d.transactions.find((t) => t.id === id);
  if (!old) return { data: d, added: 0 };

  const next: Transaction = { ...tx, id };
  delete next.sample; // once edited, it's the user's own entry
  delete next.recurringId;
  let data: AppData = d;
  if (opts.replaceRuleId) data = stopRule(data, opts.replaceRuleId, false);

  const linked = old.recurringId ? data.recurring.find((r) => r.id === old.recurringId) : undefined;
  let recurring = data.recurring;

  if (linked && repeat === 0) {
    // Stop repeating: keep every payment, unlinked.
    data = stopRule(data, linked.id, false);
    recurring = data.recurring;
  } else if (linked) {
    next.recurringId = linked.id;
    recurring = recurring.map((r) => {
      if (r.id !== linked.id) return r;
      const updated: RecurringRule = opts.updateFuture
        ? { id: r.id, startMonth: r.startMonth, lastGenerated: r.lastGenerated, ...ruleDetailsFrom(next, repeat) }
        : { ...r };
      if (r.paused) updated.paused = true;
      // How often it repeats is always taken from the form.
      if (repeat === 12) updated.everyMonths = 12;
      else delete updated.everyMonths;
      return updated;
    });
  } else if (repeat > 0) {
    // This entry becomes the first payment; the schedule continues from its month.
    const rule: RecurringRule = {
      id: newId(),
      startMonth: monthOf(next.date),
      lastGenerated: monthOf(next.date),
      ...ruleDetailsFrom(next, repeat),
    };
    next.recurringId = rule.id;
    recurring = [...recurring, rule];
  }

  const before = data.transactions.length;
  const updated = applyRecurring(
    { ...data, recurring, transactions: data.transactions.map((t) => (t.id === id ? next : t)) },
    today,
  );
  return { data: updated, added: updated.transactions.length - before };
}

export function stopRule(d: AppData, id: string, deletePayments: boolean): AppData {
  return {
    ...d,
    recurring: d.recurring.filter((r) => r.id !== id),
    transactions: deletePayments
      ? d.transactions.filter((t) => t.recurringId !== id)
      : d.transactions.map((t) => {
          if (t.recurringId !== id) return t;
          const rest = { ...t };
          delete rest.recurringId;
          return rest;
        }),
  };
}

/* ---------- Opening the store safely ---------- */

/**
 * What was found in storage. Only `ok`, `migrated` and `empty` hand data to the app; `newer` and
 * `unreadable` stop before anything is saved, so data Elora can't read is never overwritten.
 */
export type StoreState =
  | { status: 'ok' | 'empty'; data: AppData }
  | { status: 'migrated'; data: AppData; from: number; snapshotKey: string }
  | { status: 'newer'; version: number; raw: string }
  | { status: 'unreadable'; reason: string; raw: string };

/** Fill missing settings with defaults and validate; null when the data isn't usable. */
export function completeData(candidate: unknown): AppData | null {
  if (!isObj(candidate)) return null;
  const settings = isObj(candidate.settings) ? candidate.settings : {};
  const merged = { ...candidate, settings: { ...defaultSettings(), ...settings } };
  return isAppData(merged) ? markLegacySamples(merged) : null;
}

export function openStore(): StoreState {
  let raw = readRaw(KEY);
  let parsed: unknown;
  if (raw == null) {
    // The first version stored two separate keys; it's upgraded like any other old format.
    const oldTx = readJSON('bp.transactions');
    if (!isTxArray(oldTx)) return { status: 'empty', data: emptyData(defaultSettings()) };
    parsed = { version: 1, transactions: oldTx, budgets: readJSON('bp.budgets') ?? {} };
    raw = JSON.stringify(parsed);
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'unreadable', reason: 'The saved data isn’t complete. It may have been cut off while it was being saved.', raw };
    }
  }
  const version = versionOf(parsed);
  if (version == null) return { status: 'unreadable', reason: 'The saved data doesn’t say which version of Elora saved it.', raw };
  if (version > CURRENT_VERSION) return { status: 'newer', version, raw };
  if (version === CURRENT_VERSION) {
    const data = completeData(parsed);
    return data ? { status: 'ok', data } : { status: 'unreadable', reason: 'Some of the saved data is missing or isn’t in the shape Elora expects.', raw };
  }
  // An older format: keep a verified copy before changing anything.
  const snapshotKey = takeSnapshot(`v${version}`, raw);
  if (!snapshotKey) {
    return {
      status: 'unreadable',
      reason: 'Your data needs a small upgrade, but Elora couldn’t save a safety copy first (browser storage may be full). Nothing was changed.',
      raw,
    };
  }
  const m = migrate(parsed);
  if (!m.ok) return { status: 'unreadable', reason: `${m.reason} Nothing was changed, and a safety copy was kept.`, raw };
  const data = completeData(m.data);
  if (!data) return { status: 'unreadable', reason: 'The upgraded data didn’t pass Elora’s checks. Nothing was changed, and a safety copy was kept.', raw };
  return { status: 'migrated', data, from: version, snapshotKey };
}

/* ---------- Safety copies ---------- */

const SNAPSHOT_PREFIX = 'bp.snapshot.';
const MAX_SNAPSHOTS = 3;

export interface Snapshot {
  key: string;
  /** Why it was taken: "v1" (before an upgrade from version 1), "restore" (before a restore). */
  reason: string;
  at: string;
  bytes: number;
}

export function listSnapshots(): Snapshot[] {
  return keysWithPrefix(SNAPSHOT_PREFIX)
    .map((key) => {
      const rest = key.slice(SNAPSHOT_PREFIX.length);
      const dot = rest.indexOf('.');
      return { key, reason: rest.slice(0, dot), at: rest.slice(dot + 1), bytes: (readRaw(key) ?? '').length };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Save `text` as a safety copy and read it back to make sure it's intact. Keeps the newest
 * MAX_SNAPSHOTS copies. Returns the key, or null when the copy couldn't be saved.
 */
export function takeSnapshot(reason: string, text: string, now = new Date()): string | null {
  const key = `${SNAPSHOT_PREFIX}${reason}.${now.toISOString()}`;
  if (!writeRaw(key, text) || readRaw(key) !== text) {
    removeKey(key);
    return null;
  }
  for (const old of listSnapshots().slice(MAX_SNAPSHOTS)) removeKey(old.key);
  return key;
}

export const readSnapshot = (key: string) => readRaw(key);
export const deleteSnapshot = (key: string) => removeKey(key);

/** Keep data Elora couldn't read under a separate key before starting fresh. */
export function quarantine(raw: string, now = new Date()): boolean {
  return writeRaw(`bp.unreadable.${now.toISOString()}`, raw);
}

export const isEmpty = (d: AppData) =>
  d.transactions.length === 0 && d.recurring.length === 0 && Object.keys(d.budgets).length === 0;

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
  return { version: 2, transactions: [], budgets: {}, recurring: [], goals: [], settings };
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
  // Without a previous currency there's nothing to convert from: the numbers simply get a currency.
  const convert = mode === 'convert' && !!oldBase;

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

/** Bring automatic goal savings (e.g. "20% of income to the emergency fund") in line with the transactions. */
export function withAutoSavings(d: AppData): AppData {
  if (!d.goals?.length) return d;
  const goals = syncAutoSavings(d.goals, d.transactions);
  return goals === d.goals ? d : { ...d, goals };
}

export interface SaveStatus {
  /** The browser refused the last save (storage full or blocked). */
  saveFailed: boolean;
  /** Another tab saved data in a newer format; this tab stops saving until it's reloaded. */
  newerElsewhere: boolean;
}

export function useAppData(initial: AppData) {
  const [data, setRaw] = useState<AppData>(() => withAutoSavings(applyRecurring(initial, todayISO())));
  const [status, setStatus] = useState<SaveStatus>({ saveFailed: false, newerElsewhere: false });

  // Every change (adding, editing, deleting, importing, undo) keeps automatic savings in step.
  const setData = useCallback<Dispatch<SetStateAction<AppData>>>(
    (update) => setRaw((d) => withAutoSavings(typeof update === 'function' ? update(d) : update)),
    [],
  );

  // Save only real changes. Starting from what's stored means opening the app writes nothing.
  const lastSaved = useRef<string | null>(readRaw(KEY));
  useEffect(() => {
    if (status.newerElsewhere) return;
    const text = JSON.stringify(data);
    if (text === lastSaved.current) return;
    const ok = writeRaw(KEY, text);
    if (ok) lastSaved.current = text;
    setStatus((s) => (s.saveFailed === !ok ? s : { ...s, saveFailed: !ok }));
  }, [data, status.newerElsewhere]);

  // Another tab saved: take its data instead of overwriting it with ours.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue == null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.newValue);
      } catch {
        return;
      }
      const v = versionOf(parsed);
      if (v != null && v > CURRENT_VERSION) {
        setStatus((s) => ({ ...s, newerElsewhere: true }));
        return;
      }
      const next = v === CURRENT_VERSION ? completeData(parsed) : null;
      if (!next) return;
      lastSaved.current = e.newValue;
      setRaw(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // If the tab is left open across a due date, add the new transactions when it's shown again.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') setData((d) => applyRecurring(d, todayISO()));
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [setData]);

  return [data, setData, status] as const;
}

/**
 * Today's date (YYYY-MM-DD), kept current while the app stays open: checked every minute and whenever
 * the window comes back into view, so a bill due today is added even if Elora was left open overnight.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const check = () => setToday((prev) => {
      const now = todayISO();
      return now === prev ? prev : now;
    });
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}
