import { useState } from 'react';
import { formatMoney, monthLabel, shortDate, todayISO } from '../lib/budget';
import { useFormat } from '../lib/format';
import {
  intervalOf,
  nextOccurrence,
  ordinal,
  ruleBaseAmount,
  ruleMonthlyAmount,
  type RecurringRule,
} from '../lib/recurring';

const fullDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

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
  // Per-month equivalent, so yearly rent counts as 1/12 here too.
  const sum = (type: 'income' | 'expense') =>
    active.filter((r) => r.type === type).reduce((s, r) => s + ruleMonthlyAmount(r, rateFor), 0);
  const sorted = [...rules].sort((a, b) => Number(!!a.paused) - Number(!!b.paused) || a.day - b.day);
  const anyForeign = active.some((r) => r.currency);

  return (
    <section className="card recurring">
      <div className="card-head">
        <h2>Repeating</h2>
        {rules.length > 0 && (
          <span className="muted num small" title={anyForeign ? 'Foreign-currency items at the latest rate' : undefined}>
            {sum('income') > 0 && <span className="income-text">+{money(sum('income'), { compact: true })}</span>}
            {sum('income') > 0 && sum('expense') > 0 && ' · '}
            {sum('expense') > 0 && `−${money(sum('expense'), { compact: true })}`}
            {(sum('income') > 0 || sum('expense') > 0) && ' / mo'}
          </span>
        )}
      </div>
      {rules.length === 0 ? (
        <p className="empty">
          Set “Repeats” when adding a salary, a subscription or a yearly rent, and it will be added automatically
          on its day.
        </p>
      ) : (
        <ul className="rec-rows">
          {sorted.map((r) => {
            const next = nextOccurrence(r, today);
            const sign = r.type === 'income' ? '+' : '−';
            const yearly = intervalOf(r) === 12;
            const schedule = yearly
              ? `Yearly on ${monthLabel(r.startMonth, 'short')} ${r.day}`
              : `Monthly on the ${ordinal(r.day)}`;
            const nextLabel = next ? (next.slice(0, 4) === today.slice(0, 4) ? shortDate(next) : fullDate(next)) : '';
            const showMonthly = yearly || (r.spreadMonths ?? 1) > 1;
            return (
              <li key={r.id} className={r.paused ? 'is-paused' : ''}>
                <span className="dot" style={{ background: r.type === 'income' ? 'var(--income)' : color(r.category) }} />
                <div className="row-main">
                  <span className="row-title">{r.note || r.category}</span>
                  <span className="row-sub">
                    {r.paused ? 'Paused' : `${schedule}${nextLabel ? ` · next ${nextLabel}` : ''}`}
                  </span>
                </div>
                <div className="row-amts">
                  <span className={`num row-amt ${r.type}`}>
                    {sign}
                    {r.currency ? formatMoney(r.amount, r.currency) : money(r.amount)}
                  </span>
                  {r.currency && !showMonthly && <span className="row-orig num">≈ {money(ruleBaseAmount(r, rateFor))}</span>}
                  {showMonthly && <span className="row-orig num">≈ {money(ruleMonthlyAmount(r, rateFor))} / mo</span>}
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
