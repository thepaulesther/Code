import { useState } from 'react';
import { parseAmount, round2, shortDate, shiftMonth } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import { daysInMonth } from '../../lib/recurring';
import { categoryNameError, type BoxRepeat } from '../../lib/store';

/**
 * Create or change a money box: a name (an existing spending category or a new one) and how much it
 * can hold each month. Removing a box keeps its category and payments; only the monthly limit goes.
 */
export function BoxForm({ editing, repeat: current, today, categories, boxes, onSave, onRemove, onCancel }: {
  /** The box being changed; none to create a new one. */
  editing?: { category: string; limit: number };
  /** The bill that already repeats in this box, if any. */
  repeat?: BoxRepeat;
  today: string;
  /** Spending categories in this book. */
  categories: string[];
  /** Categories that already have a box. */
  boxes: string[];
  onSave: (name: string, amount: number, repeat: BoxRepeat | null) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const { symbol, money } = useFormat();
  const [name, setName] = useState(editing?.category ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.limit) : '');
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Categories that could become a box, offered as one-tap choices.
  const suggestions = categories.filter((c) => !boxes.includes(c)).slice(0, 8);
  const parsed = parseAmount(amount);

  // Repeating bill
  const todayDay = Number(today.slice(8, 10));
  const [repeats, setRepeats] = useState(!!current);
  const [billText, setBillText] = useState(current ? String(current.amount) : '');
  const [day, setDay] = useState(current?.day ?? todayDay);
  const [every, setEvery] = useState<1 | 12>(current?.every ?? 1);
  const bill = parseAmount(billText) ?? parsed;
  const month = today.slice(0, 7);
  const firstMonth = current || day >= todayDay ? month : shiftMonth(month, 1);
  const firstDate = `${firstMonth}-${String(Math.min(day, daysInMonth(firstMonth))).padStart(2, '0')}`;

  const save = () => {
    const n = name.trim();
    const existing = categories.find((c) => c.toLowerCase() === n.toLowerCase());
    if (!editing) {
      if (!n) return setError('Give the box a name, like Rent or Transport.');
      if (existing && boxes.includes(existing)) return setError(`There’s already a “${existing}” box. Edit it instead.`);
      if (!existing) {
        const problem = categoryNameError(categories, n);
        if (problem) return setError(problem);
      }
    }
    if (!parsed) return setError('Enter how much it can hold each month, like 80,000.');
    if (repeats && !bill) return setError('Enter how much the repeating bill is, like 150,000.');
    onSave(editing ? editing.category : (existing ?? n), round2(parsed), repeats && bill ? { amount: round2(bill), day, every } : null);
  };

  return (
    <form
      className="tx-form box-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!editing && (
        <>
          <label className="field">
            <span>Name</span>
            <input
              id="box-name"
              data-autofocus
              value={name}
              maxLength={24}
              autoComplete="off"
              placeholder="e.g. Transport"
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
            />
          </label>
          {suggestions.length > 0 && (
            <div className="chips" role="group" aria-label="Or choose a category">
              {suggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === name ? 'btn-secondary sm is-on' : 'btn-secondary sm'}
                  aria-pressed={c === name}
                  onClick={() => {
                    setName(c);
                    setError('');
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <label className="field">
        <span>Each month</span>
        <span className="money-input">
          <span aria-hidden>{symbol}</span>
          <input
            id="box-amount"
            data-autofocus={editing ? true : undefined}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError('');
            }}
            aria-invalid={!!error}
          />
        </span>
      </label>
      <p className="hint">Spending in this category counts against the box, and it starts again each month.</p>

      <fieldset className="box-repeat">
        <legend className="sr-only">Repeating bill</legend>
        <label className="check">
          <input id="box-repeats" type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
          <span>
            This is a bill that repeats
            <small>Like rent, school fees or a subscription. Elora adds the payment on its day.</small>
          </span>
        </label>
        {repeats && (
          <div className="box-repeat-fields">
            <label className="field">
              <span>Bill amount</span>
              <span className="money-input">
                <span aria-hidden>{symbol}</span>
                <input
                  id="box-bill"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={parsed ? String(parsed) : '0.00'}
                  value={billText}
                  onChange={(e) => {
                    setBillText(e.target.value);
                    setError('');
                  }}
                />
              </span>
            </label>
            <div className="box-repeat-row">
              <label className="field">
                <span>Day of the month</span>
                <select id="box-day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span id="box-every-label">How often</span>
                <div className="segmented" role="radiogroup" aria-labelledby="box-every-label">
                  {([1, 12] as const).map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={every === v} className={every === v ? 'is-on' : ''} onClick={() => setEvery(v)}>
                      {v === 1 ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="hint">
              {bill ? `${money(bill)} ${every === 12 ? 'every year' : 'every month'} on day ${day}. ` : ''}
              {current ? 'Changes apply from the next payment.' : `First payment: ${shortDate(firstDate)}.`}
            </p>
          </div>
        )}
        {current && !repeats && <p className="hint">The repeating bill will stop. Payments already made are kept.</p>}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}

      {confirmRemove ? (
        <div className="confirm-row" role="alert">
          <span>Remove the {editing?.category} box? Its payments stay; only the monthly limit goes.</span>
          <div className="head-actions">
            <button type="button" className="btn-ghost" onClick={() => setConfirmRemove(false)}>Keep it</button>
            <button type="button" className="btn-danger" onClick={onRemove}>Remove box</button>
          </div>
        </div>
      ) : (
        <div className="form-submit">
          {editing && onRemove ? (
            <button type="button" className="btn-ghost danger" onClick={() => setConfirmRemove(true)}>Remove box</button>
          ) : (
            <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          )}
          <button type="submit" className="btn-primary">
            {editing ? 'Save changes' : parsed ? `Add box · ${money(parsed)} a month` : 'Add box'}
          </button>
        </div>
      )}
    </form>
  );
}
