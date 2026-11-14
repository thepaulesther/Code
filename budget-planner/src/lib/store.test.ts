import { describe, expect, it } from 'vitest';
import { sampleData } from './budget';
import {
  addCategory,
  applyRecurring,
  categoryNameError,
  changeBaseCurrency,
  defaultSettings,
  deleteCategory,
  isAppData,
  renameCategory,
  type AppData,
} from './store';

const data = (): AppData => ({ version: 2, ...sampleData('2026-11'), settings: defaultSettings() });

describe('sample data + applyRecurring', () => {
  it('is valid and already up to date for its own month', () => {
    const d = data();
    expect(isAppData(d)).toBe(true);
    expect(applyRecurring(d, '2026-11-14')).toBe(d);
  });
  it('adds next month’s rent and salary exactly once', () => {
    const d = applyRecurring(data(), '2026-12-03');
    const dec = d.transactions.filter((t) => t.date.startsWith('2026-12'));
    expect(dec.map((t) => t.note).sort()).toEqual(['Paycheck', 'Rent']);
    expect(applyRecurring(d, '2026-12-03')).toBe(d);
  });
});

describe('changeBaseCurrency', () => {
  it('convert: multiplies amounts and budgets, remembering the originals', () => {
    const d = changeBaseCurrency(data(), 'NGN', 'convert', 1500);
    expect(d.settings.currency).toBe('NGN');
    const rent = d.transactions.find((t) => t.id === 'sample-rent:2026-11')!;
    expect(rent.amount).toBe(2175000);
    expect(rent.original).toEqual({ amount: 1450, currency: 'USD', rate: 1500 });
    expect(d.budgets.Groceries).toBe(570000);
    // Repeating items keep being paid in dollars and convert each month.
    expect(d.recurring.find((r) => r.id === 'sample-salary')).toMatchObject({ amount: 4200, currency: 'USD', rate: 1500 });
  });

  it('relabel: leaves the numbers alone', () => {
    const before = data();
    const d = changeBaseCurrency(before, 'NGN', 'relabel');
    expect(d.settings.currency).toBe('NGN');
    expect(d.transactions).toEqual(before.transactions);
    expect(d.budgets).toEqual(before.budgets);
  });

  it('switching back restores the exact original amounts', () => {
    const there = changeBaseCurrency(data(), 'NGN', 'convert', 1523.37);
    const back = changeBaseCurrency(there, 'USD', 'convert', 1 / 1523.37);
    const rent = back.transactions.find((t) => t.id === 'sample-rent:2026-11')!;
    expect(rent).toMatchObject({ amount: 1450 });
    expect(rent.original).toBeUndefined();
    expect(back.recurring.find((r) => r.id === 'sample-rent')?.currency).toBeUndefined();
  });

  it('a converted transaction keeps its foreign original and rescales the rate', () => {
    let d = data();
    d = { ...d, transactions: [{ id: 'x', type: 'income', amount: 1000, category: 'Freelance', note: '', date: '2026-11-03', original: { amount: 900, currency: 'EUR', rate: 1000 / 900 } }] };
    const n = changeBaseCurrency(d, 'NGN', 'convert', 1500).transactions[0];
    expect(n.amount).toBe(1500000);
    expect(n.original?.currency).toBe('EUR');
    expect(n.original!.amount * n.original!.rate).toBeCloseTo(1500000, 2);
  });

  it('applyRecurring converts foreign rules using cached rates', () => {
    let d = changeBaseCurrency(data(), 'NGN', 'convert', 1500);
    d = { ...d, rates: { base: 'USD', date: '2026-12-01', fetchedAt: 0, source: 't', rates: { USD: 1, NGN: 1600 } } };
    const next = applyRecurring(d, '2026-12-03');
    const pay = next.transactions.find((t) => t.id === 'sample-salary:2026-12')!;
    expect(pay).toMatchObject({ amount: 6720000, original: { amount: 4200, currency: 'USD', rate: 1600 } });
  });
});

describe('categories', () => {
  it('validates names', () => {
    const list = ['Dining', 'Groceries'];
    expect(categoryNameError(list, '  ')).toBe('Enter a name.');
    expect(categoryNameError(list, 'dining')).toMatch(/already exists/);
    expect(categoryNameError(list, 'Dining', 'Dining')).toBeNull(); // renaming to itself
    expect(categoryNameError(list, 'Pets')).toBeNull();
  });

  it('adds to the right list', () => {
    const d = addCategory(data(), 'income', ' Dividends ');
    expect(d.settings.incomeCategories[d.settings.incomeCategories.length - 1]).toBe('Dividends');
  });

  it('renames across transactions, rules and budgets, keeping budget order', () => {
    const d = renameCategory(data(), 'expense', 'Housing', 'Home');
    expect(d.settings.expenseCategories[0]).toBe('Home');
    expect(d.transactions.some((t) => t.category === 'Housing')).toBe(false);
    expect(d.transactions.filter((t) => t.category === 'Home').length).toBe(4);
    expect(d.recurring.find((r) => r.id === 'sample-rent')?.category).toBe('Home');

    const g = renameCategory(data(), 'expense', 'Groceries', 'Food');
    expect(Object.keys(g.budgets)).toEqual(['Food', 'Dining', 'Transport', 'Entertainment', 'Shopping']);
  });

  it('only renames the matching type', () => {
    let d = addCategory(data(), 'income', 'Other');
    d = renameCategory(d, 'income', 'Other', 'Misc income');
    expect(d.settings.expenseCategories).toContain('Other');
  });

  it('deletes from the list and budgets but keeps transaction labels', () => {
    const d = deleteCategory(data(), 'expense', 'Dining');
    expect(d.settings.expenseCategories).not.toContain('Dining');
    expect(d.budgets.Dining).toBeUndefined();
    expect(d.transactions.some((t) => t.category === 'Dining')).toBe(true);
  });
});
