import { useState } from 'react';
import { monthLabel, parseAmount } from '../lib/budget';
import { useFormat } from '../lib/format';
import type { Plan } from '../lib/plan';

const pctText = (p: number) => `${Math.round(p * 100)}%`;

export function PlanCard({ plan, month, isCurrentMonth, expectedIncome, onSetIncome, onAddGoal, hasGoals }: {
  plan: Plan;
  month: string;
  isCurrentMonth: boolean;
  /** The expected income the user typed, if any. */
  expectedIncome?: number;
  onSetIncome: (amount: number | undefined) => void;
  onAddGoal: () => void;
  hasGoals: boolean;
}) {
  const { money, symbol } = useFormat();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const openEditor = () => {
    setDraft(expectedIncome ? String(expectedIncome) : '');
    setError('');
    setEditing(true);
  };
  const saveIncome = () => {
    if (!draft.trim()) {
      onSetIncome(undefined);
      return setEditing(false);
    }
    const n = parseAmount(draft);
    if (n == null) return setError('Enter an amount, like 700000');
    onSetIncome(n);
    setEditing(false);
  };

  const incomeEditor = (
    <form className="income-editor" onSubmit={(e) => { e.preventDefault(); saveIncome(); }}>
      <label htmlFor="plan-income">Expected monthly income</label>
      <div className="income-editor-row">
        <div className="money-input">
          <span aria-hidden>{symbol}</span>
          <input id="plan-income" inputMode="decimal" placeholder="Use my average" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary sm">Save</button>
        {plan.income > 0 && <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
      <p className="hint">Leave it empty to use your average income from the last 3 months.</p>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );

  if (plan.income <= 0) {
    return (
      <section className="card plan">
        <div className="card-head"><h2>Monthly plan</h2></div>
        <p className="empty">
          Add your income (salary and any other money coming in), or type what you expect to earn each month. Ledgerly
          then works out how much you can spend while saving for your goals and an emergency fund.
        </p>
        {incomeEditor}
      </section>
    );
  }

  const source =
    plan.incomeBasis === 'manual'
      ? 'the expected income you set'
      : plan.incomeBasis === 'average'
        ? `your average over the last ${plan.incomeMonths === 1 ? 'month' : `${plan.incomeMonths} months`}`
        : 'this month’s income so far';

  const segments = [
    { key: 'fixed', label: 'Bills and repeating costs', amount: plan.fixed, pct: plan.pct.fixed, hint: 'Rent, utilities and anything set to repeat (yearly bills count monthly).' },
    { key: 'goals', label: 'Savings goals', amount: plan.goalsTotal, pct: plan.pct.goals, hint: hasGoals ? 'What your goals need each month.' : 'No goals yet.' },
    { key: 'emergency', label: 'Emergency fund', amount: plan.emergency, pct: plan.pct.emergency, hint: plan.emergency ? 'Building your safety net.' : 'Add an emergency fund goal to include it.' },
    { key: 'free', label: 'Free to spend', amount: Math.max(0, plan.free), pct: plan.pct.free, hint: 'Food, transport, fun: everything else.' },
  ] as const;
  const barTotal = Math.max(plan.income, plan.fixed + plan.goalsTotal + plan.emergency);
  const used = plan.free > 0 ? Math.min(1, plan.spentFree / plan.free) : 1;

  return (
    <section className="card plan">
      <div className="card-head">
        <h2>Monthly plan</h2>
        {!editing && <button type="button" className="btn-ghost" onClick={openEditor}>Change income</button>}
      </div>

      {editing ? (
        incomeEditor
      ) : (
        <p className="plan-income">
          <span className="muted">Income</span> <strong className="num">{money(plan.income)}</strong>{' '}
          <span className="muted">a month, from {source}</span>
          {plan.incomeByCategory.length > 1 && (
            <span className="plan-income-parts">
              {plan.incomeByCategory.map((c) => `${c.category} ${money(c.amount)}`).join(' + ')}
            </span>
          )}
        </p>
      )}

      <div className="plan-bar" role="img" aria-label={segments.map((s) => `${s.label} ${pctText(s.pct)}`).join(', ')}>
        {segments.map((s) =>
          s.amount > 0 ? (
            <span key={s.key} className={`seg seg-${s.key}`} style={{ width: `${(s.amount / barTotal) * 100}%` }} />
          ) : null,
        )}
      </div>

      <ul className="plan-rows">
        {segments.map((s) => (
          <li key={s.key}>
            <span className={`swatch seg-${s.key}`} />
            <span className="plan-label">
              {s.label}
              <small>{s.hint}</small>
            </span>
            <span className="num plan-amt">{money(s.amount)}</span>
            <span className="num plan-pct">{pctText(s.pct)}</span>
          </li>
        ))}
      </ul>

      {plan.shortfall > 0 ? (
        <p className="plan-warning" role="alert">
          Your bills and savings need <strong>{money(plan.shortfall)}</strong> more than your income each month. Push
          back a goal’s date, lower a target, or cut a repeating cost.
        </p>
      ) : (
        <div className="plan-month">
          <div className="plan-month-head">
            <span>
              {isCurrentMonth ? 'This month' : monthLabel(month)}: spent <strong className="num">{money(plan.spentFree)}</strong> of{' '}
              <span className="num">{money(plan.free)}</span> free money
            </span>
            <span className={`num ${plan.leftToSpend < 0 ? 'expense' : ''}`}>
              {plan.leftToSpend >= 0 ? `${money(plan.leftToSpend)} left` : `${money(-plan.leftToSpend)} over`}
            </span>
          </div>
          <div className={`meter ${used >= 1 ? 'state-over' : used >= 0.9 ? 'state-warn' : ''}`}>
            <div className="meter-fill" style={{ width: `${used * 100}%` }} />
          </div>
          {isCurrentMonth && plan.perDay > 0 && (
            <p className="hint">
              About <strong className="num">{money(plan.perDay)}</strong> a day for the next {plan.daysLeft}{' '}
              {plan.daysLeft === 1 ? 'day' : 'days'}.
            </p>
          )}
        </div>
      )}

      {!hasGoals && (
        <p className="hint">
          Saving for something?{' '}
          <button type="button" className="link-btn" onClick={onAddGoal}>Add a goal</button> and it’s built into this plan.
        </p>
      )}
    </section>
  );
}
