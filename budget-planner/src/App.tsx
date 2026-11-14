import { useEffect, useMemo, useState } from 'react';
import { BudgetPanel } from './components/BudgetPanel';
import { SpendingDonut, TrendChart } from './components/Charts';
import { ExportDialog } from './components/ExportDialog';
import { ImportDialog } from './components/ImportDialog';
import { RecurringPanel } from './components/RecurringPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { TransactionForm } from './components/TransactionForm';
import { TransactionList } from './components/TransactionList';
import {
  budgetStatus,
  formatMoney,
  inMonth,
  monthLabel,
  monthOf,
  monthlyTrend,
  newId,
  shiftMonth,
  shortDate,
  spendingByCategory,
  toCSV,
  todayISO,
  totals,
  type Transaction,
} from './lib/budget';
import { PrefsContext } from './lib/format';
import { IS_ARTIFACT, useInstallPrompt, useOnline } from './lib/pwa';
import { dueOccurrences, ordinal, resumeRule, type RecurringRule } from './lib/recurring';
import { applyRecurring, useAppData } from './lib/store';

const CURRENT_MONTH = monthOf(todayISO());

type DialogName = 'settings' | 'import' | 'export' | null;

export default function App() {
  const [data, setData] = useAppData();
  const { transactions, budgets, recurring, settings } = data;
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, setToast] = useState<string | null>(null);
  const install = useInstallPrompt();
  const online = useOnline();

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const prefs = useMemo(
    () => ({ currency: settings.currency, expenseCategories: settings.expenseCategories }),
    [settings.currency, settings.expenseCategories],
  );
  const money = (n: number) => formatMoney(n, settings.currency);

  const monthTx = useMemo(() => inMonth(transactions, month), [transactions, month]);
  const t = useMemo(() => totals(monthTx), [monthTx]);
  const prev = useMemo(() => totals(inMonth(transactions, shiftMonth(month, -1))), [transactions, month]);
  const byCategory = useMemo(() => spendingByCategory(monthTx), [monthTx]);
  const trend = useMemo(() => monthlyTrend(transactions, month, 6), [transactions, month]);
  const status = useMemo(() => budgetStatus(monthTx, budgets), [monthTx, budgets]);
  const csv = useMemo(() => (dialog === 'export' ? toCSV(transactions) : ''), [dialog, transactions]);

  const add = (tx: Transaction, repeatMonthly: boolean) => {
    if (repeatMonthly) {
      const today = todayISO();
      const rule: RecurringRule = {
        id: newId(),
        type: tx.type,
        amount: tx.amount,
        category: tx.category,
        note: tx.note,
        day: Number(tx.date.slice(8, 10)),
        startMonth: monthOf(tx.date),
      };
      const backfilled = dueOccurrences(rule, today).length;
      setData((d) => applyRecurring({ ...d, recurring: [...d.recurring, rule] }, today));
      setToast(
        backfilled === 0
          ? `Scheduled. The first one will be added on ${shortDate(tx.date)}.`
          : backfilled === 1
            ? `Added. It will repeat on the ${ordinal(rule.day)} of every month.`
            : `Added ${backfilled} months, starting ${shortDate(tx.date)}. It will keep repeating on the ${ordinal(rule.day)}.`,
      );
    } else {
      setData((d) => ({ ...d, transactions: [...d.transactions, tx] }));
    }
    setMonth(monthOf(tx.date));
  };

  const remove = (id: string) => setData((d) => ({ ...d, transactions: d.transactions.filter((x) => x.id !== id) }));

  const toggleRule = (id: string) => {
    const today = todayISO();
    setData((d) =>
      applyRecurring(
        { ...d, recurring: d.recurring.map((r) => (r.id !== id ? r : r.paused ? resumeRule(r, today) : { ...r, paused: true })) },
        today,
      ),
    );
  };

  const deleteRule = (id: string) =>
    setData((d) => ({
      ...d,
      recurring: d.recurring.filter((r) => r.id !== id),
      transactions: d.transactions.map((tx) => (tx.recurringId === id ? { ...tx, recurringId: undefined } : tx)),
    }));

  const importTxs = (txs: Transaction[]) => {
    setData((d) => ({ ...d, transactions: [...d.transactions, ...txs] }));
    const latest = txs.reduce((m, x) => (x.date > m ? x.date : m), '');
    if (latest) setMonth(monthOf(latest));
    setDialog(null);
    setToast(`Imported ${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}.`);
  };

  const delta = (now: number, before: number) => {
    if (before === 0) return null;
    const pct = ((now - before) / before) * 100;
    return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% vs last month`;
  };

  return (
    <PrefsContext.Provider value={prefs}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <svg className="logo" viewBox="0 0 32 32" aria-hidden>
              <circle cx="16" cy="16" r="13" fill="var(--accent)" />
              <path d="M16 3a13 13 0 0 1 0 26z" fill="var(--income)" />
            </svg>
            <h1>Ledgerly</h1>
            {!online && <span className="pill offline">Offline</span>}
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
            {install && <button type="button" className="btn-ghost accent" onClick={install}>Install app</button>}
            <button type="button" className="btn-ghost" onClick={() => setDialog('import')}>Import</button>
            <button type="button" className="btn-ghost" onClick={() => setDialog('export')} disabled={!transactions.length}>Export</button>
            <button type="button" className="btn-ghost" onClick={() => setDialog('settings')}>Settings</button>
          </div>
        </header>

        <section className="stats">
          <div className="stat">
            <span className="stat-label">Income</span>
            <span className="stat-value num income">{money(t.income)}</span>
            <span className="stat-sub">{delta(t.income, prev.income) ?? ' '}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Expenses</span>
            <span className="stat-value num expense">{money(t.expense)}</span>
            <span className="stat-sub">{delta(t.expense, prev.expense) ?? ' '}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Net</span>
            <span className={`stat-value num ${t.net < 0 ? 'expense' : ''}`}>{money(t.net)}</span>
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
              <BudgetPanel
                status={status}
                budgets={budgets}
                categories={settings.expenseCategories}
                onChange={(b) => setData((d) => ({ ...d, budgets: b }))}
              />
            </div>

            <TransactionList transactions={monthTx} onDelete={remove} />
          </div>

          <aside className="col-side">
            <TransactionForm
              expenseCategories={settings.expenseCategories}
              incomeCategories={settings.incomeCategories}
              onAdd={add}
            />
            <RecurringPanel rules={recurring} onToggle={toggleRule} onDelete={deleteRule} />
            <p className="fineprint">Your data stays in this browser. Nothing is sent anywhere.</p>
          </aside>
        </main>

        <SettingsDialog
          open={dialog === 'settings'}
          onClose={() => setDialog(null)}
          data={data}
          setData={setData}
          showInstallHelp={!IS_ARTIFACT}
        />
        <ImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} data={data} onImport={importTxs} />
        <ExportDialog
          open={dialog === 'export'}
          onClose={() => setDialog(null)}
          csv={csv}
          count={transactions.length}
          canDownload={!IS_ARTIFACT}
        />

        {toast && (
          <div className="toast" role="status">
            {toast}
            <button type="button" className="icon-btn" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
          </div>
        )}
      </div>
    </PrefsContext.Provider>
  );
}
