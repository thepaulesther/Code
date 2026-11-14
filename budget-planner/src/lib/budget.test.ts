import { describe, expect, it } from 'vitest';
import {
  budgetStatus,
  effectiveInMonth,
  inMonth,
  monthDiff,
  monthlyTrend,
  parseAmount,
  shareAmount,
  shiftMonth,
  spendingByCategory,
  toCSV,
  totals,
  type Transaction,
} from './budget';

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(),
  type: 'expense',
  amount: 10,
  category: 'Other',
  note: '',
  date: '2026-11-01',
  ...p,
});

describe('shiftMonth', () => {
  it('crosses year boundaries both ways', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-11', -13)).toBe('2025-10');
  });
});

describe('totals', () => {
  it('sums income and expenses and computes savings rate', () => {
    const t = totals([tx({ type: 'income', amount: 1000 }), tx({ amount: 250 }), tx({ amount: 150 })]);
    expect(t).toEqual({ income: 1000, expense: 400, net: 600, savingsRate: 0.6 });
  });
  it('savings rate is 0 with no income or negative net', () => {
    expect(totals([tx({ amount: 50 })]).savingsRate).toBe(0);
    expect(totals([tx({ type: 'income', amount: 10 }), tx({ amount: 50 })]).savingsRate).toBe(0);
  });
});

describe('inMonth / spendingByCategory', () => {
  const data = [
    tx({ category: 'Dining', amount: 20, date: '2026-11-03' }),
    tx({ category: 'Groceries', amount: 90, date: '2026-11-04' }),
    tx({ category: 'Dining', amount: 30, date: '2026-11-20' }),
    tx({ category: 'Dining', amount: 999, date: '2026-10-31' }),
    tx({ type: 'income', category: 'Salary', amount: 5000, date: '2026-11-01' }),
  ];
  it('filters by month and groups expenses only, largest first', () => {
    expect(spendingByCategory(inMonth(data, '2026-11'))).toEqual([
      { category: 'Groceries', amount: 90 },
      { category: 'Dining', amount: 50 },
    ]);
  });
  it('builds a trend ending at the given month, oldest first', () => {
    const trend = monthlyTrend(data, '2026-11', 3);
    expect(trend.map((t) => t.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(trend[1].expense).toBe(999);
    expect(trend[2]).toMatchObject({ income: 5000, expense: 140 });
  });
});

describe('budgetStatus', () => {
  it('flags warn at 80% and over past 100%, ignoring zero limits', () => {
    const s = budgetStatus(
      [tx({ category: 'Dining', amount: 85 }), tx({ category: 'Groceries', amount: 120 })],
      { Dining: 100, Groceries: 100, Transport: 50, Shopping: 0 },
    );
    expect(s.map((b) => [b.category, b.state])).toEqual([
      ['Groceries', 'over'],
      ['Dining', 'warn'],
      ['Transport', 'ok'],
    ]);
    expect(s[0].remaining).toBe(-20);
  });
});

describe('parseAmount', () => {
  it.each([
    ['12', 12],
    ['1,234.50', 1234.5],
    ['$ 9.99', 9.99],
    ['€12', 12],
    ['¥ 1,500', 1500],
    ['0', null],
    ['-5', null],
    ['1.234', null],
    ['abc', null],
    ['', null],
  ])('%s -> %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
});

describe('toCSV', () => {
  it('sorts by date and escapes commas and quotes', () => {
    const csv = toCSV([
      tx({ date: '2026-11-05', note: 'Lunch, "fancy"', amount: 12.5 }),
      tx({ date: '2026-11-01', note: 'Bus', category: 'Transport', amount: 3 }),
    ]);
    expect(csv.split('\n')).toEqual([
      'date,type,category,amount,note,original_amount,original_currency,rate,spread_months',
      '2026-11-01,expense,Transport,3.00,Bus,,,,',
      '2026-11-05,expense,Other,12.50,"Lunch, ""fancy""",,,,',
    ]);
  });
  it('includes the original currency and rate for converted amounts', () => {
    const csv = toCSV([
      tx({ type: 'income', category: 'Salary', amount: 7601750, note: 'Pay', original: { amount: 5000, currency: 'USD', rate: 1520.35 } }),
    ]);
    expect(csv.split('\n')[1]).toBe('2026-11-01,income,Salary,7601750.00,Pay,5000.00,USD,1520.35,');
  });
  it('includes the spread for yearly costs', () => {
    const csv = toCSV([tx({ category: 'Housing', amount: 3000000, note: 'Rent', spread: 12 })]);
    expect(csv.split('\n')[1]).toBe('2026-11-01,expense,Housing,3000000.00,Rent,,,,12');
  });
});

describe('spreading a payment over months', () => {
  const rent = tx({ id: 'rent', category: 'Housing', amount: 3_000_000, note: 'Rent', date: '2026-01-05', spread: 12 });

  it('counts ₦3,000,000 yearly rent as ₦250,000 in each of 12 months, from the month paid', () => {
    expect(monthDiff('2026-01', '2026-12')).toBe(11);
    expect(effectiveInMonth([rent], '2025-12')).toEqual([]);
    const jan = effectiveInMonth([rent], '2026-01')[0];
    expect(jan).toMatchObject({ id: 'rent', amount: 250_000, share: { index: 1, of: 12, total: 3_000_000 } });
    expect(effectiveInMonth([rent], '2026-07')[0]).toMatchObject({ amount: 250_000, share: { index: 7 } });
    expect(effectiveInMonth([rent], '2026-12')[0]).toMatchObject({ amount: 250_000, share: { index: 12 } });
    expect(effectiveInMonth([rent], '2027-01')).toEqual([]);
  });

  it('shares always add up to the full amount', () => {
    const odd = tx({ amount: 1000, spread: 3, date: '2026-11-20' });
    const parts = ['2026-11', '2026-12', '2027-01'].map((m) => effectiveInMonth([odd], m)[0].amount);
    expect(parts).toEqual([333.33, 333.33, 333.34]);
    expect(shareAmount(100, 7, 6) + shareAmount(100, 7, 0) * 6).toBeCloseTo(100, 10);
  });

  it('feeds totals, category spending, budgets and the trend chart', () => {
    const groceries = tx({ category: 'Groceries', amount: 80_000, date: '2026-03-10' });
    const salary = tx({ type: 'income', category: 'Salary', amount: 1_000_000, date: '2026-03-01' });
    const march = effectiveInMonth([rent, groceries, salary], '2026-03');
    expect(totals(march)).toMatchObject({ income: 1_000_000, expense: 330_000, net: 670_000 });
    expect(spendingByCategory(march)[0]).toEqual({ category: 'Housing', amount: 250_000 });
    expect(budgetStatus(march, { Housing: 250_000 })[0]).toMatchObject({ spent: 250_000, state: 'warn', remaining: 0 });
    const trend = monthlyTrend([rent], '2026-02', 3); // Dec 2025, Jan, Feb
    expect(trend.map((t) => t.expense)).toEqual([0, 250_000, 250_000]);
  });

  it('a single-month spread behaves like a normal transaction', () => {
    const one = tx({ amount: 50, spread: 1, date: '2026-11-03' });
    expect(effectiveInMonth([one], '2026-11')).toEqual([one]);
    expect(effectiveInMonth([one], '2026-12')).toEqual([]);
  });
});
