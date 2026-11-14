# Ledgerly: budget planner

A small, private budget planner. Track income and expenses, set monthly limits per category, and see where your money goes. All data lives in your browser's `localStorage`; nothing is sent to a server. It installs as an app and works offline.

## Features

- **Monthly overview**: income, expenses, net, and savings rate, with a change versus last month
- **6-month trend chart**: click a month to jump to it
- **Spending donut**: by category, with hover to highlight
- **Category budgets**: progress meters that turn amber at 80% and red when over
- **Repeating transactions**: set “Repeats” to every month or every year for salary, subscriptions or rent. Each one is added on its day, including any months missed while the app was closed. You can pause, resume or stop them from the Repeating panel.
- **Yearly and multi-month costs**: rent paid once a year (common in Nigeria), school fees or insurance can be spread with “Counts toward: 12 months”. A ₦3,000,000 yearly rent then counts as ₦250,000 in each of the 12 months from the month you pay, in totals, the savings rate, budgets and charts. The list shows each month’s share (“11 of 12 · paid Jan 5”). Repeating items can be **monthly or yearly**; choosing yearly spreads over 12 months automatically.
- **Your own categories**: add, rename (updates every transaction, budget and repeating item) or remove them in Settings
- **CSV import**: from your bank or card. Columns are detected automatically, and you can fix them before importing. It handles:
  - comma, semicolon or tab separators
  - `MM/DD/YYYY`, `DD/MM/YYYY` and ISO dates
  - signed amounts, `(12.00)` and `1.234,56` formats
  - separate money-in and money-out columns
  - duplicates of what you already have, which it skips
- **CSV export**: download, or copy to the clipboard; re-importing the file skips duplicates
- **Multi-currency**: pick a **base currency** from every ISO currency (Naira, Yen, Cedi and so on), which all totals, budgets and charts use. Any transaction can be entered in another currency. For example, a remote worker with a Naira base can record a $5,000 salary: the app suggests today's market rate, you can type the rate you actually got, and ₦ is added to your totals while the original "$5,000 @ 1,480" is kept.
  - Repeating items can be in a foreign currency; each month converts at the latest rate.
  - CSV import has an "Amounts are in" option for foreign-currency account statements.
  - Changing the base currency asks whether to **convert** existing data at a rate, or just **relabel** it.
  - Rates come from [ExchangeRate-API](https://www.exchangerate-api.com), falling back to [fawazahmed0/currency-api](https://github.com/fawazahmed0/exchange-api). They refresh at most every 12 hours. Only the rate list is downloaded, and none of your data is sent. When offline you type the rate yourself.
- **Theme**: System, Light or Dark
- **Installable PWA**: has a manifest, icons, and a service worker that caches the app for offline use

The app starts **empty** and with **no currency chosen**: amounts show as plain numbers until you pick one in the welcome card, the form or Settings, and adding or importing transactions waits until you do. Every number comes from your own entries. Data saved by earlier versions may still include example entries: they carry an **example** badge, and a banner offers **Remove examples** (with Undo). To start completely fresh, use **Settings → Delete all data**.

When you add a repeating item that matches an existing one (say, a yearly “Rent” while a monthly “Rent” is still set up), the form offers to stop the old one. Stopping a repeating item from the Repeating panel can also delete the payments it added, with Undo.

## Develop

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # unit tests (budget maths, repeating rules, CSV parsing, categories)
npm run lint
npm run build            # type-check + production build into dist/
npm run build:artifact   # single self-contained HTML file in dist-artifact/
```

The service worker only registers in production builds. To try offline mode, run `npm run build && npx vite preview`.

## Hosting on GitHub Pages

`.github/workflows/deploy-pages.yml` lints, tests and builds on every pull request. On every push to `main`, it also deploys `dist/` to GitHub Pages. To turn it on:

1. Merge this branch into `main`.
2. In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

The site will then be at `https://<owner>.github.io/<repo>/`. The build uses relative paths, so it works from that sub-path.

## Structure

| Path | What it does |
| --- | --- |
| `src/lib/budget.ts` | Core maths: totals, grouping, trend, budget status, money formatting, CSV export |
| `src/lib/recurring.ts` | Repeating rules: due dates, catching up on missed months, pause/resume |
| `src/lib/csv.ts` | CSV parsing, column/date/amount detection, import with duplicate checks |
| `src/lib/store.ts` | App data shape, loading, migration and saving, category add/rename/remove, `useAppData` |
| `src/lib/currency.ts` | Exchange rates: fetching, caching, cross-rate conversion, currency list |
| `src/lib/format.ts` | Currency- and category-aware formatters for components |
| `src/lib/pwa.ts` | Install prompt, online status, service worker registration |
| `src/components/` | Charts (SVG), form, lists, budgets, repeating panel, and the Settings, Import and Export dialogs |
| `public/` | Manifest, icons, `sw.js` |
