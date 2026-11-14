import { describe, expect, it } from 'vitest';
import { allCurrencies, conversionRate, parseRate, parseRatesResponse, rateForInput, round2, type RateCache } from './currency';

const cache: RateCache = {
  base: 'USD',
  date: '2026-11-14',
  fetchedAt: 0,
  source: 'test',
  rates: { USD: 1, NGN: 1520, EUR: 0.8, JPY: 150 },
};

describe('conversionRate', () => {
  it('converts from and to the cache base', () => {
    expect(conversionRate(cache, 'USD', 'NGN')).toBe(1520);
    expect(conversionRate(cache, 'NGN', 'USD')).toBeCloseTo(1 / 1520, 10);
  });
  it('cross-converts between two non-base currencies', () => {
    expect(conversionRate(cache, 'EUR', 'NGN')).toBe(1900);
    expect(conversionRate(cache, 'JPY', 'NGN')).toBeCloseTo(10.1333, 4);
  });
  it('is 1 for the same currency (even with no rates) and null for unknown ones', () => {
    expect(conversionRate(undefined, 'NGN', 'NGN')).toBe(1);
    expect(conversionRate(undefined, 'USD', 'NGN')).toBeNull();
    expect(conversionRate(cache, 'XYZ', 'NGN')).toBeNull();
  });
});

describe('round2', () => {
  it('rounds half-cents up despite float noise', () => {
    expect(round2(1200.5 * 1520.35)).toBe(1825180.18);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(7601750)).toBe(7601750);
  });
});

describe('parseRatesResponse', () => {
  const many = (f: (k: string) => string) =>
    Object.fromEntries(['USD', 'NGN', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'INR', 'GHS', 'KES', 'ZAR', 'CHF'].map((k, i) => [f(k), i + 1]));

  it('reads open.er-api.com responses', () => {
    const r = parseRatesResponse({ result: 'success', base_code: 'USD', time_last_update_unix: 1794614401, rates: many((k) => k) }, 'A', 5);
    expect(r).toMatchObject({ base: 'USD', date: '2026-11-14', fetchedAt: 5, source: 'A' });
    expect(r?.rates.NGN).toBe(2);
  });
  it('reads currency-api responses (lower-case codes)', () => {
    const r = parseRatesResponse({ date: '2026-11-13', usd: { ...many((k) => k.toLowerCase()), '1inch': 3 } }, 'B');
    expect(r).toMatchObject({ base: 'USD', date: '2026-11-13' });
    expect(r?.rates.NGN).toBe(2);
    expect(r?.rates['1INCH']).toBeUndefined();
  });
  it('rejects errors and junk', () => {
    expect(parseRatesResponse({ result: 'error' }, 'A')).toBeNull();
    expect(parseRatesResponse(null, 'A')).toBeNull();
    expect(parseRatesResponse({ result: 'success', base_code: 'USD', rates: { NGN: 1 } }, 'A')).toBeNull();
  });
});

describe('rate input helpers', () => {
  it('parses typed rates', () => {
    expect(parseRate('1,520.35')).toBe(1520.35);
    expect(parseRate(' 0.00066 ')).toBe(0.00066);
    expect(parseRate('0')).toBeNull();
    expect(parseRate('')).toBeNull();
    expect(parseRate('abc')).toBeNull();
  });
  it('formats rates for editing without losing small values', () => {
    expect(rateForInput(1520.351234)).toBe('1520.3512');
    expect(rateForInput(1 / 1520)).toBe('0.0006579');
  });
});

describe('allCurrencies', () => {
  it('includes Naira and Yen', () => {
    const all = allCurrencies();
    expect(all).toContain('NGN');
    expect(all).toContain('JPY');
    expect(all.length).toBeGreaterThan(100);
  });
});
