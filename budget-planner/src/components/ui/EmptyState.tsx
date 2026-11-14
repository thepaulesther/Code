import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** A friendly "nothing here yet" block: icon, short title, one sentence and an optional action. */
export function EmptyState({ icon, title, children, action, compact }: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'empty-state compact' : 'empty-state'}>
      <span className="empty-state-icon"><Icon name={icon} size={22} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
