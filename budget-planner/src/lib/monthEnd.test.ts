import { describe, expect, it } from 'vitest';
import type { Transaction } from './budget';
import { checkInFor, monthEndCheckIn, monthResult, openGoals, saveLeftOver, splitProblem } from './monthEnd';
import type { Goal } from './plan';

const tx = (type: 'income' | 'expense', amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `${type}-${amount}-${date}`, type, amount, category: type === 'income' ? 'Salary' : 'Groceries', note: '', date, ...extra,
});
const goal = (id: string, target: number, contributions: Goal['contributions'] = []): Goal => ({
  id, name: id, kind: 'goal', target, contributions,
});

// October: earned ₦500,000, spent ₦450,000, so ₦50,000 left over.
const october = [tx('income', 500_000, '2026-10-01'), tx('expense', 450_000, '2026-10-12')];

describe('monthResult', () => {
  it('is income minus spending, less anything already saved that month', () => {
    const saved = goal('car', 1_000_000, [{ id: 'c', date: '2026-10-20', amount: 20_000 }, { id: 'd', date: '2026-09-20', amount: 99 }]);
    expect(monthResult(october, [saved], '2026-10')).toEqual({
      month: '2026-10', income: 500_000, expense: 450_000, net: 50_000, saved: 20_000, leftOver: 30_000,
    });
  });

  it('counts only this month’s share of a spread payment, as the balance does', () => {
    const yearlyRent = tx('expense', 1_200_000, '2026-01-05', { spread: 12 });
    expect(monthResult([...october, yearlyRent], [], '2026-10').leftOver).toBe(-50_000);
  });
});

describe('checkInFor', () => {
  it('offers money left over', () => {
    expect(checkInFor(october, [], '2026-10')).toMatchObject({ kind: 'left-over', result: { leftOver: 50_000 } });
  });

  it('notes a month that spent more than it earned', () => {
    const over = [...october, tx('expense', 62_000, '2026-10-25')];
    expect(checkInFor(over, [], '2026-10')).toMatchObject({ kind: 'over', result: { net: -12_000 } });
  });

  it('says nothing when no income was recorded', () => {
    expect(checkInFor([tx('expense', 100, '2026-10-02')], [], '2026-10')).toBeNull();
  });

  it('says nothing once the surplus is saved', () => {
    const saved = goal('fund', 1_000_000, [{ id: 'c', date: '2026-10-31', amount: 50_000 }]);
    expect(checkInFor(october, [saved], '2026-10')).toBeNull();
  });
});

describe('monthEndCheckIn', () => {
  it('is offered for the first 7 days of the next month', () => {
    expect(monthEndCheckIn(october, [], '2026-11-01', [])?.result.month).toBe('2026-10');
    expect(monthEndCheckIn(october, [], '2026-11-07', [])).not.toBeNull();
    expect(monthEndCheckIn(october, [], '2026-11-08', [])).toBeNull();
  });

  it('works across the year end', () => {
    const december = [tx('income', 300, '2026-12-01'), tx('expense', 100, '2026-12-10')];
    expect(monthEndCheckIn(december, [], '2027-01-03', [])?.result).toMatchObject({ month: '2026-12', leftOver: 200 });
  });

  it('stays away once dismissed for that month', () => {
    expect(monthEndCheckIn(october, [], '2026-11-02', ['2026-10'])).toBeNull();
    expect(monthEndCheckIn(october, [], '2026-11-02', ['2026-09'])).not.toBeNull();
  });
});

describe('saving the left-over money', () => {
  const car = goal('car', 1_000_000);
  const fund = goal('fund', 30_000, [{ id: 'x', date: '2026-08-01', amount: 20_000 }]); // needs ₦10,000 more
  const full = goal('done', 100, [{ id: 'y', date: '2026-08-01', amount: 100 }]);

  it('only offers goals that still need money', () => {
    expect(openGoals([car, fund, full]).map((g) => g.id)).toEqual(['car', 'fund']);
  });

  it('checks the split before saving', () => {
    expect(splitProblem([car, fund], 50_000, [])).toMatch(/at least one/);
    expect(splitProblem([car, fund], 50_000, [{ goalId: 'car', amount: -5 }])).toMatch(/more than zero/);
    expect(splitProblem([car, fund], 50_000, [{ goalId: 'fund', amount: 10_001 }])).toMatch(/only needs 10000/);
    expect(splitProblem([car, fund], 50_000, [{ goalId: 'car', amount: 45_000 }, { goalId: 'fund', amount: 5_001 }])).toMatch(/more than the 50000/);
    expect(splitProblem([car, fund], 50_000, [{ goalId: 'car', amount: 40_000 }, { goalId: 'fund', amount: 10_000 }])).toBeNull();
    expect(splitProblem([car], 50_000, [{ goalId: 'gone', amount: 1 }])).toMatch(/no longer exists/);
  });

  it('records contributions on the last day of that month, and the check-in then goes away', () => {
    const goals = saveLeftOver([car, fund], '2026-10', [{ goalId: 'car', amount: 40_000 }, { goalId: 'fund', amount: 10_000 }]);
    expect(goals[0].contributions).toEqual([expect.objectContaining({ date: '2026-10-31', amount: 40_000 })]);
    expect(goals[1].contributions).toHaveLength(2);
    expect(checkInFor(october, goals, '2026-10')).toBeNull();
  });

  it('uses the right last day in February', () => {
    const goals = saveLeftOver([car], '2028-02', [{ goalId: 'car', amount: 1 }]);
    expect(goals[0].contributions[0].date).toBe('2028-02-29');
  });

  it('leaves part of the money for later when only some is saved', () => {
    const goals = saveLeftOver([car], '2026-10', [{ goalId: 'car', amount: 20_000 }]);
    expect(checkInFor(october, goals, '2026-10')?.result.leftOver).toBe(30_000);
  });
});
