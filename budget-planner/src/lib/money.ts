/**
 * Minor units: amounts are saved as whole numbers of the currency's smallest unit (kobo for NGN,
 * cents for USD, yen for JPY), so stored money never carries fractions of a kobo.
 * Screens and calculations keep working in major units (naira), always rounded to the minor unit.
 */

const digitsCache = new Map<string, number>();

/** How many decimal places a currency uses (2 for NGN and USD, 0 for JPY). 2 when unknown or not chosen. */
export function currencyDigits(currency: string | undefined): number {
  const code = currency || '';
  const hit = digitsCache.get(code);
  if (hit != null) return hit;
  let d = 2;
  if (code) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
  }
  digitsCache.set(code, d);
  return d;
}

/** 4200.5 NGN → 420050. Exact for any amount already rounded to the currency's minor unit. */
export function toMinor(major: number, currency?: string): number {
  const f = 10 ** currencyDigits(currency);
  return Math.round(Number((major * f).toPrecision(15)));
}

/** 420050 → 4200.5 */
export function fromMinor(minor: number, currency?: string): number {
  const d = currencyDigits(currency);
  return Number((minor / 10 ** d).toFixed(d));
}

export const isMinor = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
