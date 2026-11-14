import { useState, type FormEvent } from 'react';
import { newId, parseAmount, shortDate, todayISO, type Transaction, type TxType } from '../lib/budget';
import { useFormat } from '../lib/format';
import { ordinal } from '../lib/recurring';

export function TransactionForm({ expenseCategories, incomeCategories, onAdd }: {
  expenseCategories: string[];
  incomeCategories: string[];
  onAdd: (t: Transaction, repeatMonthly: boolean) => void;
}) {
  const { symbol } = useFormat();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState('');

  const categories = type === 'expense' ? expenseCategories : incomeCategories;
  // Fall back to the first category if the chosen one was renamed or deleted.
  const current = categories.includes(category) ? category : (categories[0] ?? '');

  const switchType = (t: TxType) => {
    setType(t);
    const list = t === 'expense' ? expenseCategories : incomeCategories;
    setCategory(t === 'expense' && list.includes('Groceries') ? 'Groceries' : (list[0] ?? ''));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value == null) {
      setError('Enter an amount greater than 0, like 42.50');
      return;
    }
    if (!date) {
      setError('Pick a date');
      return;
    }
    if (!current) {
      setError('Add a category in Settings first');
      return;
    }
    onAdd({ id: newId(), type, amount: value, category: current, note: note.trim(), date }, repeat);
    setAmount('');
    setNote('');
    setRepeat(false);
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
      <label className="field">
        <span>Amount</span>
        <div className="money-input">
          <span aria-hidden>{symbol}</span>
          <input
            id="tx-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
          />
        </div>
      </label>
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
