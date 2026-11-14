import { useState, type Dispatch, type SetStateAction } from 'react';
import { currencyName, formatMoney, shortDate, type TxType } from '../lib/budget';
import { conversionRate, parseRate, rateForInput, type RateCache, type RatesStatus } from '../lib/currency';
import { useFormat } from '../lib/format';
import { notificationPermission, playAlarm, requestNotifications, type NotifyPermission } from '../lib/alarm';
import {
  addCategory,
  alertSettingsOf,
  planSettingsOf,
  categoryNameError,
  changeBaseCurrency,
  deleteCategory,
  emptyData,
  renameCategory,
  type AppData,
  type Theme,
} from '../lib/store';
import { CurrencySelect, RateField } from './CurrencyFields';

type SetData = Dispatch<SetStateAction<AppData>>;

function PlanAndAlerts({ data, setData }: { data: AppData; setData: SetData }) {
  const plan = planSettingsOf(data.settings);
  const alerts = alertSettingsOf(data.settings);
  const [permission, setPermission] = useState<NotifyPermission>(notificationPermission());
  const setPlan = (patch: Partial<typeof plan>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, plan: { ...planSettingsOf(d.settings), ...patch } } }));
  const setAlerts = (patch: Partial<typeof alerts>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, alerts: { ...alertSettingsOf(d.settings), ...patch } } }));

  const toggleNotify = async (on: boolean) => {
    if (on && permission !== 'granted') {
      const p = await requestNotifications();
      setPermission(p);
      if (p !== 'granted') return;
    }
    setAlerts({ notify: on });
  };

  return (
    <section className="set-section">
      <h3>Plan and alerts</h3>
      <div className="field-row">
        <label className="field">
          <span>Save for goals without a date</span>
          <select id="set-savings-rate" value={plan.savingsRate} onChange={(e) => setPlan({ savingsRate: Number(e.target.value) })}>
            {[0.1, 0.15, 0.2, 0.25, 0.3, 0.4].map((r) => (
              <option key={r} value={r}>{Math.round(r * 100)}% of income</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Build the emergency fund over</span>
          <select id="set-emergency-months" value={plan.emergencyMonths} onChange={(e) => setPlan({ emergencyMonths: Number(e.target.value) })}>
            {[6, 12, 18, 24].map((m) => (
              <option key={m} value={m}>{m} months</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        Goals with a date get exactly what they need each month. Income comes from your 3-month average unless you set
        an expected income on the Monthly plan.
      </p>

      <label className="check">
        <input id="set-alerts" type="checkbox" checked={alerts.enabled} onChange={(e) => setAlerts({ enabled: e.target.checked })} />
        <span>
          Warn me about overspending
          <small>When spending passes your income, or the money your plan leaves free to spend (and at 90% of it).</small>
        </span>
      </label>
      <label className="check">
        <input id="set-alert-sound" type="checkbox" disabled={!alerts.enabled} checked={alerts.sound} onChange={(e) => setAlerts({ sound: e.target.checked })} />
        <span>
          Play an alarm sound
          <small>Once, when a new warning appears after you add or change something.</small>
        </span>
      </label>
      <label className="check">
        <input
          id="set-alert-notify"
          type="checkbox"
          disabled={!alerts.enabled || permission === 'unsupported' || permission === 'denied'}
          checked={alerts.notify && permission === 'granted'}
          onChange={(e) => void toggleNotify(e.target.checked)}
        />
        <span>
          Send a notification to this device
          <small>
            {permission === 'unsupported'
              ? 'Notifications aren’t available here. Install the app or open it in a browser to use them.'
              : permission === 'denied'
                ? 'Notifications are blocked for this site. Allow them in your browser’s site settings.'
                : 'Shows up like a message, even when the app isn’t on screen.'}
          </small>
        </span>
      </label>
      <button type="button" className="btn-secondary sm" style={{ alignSelf: 'flex-start' }} disabled={!alerts.enabled} onClick={() => playAlarm('over-plan')}>
        Test the alarm sound
      </button>
    </section>
  );
}

function BaseCurrency({ data, setData, rates, ratesStatus, onRefreshRates }: {
  data: AppData;
  setData: SetData;
  rates?: RateCache;
  ratesStatus: RatesStatus;
  onRefreshRates: (() => void) | null;
}) {
  const base = data.settings.currency;
  const [pending, setPending] = useState<string | null>(null);
  const [mode, setMode] = useState<'convert' | 'relabel'>('convert');
  const [rateText, setRateText] = useState<string | null>(null);

  const counts = {
    transactions: data.transactions.length,
    budgets: Object.keys(data.budgets).length,
    repeating: data.recurring.length,
  };
  const hasData = counts.transactions + counts.budgets + counts.repeating > 0;
  const suggested = pending ? conversionRate(rates, base, pending) : null;
  const shownRate = rateText ?? (suggested ? rateForInput(suggested) : '');
  const rate = parseRate(shownRate);

  const choose = (c: string) => {
    setRateText(null);
    if (c === base) return setPending(null);
    // Nothing to convert (no data yet, or no currency before): just set it.
    if (!hasData || !base) {
      setData((d) => changeBaseCurrency(d, c, 'relabel'));
      return setPending(null);
    }
    setPending(c);
  };

  const apply = () => {
    if (!pending || (mode === 'convert' && !rate)) return;
    const target = pending;
    setData((d) => changeBaseCurrency(d, target, mode, rate ?? 1));
    setPending(null);
  };

  const list = [
    counts.transactions && `${counts.transactions} transactions`,
    counts.budgets && `${counts.budgets} budgets`,
    counts.repeating && `${counts.repeating} repeating items`,
  ].filter(Boolean).join(', ');

  return (
    <section className="set-section">
      <h3>Base currency</h3>
      <label className="field">
        <CurrencySelect id="set-currency" value={pending ?? base} onChange={choose} label="Base currency" />
      </label>
      {pending ?? base ? (
        <p className="hint">
          Totals, budgets and charts are in this currency ({formatMoney(1234.5, pending ?? base, { narrow: true })}). You can still enter
          amounts in any currency, such as a salary paid in dollars; they’re converted to {currencyName(pending ?? base)} when added.
        </p>
      ) : (
        <p className="hint">No currency chosen yet. Pick the one your totals should be in before adding transactions.</p>
      )}

      {pending && (
        <div className="switch-panel" role="group" aria-label={`Switch to ${pending}`}>
          <p>
            Your {list} are in <strong>{base}</strong>. What should happen to them?
          </p>
          <label className="check">
            <input type="radio" name="switch-mode" checked={mode === 'convert'} onChange={() => setMode('convert')} />
            <span>
              Convert them to {pending}
              <small>Amounts are multiplied by the rate below. Each one remembers its {base} value. Repeating items stay in {base} and convert every month.</small>
            </span>
          </label>
          {mode === 'convert' && (
            <RateField
              id="switch-rate"
              from={base}
              to={pending}
              value={shownRate}
              onChange={setRateText}
              suggested={suggested}
              rates={rates}
              status={ratesStatus}
              onRefresh={onRefreshRates}
            />
          )}
          <label className="check">
            <input type="radio" name="switch-mode" checked={mode === 'relabel'} onChange={() => setMode('relabel')} />
            <span>
              Keep the numbers, just show them in {pending}
              <small>Choose this if you’ve actually been entering amounts in {pending}.</small>
            </span>
          </label>
          <div className="head-actions">
            <button type="button" className="btn-ghost" onClick={() => setPending(null)}>Cancel</button>
            <button type="button" className="btn-primary sm" disabled={mode === 'convert' && !rate} onClick={apply}>
              Switch to {pending}
            </button>
          </div>
        </div>
      )}

      <p className="hint">
        {ratesStatus === 'unavailable'
          ? 'Live exchange rates aren’t available in this view; you’ll be asked for a rate when you need one.'
          : rates
            ? <>Exchange rates from {rates.source === 'ExchangeRate-API' ? <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a> : rates.source}, updated {shortDate(rates.date)}. </>
            : ratesStatus === 'loading'
              ? 'Getting exchange rates… '
              : 'No exchange rates downloaded yet. '}
        {onRefreshRates && ratesStatus !== 'loading' && (
          <button type="button" className="link-btn" onClick={onRefreshRates}>Refresh rates</button>
        )}
      </p>
    </section>
  );
}

/** The Settings page. */
export function SettingsPanel({ onReset, data, setData, showInstallHelp, ratesStatus, onRefreshRates }: {
  /** Called after "Delete all data". */
  onReset: () => void;
  data: AppData;
  setData: SetData;
  showInstallHelp: boolean;
  ratesStatus: RatesStatus;
  onRefreshRates: (() => void) | null;
}) {
  const { settings, rates } = data;
  const [confirmReset, setConfirmReset] = useState(false);
  const setSettings = (patch: Partial<AppData['settings']>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  return (
    <div className="settings">
      <section className="set-section">
        <h3>Appearance</h3>
        <div className="segmented three" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={settings.theme === t}
              className={settings.theme === t ? 'is-on' : ''}
              onClick={() => setSettings({ theme: t })}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <BaseCurrency data={data} setData={setData} rates={rates} ratesStatus={ratesStatus} onRefreshRates={onRefreshRates} />

      <PlanAndAlerts data={data} setData={setData} />

      <div className="set-cols">
        <CategoryEditor type="expense" title="Expense categories" data={data} setData={setData} />
        <CategoryEditor type="income" title="Income categories" data={data} setData={setData} />
      </div>

      {showInstallHelp && (
        <section className="set-section">
          <h3>Use it like an app</h3>
          <p className="hint">
            Elora works offline once it has loaded. To put it on your home screen: in Chrome or Edge, use{' '}
            <strong>Install app</strong> in the sidebar or the browser menu. On iPhone or iPad, tap{' '}
            <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.
          </p>
        </section>
      )}

      <section className="set-section">
        <h3>Your data</h3>
        <p className="hint">
          Everything is stored in this browser only: {data.transactions.length} transactions,{' '}
          {data.recurring.length} repeating items. Use Export to back it up or move it to another device.
        </p>
        {confirmReset ? (
          <div className="confirm-row" role="alert">
            <span>Delete all transactions, budgets, goals and repeating items? This can’t be undone.</span>
            <div className="head-actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  setData((d) => emptyData(d.settings));
                  setConfirmReset(false);
                  onReset();
                }}
              >
                Delete everything
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-ghost danger" onClick={() => setConfirmReset(true)}>
            Delete all data…
          </button>
        )}
      </section>
    </div>
  );
}

function CategoryEditor({ type, title, data, setData }: {
  type: TxType;
  title: string;
  data: AppData;
  setData: SetData;
}) {
  const { color } = useFormat();
  const list = type === 'expense' ? data.settings.expenseCategories : data.settings.incomeCategories;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const usage = (c: string) => data.transactions.filter((t) => t.type === type && t.category === c).length;

  const add = () => {
    const err = categoryNameError(list, newName);
    if (err) return setError(err);
    setData((d) => addCategory(d, type, newName));
    setNewName('');
    setError('');
  };

  const saveRename = (from: string) => {
    if (draft.trim() === from) return setEditing(null);
    const err = categoryNameError(list, draft, from);
    if (err) return setError(err);
    setData((d) => renameCategory(d, type, from, draft));
    setEditing(null);
    setError('');
  };

  return (
    <section className="set-section">
      <h3>{title}</h3>
      <ul className="cat-list">
        {list.map((c) => (
          <li key={c}>
            <span className="swatch" style={{ background: type === 'income' ? 'var(--income)' : color(c) }} />
            {editing === c ? (
              <form className="cat-edit" onSubmit={(e) => { e.preventDefault(); saveRename(c); }}>
                <input
                  id={`rename-${type}-${c}`}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), e.preventDefault(), setEditing(null))}
                  aria-label={`New name for ${c}`}
                  maxLength={24}
                />
                <button type="submit" className="btn-ghost">Save</button>
              </form>
            ) : confirmDelete === c ? (
              <div className="cat-confirm">
                <span>Remove “{c}”?{usage(c) > 0 && ` Its ${usage(c)} transactions keep the label.`}</span>
                <button type="button" className="btn-ghost danger-solid" onClick={() => { setData((d) => deleteCategory(d, type, c)); setConfirmDelete(null); }}>
                  Remove
                </button>
                <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
              </div>
            ) : (
              <>
                <span className="cat-name">{c}</span>
                <span className="cat-count muted num">{usage(c) || ''}</span>
                <button type="button" className="btn-ghost sm" onClick={() => { setEditing(c); setDraft(c); setError(''); }}>
                  Rename
                </button>
                <button
                  type="button"
                  className="btn-ghost sm"
                  disabled={list.length <= 1}
                  onClick={() => setConfirmDelete(c)}
                  aria-label={`Remove ${c}`}
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="cat-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input
          id={`add-${type}-category`}
          placeholder={type === 'expense' ? 'e.g. Pets' : 'e.g. Dividends'}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={24}
          aria-label={`New ${type} category`}
        />
        <button type="submit" className="btn-ghost">Add</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
