import { currencyName, shortDate } from '../lib/budget';
import { allCurrencies, COMMON_CURRENCIES, formatRate, type RateCache, type RatesStatus } from '../lib/currency';

/** Currency picker with common currencies first. `compact` shows codes only (for tight spaces). */
export function CurrencySelect({ id, value, onChange, compact, label, placeholder = 'Choose a currency…' }: {
  id: string;
  /** '' = none chosen yet; the placeholder is shown. */
  value: string;
  onChange: (code: string) => void;
  compact?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const all = allCurrencies();
  const common = COMMON_CURRENCIES.filter((c) => all.includes(c));
  const rest = (compact ? [...all].sort() : all).filter((c) => !common.includes(c));
  if (value && !all.includes(value) && !common.includes(value)) rest.unshift(value);
  const text = (c: string) => (compact ? c : `${currencyName(c)} (${c})`);
  return (
    <select
      id={id}
      className={compact ? 'cur-compact' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      title={compact && value ? currencyName(value) : undefined}
    >
      {!value && (
        <option value="" disabled>
          {compact ? '—' : placeholder}
        </option>
      )}
      <optgroup label="Common">
        {common.map((c) => (
          <option key={c} value={c}>{text(c)}</option>
        ))}
      </optgroup>
      <optgroup label="All currencies">
        {rest.map((c) => (
          <option key={c} value={c}>{text(c)}</option>
        ))}
      </optgroup>
    </select>
  );
}

/** "1 USD = [ 1520.35 ] NGN" with where the suggested rate came from. */
export function RateField({ id, from, to, value, onChange, suggested, rates, status, onRefresh }: {
  id: string;
  from: string;
  to: string;
  value: string;
  onChange: (v: string) => void;
  suggested: number | null;
  rates?: RateCache;
  status: RatesStatus;
  onRefresh: (() => void) | null;
}) {
  let note: string;
  if (status === 'loading') note = 'Getting today’s rate…';
  else if (suggested && rates) note = `Market rate ${formatRate(suggested)} (${shortDate(rates.date)}). Change it to the rate you actually got.`;
  else if (status === 'unavailable') note = 'Enter the rate you got. Live rates aren’t available in this view.';
  else if (status === 'error') note = 'Couldn’t get live rates. Enter the rate you got.';
  else note = `No live rate for ${from}. Enter the rate you got.`;

  return (
    <div className="rate-field">
      <label className="rate-row" htmlFor={id}>
        <span>1 {from} =</span>
        <input id={id} inputMode="decimal" value={value} placeholder="Rate" onChange={(e) => onChange(e.target.value)} />
        <span>{to}</span>
      </label>
      <p className="hint">
        {note}
        {onRefresh && status !== 'loading' && (
          <>
            {' '}
            <button type="button" className="link-btn" onClick={onRefresh}>Refresh rates</button>
          </>
        )}
      </p>
    </div>
  );
}
