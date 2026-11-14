import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatMoney, shortDate, type Entry } from '../lib/budget';
import { formatRate } from '../lib/currency';
import { useFormat } from '../lib/format';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';

type Filter = 'all' | 'income' | 'expense';

const fullDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function TransactionList({ transactions, onDelete, onEdit, recent, title = 'Transactions', action, emptyAction }: {
  /** This month's entries, including shares of spread payments. */
  transactions: Entry[];
  onDelete: (id: string) => void;
  /** Open the edit form for the payment (for a spread share, the original payment). */
  onEdit: (id: string) => void;
  /** Show only the latest few, without search and filters (the Overview's "Recent activity"). */
  recent?: number;
  title?: string;
  /** Shown in the card header, e.g. a "See all" link. */
  action?: ReactNode;
  /** Shown in the empty state, e.g. an "Add transaction" button. */
  emptyAction?: ReactNode;
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
  const shown = recent ? rows.slice(0, recent) : rows;

  return (
    <section className="card tx-list">
      <div className="card-head">
        <h2>
          {title}
          {!recent && transactions.length > 0 && (
            <span className="card-sub">{rows.length} {rows.length === 1 ? 'entry' : 'entries'} this month</span>
          )}
        </h2>
        {action}
      </div>
      {!recent && transactions.length > 0 && (
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
            <button key={f} type="button" className={filter === f ? 'chip is-on' : 'chip'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      )}
      {transactions.length === 0 ? (
        <EmptyState icon="transactions" title="No transactions this month" action={emptyAction}>
          Add your income and spending, or import a CSV from your bank, and they’ll appear here.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon="transactions" title="Nothing matches" compact>
          Try another search, or switch the filter back to All.
        </EmptyState>
      ) : (
        <ul className={recent ? 'rows compact' : 'rows'}>
          {shown.map((t) => (
            <li key={t.id}>
              <span
                className="tx-avatar"
                style={{ '--cat': t.type === 'income' ? 'var(--income)' : color(t.category) } as CSSProperties}
                aria-hidden
              >
                {t.type === 'income' ? <Icon name="arrow-in" size={18} /> : (t.category[0] ?? '?').toUpperCase()}
              </span>
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
                  <Icon name="edit" size={17} />
                </button>
                {t.share && t.share.index > 1 ? (
                  // Later shares of an earlier payment: delete it from the month it was paid.
                  <span className="icon-spacer" aria-hidden />
                ) : (
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => onDelete(t.id)}
                    aria-label={`Delete ${t.note || t.category}${t.share ? ` (all ${t.share.of} months)` : ''}`}
                    title={t.share ? `Delete the whole payment (all ${t.share.of} months)` : 'Delete'}
                  >
                    <Icon name="trash" size={17} />
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
