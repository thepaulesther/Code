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
  /** Set when made by a repeating transfer. */
  repeatId?: string;
  /** When this record last changed (ISO time), for merging two devices later. */
  updatedAt?: string;
}

/** A transfer that happens on its own every month, e.g. "Pay yourself ₦200,000 on the 30th". */
export interface RepeatingTransfer {
  id: string;
  from: Book;
  to: Book;
  amount: number;
  day: number; // 1..31
  startMonth: string; // YYYY-MM of the first one
  note: string;
  /** YYYY-MM of the latest month already done (made or skipped). */
  lastGenerated?: string;
  paused?: boolean;
  /** Only move the money when the sending book's balance that month covers it; otherwise skip the month. */
  onlyIfSafe?: boolean;
  /** Months skipped because the sending book couldn't cover it. */
  skipped?: string[];
  updatedAt?: string;
}

/** A record that was deleted, so another device merging later doesn't bring it back. */
export interface Tombstone {
  id: string;
  at: string;
}

/** A change of base currency, with the rate used: groundwork for converting past amounts at their own day's rate. */
export interface RateChange {
  at: string;
  from: string;
  to: string;
  rate: number;
  mode: 'convert' | 'relabel';
}

/** Where money sits. One "Main" account per book for now; bank-linked accounts come later. */
export interface Account {
  id: string;
  book: Book;
  name: string;
  kind: 'main';
}

export type SharedSettings = Pick<Settings, 'currency' | 'theme' | 'alerts' | 'locale' | 'business' | 'book'>;

/** Everything Elora keeps, in memory (amounts in major units, e.g. naira). Saved as format v4 in minor units. */
export interface Store {
  version: 4;
  settings: SharedSettings;
  books: Record<Book, BookData>;
  transfers: Transfer[];
  repeatingTransfers: RepeatingTransfer[];
  unsorted: Transaction[];
  accounts: Account[];
  tombstones: Tombstone[];
  rateLog: RateChange[];
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
    version: 4,
    settings: sharedOf(v.settings),
    books: { personal: emptyBook('personal'), business: emptyBook('business') },
    transfers: [],
    repeatingTransfers: [],
    unsorted: [],
    accounts: mainAccounts(),
    tombstones: [],
    rateLog: [],
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
    repeatingTransfers: list(d.repeatingTransfers).map((t) => (isObj(t) ? { ...t, amount: num(t.amount, f, base) } : t)),
    unsorted: list(d.unsorted).map((t) => convTx(t, f, base)),
  };
}

/** The store as saved: amounts in minor units. */
export function encodeStore(s: Store): Rec {
  return convAll(JSON.parse(JSON.stringify(s)) as Rec, toMinor);
}

/**
 * Saved v4 data back into memory, amounts in major units. Fills anything missing (the Business book,
 * accounts, lists). Returns null when it isn't v3-shaped; the records themselves are checked by the store.
 */
export function decodeStore(raw: unknown): Store | null {
  if (!isObj(raw) || raw.version !== 4 || !isObj(raw.books) || !isObj(raw.books.personal) || !isObj(raw.settings)) return null;
  const d = convAll(raw, fromMinor);
  const books = d.books as Rec;
  const fill = (book: Book): BookData => {
    const b = isObj(books[book]) ? (books[book] as Rec) : {};
    const empty = emptyBook(book);
    return { ...empty, ...b, goals: Array.isArray(b.goals) ? (b.goals as Goal[]) : [] } as BookData;
  };
  const store: Store = {
    version: 4,
    settings: d.settings as SharedSettings,
    books: { personal: fill('personal'), business: fill('business') },
    transfers: list(d.transfers) as Transfer[],
    repeatingTransfers: list(d.repeatingTransfers) as RepeatingTransfer[],
    unsorted: list(d.unsorted) as Transaction[],
    accounts: Array.isArray(d.accounts) && d.accounts.length ? (d.accounts as Account[]) : mainAccounts(),
    tombstones: list(d.tombstones) as Tombstone[],
    rateLog: list(d.rateLog) as RateChange[],
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

/**
 * The v3 → v4 upgrade of saved data: room for repeating transfers, deletion markers and the log of
 * base-currency changes. Nothing existing changes.
 */
export function upgradeV3toV4(d: Rec): Rec {
  // Same key order as a normal save, so opening upgraded data and saving it again writes nothing new.
  const { settings, books, transfers, unsorted, accounts, repeatingTransfers, tombstones, rateLog, ...rest } = d;
  return {
    ...rest,
    version: 4,
    settings,
    books,
    transfers,
    repeatingTransfers: list(repeatingTransfers),
    unsorted,
    accounts,
    tombstones: list(tombstones),
    rateLog: list(rateLog),
  };
}

/* ---------- Repeating transfers ---------- */

const pad2 = (n: number) => String(n).padStart(2, '0');
const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${pad2(mo + 1)}`;
};
const lastDay = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
};

/**
 * Start a repeating transfer. It begins this month when its day is still to come, otherwise next month,
 * so nothing is back-dated.
 */
export function addRepeatingTransfer(
  s: Store,
  r: Pick<RepeatingTransfer, 'from' | 'to' | 'amount' | 'day' | 'note' | 'onlyIfSafe'>,
  today: string,
): Store {
  if (r.from === r.to || !(r.amount > 0) || !(r.day >= 1 && r.day <= 31)) return s;
  const month = today.slice(0, 7);
  const startMonth = r.day >= Number(today.slice(8, 10)) ? month : nextMonth(month);
  const rule: RepeatingTransfer = { id: newId(), ...r, amount: round2(r.amount), startMonth };
  if (!rule.onlyIfSafe) delete rule.onlyIfSafe;
  return applyRepeatingTransfers({ ...s, repeatingTransfers: [...s.repeatingTransfers, rule] }, today);
}

/** Stop a repeating transfer. Transfers it already made stay. */
export const stopRepeatingTransfer = (s: Store, id: string): Store => ({
  ...s,
  repeatingTransfers: s.repeatingTransfers.filter((r) => r.id !== id),
});

/** Make every repeating transfer that has come due. Returns the same object when nothing changed. */
export function applyRepeatingTransfers(s: Store, today: string): Store {
  const todayMonth = today.slice(0, 7);
  let next = s;
  let changed = false;
  const rules = s.repeatingTransfers.map((rule) => {
    if (rule.paused) return rule;
    let r = rule;
    for (let m = r.lastGenerated ? nextMonth(r.lastGenerated) : r.startMonth; m <= todayMonth; m = nextMonth(m)) {
      const date = `${m}-${pad2(Math.min(r.day, lastDay(m)))}`;
      if (date > today) break;
      if (r.onlyIfSafe && bookBalance(next, r.from, m) < r.amount) {
        r = { ...r, lastGenerated: m, skipped: [...(r.skipped ?? []), m] };
      } else {
        const id = `${r.id}:${m}`;
        if (!next.transfers.some((t) => t.id === id)) {
          next = { ...next, transfers: [...next.transfers, { id, date, amount: r.amount, from: r.from, to: r.to, note: r.note, repeatId: r.id }] };
        }
        r = { ...r, lastGenerated: m };
      }
      changed = true;
    }
    return r;
  });
  return changed ? { ...next, repeatingTransfers: rules } : s;
}

/* ---------- Change times and deletion markers (groundwork for sync) ---------- */

const MAX_TOMBSTONES = 2000;

type Stamped = { id: string; updatedAt?: string };
const body = (x: Stamped) => {
  const rest: Record<string, unknown> = { ...x };
  delete rest.updatedAt;
  return JSON.stringify(rest);
};

function stampList<T extends Stamped>(before: T[], after: T[], now: string, gone: Tombstone[]): T[] {
  if (before === after) return after;
  const old = new Map(before.map((x) => [x.id, x]));
  const out = after.map((x) => {
    const prev = old.get(x.id);
    if (prev && (prev === x || body(prev) === body(x))) return prev.updatedAt && !x.updatedAt ? { ...x, updatedAt: prev.updatedAt } : x;
    return { ...x, updatedAt: now };
  });
  const ids = new Set(after.map((x) => x.id));
  for (const x of before) if (!ids.has(x.id)) gone.push({ id: x.id, at: now });
  return out;
}

/**
 * Mark what changed between two versions of the store: changed or new records get `updatedAt`, removed
 * ones leave a deletion marker. Screens don't need to do anything; this runs on every save.
 */
export function stampChanges(before: Store, after: Store, now: string): Store {
  if (before === after) return after;
  const gone: Tombstone[] = [];
  const books = { ...after.books };
  for (const b of BOOKS) {
    const p = before.books[b];
    const n = after.books[b];
    if (p === n) continue;
    books[b] = {
      ...n,
      transactions: stampList(p.transactions, n.transactions, now, gone),
      recurring: stampList(p.recurring as (RecurringRule & Stamped)[], n.recurring as (RecurringRule & Stamped)[], now, gone),
      goals: stampList(p.goals as (Goal & Stamped)[], n.goals as (Goal & Stamped)[], now, gone),
    };
  }
  const next: Store = {
    ...after,
    books,
    transfers: stampList(before.transfers, after.transfers, now, gone),
    repeatingTransfers: stampList(before.repeatingTransfers, after.repeatingTransfers, now, gone),
    unsorted: stampList(before.unsorted, after.unsorted, now, gone),
  };
  // A record moved between lists (e.g. sorted from unsorted into a book) isn't deleted.
  const live = new Set<string>([
    ...BOOKS.flatMap((b) => [...books[b].transactions, ...books[b].recurring, ...books[b].goals].map((x) => x.id)),
    ...next.transfers.map((x) => x.id),
    ...next.repeatingTransfers.map((x) => x.id),
    ...next.unsorted.map((x) => x.id),
  ]);
  const deleted = gone.filter((g) => !live.has(g.id));
  if (deleted.length) next.tombstones = [...after.tombstones, ...deleted].slice(-MAX_TOMBSTONES);
  return next;
}
