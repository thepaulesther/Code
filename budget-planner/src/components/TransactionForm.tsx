import { useState, type FormEvent } from 'react';
import {
  currencySymbol,
  monthLabel,
  monthOf,
  newId,
  parseAmount,
  shiftMonth,
  shortDate,
  todayISO,
  type Transaction,
  type TxType,
} from '../lib/budget';
import { conversionRate, parseRate, rateForInput, round2, type RateCache, type RatesStatus } from '../lib/currency';
import { useFormat } from '../lib/format';
import { findSimilarRule, intervalOf, ordinal, type RecurringRule } from '../lib/recurring';
import { CurrencySelect, RateField } from './CurrencyFields';

/** 0 = one-off, 1 = every month, 12 = every year. */
export type RepeatEvery = 0 | 1 | 12;

const SPREAD_OPTIONS: [number, string][] = [
  [1, 'This month only'],
  [3, '3 months'],
  [6, '6 months'],
  [12, '12 months'],
  [24, '24 months'],
];

export function TransactionForm({ expenseCategories, incomeCategories, rates, ratesStatus, onRefreshRates, recurring, onAdd, onChooseBase }: {
  expenseCategories: string[];
  incomeCategories: string[];
  rates?: RateCache;
  ratesStatus: RatesStatus;
  onRefreshRates: (() => void) | null;
  /** Existing repeating items, to offer replacing one (e.g. monthly rent -> yearly rent). */
  recurring: RecurringRule[];
  onAdd: (t: Transaction, repeatEvery: RepeatEvery, replaceRuleId?: string) => void;
  /** Sets the base currency; offered here when none has been chosen yet. */
  onChooseBase: (currency: string) => void;
}) {
  const [keepOldFor, setKeepOldFor] = useState<string | null>(null); // rule id the user chose to keep
  const { money, currency: base } = useFormat();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null); // null = base currency
  const currency = chosenCurrency ?? base;
  const [rateText, setRateText] = useState<string | null>(null); // null = use the market rate
  const [category, setCategory] = useState('Groceries');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [repeat, setRepeat] = useState<RepeatEvery>(0);
  const [spread, setSpread] = useState(1);
  const [error, setError] = useState('');

  const categories = type === 'expense' ? expenseCategories : incomeCategories;
  // Fall back to the first category if the chosen one was renamed or deleted.
  const current = categories.includes(category) ? category : (categories[0] ?? '');

  const foreign = currency !== base;
  const suggested = foreign ? conversionRate(rates, currency, base) : 1;
  const shownRate = rateText ?? (foreign && suggested ? rateForInput(suggested) : '');
  const rate = foreign ? parseRate(shownRate) : 1;
  const value = parseAmount(amount);
  const similar = repeat > 0 && current ? findSimilarRule(recurring, { type, category: current, note }) : undefined;
  const replaceOld = !!similar && keepOldFor !== similar.id;

  const switchType = (t: TxType) => {
    setType(t);
    const list = t === 'expense' ? expenseCategories : incomeCategories;
    setCategory(t === 'expense' && list.includes('Groceries') ? 'Groceries' : (list[0] ?? ''));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!base) return setError('Choose your currency first');
    if (value == null) return setError('Enter an amount greater than 0, like 42.50');
    if (foreign && rate == null) return setError(`Enter the exchange rate from ${currency} to ${base}`);
    if (!date) return setError('Pick a date');
    if (!current) return setError('Add a category in Settings first');
    const r = rate ?? 1;
    onAdd(
      {
        id: newId(),
        type,
        amount: round2(value * r),
        category: current,
        note: note.trim(),
        date,
        ...(foreign ? { original: { amount: value, currency, rate: r } } : {}),
        ...(spread > 1 ? { spread } : {}),
      },
      repeat,
      replaceOld ? similar?.id : undefined,
    );
    setKeepOldFor(null);
    setAmount('');
    setNote('');
    setRepeat(0);
    setSpread(1);
    setRateText(null); // a rate typed for one payment shouldn't silently apply to the next
    setError('');
  };

  const day = Number(date.slice(8, 10));

  return (
    <form className="card tx-form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>Add transaction</h2>
      </div>
      {!base && (
        <div className="choose-base">
          <label htmlFor="form-base-currency">First, choose the currency your totals are in</label>
          <CurrencySelect id="form-base-currency" value="" onChange={onChooseBase} label="Base currency" />
        </div>
      )}
      <fieldset className="tx-fields" disabled={!base}>
      <div className="segmented" role="radiogroup" aria-label="Transaction type">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            className={type === t ? `is-on ${t}` : ''}
            onClick={() => switchType(t)}
          >
            {t === 'expense' ? 'Expense' : 'Income'}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="tx-amount">Amount</label>
        <div className="amount-row">
          <CurrencySelect
            id="tx-currency"
            compact
            label="Currency"
            value={currency}
            onChange={(c) => {
              setChosenCurrency(c === base ? null : c);
              setRateText(null);
            }}
          />
          <div className="money-input">
            <span aria-hidden>{currencySymbol(currency)}</span>
            <input
              id="tx-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!error}
            />
          </div>
        </div>
      </div>
      {foreign && (
        <div className="convert-box">
          <RateField
            id="tx-rate"
            from={currency}
            to={base}
            value={shownRate}
            onChange={setRateText}
            suggested={suggested}
            rates={rates}
            status={ratesStatus}
            onRefresh={onRefreshRates}
          />
          <p className="convert-result">
            {value != null && rate != null ? (
              <>
                <span className="muted">Counts as</span> <strong className="num">{money(round2(value * rate))}</strong>
              </>
            ) : (
              <span className="muted">Enter the amount and rate to see it in {base}.</span>
            )}
          </p>
        </div>
      )}
      <div className="field-row">
        <label className="field">
          <span>Category</span>
          <select id="tx-category" value={current} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Note <em>(optional)</em></span>
        <input id="tx-note" placeholder="e.g. Farmers market" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Repeats</span>
          <select
            id="tx-repeat"
            value={repeat}
            onChange={(e) => {
              const next = Number(e.target.value) as RepeatEvery;
              setRepeat(next);
              // A yearly bill (rent, insurance, school fees) normally counts as 1/12 each month.
              if (next === 12 && spread === 1) setSpread(12);
              if (next !== 12 && repeat === 12 && spread === 12) setSpread(1);
            }}
          >
            <option value={0}>Doesn’t repeat</option>
            <option value={1}>Every month</option>
            <option value={12}>Every year</option>
          </select>
        </label>
        <label className="field">
          <span>Counts toward</span>
          <select id="tx-spread" value={spread} onChange={(e) => setSpread(Number(e.target.value))}>
            {SPREAD_OPTIONS.map(([n, label]) => (
              <option key={n} value={n}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      {(repeat > 0 || spread > 1) && day > 0 && (
        <p className="form-note">
          {spread > 1 && value != null && rate != null && (
            <>
              <strong className="num">{money(round2((value * rate) / spread))}</strong> a month,{' '}
              {monthLabel(monthOf(date), 'short')} {date.slice(0, 4)} – {monthLabel(shiftMonth(monthOf(date), spread - 1), 'short')}{' '}
              {shiftMonth(monthOf(date), spread - 1).slice(0, 4)}.{' '}
            </>
          )}
          {spread > 1 && (value == null || rate == null) && `Split evenly over ${spread} months from ${monthLabel(monthOf(date))}. `}
          {repeat === 1 && <>Repeats on the {ordinal(day)} of every month{day > 28 && ' (or the last day of shorter months)'}. </>}
          {repeat === 12 && <>Repeats every year on {shortDate(date)}. </>}
          {repeat > 0 && foreign && `Later payments convert at the latest ${currency} rate.`}
        </p>
      )}
      {similar && (
        <label className="check replace-note">
          <input
            id="tx-replace"
            type="checkbox"
            checked={replaceOld}
            onChange={(e) => setKeepOldFor(e.target.checked ? null : similar.id)}
          />
          <span>
            Stop the existing repeating “{similar.note || similar.category}”
            <small>
              It’s still set to {intervalOf(similar) === 12 ? 'every year' : 'every month'}
              {similar.sample ? ' (example data)' : ''}. Untick to keep both. Past payments stay.
            </small>
          </span>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary">
        {repeat === 1 ? `Add monthly ${type}` : repeat === 12 ? `Add yearly ${type}` : `Add ${type}`}
      </button>
      </fieldset>
    </form>
  );
}
