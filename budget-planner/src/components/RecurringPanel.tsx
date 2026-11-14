import { useState } from 'react';
import { shortDate, todayISO } from '../lib/budget';
import { useFormat } from '../lib/format';
import { nextOccurrence, ordinal, type RecurringRule } from '../lib/recurring';

export function RecurringPanel({ rules, onToggle, onDelete }: {
  rules: RecurringRule[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { money, color } = useFormat();
  const [confirming, setConfirming] = useState<string | null>(null);
  const today = todayISO();

  const active = rules.filter((r) => !r.paused);
  const monthlyIn = active.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const monthlyOut = active.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const sorted = [...rules].sort((a, b) => Number(!!a.paused) - Number(!!b.paused) || a.day - b.day);

  return (
    <section className="card recurring">
      <div className="card-head">
        <h2>Repeating</h2>
        {rules.length > 0 && (
          <span className="muted num small">
            <span className="income-text">+{money(monthlyIn)}</span> · −{money(monthlyOut)} / mo
          </span>
        )}
      </div>
      {rules.length === 0 ? (
        <p className="empty">
          Tick “Repeat every month” when adding rent, salary or a subscription, and it will be added automatically
          on its day.
        </p>
      ) : (
        <ul className="rec-rows">
          {sorted.map((r) => {
            const next = nextOccurrence(r, today);
            return (
              <li key={r.id} className={r.paused ? 'is-paused' : ''}>
                <span className="dot" style={{ background: r.type === 'income' ? 'var(--income)' : color(r.category) }} />
                <div className="row-main">
                  <span className="row-title">{r.note || r.category}</span>
                  <span className="row-sub">
                    {r.paused ? 'Paused' : `Monthly on the ${ordinal(r.day)}${next ? ` · next ${shortDate(next)}` : ''}`}
                  </span>
                </div>
                <span className={`num row-amt ${r.type}`}>
                  {r.type === 'income' ? '+' : '−'}
                  {money(r.amount)}
                </span>
                <div className="rec-actions">
                  {confirming === r.id ? (
                    <>
                      <button type="button" className="btn-ghost danger-solid" onClick={() => { onDelete(r.id); setConfirming(null); }}>
                        Stop
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setConfirming(null)}>Keep</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-ghost" onClick={() => onToggle(r.id)}>
                        {r.paused ? 'Resume' : 'Pause'}
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setConfirming(r.id)} aria-label={`Stop repeating ${r.note || r.category}`}>
                        Stop
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {confirming && <p className="hint">Stopping keeps the transactions already added.</p>}
    </section>
  );
}
