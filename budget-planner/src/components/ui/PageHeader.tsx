import type { ReactNode } from 'react';
import { monthLabel, shiftMonth } from '../../lib/budget';
import { Icon } from './Icon';

/** The heading block at the top of every page: optional eyebrow, title, subtitle and actions. */
export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1 className="page-title" id="page-title" tabIndex={-1}>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** ‹ November 2026 › with a "Today" shortcut when away from the current month. */
export function MonthSwitcher({ month, currentMonth, onChange }: {
  month: string;
  currentMonth: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="month-switch" role="group" aria-label="Month">
      <button type="button" className="icon-btn" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        <Icon name="chevron-left" size={18} />
      </button>
      <span className="month-name" aria-live="polite">{monthLabel(month)}</span>
      {month !== currentMonth && (
        <button type="button" className="btn-ghost" onClick={() => onChange(currentMonth)}>Today</button>
      )}
      <button type="button" className="icon-btn" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  );
}
