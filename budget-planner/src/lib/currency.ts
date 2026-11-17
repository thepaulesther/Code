import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { appLocale, CURRENCIES, currencyName, round2 } from './budget';

export { round2 };

/** Latest exchange rates: `rates[X]` = units of X per 1 unit of `base`. */
export interface RateCache {
  base: string;
  date: string; // YYYY-MM-DD the provider published these rates
  fetchedAt: number; // ms since epoch
  source: string;
  rates: Record<string, number>;
}

/** How many `to` units one `from` unit buys, or null if either currency is missing. */
export function conversionRate(cache: RateCache | undefined, from: string, to: string): number | null {
  if (from === to) return 1;
  if (!cache) return null;
  const f = from === cache.base ? 1 : cache.rates[from];
  const t = to === cache.base ? 1 : cache.rates[to];
  return f > 0 && t > 0 ? t / f : null;
}

/** Common currencies first in pickers, including ones popular with remote workers. */
export const COMMON_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'NGN', 'JPY', 'CAD', 'AUD', 'INR', 'CNY', 'GHS',
  'KES', 'ZAR', 'EGP', 'AED', 'CHF', 'BRL', 'MXN', 'PHP', 'PKR', 'SGD',
];

let allCache: string[] | null = null;

/** Every ISO currency this browser can format, sorted by name. */
export function allCurrencies(): string[] {
  if (allCache) return allCache;
  let codes: string[] | undefined;
  try {
    // Not in every browser (or every TS lib), so feature-detect it.
    codes = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('currency');
  } catch {
    codes = undefined;
  }
  if (!codes?.length) codes = [...new Set([...COMMON_CURRENCIES, ...CURRENCIES])];
  allCache = [...codes].sort((a, b) => currencyName(a).localeCompare(currencyName(b)));
  return allCache;
}

/** Display a rate with sensible precision: 1,520.35 / 1.0842 / 0.000657. */
export function formatRate(rate: number): string {
  if (rate >= 100) return rate.toLocaleString(appLocale(), { maximumFractionDigits: 2 });
  if (rate >= 1) return rate.toLocaleString(appLocale(), { maximumFractionDigits: 4 });
  return rate.toLocaleString(appLocale(), { maximumSignificantDigits: 4 });
}

/** Plain number for an editable input (no grouping), e.g. "1520.35". */
export const rateForInput = (rate: number) =>
  String(rate >= 1 ? Math.round(rate * 10000) / 10000 : Number(rate.toPrecision(4)));

/** "1,520.35" -> 1520.35. Null unless a positive number. */
export function parseRate(input: string): number | null {
  const s = input.trim().replace(/[\s,]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ---------- Fetching ---------- */

const PROVIDERS = [
  { name: 'ExchangeRate-API', url: 'https://open.er-api.com/v6/latest/USD' },
  { name: 'fawazahmed0 currency-api', url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json' },
];

export const RATES_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Read either provider's response shape. Returns null if it isn't usable. */
export function parseRatesResponse(json: unknown, source: string, now = Date.now()): RateCache | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  // open.er-api.com: { result: "success", base_code: "USD", time_last_update_unix, rates: { NGN: 1520.3 } }
  if (j.result === 'success' && typeof j.base_code === 'string' && j.rates && typeof j.rates === 'object') {
    const rates = cleanRates(j.rates as Record<string, unknown>, (k) => k);
    const unix = typeof j.time_last_update_unix === 'number' ? j.time_last_update_unix * 1000 : now;
    return rates ? { base: j.base_code, date: new Date(unix).toISOString().slice(0, 10), fetchedAt: now, source, rates } : null;
  }
  // currency-api: { date: "2026-11-14", usd: { ngn: 1520.3 } }
  if (typeof j.date === 'string' && j.usd && typeof j.usd === 'object') {
    const rates = cleanRates(j.usd as Record<string, unknown>, (k) => k.toUpperCase());
    return rates ? { base: 'USD', date: j.date, fetchedAt: now, source, rates } : null;
  }
  return null;
}

function cleanRates(raw: Record<string, unknown>, key: (k: string) => string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && v > 0 && /^[a-z]{3}$/i.test(k)) out[key(k)] = v;
  }
  return Object.keys(out).length > 10 ? out : null;
}

/** Try each provider in turn. Only the currency list is requested; no user data is sent. */
export async function fetchLatestRates(): Promise<RateCache> {
  for (const p of PROVIDERS) {
    try {
      const res = await fetch(p.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const parsed = parseRatesResponse(await res.json(), p.name);
      if (parsed) return parsed;
    } catch {
      // Try the next provider.
    }
  }
  throw new Error('No exchange-rate provider could be reached');
}

export type RatesStatus = 'idle' | 'loading' | 'error' | 'unavailable';

/** Keeps `rates` fresh: fetches on load and when coming back online, at most every 12 hours. */
export function useRates<T extends { rates?: RateCache }>(
  rates: RateCache | undefined,
  setData: Dispatch<SetStateAction<T>>,
  { online, disabled }: { online: boolean; disabled: boolean },
) {
  const [status, setStatus] = useState<RatesStatus>(disabled ? 'unavailable' : 'idle');
  const latest = useRef(rates);
  useEffect(() => {
    latest.current = rates;
  }, [rates]);

  const refresh = useRef(async () => {
    setStatus('loading');
    try {
      const r = await fetchLatestRates();
      setData((d) => ({ ...d, rates: r }));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  });

  useEffect(() => {
    if (disabled || !online) return;
    const cur = latest.current;
    if (!cur || Date.now() - cur.fetchedAt > RATES_MAX_AGE_MS) refresh.current();
  }, [online, disabled]);

  return { status, refresh: disabled ? null : () => refresh.current() };
}
