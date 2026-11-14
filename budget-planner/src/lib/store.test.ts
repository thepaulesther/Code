import { describe, expect, it } from 'vitest';
import { effectiveInMonth, sampleData, spendingByCategory, type Transaction } from './budget';
import { findSimilarRule } from './recurring';
import {
  addCategory,
  applyRecurring,
  categoryNameError,
  changeBaseCurrency,
  defaultSettings,
  deleteCategory,
  editTransaction,
  hasSamples,
  isAppData,
  markLegacySamples,
  removeSamples,
  renameCategory,
  stopRule,
  type AppData,
} from './store';

const data = (): AppData => ({ version: 2, ...sampleData('2026-11'), settings: { ...defaultSettings(), currency: 'USD' } });

describe('no currency until the user picks one', () => {
  it('defaults to none', () => {
    expect(defaultSettings().currency).toBe('');
  });
  it('choosing a currency for unlabelled numbers just labels them, even in convert mode', () => {
    const unlabelled: AppData = { ...data(), settings: defaultSettings() };
    const d = changeBaseCurrency(unlabelled, 'NGN', 'convert', 1520);
    expect(d.settings.currency).toBe('NGN');
    expect(d.transactions).toEqual(unlabelled.transactions);
    expect(d.budgets).toEqual(unlabelled.budgets);
    expect(d.recurring).toEqual(unlabelled.recurring);
  });
});

describe('example data clean-up (the “Housing shows the old rent too” problem)', () => {
  /** Example data as saved by the previous version: no `sample` flags, converted to Naira. */
  const legacy = (): AppData => {
    const d = changeBaseCurrency(data(), 'NGN', 'convert', 1520);
    const strip = <T extends { sample?: boolean }>(x: T): T => {
      const y = { ...x };
      delete y.sample;
      return y;
    };
    return { ...d, transactions: d.transactions.map(strip), recurring: d.recurring.map(strip) };
  };
  /** What the user then added: yearly rent, plus their own groceries (on a different day than the example). */
  const withUserData = (): AppData => {
    const d = legacy();
    const rule = { id: 'user-rent', type: 'expense' as const, amount: 3_000_000, category: 'Housing', note: 'Rent', day: 5, startMonth: '2026-01', everyMonths: 12, spreadMonths: 12, lastGenerated: '2026-01' };
    return {
      ...d,
      recurring: [...d.recurring, rule],
      transactions: [
        ...d.transactions,
        { id: 'user-rent:2026-01', type: 'expense', amount: 3_000_000, category: 'Housing', note: 'Rent', date: '2026-01-05', recurringId: 'user-rent', spread: 12 },
        { id: 'u2', type: 'expense', amount: 45_000, category: 'Groceries', note: 'Weekly shops', date: '2026-11-07' },
      ],
    };
  };

  it('before clean-up, November Housing counts both the example rent and the yearly share', () => {
    const housing = spendingByCategory(effectiveInMonth(withUserData().transactions, '2026-11')).find((c) => c.category === 'Housing');
    expect(housing?.amount).toBe(2_204_000 + 250_000);
  });

  it('marks only the examples in older saved data', () => {
    const d = markLegacySamples(withUserData());
    expect(hasSamples(d)).toBe(true);
    expect(d.recurring.find((r) => r.id === 'user-rent')?.sample).toBeUndefined();
    expect(d.transactions.find((t) => t.id === 'user-rent:2026-01')?.sample).toBeUndefined();
    expect(d.transactions.find((t) => t.id === 'u2')?.sample).toBeUndefined();
    expect(d.transactions.filter((t) => t.sample)).toHaveLength(data().transactions.length);
    expect(markLegacySamples(d)).toBe(d); // runs once
  });

  it('removing examples leaves the user’s rent: Housing is ₦250,000 a month', () => {
    const { data: clean, transactions, repeating } = removeSamples(markLegacySamples(withUserData()));
    expect(transactions).toBe(data().transactions.length);
    expect(repeating).toBe(2);
    expect(hasSamples(clean)).toBe(false);
    expect(clean.recurring.map((r) => r.id)).toEqual(['user-rent']);
    const nov = spendingByCategory(effectiveInMonth(clean.transactions, '2026-11'));
    expect(nov).toEqual([{ category: 'Housing', amount: 250_000 }, { category: 'Groceries', amount: 45_000 }]);
  });

  it('new example data is flagged from the start, including what its rules add later', () => {
    const d = applyRecurring(data(), '2026-12-03');
    expect(d.transactions.every((t) => t.sample)).toBe(true);
    expect(removeSamples(d).data.transactions).toEqual([]);
  });
});

describe('editTransaction', () => {
  const empty = (): AppData => ({ version: 2, transactions: [], budgets: {}, recurring: [], settings: { ...defaultSettings(), currency: 'NGN' } });
  const fuel: Transaction = { id: 'f1', type: 'expense', amount: 60_000, category: 'Utilities', note: 'Generator fuel', date: '2026-09-05' };

  it('turns a one-off into a monthly item, keeping it as the first payment and filling in the months since', () => {
    const { data: d, added } = editTransaction({ ...empty(), transactions: [fuel] }, 'f1', fuel, 1, {}, '2026-11-14');
    expect(added).toBe(2);
    expect(d.recurring).toHaveLength(1);
    const rule = d.recurring[0];
    expect(rule).toMatchObject({ amount: 60_000, category: 'Utilities', note: 'Generator fuel', day: 5, startMonth: '2026-09', lastGenerated: '2026-11' });
    expect(rule.everyMonths).toBeUndefined();
    expect(d.transactions.map((t) => [t.id, t.date])).toEqual([
      ['f1', '2026-09-05'],
      [`${rule.id}:2026-10`, '2026-10-05'],
      [`${rule.id}:2026-11`, '2026-11-05'],
    ]);
    expect(d.transactions.every((t) => t.recurringId === rule.id)).toBe(true);
  });

  it('can change the details while turning it into a repeating item', () => {
    const changed = { ...fuel, amount: 75_000, note: 'Diesel' };
    const { data: d } = editTransaction({ ...empty(), transactions: [fuel] }, 'f1', changed, 1, {}, '2026-10-20');
    expect(d.transactions.map((t) => [t.note, t.amount])).toEqual([['Diesel', 75_000], ['Diesel', 75_000]]);
  });

  it('yearly rent: becomes a yearly item, spread over 12 months, with nothing extra until next year', () => {
    const rent: Transaction = { id: 'r1', type: 'expense', amount: 3_000_000, category: 'Housing', note: 'Rent', date: '2026-01-05' };
    const { data: d, added } = editTransaction({ ...empty(), transactions: [rent] }, 'r1', { ...rent, spread: 12 }, 12, {}, '2026-11-14');
    expect(added).toBe(0);
    expect(d.recurring[0]).toMatchObject({ everyMonths: 12, spreadMonths: 12, startMonth: '2026-01' });
    expect(d.transactions[0]).toMatchObject({ spread: 12, recurringId: d.recurring[0].id });
    expect(effectiveInMonth(d.transactions, '2026-11')[0].amount).toBe(250_000);
  });

  it('keeps the original currency on the new repeating item', () => {
    const pay: Transaction = { id: 'p', type: 'income', amount: 7_400_000, category: 'Salary', note: 'Acme', date: '2026-11-01', original: { amount: 5000, currency: 'USD', rate: 1480 } };
    const { data: d } = editTransaction({ ...empty(), transactions: [pay] }, 'p', pay, 1, {}, '2026-11-14');
    expect(d.recurring[0]).toMatchObject({ amount: 5000, currency: 'USD', rate: 1480 });
  });

  describe('a payment made by a repeating item', () => {
    const setUp = () => editTransaction({ ...empty(), transactions: [fuel] }, 'f1', fuel, 1, {}, '2026-11-14').data;

    it('with "also change future payments", the item takes the new amount', () => {
      const d0 = setUp();
      const nov = d0.transactions[2];
      const { data: d } = editTransaction(d0, nov.id, { ...nov, amount: 80_000 }, 1, { updateFuture: true }, '2026-11-14');
      expect(d.transactions.find((t) => t.id === nov.id)?.amount).toBe(80_000);
      expect(d.recurring[0].amount).toBe(80_000);
      expect(d.transactions[0].amount).toBe(60_000); // past payments untouched
      // December's payment uses the new amount.
      const dec = applyRecurring(d, '2026-12-05').transactions.find((t) => t.date === '2026-12-05');
      expect(dec?.amount).toBe(80_000);
    });

    it('without it, only that payment changes', () => {
      const d0 = setUp();
      const nov = d0.transactions[2];
      const { data: d } = editTransaction(d0, nov.id, { ...nov, amount: 80_000 }, 1, { updateFuture: false }, '2026-11-14');
      expect(d.recurring[0].amount).toBe(60_000);
      expect(d.transactions.find((t) => t.id === nov.id)).toMatchObject({ amount: 80_000, recurringId: d.recurring[0].id });
    });

    it('setting it to not repeat stops the item and keeps every payment', () => {
      const d0 = setUp();
      const { data: d } = editTransaction(d0, 'f1', d0.transactions[0], 0, {}, '2026-11-14');
      expect(d.recurring).toEqual([]);
      expect(d.transactions).toHaveLength(3);
      expect(d.transactions.every((t) => !t.recurringId)).toBe(true);
    });

    it('switching monthly to yearly changes the schedule', () => {
      const d0 = setUp();
      const { data: d } = editTransaction(d0, 'f1', d0.transactions[0], 12, {}, '2026-11-14');
      expect(d.recurring[0].everyMonths).toBe(12);
      expect(applyRecurring(d, '2027-08-01').transactions).toHaveLength(3); // nothing new until Sep 2027
    });
  });

  it('an edited example becomes the user’s own entry', () => {
    const d0 = data();
    const ex = d0.transactions.find((t) => t.note === 'Eating out')!;
    const { data: d } = editTransaction(d0, ex.id, { ...ex, amount: 99 }, 0, {}, '2026-11-14');
    expect(d.transactions.find((t) => t.id === ex.id)).toMatchObject({ amount: 99 });
    expect(d.transactions.find((t) => t.id === ex.id)?.sample).toBeUndefined();
  });

  it('can stop an older similar item it replaces', () => {
    const d0 = data(); // has the example monthly "Rent"
    const rent: Transaction = { id: 'r1', type: 'expense', amount: 3_000_000, category: 'Housing', note: 'Rent', date: '2026-01-05', spread: 12 };
    const { data: d } = editTransaction({ ...d0, transactions: [...d0.transactions, rent] }, 'r1', rent, 12, { replaceRuleId: 'sample-rent' }, '2026-11-14');
    expect(d.recurring.map((r) => r.id)).not.toContain('sample-rent');
    expect(d.recurring.some((r) => r.everyMonths === 12 && r.note === 'Rent')).toBe(true);
  });

  it('ignores an unknown id', () => {
    const d0 = empty();
    expect(editTransaction(d0, 'nope', fuel, 1, {}, '2026-11-14')).toEqual({ data: d0, added: 0 });
  });
});

describe('stopRule', () => {
  it('keeps past payments by default (and unlinks them)', () => {
    const d = stopRule(data(), 'sample-rent', false);
    expect(d.recurring.map((r) => r.id)).toEqual(['sample-salary']);
    const rents = d.transactions.filter((t) => t.note === 'Rent');
    expect(rents).toHaveLength(4);
    expect(rents.every((t) => t.recurringId === undefined)).toBe(true);
  });
  it('can delete the payments it added', () => {
    const d = stopRule(data(), 'sample-rent', true);
    expect(d.transactions.some((t) => t.note === 'Rent')).toBe(false);
    expect(d.transactions.some((t) => t.note === 'Paycheck')).toBe(true);
  });
});

describe('findSimilarRule', () => {
  const rules = data().recurring;
  it('finds an existing repeating item for the same bill', () => {
    expect(findSimilarRule(rules, { type: 'expense', category: 'Housing', note: 'rent ' })?.id).toBe('sample-rent');
    expect(findSimilarRule(rules, { type: 'expense', category: 'Housing', note: '' })?.id).toBe('sample-rent');
  });
  it('ignores different notes, types and paused items', () => {
    expect(findSimilarRule(rules, { type: 'expense', category: 'Housing', note: 'Generator diesel' })).toBeUndefined();
    expect(findSimilarRule(rules, { type: 'income', category: 'Housing', note: 'Rent' })).toBeUndefined();
    expect(findSimilarRule(rules.map((r) => ({ ...r, paused: true })), { type: 'expense', category: 'Housing', note: 'Rent' })).toBeUndefined();
  });
});

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
