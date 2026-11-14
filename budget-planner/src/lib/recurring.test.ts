import { describe, expect, it } from 'vitest';
import { dateForMonth, dueOccurrences, materialize, nextOccurrence, ordinal, resumeRule, ruleBaseAmount, type RecurringRule } from './recurring';

const rule = (p: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1',
  type: 'expense',
  amount: 1450,
  category: 'Housing',
  note: 'Rent',
  day: 2,
  startMonth: '2026-09',
  ...p,
});

describe('dateForMonth', () => {
  it('clamps to the end of short months', () => {
    expect(dateForMonth('2026-02', 31)).toBe('2026-02-28');
    expect(dateForMonth('2028-02', 30)).toBe('2028-02-29');
    expect(dateForMonth('2026-04', 31)).toBe('2026-04-30');
    expect(dateForMonth('2026-11', 5)).toBe('2026-11-05');
  });
});

describe('dueOccurrences', () => {
  it('back-fills from the start month up to today', () => {
    expect(dueOccurrences(rule(), '2026-11-14')).toEqual(['2026-09-02', '2026-10-02', '2026-11-02']);
  });
  it('skips this month when the day has not come yet', () => {
    expect(dueOccurrences(rule({ day: 20 }), '2026-11-14')).toEqual(['2026-09-20', '2026-10-20']);
  });
  it('continues after lastGenerated and never repeats it', () => {
    expect(dueOccurrences(rule({ lastGenerated: '2026-10' }), '2026-11-14')).toEqual(['2026-11-02']);
    expect(dueOccurrences(rule({ lastGenerated: '2026-11' }), '2026-11-14')).toEqual([]);
  });
  it('does nothing for future starts or paused rules', () => {
    expect(dueOccurrences(rule({ startMonth: '2026-12' }), '2026-11-14')).toEqual([]);
    expect(dueOccurrences(rule({ paused: true }), '2026-11-14')).toEqual([]);
  });
});

describe('materialize', () => {
  it('creates transactions with stable ids and advances lastGenerated', () => {
    const { created, rules } = materialize([rule()], '2026-10-05');
    expect(created.map((t) => [t.id, t.date])).toEqual([
      ['r1:2026-09', '2026-09-02'],
      ['r1:2026-10', '2026-10-02'],
    ]);
    expect(created[0]).toMatchObject({ type: 'expense', amount: 1450, recurringId: 'r1' });
    expect(rules[0].lastGenerated).toBe('2026-10');
  });
  it('is idempotent: a second run adds nothing and returns the same array', () => {
    const first = materialize([rule()], '2026-11-14');
    const second = materialize(first.rules, '2026-11-14');
    expect(second.created).toEqual([]);
    expect(second.rules).toBe(first.rules);
  });
});

describe('foreign-currency rules', () => {
  const salary = rule({ id: 's', type: 'income', amount: 5000, currency: 'USD', rate: 1400, category: 'Salary', note: 'Pay', day: 1, startMonth: '2026-11' });

  it('converts each occurrence at the live rate and remembers it', () => {
    const { created, rules } = materialize([salary], '2026-11-14', (c) => (c === 'USD' ? 1520.35 : null));
    expect(created[0]).toMatchObject({ amount: 7601750, original: { amount: 5000, currency: 'USD', rate: 1520.35 } });
    expect(rules[0].rate).toBe(1520.35);
  });
  it('falls back to the rule’s last rate when offline', () => {
    const { created } = materialize([salary], '2026-11-14', () => null);
    expect(created[0]).toMatchObject({ amount: 7000000, original: { rate: 1400 } });
  });
  it('ruleBaseAmount gives the monthly amount in base currency', () => {
    expect(ruleBaseAmount(salary)).toBe(7000000);
    expect(ruleBaseAmount(salary, () => 1500)).toBe(7500000);
    expect(ruleBaseAmount(rule())).toBe(1450);
  });
});

describe('nextOccurrence', () => {
  it('returns the next future date, or null when paused', () => {
    expect(nextOccurrence(rule({ lastGenerated: '2026-11' }), '2026-11-14')).toBe('2026-12-02');
    expect(nextOccurrence(rule({ day: 20, lastGenerated: '2026-10' }), '2026-11-14')).toBe('2026-11-20');
    expect(nextOccurrence(rule({ startMonth: '2027-01' }), '2026-11-14')).toBe('2027-01-02');
    expect(nextOccurrence(rule({ paused: true }), '2026-11-14')).toBeNull();
  });
});

describe('resumeRule', () => {
  it('does not back-fill months skipped while paused', () => {
    const resumed = resumeRule(rule({ paused: true, lastGenerated: '2026-07' }), '2026-11-14');
    expect(resumed.paused).toBe(false);
    expect(dueOccurrences(resumed, '2026-11-14')).toEqual([]);
    expect(nextOccurrence(resumed, '2026-11-14')).toBe('2026-12-02');
  });
  it('still adds this month when its day is later than today', () => {
    const resumed = resumeRule(rule({ day: 20, paused: true, lastGenerated: '2026-07' }), '2026-11-14');
    expect(nextOccurrence(resumed, '2026-11-14')).toBe('2026-11-20');
  });
  it('respects a future start month', () => {
    const resumed = resumeRule(rule({ startMonth: '2027-02', paused: true }), '2026-11-14');
    expect(nextOccurrence(resumed, '2026-11-14')).toBe('2027-02-02');
  });
});

describe('ordinal', () => {
  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [31, '31st']])(
    '%i -> %s',
    (n, s) => expect(ordinal(n)).toBe(s),
  );
});
