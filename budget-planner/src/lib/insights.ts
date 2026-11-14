import type { BudgetStatus, Totals } from './budget';
import type { Plan } from './plan';

export type InsightTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: 'calendar' | 'budgets' | 'insights' | 'savings' | 'bulb';
  title: string;
  detail: string;
}

/**
 * Short, plain-language observations for the Overview, built only from numbers the app already
 * calculates (month totals, the plan, budget status, spending by category). Overspending warnings
 * stay in the alert banner (`alertFor`), so they aren't repeated here.
 */
export function overviewInsights(input: {
  totals: Totals;
  previous: Totals;
  previousLabel: string;
  plan: Plan;
  isCurrentMonth: boolean;
  budgets: BudgetStatus[];
  byCategory: { category: string; amount: number }[];
  money: (n: number) => string;
  max?: number;
}): Insight[] {
  const { totals: t, previous, plan, budgets, byCategory, money } = input;
  const out: Insight[] = [];

  if (input.isCurrentMonth && plan.income > 0 && plan.shortfall <= 0 && plan.perDay > 0) {
    out.push({
      id: 'per-day',
      tone: 'good',
      icon: 'calendar',
      title: `About ${money(plan.perDay)} a day to spend`,
      detail: `For the next ${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'}, while still covering bills and savings.`,
    });
  }

  const over = budgets.filter((b) => b.state === 'over');
  const near = budgets.filter((b) => b.state === 'warn');
  const names = (list: BudgetStatus[]) => {
    const n = list.map((b) => b.category);
    return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more`;
  };
  if (over.length) {
    out.push({
      id: 'budgets',
      tone: 'bad',
      icon: 'budgets',
      title: `${over.length} ${over.length === 1 ? 'budget is' : 'budgets are'} over the limit`,
      detail: `${names(over)}: ${money(over.reduce((s, b) => s + (b.spent - b.limit), 0))} over in total.`,
    });
  } else if (near.length) {
    out.push({
      id: 'budgets',
      tone: 'warn',
      icon: 'budgets',
      title: `${names(near)} ${near.length === 1 ? 'is' : 'are'} close to the limit`,
      detail: `${near.length === 1 ? 'It has' : 'They have'} ${money(near.reduce((s, b) => s + b.remaining, 0))} left this month.`,
    });
  } else if (budgets.length) {
    out.push({
      id: 'budgets',
      tone: 'good',
      icon: 'budgets',
      title: 'Every budget is on track',
      detail: `All ${budgets.length} ${budgets.length === 1 ? 'limit is' : 'limits are'} under 80% used.`,
    });
  }

  const top = byCategory[0];
  if (top && t.expense > 0) {
    out.push({
      id: 'top-category',
      tone: 'neutral',
      icon: 'insights',
      title: `${top.category} is your biggest spend`,
      detail: `${Math.round((top.amount / t.expense) * 100)}% of spending (${money(top.amount)}).`,
    });
  }

  if (t.expense > 0 && previous.expense > 0) {
    const change = (t.expense - previous.expense) / previous.expense;
    const pct = Math.round(Math.abs(change) * 100);
    if (pct >= 5) {
      out.push({
        id: 'vs-last',
        tone: change > 0.1 ? 'warn' : change < 0 ? 'good' : 'neutral',
        icon: 'bulb',
        title: `Spending is ${change > 0 ? 'up' : 'down'} ${pct}% on ${input.previousLabel}`,
        detail: input.isCurrentMonth
          ? `${money(t.expense)} so far, against ${money(previous.expense)} for all of ${input.previousLabel}.`
          : `${money(t.expense)}, against ${money(previous.expense)}.`,
      });
    }
  }

  if (t.income > 0 && t.net > 0) {
    const rate = Math.round(t.savingsRate * 100);
    out.push({
      id: 'savings-rate',
      tone: rate >= 20 ? 'good' : 'neutral',
      icon: 'savings',
      title: `You’re keeping ${rate}% of your income`,
      detail: rate >= 20 ? 'That’s at or above the 20% many planners suggest.' : 'Many planners suggest aiming for 20% or more.',
    });
  }

  return out.slice(0, input.max ?? 4);
}
