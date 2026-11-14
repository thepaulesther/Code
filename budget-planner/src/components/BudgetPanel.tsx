import { useState } from 'react';
import { EXPENSE_CATEGORIES, formatMoney, parseAmount, type BudgetStatus, type Budgets } from '../lib/budget';

export function BudgetPanel({ status, budgets, onChange }: {
  status: BudgetStatus[];
  budgets: Budgets;
  onChange: (b: Budgets) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const startEdit = () => {
    setDraft(Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, budgets[c] ? String(budgets[c]) : ''])));
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

  return (
    <section className="card budgets">
      <div className="card-head">
        <h2>Monthly budgets</h2>
        {editing ? (
          <div className="head-actions">
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn-primary sm" onClick={save}>Save</button>
          </div>
        ) : (
          <button type="button" className="btn-ghost" onClick={startEdit}>Edit</button>
        )}
      </div>

      {editing ? (
        <div className="budget-edit">
          {EXPENSE_CATEGORIES.map((c) => (
            <label key={c} className="budget-edit-row">
              <span>{c}</span>
              <div className="money-input sm">
                <span aria-hidden>$</span>
                <input
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
        <p className="empty">Set a monthly limit for each category to track how much you've spent against it.</p>
      ) : (
        <ul className="budget-rows">
          {status.map((b) => (
            <li key={b.category} className={`state-${b.state}`}>
              <div className="budget-line">
                <span className="budget-name">{b.category}</span>
                <span className="num budget-nums">
                  {formatMoney(b.spent)} <span className="muted">/ {formatMoney(b.limit)}</span>
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
                {b.state === 'over'
                  ? `${formatMoney(-b.remaining)} over`
                  : `${formatMoney(b.remaining)} left`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
