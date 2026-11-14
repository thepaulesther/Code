import { monthLabel, type Totals } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import type { Plan } from '../../lib/plan';
import { Icon } from '../ui/Icon';

const change = (now: number, before: number) => {
  if (before === 0) return null;
  const pct = ((now - before) / before) * 100;
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs last month`;
};

/**
 * The Overview's primary element: this month's balance (income minus spending). Elora records cash
 * flow rather than bank balances, so the label says exactly what the number is.
 */
export function BalanceHero({ month, isCurrentMonth, totals: t, previous, plan, hasData }: {
  month: string;
  isCurrentMonth: boolean;
  totals: Totals;
  previous: Totals;
  plan: Plan;
  hasData: boolean;
}) {
  const { money } = useFormat();
  const label = isCurrentMonth ? 'Balance this month' : `Balance for ${monthLabel(month)}`;
  const sub = !hasData
    ? 'Add your first income or expense to see your balance here.'
    : t.net >= 0
      ? `Left over from ${money(t.income)} of income${isCurrentMonth ? ' so far' : ''}.`
      : `You’ve spent ${money(-t.net)} more than came in.`;
  const showPlan = isCurrentMonth && plan.income > 0 && plan.shortfall <= 0;

  return (
    <section className="hero" aria-labelledby="hero-label">
      <div className="hero-main">
        <div>
          <span className="hero-label" id="hero-label">{label}</span>
          <strong className="hero-value num">{money(t.net)}</strong>
          <p className="hero-sub">{sub}</p>
        </div>
        {hasData && (
          <div className="hero-chips">
            {t.income > 0 && (
              <span className="hero-chip">
                Savings rate <strong className="num">{Math.round(t.savingsRate * 100)}%</strong>
              </span>
            )}
            {showPlan && (
              <span className="hero-chip">
                {plan.leftToSpend >= 0 ? (
                  <><strong className="num">{money(plan.leftToSpend)}</strong> free to spend</>
                ) : (
                  <><strong className="num">{money(-plan.leftToSpend)}</strong> over your plan</>
                )}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="hero-split">
        <div className="hero-flow">
          <span className="hero-flow-icon"><Icon name="arrow-in" size={18} /></span>
          <span className="hero-flow-text">
            <span className="hero-flow-label">Income</span>
            <span className="hero-flow-value num">{money(t.income)}</span>
            <span className="hero-flow-delta">{change(t.income, previous.income) ?? 'Nothing to compare yet'}</span>
          </span>
        </div>
        <div className="hero-flow">
          <span className="hero-flow-icon"><Icon name="arrow-out" size={18} /></span>
          <span className="hero-flow-text">
            <span className="hero-flow-label">Spending</span>
            <span className="hero-flow-value num">{money(t.expense)}</span>
            <span className="hero-flow-delta">{change(t.expense, previous.expense) ?? 'Nothing to compare yet'}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
