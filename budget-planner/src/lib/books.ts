import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  effectiveInMonth,
  newId,
  round2,
  totals,
  type Budgets,
  type Transaction,
} from './budget';
import type { RateCache } from './currency';
import { fromMinor, toMinor } from './money';
import type { AlertLevel, Goal, PlanSettings } from './plan';
import type { RecurringRule } from './recurring';
import type { AppData, Settings } from './store';

/**
 * Books: Personal and Business money are kept apart. Every transaction, repeating item, budget and goal
 * belongs to one book. Money moved between the two is a transfer (never income or spending), a payment
 * that was partly both is split into two linked entries, and payments not yet placed wait in "unsorted".
 *
 * Screens work on one book at a time through `viewOf` (the same shape the app has always used), and
 * `mergeView` puts their changes back, so everything that already works keeps working per book.
 */

export type Book = 'personal' | 'business';
export const BOOKS: readonly Book[] = ['personal', 'business'];
export const bookName = (b: Book) => (b === 'business' ? 'Business' : 'Personal');
export const otherBook = (b: Book): Book => (b === 'business' ? 'personal' : 'business');
export const isBook = (v: unknown): v is Book => v === 'personal' || v === 'business';

export const BUSINESS_EXPENSE_CATEGORIES = ['Stock', 'Shop rent', 'Staff pay', 'Transport and delivery', 'Tax', 'Utilities', 'Equipment', 'Other'];
export const BUSINESS_INCOME_CATEGORIES = ['Sales', 'Services', 'Other income'];

export interface BookData {
  transactions: Transaction[];
  budgets: Budgets;
  recurring: RecurringRule[];
  goals: Goal[];
  expenseCategories: string[];
  incomeCategories: string[];
  plan?: PlanSettings;
  /** The most serious alert already raised per month, per book. */
  alertLog?: Record<string, AlertLevel>;
}

/** Money moved between your own books, e.g. "Pay yourself" from Business to Personal. */
export interface Transfer {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // base currency, positive
  from: Book;
  to: Book;
  note: string;
}

/** Where money sits. One "Main" account per book for now; bank-linked accounts come later. */
export interface Account {
  id: string;
  book: Book;
  name: string;
  kind: 'main';
}

export type SharedSettings = Pick<Settings, 'currency' | 'theme' | 'alerts' | 'locale' | 'business' | 'book'>;

/** Everything Elora keeps, in memory (amounts in major units, e.g. naira). Saved as format v3 in minor units. */
export interface Store {
  version: 3;
  settings: SharedSettings;
  books: Record<Book, BookData>;
  transfers: Transfer[];
  unsorted: Transaction[];
  accounts: Account[];
  rates?: RateCache;
}

export const emptyBook = (book: Book): BookData => ({
  transactions: [],
  budgets: {},
  recurring: [],
  goals: [],
  expenseCategories: [...(book === 'business' ? BUSINESS_EXPENSE_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES)],
  incomeCategories: [...(book === 'business' ? BUSINESS_INCOME_CATEGORIES : DEFAULT_INCOME_CATEGORIES)],
});

export const mainAccounts = (): Account[] => BOOKS.map((book) => ({ id: `main-${book}`, book, name: 'Main', kind: 'main' }));

/** The book the screens show: always Personal unless business mode is on. */
export const activeBook = (s: Store): Book => (s.settings.business && s.settings.book === 'business' ? 'business' : 'personal');

const SHARED_KEYS = ['currency', 'theme', 'alerts', 'locale', 'business', 'book'] as const;

function sharedOf(settings: Settings): SharedSettings {
  const out: SharedSettings = { currency: settings.currency, theme: settings.theme };
  for (const k of SHARED_KEYS) if (settings[k] !== undefined) (out as Record<string, unknown>)[k] = settings[k];
  return out;
}

/** One book in the shape the screens use. */
export function viewOf(s: Store, book: Book = activeBook(s)): AppData {
  const b = s.books[book];
  const settings: Settings = {
    ...s.settings,
    expenseCategories: b.expenseCategories,
    incomeCategories: b.incomeCategories,
  };
  if (b.plan) settings.plan = b.plan;
  const view: AppData = { version: 2, transactions: b.transactions, budgets: b.budgets, recurring: b.recurring, goals: b.goals, settings };
  if (s.rates) view.rates = s.rates;
  if (b.alertLog) view.alertLog = b.alertLog;
  return view;
}

/** Put a changed view back into the store. Shared settings (currency, theme…) apply to both books. */
export function mergeView(s: Store, book: Book, v: AppData): Store {
  const b: BookData = {
    transactions: v.transactions,
    budgets: v.budgets,
    recurring: v.recurring,
    goals: v.goals ?? [],
    expenseCategories: v.settings.expenseCategories,
    incomeCategories: v.settings.incomeCategories,
  };
  if (v.settings.plan) b.plan = v.settings.plan;
  if (v.alertLog) b.alertLog = v.alertLog;
  const next: Store = { ...s, settings: sharedOf(v.settings), books: { ...s.books, [book]: b } };
  if (v.rates) next.rates = v.rates;
  else delete next.rates;
  return next;
}

/** A whole store from one old (v2-shaped) data set: everything goes to Personal. */
export function storeFromView(v: AppData): Store {
  const base: Store = {
    version: 3,
    settings: sharedOf(v.settings),
    books: { personal: emptyBook('personal'), business: emptyBook('business') },
    transfers: [],
    unsorted: [],
    accounts: mainAccounts(),
  };
  return mergeView(base, 'personal', v);
}

export function emptyStore(settings: Settings): Store {
  return storeFromView({ version: 2, transactions: [], budgets: {}, recurring: [], goals: [], settings });
}

/* ---------- Business mode ---------- */

export function setBusinessMode(s: Store, on: boolean): Store {
  const settings: SharedSettings = { ...s.settings, business: on };
  if (!on) settings.book = 'personal';
  return { ...s, settings };
}

export const setActiveBook = (s: Store, book: Book): Store => ({ ...s, settings: { ...s.settings, book } });

/* ---------- Transfers ---------- */

export function addTransfer(s: Store, t: Omit<Transfer, 'id'>): Store {
  if (t.from === t.to || !(t.amount > 0)) return s;
  return { ...s, transfers: [...s.transfers, { ...t, id: newId(), amount: round2(t.amount) }] };
}

export const deleteTransfer = (s: Store, id: string): Store => ({ ...s, transfers: s.transfers.filter((t) => t.id !== id) });

/** Money moved into and out of a book in a month. Never part of income or spending. */
export function transferTotals(s: Store, book: Book, month: string): { in: number; out: number } {
  let inn = 0;
  let out = 0;
  for (const t of s.transfers) {
    if (!t.date.startsWith(month)) continue;
    if (t.to === book) inn += t.amount;
    if (t.from === book) out += t.amount;
  }
  return { in: round2(inn), out: round2(out) };
}

/** A book's money for the month: income − spending, plus transfers in, minus transfers out. */
export function bookBalance(s: Store, book: Book, month: string): number {
  const t = totals(effectiveInMonth(s.books[book].transactions, month));
  const tr = transferTotals(s, book, month);
  return round2(t.income - t.expense + tr.in - tr.out);
}

/** Both books together. Transfers cancel out, so they're left out entirely. */
export function everythingTotals(s: Store, month: string): { income: number; expense: number; net: number } {
  const all = [...s.books.personal.transactions, ...s.books.business.transactions];
  const t = totals(effectiveInMonth(all, month));
  return { income: round2(t.income), expense: round2(t.expense), net: round2(t.income - t.expense) };
}

/* ---------- Unsorted, moving and splitting ---------- */

const withBookTx = (s: Store, book: Book, f: (txs: Transaction[]) => Transaction[]): Store => ({
  ...s,
  books: { ...s.books, [book]: { ...s.books[book], transactions: f(s.books[book].transactions) } },
});

export function addUnsorted(s: Store, txs: Transaction[]): Store {
  return txs.length ? { ...s, unsorted: [...s.unsorted, ...txs] } : s;
}

/** Place an unsorted payment in a book. */
export function sortInto(s: Store, id: string, book: Book): Store {
  const t = s.unsorted.find((x) => x.id === id);
  if (!t) return s;
  return withBookTx({ ...s, unsorted: s.unsorted.filter((x) => x.id !== id) }, book, (txs) => [...txs, t]);
}

/** Move a transaction to the other book. A payment made by a repeating item is unlinked from it. */
export function moveTransaction(s: Store, id: string, from: Book): Store {
  const t = s.books[from].transactions.find((x) => x.id === id);
  if (!t) return s;
  const moved = { ...t };
  delete moved.recurringId;
  const without = withBookTx(s, from, (txs) => txs.filter((x) => x.id !== id));
  return withBookTx(without, otherBook(from), (txs) => [...txs, moved]);
}

/**
 * Split one payment between the books: `businessPart` goes to Business, the rest to Personal.
 * The two parts share a `splitId`, so they can be found and edited together.
 */
function splitParts(t: Transaction, businessPart: number): { personal: Transaction; business: Transaction } | null {
  const biz = round2(businessPart);
  const total = t.amount;
  if (!(biz > 0) || !(biz < total)) return null;
  const splitId = t.splitId ?? newId();
  const part = (amount: number, id: string): Transaction => {
    const p: Transaction = { ...t, id, amount, splitId };
    delete p.original; // a part of a converted payment is recorded in the base currency
    delete p.recurringId;
    delete p.sample;
    return p;
  };
  return { business: part(biz, newId()), personal: part(round2(total - biz), newId()) };
}

export function splitUnsorted(s: Store, id: string, businessPart: number): Store {
  const t = s.unsorted.find((x) => x.id === id);
  const parts = t && splitParts(t, businessPart);
  if (!parts) return s;
  let next: Store = { ...s, unsorted: s.unsorted.filter((x) => x.id !== id) };
  next = withBookTx(next, 'business', (txs) => [...txs, parts.business]);
  return withBookTx(next, 'personal', (txs) => [...txs, parts.personal]);
}

export function splitTransaction(s: Store, id: string, from: Book, businessPart: number): Store {
  const t = s.books[from].transactions.find((x) => x.id === id);
  const parts = t && splitParts(t, businessPart);
  if (!parts) return s;
  let next = withBookTx(s, from, (txs) => txs.filter((x) => x.id !== id));
  next = withBookTx(next, 'business', (txs) => [...txs, parts.business]);
  return withBookTx(next, 'personal', (txs) => [...txs, parts.personal]);
}

/** The other part of a split payment, if any. */
export function splitPartner(s: Store, t: Transaction, book: Book): Transaction | undefined {
  return t.splitId ? s.books[otherBook(book)].transactions.find((x) => x.splitId === t.splitId) : undefined;
}

/* ---------- Saved format (v3, minor units) ---------- */

type Conv = (n: number, currency?: string) => number;
type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
/** Convert a value only when it's a number; anything else is left for validation to reject. */
const num = (v: unknown, f: Conv, cur?: string) => (typeof v === 'number' && Number.isFinite(v) ? f(v, cur) : v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function convTx(t: unknown, f: Conv, base: string): unknown {
  if (!isObj(t)) return t;
  const out: Rec = { ...t, amount: num(t.amount, f, base) };
  if (isObj(t.original)) out.original = { ...t.original, amount: num(t.original.amount, f, t.original.currency as string) };
  return out;
}

function convBook(b: unknown, f: Conv, base: string): unknown {
  if (!isObj(b)) return b;
  const out: Rec = {
    ...b,
    transactions: list(b.transactions).map((t) => convTx(t, f, base)),
    budgets: isObj(b.budgets) ? Object.fromEntries(Object.entries(b.budgets).map(([k, v]) => [k, num(v, f, base)])) : b.budgets,
    recurring: list(b.recurring).map((r) =>
      isObj(r) ? { ...r, amount: num(r.amount, f, (typeof r.currency === 'string' && r.currency) || base) } : r,
    ),
    goals: list(b.goals).map((g) =>
      isObj(g)
        ? {
            ...g,
            target: num(g.target, f, base),
            contributions: list(g.contributions).map((c) => (isObj(c) ? { ...c, amount: num(c.amount, f, base) } : c)),
          }
        : g,
    ),
  };
  if (isObj(b.plan) && b.plan.income != null) out.plan = { ...b.plan, income: num(b.plan.income, f, base) };
  return out;
}

function convAll(d: Rec, f: Conv): Rec {
  const base = isObj(d.settings) && typeof d.settings.currency === 'string' ? d.settings.currency : '';
  const books = isObj(d.books) ? d.books : {};
  return {
    ...d,
    books: Object.fromEntries(Object.entries(books).map(([k, b]) => [k, convBook(b, f, base)])),
    transfers: list(d.transfers).map((t) => (isObj(t) ? { ...t, amount: num(t.amount, f, base) } : t)),
    unsorted: list(d.unsorted).map((t) => convTx(t, f, base)),
  };
}

/** The store as saved: amounts in minor units. */
export function encodeStore(s: Store): Rec {
  return convAll(JSON.parse(JSON.stringify(s)) as Rec, toMinor);
}

/**
 * Saved v3 data back into memory, amounts in major units. Fills anything missing (the Business book,
 * accounts, lists). Returns null when it isn't v3-shaped; the records themselves are checked by the store.
 */
export function decodeStore(raw: unknown): Store | null {
  if (!isObj(raw) || raw.version !== 3 || !isObj(raw.books) || !isObj(raw.books.personal) || !isObj(raw.settings)) return null;
  const d = convAll(raw, fromMinor);
  const books = d.books as Rec;
  const fill = (book: Book): BookData => {
    const b = isObj(books[book]) ? (books[book] as Rec) : {};
    const empty = emptyBook(book);
    return { ...empty, ...b, goals: Array.isArray(b.goals) ? (b.goals as Goal[]) : [] } as BookData;
  };
  const store: Store = {
    version: 3,
    settings: d.settings as SharedSettings,
    books: { personal: fill('personal'), business: fill('business') },
    transfers: list(d.transfers) as Transfer[],
    unsorted: list(d.unsorted) as Transaction[],
    accounts: Array.isArray(d.accounts) && d.accounts.length ? (d.accounts as Account[]) : mainAccounts(),
  };
  if (isObj(d.rates)) store.rates = d.rates as unknown as RateCache;
  return store;
}

/**
 * The v2 → v3 upgrade of saved data: everything goes to the Personal book, an empty Business book is
 * added, amounts become minor units. Works on raw saved data and never changes its input.
 */
export function upgradeV2toV3(d: Rec): Rec {
  const s = isObj(d.settings) ? d.settings : {};
  const personal: Rec = {
    transactions: d.transactions,
    budgets: d.budgets,
    recurring: d.recurring,
    goals: Array.isArray(d.goals) ? d.goals : [],
  };
  if (s.expenseCategories !== undefined) personal.expenseCategories = s.expenseCategories;
  if (s.incomeCategories !== undefined) personal.incomeCategories = s.incomeCategories;
  if (s.plan !== undefined) personal.plan = s.plan;
  if (d.alertLog !== undefined) personal.alertLog = d.alertLog;
  const settings: Rec = {};
  for (const k of ['currency', 'theme', 'alerts'] as const) if (s[k] !== undefined) settings[k] = s[k];
  const out: Rec = {
    version: 3,
    settings,
    books: { personal, business: emptyBook('business') },
    transfers: [],
    unsorted: [],
    accounts: mainAccounts(),
  };
  if (d.rates !== undefined) out.rates = d.rates;
  return convAll(out, toMinor);
}
