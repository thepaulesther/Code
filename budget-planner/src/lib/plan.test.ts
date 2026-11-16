import { describe, expect, it } from 'vitest';
import type { Transaction } from './budget';
import {
  alertFor,
  averageMonthly,
  buildPlan,
  DEFAULT_PLAN,
  goalMonthlyNeed,
  goalProgress,
  goalRemaining,
  goalSaved,
  suggestedEmergencyTarget,
  syncAutoSavings,
  type Goal,
} from './plan';
import type { RecurringRule } from './recurring';

const naira = (n: number) => `₦${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
let seq = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${seq++}`,
  type: 'expense',
  amount: 0,
  category: 'Other',
  note: '',
  date: '2026-11-01',
  ...p,
});

// A remote worker: salary ₦500k, plus freelance that varies; average income ₦700k.
const income = [
  ...['2026-08', '2026-09', '2026-10', '2026-11'].map((m) => tx({ type: 'income', category: 'Salary', amount: 500_000, date: `${m}-01` })),
  tx({ type: 'income', category: 'Freelance', amount: 200_000, date: '2026-08-15' }),
  tx({ type: 'income', category: 'Freelance', amount: 250_000, date: '2026-09-15' }),
  tx({ type: 'income', category: 'Freelance', amount: 150_000, date: '2026-10-15' }),
];
const rules: RecurringRule[] = [
  { id: 'rent', type: 'expense', amount: 3_000_000, category: 'Housing', note: 'Rent', day: 5, startMonth: '2026-01', everyMonths: 12, spreadMonths: 12, lastGenerated: '2026-01' },
  { id: 'gen', type: 'expense', amount: 60_000, category: 'Utilities', note: 'Generator fuel', day: 3, startMonth: '2026-08', lastGenerated: '2026-11' },
];
const bills = [
  tx({ category: 'Housing', amount: 3_000_000, note: 'Rent', date: '2026-01-05', spread: 12, recurringId: 'rent' }),
  ...['2026-08', '2026-09', '2026-10', '2026-11'].map((m) => tx({ category: 'Utilities', amount: 60_000, date: `${m}-03`, recurringId: 'gen' })),
];
const november = [tx({ category: 'Groceries', amount: 90_000, date: '2026-11-06' }), tx({ category: 'Transport', amount: 30_000, date: '2026-11-08' })];
const phone: Goal = { id: 'g1', name: 'New phone', kind: 'goal', target: 900_000, targetMonth: '2027-04', contributions: [] };
const fund: Goal = { id: 'e', name: 'Emergency fund', kind: 'emergency', target: 1_200_000, contributions: [] };

const plan = (extra: Transaction[] = [], goals: Goal[] = [phone, fund], settings = DEFAULT_PLAN) =>
  buildPlan({ transactions: [...income, ...bills, ...november, ...extra], recurring: rules, goals, month: '2026-11', today: '2026-11-14', settings });

describe('goals', () => {
  const car: Goal = {
    id: 'c', name: 'Car', kind: 'goal', target: 8_000_000, targetMonth: '2027-12',
    contributions: [{ id: '1', date: '2026-10-01', amount: 1_000_000 }, { id: '2', date: '2026-11-01', amount: 400_000 }, { id: '3', date: '2026-11-09', amount: -100_000 }],
  };
  it('adds up what has been put in and taken out', () => {
    expect(goalSaved(car)).toBe(1_300_000);
    expect(goalRemaining(car)).toBe(6_700_000);
    expect(goalProgress(car)).toBeCloseTo(0.1625, 4);
  });
  it('spreads what’s left over the months until the target month (inclusive)', () => {
    expect(goalMonthlyNeed(phone, '2026-11')).toBe(150_000); // Nov..Apr = 6 months
    expect(goalMonthlyNeed(car, '2026-11')).toBe(478_571.43); // 14 months
    expect(goalMonthlyNeed({ ...phone, targetMonth: '2026-08' }, '2026-11')).toBe(900_000); // overdue: all now
    expect(goalMonthlyNeed(fund, '2026-11')).toBeNull(); // no date
    expect(goalMonthlyNeed({ ...phone, contributions: [{ id: 'x', date: '2026-11-01', amount: 900_000 }] }, '2026-11')).toBe(0);
  });
});

describe('averageMonthly', () => {
  it('averages the last 3 complete months: ₦500k salary + other income = ₦700k', () => {
    const avg = averageMonthly(income, '2026-11', 'income');
    expect(avg).toMatchObject({ amount: 700_000, months: 3, basis: 'average' });
    expect(avg.byCategory).toEqual([
      { category: 'Salary', amount: 500_000 },
      { category: 'Freelance', amount: 200_000 },
    ]);
  });
  it('falls back to this month when there is no history', () => {
    const only = [tx({ type: 'income', amount: 400_000, date: '2026-11-01' })];
    expect(averageMonthly(only, '2026-11', 'income')).toMatchObject({ amount: 400_000, basis: 'this-month', months: 0 });
    expect(averageMonthly([], '2026-11', 'income')).toMatchObject({ amount: 0, basis: 'none' });
  });
  it('counts yearly rent by its monthly share', () => {
    expect(averageMonthly(bills, '2026-11', 'expense').amount).toBe(310_000);
  });
});

describe('buildPlan', () => {
  it('splits the average income into bills, goals, emergency fund and free spending', () => {
    const p = plan();
    expect(p).toMatchObject({ income: 700_000, incomeBasis: 'average', incomeMonths: 3 });
    expect(p.fixed).toBe(310_000); // rent ₦250k/month + generator ₦60k
    expect(p.goalsTotal).toBe(150_000); // phone by April
    expect(p.emergency).toBe(100_000); // ₦1.2M over 12 months
    expect(p.free).toBe(140_000);
    expect(p.pct.free).toBeCloseTo(0.2, 5);
    expect(p.shortfall).toBe(0);
  });

  it('tracks this month: spending that isn’t a bill, what’s left and a daily amount', () => {
    const p = plan();
    expect(p.spentFree).toBe(120_000); // groceries + transport; rent share and generator are bills
    expect(p.leftToSpend).toBe(20_000);
    expect(p.daysLeft).toBe(17); // Nov 14..30
    expect(p.perDay).toBe(1176.47);
  });

  it('uses a typed-in expected income instead of the average', () => {
    const p = plan([], [phone, fund], { ...DEFAULT_PLAN, income: 500_000 });
    expect(p).toMatchObject({ income: 500_000, incomeBasis: 'manual', free: -60_000, shortfall: 60_000 });
  });

  it('gives undated goals a share of the savings slice after dated goals and the emergency fund', () => {
    const land: Goal = { id: 'l', name: 'Land', kind: 'goal', target: 5_000_000, contributions: [] };
    const tv: Goal = { id: 'tv', name: 'TV', kind: 'goal', target: 30_000, contributions: [] };
    // 20% of 700k = 140k; emergency 100k leaves 40k, split between the two undated goals.
    const p = plan([], [fund, land, tv]);
    expect(p.goals.map((a) => [a.goal.name, a.monthly, a.how])).toEqual([
      ['Land', 20_000, 'share'],
      ['TV', 20_000, 'share'],
    ]);
    const p2 = plan([], [land], { ...DEFAULT_PLAN, savingsRate: 0.3 });
    expect(p2.goals[0].monthly).toBe(210_000);
  });

  it('a past month has no days left', () => {
    const p = buildPlan({ transactions: income, recurring: [], goals: [], month: '2026-10', today: '2026-11-14', settings: DEFAULT_PLAN });
    expect(p.daysLeft).toBe(0);
    expect(p.perDay).toBe(0);
  });
});

describe('bills and repeating items (regression cases A–D from docs/redesign/03-review-round.md)', () => {
  // 3 months of £3,000 income before November; rent of £1,000 a month.
  const income = [9, 10, 11].map((m) => ({
    id: `i${m}`, type: 'income' as const, amount: 3000, category: 'Salary', note: '', date: `2026-${String(m).padStart(2, '0')}-01`,
  }));
  const rule = { id: 'r1', type: 'expense' as const, amount: 1000, category: 'Housing', note: 'Rent', day: 1, startMonth: '2026-09' };
  const paid = { id: 'p', type: 'expense' as const, amount: 1000, category: 'Housing', note: 'Rent', date: '2026-11-01', recurringId: 'r1' };
  const run = (transactions: Transaction[], recurring: RecurringRule[]) =>
    buildPlan({ transactions, recurring, goals: [], month: '2026-11', today: '2026-11-14', settings: { savingsRate: 0.2, emergencyMonths: 12 } });

  it('A: a repeating bill paid this month is counted once, as a bill', () => {
    expect(run([...income, paid], [rule])).toMatchObject({ fixed: 1000, spentFree: 0, free: 2000, leftToSpend: 2000 });
  });

  it('B (F5): a bill paused after this month’s payment still counts as a bill this month', () => {
    // Before the fix: fixed 0, spentFree 0, leftToSpend 3000 (the payment counted nowhere).
    expect(run([...income, paid], [{ ...rule, paused: true }])).toMatchObject({ fixed: 1000, spentFree: 0, free: 2000, leftToSpend: 2000 });
  });

  it('B (F5): the same holds when the repeating item no longer exists but its payment kept the link', () => {
    expect(run([...income, paid], [])).toMatchObject({ fixed: 1000, leftToSpend: 2000 });
  });

  it('B (F5): a paused bill with no payment this month isn’t set aside', () => {
    expect(run(income, [{ ...rule, paused: true }])).toMatchObject({ fixed: 0, leftToSpend: 3000 });
  });

  it('C: rent typed in by hand is everyday spending, and what’s left is the same', () => {
    expect(run([...income, { ...paid, recurringId: undefined }], [])).toMatchObject({ fixed: 0, spentFree: 1000, free: 3000, leftToSpend: 2000 });
  });

  it('D (F6): a repeating item isn’t set aside before the month it starts', () => {
    // Before the fix: fixed 1000 and leftToSpend 2000 in the month before its first payment.
    expect(run(income, [{ ...rule, startMonth: '2026-12' }])).toMatchObject({ fixed: 0, leftToSpend: 3000 });
    // From its start month it is.
    expect(run(income, [{ ...rule, startMonth: '2026-11' }])).toMatchObject({ fixed: 1000, leftToSpend: 2000 });
  });
});

describe('saving a share of income (e.g. 20% to the emergency fund)', () => {
  const fund20: Goal = { ...fund, incomeShare: 0.2, autoSave: true, autoSince: '2026-11-01' };

  it('the plan reserves 20% of income for the fund instead of spreading it over 12 months', () => {
    const p = plan([], [phone, fund20]);
    expect(p.emergency).toBe(140_000); // 20% of the ₦700k average
    expect(p.free).toBe(700_000 - 310_000 - 150_000 - 140_000);
    expect(p.pct.emergency).toBeCloseTo(0.2, 5);
  });

  it('works for any goal, and never asks for more than is left', () => {
    const almost: Goal = { ...phone, incomeShare: 0.2, contributions: [{ id: 'x', date: '2026-10-01', amount: 850_000 }] };
    const p = plan([], [almost]);
    expect(p.goals[0]).toMatchObject({ how: 'income-share', monthly: 50_000 });
  });

  it('records 20% of each income from the start date automatically', () => {
    const [g] = syncAutoSavings([fund20], income);
    // November: only the ₦500k salary so far -> ₦100k. Earlier months are before autoSince.
    expect(g.contributions).toEqual([{ id: 'auto:e:' + income[3].id, date: '2026-11-01', amount: 100_000, txId: income[3].id }]);
    expect(goalSaved(g)).toBe(100_000);
  });

  it('adds more as income comes in, follows edits and deletions, and is stable when nothing changed', () => {
    const freelance = tx({ type: 'income', category: 'Freelance', amount: 200_000, date: '2026-11-15' });
    let goals = syncAutoSavings([fund20], [...income, freelance]);
    expect(goalSaved(goals[0])).toBe(140_000);
    expect(syncAutoSavings(goals, [...income, freelance])).toBe(goals); // no change -> same array
    goals = syncAutoSavings(goals, [...income, { ...freelance, amount: 300_000 }]);
    expect(goalSaved(goals[0])).toBe(160_000);
    goals = syncAutoSavings(goals, income); // freelance deleted
    expect(goalSaved(goals[0])).toBe(100_000);
  });

  it('keeps money added by hand and stops at the target', () => {
    const nearlyFull: Goal = { ...fund20, target: 1_200_000, contributions: [{ id: 'm', date: '2026-10-20', amount: 1_150_000 }] };
    const [g] = syncAutoSavings([nearlyFull], income);
    expect(g.contributions.map((c) => [c.amount, !!c.txId])).toEqual([[1_150_000, false], [50_000, true]]);
    expect(goalSaved(g)).toBe(1_200_000);
  });

  it('does nothing when automatic saving is off, and removes earlier automatic amounts', () => {
    const [on] = syncAutoSavings([fund20], income);
    const [off] = syncAutoSavings([{ ...on, autoSave: false }], income);
    expect(off.contributions).toEqual([]);
  });
});

describe('suggestedEmergencyTarget', () => {
  it('is 3 months of average spending, rounded up to 1,000', () => {
    // (310,000 × 3 + 1,234) / 3 months = 310,411.33 a month; × 3 = 931,234, rounded up to 932,000.
    expect(suggestedEmergencyTarget([...bills, tx({ amount: 1_234, date: '2026-10-02' })], '2026-11')).toBe(932_000);
    expect(suggestedEmergencyTarget([], '2026-11')).toBe(0);
  });
});

describe('alertFor', () => {
  it('stays quiet while spending is on track', () => {
    expect(alertFor(plan(), naira)).toBeNull();
  });
  it('warns at 90% of this month’s spending money', () => {
    const a = alertFor(plan([tx({ amount: 6_000, date: '2026-11-10' })]), naira); // 126k of 140k
    expect(a).toMatchObject({ level: 'near-plan', title: 'You’ve used 90% of this month’s spending money' });
    expect(a?.detail).toBe('₦14,000 is left for the next 17 days.');
  });
  it('raises the alarm when spending money is used up', () => {
    const a = alertFor(plan([tx({ amount: 40_000, date: '2026-11-10' })]), naira); // 160k of 140k
    expect(a?.level).toBe('over-plan');
    expect(a?.detail).toContain('₦20,000 more than the ₦140,000');
  });
  it('raises the loudest alarm when expenses exceed income this month', () => {
    const a = alertFor(plan([tx({ amount: 200_000, date: '2026-11-10' })]), naira); // 630k spent vs 500k in
    expect(a).toMatchObject({ level: 'over-income', title: 'Spending is higher than your income this month' });
    expect(a?.detail).toBe('You’ve spent ₦630,000 against ₦500,000 of income: ₦130,000 more than came in.');
  });
  it('before income arrives, compares with usual income instead of zero', () => {
    const history = income.filter((t) => !t.date.startsWith('2026-11'));
    const small = buildPlan({
      transactions: [...history, tx({ amount: 50_000, date: '2026-11-02' })],
      recurring: [], goals: [], month: '2026-11', today: '2026-11-02', settings: DEFAULT_PLAN,
    });
    expect(alertFor(small, naira)).toBeNull(); // ₦50k spent, no salary yet: not an alarm
    const big = buildPlan({
      transactions: [...history, tx({ amount: 800_000, date: '2026-11-02' })],
      recurring: [], goals: [], month: '2026-11', today: '2026-11-02', settings: DEFAULT_PLAN,
    });
    expect(alertFor(big, naira)?.level).toBe('over-income');
  });
  it('when bills and savings already exceed income, any other spending is flagged', () => {
    const p = plan([], [phone, fund], { ...DEFAULT_PLAN, income: 500_000 });
    expect(alertFor(p, naira)).toMatchObject({ level: 'over-plan', title: 'Bills and savings already use all your income' });
  });
});
