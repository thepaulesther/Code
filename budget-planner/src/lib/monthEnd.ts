import { effectiveInMonth, monthOf, newId, round2, shiftMonth, totals, type Transaction } from './budget';
import { goalRemaining, type Goal } from './plan';
import { daysInMonth } from './recurring';

/**
 * The month-end check-in: what a finished month left over, so it can be saved rather than forgotten.
 * Nothing carries over automatically; each month's figures stay as they are. Money moved to a goal
 * is recorded as ordinary goal contributions, dated the last day of the month it came from.
 */
export interface MonthResult {
  month: string;
  income: number;
  expense: number;
  /** Income minus spending, as on that month's balance. */
  net: number;
  /** Money that went into goals during the month (including automatic savings). */
  saved: number;
  /** Net minus what was already saved: the money not yet given a job. */
  leftOver: number;
}

export function monthResult(transactions: Transaction[], goals: Goal[], month: string): MonthResult {
  const t = totals(effectiveInMonth(transactions, month));
  const saved = round2(
    goals.reduce((s, g) => s + g.contributions.filter((c) => monthOf(c.date) === month).reduce((x, c) => x + c.amount, 0), 0),
  );
  const net = round2(t.net);
  return { month, income: round2(t.income), expense: round2(t.expense), net, saved, leftOver: round2(net - saved) };
}

export type CheckIn = { kind: 'left-over' | 'over'; result: MonthResult };

/**
 * What to say about a finished month: money left over to give a job, a month that spent more than it
 * earned, or nothing (no income recorded, or the surplus is already saved).
 */
export function checkInFor(transactions: Transaction[], goals: Goal[], month: string): CheckIn | null {
  const result = monthResult(transactions, goals, month);
  if (result.income <= 0) return null; // income isn't being recorded, so "left over" would mean nothing
  if (result.net < 0) return { kind: 'over', result };
  if (result.leftOver > 0) return { kind: 'left-over', result };
  return null;
}

/** Days into a new month during which last month's check-in is offered on the Overview. */
export const CHECK_IN_DAYS = 7;

/** Last month's check-in, offered during the first days of the month unless dismissed. */
export function monthEndCheckIn(
  transactions: Transaction[],
  goals: Goal[],
  today: string,
  dismissed: readonly string[],
): CheckIn | null {
  if (Number(today.slice(8, 10)) > CHECK_IN_DAYS) return null;
  const previous = shiftMonth(monthOf(today), -1);
  if (dismissed.includes(previous)) return null;
  return checkInFor(transactions, goals, previous);
}

export interface Split {
  goalId: string;
  amount: number;
}

/** Goals that can still take money. */
export const openGoals = (goals: Goal[]) => goals.filter((g) => goalRemaining(g) > 0);

/** Why a split can't be saved, or null when it can. `money` formats amounts for the message. */
export function splitProblem(goals: Goal[], leftOver: number, splits: Split[], money: (n: number) => string = String): string | null {
  const used = splits.filter((s) => s.amount !== 0);
  if (!used.length) return 'Enter an amount for at least one goal.';
  for (const s of used) {
    const g = goals.find((x) => x.id === s.goalId);
    if (!g) return 'That goal no longer exists.';
    if (!(s.amount > 0)) return 'Amounts must be more than zero.';
    if (round2(s.amount) > goalRemaining(g)) return `“${g.name}” only needs ${money(goalRemaining(g))} more.`;
  }
  const total = round2(used.reduce((s, x) => s + x.amount, 0));
  if (total > leftOver) return `That’s more than the ${money(leftOver)} left over.`;
  return null;
}

/** Record the split as contributions dated the last day of `month`. Call only when `splitProblem` is null. */
export function saveLeftOver(goals: Goal[], month: string, splits: Split[]): Goal[] {
  const date = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  return goals.map((g) => {
    const add = splits.filter((s) => s.goalId === g.id && s.amount > 0);
    if (!add.length) return g;
    return { ...g, contributions: [...g.contributions, ...add.map((s) => ({ id: newId(), date, amount: round2(s.amount) }))] };
  });
}
