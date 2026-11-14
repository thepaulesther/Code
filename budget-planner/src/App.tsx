import { useEffect, useMemo, useState } from 'react';
import { BudgetPanel } from './components/BudgetPanel';
import { SpendingDonut, TrendChart } from './components/Charts';
import { ExportDialog } from './components/ExportDialog';
import { ImportDialog } from './components/ImportDialog';
import { RecurringPanel } from './components/RecurringPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { Modal } from './components/Modal';
import { TransactionForm, type RepeatEvery, type SubmitOptions } from './components/TransactionForm';
import { TransactionList } from './components/TransactionList';
import {
  budgetStatus,
  effectiveInMonth,
  formatMoney,
  monthLabel,
  monthOf,
  monthlyTrend,
  newId,
  shareAmount,
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
import { conversionRate, useRates } from './lib/currency';
import { dueOccurrences, materialize, ordinal, resumeRule, type RecurringRule } from './lib/recurring';
import {
  applyRecurring,
  changeBaseCurrency,
  editTransaction,
  hasSamples,
  isEmpty,
  removeSamples,
  stopRule,
  useAppData,
} from './lib/store';
import { CurrencySelect } from './components/CurrencyFields';

const CURRENT_MONTH = monthOf(todayISO());

type DialogName = 'settings' | 'import' | 'export' | null;

export default function App() {
  const [data, setData] = useAppData();
  const { transactions, budgets, recurring, settings } = data;
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToastState] = useState<{ text: string; undo?: () => void } | null>(null);
  const setToast = (text: string | null, undo?: () => void) => setToastState(text ? { text, undo } : null);
  const install = useInstallPrompt();
  const online = useOnline();
  const { status: ratesStatus, refresh: refreshRates } = useRates(data.rates, setData, { online, disabled: IS_ARTIFACT });
  const rateFor = (c: string) => conversionRate(data.rates, c, settings.currency);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToastState(null), toast.undo ? 8000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const prefs = useMemo(
    () => ({ currency: settings.currency, expenseCategories: settings.expenseCategories }),
    [settings.currency, settings.expenseCategories],
  );
  const money = (n: number) => formatMoney(n, settings.currency, { narrow: true });

  // What counts this month: its own transactions plus this month's share of spread payments (yearly rent).
  const monthTx = useMemo(() => effectiveInMonth(transactions, month), [transactions, month]);
  const t = useMemo(() => totals(monthTx), [monthTx]);
  const prev = useMemo(() => totals(effectiveInMonth(transactions, shiftMonth(month, -1))), [transactions, month]);
  const byCategory = useMemo(() => spendingByCategory(monthTx), [monthTx]);
  const trend = useMemo(() => monthlyTrend(transactions, month, 6), [transactions, month]);
  const status = useMemo(() => budgetStatus(monthTx, budgets), [monthTx, budgets]);
  const csv = useMemo(() => (dialog === 'export' ? toCSV(transactions) : ''), [dialog, transactions]);

  const add = (tx: Transaction, repeatEvery: RepeatEvery, { replaceRuleId }: SubmitOptions) => {
    const replaced = replaceRuleId ? data.recurring.find((r) => r.id === replaceRuleId) : undefined;
    const replacedNote = replaced ? ` Stopped the old “${replaced.note || replaced.category}”.` : '';
    const spreadNote = tx.spread
      ? ` It counts as ${money(shareAmount(tx.amount, tx.spread, 0))} a month for ${tx.spread} months.`
      : '';
    if (repeatEvery) {
      const today = todayISO();
      const rule: RecurringRule = {
        id: newId(),
        type: tx.type,
        amount: tx.original ? tx.original.amount : tx.amount,
        ...(tx.original ? { currency: tx.original.currency, rate: tx.original.rate } : {}),
        ...(repeatEvery === 12 ? { everyMonths: 12 } : {}),
        ...(tx.spread ? { spreadMonths: tx.spread } : {}),
        category: tx.category,
        note: tx.note,
        day: Number(tx.date.slice(8, 10)),
        startMonth: monthOf(tx.date),
      };
      const backfilled = dueOccurrences(rule, today).length;
      // Payments added now use the rate just entered; later ones use the latest rate.
      const { created, rules } = materialize([rule], today, () => rule.rate ?? null);
      const before = data;
      setData((d) => {
        const base = replaceRuleId ? stopRule(d, replaceRuleId, false) : d;
        return { ...base, recurring: [...base.recurring, ...rules], transactions: [...base.transactions, ...created] };
      });
      const when = repeatEvery === 12 ? `every year on ${shortDate(tx.date)}` : `on the ${ordinal(rule.day)} of every month`;
      const unit = repeatEvery === 12 ? 'years' : 'months';
      setToast(
        (backfilled === 0
          ? `Scheduled. The first one will be added on ${shortDate(tx.date)}.`
          : backfilled === 1
            ? `Added. It will repeat ${when}.`
            : `Added ${backfilled} ${unit}, starting ${shortDate(tx.date)}. It will keep repeating ${when}.`) +
          spreadNote +
          replacedNote,
        replaced ? () => setData(before) : undefined,
      );
    } else {
      setData((d) => ({ ...d, transactions: [...d.transactions, tx] }));
      if (spreadNote) setToast(`Added.${spreadNote}`);
    }
    setMonth(monthOf(tx.date));
  };

  const remove = (id: string) => setData((d) => ({ ...d, transactions: d.transactions.filter((x) => x.id !== id) }));

  const saveEdit = (tx: Transaction, repeatEvery: RepeatEvery, opts: SubmitOptions) => {
    if (!editingId) return;
    const before = data;
    const wasLinked = data.transactions.find((x) => x.id === editingId)?.recurringId;
    const { data: next, added } = editTransaction(data, editingId, tx, repeatEvery, opts, todayISO());
    setData(next);
    setEditingId(null);
    setMonth(monthOf(tx.date));
    const name = `“${tx.note || tx.category}”`;
    let text = `Saved ${name}.`;
    if (!wasLinked && repeatEvery) {
      const how = repeatEvery === 12 ? `every year on ${shortDate(tx.date)}` : `on the ${ordinal(Number(tx.date.slice(8, 10)))} of every month`;
      text = `${name} now repeats ${how}.` + (added ? ` Added ${added} ${added === 1 ? 'payment' : 'payments'} since then.` : '');
    } else if (wasLinked && !repeatEvery) {
      text = `${name} no longer repeats. Payments already recorded stay.`;
    }
    setToast(text, () => setData(before));
  };
  const editingTx = editingId ? transactions.find((x) => x.id === editingId) : undefined;

  const toggleRule = (id: string) => {
    const today = todayISO();
    setData((d) =>
      applyRecurring(
        { ...d, recurring: d.recurring.map((r) => (r.id !== id ? r : r.paused ? resumeRule(r, today) : { ...r, paused: true })) },
        today,
      ),
    );
  };

  const deleteRule = (id: string, deletePayments: boolean) => {
    const before = data;
    const rule = data.recurring.find((r) => r.id === id);
    const count = data.transactions.filter((x) => x.recurringId === id).length;
    setData((d) => stopRule(d, id, deletePayments));
    const name = `“${rule?.note || rule?.category || 'item'}”`;
    setToast(
      deletePayments ? `Stopped ${name} and deleted ${count} ${count === 1 ? 'payment' : 'payments'}.` : `Stopped ${name}. Its past payments stay.`,
      () => setData(before),
    );
  };

  const removeExamples = () => {
    const before = data;
    const { data: clean, transactions: n, repeating: r } = removeSamples(data);
    setData(clean);
    setToast(`Removed ${n} example transactions and ${r} repeating examples.`, () => setData(before));
  };

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
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDialog('import')}
              disabled={!settings.currency}
              title={settings.currency ? undefined : 'Choose your currency first'}
            >
              Import
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDialog('export')} disabled={!transactions.length}>Export</button>
            <button type="button" className="btn-ghost" onClick={() => setDialog('settings')}>Settings</button>
          </div>
        </header>

        {isEmpty(data) && (
          <section className="welcome" aria-labelledby="welcome-title">
            <h2 id="welcome-title">Your budget is empty. Let’s set it up.</h2>
            <ol>
              <li>
                <span>Choose the currency your totals should be in:</span>
                <CurrencySelect
                  id="welcome-currency"
                  label="Base currency"
                  value={settings.currency}
                  onChange={(c) => setData((d) => changeBaseCurrency(d, c, 'relabel'))}
                />
              </li>
              <li>Add your income and expenses with the <strong>Add transaction</strong> form. Amounts in other currencies are converted.</li>
              <li>
                For bills paid once a year, such as rent, set <strong>Repeats: Every year</strong>. The cost then counts
                as one twelfth in each month.
              </li>
            </ol>
          </section>
        )}

        {hasSamples(data) && (
          <div className="sample-banner" role="note">
            <p>
              <strong>You’re looking at example data.</strong> Items marked <span className="badge example">example</span>{' '}
              (including a monthly rent and salary) are counted in your totals. Remove them once you’ve added your own.
            </p>
            <button type="button" className="btn-primary sm" onClick={removeExamples}>Remove examples</button>
          </div>
        )}

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

            <TransactionList transactions={monthTx} onDelete={remove} onEdit={setEditingId} />
          </div>

          <aside className="col-side">
            <TransactionForm
              expenseCategories={settings.expenseCategories}
              incomeCategories={settings.incomeCategories}
              rates={data.rates}
              ratesStatus={ratesStatus}
              onRefreshRates={refreshRates}
              recurring={recurring}
              onAdd={add}
              onChooseBase={(c) => setData((d) => changeBaseCurrency(d, c, 'relabel'))}
            />
            <RecurringPanel
              rules={recurring}
              rateFor={rateFor}
              paymentCount={(id) => transactions.filter((x) => x.recurringId === id).length}
              onToggle={toggleRule}
              onDelete={deleteRule}
            />
            <p className="fineprint">
              Your data stays in this browser.{!IS_ARTIFACT && ' Only exchange rates are downloaded.'}
            </p>
          </aside>
        </main>

        <SettingsDialog
          open={dialog === 'settings'}
          onClose={() => setDialog(null)}
          data={data}
          setData={setData}
          showInstallHelp={!IS_ARTIFACT}
          ratesStatus={ratesStatus}
          onRefreshRates={refreshRates}
        />
        <ImportDialog
          open={dialog === 'import'}
          onClose={() => setDialog(null)}
          data={data}
          onImport={importTxs}
          ratesStatus={ratesStatus}
          onRefreshRates={refreshRates}
        />
        <Modal open={!!editingTx} onClose={() => setEditingId(null)} title="Edit transaction">
          {editingTx && (
            <TransactionForm
              key={editingTx.id}
              editing={editingTx}
              expenseCategories={settings.expenseCategories}
              incomeCategories={settings.incomeCategories}
              rates={data.rates}
              ratesStatus={ratesStatus}
              onRefreshRates={refreshRates}
              recurring={recurring}
              onAdd={saveEdit}
              onChooseBase={(c) => setData((d) => changeBaseCurrency(d, c, 'relabel'))}
            />
          )}
        </Modal>
        <ExportDialog
          open={dialog === 'export'}
          onClose={() => setDialog(null)}
          csv={csv}
          count={transactions.length}
          canDownload={!IS_ARTIFACT}
        />

        {toast && (
          <div className="toast" role="status">
            {toast.text}
            {toast.undo && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.undo?.();
                  setToastState(null);
                }}
              >
                Undo
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => setToastState(null)} aria-label="Dismiss">×</button>
          </div>
        )}
      </div>
    </PrefsContext.Provider>
  );
}
