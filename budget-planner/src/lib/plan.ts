import { effectiveInMonth, monthDiff, monthOf, round2, shiftMonth, totals, type Transaction, type TxType } from './budget';
import { daysInMonth, ruleMonthlyAmount, type RecurringRule } from './recurring';

/* ---------- Goals ---------- */

export interface Contribution {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // base currency; negative = taken out
  /** Added automatically from this income transaction (see `syncAutoSavings`). */
  txId?: string;
}

export interface Goal {
  id: string;
  name: string;
  /** "emergency" is the emergency fund: built up over time rather than for a purchase. */
  kind: 'goal' | 'emergency';
  target: number; // base currency
  /** Month the money is needed by (YYYY-MM). Without one, the goal shares the general savings slice. */
  targetMonth?: string;
  contributions: Contribution[];
  /** Save this share of income (0..1) each month, e.g. 0.2 for 20%. Takes priority over the date. */
  incomeShare?: number;
  /** With `incomeShare`: record that share of each income automatically as saved in this goal. */
  autoSave?: boolean;
  /** Income dated on or after this day (YYYY-MM-DD) is saved automatically. */
  autoSince?: string;
}

const hasIncomeShare = (g: Goal) => !!g.incomeShare && g.incomeShare > 0;

/**
 * Keep automatic savings in step with income: for each goal set to save a share of income automatically,
 * every income transaction since `autoSince` contributes that share, in date order, until the goal is full.
 * Recomputed from scratch, so edited or deleted income is reflected. Money added by hand is left alone.
 * Returns the same array when nothing changed.
 */
export function syncAutoSavings(goals: Goal[], transactions: Transaction[]): Goal[] {
  let changed = false;
  const next = goals.map((g) => {
    const manual = g.contributions.filter((c) => !c.txId);
    const auto: Contribution[] = [];
    if (hasIncomeShare(g) && g.autoSave) {
      let saved = manual.reduce((s, c) => s + c.amount, 0);
      const incomes = transactions
        .filter((t) => t.type === 'income' && (!g.autoSince || t.date >= g.autoSince))
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      for (const t of incomes) {
        const room = round2(g.target - saved);
        if (room <= 0) break;
        const amount = Math.min(round2(t.amount * g.incomeShare!), room);
        if (amount <= 0) continue;
        auto.push({ id: `auto:${g.id}:${t.id}`, date: t.date, amount, txId: t.id });
        saved += amount;
      }
    }
    const before = g.contributions.filter((c) => c.txId);
    if (before.length === auto.length && before.every((c, i) => c.id === auto[i].id && c.amount === auto[i].amount && c.date === auto[i].date))
      return g;
    changed = true;
    return { ...g, contributions: [...manual, ...auto] };
  });
  return changed ? next : goals;
}

export const goalSaved = (g: Goal) => round2(g.contributions.reduce((s, c) => s + c.amount, 0));
export const goalRemaining = (g: Goal) => Math.max(0, round2(g.target - goalSaved(g)));
export const goalProgress = (g: Goal) => (g.target > 0 ? Math.min(1, Math.max(0, goalSaved(g) / g.target)) : 0);
export const savedInMonth = (g: Goal, month: string) =>
  round2(g.contributions.filter((c) => monthOf(c.date) === month).reduce((s, c) => s + c.amount, 0));

/** How much to put aside each month from `month` to reach the goal by its date (null when it has no date). */
export function goalMonthlyNeed(g: Goal, month: string): number | null {
  const remaining = goalRemaining(g);
  if (remaining <= 0) return 0;
  if (!g.targetMonth) return null;
  const monthsLeft = Math.max(1, monthDiff(month, g.targetMonth) + 1);
  return round2(remaining / monthsLeft);
}

/* ---------- Averages ---------- */

export interface MonthlyAverage {
  amount: number;
  /** How many months the average is over; 0 means it came from the current month alone (or there is no data). */
  months: number;
  basis: 'average' | 'this-month' | 'none';
  byCategory: { category: string; amount: number }[];
}

/**
 * Average monthly income or spending over the `lookback` complete months before `month`, using only months
 * that have any. Falls back to `month` itself when there's no history yet. Spread payments count by their
 * monthly share, so ₦3M yearly rent averages ₦250k.
 */
export function averageMonthly(txs: Transaction[], month: string, type: TxType, lookback = 3): MonthlyAverage {
  const perMonth = Array.from({ length: lookback }, (_, i) =>
    effectiveInMonth(txs, shiftMonth(month, -(i + 1))).filter((t) => t.type === type),
  ).filter((list) => list.length > 0);
  let basis: MonthlyAverage['basis'] = 'average';
  let lists = perMonth;
  if (!lists.length) {
    const current = effectiveInMonth(txs, month).filter((t) => t.type === type);
    lists = current.length ? [current] : [];
    basis = current.length ? 'this-month' : 'none';
  }
  if (!lists.length) return { amount: 0, months: 0, basis: 'none', byCategory: [] };
  const n = lists.length;
  const byCat = new Map<string, number>();
  let total = 0;
  for (const list of lists)
    for (const t of list) {
      total += t.amount;
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    }
  return {
    amount: round2(total / n),
    months: basis === 'average' ? n : 0,
    basis,
    byCategory: [...byCat].map(([category, a]) => ({ category, amount: round2(a / n) })).sort((a, b) => b.amount - a.amount),
  };
}

/* ---------- The monthly plan ---------- */

export interface PlanSettings {
  /** Expected monthly income typed by the user; replaces the average when set. */
  income?: number;
  /** Share of income set aside for goals that have no date. */
  savingsRate: number;
  /** Months to build the emergency fund over, when it has no date. */
  emergencyMonths: number;
}

export const DEFAULT_PLAN: PlanSettings = { savingsRate: 0.2, emergencyMonths: 12 };

export interface GoalAllocation {
  goal: Goal;
  monthly: number;
  /**
   * "income-share": a set share of income (e.g. 20%); "dated": needed to hit its date;
   * "share": its part of the savings slice; "done": already reached.
   */
  how: 'income-share' | 'dated' | 'share' | 'done';
}

export interface Plan {
  income: number;
  incomeBasis: 'manual' | MonthlyAverage['basis'];
  incomeMonths: number;
  incomeByCategory: { category: string; amount: number }[];
  /** Repeating bills (per-month equivalent) plus this month's share of spread one-offs. */
  fixed: number;
  goals: GoalAllocation[];
  goalsTotal: number;
  emergency: number;
  free: number; // monthly money left to spend freely (can be negative)
  /** By how much bills and savings exceed income (0 when they fit). */
  shortfall: number;
  // This month
  incomeThisMonth: number;
  expenseThisMonth: number;
  spentFree: number; // spending that isn't a bill: what eats into `free`
  leftToSpend: number;
  daysLeft: number;
  perDay: number;
  pct: { fixed: number; goals: number; emergency: number; free: number };
}

export function buildPlan(input: {
  transactions: Transaction[];
  recurring: RecurringRule[];
  goals: Goal[];
  month: string;
  today: string;
  settings: PlanSettings;
  rateFor?: (currency: string) => number | null;
}): Plan {
  const { transactions, recurring, goals, month, today, settings, rateFor } = input;
  const avg = averageMonthly(transactions, month, 'income');
  const manual = settings.income != null && settings.income > 0;
  const income = manual ? settings.income! : avg.amount;

  // Bills: repeating expenses (monthly equivalent) + this month's share of spread one-offs (e.g. rent paid once).
  const entries = effectiveInMonth(transactions, month);
  const ruleBills = recurring
    .filter((r) => !r.paused && r.type === 'expense')
    .reduce((s, r) => s + ruleMonthlyAmount(r, rateFor), 0);
  const isBill = (t: Transaction) => !!t.recurringId || (!!t.spread && t.spread > 1);
  const spreadOneOffs = entries
    .filter((t) => t.type === 'expense' && !t.recurringId && t.spread && t.spread > 1)
    .reduce((s, t) => s + t.amount, 0);
  const fixed = round2(ruleBills + spreadOneOffs);

  // Goals: dated ones need a set amount; undated ones share what's left of the savings slice.
  const purchase = goals.filter((g) => g.kind === 'goal');
  const fund = goals.find((g) => g.kind === 'emergency');
  // A share of income (e.g. 20%) wins over a date; it stops once the goal is reached.
  const shareOfIncome = (g: Goal) => round2(Math.min(goalRemaining(g), income * g.incomeShare!));
  const emergency = !fund
    ? 0
    : hasIncomeShare(fund)
      ? shareOfIncome(fund)
      : round2(goalMonthlyNeed(fund, month) ?? goalRemaining(fund) / Math.max(1, settings.emergencyMonths));
  const allocations: GoalAllocation[] = [];
  let datedTotal = 0;
  for (const g of purchase) {
    if (goalRemaining(g) <= 0) {
      allocations.push({ goal: g, monthly: 0, how: 'done' });
      continue;
    }
    if (hasIncomeShare(g)) {
      const amount = shareOfIncome(g);
      allocations.push({ goal: g, monthly: amount, how: 'income-share' });
      datedTotal += amount;
      continue;
    }
    const need = goalMonthlyNeed(g, month);
    if (need != null) {
      allocations.push({ goal: g, monthly: need, how: 'dated' });
      datedTotal += need;
    }
  }
  const undated = purchase.filter((g) => goalRemaining(g) > 0 && !hasIncomeShare(g) && goalMonthlyNeed(g, month) == null);
  const pool = Math.max(0, income * settings.savingsRate - datedTotal - emergency);
  for (const g of undated) {
    const share = round2(Math.min(goalRemaining(g), pool / undated.length));
    allocations.push({ goal: g, monthly: share, how: 'share' });
  }
  const goalsTotal = round2(allocations.reduce((s, a) => s + a.monthly, 0));
  const free = round2(income - fixed - goalsTotal - emergency);

  // This month so far
  const t = totals(entries);
  const spentFree = round2(
    entries.filter((e) => e.type === 'expense' && !isBill(e)).reduce((s, e) => s + e.amount, 0),
  );
  const cur = monthOf(today);
  const daysLeft =
    month < cur ? 0 : month > cur ? daysInMonth(month) : daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  const leftToSpend = round2(free - spentFree);
  const pct = (n: number) => (income > 0 ? n / income : 0);

  return {
    income: round2(income),
    incomeBasis: manual ? 'manual' : avg.basis,
    incomeMonths: avg.months,
    incomeByCategory: manual ? [] : avg.byCategory,
    fixed,
    goals: allocations,
    goalsTotal,
    emergency,
    free,
    shortfall: free < 0 ? round2(-free) : 0,
    incomeThisMonth: t.income,
    expenseThisMonth: t.expense,
    spentFree,
    leftToSpend,
    daysLeft,
    perDay: daysLeft > 0 && leftToSpend > 0 ? round2(leftToSpend / daysLeft) : 0,
    pct: { fixed: pct(fixed), goals: pct(goalsTotal), emergency: pct(emergency), free: pct(Math.max(0, free)) },
  };
}

/** A sensible emergency-fund target: `months` of average spending, rounded up to the nearest 1,000. */
export function suggestedEmergencyTarget(txs: Transaction[], month: string, months = 3): number {
  const avg = averageMonthly(txs, month, 'expense').amount;
  return avg > 0 ? Math.ceil((avg * months) / 1000) * 1000 : 0;
}

/* ---------- Alerts ---------- */

export type AlertLevel = 'over-income' | 'over-plan' | 'near-plan';

export const ALERT_RANK: Record<AlertLevel, number> = { 'near-plan': 1, 'over-plan': 2, 'over-income': 3 };

export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
}

/**
 * The most serious warning for the plan's month, or null.
 * - over-income: spending is above this month's income (or, before any income arrives, above your usual income)
 * - over-plan: everyday spending is above what's free once bills and savings are set aside
 * - near-plan: 90% or more of that is used
 */
export function alertFor(plan: Plan, money: (n: number) => string): Alert | null {
  const { incomeThisMonth: inc, expenseThisMonth: exp } = plan;
  if (exp > 0 && inc > 0 && exp > inc) {
    return {
      level: 'over-income',
      title: 'Spending is higher than your income this month',
      detail: `You’ve spent ${money(exp)} against ${money(inc)} of income: ${money(round2(exp - inc))} more than came in.`,
    };
  }
  if (exp > 0 && inc === 0 && plan.income > 0 && exp > plan.income) {
    return {
      level: 'over-income',
      title: 'Spending is higher than your usual monthly income',
      detail: `You’ve spent ${money(exp)} and no income is recorded yet this month. You usually earn ${money(plan.income)}.`,
    };
  }
  if (plan.income <= 0 || plan.spentFree <= 0) return null;
  if (plan.free <= 0) {
    return {
      level: 'over-plan',
      title: 'Bills and savings already use all your income',
      detail: `Other spending (${money(plan.spentFree)} so far) comes out of your savings. Push back a goal’s date or lower its amount.`,
    };
  }
  if (plan.spentFree > plan.free) {
    return {
      level: 'over-plan',
      title: 'You’ve gone over this month’s spending money',
      detail: `You’ve spent ${money(plan.spentFree)}, which is ${money(round2(plan.spentFree - plan.free))} more than the ${money(plan.free)} you can spend while staying on track for your goals.`,
    };
  }
  if (plan.spentFree >= plan.free * 0.9) {
    return {
      level: 'near-plan',
      title: `You’ve used ${Math.round((plan.spentFree / plan.free) * 100)}% of this month’s spending money`,
      detail: `${money(plan.leftToSpend)} is left for the next ${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'}.`,
    };
  }
  return null;
}
