import { useState } from 'react';
import { bookName, type Book, type RepeatingTransfer } from '../../lib/books';
import { parseAmount, round2, todayISO } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import { Icon } from '../ui/Icon';

/**
 * Move money between your own books: "Pay yourself" (Business → Personal) or putting money into the
 * business (Personal → Business). A transfer is never income or spending, so profit stays the same.
 */
export interface PayRepeat {
  day: number;
  onlyIfSafe: boolean;
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
};

export function PayYourself({ balances, repeating, onSave, onStop, onCancel }: {
  /** Each book's money this month (income − spending ± transfers). */
  balances: Record<Book, number>;
  /** Transfers already set to repeat. */
  repeating: RepeatingTransfer[];
  onSave: (t: { from: Book; to: Book; amount: number; date: string; note: string }, repeat: PayRepeat | null) => void;
  onStop: (id: string) => void;
  onCancel: () => void;
}) {
  const { money, symbol } = useFormat();
  const [from, setFrom] = useState<Book>('business');
  const to: Book = from === 'business' ? 'personal' : 'business';
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const amount = parseAmount(text);
  const quick = [50_000, 100_000, 200_000];
  const today = todayISO();
  const [repeat, setRepeat] = useState(false);
  const [day, setDay] = useState(Number(today.slice(8, 10)));
  const [onlyIfSafe, setOnlyIfSafe] = useState(true);
  const startsToday = day === Number(today.slice(8, 10));

  const save = () => {
    if (!amount) return setError('Enter an amount greater than 0, like 50,000.');
    onSave(
      { from, to, amount: round2(amount), date: today, note: from === 'business' ? 'Pay yourself' : 'Money into the business' },
      repeat ? { day, onlyIfSafe } : null,
    );
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

      <label className="check">
        <input type="checkbox" id="pay-repeat" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
        <span>Repeat every month</span>
      </label>
      {repeat && (
        <div className="tx-form pay-repeat">
          <label className="field">
            <span>On day</span>
            <select id="pay-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{ordinal(d)}{d > 28 ? ' (or the month’s last day)' : ''}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" id="pay-safe" checked={onlyIfSafe} onChange={(e) => setOnlyIfSafe(e.target.checked)} />
            <span>Only if {bookName(from)} has enough that month (otherwise skip it)</span>
          </label>
          {onlyIfSafe && startsToday && amount != null && balances[from] < amount && (
            <p className="hint" role="status">
              {bookName(from)} has {money(balances[from])} this month, so this month’s one will be skipped.
            </p>
          )}
          <p className="hint">
            {startsToday ? 'The first one happens today' : `The first one happens on the ${ordinal(day)}`}, then every month on the{' '}
            {ordinal(day)}. Nothing is back-dated, and you can stop it any time here.
          </p>
        </div>
      )}

      <p className="hint pay-note">
        <Icon name="alert" size={16} />
        <span>
          This is a transfer between your own money. It isn’t a business expense, so your profit stays the same, and it
          isn’t counted as spending on either side.
        </span>
      </p>

      {repeating.length > 0 && (
        <section className="pay-repeating" aria-labelledby="pay-repeating-title">
          <h3 id="pay-repeating-title" className="small">Repeating every month</h3>
          <ul>
            {repeating.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.from === 'business' ? 'Pay yourself' : 'Into the business'} {money(r.amount)}</strong>
                  <small className="muted">
                    {' '}on the {ordinal(r.day)}{r.onlyIfSafe ? ', only if there’s enough' : ''}
                    {r.skipped?.length ? ` · skipped ${r.skipped.length} ${r.skipped.length === 1 ? 'month' : 'months'}` : ''}
                  </small>
                </span>
                <button type="button" className="btn-ghost sm" onClick={() => onStop(r.id)} aria-label={`Stop repeating ${money(r.amount)} on the ${ordinal(r.day)}`}>
                  Stop
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="form-submit">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">
          {repeat
            ? amount ? `Repeat ${money(amount)} monthly` : 'Set up repeat'
            : amount ? `${from === 'business' ? 'Pay yourself' : 'Move'} ${money(amount)}` : from === 'business' ? 'Pay yourself' : 'Move money'}
        </button>
      </div>
    </form>
  );
}
