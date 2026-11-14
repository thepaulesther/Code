/** A circular progress indicator with the percentage in the middle. Used for savings goals. */
export function ProgressRing({ value, size = 52, label, done }: {
  /** 0..1 */
  value: number;
  size?: number;
  /** Accessible name, e.g. "New car progress". */
  label: string;
  done?: boolean;
}) {
  const v = Math.max(0, Math.min(1, value));
  const stroke = size >= 48 ? 5 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className={done ? 'ring is-done' : 'ring'}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${v * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-text num">{Math.round(v * 100)}%</span>
    </span>
  );
}
