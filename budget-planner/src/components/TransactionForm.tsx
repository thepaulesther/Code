import { useState, type FormEvent } from 'react';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  newId,
  parseAmount,
  todayISO,
  type Transaction,
  type TxType,
} from '../lib/budget';

export function TransactionForm({ onAdd }: { onAdd: (t: Transaction) => void }) {
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[1]);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');

  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const switchType = (t: TxType) => {
    setType(t);
    setCategory(t === 'expense' ? EXPENSE_CATEGORIES[1] : INCOME_CATEGORIES[0]);
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
    onAdd({ id: newId(), type, amount: value, category, note: note.trim(), date });
    setAmount('');
    setNote('');
    setError('');
  };

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
          <span aria-hidden>$</span>
          <input
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
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Note <em>(optional)</em></span>
        <input placeholder="e.g. Farmers market" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary">
        Add {type}
      </button>
    </form>
  );
}
