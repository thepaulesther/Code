import { describe, expect, it } from 'vitest';
import type { Transaction } from './budget';
import { buildPlan, type Goal } from './plan';
import { reconcile, upcomingThisMonth } from './reconcile';
import type { RecurringRule } from './recurring';

const today = '2026-11-14';
const rule = (id: string, type: 'income' | 'expense', amount: number, day: number, extra: Partial<RecurringRule> = {}): RecurringRule => ({
  id, type, amount, category: type === 'income' ? 'Salary' : 'Utilities', note: id, day, startMonth: '2026-11', ...extra,
});
const paid = (r: RecurringRule, date: string): Transaction => ({
  id: `${r.id}:${date.slice(0, 7)}`, type: r.type, amount: r.amount, category: r.category, note: r.note, date, recurringId: r.id,
});
const tx = (type: 'income' | 'expense', amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `${type}${amount}${date}`, type, amount, category: 'Groceries', note: '', date, ...extra,
});

// The reported case: salary and rent on the 1st (paid), electricity on the 20th and phone on the 28th (not yet).
const salary = rule('salary', 'income', 500_000, 1);
const rent = rule('rent', 'expense', 150_000, 1);
const power = rule('power', 'expense', 30_000, 20);
const phone = rule('phone', 'expense', 10_000, 28);
const reported = {
  transactions: [paid(salary, '2026-11-01'), paid(rent, '2026-11-01'), tx('expense', 60_000, '2026-11-10')],
  recurring: [salary, rent, power, phone],
};
const plan = (transactions: Transaction[], recurring: RecurringRule[], goals: Goal[] = [], income?: number) =>
  buildPlan({ transactions, recurring, goals, month: '2026-11', today, settings: { savingsRate: 0.2, emergencyMonths: 12, income } });

describe('reconcile', () => {
  it('explains the reported gap: balance ₦290,000, left to spend ₦250,000, ₦40,000 of bills still to come', () => {
    const r = reconcile(plan(reported.transactions, reported.recurring));
    expect(r).toEqual({ balance: 290_000, incomeStillExpected: 0, billsNotYetPaid: 40_000, savings: 0, leftToSpend: 250_000 });
  });

  it('always adds up exactly, across income gaps, savings, spread payments and paused bills', () => {
    const goal: Goal = { id: 'g', name: 'Fund', kind: 'emergency', target: 1_200_000, contributions: [] };
    const cases = [
      plan(reported.transactions, reported.recurring),
      plan(reported.transactions, reported.recurring, [goal]),
      plan(reported.transactions, reported.recurring, [], 650_000), // expected income set higher than received
      plan([...reported.transactions, tx('expense', 1_200_000, '2026-03-05', { spread: 12 })], reported.recurring),
      plan(reported.transactions, [salary, { ...rent, paused: true }, power, phone]),
      plan([], []),
    ];
    for (const p of cases) {
      const r = reconcile(p);
      expect(r.balance + r.incomeStillExpected - r.billsNotYetPaid - r.savings).toBeCloseTo(r.leftToSpend, 2);
    }
  });
});

describe('upcomingThisMonth', () => {
  it('lists repeating items due later this month, in date order', () => {
    const list = upcomingThisMonth(reported.recurring, today);
    expect(list.map((u) => [u.rule.id, u.date, u.amount])).toEqual([
      ['power', '2026-11-20', 30_000],
      ['phone', '2026-11-28', 10_000],
    ]);
  });

  it('leaves out items already paid this month, paused items, and items starting next month', () => {
    const list = upcomingThisMonth([rent, { ...power, paused: true }, { ...phone, startMonth: '2026-12' }], today);
    expect(list).toEqual([]);
  });

  it('includes income still due, such as a salary paid on the 25th', () => {
    const late = rule('late-salary', 'income', 500_000, 25);
    expect(upcomingThisMonth([late], today)[0]).toMatchObject({ date: '2026-11-25', amount: 500_000 });
  });
});
