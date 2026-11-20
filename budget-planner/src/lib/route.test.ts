import { describe, expect, it } from 'vitest';
import { hrefFor, parseRoute, ROUTES } from './route';

describe('parseRoute', () => {
  it('reads the page from the hash', () => {
    expect(parseRoute('#/budgets')).toBe('budgets');
    expect(parseRoute('#/settings')).toBe('settings');
    expect(parseRoute('#budgets')).toBe('budgets');
  });

  it('falls back to the dashboard (the home page) for empty or unknown hashes', () => {
    expect(parseRoute('')).toBe('dashboard');
    expect(parseRoute('#/')).toBe('dashboard');
    expect(parseRoute('#/nope')).toBe('dashboard');
    expect(parseRoute('#/overview')).toBe('overview');
  });

  it('ignores extra path parts, queries and letter case', () => {
    expect(parseRoute('#/savings/123')).toBe('savings');
    expect(parseRoute('#/Insights?x=1')).toBe('insights');
  });

  it('round-trips every route through its link', () => {
    for (const r of ROUTES) expect(parseRoute(hrefFor(r))).toBe(r);
  });
});
