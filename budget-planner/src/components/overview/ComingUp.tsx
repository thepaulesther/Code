import type { CSSProperties, ReactNode } from 'react';
import { shortDate, type Transaction } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import { dueLabel, upcomingTotals, type Upcoming, type UpcomingItem } from '../../lib/upcoming';
import { Icon } from '../ui/Icon';

/**
 * Repeating bills and income on their way: the rest of this month, and early next month near the end
 * of one. They're added automatically on their date; until then they aren't in the transaction list or
 * the balance, so this shows what's coming. Totals cover this month only, matching "Still to pay".
 */
export function ComingUp({ upcoming: u, today, onAddRepeating, manageHref }: {
  upcoming: Upcoming;
  today: string;
  /** Offered when there are no repeating items yet. */
  onAddRepeating?: () => void;
  /** Where paused items can be managed; left out where they're already on the page. */
  manageHref?: string;
}) {
  const { money } = useFormat();
  const totals = upcomingTotals(u.thisMonth);
  const nothingAhead = u.thisMonth.length === 0 && u.nextMonth.length === 0;
  return (
    <section className="card coming-up" aria-labelledby="coming-up-title">
      <div className="card-head">
        <h2 id="coming-up-title">
          Coming up
          {(totals.out > 0 || totals.in > 0) && (
            <span className="card-sub">
              This month: {totals.out > 0 && <>{money(totals.out)} to pay</>}
              {totals.out > 0 && totals.in > 0 && ' · '}
              {totals.in > 0 && <>{money(totals.in)} to come in</>}
            </span>
          )}
        </h2>
      </div>

      {!u.hasRules ? (
        <div className="coming-up-empty">
          <p>Set rent, bills and salary to repeat, and they’ll show here before they’re due.</p>
          {onAddRepeating && (
            <button type="button" className="btn-secondary sm" onClick={onAddRepeating}>
              <Icon name="repeat" size={16} /> Add a repeating bill
            </button>
          )}
        </div>
      ) : (
        <>
          {u.addedToday.length > 0 && (
            <Group label="Added today">
              {u.addedToday.map((t) => <AddedRow key={t.id} tx={t} />)}
            </Group>
          )}
          {u.thisMonth.length > 0 && (
            <Group label="Later this month">
              {u.thisMonth.map((i) => <ItemRow key={i.rule.id} item={i} today={today} />)}
            </Group>
          )}
          {u.thisMonth.length === 0 && (
            <p className="coming-up-none">
              <Icon name="check" size={16} /> Nothing else due this month.
            </p>
          )}
          {u.nextMonth.length > 0 && (
            <Group label="Early next month">
              {u.nextMonth.map((i) => <ItemRow key={i.rule.id} item={i} today={today} />)}
            </Group>
          )}
        </>
      )}

      {u.paused > 0 && (
        <p className="hint">
          {u.paused} paused {u.paused === 1 ? 'item isn’t' : 'items aren’t'} included.
          {manageHref && <> <a href={manageHref}>Manage repeating items</a></>}
        </p>
      )}
      {u.hasRules && !nothingAhead && (
        <p className="hint">
          Added to your transactions automatically on the day. Until then they aren’t in your balance, but your plan
          already sets this month’s bills aside.
        </p>
      )}
    </section>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="coming-up-group">
      <h3 className="group-label">{label}</h3>
      <ul className="rows compact">{children}</ul>
    </div>
  );
}

function ItemRow({ item: i, today }: { item: UpcomingItem; today: string }) {
  const { money, color } = useFormat();
  const when = dueLabel(i.date, today);
  return (
    <li>
      <span
        className="tx-avatar"
        style={{ '--cat': i.rule.type === 'income' ? 'var(--income)' : color(i.rule.category) } as CSSProperties}
        aria-hidden
      >
        <Icon name="repeat" size={17} />
      </span>
      <div className="row-main">
        <span className="row-title">{i.rule.note || i.rule.category}</span>
        <span className="row-sub">
          {i.rule.category} · <time dateTime={i.date}>{when === shortDate(i.date) ? when : `${when}, ${shortDate(i.date)}`}</time>
        </span>
      </div>
      <span className={`num row-amt ${i.rule.type}`}>
        {i.rule.type === 'income' ? '+' : '−'}
        {money(i.amount)}
      </span>
    </li>
  );
}

function AddedRow({ tx }: { tx: Transaction }) {
  const { money } = useFormat();
  return (
    <li>
      <span className="tx-avatar done" aria-hidden><Icon name="check" size={17} /></span>
      <div className="row-main">
        <span className="row-title">{tx.note || tx.category}</span>
        <span className="row-sub">{tx.category} · added to your transactions</span>
      </div>
      <span className={`num row-amt ${tx.type}`}>
        {tx.type === 'income' ? '+' : '−'}
        {money(tx.amount)}
      </span>
    </li>
  );
}
