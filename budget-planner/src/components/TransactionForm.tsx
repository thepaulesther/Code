import { useState, type FormEvent } from 'react';
import { currencySymbol, newId, parseAmount, shortDate, todayISO, type Transaction, type TxType } from '../lib/budget';
import { conversionRate, parseRate, rateForInput, round2, type RateCache, type RatesStatus } from '../lib/currency';
import { useFormat } from '../lib/format';
import { ordinal } from '../lib/recurring';
import { CurrencySelect, RateField } from './CurrencyFields';

export function TransactionForm({ expenseCategories, incomeCategories, rates, ratesStatus, onRefreshRates, onAdd }: {
  expenseCategories: string[];
  incomeCategories: string[];
  rates?: RateCache;
  ratesStatus: RatesStatus;
  onRefreshRates: (() => void) | null;
  onAdd: (t: Transaction, repeatMonthly: boolean) => void;
}) {
  const { money, currency: base } = useFormat();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null); // null = base currency
  const currency = chosenCurrency ?? base;
  const [rateText, setRateText] = useState<string | null>(null); // null = use the market rate
  const [category, setCategory] = useState('Groceries');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState('');

  const categories = type === 'expense' ? expenseCategories : incomeCategories;
  // Fall back to the first category if the chosen one was renamed or deleted.
  const current = categories.includes(category) ? category : (categories[0] ?? '');

  const foreign = currency !== base;
  const suggested = foreign ? conversionRate(rates, currency, base) : 1;
  const shownRate = rateText ?? (foreign && suggested ? rateForInput(suggested) : '');
  const rate = foreign ? parseRate(shownRate) : 1;
  const value = parseAmount(amount);

  const switchType = (t: TxType) => {
    setType(t);
    const list = t === 'expense' ? expenseCategories : incomeCategories;
    setCategory(t === 'expense' && list.includes('Groceries') ? 'Groceries' : (list[0] ?? ''));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
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
      },
      repeat,
    );
    setAmount('');
    setNote('');
    setRepeat(false);
    setRateText(null); // a rate typed for one payment shouldn't silently apply to the next
    setError('');
  };

  const day = Number(date.slice(8, 10));

  return (
    <form className="card tx-form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>Add transaction</h2>
      </div>
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
      <label className="check">
        <input id="tx-repeat" type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
        <span>
          Repeat every month
          {repeat && day > 0 && (
            <small>
              On the {ordinal(day)}, starting {shortDate(date)}
              {day > 28 && ' (or the last day of shorter months)'}
              {foreign && `. Later months convert at the latest ${currency} rate.`}
            </small>
          )}
        </span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary">
        {repeat ? `Add monthly ${type}` : `Add ${type}`}
      </button>
    </form>
  );
}
