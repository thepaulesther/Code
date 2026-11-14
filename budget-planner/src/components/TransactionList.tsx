import { useMemo, useState } from 'react';
import { formatMoney, shortDate, type Transaction } from '../lib/budget';
import { formatRate } from '../lib/currency';
import { useFormat } from '../lib/format';

type Filter = 'all' | 'income' | 'expense';

export function TransactionList({ transactions, onDelete }: {
  transactions: Transaction[];
  onDelete: (id: string) => void;
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
                  {t.recurringId && <span className="badge" title="Repeats monthly">↻ monthly</span>}
                </span>
                <span className="row-sub">{t.category} · {shortDate(t.date)}</span>
              </div>
              <div className="row-amts">
                <span className={`num row-amt ${t.type}`}>
                  {t.type === 'income' ? '+' : '−'}
                  {money(t.amount)}
                </span>
                {t.original && (
                  <span className="row-orig num" title={`Converted at 1 ${t.original.currency} = ${formatRate(t.original.rate)}`}>
                    {formatMoney(t.original.amount, t.original.currency)} @ {formatRate(t.original.rate)}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onDelete(t.id)}
                aria-label={`Delete ${t.note || t.category}`}
                title="Delete"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
