import { useMemo, useState } from 'react';
import { BudgetPanel } from './components/BudgetPanel';
import { SpendingDonut, TrendChart } from './components/Charts';
import { TransactionForm } from './components/TransactionForm';
import { TransactionList } from './components/TransactionList';
import {
  budgetStatus,
  formatMoney,
  inMonth,
  monthLabel,
  monthOf,
  monthlyTrend,
  sampleData,
  shiftMonth,
  spendingByCategory,
  toCSV,
  todayISO,
  totals,
  type Budgets,
  type Transaction,
} from './lib/budget';
import { usePersistentState } from './lib/storage';

const isTxArray = (v: unknown): v is Transaction[] =>
  Array.isArray(v) &&
  v.every((t) => t && typeof t.id === 'string' && typeof t.amount === 'number' && typeof t.date === 'string');
const isBudgets = (v: unknown): v is Budgets =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((n) => typeof n === 'number');

const CURRENT_MONTH = monthOf(todayISO());
const seed = sampleData(CURRENT_MONTH);

export default function App() {
  const [transactions, setTransactions] = usePersistentState('bp.transactions', () => seed.transactions, isTxArray);
  const [budgets, setBudgets] = usePersistentState('bp.budgets', () => seed.budgets, isBudgets);
  const [month, setMonth] = useState(CURRENT_MONTH);

  const monthTx = useMemo(() => inMonth(transactions, month), [transactions, month]);
  const t = useMemo(() => totals(monthTx), [monthTx]);
  const prev = useMemo(() => totals(inMonth(transactions, shiftMonth(month, -1))), [transactions, month]);
  const byCategory = useMemo(() => spendingByCategory(monthTx), [monthTx]);
  const trend = useMemo(() => monthlyTrend(transactions, month, 6), [transactions, month]);
  const status = useMemo(() => budgetStatus(monthTx, budgets), [monthTx, budgets]);

  const add = (tx: Transaction) => {
    setTransactions((all) => [...all, tx]);
    setMonth(monthOf(tx.date)); // jump to where it landed
  };
  const remove = (id: string) => setTransactions((all) => all.filter((x) => x.id !== id));

  const exportCSV = () => {
    const blob = new Blob([toCSV(transactions)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clearAll = () => {
    if (confirm('Delete all transactions and budgets? This cannot be undone.')) {
      setTransactions([]);
      setBudgets({});
    }
  };

  const delta = (now: number, before: number) => {
    if (before === 0) return null;
    const pct = ((now - before) / before) * 100;
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs last month`;
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>◐</span>
          <h1>Ledgerly</h1>
        </div>
        <div className="month-nav">
          <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <span className="month-name">{monthLabel(month)}</span>
          <button type="button" className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
          {month !== CURRENT_MONTH && (
            <button type="button" className="btn-ghost" onClick={() => setMonth(CURRENT_MONTH)}>Today</button>
          )}
        </div>
        <div className="top-actions">
          <button type="button" className="btn-ghost" onClick={exportCSV} disabled={!transactions.length}>Export CSV</button>
          <button type="button" className="btn-ghost danger" onClick={clearAll}>Reset</button>
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Income</span>
          <span className="stat-value num income">{formatMoney(t.income)}</span>
          <span className="stat-sub">{delta(t.income, prev.income) ?? ' '}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Expenses</span>
          <span className="stat-value num expense">{formatMoney(t.expense)}</span>
          <span className="stat-sub">{delta(t.expense, prev.expense) ?? ' '}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Net</span>
          <span className={`stat-value num ${t.net < 0 ? 'expense' : ''}`}>{formatMoney(t.net)}</span>
          <span className="stat-sub">{t.net >= 0 ? 'left over this month' : 'overspent this month'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Savings rate</span>
          <span className="stat-value num">{Math.round(t.savingsRate * 100)}%</span>
          <span className="stat-sub">of income kept</span>
        </div>
      </section>

      <main className="grid">
        <div className="col-main">
          <section className="card">
            <div className="card-head">
              <h2>Last 6 months</h2>
              <div className="key">
                <span><i className="k-income" /> Income</span>
                <span><i className="k-expense" /> Expenses</span>
              </div>
            </div>
            <TrendChart data={trend} selected={month} onSelect={setMonth} />
          </section>

          <div className="pair">
            <section className="card">
              <div className="card-head"><h2>Where it went</h2></div>
              <SpendingDonut data={byCategory} />
            </section>
            <BudgetPanel status={status} budgets={budgets} onChange={setBudgets} />
          </div>

          <TransactionList transactions={monthTx} onDelete={remove} />
        </div>

        <aside className="col-side">
          <TransactionForm onAdd={add} />
          <p className="fineprint">Your data stays in this browser. Nothing is sent anywhere.</p>
        </aside>
      </main>
    </div>
  );
}
