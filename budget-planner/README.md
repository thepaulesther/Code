# Ledgerly: budget planner

A small, private budget planner. Track income and expenses, set monthly limits per category, and see where your money goes. All data lives in your browser's `localStorage`; nothing is sent to a server. It installs as an app and works offline.

## Features

- **Monthly overview**: income, expenses, net, and savings rate, with a change versus last month
- **6-month trend chart**: click a month to jump to it
- **Spending donut**: by category, with hover to highlight
- **Category budgets**: progress meters that turn amber at 80% and red when over
- **Repeating transactions**: tick “Repeat every month” for rent, salary or subscriptions. Each one is added on its day, including any months missed while the app was closed. You can pause, resume or stop them from the Repeating panel.
- **Your own categories**: add, rename (updates every transaction, budget and repeating item) or remove them in Settings
- **CSV import**: from your bank or card. Columns are detected automatically, and you can fix them before importing. It handles:
  - comma, semicolon or tab separators
  - `MM/DD/YYYY`, `DD/MM/YYYY` and ISO dates
  - signed amounts, `(12.00)` and `1.234,56` formats
  - separate money-in and money-out columns
  - duplicates of what you already have, which it skips
- **CSV export**: download, or copy to the clipboard; re-importing the file skips duplicates
- **Currency**: 20 common currencies (display only, no conversion)
- **Theme**: System, Light or Dark
- **Installable PWA**: has a manifest, icons, and a service worker that caches the app for offline use

The app starts with sample data. Use **Settings → Delete all data** to clear it.

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
| `src/lib/format.ts` | Currency- and category-aware formatters for components |
| `src/lib/pwa.ts` | Install prompt, online status, service worker registration |
| `src/components/` | Charts (SVG), form, lists, budgets, repeating panel, and the Settings, Import and Export dialogs |
| `public/` | Manifest, icons, `sw.js` |
