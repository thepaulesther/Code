import { describe, expect, it } from 'vitest';
import type { Transaction } from './budget';
import { materialize, type RecurringRule } from './recurring';
import { addDays, daysBetween, dueLabel, upcoming as upcomingFrom, upcomingTotals } from './upcoming';

// As in the app: payments already due have been added (rules brought up to date) before looking ahead.
const upcoming = (rules: RecurringRule[], tx: Transaction[], today: string, opts?: Parameters<typeof upcomingFrom>[3]) =>
  upcomingFrom(materialize(rules, today).rules, tx, today, opts);

const rule = (id: string, day: number, extra: Partial<RecurringRule> = {}): RecurringRule => ({
  id, type: 'expense', amount: 100, category: 'Utilities', note: id, day, startMonth: '2026-01', ...extra,
});
const ids = (items: { rule: RecurringRule }[]) => items.map((i) => i.rule.id);

describe('date helpers', () => {
  it('counts days across month and year ends, and leap days', () => {
    expect(daysBetween('2026-11-28', '2026-12-01')).toBe(3);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05');
  });

  it('labels due dates in words while close, then by date', () => {
    expect(dueLabel('2026-11-14', '2026-11-14')).toBe('Today');
    expect(dueLabel('2026-11-15', '2026-11-14')).toBe('Tomorrow');
    expect(dueLabel('2026-11-17', '2026-11-14')).toBe('In 3 days');
    expect(dueLabel('2026-11-21', '2026-11-14')).not.toMatch(/In|Tomorrow/);
  });
});

describe('upcoming', () => {
  it('splits the rest of this month from early next month, within 7 days', () => {
    const rules = [rule('late', 30), rule('first', 1), rule('fifth', 5), rule('sixth', 6)];
    const u = upcoming(rules, [], '2026-11-28');
    expect(ids(u.thisMonth)).toEqual(['late']);
    expect(ids(u.nextMonth)).toEqual(['first', 'fifth']); // 6 December is 8 days away
  });

  it('looks across the year end', () => {
    const u = upcoming([rule('new-year', 2)], [], '2026-12-29');
    expect(u.nextMonth.map((i) => i.date)).toEqual(['2027-01-02']);
  });

  it('shows nothing from next month early in the month', () => {
    const u = upcoming([rule('first', 1), rule('mid', 15)], [], '2026-11-03');
    expect(ids(u.thisMonth)).toEqual(['mid']);
    expect(u.nextMonth).toEqual([]);
  });

  it('puts a day-31 bill on the last day of a short month', () => {
    const u = upcoming([rule('end', 31)], [], '2027-02-20');
    expect(u.thisMonth.map((i) => i.date)).toEqual(['2027-02-28']);
  });

  it('leaves out paused items but counts them, and knows when there are none at all', () => {
    const u = upcoming([rule('a', 20, { paused: true }), rule('b', 25, { paused: true })], [], '2026-11-14');
    expect(u.thisMonth).toEqual([]);
    expect(u.paused).toBe(2);
    expect(u.hasRules).toBe(true);
    expect(upcoming([], [], '2026-11-14').hasRules).toBe(false);
  });

  it('includes a yearly bill only in the month it falls due', () => {
    const yearly = rule('insurance', 3, { everyMonths: 12, startMonth: '2026-12', amount: 1200 });
    expect(ids(upcoming([yearly], [], '2026-11-28').nextMonth)).toEqual(['insurance']);
    expect(upcoming([yearly], [], '2026-11-10').nextMonth).toEqual([]);
  });

  it('lists payments added automatically today', () => {
    const tx: Transaction[] = [
      { id: 'power:2026-11', type: 'expense', amount: 100, category: 'Utilities', note: 'power', date: '2026-11-20', recurringId: 'power' },
      { id: 'x', type: 'expense', amount: 5, category: 'Dining', note: '', date: '2026-11-20' },
    ];
    const u = upcoming([rule('power', 20, { lastGenerated: '2026-11' })], tx, '2026-11-20');
    expect(u.addedToday.map((t) => t.id)).toEqual(['power:2026-11']);
    expect(u.thisMonth).toEqual([]); // already added, so not "coming up"
  });

  it('converts foreign-currency items to the base currency', () => {
    const usd = rule('usd', 20, { currency: 'USD', amount: 10, rate: 1500 });
    expect(upcoming([usd], [], '2026-11-14', { rateFor: () => 1600 }).thisMonth[0].amount).toBe(16_000);
    expect(upcoming([usd], [], '2026-11-14').thisMonth[0].amount).toBe(15_000);
  });

  it('totals money out and money in separately', () => {
    const u = upcoming([rule('bill', 20, { amount: 30.1 }), rule('bill2', 21, { amount: 0.2 }), rule('pay', 25, { type: 'income', amount: 500 })], [], '2026-11-14');
    expect(upcomingTotals(u.thisMonth)).toEqual({ out: 30.3, in: 500 });
  });
});
