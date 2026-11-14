import { useMemo, useState } from 'react';
import { formatMoney, shortDate, type Entry } from '../lib/budget';
import { formatRate } from '../lib/currency';
import { useFormat } from '../lib/format';

type Filter = 'all' | 'income' | 'expense';

const fullDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function TransactionList({ transactions, onDelete, onEdit }: {
  /** This month's entries, including shares of spread payments. */
  transactions: Entry[];
  onDelete: (id: string) => void;
  /** Open the edit form for the payment (for a spread share, the original payment). */
  onEdit: (id: string) => void;
}) {
  const { money, color } = useFormat();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((t) => filter === 'all' || t.type === filter)
      .filter((t) => !q || t.note.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filter, query]);

  return (
    <section className="card tx-list">
      <div className="card-head">
        <h2>Transactions</h2>
        <span className="muted">{rows.length}</span>
      </div>
      <div className="list-tools">
        <input
          id="tx-search"
          type="search"
          placeholder="Search notes or categories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search transactions"
        />
        <div className="chips">
          {(['all', 'expense', 'income'] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? 'chip is-on' : 'chip'} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="empty">
          {transactions.length ? 'No transactions match.' : 'Nothing here yet. Add a transaction or import a CSV to get started.'}
        </p>
      ) : (
        <ul className="rows">
          {rows.map((t) => (
            <li key={t.id}>
              <span className="dot" style={{ background: t.type === 'income' ? 'var(--income)' : color(t.category) }} />
              <div className="row-main">
                <span className="row-title">
                  {t.note || t.category}
                  {t.sample && <span className="badge example" title="Example data. Remove it with “Remove examples”">example</span>}
                  {t.recurringId && <span className="badge" title="Added by a repeating item">↻ repeats</span>}
                  {t.share && (
                    <span className="badge share" title={`This month’s share of a payment spread over ${t.share.of} months`}>
                      {t.share.index} of {t.share.of}
                    </span>
                  )}
                </span>
                <span className="row-sub">
                  {t.category} · {t.share && t.share.index > 1 ? `paid ${fullDate(t.date)}` : shortDate(t.date)}
                </span>
              </div>
              <div className="row-amts">
                <span className={`num row-amt ${t.type}`}>
                  {t.type === 'income' ? '+' : '−'}
                  {money(t.amount)}
                </span>
                {t.share && <span className="row-orig num">of {money(t.share.total)}</span>}
                {t.original && (
                  <span className="row-orig num" title={`Converted at 1 ${t.original.currency} = ${formatRate(t.original.rate)}`}>
                    {formatMoney(t.original.amount, t.original.currency)} @ {formatRate(t.original.rate)}
                  </span>
                )}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="icon-btn edit"
                  onClick={() => onEdit(t.id)}
                  aria-label={`Edit ${t.note || t.category}`}
                  title={t.share && t.share.index > 1 ? 'Edit the payment this share comes from' : 'Edit'}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                    <path d="M11.3 2.3a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4L5.6 12.8 2.5 13.5l.7-3.1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </button>
                {t.share && t.share.index > 1 ? (
                  // Later shares of an earlier payment: delete it from the month it was paid.
                  <span className="icon-spacer" aria-hidden />
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onDelete(t.id)}
                    aria-label={`Delete ${t.note || t.category}${t.share ? ` (all ${t.share.of} months)` : ''}`}
                    title={t.share ? `Delete the whole payment (all ${t.share.of} months)` : 'Delete'}
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
