import { monthLabel, type Totals } from '../../lib/budget';
import { changeLabel, type MonthComparison } from '../../lib/compare';
import { useFormat } from '../../lib/format';
import type { Plan } from '../../lib/plan';
import { Icon } from '../ui/Icon';


/**
 * The Overview's primary element: this month's balance (income minus spending). Elora records cash
 * flow rather than bank balances, so the label says exactly what the number is.
 */
export function BalanceHero({ month, isCurrentMonth, totals: t, comparison: c, plan, hasData, planHref }: {
  month: string;
  isCurrentMonth: boolean;
  totals: Totals;
  /** For the "vs last month" lines; stops at the same day while the month is running. */
  comparison: MonthComparison;
  plan: Plan;
  hasData: boolean;
  /** Link to the Plan page, for the "left to spend" figure. */
  planHref: string;
}) {
  const { money } = useFormat();
  const label = isCurrentMonth ? 'Balance this month' : `Balance for ${monthLabel(month)}`;
  const when = isCurrentMonth ? 'this month' : `in ${monthLabel(month)}`;
  const status = !hasData
    ? 'Add your first income or expense to see your balance here.'
    : t.net >= 0
      ? `You’ve kept ${money(t.net)} of the ${money(t.income)} recorded ${when}.`
      : `You’ve recorded ${money(-t.net)} more spending than income ${when}.`;
  const showPlan = isCurrentMonth && plan.income > 0 && plan.shortfall <= 0;

  return (
    <section className="hero" aria-labelledby="hero-label">
      <div className="hero-main">
        <div>
          <span className="hero-label" id="hero-label">{label}</span>
          <strong className="hero-value num">{money(t.net)}</strong>
          <p className="hero-sub">{status}</p>
          <p className="hero-note">
            Your recorded income minus your recorded spending {when}. It isn’t your bank balance.
          </p>
        </div>
        {hasData && (t.income > 0 || showPlan) && (
          <dl className="hero-facts">
            {t.income > 0 && (
              <div>
                <dt>Savings rate</dt>
                <dd className="num">{Math.round(t.savingsRate * 100)}%</dd>
              </div>
            )}
            {showPlan && (
              <div>
                <dt>{plan.leftToSpend >= 0 ? 'Left to spend this month' : 'Over your plan this month'}</dt>
                <dd className="num">
                  {money(Math.abs(plan.leftToSpend))}
                  <a className="hero-link" href={planHref}>See plan<Icon name="chevron-right" size={14} /></a>
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div className="hero-split">
        <div className="hero-flow">
          <span className="hero-flow-icon"><Icon name="arrow-in" size={18} /></span>
          <span className="hero-flow-text">
            <span className="hero-flow-label">Income</span>
            <span className="hero-flow-value num">{money(t.income)}</span>
            <span className="hero-flow-delta">{changeLabel(c.now.income, c.before.income, c.partial) ?? 'Nothing to compare yet'}</span>
          </span>
        </div>
        <div className="hero-flow">
          <span className="hero-flow-icon"><Icon name="arrow-out" size={18} /></span>
          <span className="hero-flow-text">
            <span className="hero-flow-label">Spending</span>
            <span className="hero-flow-value num">{money(t.expense)}</span>
            <span className="hero-flow-delta">{changeLabel(c.now.expense, c.before.expense, c.partial) ?? 'Nothing to compare yet'}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
