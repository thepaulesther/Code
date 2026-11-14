import type { ReactNode } from 'react';
import type { Insight } from '../../lib/insights';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';

export function InsightsCard({ insights, action, title = 'Insights' }: { insights: Insight[]; action?: ReactNode; title?: string }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {action}
      </div>
      {insights.length === 0 ? (
        <EmptyState icon="bulb" title="Nothing to point out yet" compact>
          Insights appear here as you add income, spending and budgets.
        </EmptyState>
      ) : (
        <ul className="insight-list">
          {insights.map((i) => (
            <li key={i.id} className={`tone-${i.tone}`}>
              <span className="insight-icon"><Icon name={i.icon} size={18} /></span>
              <div>
                <strong>{i.title}</strong>
                <p>{i.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
