import { useId, useMemo, useState, type ReactNode } from 'react';
import { bookBalance, bookName, type Book, type Store } from '../../lib/books';
import { budgetStatus, effectiveInMonth, monthOf, round2, shortDate, totals, type Transaction, type TxType } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import { goalSaved, type Plan } from '../../lib/plan';
import { daysInMonth } from '../../lib/recurring';
import type { AppData } from '../../lib/store';
import { Icon, type IconName } from '../ui/Icon';

/**
 * The Dashboard: the balance with money in and out, payments waiting to be sorted, the money boxes
 * (monthly budgets) as small tiles, and Savings and Financial plan tiles. One book at a time.
 */

const HIDE_KEY = 'elora.hideAmounts';
const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};

/** A line icon for a money box, from its name. */
function boxIcon(category: string): IconName {
  const c = category.toLowerCase();
  const has = (...words: string[]) => words.some((w) => c.includes(w));
  if (has('rent', 'housing', 'home', 'house')) return 'home';
  if (has('grocer', 'market', 'food')) return 'cart';
  if (has('delivery')) return 'box';
  if (has('transport', 'travel', 'fuel')) return 'bus';
  if (has('utilit', 'power', 'electric', 'data', 'internet', 'bill')) return 'power';
  if (has('dining', 'eat', 'restaurant')) return 'food';
  if (has('family', 'gift', 'giving', 'church', 'charity')) return 'heart';
  if (has('health', 'medic', 'emergency', 'insur')) return 'shield';
  if (has('stock', 'inventory', 'supplies')) return 'box';
  if (has('staff', 'wage')) return 'people';
  if (has('tax', 'levy')) return 'receipt';
  if (has('shop', 'equipment')) return 'shop';
  if (has('entertain', 'fun', 'shopping', 'clothes')) return 'tag';
  return 'wallet';
}

interface Props {
  store: Store;
  book: Book;
  view: AppData;
  today: string;
  plan: Plan;
  /** Shown above everything: the setup steps for new users, the example-data note, alerts. */
  top?: ReactNode;
  onAdd: (type: TxType, category?: string) => void;
  /** Open the form for a new money box, or for changing an existing one. */
  onNewBox: () => void;
  onEditBox: (category: string, limit: number) => void;
  /** Business mode: move money between Personal and Business. */
  onPay?: () => void;
  onSort: (id: string, book: Book) => void;
  onSplit: (id: string, businessPart: number) => void;
  seeTransactions: string;
  seeSavings: string;
  seePlan: string;
}

export function Dashboard({ store, book, view, today, plan, top, onAdd, onNewBox, onEditBox, onPay, onSort, onSplit, seeTransactions, seeSavings, seePlan }: Props) {
  const { money } = useFormat();
  const month = monthOf(today);
  const [hidden, setHidden] = useState(readHidden);
  const toggleHidden = () => {
    const next = !hidden;
    try {
      localStorage.setItem(HIDE_KEY, next ? '1' : '0');
    } catch {
      /* the choice just isn't remembered */
    }
    setHidden(next);
  };
  const show = (n: number) => (hidden ? '••••••' : money(n));
  // Small tiles use short amounts (₦18.5K) so they fit four to a row on a phone.
  const short = (n: number) => (hidden ? '••••' : money(n, { compact: true }));

  const monthTx = useMemo(() => effectiveInMonth(view.transactions, month), [view.transactions, month]);
  const t = totals(monthTx);
  const balance = bookBalance(store, book, month);
  // Business: today's sales by how they were paid.
  const byMethod = useMemo(() => {
    const out = { cash: 0, transfer: 0, pos: 0 };
    for (const x of view.transactions) if (x.type === 'income' && x.date === today && x.method) out[x.method] += x.amount;
    return out;
  }, [view.transactions, today]);
  const soldToday = byMethod.cash + byMethod.transfer + byMethod.pos;
  const latest = useMemo(
    () => [...view.transactions].filter((x) => x.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0] as Transaction | undefined,
    [view.transactions, today],
  );

  const daysLeft = Math.max(1, daysInMonth(month) - Number(today.slice(8, 10)) + 1);
  const boxes = useMemo(() => {
    const repeating = new Set(view.recurring.filter((r) => r.type === 'expense' && !r.paused).map((r) => r.category));
    const order = view.settings.expenseCategories;
    return budgetStatus(monthTx, view.budgets)
      .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
      .map((b) => ({ ...b, repeats: repeating.has(b.category), icon: boxIcon(b.category) }));
  }, [monthTx, view.budgets, view.recurring, view.settings.expenseCategories]);
  const [openBox, setOpenBox] = useState<string | null>(null);
  const selected = boxes.find((b) => b.category === openBox);

  const [panel, setPanel] = useState<'savings' | 'plan' | null>(null);
  const goals = view.goals ?? [];
  const saved = round2(goals.reduce((s, g) => s + goalSaved(g), 0));
  const detailId = useId();

  return (
    <div className="dash">
      {top}

      <section className={book === 'business' ? 'dash-balance is-business' : 'dash-balance'} aria-labelledby="dash-balance-label">
        <div className="dash-balance-card">
          <div className="dash-balance-top">
            <button type="button" className="dash-eye" onClick={toggleHidden} aria-pressed={hidden}>
              <span id="dash-balance-label">{book === 'business' ? 'Business balance' : 'Balance'}</span>
              <Icon name={hidden ? 'eye-off' : 'eye'} size={18} />
              <span className="sr-only">{hidden ? ', amounts hidden. Show amounts' : ', hide amounts'}</span>
            </button>
            <span className="dash-balance-actions">
              {onPay && (
                <button type="button" className="dash-add-money" onClick={onPay}>
                  <Icon name="transactions" size={16} />
                  {book === 'business' ? 'Pay yourself' : 'Move money'}
                </button>
              )}
              <button type="button" className="dash-add-money" onClick={() => onAdd('income')}>
                <Icon name="plus" size={16} />
                {book === 'business' ? 'Record sale' : 'Add money'}
              </button>
            </span>
          </div>
          <p className="dash-balance-value num" data-testid="dash-balance">{show(balance)}</p>
          <p className="dash-inout">
            <span><Icon name="arrow-in" size={14} /> In <strong className="num">{show(t.income)}</strong></span>
            <span><Icon name="arrow-out" size={14} /> Out <strong className="num">{show(t.expense)}</strong></span>
          </p>
          {book === 'business' && soldToday > 0 && (
            <p className="dash-today" data-testid="sales-today">
              Today: Cash <strong className="num">{short(byMethod.cash)}</strong> · Transfer <strong className="num">{short(byMethod.transfer)}</strong> · POS{' '}
              <strong className="num">{short(byMethod.pos)}</strong>
            </p>
          )}
        </div>
        <a className="dash-latest" href={seeTransactions}>
          <Icon name="check" size={18} />
          <span className="dash-latest-text">
            {latest ? `${latest.note || latest.category} · ${shortDate(latest.date)}` : 'No payments yet'}
          </span>
          {latest && <span className="num dash-latest-amount">{hidden ? '••••' : `${latest.type === 'income' ? '+' : '−'}${money(latest.amount)}`}</span>}
          <span className="dash-latest-all">All<Icon name="chevron-right" size={16} /></span>
        </a>
      </section>

      {store.unsorted.length > 0 && <Unsorted items={store.unsorted} onSort={onSort} onSplit={onSplit} hidden={hidden} />}

      <section className="card dash-boxes" aria-labelledby="dash-boxes-title">
        <div className="dash-boxes-head">
          <h2 id="dash-boxes-title">{book === 'business' ? 'Business boxes' : 'Money boxes'}</h2>
          <span className="muted small">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
        </div>
        <ul className="dash-grid">
          {boxes.map((b) => {
            const over = b.state === 'over';
            const near = b.state === 'warn';
            return (
              <li key={b.category}>
                <button
                  type="button"
                  className="dash-tile"
                  aria-expanded={openBox === b.category}
                  aria-controls={detailId}
                  onClick={() => setOpenBox(openBox === b.category ? null : b.category)}
                >
                  <span className="dash-tile-icon">
                    <Icon name={b.icon} size={22} />
                    {(over || near) && <span className={over ? 'dash-dot over' : 'dash-dot'} aria-hidden="true" />}
                  </span>
                  <span className="dash-tile-name">{b.category}</span>
                  <span className={over ? 'dash-tile-left num over' : near ? 'dash-tile-left num near' : 'dash-tile-left num'}>
                    {over ? `${short(-b.remaining)} over` : `${short(b.remaining)} left`}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="dash-tile" onClick={onNewBox}>
              <span className="dash-tile-icon is-new"><Icon name="plus" size={22} /></span>
              <span className="dash-tile-name">{boxes.length ? 'New box' : 'Add a box'}</span>
            </button>
          </li>
        </ul>
        {!boxes.length && (
          <p className="muted small dash-empty">Money boxes are your monthly limits: rent, groceries, transport. Add one to see what’s left at a glance.</p>
        )}
        {selected && (
          <div className="dash-detail" id={detailId} role="region" aria-label={`${selected.category} box`}>
            <div className="dash-detail-head">
              <span>
                <strong>{selected.category}</strong>{' '}
                <span className="muted num">{money(selected.spent)} of {money(selected.limit)}</span>
              </span>
              <button type="button" className="icon-btn" aria-label={`Close ${selected.category}`} onClick={() => setOpenBox(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="meter" role="meter" aria-valuenow={Math.round(Math.min(1, selected.ratio) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${selected.category} used`}>
              <div className={`meter-fill ${selected.state}`} style={{ width: `${Math.min(100, selected.ratio * 100)}%` }} />
            </div>
            <dl className="dash-facts">
              <dt>Repeats</dt>
              <dd>{selected.repeats ? 'Yes, a monthly bill is set up' : 'Monthly limit, no repeating bill'}</dd>
              <dt>{selected.remaining < 0 ? 'Over by' : 'Left to spend'}</dt>
              <dd className={selected.remaining < 0 ? 'num over' : 'num'}>{money(Math.abs(selected.remaining))}</dd>
              <dt>About a day</dt>
              <dd className="num">{selected.remaining > 0 ? `${money(round2(selected.remaining / daysLeft))} for ${daysLeft} days` : money(0)}</dd>
            </dl>
            <div className="dash-detail-actions">
              <button type="button" className="btn-primary sm" onClick={() => onAdd('expense', selected.category)}>Add expense</button>
              <button type="button" className="btn-secondary sm" onClick={() => onEditBox(selected.category, selected.limit)}><Icon name="edit" size={16} />Edit</button>
            </div>
          </div>
        )}
      </section>

      <div className="dash-tiles">
        <button type="button" className="dash-summary" aria-expanded={panel === 'savings'} onClick={() => setPanel(panel === 'savings' ? null : 'savings')}>
          <span className="dash-summary-icon savings"><Icon name="savings" size={18} /></span>
          <span className="dash-summary-text"><span>Savings</span><strong className="num savings">{short(saved)}</strong></span>
          <Icon name="chevron-right" size={18} className="chev" />
        </button>
        <button type="button" className="dash-summary" aria-expanded={panel === 'plan'} onClick={() => setPanel(panel === 'plan' ? null : 'plan')}>
          <span className="dash-summary-icon"><Icon name="plans" size={18} /></span>
          <span className="dash-summary-text"><span>Free to spend</span><strong className="num">{short(plan.leftToSpend)}</strong></span>
          <Icon name="chevron-right" size={18} className="chev" />
        </button>
      </div>

      {panel === 'savings' && (
        <section className="card dash-panel" aria-label="Savings">
          {goals.length ? (
            <ul className="dash-goals">
              {goals.map((g) => {
                const have = goalSaved(g);
                const pct = g.target > 0 ? Math.min(100, (have / g.target) * 100) : 0;
                return (
                  <li key={g.id}>
                    <span className="dash-goal-line"><strong>{g.name}</strong><span className="muted num">{show(have)} of {show(g.target)}</span></span>
                    <div className="meter" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} saved`}>
                      <div className="meter-fill goal" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">No savings goals yet.</p>
          )}
          <p className="muted small">Interest on savings is coming later, with a licensed partner bank.</p>
          <a className="link-more" href={seeSavings}>Open Savings<Icon name="chevron-right" size={16} /></a>
        </section>
      )}

      {panel === 'plan' && (
        <section className="card dash-panel" aria-label="Financial plan">
          <p className="muted">From {money(plan.income)} income a month</p>
          <dl className="dash-facts">
            <dt>Bills and repeating costs</dt><dd className="num">{money(plan.fixed)}</dd>
            <dt>Savings goals</dt><dd className="num">{money(plan.goalsTotal)}</dd>
            <dt>Emergency fund</dt><dd className="num">{money(plan.emergency)}</dd>
            <dt>Free to spend this month</dt><dd className="num">{money(plan.free)}</dd>
            <dt>Left of that</dt><dd className="num">{money(plan.leftToSpend)}</dd>
          </dl>
          <a className="link-more" href={seePlan}>Open the plan<Icon name="chevron-right" size={16} /></a>
        </section>
      )}
    </div>
  );
}

/** Payments waiting to be placed in Personal or Business, each with one tap, or split. */
function Unsorted({ items, onSort, onSplit, hidden }: {
  items: Transaction[];
  onSort: (id: string, book: Book) => void;
  onSplit: (id: string, businessPart: number) => void;
  hidden: boolean;
}) {
  const { money } = useFormat();
  const [open, setOpen] = useState(true);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [share, setShare] = useState(50);
  const listId = useId();
  return (
    <section className="dash-unsorted" aria-label="Payments to sort">
      <button type="button" className="dash-unsorted-head" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <span className="dash-summary-icon warn"><Icon name="inbox" size={18} /></span>
        <span className="dash-summary-text">
          <strong>{items.length} {items.length === 1 ? 'payment' : 'payments'} to sort</strong>
          <span>Personal or business? Tap to sort.</span>
        </span>
        <Icon name="chevron-right" size={18} className="chev" />
      </button>
      {open && (
        <ul id={listId} className="dash-unsorted-list">
          {items.map((u) => {
            const isSplitting = splitting === u.id;
            const biz = round2((u.amount * share) / 100);
            const personal = round2(u.amount - biz);
            const label = u.note || u.category;
            return (
              <li key={u.id}>
                <div className="dash-unsorted-line">
                  <span><strong>{label}</strong><span className="muted"> · {shortDate(u.date)}</span></span>
                  <span className={u.type === 'income' ? 'num in' : 'num'}>{hidden ? '••••' : `${u.type === 'income' ? '+' : '−'}${money(u.amount)}`}</span>
                </div>
                <div className="dash-unsorted-actions">
                  {(['personal', 'business'] as const).map((b) => (
                    <button key={b} type="button" className="btn-secondary sm" onClick={() => onSort(u.id, b)} aria-label={`${label}: ${bookName(b)}`}>
                      {bookName(b)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={isSplitting ? 'btn-secondary sm is-on' : 'btn-secondary sm'}
                    aria-expanded={isSplitting}
                    aria-label={`${label}: split between both`}
                    onClick={() => {
                      setShare(50);
                      setSplitting(isSplitting ? null : u.id);
                    }}
                  >
                    <Icon name="split" size={16} />Split
                  </button>
                </div>
                {isSplitting && (
                  <div className="dash-split">
                    <div className="dash-split-parts">
                      <span className="business">Business · {share}%<strong className="num">{money(biz)}</strong></span>
                      <span>Personal · {100 - share}%<strong className="num">{money(personal)}</strong></span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      step={5}
                      value={share}
                      onChange={(e) => setShare(Number(e.target.value))}
                      aria-label={`Business share of ${label}`}
                      aria-valuetext={`${money(biz)} business, ${money(personal)} personal`}
                    />
                    <button
                      type="button"
                      className="btn-primary sm"
                      onClick={() => {
                        onSplit(u.id, biz);
                        setSplitting(null);
                      }}
                    >
                      Save split
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
