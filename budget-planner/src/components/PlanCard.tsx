import { useState } from 'react';
import { monthLabel, parseAmount } from '../lib/budget';
import { useFormat } from '../lib/format';
import type { Plan } from '../lib/plan';
import { reconcile } from '../lib/reconcile';

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
          Add your income (salary and any other money coming in), or type what you expect to earn each month. Elora
          then works out how much you can spend while saving for your goals and an emergency fund.
        </p>
        {incomeEditor}
      </section>
    );
  }

  const monthName = monthLabel(month);
  const basis =
    plan.incomeBasis === 'manual'
      ? 'the expected income you set'
      : plan.incomeBasis === 'average'
        ? plan.incomeMonths === 3
          ? `your average for the 3 months before ${monthName}`
          : `your average for the ${plan.incomeMonths === 1 ? 'month' : `${plan.incomeMonths} months`} with income in the 3 months before ${monthName}`
        : `the income recorded in ${monthName} so far (there’s no earlier history yet)`;
  const differs = plan.incomeBasis !== 'this-month' && Math.round(plan.incomeThisMonth) !== Math.round(plan.income);

  const segments = [
    { key: 'fixed', label: 'Bills and repeating costs', amount: plan.fixed, pct: plan.pct.fixed, hint: 'Items set to repeat, plus this month’s share of spread payments. A bill typed as a one-off counts as everyday spending instead.' },
    { key: 'goals', label: 'Savings goals', amount: plan.goalsTotal, pct: plan.pct.goals, hint: hasGoals ? 'Set aside for your goals each month.' : 'No goals yet.' },
    { key: 'emergency', label: 'Emergency fund', amount: plan.emergency, pct: plan.pct.emergency, hint: plan.emergency ? 'Set aside for your safety net.' : 'Add an emergency fund goal to include it.' },
    { key: 'free', label: 'Free to spend', amount: Math.max(0, plan.free), pct: plan.pct.free, hint: 'Your monthly allowance for everything else: food, transport, fun.' },
  ] as const;
  const barTotal = Math.max(plan.income, plan.fixed + plan.goalsTotal + plan.emergency);
  const used = plan.free > 0 ? Math.min(1, plan.spentFree / plan.free) : 1;
  const left = plan.leftToSpend;

  return (
    <section className="card plan">
      <div className="card-head">
        <h2>
          Monthly plan
          <span className="card-sub">{monthName}</span>
        </h2>
        {!editing && <button type="button" className="btn-secondary sm" onClick={openEditor}>Change income</button>}
      </div>

      {plan.shortfall > 0 ? (
        <p className="plan-warning" role="alert">
          Your bills and savings need <strong>{money(plan.shortfall)}</strong> more than your income each month. Push
          back a goal’s date, lower a target, or cut a repeating cost.
        </p>
      ) : (
        <div className="plan-lead">
          <span className="plan-lead-label">{left >= 0 ? `Left to spend ${isCurrentMonth ? 'this month' : `in ${monthName}`}` : `Over your plan ${isCurrentMonth ? 'this month' : `in ${monthName}`}`}</span>
          <strong className={`plan-lead-value num ${left < 0 ? 'is-over' : ''}`}>{money(Math.abs(left))}</strong>
          <span className="plan-lead-sub">
            Free to spend <span className="num">{money(plan.free)}</span> minus everyday spending so far{' '}
            <span className="num">{money(plan.spentFree)}</span>.
            {isCurrentMonth && plan.perDay > 0 && (
              <> About <strong className="num">{money(plan.perDay)}</strong> a day for the next {plan.daysLeft} {plan.daysLeft === 1 ? 'day' : 'days'}.</>
            )}
          </span>
          <div
            className={`meter ${used >= 1 ? 'state-over' : used >= 0.9 ? 'state-warn' : ''}`}
            role="meter"
            aria-label="Share of free-to-spend money used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(used * 100)}
          >
            <div className="meter-fill" style={{ width: `${used * 100}%` }} />
          </div>
        </div>
      )}

      {isCurrentMonth && plan.income > 0 && <PlanBridge plan={plan} />}

      {editing ? (
        incomeEditor
      ) : (
        <div className="plan-income">
          <p>
            Planned on <strong className="num">{money(plan.income)}</strong> a month, {basis}.
          </p>
          {plan.incomeByCategory.length > 1 && (
            <span className="plan-income-parts">
              {plan.incomeByCategory.map((c) => `${c.category} ${money(c.amount)}`).join(' + ')}
            </span>
          )}
          {differs && (
            <span className="plan-income-parts">
              You’ve recorded <span className="num">{money(plan.incomeThisMonth)}</span> of income in {monthName} so far. The
              plan uses the {plan.incomeBasis === 'manual' ? 'amount you set' : 'average'} so one month doesn’t swing it.
            </span>
          )}
        </div>
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

      {!hasGoals && (
        <p className="hint">
          Saving for something?{' '}
          <button type="button" className="link-btn" onClick={onAddGoal}>Add a goal</button> and it’s built into this plan.
        </p>
      )}
    </section>
  );
}

/** Plain-language definitions of the figures Elora shows, for the Plan page. */
export function PlanGlossary() {
  return (
    <section className="card">
      <div className="card-head"><h2>How these numbers are worked out</h2></div>
      <dl className="glossary">
        <div>
          <dt>Balance this month</dt>
          <dd>Income you’ve recorded this month minus spending you’ve recorded. It isn’t a bank balance: Elora only knows what you enter or import.</dd>
        </div>
        <div>
          <dt>Planned income</dt>
          <dd>Your average monthly income over the 3 complete months before this one, or the expected income you set. It can differ from what has come in so far this month.</dd>
        </div>
        <div>
          <dt>Bills</dt>
          <dd>Items set to repeat, counted every month even before they’re paid, plus the monthly share of payments spread over several months, like yearly rent.</dd>
        </div>
        <div>
          <dt>Savings</dt>
          <dd>What your goals and emergency fund need each month. This is money to set aside; Elora doesn’t move it.</dd>
        </div>
        <div>
          <dt>Free to spend</dt>
          <dd>Planned income minus bills and savings: your monthly allowance for everything else.</dd>
        </div>
        <div>
          <dt>Left to spend</dt>
          <dd>Free to spend minus the everyday spending you’ve recorded this month. Bills don’t reduce it twice.</dd>
        </div>
        <div>
          <dt>Savings rate</dt>
          <dd>The share of this month’s recorded income you haven’t spent.</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * From "Balance this month" to "Left to spend", line by line, so the two figures never seem to
 * disagree. Lines that are zero are left out; the sum is exact (see lib/reconcile.ts).
 */
function PlanBridge({ plan }: { plan: Plan }) {
  const { money } = useFormat();
  const r = reconcile(plan);
  const signed = (n: number) => `${n < 0 ? '−' : '+'} ${money(Math.abs(n))}`;
  const lines: [string, string, string][] = [];
  if (r.incomeStillExpected !== 0)
    lines.push([
      r.incomeStillExpected > 0 ? 'Income still expected' : 'Income above your plan',
      r.incomeStillExpected > 0 ? 'Your planned income, minus what has come in so far.' : 'More came in than the plan assumes; the plan doesn’t count on it.',
      signed(r.incomeStillExpected),
    ]);
  if (r.billsNotYetPaid !== 0)
    lines.push([
      r.billsNotYetPaid > 0 ? 'Bills not yet paid' : 'Bills paid ahead of this month’s share',
      r.billsNotYetPaid > 0 ? 'Set aside for repeating bills due later this month.' : 'For example, a yearly bill paid now that counts a share each month.',
      signed(-r.billsNotYetPaid),
    ]);
  if (r.savings !== 0) lines.push(['Savings to set aside', 'For your goals and emergency fund.', signed(-r.savings)]);
  return (
    <div className="plan-bridge">
      <h3>How this compares with your balance</h3>
      <dl>
        <div>
          <dt>Balance this month<small>Income recorded minus spending recorded.</small></dt>
          <dd className="num">{money(r.balance)}</dd>
        </div>
        {lines.map(([label, hint, value]) => (
          <div key={label}>
            <dt>{label}<small>{hint}</small></dt>
            <dd className="num">{value}</dd>
          </div>
        ))}
        <div className="plan-bridge-total">
          <dt>{r.leftToSpend >= 0 ? 'Left to spend' : 'Over your plan'}</dt>
          <dd className="num">{money(r.leftToSpend)}</dd>
        </div>
      </dl>
    </div>
  );
}
