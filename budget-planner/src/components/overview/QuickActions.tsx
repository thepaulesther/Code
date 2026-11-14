import { Icon, type IconName } from '../ui/Icon';

function Action({ icon, label, onClick, disabled, title }: {
  icon: IconName; label: string; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button type="button" className="qa" onClick={onClick} disabled={disabled} title={title}>
      <span className="qa-icon"><Icon name={icon} size={19} /></span>
      <span className="qa-text">{label}</span>
    </button>
  );
}

export function QuickActions({ onExpense, onIncome, onImport, onGoal, hasCurrency }: {
  onExpense: () => void;
  onIncome: () => void;
  onImport: () => void;
  onGoal: () => void;
  hasCurrency: boolean;
}) {
  const needs = hasCurrency ? undefined : 'Choose your currency first';
  return (
    <section className="quick-actions" aria-label="Quick actions">
      <Action icon="arrow-out" label="Add expense" onClick={onExpense} />
      <Action icon="arrow-in" label="Add income" onClick={onIncome} />
      <Action icon="import" label="Import CSV" onClick={onImport} disabled={!hasCurrency} title={needs} />
      <Action icon="savings" label="New goal" onClick={onGoal} disabled={!hasCurrency} title={needs} />
    </section>
  );
}
