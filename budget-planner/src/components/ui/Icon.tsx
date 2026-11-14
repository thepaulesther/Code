/**
 * Elora's icon set: one stroke style (24px grid, 1.75 stroke, round joins), drawn inline so it needs
 * no icon dependency and works in the single-file build. Icons are decorative (aria-hidden); the
 * button or link around them carries the accessible name.
 */
const PATHS = {
  overview: 'M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z',
  transactions: 'M8 3.5 4 7.5l4 4M4 7.5h12.5M16 20.5l4-4-4-4M20 16.5H7.5',
  budgets: 'M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12zM15 3.9a8.5 8.5 0 0 1 5.1 5.1H15z',
  savings: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  insights: 'M3.5 17.5 9 12l4 4 7.5-7.5M15 8.5h5.5V14',
  plans: 'M9 3.5h6v3H9zM15 5h3a1.5 1.5 0 0 1 1.5 1.5v12.5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V6.5A1.5 1.5 0 0 1 6 5h3M8.5 12h7M8.5 16h4.5',
  settings: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  plus: 'M12 5v14M5 12h14',
  import: 'M12 15V4M8 11l4 4 4-4M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15',
  export: 'M12 15V4M8 8l4-4 4 4M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15',
  'chevron-left': 'M14.5 6 8.5 12l6 6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  edit: 'M4.5 19.5h3.75L19 8.75 15.25 5 4.5 15.75zM13.5 6.75l3.75 3.75',
  trash: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7M9.5 7V4.5h5V7',
  alert: 'M12 4 2.75 19.5h18.5zM12 10v4M12 16.75v.01',
  'arrow-in': 'M17 7 7 17M7 9.5V17h7.5',
  'arrow-out': 'M7 17 17 7M9.5 7H17v7.5',
  repeat: 'M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 0 1-4 4H4',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5H20V8H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.75h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  bulb: 'M9.5 18h5M10.5 21h3M12 3.5a5.5 5.5 0 0 0-3.4 9.8c.6.5.9 1.2.9 2V15h5v-.2c0-.8.3-1.5.9-2A5.5 5.5 0 0 0 12 3.5z',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4',
  lock: 'M6.5 10.5h11v9.5h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  download: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  leaf: 'M5 19c0-8 5-13.5 14-14 0 9-5.5 14-14 14zM5 19l7.5-7.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Elora's mark: a sage leaf on forest. Used in the sidebar, the mobile top bar and the app icon. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#173F35" />
      <path d="M8.5 23.5c0-8.4 5.2-14 15-15 0 9.6-5.8 15-15 15z" fill="#A8BBA6" />
      <path d="M8.5 23.5 17 15" stroke="#173F35" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
