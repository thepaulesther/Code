import { useId, useState } from 'react';
import { monthLabel, parseAmount, round2 } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import { openGoals, splitProblem, type CheckIn, type Split } from '../../lib/monthEnd';
import { goalRemaining, type Goal } from '../../lib/plan';
import { Icon } from '../ui/Icon';

/**
 * The month-end check-in. Money left over at the end of a month doesn't carry over by itself; this
 * offers to put it towards savings goals instead of letting it quietly disappear from view.
 */
export function MonthEndCard({ checkIn, goals, onSave, onNotNow, onNewGoal, onSeeMonth }: {
  checkIn: CheckIn;
  goals: Goal[];
  onSave: (splits: Split[]) => void;
  /** Hide it for this month. Left out when looking back at a past month. */
  onNotNow?: () => void;
  onNewGoal: () => void;
  /** Open that month's transactions. */
  onSeeMonth: () => void;
}) {
  const { money } = useFormat();
  const { result: r } = checkIn;
  const name = monthLabel(r.month).split(' ')[0];
  const [open, setOpen] = useState(false);
  const titleId = useId();

  if (checkIn.kind === 'over') {
    return (
      <section className="card month-end over" aria-labelledby={titleId}>
        <span className="month-end-icon" aria-hidden><Icon name="calendar" size={20} /></span>
        <div className="month-end-body">
          <h2 id={titleId}>{name} ended {money(-r.net)} over</h2>
          <p>
            You spent {money(r.expense)} and recorded {money(r.income)} of income in {monthLabel(r.month)}. Seeing where it
            went can help with this month.
          </p>
          <div className="month-end-actions">
            <button type="button" className="btn-secondary sm" onClick={onSeeMonth}>See {name}’s spending</button>
            {onNotNow && <button type="button" className="btn-ghost sm" onClick={onNotNow}>Dismiss</button>}
          </div>
        </div>
      </section>
    );
  }

  const available = openGoals(goals);
  return (
    <section className="card month-end" aria-labelledby={titleId}>
      <span className="month-end-icon" aria-hidden><Icon name="savings" size={20} /></span>
      <div className="month-end-body">
        <h2 id={titleId}>You finished {name} with {money(r.leftOver)} left over</h2>
        <p>
          It doesn’t carry over by itself. Put it towards a goal now, before it gets spent.
          {r.saved > 0 && <> {money(r.saved)} already went into your goals in {name}.</>}
        </p>
        {!open ? (
          <div className="month-end-actions">
            {available.length > 0 ? (
              <button type="button" className="btn-primary sm" onClick={() => setOpen(true)}>Add to goals</button>
            ) : (
              <button type="button" className="btn-primary sm" onClick={onNewGoal}>
                <Icon name="plus" size={16} /> Create a goal
              </button>
            )}
            {onNotNow && <button type="button" className="btn-ghost sm" onClick={onNotNow}>Not now</button>}
          </div>
        ) : (
          <SplitForm
            goals={available}
            leftOver={r.leftOver}
            onCancel={() => setOpen(false)}
            onSave={(s) => {
              setOpen(false);
              onSave(s);
            }}
          />
        )}
      </div>
    </section>
  );
}

function SplitForm({ goals, leftOver, onSave, onCancel }: {
  goals: Goal[];
  leftOver: number;
  onSave: (splits: Split[]) => void;
  onCancel: () => void;
}) {
  const { money, symbol } = useFormat();
  // With one goal, start with as much as it can take.
  const [values, setValues] = useState<Record<string, string>>(() =>
    goals.length === 1 ? { [goals[0].id]: String(Math.min(leftOver, goalRemaining(goals[0]))) } : {},
  );
  const [error, setError] = useState<string | null>(null);
  const splits: Split[] = goals.map((g) => ({ goalId: g.id, amount: values[g.id]?.trim() ? (parseAmount(values[g.id]) ?? -1) : 0 }));
  const assigned = round2(splits.reduce((s, x) => s + Math.max(0, x.amount), 0));
  const rest = round2(leftOver - assigned);

  return (
    <form
      className="month-end-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const problem = splitProblem(goals, leftOver, splits, money);
        setError(problem);
        if (!problem) onSave(splits.filter((s) => s.amount > 0));
      }}
    >
      <ul className="month-end-goals">
        {goals.map((g, i) => (
          <li key={g.id}>
            <label htmlFor={`left-over-${g.id}`}>
              <span className="row-title">{g.name}</span>
              <span className="row-sub">Needs {money(goalRemaining(g))} more</span>
            </label>
            <div className="money-input sm">
              <span aria-hidden>{symbol}</span>
              <input
                id={`left-over-${g.id}`}
                inputMode="decimal"
                placeholder="0"
                autoFocus={i === 0}
                value={values[g.id] ?? ''}
                aria-invalid={!!error}
                onChange={(e) => setValues((v) => ({ ...v, [g.id]: e.target.value }))}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="hint" aria-live="polite">
        {rest > 0 ? <>{money(rest)} still to assign. Anything you don’t assign stays as it is.</> : rest === 0 ? 'All of it is assigned.' : <>{money(-rest)} more than was left over.</>}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="month-end-actions">
        <button type="submit" className="btn-primary sm">Save to goals</button>
        <button type="button" className="btn-ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
