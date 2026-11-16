import { describe, expect, it } from 'vitest';
import type { Transaction } from './budget';
import { changeLabel, compareMonths } from './compare';

let n = 0;
const tx = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, type: 'expense', amount, category: 'Food', note: '', date, ...extra,
});

describe('compareMonths', () => {
  const data = [
    tx('2026-10-02', 100), tx('2026-10-20', 400), // October: 100 by the 3rd, 500 in total
    tx('2026-11-01', 60),                         // November so far
  ];

  it('stops last month at the same day while this month is running', () => {
    const c = compareMonths(data, '2026-11', '2026-11-03');
    expect(c).toMatchObject({ partial: true, day: 3 });
    expect(c.now.expense).toBe(60);
    expect(c.before.expense).toBe(100); // not 500
  });

  it('compares whole months for a finished month', () => {
    const c = compareMonths(data, '2026-11', '2026-12-10');
    expect(c.partial).toBe(false);
    expect(c.before.expense).toBe(500);
  });

  it('compares whole months on the last day of the month', () => {
    expect(compareMonths(data, '2026-11', '2026-11-30').partial).toBe(false);
  });

  it('caps the day at the length of a shorter previous month', () => {
    const c = compareMonths([tx('2026-02-28', 50), tx('2026-03-30', 70)], '2026-03', '2026-03-30');
    expect(c.before.expense).toBe(50); // all of February counts by "day 30"
    expect(c.now.expense).toBe(70);
  });

  it('counts a spread payment’s monthly share in full on both sides', () => {
    // Paid on the 25th of September, spread over 12 months: 100 a month.
    const rent = tx('2026-09-25', 1200, { spread: 12 });
    const c = compareMonths([rent], '2026-11', '2026-11-03');
    expect(c.now.expense).toBe(100);
    expect(c.before.expense).toBe(100);
  });

  it('handles an empty previous month', () => {
    const c = compareMonths([tx('2026-11-01', 10)], '2026-11', '2026-11-05');
    expect(c.before.expense).toBe(0);
  });
});

describe('changeLabel', () => {
  it('names the comparison it makes', () => {
    expect(changeLabel(110, 100, false)).toBe('▲ 10% vs last month');
    expect(changeLabel(50, 100, true)).toBe('▼ 50% vs same day last month');
  });
  it('returns null with nothing to compare against', () => {
    expect(changeLabel(10, 0, true)).toBeNull();
  });
});
