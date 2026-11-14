import { useEffect, useMemo, useRef, useState } from 'react';
import { BudgetPanel } from './components/BudgetPanel';
import { SpendingDonut, TrendChart } from './components/Charts';
import { ExportDialog } from './components/ExportDialog';
import { ImportDialog } from './components/ImportDialog';
import { RecurringPanel } from './components/RecurringPanel';
import { SettingsPanel } from './components/SettingsPanel';
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
  type TxType,
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
  addToGoal,
  alertSettingsOf,
  deleteGoal,
  planSettingsOf,
  removeSamples,
  saveGoal,
  stopRule,
  useAppData,
} from './lib/store';
import { CurrencySelect } from './components/CurrencyFields';
import { GoalDialog, GoalsPanel } from './components/GoalsPanel';
import { PlanCard, PlanGlossary } from './components/PlanCard';
import { playAlarm, sendNotification } from './lib/alarm';
import {
  ALERT_RANK,
  alertFor,
  buildPlan,
  goalSaved,
  suggestedEmergencyTarget,
  type Goal,
  type PlanSettings,
} from './lib/plan';
import { hrefFor, navigate, useRoute, type Route } from './lib/route';
import { changeLabel, compareMonths } from './lib/compare';
import { AddFab, Main, MobileTopBar, MoreSheet, Sidebar, TabBar } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Icon } from './components/ui/Icon';
import { MonthSwitcher, PageHeader } from './components/ui/PageHeader';
import { EmptyState } from './components/ui/EmptyState';
import { BalanceHero } from './components/overview/BalanceHero';
import { InsightsCard } from './components/overview/InsightsCard';
import { QuickActions } from './components/overview/QuickActions';
import { OverviewPreview, SetupGuide, type SetupStep } from './components/overview/SetupGuide';
import { useSetupPrefs } from './lib/setup';
import { overviewInsights } from './lib/insights';

const CURRENT_MONTH = monthOf(todayISO());

const PHONE_QUERY = '(max-width: 599px)';
function useIsPhone() {
  const [phone, setPhone] = useState(() => {
    try {
      return window.matchMedia(PHONE_QUERY).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(PHONE_QUERY);
    } catch {
      return;
    }
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const PAGE_TITLES: Record<Route, string> = {
  overview: 'Overview',
  transactions: 'Transactions',
  budgets: 'Budgets',
  savings: 'Savings',
  insights: 'Financial insights',
  plans: 'Financial plan',
  settings: 'Settings',
};

type DialogName = 'import' | 'export' | null;

export default function App() {
  const [data, setData] = useAppData();
  const { transactions, budgets, recurring, settings } = data;
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [dialog, setDialog] = useState<DialogName>(null);
  const route = useRoute();
  const [adding, setAdding] = useState<TxType | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
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
  // Month-on-month changes stop at the same day while the month is still running.
  const comparison = useMemo(() => compareMonths(transactions, month, todayISO()), [transactions, month]);
  const byCategory = useMemo(() => spendingByCategory(monthTx), [monthTx]);
  const trend = useMemo(() => monthlyTrend(transactions, month, 6), [transactions, month]);
  const status = useMemo(() => budgetStatus(monthTx, budgets), [monthTx, budgets]);
  const csv = useMemo(() => (dialog === 'export' ? toCSV(transactions) : ''), [dialog, transactions]);

  // ---- Monthly plan, goals and alerts ----
  const goals = useMemo(() => data.goals ?? [], [data.goals]);
  const planSettings = planSettingsOf(settings);
  const alertSettings = alertSettingsOf(settings);
  const [goalDialog, setGoalDialog] = useState<Goal | 'new' | null>(null);
  const planFor = (m: string) =>
    buildPlan({
      transactions,
      recurring,
      goals,
      month: m,
      today: todayISO(),
      settings: planSettings,
      rateFor: (c) => conversionRate(data.rates, c, settings.currency),
    });
  const plan = planFor(month);
  const currentPlan = month === CURRENT_MONTH ? plan : planFor(CURRENT_MONTH);
  const alert = alertSettings.enabled && settings.currency ? alertFor(plan, money) : null;
  const currentAlert = alertSettings.enabled && settings.currency ? alertFor(currentPlan, money) : null;

  // Sound the alarm (and notify) once each time this month's warning gets worse, not on every render or reload.
  const loggedLevel = data.alertLog?.[CURRENT_MONTH];
  const firstRun = useRef(true);
  useEffect(() => {
    const isFirst = firstRun.current;
    firstRun.current = false;
    if (!currentAlert) {
      // Back on track: forget the alert so it sounds again if spending crosses the line again.
      if (loggedLevel)
        setData((d) => {
          const log = { ...d.alertLog };
          delete log[CURRENT_MONTH];
          return { ...d, alertLog: log };
        });
      return;
    }
    if (loggedLevel && ALERT_RANK[loggedLevel] > ALERT_RANK[currentAlert.level]) {
      // It eased off (e.g. a big expense was deleted): remember the lower level so a new rise sounds again.
      setData((d) => ({ ...d, alertLog: { ...d.alertLog, [CURRENT_MONTH]: currentAlert.level } }));
      return;
    }
    if (loggedLevel === currentAlert.level) return;
    setData((d) => ({ ...d, alertLog: { ...d.alertLog, [CURRENT_MONTH]: currentAlert.level } }));
    if (isFirst) return; // already like this when the app opened: show it, don't sound it
    if (alertSettings.sound) playAlarm(currentAlert.level);
    if (alertSettings.notify) sendNotification(currentAlert.title, currentAlert.detail);
  }, [currentAlert?.level, loggedLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveGoalAndMoney = (g: Goal, savedChange: number) => {
    const isNew = !goals.some((x) => x.id === g.id);
    setData((d) => {
      let next = saveGoal(d, g);
      if (savedChange) next = addToGoal(next, g.id, savedChange, todayISO());
      return next;
    });
    setToast(isNew ? `Added “${g.name}”. It’s now part of your monthly plan.` : `Saved “${g.name}”.`);
  };
  const addMoneyToGoal = (id: string, amount: number) => {
    const before = data;
    const g = goals.find((x) => x.id === id);
    setData((d) => addToGoal(d, id, amount, todayISO()));
    setToast(
      amount > 0 ? `Added ${money(amount)} to “${g?.name}”.` : `Took ${money(-amount)} out of “${g?.name}”.`,
      () => setData(before),
    );
  };
  const removeGoal = (id: string) => {
    const before = data;
    const g = goals.find((x) => x.id === id);
    setData((d) => deleteGoal(d, id));
    setToast(`Deleted “${g?.name}”.`, () => setData(before));
  };
  const setPlanSettings = (patch: Partial<PlanSettings>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, plan: { ...planSettingsOf(d.settings), ...patch } } }));

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
      const before = data;
      setData((d) => ({ ...d, transactions: [...d.transactions, tx] }));
      setToast(
        `Added ${tx.type === 'income' ? '' : '−'}${money(tx.amount)} ${tx.note ? `“${tx.note}”` : tx.category}.${spreadNote}`,
        () => setData(before),
      );
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

  const delta = (key: 'income' | 'expense') => changeLabel(comparison.now[key], comparison.before[key], comparison.partial);

  // Each page starts at the top, moves focus to its heading (for screen readers) and names the tab.
  // Comparing with the previous route (not a "first run" flag) keeps StrictMode's double effect harmless.
  const prevRoute = useRef(route);
  useEffect(() => {
    document.title = route === 'overview' ? 'Elora' : `${PAGE_TITLES[route]} · Elora`;
    if (prevRoute.current === route) return;
    prevRoute.current = route;
    window.scrollTo(0, 0);
    document.getElementById('page-title')?.focus({ preventScroll: true });
  }, [route]);

  // On phones the 6-month chart starts folded; its header still shows the month's figures.
  const isPhone = useIsPhone();
  const [trendOpen, setTrendOpen] = useState(false);


  const setup = useSetupPrefs();
  const chooseBase = (c: string) => setData((d) => changeBaseCurrency(d, c, 'relabel'));
  const seeAll = (r: Route, label = 'See all') => (
    <a className="link-more" href={hrefFor(r)}>
      {label}
      <Icon name="chevron-right" size={16} />
    </a>
  );
  const monthSwitch = <MonthSwitcher month={month} currentMonth={CURRENT_MONTH} onChange={setMonth} />;
  const addButton = (
    <button type="button" className="btn-primary auto desktop-only" onClick={() => setAdding('expense')}>
      <Icon name="plus" size={18} />
      Add transaction
    </button>
  );
  const importButton = (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => setDialog('import')}
      disabled={!settings.currency}
      title={settings.currency ? undefined : 'Choose your currency first'}
    >
      <Icon name="import" size={18} />
      Import
    </button>
  );
  const exportButton = (
    <button type="button" className="btn-secondary" onClick={() => setDialog('export')} disabled={!transactions.length}>
      <Icon name="export" size={18} />
      Export
    </button>
  );

  const hasCurrency = !!settings.currency;
  const setupSteps: SetupStep[] = [
    {
      id: 'currency',
      title: 'Choose your currency',
      detail: 'Totals, budgets and charts use it. You can still enter amounts in other currencies.',
      done: hasCurrency,
      optional: false,
      content: <CurrencySelect id="welcome-currency" label="Base currency" value={settings.currency} onChange={chooseBase} />,
    },
    {
      id: 'income',
      title: 'Add your income',
      detail: 'Your salary or any other money coming in. Set it to repeat if it arrives every month.',
      done: transactions.some((x) => x.type === 'income'),
      optional: true,
      action: { label: 'Add income', onClick: () => setAdding('income'), disabled: !hasCurrency },
    },
    {
      id: 'expense',
      title: 'Record your spending',
      detail: (
        <>
          Start with the big ones: rent, bills, groceries. Rent paid once a year? Choose <strong>Repeats: Every year</strong>{' '}
          and it counts as a twelfth in each month.
        </>
      ),
      done: transactions.some((x) => x.type === 'expense'),
      optional: true,
      action: { label: 'Add expense', onClick: () => setAdding('expense'), disabled: !hasCurrency },
    },
    {
      id: 'budgets',
      title: 'Set monthly budgets',
      detail: 'Pick limits for the categories you want to keep an eye on.',
      done: Object.keys(budgets).length > 0,
      optional: true,
      action: { label: 'Set budgets', onClick: () => navigate('budgets'), disabled: !hasCurrency },
    },
    {
      id: 'goal',
      title: 'Set a savings goal',
      detail: 'An emergency fund of about three months of spending is a good first goal.',
      done: goals.length > 0,
      optional: true,
      action: { label: 'Add a goal', onClick: () => setGoalDialog('new'), disabled: !hasCurrency },
    },
  ];
  const showSetup = !setup.prefs.hidden && !setupSteps.every((x) => x.done);
  const setupGuide = showSetup && (
    <SetupGuide steps={setupSteps} skipped={setup.prefs.skipped} onSkip={setup.skip} onUnskip={setup.unskip} onHide={setup.hide} />
  );

  // On the Overview the quick actions already offer "Add"; the floating button appears once they scroll away.
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const hasAnyTransactions = transactions.length > 0;
  useEffect(() => {
    const el = route === 'overview' ? document.getElementById('quick-actions') : null;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setQuickActionsVisible(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setQuickActionsVisible(e.isIntersecting), { rootMargin: '0px 0px -72px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [route, hasAnyTransactions, showSetup]);

  const sampleBanner = hasSamples(data) && (
    <div className="sample-banner" role="note">
      <p>
        <strong>You’re looking at example data.</strong> Items marked <span className="badge example">example</span>{' '}
        (including a monthly rent and salary) are counted in your totals. Remove them once you’ve added your own.
      </p>
      <button type="button" className="btn-primary sm" onClick={removeExamples}>Remove examples</button>
    </div>
  );

  const alertBanner = alert && (
    <div className={`alert-banner level-${alert.level}`} role="alert">
      <span className="alert-icon"><Icon name="alert" size={20} /></span>
      <div>
        <strong>{alert.title}</strong>
        <p>{alert.detail}</p>
      </div>
    </div>
  );

  const needCurrency = (what: string) => (
    <section className="card">
      <EmptyState
        icon="wallet"
        title="Choose your currency first"
        action={<a className="btn-primary" href={hrefFor('settings')}>Open settings</a>}
      >
        {what} use your base currency. Pick it in Settings or the welcome card on the Overview.
      </EmptyState>
    </section>
  );

  const stats = (
    <section className="stats" aria-label={`${monthLabel(month)} in numbers`}>
      <div className="stat">
        <span className="stat-label">Income</span>
        <span className="stat-value num income">{money(t.income)}</span>
        <span className="stat-sub">{delta('income') ?? ' '}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Spending</span>
        <span className="stat-value num">{money(t.expense)}</span>
        <span className="stat-sub">{delta('expense') ?? ' '}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Net</span>
        <span className={`stat-value num ${t.net < 0 ? 'danger' : ''}`}>{money(t.net)}</span>
        <span className="stat-sub">{t.net >= 0 ? 'left over this month' : 'overspent this month'}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Savings rate</span>
        <span className="stat-value num">{Math.round(t.savingsRate * 100)}%</span>
        <span className="stat-sub">of income kept</span>
      </div>
    </section>
  );

  const insightList = overviewInsights({
    totals: t,
    comparison,
    previousLabel: monthLabel(shiftMonth(month, -1)),
    plan,
    isCurrentMonth: month === CURRENT_MONTH,
    budgets: status,
    byCategory,
    money,
  });
  const selTrend = trend.find((x) => x.month === month);
  const trendHead = (
    <div className="card-head">
      <h2>
        Income and spending
        <span className="card-sub trend-sum">
          {monthLabel(month, 'short')}:{' '}
          <span className="trend-sum-item"><i className="k-income" /> <span className="num">{money(selTrend?.income ?? 0)}</span> in</span>{' '}
          <span className="trend-sum-item"><i className="k-expense" /> <span className="num">{money(selTrend?.expense ?? 0)}</span> out</span>
        </span>
      </h2>
      <span className="card-hint">Last 6 months · select a month</span>
    </div>
  );
  const trendCard = (collapsible = false) =>
    collapsible ? (
      <details
        className="card collapsible"
        open={trendOpen}
        onToggle={(e) => setTrendOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          {trendHead}
          <Icon name="chevron-right" size={18} className="collapse-chev" />
        </summary>
        <TrendChart data={trend} selected={month} onSelect={setMonth} />
      </details>
    ) : (
      <section className="card">
        {trendHead}
        <TrendChart data={trend} selected={month} onSelect={setMonth} />
      </section>
    );

  const donutCard = (
    <section className="card">
      <div className="card-head">
        <h2>
          Where it went
          <span className="card-sub">Spending by category, {monthLabel(month)}</span>
        </h2>
      </div>
      <SpendingDonut data={byCategory} />
    </section>
  );

  const recurringPanel = (
    <RecurringPanel
      rules={recurring}
      rateFor={rateFor}
      paymentCount={(id) => transactions.filter((x) => x.recurringId === id).length}
      onToggle={toggleRule}
      onDelete={deleteRule}
    />
  );

  const txList = (
    <TransactionList
      transactions={monthTx}
      onDelete={remove}
      onEdit={setEditingId}
      title={monthLabel(month)}
      emptyAction={
        <button type="button" className="btn-primary" onClick={() => setAdding('expense')}>
          <Icon name="plus" size={18} /> Add transaction
        </button>
      }
    />
  );

  const page = (() => {
    switch (route) {
      case 'transactions':
        return (
          <>
            <PageHeader
              title="Transactions"
              subtitle={`Everything you’ve recorded for ${monthLabel(month)}, including this month’s share of spread payments.`}
              actions={<>{monthSwitch}{importButton}{exportButton}{addButton}</>}
            />
            {sampleBanner}
            {alertBanner}
            <div className="section-grid">
              <div className="span-8">{txList}</div>
              <div className="span-4 stack">
                {recurringPanel}
                <p className="fineprint">Your data stays in this browser.{!IS_ARTIFACT && ' Only exchange rates are downloaded.'}</p>
              </div>
            </div>
          </>
        );

      case 'budgets':
        return (
          <>
            <PageHeader
              title="Budgets"
              subtitle="Monthly limits by category. Bars turn amber at 80% and red when you go over."
              actions={<>{monthSwitch}{addButton}</>}
            />
            {alertBanner}
            <div className="section-grid">
              <div className="span-7">
                <BudgetPanel
                  status={status}
                  budgets={budgets}
                  categories={settings.expenseCategories}
                  onChange={(b) => setData((d) => ({ ...d, budgets: b }))}
                />
              </div>
              <div className="span-5">{donutCard}</div>
            </div>
          </>
        );

      case 'savings': {
        const totalSaved = goals.reduce((s, g) => s + goalSaved(g), 0);
        const totalTarget = goals.reduce((s, g) => s + g.target, 0);
        const monthlyAside = currentPlan.goalsTotal + currentPlan.emergency;
        return (
          <>
            <PageHeader
              title="Savings"
              subtitle="Your goals, your emergency fund, and how much to put aside each month to reach them."
            />
            {!settings.currency ? (
              needCurrency('Savings goals')
            ) : (
              <>
                {goals.length > 0 && (
                  <section className="summary-tiles" aria-label="Savings summary">
                    <div className="stat lead">
                      <span className="stat-label">Saved so far</span>
                      <span className="stat-value num">{money(totalSaved)}</span>
                      <span className="stat-sub">of {money(totalTarget)} across {goals.length} {goals.length === 1 ? 'goal' : 'goals'}</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Set aside each month</span>
                      <span className="stat-value num">{money(monthlyAside)}</span>
                      <span className="stat-sub">from your monthly plan</span>
                    </div>
                    <div className="stat">
                      <span className="stat-label">Progress</span>
                      <span className="stat-value num">{totalTarget > 0 ? Math.round((goals.reduce((s, g) => s + Math.min(goalSaved(g), g.target), 0) / totalTarget) * 100) : 0}%</span>
                      <span className="stat-sub">of everything you’re saving for</span>
                    </div>
                  </section>
                )}
                <GoalsPanel
                  goals={goals}
                  allocations={currentPlan.goals}
                  emergencyMonthly={currentPlan.emergency}
                  emergencyMonths={planSettings.emergencyMonths}
                  onDialog={setGoalDialog}
                  onDelete={removeGoal}
                  onAddMoney={addMoneyToGoal}
                />
              </>
            )}
          </>
        );
      }

      case 'insights':
        return (
          <>
            <PageHeader
              title="Financial insights"
              subtitle="How your money moved this month and over the last six."
              actions={monthSwitch}
            />
            {alertBanner}
            {stats}
            <div className="section-grid">
              <div className="span-12">
                <InsightsCard insights={insightList} title={`What stands out in ${monthLabel(month)}`} />
              </div>
              <div className="span-7">{trendCard()}</div>
              <div className="span-5">{donutCard}</div>
            </div>
          </>
        );

      case 'plans':
        return (
          <>
            <PageHeader
              title="Financial plan"
              subtitle="How much you can spend while still paying your bills and saving for your goals."
              actions={monthSwitch}
            />
            {alertBanner}
            {!settings.currency ? (
              needCurrency('Plans')
            ) : (
              <div className="section-grid">
                <div className="span-7">
                  <PlanCard
                    plan={plan}
                    month={month}
                    isCurrentMonth={month === CURRENT_MONTH}
                    expectedIncome={planSettings.income}
                    onSetIncome={(income) => setPlanSettings({ income })}
                    onAddGoal={() => setGoalDialog('new')}
                    hasGoals={goals.length > 0}
                  />
                </div>
                <div className="span-5 stack">
                  {recurringPanel}
                  <PlanGlossary />
                </div>
              </div>
            )}
          </>
        );

      case 'settings':
        return (
          <>
            <PageHeader title="Settings" subtitle="Appearance, currency, plan and alerts, categories and your data." />
            <SettingsPanel
              onReset={() => {
                setup.reset();
                navigate('overview');
              }}
              onExport={() => setDialog('export')}
              canExport={transactions.length > 0}
              setupHidden={setup.prefs.hidden}
              onShowSetup={() => {
                setup.show();
                navigate('overview');
              }}
              data={data}
              setData={setData}
              showInstallHelp={!IS_ARTIFACT}
              ratesStatus={ratesStatus}
              onRefreshRates={refreshRates}
            />
          </>
        );

      default:
        return (
          <>
            {/* ---- Overview ---- */}
            <PageHeader
              eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              title={greeting()}
              subtitle={
                !hasAnyTransactions
                  ? 'Let’s set up your budget. It takes a couple of minutes.'
                  : `Here’s where your money stands for ${month === CURRENT_MONTH ? 'this month' : monthLabel(month)}.`
              }
              actions={<>{monthSwitch}{addButton}</>}
            />
            {setupGuide}
            {!hasAnyTransactions ? (
              <>
                {sampleBanner}
                {!showSetup && (
                  <QuickActions
                    onExpense={() => setAdding('expense')}
                    onIncome={() => setAdding('income')}
                    onImport={() => setDialog('import')}
                    onGoal={() => setGoalDialog('new')}
                    hasCurrency={!!settings.currency}
                  />
                )}
                <OverviewPreview />
              </>
            ) : (
              <>
              {sampleBanner}
              {alertBanner}
              <BalanceHero
                month={month}
                isCurrentMonth={month === CURRENT_MONTH}
                totals={t}
                comparison={comparison}
                plan={plan}
                hasData={monthTx.length > 0}
                planHref={hrefFor('plans')}
              />
              <QuickActions
                onExpense={() => setAdding('expense')}
                onIncome={() => setAdding('income')}
                onImport={() => setDialog('import')}
                onGoal={() => setGoalDialog('new')}
                hasCurrency={!!settings.currency}
              />
              <div className="section-grid">
                <div className="span-6">
                  <BudgetPanel
                    summary
                    status={status}
                    budgets={budgets}
                    categories={settings.expenseCategories}
                    onChange={(b) => setData((d) => ({ ...d, budgets: b }))}
                    action={status.length > 0 && seeAll('budgets')}
                    onSetUp={() => navigate('budgets')}
                  />
                </div>
                <div className="span-6">
                  {settings.currency ? (
                    <GoalsPanel
                      summary
                      goals={goals}
                      allocations={currentPlan.goals}
                      emergencyMonthly={currentPlan.emergency}
                      emergencyMonths={planSettings.emergencyMonths}
                      onDialog={setGoalDialog}
                      onDelete={removeGoal}
                      onAddMoney={addMoneyToGoal}
                      action={goals.length > 0 && seeAll('savings', 'Manage')}
                    />
                  ) : (
                    <section className="card">
                      <div className="card-head"><h2>Savings goals</h2></div>
                      <EmptyState icon="savings" title="Goals start with a currency" compact>
                        Choose your base currency in the welcome card, then add a goal.
                      </EmptyState>
                    </section>
                  )}
                </div>
                <div className="span-7">{trendCard(isPhone)}</div>
                <div className="span-5">
                  <TransactionList
                    transactions={monthTx}
                    onDelete={remove}
                    onEdit={setEditingId}
                    recent={5}
                    title="Recent activity"
                    action={monthTx.length > 0 && seeAll('transactions')}
                    emptyAction={
                      <button type="button" className="btn-secondary sm" onClick={() => setAdding('expense')}>
                        <Icon name="plus" size={16} /> Add transaction
                      </button>
                    }
                  />
                </div>
                <div className="span-12">
                  <InsightsCard
                    insights={insightList}
                    action={seeAll('insights', 'More insights')}
                  />
                </div>
              </div>
              </>
            )}
            {/* ---- /Overview ---- */}
          </>
        );
    }
  })();

  return (
    <PrefsContext.Provider value={prefs}>
      <div className="shell">
        <button type="button" className="skip-link" onClick={() => document.getElementById('page-title')?.focus()}>
          Skip to content
        </button>
        <Sidebar route={route} online={online} onInstall={install} />
        <MobileTopBar online={online} />
        <Main>
          <ErrorBoundary resetKey={route}>{page}</ErrorBoundary>
        </Main>
        <TabBar route={route} moreOpen={moreOpen} onMore={() => setMoreOpen(true)} />
        {route !== 'settings' && !quickActionsVisible && <AddFab onClick={() => setAdding('expense')} />}

        <MoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          route={route}
          onImport={() => setDialog('import')}
          onExport={() => setDialog('export')}
          onInstall={install}
          canImport={!!settings.currency}
          canExport={transactions.length > 0}
        />
        <Modal open={adding != null} onClose={() => setAdding(null)} title="Add transaction">
          {adding && (
            <TransactionForm
              key={adding}
              bare
              initialType={adding}
              expenseCategories={settings.expenseCategories}
              incomeCategories={settings.incomeCategories}
              rates={data.rates}
              ratesStatus={ratesStatus}
              onRefreshRates={refreshRates}
              recurring={recurring}
              onAdd={(tx, repeat, opts) => {
                add(tx, repeat, opts);
                setAdding(null);
              }}
              onChooseBase={chooseBase}
            />
          )}
        </Modal>
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
              onChooseBase={chooseBase}
            />
          )}
        </Modal>
        <GoalDialog
          goals={goals}
          open={goalDialog}
          onClose={() => setGoalDialog(null)}
          suggestedEmergency={suggestedEmergencyTarget(transactions, CURRENT_MONTH)}
          onSave={saveGoalAndMoney}
        />
        <ImportDialog
          open={dialog === 'import'}
          onClose={() => setDialog(null)}
          data={data}
          onImport={importTxs}
          ratesStatus={ratesStatus}
          onRefreshRates={refreshRates}
        />
        <ExportDialog
          open={dialog === 'export'}
          onClose={() => setDialog(null)}
          csv={csv}
          count={transactions.length}
          canDownload={!IS_ARTIFACT}
        />

        {toast && (
          <div className="toast" role="status">
            <span>{toast.text}</span>
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
            <button type="button" className="icon-btn" onClick={() => setToastState(null)} aria-label="Dismiss">
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
      </div>
    </PrefsContext.Provider>
  );
}
