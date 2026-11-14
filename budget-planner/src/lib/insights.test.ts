import { describe, expect, it } from 'vitest';
import type { BudgetStatus, Totals } from './budget';
import { overviewInsights } from './insights';
import type { Plan } from './plan';

const money = (n: number) => `£${n.toFixed(2)}`;
const totals = (income: number, expense: number): Totals => ({
  income,
  expense,
  net: income - expense,
  savingsRate: income > 0 ? Math.max(income - expense, 0) / income : 0,
});
const plan = (over: Partial<Plan> = {}): Plan => ({
  income: 0, incomeBasis: 'average', incomeMonths: 3, incomeByCategory: [], fixed: 0, goals: [], goalsTotal: 0,
  emergency: 0, free: 0, shortfall: 0, incomeThisMonth: 0, expenseThisMonth: 0, spentFree: 0, leftToSpend: 0,
  daysLeft: 0, perDay: 0, pct: { fixed: 0, goals: 0, emergency: 0, free: 0 }, ...over,
});
const budget = (category: string, limit: number, spent: number): BudgetStatus => {
  const ratio = spent / limit;
  return { category, limit, spent, remaining: limit - spent, ratio, state: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
};
const base = {
  totals: totals(0, 0), previous: totals(0, 0), previousLabel: 'October', plan: plan(), isCurrentMonth: true,
  budgets: [] as BudgetStatus[], byCategory: [] as { category: string; amount: number }[], money,
};

describe('overviewInsights', () => {
  it('says nothing when there is no data', () => {
    expect(overviewInsights(base)).toEqual([]);
  });

  it('offers a daily amount only for the current month with a working plan', () => {
    const p = plan({ income: 3000, perDay: 40, daysLeft: 10 });
    expect(overviewInsights({ ...base, plan: p })[0].title).toBe('About £40.00 a day to spend');
    expect(overviewInsights({ ...base, plan: p, isCurrentMonth: false })).toEqual([]);
    expect(overviewInsights({ ...base, plan: { ...p, shortfall: 100 } })).toEqual([]);
  });

  it('reports budgets over the limit before ones that are close', () => {
    const [i] = overviewInsights({ ...base, budgets: [budget('Dining', 100, 130), budget('Groceries', 400, 350)] });
    expect(i).toMatchObject({ tone: 'bad', title: '1 budget is over the limit', detail: 'Dining: £30.00 over in total.' });
  });

  it('reports budgets close to the limit, then all on track', () => {
    expect(overviewInsights({ ...base, budgets: [budget('Groceries', 400, 350)] })[0]).toMatchObject({
      tone: 'warn', title: 'Groceries is close to the limit',
    });
    expect(overviewInsights({ ...base, budgets: [budget('Groceries', 400, 100)] })[0].title).toBe('Every budget is on track');
  });

  it('names the biggest category and the change from last month', () => {
    const list = overviewInsights({
      ...base,
      totals: totals(0, 1000),
      previous: totals(0, 800),
      byCategory: [{ category: 'Housing', amount: 600 }],
    });
    expect(list.map((i) => i.title)).toEqual(['Housing is your biggest spend', 'Spending is up 25% on October']);
    expect(list[1].tone).toBe('warn');
  });

  it('skips tiny month-on-month changes', () => {
    const list = overviewInsights({ ...base, totals: totals(0, 1020), previous: totals(0, 1000) });
    expect(list.find((i) => i.id === 'vs-last')).toBeUndefined();
  });

  it('praises a savings rate of 20% or more', () => {
    const [i] = overviewInsights({ ...base, totals: totals(1000, 700) });
    expect(i).toMatchObject({ tone: 'good', title: 'You’re keeping 30% of your income' });
  });

  it('caps the number of insights', () => {
    const list = overviewInsights({
      ...base,
      totals: totals(5000, 1000),
      previous: totals(5000, 500),
      plan: plan({ income: 5000, perDay: 50, daysLeft: 5 }),
      budgets: [budget('Dining', 100, 50)],
      byCategory: [{ category: 'Dining', amount: 50 }],
      max: 3,
    });
    expect(list).toHaveLength(3);
  });
});
