import { useMemo, useState } from 'react';
import { METHOD_LABEL, parseAlerts, type PayMethod } from '../../lib/alerts';
import type { Book } from '../../lib/books';
import { newId, parseAmount, round2, shortDate, todayISO, type Transaction } from '../../lib/budget';
import { useFormat } from '../../lib/format';

/**
 * Recording sales quickly:
 * - "Enter": the amount and how it was paid. The book, the Sales category and today are already chosen,
 *   and the payment method used last time is remembered on this device.
 * - "Paste alert": paste one or more bank or POS alerts; Elora reads them on the device, shows what it
 *   found, and adds the ones you keep. Ones that look already recorded start unticked.
 */

const METHOD_KEY = 'elora.saleMethod';
const METHODS: PayMethod[] = ['cash', 'transfer', 'pos'];

function readMethod(): PayMethod {
  try {
    const v = localStorage.getItem(METHOD_KEY);
    return v === 'cash' || v === 'transfer' || v === 'pos' ? v : 'cash';
  } catch {
    return 'cash';
  }
}

export function QuickSale({ book, tab: initialTab, incomeCategories, expenseCategories, existing, onSave, onFullForm, onCancel }: {
  book: Book;
  tab: 'enter' | 'paste';
  incomeCategories: string[];
  expenseCategories: string[];
  /** Transactions already in this book, to spot alerts already recorded. */
  existing: Transaction[];
  onSave: (txs: Transaction[]) => void;
  /** Open the full add form instead (other categories, repeating, other currency). */
  onFullForm: () => void;
  onCancel: () => void;
}) {
  const { money, symbol } = useFormat();
  const [tab, setTab] = useState(initialTab);
  const today = todayISO();
  const biz = book === 'business';
  const incomeCategory =
    incomeCategories.find((c) => /^sales$/i.test(c)) ??
    (biz ? incomeCategories[0] : incomeCategories.find((c) => /other/i.test(c)) ?? incomeCategories[0]) ??
    'Other income';
  const expenseCategory = expenseCategories.find((c) => /^other$/i.test(c)) ?? expenseCategories[expenseCategories.length - 1] ?? 'Other';

  // ---- Enter ----
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>(readMethod);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const parsedAmount = parseAmount(amount);
  const saveSale = () => {
    if (!parsedAmount) return setError('Enter the amount of the sale, like 4,500.');
    try {
      localStorage.setItem(METHOD_KEY, method);
    } catch {
      /* not remembered, that's all */
    }
    onSave([{ id: newId(), type: 'income', amount: round2(parsedAmount), category: incomeCategory, note: note.trim() || 'Sale', date: today, method }]);
  };

  // ---- Paste alert ----
  const [text, setText] = useState('');
  const { alerts, skipped } = useMemo(() => parseAlerts(text), [text]);
  const isDuplicate = (a: (typeof alerts)[number]) =>
    existing.some((t) => t.type === a.type && Math.abs(t.amount - a.amount) < 0.005 && t.date === (a.date ?? today));
  const [unticked, setUnticked] = useState<Record<number, boolean>>({});
  const keep = alerts.map((a, i) => (i in unticked ? !unticked[i] : !isDuplicate(a)));
  const toAdd = alerts.filter((_, i) => keep[i]);
  const saveAlerts = () => {
    onSave(
      toAdd.map((a) => {
        const t: Transaction = {
          id: newId(),
          type: a.type,
          amount: a.amount,
          category: a.type === 'income' ? incomeCategory : expenseCategory,
          note: a.note,
          date: a.date ?? today,
        };
        if (a.method) t.method = a.method;
        return t;
      }),
    );
  };

  return (
    <div className="tx-form quick-sale">
      <div className="segmented" role="tablist" aria-label="How to record">
        <button type="button" role="tab" id="qs-tab-enter" aria-selected={tab === 'enter'} aria-controls="qs-panel" className={tab === 'enter' ? 'is-on' : ''} onClick={() => setTab('enter')}>
          {biz ? 'Enter a sale' : 'Enter money in'}
        </button>
        <button type="button" role="tab" id="qs-tab-paste" aria-selected={tab === 'paste'} aria-controls="qs-panel" className={tab === 'paste' ? 'is-on' : ''} onClick={() => setTab('paste')}>
          Paste bank alert
        </button>
      </div>

      <div id="qs-panel" role="tabpanel" aria-labelledby={tab === 'enter' ? 'qs-tab-enter' : 'qs-tab-paste'} className="tx-form">
        {tab === 'enter' ? (
          <form
            className="tx-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveSale();
            }}
          >
            <label className="field">
              <span>Amount</span>
              <span className="money-input">
                <span aria-hidden>{symbol}</span>
                <input
                  id="sale-amount"
                  data-autofocus
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
            <div className="field">
              <span id="sale-method-label">Paid by</span>
              <div className="segmented three" role="radiogroup" aria-labelledby="sale-method-label">
                {METHODS.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={method === m} className={method === m ? 'is-on' : ''} onClick={() => setMethod(m)}>
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>What was sold <em>(optional)</em></span>
              <input id="sale-note" value={note} maxLength={60} placeholder="e.g. 3 bags of rice" onChange={(e) => setNote(e.target.value)} />
            </label>
            <p className="hint">
              Saved to {biz ? 'Business' : 'Personal'} as {incomeCategory}, dated today.{' '}
              <button type="button" className="link-btn" onClick={onFullForm}>Use the full form</button> for another date, category or currency.
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="form-submit">
              <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
              <button type="submit" className="btn-primary">
                {parsedAmount ? `Record ${money(parsedAmount)}` : biz ? 'Record sale' : 'Record'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <label className="field">
              <span>Paste one or more alerts from your bank or POS</span>
              <textarea
                id="alert-text"
                data-autofocus
                className="csv-box"
                rows={5}
                value={text}
                placeholder="e.g. Credit Alert! Amt: NGN45,000.00 Desc: TRF FROM CHIDI O… Date: 17-11-2026"
                onChange={(e) => {
                  setText(e.target.value);
                  setUnticked({});
                }}
              />
            </label>
            <p className="hint">Read on this device only. Nothing is sent anywhere.</p>
            {text.trim() && !alerts.length && (
              <p className="error" role="alert">Elora couldn’t find an amount and whether money came in or went out. Check you copied the whole alert.</p>
            )}
            {alerts.length > 0 && (
              <ul className="alert-results" aria-label="What Elora found">
                {alerts.map((a, i) => {
                  const dup = isDuplicate(a);
                  return (
                    <li key={i}>
                      <label className="check">
                        <input type="checkbox" checked={keep[i]} onChange={(e) => setUnticked((u) => ({ ...u, [i]: !e.target.checked }))} />
                        <span>
                          <span className="alert-line">
                            <strong>{a.note}</strong>
                            <strong className={a.type === 'income' ? 'num in' : 'num'}>
                              {a.type === 'income' ? '+' : '−'}
                              {money(a.amount)}
                            </strong>
                          </span>
                          <small>
                            {a.type === 'income' ? `Money in · ${incomeCategory}` : `Money out · ${expenseCategory}`}
                            {' · '}
                            {shortDate(a.date ?? today)}
                            {a.date ? '' : ' (today)'}
                            {a.method ? ` · ${METHOD_LABEL[a.method]}` : ''}
                            {dup ? ' · looks already recorded' : ''}
                          </small>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {skipped > 0 && alerts.length > 0 && (
              <p className="hint">
                {skipped} {skipped === 1 ? 'piece of text wasn’t an alert' : 'pieces of text weren’t alerts'} Elora could read, so{' '}
                {skipped === 1 ? 'it was' : 'they were'} left out.
              </p>
            )}
            <div className="form-submit">
              <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn-primary" disabled={!toAdd.length} onClick={saveAlerts}>
                {toAdd.length ? `Add ${toAdd.length} to ${biz ? 'Business' : 'Personal'}` : 'Add'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
