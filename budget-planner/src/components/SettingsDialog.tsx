import { useState, type Dispatch, type SetStateAction } from 'react';
import { CURRENCIES, currencyName, formatMoney, type TxType } from '../lib/budget';
import { useFormat } from '../lib/format';
import {
  addCategory,
  categoryNameError,
  deleteCategory,
  emptyData,
  renameCategory,
  type AppData,
  type Theme,
} from '../lib/store';
import { Modal } from './Modal';

type SetData = Dispatch<SetStateAction<AppData>>;

export function SettingsDialog({ open, onClose, data, setData, showInstallHelp }: {
  open: boolean;
  onClose: () => void;
  data: AppData;
  setData: SetData;
  showInstallHelp: boolean;
}) {
  const { settings } = data;
  const [confirmReset, setConfirmReset] = useState(false);
  const setSettings = (patch: Partial<AppData['settings']>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const currencies = CURRENCIES.includes(settings.currency) ? CURRENCIES : [settings.currency, ...CURRENCIES];

  return (
    <Modal open={open} onClose={onClose} title="Settings" wide>
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

        <section className="set-section">
          <h3>Currency</h3>
          <label className="field">
            <select id="set-currency" value={settings.currency} onChange={(e) => setSettings({ currency: e.target.value })}>
              {currencies.map((c) => (
                <option key={c} value={c}>{c} · {currencyName(c)}</option>
              ))}
            </select>
          </label>
          <p className="hint">
            Example: {formatMoney(1234.5, settings.currency)}. This changes how amounts are shown; it doesn’t convert them.
          </p>
        </section>

        <div className="set-cols">
          <CategoryEditor type="expense" title="Expense categories" data={data} setData={setData} />
          <CategoryEditor type="income" title="Income categories" data={data} setData={setData} />
        </div>

        {showInstallHelp && (
          <section className="set-section">
            <h3>Use it like an app</h3>
            <p className="hint">
              Ledgerly works offline once it has loaded. To put it on your home screen: in Chrome or Edge, use{' '}
              <strong>Install app</strong> in the top bar or the browser menu. On iPhone or iPad, tap{' '}
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
              <span>Delete all transactions, budgets and repeating items? This can’t be undone.</span>
              <div className="head-actions">
                <button type="button" className="btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    setData((d) => emptyData(d.settings));
                    setConfirmReset(false);
                    onClose();
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
    </Modal>
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
