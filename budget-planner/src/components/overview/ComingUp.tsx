import type { CSSProperties } from 'react';
import { shortDate } from '../../lib/budget';
import { useFormat } from '../../lib/format';
import type { UpcomingItem } from '../../lib/reconcile';
import { Icon } from '../ui/Icon';

/**
 * Repeating bills and income still due this month. They're added automatically on their date; until
 * then they aren't in the transaction list or the balance, so this shows what's on its way.
 */
export function ComingUp({ items }: { items: UpcomingItem[] }) {
  const { money, color } = useFormat();
  const out = items.filter((i) => i.rule.type === 'expense').reduce((s, i) => s + i.amount, 0);
  const inc = items.filter((i) => i.rule.type === 'income').reduce((s, i) => s + i.amount, 0);
  return (
    <section className="card coming-up">
      <div className="card-head">
        <h2>
          Coming up this month
          <span className="card-sub">
            {out > 0 && <>{money(out)} to pay</>}
            {out > 0 && inc > 0 && ' · '}
            {inc > 0 && <>{money(inc)} to come in</>}
          </span>
        </h2>
      </div>
      <ul className="rows compact">
        {items.map((i) => (
          <li key={i.rule.id}>
            <span
              className="tx-avatar"
              style={{ '--cat': i.rule.type === 'income' ? 'var(--income)' : color(i.rule.category) } as CSSProperties}
              aria-hidden
            >
              <Icon name="repeat" size={17} />
            </span>
            <div className="row-main">
              <span className="row-title">{i.rule.note || i.rule.category}</span>
              <span className="row-sub">{i.rule.category} · {shortDate(i.date)}</span>
            </div>
            <span className={`num row-amt ${i.rule.type}`}>
              {i.rule.type === 'income' ? '+' : '−'}
              {money(i.amount)}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        Added to your transactions automatically on the day. Until then they aren’t in your balance, but your plan
        already sets bills aside.
      </p>
    </section>
  );
}
