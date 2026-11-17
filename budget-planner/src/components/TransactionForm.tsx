import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { Icon } from './ui/Icon';

/** 0 = one-off, 1 = every month, 12 = every year. */
export type RepeatEvery = 0 | 1 | 12;

const SPREAD_OPTIONS: [number, string][] = [
  [1, 'This month only'],
  [3, '3 months'],
  [6, '6 months'],
  [12, '12 months'],
  [24, '24 months'],
];

export interface SubmitOptions {
  /** Stop this existing repeating item that the new one replaces. */
  replaceRuleId?: string;
  /** Editing a payment from a repeating item: also change the item for future payments. */
  updateFuture?: boolean;
}

export function TransactionForm({
  expenseCategories,
  incomeCategories,
  rates,
  ratesStatus,
  onRefreshRates,
  recurring,
  onAdd,
  onChooseBase,
  editing,
  initialType,
  initialRepeat,
  initialCategory,
  bare,
}: {
  expenseCategories: string[];
  incomeCategories: string[];
  rates?: RateCache;
  ratesStatus: RatesStatus;
  onRefreshRates: (() => void) | null;
  /** Existing repeating items, to offer replacing one (e.g. monthly rent -> yearly rent). */
  recurring: RecurringRule[];
  onAdd: (t: Transaction, repeatEvery: RepeatEvery, opts: SubmitOptions) => void;
  /** Sets the base currency; offered here when none has been chosen yet. */
  onChooseBase: (currency: string) => void;
  /** Edit this transaction instead of adding a new one (the form starts filled in). */
  editing?: Transaction;
  /** Start on Expense or Income (e.g. from an "Add income" button). */
  initialType?: TxType;
  /** Start with this category chosen (e.g. "Add expense" from a money box). */
  initialCategory?: string;
  /** Start set to repeat (e.g. from "Add a repeating bill"). */
  initialRepeat?: RepeatEvery;
  /** Render without the card and heading, for use inside a dialog. */
  bare?: boolean;
}) {
  const linkedRule = editing?.recurringId ? recurring.find((r) => r.id === editing.recurringId) : undefined;
  const [keepOldFor, setKeepOldFor] = useState<string | null>(null); // rule id the user chose to keep
  const { money, currency: base } = useFormat();
  const [type, setType] = useState<TxType>(editing?.type ?? initialType ?? 'expense');
  const [amount, setAmount] = useState(editing ? String(editing.original?.amount ?? editing.amount) : '');
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(editing?.original?.currency ?? null); // null = base
  const currency = chosenCurrency ?? base;
  const [rateText, setRateText] = useState<string | null>(editing?.original ? String(editing.original.rate) : null); // null = market rate
  const [category, setCategory] = useState(
    editing?.category ?? initialCategory ?? (initialType === 'income' ? (incomeCategories[0] ?? '') : 'Groceries'),
  );
  const [note, setNote] = useState(editing?.note ?? '');
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [repeat, setRepeat] = useState<RepeatEvery>(linkedRule ? (intervalOf(linkedRule) === 12 ? 12 : 1) : (initialRepeat ?? 0));
  const [spread, setSpread] = useState(editing?.spread ?? 1);
  const [updateFuture, setUpdateFuture] = useState(true);
  const [error, setError] = useState('');
  // On a short screen the message can sit out of view above the pinned button: bring it into view,
  // every time submitting fails (even with the same message).
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [failures, setFailures] = useState(0);
  const fail = (message: string) => {
    setError(message);
    setFailures((n) => n + 1);
  };
  useEffect(() => {
    if (failures) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [failures]);

  const categories = type === 'expense' ? expenseCategories : incomeCategories;
  // Fall back to the first category if the chosen one was renamed or deleted.
  const current = categories.includes(category) ? category : (categories[0] ?? '');

  const foreign = currency !== base;
  const suggested = foreign ? conversionRate(rates, currency, base) : 1;
  const shownRate = rateText ?? (foreign && suggested ? rateForInput(suggested) : '');
  const rate = foreign ? parseRate(shownRate) : 1;
  const value = parseAmount(amount);
  // Offer to replace a matching repeating item, but never the one this payment already belongs to.
  const similar =
    repeat > 0 && current && !linkedRule
      ? findSimilarRule(recurring, { type, category: current, note })
      : undefined;
  const replaceOld = !!similar && keepOldFor !== similar.id;

  const switchType = (t: TxType) => {
    setType(t);
    const list = t === 'expense' ? expenseCategories : incomeCategories;
    setCategory(t === 'expense' && list.includes('Groceries') ? 'Groceries' : (list[0] ?? ''));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!base) return fail('Choose your currency first');
    if (value == null) return fail('Enter an amount greater than 0, like 42.50');
    if (foreign && rate == null) return fail(`Enter the exchange rate from ${currency} to ${base}`);
    if (!date) return fail('Pick a date');
    if (!current) return fail('Add a category in Settings first');
    const r = rate ?? 1;
    onAdd(
      {
        id: editing?.id ?? newId(),
        type,
        amount: round2(value * r),
        category: current,
        note: note.trim(),
        date,
        ...(foreign ? { original: { amount: value, currency, rate: r } } : {}),
        ...(spread > 1 ? { spread } : {}),
      },
      repeat,
      { replaceRuleId: replaceOld ? similar?.id : undefined, updateFuture: linkedRule ? updateFuture : undefined },
    );
    if (editing) return; // the dialog closes; nothing to reset
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
    <form className={editing || bare ? 'tx-form' : 'card tx-form'} onSubmit={submit} noValidate>
      {!editing && !bare && (
        <div className="card-head">
          <h2>Add transaction</h2>
        </div>
      )}
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
            <Icon name={t === 'expense' ? 'arrow-out' : 'arrow-in'} size={17} />
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
              data-autofocus={bare || undefined}
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
      {repeat === 0 && spread === 1 && (
        <p className="form-note">
          <strong>Repeats</strong> adds it for you on the same day each month or year.{' '}
          <strong>Counts toward</strong> spreads one big payment, like yearly rent, across several months.
        </p>
      )}
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
      {editing && !linkedRule && repeat > 0 && (
        <p className="form-note">
          This entry becomes the first payment. Any {repeat === 12 ? 'yearly' : 'monthly'} payments due between then and
          today are added for you.
        </p>
      )}
      {linkedRule && repeat > 0 && (
        <label className="check replace-note">
          <input id="tx-update-future" type="checkbox" checked={updateFuture} onChange={(e) => setUpdateFuture(e.target.checked)} />
          <span>
            Also change future payments
            <small>Untick to change only this payment. Payments already recorded stay as they are either way.</small>
          </span>
        </label>
      )}
      {linkedRule && repeat === 0 && (
        <p className="form-note">
          This stops “{linkedRule.note || linkedRule.category}” repeating. Payments already recorded stay.
        </p>
      )}
      {error && <p className="error" role="alert" ref={errorRef}>{error}</p>}
      <div className="form-submit">
      <button type="submit" className="btn-primary">
        {editing
          ? 'Save changes'
          : repeat === 1
            ? `Add monthly ${type}`
            : repeat === 12
              ? `Add yearly ${type}`
              : `Add ${type}`}
      </button>
      </div>
      </fieldset>
    </form>
  );
}
