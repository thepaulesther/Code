import { useState } from 'react';
import { bookName, type Book } from '../../lib/books';
import { parseAmount, round2, todayISO } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import { Icon } from '../ui/Icon';

/**
 * Move money between your own books: "Pay yourself" (Business → Personal) or putting money into the
 * business (Personal → Business). A transfer is never income or spending, so profit stays the same.
 */
export function PayYourself({ balances, onSave, onCancel }: {
  /** Each book's money this month (income − spending ± transfers). */
  balances: Record<Book, number>;
  onSave: (t: { from: Book; to: Book; amount: number; date: string; note: string }) => void;
  onCancel: () => void;
}) {
  const { money, symbol } = useFormat();
  const [from, setFrom] = useState<Book>('business');
  const to: Book = from === 'business' ? 'personal' : 'business';
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const amount = parseAmount(text);
  const quick = [50_000, 100_000, 200_000];

  const save = () => {
    if (!amount) return setError('Enter an amount greater than 0, like 50,000.');
    onSave({ from, to, amount: round2(amount), date: todayISO(), note: from === 'business' ? 'Pay yourself' : 'Money into the business' });
  };

  return (
    <form
      className="tx-form pay-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="segmented" role="radiogroup" aria-label="Direction">
        {(['business', 'personal'] as const).map((b) => (
          <button key={b} type="button" role="radio" aria-checked={from === b} className={from === b ? 'is-on' : ''} onClick={() => setFrom(b)}>
            {b === 'business' ? 'Pay yourself' : 'Put money in'}
          </button>
        ))}
      </div>

      <div className="pay-route" aria-label={`From ${bookName(from)} to ${bookName(to)}`}>
        <div>
          <span className="muted small">From {bookName(from)}</span>
          <strong className="num">{money(round2(balances[from] - (amount ?? 0)))}</strong>
        </div>
        <Icon name="chevron-right" size={20} />
        <div>
          <span className="muted small">To {bookName(to)}</span>
          <strong className="num">{money(round2(balances[to] + (amount ?? 0)))}</strong>
        </div>
      </div>

      <label className="field">
        <span>Amount</span>
        <span className="money-input">
          <span aria-hidden>{symbol}</span>
          <input
            id="pay-amount"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'pay-error' : undefined}
          />
        </span>
      </label>
      <div className="chips" role="group" aria-label="Quick amounts">
        {quick.map((v) => (
          <button key={v} type="button" className="btn-secondary sm" onClick={() => setText(String(v))}>{money(v)}</button>
        ))}
      </div>
      {error && <p id="pay-error" className="error" role="alert">{error}</p>}

      <p className="hint pay-note">
        <Icon name="alert" size={16} />
        <span>
          This is a transfer between your own money. It isn’t a business expense, so your profit stays the same, and it
          isn’t counted as spending on either side.
        </span>
      </p>

      <div className="form-submit">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">
          {amount ? `${from === 'business' ? 'Pay yourself' : 'Move'} ${money(amount)}` : from === 'business' ? 'Pay yourself' : 'Move money'}
        </button>
      </div>
    </form>
  );
}
