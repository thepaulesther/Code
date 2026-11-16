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

/** Elora's mark: dawn over the tide on a forest tile. Used in the sidebar, the mobile top bar and the app icon. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="116" fill="#173F35" />
      <path d="M146 292a110 110 0 0 1 220 0z" fill="#E8B04B" />
      <path d="M112 338q36-18 72 0t72 0t72 0t72 0" fill="none" stroke="#F7F5EF" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M168 404q44-18 88 0t88 0" fill="none" stroke="#F7F5EF" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The "elora" wordmark: outlined lettering that takes the text colour, so it follows the theme. */
export function BrandWordmark({ className = 'brand-name wordmark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 499 150" role="img" aria-label="Elora">
      <path d="M55.8 149.8L55.8 149.8Q41.8 149.8 31.3 145Q20.8 140.2 13.9 132.1Q7.0 124 3.5 114Q0 104 0 93.6L0 93.6L0 89.8Q0 79 3.5 68.9Q7.0 58.8 13.9 50.9Q20.8 43 31 38.3Q41.2 33.6 54.6 33.6L54.6 33.6Q72.2 33.6 84.1 41.3Q96.0 49 102.0 61.5Q108.0 74 108.0 88.4L108.0 88.4L108.0 98.4L26.4 98.4Q27 104.6 29.2 109.8L29.2 109.8Q32.4 117.8 39 122.3Q45.6 126.8 55.8 126.8Q66.0 126.8 72.4 122.7Q78.8 118.6 80.6 112.6L80.6 112.6L106.2 112.6Q103.8 123.8 97.0 132.2Q90.2 140.6 79.7 145.2Q69.2 149.8 55.8 149.8ZM26.8 81.4L26.8 81.4L81.4 81.4Q80.8 76.2 79.0 72L79.0 72Q76.0 64.6 69.9 60.6Q63.8 56.6 54.6 56.6Q45.4 56.6 39 60.8Q32.6 65 29.4 72.8L29.4 72.8Q27.6 76.8 26.8 81.4ZM160.4 146L132.6 146L132.6 20.8L119 20.8L119 0L160.4 0L160.4 146ZM244.4 149.8L244.4 149.8Q230 149.8 219 145.2Q208 140.6 200.4 132.7Q192.8 124.8 188.9 114.8Q185 104.8 185 94L185 94L185 89.8Q185 78.6 189.1 68.5Q193.2 58.4 200.9 50.5Q208.6 42.6 219.6 38.1Q230.6 33.6 244.4 33.6L244.4 33.6Q258.2 33.6 269.2 38.1Q280.2 42.6 287.9 50.5Q295.6 58.4 299.6 68.5Q303.6 78.6 303.6 89.8L303.6 89.8L303.6 94Q303.6 104.8 299.7 114.8Q295.8 124.8 288.2 132.7Q280.6 140.6 269.6 145.2Q258.6 149.8 244.4 149.8ZM244.4 126L244.4 126Q254.6 126 261.6 121.5Q268.6 117 272.2 109.3Q275.8 101.6 275.8 91.8L275.8 91.8Q275.8 81.8 272.1 74.1Q268.4 66.4 261.3 61.9Q254.2 57.4 244.4 57.4L244.4 57.4Q234.6 57.4 227.5 61.9Q220.4 66.4 216.6 74.1Q212.8 81.8 212.8 91.8L212.8 91.8Q212.8 101.6 216.5 109.3Q220.2 117 227.2 121.5Q234.2 126 244.4 126ZM355.8 146L328.0 146L328.0 37.4L350.0 37.4L350.0 72.6Q351.8 57 359.4 48L359.4 48Q369.4 36 388.8 36L388.8 36L392.8 36L392.8 60.2L385.2 60.2Q371.2 60.2 363.5 67.7Q355.8 75.2 355.8 89.4L355.8 89.4L355.8 146ZM498.6 146L476.6 146L476.6 125.2Q475.2 129.4 473.4 132.8L473.4 132.8Q468.8 140.6 460.9 144.7Q453 148.8 441.6 148.8L441.6 148.8Q429.8 148.8 420.9 144.6Q412 140.4 407.1 132.6Q402.2 124.8 402.2 113.8L402.2 113.8Q402.2 101.8 408.1 94.2Q414 86.6 424.7 82.8Q435.4 79 449.8 79L449.8 79L472 79L472 78Q472 68.6 467.4 64Q462.8 59.4 453.2 59.4L453.2 59.4Q448.2 59.4 441.2 59.6Q434.2 59.8 427.1 60.1Q420 60.4 414.4 60.8L414.4 60.8L414.4 37.2Q419 36.8 424.8 36.4Q430.6 36 436.7 35.9Q442.8 35.8 448.2 35.8L448.2 35.8Q465 35.8 476.1 40.2Q487.2 44.6 492.9 54Q498.6 63.4 498.6 78.6L498.6 78.6L498.6 146ZM472 105.8L472 95.6L449.4 95.6Q439.8 95.6 434.7 100.3Q429.6 105 429.6 112.4Q429.6 119.8 434.7 124.4Q439.8 129 449.4 129L449.4 129Q455.2 129 460.1 126.9Q465 124.8 468.3 119.7Q471.6 114.6 472 105.8L472 105.8Z" />
    </svg>
  );
}
