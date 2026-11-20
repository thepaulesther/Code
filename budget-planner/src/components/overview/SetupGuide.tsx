import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';

export interface SetupStep {
  id: string;
  title: string;
  detail: ReactNode;
  done: boolean;
  /** Optional steps can be skipped and done later. */
  optional: boolean;
  /** Inline control (e.g. the currency picker) instead of a button. */
  content?: ReactNode;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}

/** A short, skippable checklist that walks a new user through Elora's existing features. */
export function SetupGuide({ steps, skipped, onSkip, onUnskip, onHide, title = 'Set up Elora' }: {
  steps: SetupStep[];
  skipped: string[];
  onSkip: (id: string) => void;
  onUnskip: (id: string) => void;
  onHide: () => void;
  /** The guide's heading, e.g. "Set up your business" on the Business side. */
  title?: string;
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done && !skipped.includes(s.id));

  // Skipping removes the focused button; move focus to the next step so keyboard users keep their place.
  const listRef = useRef<HTMLOListElement>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    const target = listRef.current?.querySelector<HTMLElement>('.is-current button, .is-current select');
    (target ?? document.getElementById('page-title'))?.focus();
  }, [current?.id]);
  const skip = (id: string) => {
    focusNext.current = true;
    onSkip(id);
  };
  const hide = () => {
    onHide();
    // The guide disappears with the focused button in it.
    requestAnimationFrame(() => document.getElementById('page-title')?.focus());
  };

  return (
    <section className="card setup" aria-labelledby="setup-title">
      <div className="card-head">
        <h2 id="setup-title">
          {title}
          <span className="card-sub">{doneCount} of {steps.length} done · every step after the first is optional</span>
        </h2>
        <button type="button" className="btn-ghost sm" onClick={hide}>Hide guide</button>
      </div>
      <div
        className="meter setup-meter"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
      >
        <div className="meter-fill" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="setup-steps" ref={listRef}>
        {steps.map((s, i) => {
          const isSkipped = !s.done && skipped.includes(s.id);
          const isCurrent = s === current;
          const state = s.done ? 'done' : isSkipped ? 'skipped' : isCurrent ? 'current' : 'todo';
          return (
            <li key={s.id} className={`setup-step is-${state}`} aria-current={isCurrent ? 'step' : undefined}>
              <span className="setup-mark" aria-hidden>
                {s.done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div className="setup-body">
                <div className="setup-line">
                  <span className="setup-title">{s.title}</span>
                  <span className="setup-state">
                    {s.done ? 'Done' : isSkipped ? 'Skipped' : isCurrent ? 'Next' : ''}
                  </span>
                </div>
                {isCurrent && (
                  <>
                    <p className="setup-detail">{s.detail}</p>
                    {s.content}
                    {(s.action || s.optional) && (
                      <div className="setup-actions">
                        {s.action && (
                          <button type="button" className="btn-primary auto" onClick={s.action.onClick} disabled={s.action.disabled}>
                            {s.action.label}
                          </button>
                        )}
                        {s.optional && (
                          <button type="button" className="btn-ghost" onClick={() => skip(s.id)}>Skip for now</button>
                        )}
                      </div>
                    )}
                  </>
                )}
                {isSkipped && s.action && (
                  <button
                    type="button"
                    className="link-btn setup-later"
                    onClick={() => {
                      onUnskip(s.id);
                      s.action!.onClick();
                    }}
                    disabled={s.action.disabled}
                  >
                    {s.action.label}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const PREVIEW: [IconName, string, string][] = [
  ['wallet', 'Balance this month', 'Your recorded income minus your recorded spending, with both shown side by side.'],
  ['budgets', 'Budgets', 'How much of each monthly limit you’ve used, and what’s left.'],
  ['savings', 'Savings goals', 'Progress towards each goal and what to set aside each month.'],
  ['insights', 'Trends and insights', 'Six months of income and spending, and plain notes on what stands out.'],
];

/** What a brand-new user's Overview will show, so the empty page explains itself. */
export function OverviewPreview() {
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          What you’ll see here
          <span className="card-sub">Your overview fills in as you add transactions.</span>
        </h2>
      </div>
      <ul className="insight-list preview-list">
        {PREVIEW.map(([icon, title, text]) => (
          <li key={title}>
            <span className="insight-icon"><Icon name={icon} size={18} /></span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
