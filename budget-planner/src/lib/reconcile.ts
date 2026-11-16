import { monthOf, round2 } from './budget';
import type { Plan } from './plan';
import { nextOccurrence, ruleBaseAmount, type RecurringRule } from './recurring';

/**
 * How "Balance this month" (what has happened) becomes the plan's "Left to spend" (what the month
 * still has to cover). Both come from the same plan figures, so the steps always add up exactly:
 *
 *   Left to spend = Balance + income still expected − bills not yet paid − savings to set aside
 *
 * No new calculation: this only explains the difference between two figures already shown.
 */
export interface Reconciliation {
  /** Income recorded this month minus spending recorded this month. */
  balance: number;
  /** Planned monthly income minus income recorded so far (negative when more came in than planned). */
  incomeStillExpected: number;
  /** Bills the plan sets aside this month minus bills already paid (negative when more was paid). */
  billsNotYetPaid: number;
  /** Savings goals and emergency fund for the month. */
  savings: number;
  leftToSpend: number;
}

export function reconcile(plan: Plan): Reconciliation {
  const billsPaid = plan.expenseThisMonth - plan.spentFree;
  return {
    balance: round2(plan.incomeThisMonth - plan.expenseThisMonth),
    incomeStillExpected: round2(plan.income - plan.incomeThisMonth),
    billsNotYetPaid: round2(plan.fixed - billsPaid),
    savings: round2(plan.goalsTotal + plan.emergency),
    leftToSpend: plan.leftToSpend,
  };
}

export interface UpcomingItem {
  rule: RecurringRule;
  date: string;
  /** One payment in the base currency (at the latest rate for foreign-currency items). */
  amount: number;
}

/**
 * Repeating items still due later this month: they're added automatically on their date, and until
 * then they aren't in the transaction list or the balance.
 */
export function upcomingThisMonth(
  rules: RecurringRule[],
  today: string,
  rateFor?: (currency: string) => number | null,
): UpcomingItem[] {
  const month = monthOf(today);
  return rules
    .map((rule) => ({ rule, date: nextOccurrence(rule, today) }))
    .filter((x): x is { rule: RecurringRule; date: string } => !!x.date && x.date > today && monthOf(x.date) === month)
    .map(({ rule, date }) => ({ rule, date, amount: ruleBaseAmount(rule, rateFor) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
