import { useState } from 'react';
import { appLocale, formatMoney, monthLabel, shortDate, todayISO } from '../lib/budget';
import { useFormat } from '../lib/format';
import { EmptyState } from './ui/EmptyState';
import {
  intervalOf,
  nextOccurrence,
  ordinal,
  ruleBaseAmount,
  ruleMonthlyAmount,
  type RecurringRule,
} from '../lib/recurring';

const fullDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString(appLocale(), { month: 'short', day: 'numeric', year: 'numeric' });

export function RecurringPanel({ rules, rateFor, paymentCount, onToggle, onDelete }: {
  rules: RecurringRule[];
  /** Latest rate from a currency to the base currency, or null if unknown. */
  rateFor: (currency: string) => number | null;
  /** How many transactions a repeating item has added so far. */
  paymentCount: (id: string) => number;
  onToggle: (id: string) => void;
  onDelete: (id: string, deletePayments: boolean) => void;
}) {
  const { money, color } = useFormat();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deletePayments, setDeletePayments] = useState(false);
  const askStop = (id: string | null) => {
    setConfirming(id);
    setDeletePayments(false);
  };
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
        <h2>Bills and repeating</h2>
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
        <EmptyState icon="repeat" title="Nothing repeating yet" compact>
          Set “Repeats” when adding a salary, a subscription or a yearly rent, and it will be added automatically
          on its day.
        </EmptyState>
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
                <span className="dot" style={{ background: r.type === 'income' ? 'var(--income)' : color(r.category) }} aria-hidden />
                <div className="row-main">
                  <span className="row-title">
                    {r.note || r.category}
                    {r.sample && <span className="badge example">example</span>}
                  </span>
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
                    <div className="stop-confirm">
                      {paymentCount(r.id) > 0 && (
                        <label className="check inline">
                          <input
                            id={`stop-delete-${r.id}`}
                            type="checkbox"
                            checked={deletePayments}
                            onChange={(e) => setDeletePayments(e.target.checked)}
                          />
                          <span>
                            Also delete the {paymentCount(r.id)} {paymentCount(r.id) === 1 ? 'payment' : 'payments'} it added
                          </span>
                        </label>
                      )}
                      <div>
                        <button
                          type="button"
                          className="btn-ghost danger-solid"
                          onClick={() => {
                            onDelete(r.id, deletePayments);
                            askStop(null);
                          }}
                        >
                          {deletePayments ? 'Stop and delete' : 'Stop'}
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => askStop(null)}>Keep</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="btn-ghost" onClick={() => onToggle(r.id)}>
                        {r.paused ? 'Resume' : 'Pause'}
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => askStop(r.id)} aria-label={`Stop repeating ${r.note || r.category}`}>
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
      {confirming && !deletePayments && <p className="hint">Stopping keeps the payments already added unless you tick the box.</p>}
    </section>
  );
}
