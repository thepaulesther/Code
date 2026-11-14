import { useState } from 'react';
import { monthLabel, monthOf, newId, parseAmount, todayISO } from '../lib/budget';
import { useFormat } from '../lib/format';
import { goalProgress, goalRemaining, goalSaved, type Goal, type GoalAllocation } from '../lib/plan';
import { Modal } from './Modal';

const PRESETS = ['Car', 'Property', 'New phone', 'Emergency fund'];

export function GoalsPanel({ goals, allocations, emergencyMonthly, emergencyMonths, suggestedEmergency, dialogOpen, onDialog, onSave, onDelete, onAddMoney }: {
  goals: Goal[];
  /** From the plan: how much each goal gets a month. */
  allocations: GoalAllocation[];
  emergencyMonthly: number;
  emergencyMonths: number;
  /** 3 months of average spending, offered as the emergency-fund target. */
  suggestedEmergency: number;
  /** The goal being edited, 'new' for a new one, or null when the dialog is closed. */
  dialogOpen: Goal | 'new' | null;
  onDialog: (g: Goal | 'new' | null) => void;
  /** Save a goal; `savedChange` is money to add (or remove) so "saved so far" matches what was typed. */
  onSave: (g: Goal, savedChange: number) => void;
  onDelete: (id: string) => void;
  onAddMoney: (id: string, amount: number) => void;
}) {
  const { money } = useFormat();
  const [moneyFor, setMoneyFor] = useState<string | null>(null);
  const [moneyText, setMoneyText] = useState('');
  const [moneyError, setMoneyError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sorted = [...goals].sort((a, b) => Number(b.kind === 'emergency') - Number(a.kind === 'emergency'));
  const hasEmergency = goals.some((g) => g.kind === 'emergency');

  const submitMoney = (id: string, sign: 1 | -1) => {
    const n = parseAmount(moneyText);
    if (n == null) return setMoneyError('Enter an amount greater than 0');
    onAddMoney(id, sign * n);
    setMoneyFor(null);
    setMoneyText('');
    setMoneyError('');
  };

  const planLine = (g: Goal) => {
    const remaining = goalRemaining(g);
    if (remaining <= 0) return 'Reached. Well done!';
    if (g.incomeShare) {
      const pct = `${Math.round(g.incomeShare * 1000) / 10}% of income`;
      const monthly = g.kind === 'emergency' ? emergencyMonthly : (allocations.find((x) => x.goal.id === g.id)?.monthly ?? 0);
      return g.autoSave
        ? `${pct} (about ${money(monthly)} a month), put aside automatically when income comes in.`
        : `${pct}: about ${money(monthly)} a month.`;
    }
    if (g.kind === 'emergency') {
      return g.targetMonth
        ? `Put aside ${money(emergencyMonthly)} a month to have it by ${monthLabel(g.targetMonth)}.`
        : `${money(emergencyMonthly)} a month builds it in about ${emergencyMonths} months.`;
    }
    const a = allocations.find((x) => x.goal.id === g.id);
    if (a?.how === 'dated') return `Put aside ${money(a.monthly)} a month to reach it by ${monthLabel(g.targetMonth!)}.`;
    if (a && a.monthly > 0) return `About ${money(a.monthly)} a month from your savings (no date set).`;
    return 'No date set. It gets money once your dated goals and emergency fund are covered.';
  };

  return (
    <section className="card goals">
      <div className="card-head">
        <h2>Savings goals</h2>
        <button type="button" className="btn-ghost accent" onClick={() => onDialog('new')}>New goal</button>
      </div>

      {goals.length === 0 ? (
        <p className="empty">
          Saving for a car, a property or a new phone? Add a goal with its price and when you want it, and Elora works
          out how much to put aside each month. An emergency fund is a good first goal.
        </p>
      ) : (
        <ul className="goal-rows">
          {sorted.map((g) => {
            const saved = goalSaved(g);
            const done = goalRemaining(g) <= 0;
            return (
              <li key={g.id} className={done ? 'is-done' : ''}>
                <div className="goal-line">
                  <span className="goal-name">
                    {g.name}
                    {g.kind === 'emergency' && <span className="badge">safety net</span>}
                    {g.autoSave && g.incomeShare && (
                      <span className="badge auto" title="Saved automatically from each income">
                        auto {Math.round(g.incomeShare * 1000) / 10}%
                      </span>
                    )}
                    {g.targetMonth && <span className="goal-date">by {monthLabel(g.targetMonth, 'short')} {g.targetMonth.slice(0, 4)}</span>}
                  </span>
                  <span className="num goal-nums">
                    {money(saved)} <span className="muted">/ {money(g.target)}</span>
                  </span>
                </div>
                <div className="meter goal-meter" role="meter" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={saved} aria-label={`${g.name} progress`}>
                  <div className="meter-fill" style={{ width: `${goalProgress(g) * 100}%` }} />
                </div>
                <p className="goal-plan">{planLine(g)}</p>

                {moneyFor === g.id ? (
                  <form className="goal-money" onSubmit={(e) => { e.preventDefault(); submitMoney(g.id, 1); }}>
                    <input
                      id={`goal-money-${g.id}`}
                      autoFocus
                      inputMode="decimal"
                      placeholder="Amount"
                      value={moneyText}
                      onChange={(e) => setMoneyText(e.target.value)}
                      aria-label={`Amount for ${g.name}`}
                    />
                    <button type="submit" className="btn-primary sm">Add</button>
                    <button type="button" className="btn-ghost" onClick={() => submitMoney(g.id, -1)}>Take out</button>
                    <button type="button" className="btn-ghost" onClick={() => { setMoneyFor(null); setMoneyError(''); }}>Cancel</button>
                    {moneyError && <p className="error" role="alert">{moneyError}</p>}
                  </form>
                ) : confirmDelete === g.id ? (
                  <div className="goal-actions">
                    <span className="muted small">Delete “{g.name}” and its record of {money(saved)} saved?</span>
                    <button type="button" className="btn-ghost danger-solid" onClick={() => { onDelete(g.id); setConfirmDelete(null); }}>Delete</button>
                    <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </div>
                ) : (
                  <div className="goal-actions">
                    <button type="button" className="btn-ghost accent" onClick={() => { setMoneyFor(g.id); setMoneyText(''); }}>Add money</button>
                    <button type="button" className="btn-ghost" onClick={() => onDialog(g)}>Edit</button>
                    <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(g.id)}>Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={dialogOpen != null} onClose={() => onDialog(null)} title={dialogOpen === 'new' ? 'New savings goal' : 'Edit goal'}>
        {dialogOpen != null && (
          <GoalForm
            key={dialogOpen === 'new' ? 'new' : dialogOpen.id}
            goal={dialogOpen === 'new' ? undefined : dialogOpen}
            emergencyTaken={hasEmergency && (dialogOpen === 'new' || dialogOpen.kind !== 'emergency')}
            suggestedEmergency={suggestedEmergency}
            onSave={(g, change) => { onSave(g, change); onDialog(null); }}
          />
        )}
      </Modal>
    </section>
  );
}

function GoalForm({ goal, emergencyTaken, suggestedEmergency, onSave }: {
  goal?: Goal;
  emergencyTaken: boolean;
  suggestedEmergency: number;
  onSave: (g: Goal, savedChange: number) => void;
}) {
  const { money, symbol } = useFormat();
  const [name, setName] = useState(goal?.name ?? '');
  const [kind, setKind] = useState<Goal['kind']>(goal?.kind ?? 'goal');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [targetMonth, setTargetMonth] = useState(goal?.targetMonth ?? '');
  const [saved, setSaved] = useState(goal ? String(goalSaved(goal)) : '');
  const [mode, setMode] = useState<'plan' | 'share'>(goal?.incomeShare ? 'share' : 'plan');
  const [sharePct, setSharePct] = useState(goal?.incomeShare ? String(Math.round(goal.incomeShare * 1000) / 10) : '20');
  const [auto, setAuto] = useState(goal?.autoSave ?? true);
  const [error, setError] = useState('');
  const thisMonth = monthOf(todayISO());

  const pickPreset = (p: string) => {
    setName(p);
    const emergency = p === 'Emergency fund';
    setKind(emergency && !emergencyTaken ? 'emergency' : 'goal');
    if (emergency && !target && suggestedEmergency > 0) setTarget(String(suggestedEmergency));
  };

  const submit = () => {
    const t = parseAmount(target);
    if (!name.trim()) return setError('Give the goal a name, like “Car”.');
    if (t == null) return setError('Enter how much it costs, like 8000000.');
    const s = saved.trim() ? parseAmount(saved) : 0;
    if (saved.trim() && s == null && saved.trim() !== '0') return setError('Enter how much you’ve saved so far, or leave it empty.');
    if (targetMonth && targetMonth < thisMonth) return setError('Pick this month or a later one, or leave the date empty.');
    const pct = Number(sharePct.replace(',', '.'));
    if (mode === 'share' && !(pct > 0 && pct <= 90)) return setError('Enter a share of income between 1% and 90%, like 20.');
    const g: Goal = {
      id: goal?.id ?? newId(),
      name: name.trim(),
      kind,
      target: t,
      // Turning automatic saving off stops future amounts but keeps what was already put aside.
      contributions: (goal?.contributions ?? []).map((c) => {
        if (!c.txId || (mode === 'share' && auto)) return c;
        const kept = { ...c, id: newId() };
        delete kept.txId;
        return kept;
      }),
      ...(targetMonth ? { targetMonth } : {}),
    };
    if (mode === 'share') {
      g.incomeShare = pct / 100;
      if (auto) {
        g.autoSave = true;
        // Start with this month's income (keep the original start if it was already on).
        g.autoSince = goal?.autoSave && goal.autoSince ? goal.autoSince : `${thisMonth}-01`;
      }
    }
    const change = Math.round(((s ?? 0) - (goal ? goalSaved(goal) : 0)) * 100) / 100;
    onSave(g, change);
  };

  return (
    <form className="goal-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {!goal && (
        <div className="chips" role="group" aria-label="Common goals">
          {PRESETS.filter((p) => p !== 'Emergency fund' || !emergencyTaken).map((p) => (
            <button key={p} type="button" className={name === p ? 'chip is-on' : 'chip'} onClick={() => pickPreset(p)}>{p}</button>
          ))}
        </div>
      )}
      <label className="field">
        <span>What are you saving for?</span>
        <input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Car" maxLength={40} />
      </label>
      {!emergencyTaken && (
        <label className="check">
          <input id="goal-emergency" type="checkbox" checked={kind === 'emergency'} onChange={(e) => setKind(e.target.checked ? 'emergency' : 'goal')} />
          <span>
            This is my emergency fund
            <small>Money set aside for surprises, like a job loss or a hospital bill. Usually 3 to 6 months of spending.</small>
          </span>
        </label>
      )}
      <label className="field">
        <span>{kind === 'emergency' ? 'How much do you want in it?' : 'How much does it cost?'}</span>
        <div className="money-input">
          <span aria-hidden>{symbol}</span>
          <input id="goal-target" inputMode="decimal" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
      </label>
      {kind === 'emergency' && suggestedEmergency > 0 && (
        <p className="hint">
          3 months of your average spending is {money(suggestedEmergency)}.{' '}
          <button type="button" className="link-btn" onClick={() => setTarget(String(suggestedEmergency))}>Use this</button>
        </p>
      )}
      <div className="field-row">
        <label className="field">
          <span>Needed by <em>(optional)</em></span>
          <input id="goal-month" type="month" min={thisMonth} value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
        </label>
        <label className="field">
          <span>Saved so far</span>
          <div className="money-input">
            <span aria-hidden>{symbol}</span>
            <input id="goal-saved" inputMode="decimal" placeholder="0" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </div>
        </label>
      </div>
      <fieldset className="save-mode">
        <legend>How do you want to save?</legend>
        <label className="check">
          <input id="goal-mode-plan" type="radio" name="goal-mode" checked={mode === 'plan'} onChange={() => setMode('plan')} />
          <span>
            Let Elora work it out
            <small>
              {targetMonth
                ? 'It works out how much to put aside each month to have it by then.'
                : kind === 'emergency'
                  ? 'Without a date, it’s built up over the months set in Settings (12 by default).'
                  : 'Without a date, it shares the part of your income set aside for savings (20% by default).'}
            </small>
          </span>
        </label>
        <label className="check">
          <input id="goal-mode-share" type="radio" name="goal-mode" checked={mode === 'share'} onChange={() => setMode('share')} />
          <span>
            Save a share of my income
            <small>The same percentage every month, until the goal is reached.</small>
          </span>
        </label>
        {mode === 'share' && (
          <div className="share-options">
            <label className="share-pct" htmlFor="goal-share">
              <input id="goal-share" inputMode="decimal" value={sharePct} onChange={(e) => setSharePct(e.target.value)} aria-label="Percentage of income" />
              <span>% of income</span>
            </label>
            <label className="check">
              <input id="goal-auto" type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              <span>
                Put it aside automatically when income comes in
                <small>
                  Each income you add from this month on puts {sharePct || '…'}% into this goal, e.g. a{' '}
                  {money(500_000)} salary adds {money((500_000 * (Number(sharePct) || 0)) / 100)}. This records the
                  saving; to move the money itself, set up a standing order at your bank for the same amount.
                </small>
              </span>
            </label>
          </div>
        )}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-foot">
        <button type="submit" className="btn-primary sm">{goal ? 'Save changes' : 'Add goal'}</button>
      </div>
    </form>
  );
}
