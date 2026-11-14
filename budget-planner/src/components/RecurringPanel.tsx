import { useState } from 'react';
import { formatMoney, shortDate, todayISO } from '../lib/budget';
import { useFormat } from '../lib/format';
import { nextOccurrence, ordinal, ruleBaseAmount, type RecurringRule } from '../lib/recurring';

export function RecurringPanel({ rules, rateFor, onToggle, onDelete }: {
  rules: RecurringRule[];
  /** Latest rate from a currency to the base currency, or null if unknown. */
  rateFor: (currency: string) => number | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { money, color } = useFormat();
  const [confirming, setConfirming] = useState<string | null>(null);
  const today = todayISO();

  const active = rules.filter((r) => !r.paused);
  const sum = (type: 'income' | 'expense') =>
    active.filter((r) => r.type === type).reduce((s, r) => s + ruleBaseAmount(r, rateFor), 0);
  const sorted = [...rules].sort((a, b) => Number(!!a.paused) - Number(!!b.paused) || a.day - b.day);
  const anyForeign = active.some((r) => r.currency);

  return (
    <section className="card recurring">
      <div className="card-head">
        <h2>Repeating</h2>
        {rules.length > 0 && (
          <span className="muted num small" title={anyForeign ? 'Foreign-currency items at the latest rate' : undefined}>
            <span className="income-text">+{money(sum('income'), { compact: true })}</span> · −{money(sum('expense'), { compact: true })} / mo
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
            const sign = r.type === 'income' ? '+' : '−';
            return (
              <li key={r.id} className={r.paused ? 'is-paused' : ''}>
                <span className="dot" style={{ background: r.type === 'income' ? 'var(--income)' : color(r.category) }} />
                <div className="row-main">
                  <span className="row-title">{r.note || r.category}</span>
                  <span className="row-sub">
                    {r.paused ? 'Paused' : `Monthly on the ${ordinal(r.day)}${next ? ` · next ${shortDate(next)}` : ''}`}
                  </span>
                </div>
                <div className="row-amts">
                  <span className={`num row-amt ${r.type}`}>
                    {sign}
                    {r.currency ? formatMoney(r.amount, r.currency) : money(r.amount)}
                  </span>
                  {r.currency && <span className="row-orig num">≈ {money(ruleBaseAmount(r, rateFor))}</span>}
                </div>
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
