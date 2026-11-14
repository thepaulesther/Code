import { useState, type ReactNode } from 'react';
import { parseAmount, type BudgetStatus, type Budgets } from '../lib/budget';
import { useFormat } from '../lib/format';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';

export function BudgetPanel({ status, budgets, categories, onChange, summary, action, onSetUp }: {
  status: BudgetStatus[];
  budgets: Budgets;
  categories: string[];
  onChange: (b: Budgets) => void;
  /** Read-only glance (Overview): the four most-used budgets. */
  summary?: boolean;
  /** Shown in the header in summary mode, e.g. a "See all" link. */
  action?: ReactNode;
  /** Summary mode's empty-state button (go to the Budgets page). */
  onSetUp?: () => void;
}) {
  const { money, symbol } = useFormat();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const startEdit = () => {
    setDraft(Object.fromEntries(categories.map((c) => [c, budgets[c] ? String(budgets[c]) : ''])));
    setEditing(true);
  };

  const save = () => {
    const next: Budgets = {};
    for (const [c, v] of Object.entries(draft)) {
      const n = parseAmount(v);
      if (n != null) next[c] = n;
    }
    onChange(next);
    setEditing(false);
  };
  const shown = summary ? [...status].sort((a, b) => b.ratio - a.ratio).slice(0, 4) : status;

  return (
    <section className="card budgets">
      <div className="card-head">
        <h2>
          {summary ? 'Budgets this month' : 'Monthly budgets'}
          {summary && status.length > 4 && <span className="card-sub">Showing the 4 most used of {status.length}</span>}
        </h2>
        {summary ? action : editing ? (
          <div className="head-actions">
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary sm" onClick={save}>Save</button>
          </div>
        ) : (
          status.length > 0 && (
            <button type="button" className="btn-secondary sm" onClick={startEdit}>
              <Icon name="edit" size={16} /> Edit limits
            </button>
          )
        )}
      </div>

      {editing ? (
        <div className="budget-edit">
          {categories.map((c) => (
            <label key={c} className="budget-edit-row">
              <span>{c}</span>
              <div className="money-input sm">
                <span aria-hidden>{symbol}</span>
                <input
                  id={`budget-${c}`}
                  inputMode="decimal"
                  placeholder="No limit"
                  value={draft[c] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
                />
              </div>
            </label>
          ))}
        </div>
      ) : status.length === 0 ? (
        <EmptyState
          icon="budgets"
          title="No budgets yet"
          compact={summary}
          action={
            <button type="button" className={summary ? 'btn-secondary sm' : 'btn-primary'} onClick={summary ? onSetUp : startEdit}>
              Set budgets
            </button>
          }
        >
          Set a monthly limit for each category to see how much you’ve spent against it.
        </EmptyState>
      ) : (
        <ul className="budget-rows">
          {shown.map((b) => (
            <li key={b.category} className={`state-${b.state}`}>
              <div className="budget-line">
                <span className="budget-name">{b.category}</span>
                <span className="num budget-nums">
                  {money(b.spent)} <span className="muted">/ {money(b.limit)}</span>
                </span>
              </div>
              <div
                className="meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={b.limit}
                aria-valuenow={b.spent}
                aria-label={`${b.category} budget`}
              >
                <div className="meter-fill" style={{ width: `${Math.min(b.ratio, 1) * 100}%` }} />
              </div>
              <span className="budget-note">
                {b.state === 'over' ? `${money(-b.remaining)} over` : `${money(b.remaining)} left`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
