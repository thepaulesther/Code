import { describe, expect, it } from 'vitest';
import { sampleData } from './budget';
import {
  addCategory,
  applyRecurring,
  categoryNameError,
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
