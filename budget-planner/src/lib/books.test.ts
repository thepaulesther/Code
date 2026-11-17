import { describe, expect, it } from 'vitest';
import {
  addTransfer,
  bookBalance,
  decodeStore,
  encodeStore,
  everythingTotals,
  mergeView,
  moveTransaction,
  setBusinessMode,
  sortInto,
  splitPartner,
  splitTransaction,
  splitUnsorted,
  storeFromView,
  transferTotals,
  upgradeV2toV3,
  viewOf,
  type Store,
} from './books';
import { effectiveInMonth, totals } from './budget';
import { currencyDigits, fromMinor, toMinor } from './money';
import { applyRecurringAll, changeStoreCurrency, completeStore, defaultSettings, type AppData } from './store';

const v2 = (): AppData => ({
  version: 2,
  transactions: [
    { id: 't1', type: 'income', amount: 650_000, category: 'Salary', note: 'November salary', date: '2026-11-01' },
    { id: 't2', type: 'expense', amount: 61_500.5, category: 'Groceries', note: 'Market', date: '2026-11-04' },
    { id: 't3', type: 'expense', amount: 7_400, category: 'Dining', note: 'Lunch', date: '2026-11-05', original: { amount: 4.99, currency: 'USD', rate: 1482.97 } },
    { id: 't4', type: 'expense', amount: 1_800_000, category: 'Housing', note: 'Rent', date: '2026-01-05', spread: 12 },
  ],
  budgets: { Groceries: 80_000, Dining: 25_000.25 },
  recurring: [
    { id: 'r1', type: 'income', amount: 5_000, currency: 'USD', rate: 1480, category: 'Salary', note: 'Contract', day: 1, startMonth: '2026-11', lastGenerated: '2026-11' },
    { id: 'r2', type: 'expense', amount: 45_000, category: 'Utilities', note: 'Broadband', day: 28, startMonth: '2026-12' },
  ],
  goals: [{ id: 'g1', name: 'Emergency fund', kind: 'emergency', target: 600_000, contributions: [{ id: 'c1', date: '2026-10-10', amount: 300_000.75 }, { id: 'c2', date: '2026-10-20', amount: -500 }] }],
  settings: { ...defaultSettings(), currency: 'NGN', plan: { savingsRate: 0.2, emergencyMonths: 12, income: 650_000.5 } },
  alertLog: { '2026-11': 'near-plan' },
});

describe('minor units', () => {
  it('knows how many decimal places a currency uses', () => {
    expect(currencyDigits('NGN')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('')).toBe(2);
    expect(currencyDigits('NOT-A-CODE')).toBe(2);
  });

  it('converts exactly, without floating-point drift', () => {
    expect(toMinor(4200.5, 'NGN')).toBe(420_050);
    expect(toMinor(0.1 + 0.2, 'NGN')).toBe(30);
    expect(toMinor(1.005, 'NGN')).toBe(101);
    expect(toMinor(1500, 'JPY')).toBe(1500);
    expect(fromMinor(420_050, 'NGN')).toBe(4200.5);
    expect(fromMinor(1500, 'JPY')).toBe(1500);
  });
});

describe('upgrading v2 to v3', () => {
  it('moves everything into Personal, in kobo, without changing the input', () => {
    const before = JSON.stringify(v2());
    const raw = JSON.parse(before);
    const out = upgradeV2toV3(raw) as { version: number; books: { personal: Record<string, never>; business: Record<string, unknown> } };
    expect(JSON.stringify(raw)).toBe(before);
    expect(out.version).toBe(3);
    const p = out.books.personal as unknown as AppData & { plan: { income: number } };
    expect(p.transactions.map((t) => t.amount)).toEqual([65_000_000, 6_150_050, 740_000, 180_000_000]);
    // A foreign original keeps its own currency's minor units.
    expect(p.transactions[2].original).toEqual({ amount: 499, currency: 'USD', rate: 1482.97 });
    expect(p.budgets).toEqual({ Groceries: 8_000_000, Dining: 2_500_025 });
    expect(p.recurring[0].amount).toBe(500_000); // $5,000 in cents
    expect(p.goals![0].target).toBe(60_000_000);
    expect(p.goals![0].contributions.map((c) => c.amount)).toEqual([30_000_075, -50_000]);
    expect(p.plan.income).toBe(65_000_050);
    expect(out.books.business).toMatchObject({ transactions: [], expenseCategories: expect.arrayContaining(['Stock', 'Staff pay']) });
  });

  it('round-trips to the same amounts and the same totals', () => {
    const data = v2();
    const s = completeStore(upgradeV2toV3(JSON.parse(JSON.stringify(data))));
    expect(s).not.toBeNull();
    const view = viewOf(s!, 'personal');
    expect(view.transactions).toEqual(data.transactions);
    expect(view.budgets).toEqual(data.budgets);
    expect(view.recurring).toEqual(data.recurring);
    expect(view.goals).toEqual(data.goals);
    expect(view.settings.plan).toEqual(data.settings.plan);
    expect(view.alertLog).toEqual(data.alertLog);
    const t = (txs: AppData['transactions']) => totals(effectiveInMonth(txs, '2026-11'));
    expect(t(view.transactions)).toEqual(t(data.transactions));
  });
});

describe('saved format', () => {
  it('encodes and decodes a store exactly', () => {
    let s = storeFromView(v2());
    s = addTransfer(s, { date: '2026-11-30', amount: 200_000.5, from: 'business', to: 'personal', note: 'Pay yourself' });
    const saved = encodeStore(s) as { transfers: { amount: number }[] };
    expect(saved.transfers[0].amount).toBe(20_000_050);
    expect(decodeStore(JSON.parse(JSON.stringify(saved)))).toEqual(s);
  });

  it('rejects damaged data instead of guessing', () => {
    const saved = encodeStore(storeFromView(v2())) as Record<string, unknown> & { books: { business: Record<string, unknown> } };
    expect(completeStore(saved)).not.toBeNull();
    expect(completeStore({ ...saved, transfers: [{ id: 'x', amount: 5, date: '2026-11-01', from: 'personal', to: 'mars' }] })).toBeNull();
    const badBusiness = structuredClone(saved);
    badBusiness.books.business.budgets = { Stock: 'lots' };
    expect(completeStore(badBusiness)).toBeNull();
    expect(completeStore({ ...saved, version: 2 })).toBeNull();
  });
});

const withBusiness = (): Store => {
  let s = setBusinessMode(storeFromView(v2()), true);
  const biz = viewOf(s, 'business');
  s = mergeView(s, 'business', {
    ...biz,
    transactions: [
      { id: 'b1', type: 'income', amount: 1_900_000, category: 'Sales', note: 'November sales', date: '2026-11-10' },
      { id: 'b2', type: 'expense', amount: 600_000, category: 'Stock', note: 'Rice and oil', date: '2026-11-12' },
    ],
  });
  return s;
};

describe('two books', () => {
  it('keeps categories and figures apart, and shares currency and theme', () => {
    let s = withBusiness();
    expect(viewOf(s, 'business').settings.expenseCategories).toContain('Stock');
    expect(viewOf(s, 'personal').settings.expenseCategories).not.toContain('Stock');
    const personal = viewOf(s, 'personal');
    s = mergeView(s, 'personal', { ...personal, settings: { ...personal.settings, theme: 'dark' } });
    expect(viewOf(s, 'business').settings.theme).toBe('dark');
    expect(bookBalance(s, 'business', '2026-11')).toBe(1_300_000);
  });

  it('counts a transfer in each book’s balance but never as income or spending', () => {
    const s = addTransfer(withBusiness(), { date: '2026-11-30', amount: 200_000, from: 'business', to: 'personal', note: 'Pay yourself' });
    expect(transferTotals(s, 'personal', '2026-11')).toEqual({ in: 200_000, out: 0 });
    expect(bookBalance(s, 'business', '2026-11')).toBe(1_100_000);
    // Both books together: the transfer cancels out.
    const before = everythingTotals(withBusiness(), '2026-11');
    expect(everythingTotals(s, '2026-11')).toEqual(before);
    const wealth = (x: Store) => bookBalance(x, 'personal', '2026-11') + bookBalance(x, 'business', '2026-11');
    expect(wealth(s)).toBe(wealth(withBusiness()));
  });

  it('ignores a transfer to the same book or of nothing', () => {
    const s = withBusiness();
    expect(addTransfer(s, { date: '2026-11-30', amount: 5, from: 'personal', to: 'personal', note: '' })).toBe(s);
    expect(addTransfer(s, { date: '2026-11-30', amount: 0, from: 'business', to: 'personal', note: '' })).toBe(s);
  });

  it('splits a payment into two linked parts that add up to the whole', () => {
    const s = splitTransaction(withBusiness(), 't2', 'personal', 20_000);
    const biz = s.books.business.transactions.find((t) => t.note === 'Market')!;
    const per = s.books.personal.transactions.find((t) => t.note === 'Market')!;
    expect(biz.amount + per.amount).toBe(61_500.5);
    expect(biz.amount).toBe(20_000);
    expect(biz.splitId).toBeDefined();
    expect(splitPartner(s, biz, 'business')).toEqual(per);
    expect(s.books.personal.transactions.some((t) => t.id === 't2')).toBe(false);
  });

  it('refuses a split that isn’t a real part of the payment', () => {
    const s = withBusiness();
    expect(splitTransaction(s, 't2', 'personal', 0)).toBe(s);
    expect(splitTransaction(s, 't2', 'personal', 61_500.5)).toBe(s);
    expect(splitTransaction(s, 'missing', 'personal', 10)).toBe(s);
  });

  it('sorts and splits unsorted payments', () => {
    let s: Store = { ...withBusiness(), unsorted: [
      { id: 'u1', type: 'income', amount: 45_000, category: 'Other income', note: 'Transfer from Chidi', date: '2026-11-15' },
      { id: 'u2', type: 'expense', amount: 20_000, category: 'Transport', note: 'Filling station', date: '2026-11-13' },
    ] };
    s = sortInto(s, 'u1', 'business');
    expect(s.unsorted.map((t) => t.id)).toEqual(['u2']);
    expect(s.books.business.transactions.some((t) => t.id === 'u1')).toBe(true);
    s = splitUnsorted(s, 'u2', 12_000);
    expect(s.unsorted).toEqual([]);
    expect(s.books.business.transactions.find((t) => t.note === 'Filling station')?.amount).toBe(12_000);
    expect(s.books.personal.transactions.find((t) => t.note === 'Filling station')?.amount).toBe(8_000);
  });

  it('moves a payment to the other book, unlinking it from a repeating item', () => {
    let s = withBusiness();
    const personal = viewOf(s, 'personal');
    s = mergeView(s, 'personal', { ...personal, transactions: [...personal.transactions, { id: 'p9', type: 'expense', amount: 5_000, category: 'Utilities', note: 'Data', date: '2026-11-02', recurringId: 'r2' }] });
    s = moveTransaction(s, 'p9', 'personal');
    const moved = s.books.business.transactions.find((t) => t.id === 'p9');
    expect(moved).toBeDefined();
    expect(moved!.recurringId).toBeUndefined();
  });

  it('turning business mode off shows Personal again', () => {
    const s = setBusinessMode({ ...withBusiness(), settings: { ...withBusiness().settings, book: 'business' } }, false);
    expect(s.settings).toMatchObject({ business: false, book: 'personal' });
    expect(s.books.business.transactions).toHaveLength(2); // business data is kept, just hidden
  });
});

describe('across both books', () => {
  it('changes the base currency in both books and in transfers', () => {
    let s = addTransfer(withBusiness(), { date: '2026-11-30', amount: 1000, from: 'business', to: 'personal', note: '' });
    s = changeStoreCurrency(s, 'USD', 'convert', 0.001);
    expect(s.settings.currency).toBe('USD');
    expect(s.books.business.transactions[0]).toMatchObject({ amount: 1900, original: { amount: 1_900_000, currency: 'NGN' } });
    expect(s.books.personal.transactions[0].amount).toBe(650);
    expect(s.transfers[0].amount).toBe(1);
  });

  it('adds due repeating payments in every book', () => {
    let s = withBusiness();
    const biz = viewOf(s, 'business');
    s = mergeView(s, 'business', { ...biz, recurring: [{ id: 'rb', type: 'expense', amount: 150_000, category: 'Staff pay', note: 'Staff', day: 1, startMonth: '2026-11' }] });
    const next = applyRecurringAll(s, '2026-11-17');
    expect(next.books.business.transactions.some((t) => t.recurringId === 'rb')).toBe(true);
  });
});
