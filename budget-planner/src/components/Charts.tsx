import { useEffect, useRef, useState } from 'react';
import { monthLabel } from '../lib/budget';
import { useFormat } from '../lib/format';

interface Slice { category: string; amount: number }

export function SpendingDonut({ data }: { data: Slice[] }) {
  const { money, color } = useFormat();
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.amount, 0);

  if (total === 0) {
    return <p className="empty">No expenses this month yet.</p>;
  }

  const R = 70;
  const STROKE = 22;
  const C = 2 * Math.PI * R;
  const GAP = data.length > 1 ? 2 : 0; // px gap between segments
  let offset = 0;
  const focus = data.find((d) => d.category === active);

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 200 200" className="donut" role="img" aria-label="Spending by category">
        <g transform="rotate(-90 100 100)">
          {data.map((d) => {
            const len = (d.amount / total) * C;
            const seg = (
              <circle
                key={d.category}
                cx="100" cy="100" r={R}
                fill="none"
                stroke={color(d.category)}
                strokeWidth={active === d.category ? STROKE + 6 : STROKE}
                strokeDasharray={`${Math.max(len - GAP, 0.5)} ${C}`}
                strokeDashoffset={-offset}
                opacity={active && active !== d.category ? 0.35 : 1}
                onMouseEnter={() => setActive(d.category)}
                onMouseLeave={() => setActive(null)}
                style={{ transition: 'opacity .15s, stroke-width .15s', cursor: 'pointer' }}
              />
            );
            offset += len;
            return seg;
          })}
        </g>
        <text x="100" y="94" textAnchor="middle" className="donut-label">
          {focus ? focus.category : 'Spent'}
        </text>
        <text x="100" y="118" textAnchor="middle" className="donut-value">
          {money(focus ? focus.amount : total, { compact: true })}
        </text>
      </svg>
      <ul className="legend">
        {data.map((d) => (
          <li
            key={d.category}
            onMouseEnter={() => setActive(d.category)}
            onMouseLeave={() => setActive(null)}
            className={active === d.category ? 'is-active' : ''}
          >
            <span className="swatch" style={{ background: color(d.category) }} />
            <span className="legend-name">{d.category}</span>
            <span className="legend-pct">{Math.round((d.amount / total) * 100)}%</span>
            <span className="legend-amt num">{money(d.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TrendPoint { month: string; income: number; expense: number }

export function TrendChart({ data, selected, onSelect }: {
  data: TrendPoint[];
  selected: string;
  onSelect: (month: string) => void;
}) {
  const { money } = useFormat();
  // Measure the real width so text stays at true pixel size on small screens.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (data.every((d) => d.income === 0 && d.expense === 0)) {
    return (
      <div ref={ref}>
        <p className="empty">Your income and spending for these six months will appear here once you add some.</p>
      </div>
    );
  }
  const H = W < 480 ? 180 : 220;
  const PAD = { top: 12, right: 8, bottom: 26, left: 48 };
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  // Round the axis max up to a "nice" number.
  const mag = 10 ** Math.floor(Math.log10(max));
  const niceMax = Math.ceil(max / mag) * mag;
  const ticks = [0, 0.5, 1].map((f) => f * niceMax);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / data.length;
  const barW = Math.min(18, band / 3.2);
  const y = (v: number) => PAD.top + innerH - (v / niceMax) * innerH;

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="trend" role="img" aria-label="Income and expenses by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="axis">
              {money(t, { compact: true })}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + band * i + band / 2;
          const isSel = d.month === selected;
          return (
            <g
              key={d.month}
              className={`trend-col ${isSel ? 'is-selected' : ''}`}
              onClick={() => onSelect(d.month)}
              role="button"
              aria-label={`${monthLabel(d.month)}: income ${money(d.income)}, expenses ${money(d.expense)}`}
            >
              <rect x={cx - band / 2 + 2} y={PAD.top} width={band - 4} height={innerH} className="trend-hit" rx="6" />
              <rect x={cx - barW - 1.5} y={y(d.income)} width={barW} height={y(0) - y(d.income)} rx="3" className="bar-income" />
              <rect x={cx + 1.5} y={y(d.expense)} width={barW} height={y(0) - y(d.expense)} rx="3" className="bar-expense" />
              <text x={cx} y={H - 8} textAnchor="middle" className={`axis ${isSel ? 'axis-strong' : ''}`}>
                {monthLabel(d.month, 'short')}
              </text>
              <title>{`${monthLabel(d.month)}\nIncome ${money(d.income)}\nExpenses ${money(d.expense)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
