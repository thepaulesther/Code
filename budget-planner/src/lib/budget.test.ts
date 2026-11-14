import { describe, expect, it } from 'vitest';
import {
  budgetStatus,
  inMonth,
  monthlyTrend,
  parseAmount,
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
      'date,type,category,amount,note,original_amount,original_currency,rate',
      '2026-11-01,expense,Transport,3.00,Bus,,,',
      '2026-11-05,expense,Other,12.50,"Lunch, ""fancy""",,,',
    ]);
  });
  it('includes the original currency and rate for converted amounts', () => {
    const csv = toCSV([
      tx({ type: 'income', category: 'Salary', amount: 7601750, note: 'Pay', original: { amount: 5000, currency: 'USD', rate: 1520.35 } }),
    ]);
    expect(csv.split('\n')[1]).toBe('2026-11-01,income,Salary,7601750.00,Pay,5000.00,USD,1520.35');
  });
});
