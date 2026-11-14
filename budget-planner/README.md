# Elora: budget planner

A calm, private money planner. Track income and expenses, set monthly limits per category, and see where your money goes. All data lives in your browser's `localStorage`; nothing is sent to a server. It installs as an app and works offline.

## Layout

| Page | What's on it |
| --- | --- |
| **Overview** | Greeting, this month's balance (income minus spending) with income and spending, quick actions, budget progress, savings goals, the 6-month trend, recent activity and insights |
| **Transactions** | The month's entries with search and filters, edit and delete, import and export, and repeating items |
| **Budgets** | Category limits and the spending breakdown |
| **Savings** | Goals and the emergency fund, with totals and what to set aside each month |
| **Insights** | Month totals with change vs last month, trend and categories |
| **Plan** | The monthly plan and the bills that feed it |
| **Settings** | Theme, base currency, plan and alerts, categories, your data |

On desktop the pages are in a sidebar, on tablets in an icon rail, and on phones in a bottom tab bar (Overview, Transactions, Budgets, Savings, More) with a floating **+** for adding a transaction. Pages have their own address (`#/budgets`), so the back button works. The design system (colours, type, spacing, components) is described in [`docs/redesign/02-design-system.md`](docs/redesign/02-design-system.md).

"Balance" on the Overview is the month's income minus spending. Elora records what you enter; it doesn't connect to bank accounts, so it never shows an account balance.

## Features

- **Monthly overview**: income, expenses, net, and savings rate, with a change versus last month
- **6-month trend chart**: click a month (or focus it and press Enter) to jump to it
- **Spending donut**: by category, with hover to highlight
- **Category budgets**: progress meters that turn amber at 80% and red when over
- **Repeating transactions**: set “Repeats” to every month or every year for salary, subscriptions or rent. Each one is added on its day, including any months missed while the app was closed. You can pause, resume or stop them from the Repeating panel.
- **Yearly and multi-month costs**: rent paid once a year (common in Nigeria), school fees or insurance can be spread with “Counts toward: 12 months”. A ₦3,000,000 yearly rent then counts as ₦250,000 in each of the 12 months from the month you pay, in totals, the savings rate, budgets and charts. The list shows each month’s share (“11 of 12 · paid Jan 5”). Repeating items can be **monthly or yearly**; choosing yearly spreads over 12 months automatically.
- **Savings goals**: a car, a property, a new phone: give each a price and, optionally, the month you need it by. Use **Add money** as you save. Each goal shows its progress and how much to put aside each month. One goal can be your **emergency fund**, and the app suggests 3 months of your average spending as its target.
- **Save a share of your income automatically**: any goal (typically the emergency fund) can be set to "Save a share of my income", for example 20%. The plan then reserves that share every month, and with "Put it aside automatically" ticked, each income you add from that month on records its share in the goal: a ₦500,000 salary adds ₦100,000. Editing or deleting an income updates its share, money added by hand still counts, and it stops at the target. (This records the saving; set up a standing order at your bank to move the money.)
- **Monthly plan**: works out how much you can spend while still saving. Income is your average over the last 3 months, broken down (e.g. Salary ₦500,000 + Freelance ₦200,000 = ₦700,000), or an expected income you type in. From that it takes out:
  - **bills and repeating costs** (yearly rent counts monthly)
  - what each **dated goal** needs
  - the **emergency fund**, built up over 12 months by default
  - a savings share for **goals without a date**, 20% of income by default

  What's left is **free to spend**, shown as an amount and a percentage of income, with this month's spending against it, what's left, and about how much you can spend per day. If bills and savings need more than you earn, it says by how much.
- **Overspending alerts**: a banner appears when you've used 90% of your free-to-spend money, when you go over it, and (most urgently) when spending passes your income. A short **alarm sound** plays once when a new warning appears. Optionally, you can also get a **notification** on your phone or computer. Both can be turned on or off under Settings → Plan and alerts.
- **Edit anything you've entered**: the pencil on each transaction opens it in the same form. Change the amount, category, date, note or currency, or set an existing one-off to **repeat every month or year**: it becomes the first payment, and payments due since then are filled in. For a payment that already repeats, "Also change future payments" decides whether the change applies going forward. Every save can be undone.
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
- **Insights**: short notes on the Overview built from your own numbers: how much you can spend a day, budgets near or over the limit, your biggest category, the change from last month and your savings rate
- **Theme**: System, Light or Dark
- **Installable PWA**: has a manifest, icons, and a service worker that caches the app for offline use

The app starts **empty** and with **no currency chosen**: amounts show as plain numbers until you pick one in the welcome card, the form or Settings, and adding or importing transactions waits until you do. Every number comes from your own entries. Data saved by earlier versions may still include example entries: they carry an **example** badge, and a banner offers **Remove examples** (with Undo). To start completely fresh, use **Settings → Delete all data**.

When you add a repeating item that matches an existing one (say, a yearly “Rent” while a monthly “Rent” is still set up), the form offers to stop the old one. Stopping a repeating item from the Repeating panel can also delete the payments it added, with Undo.

## Develop

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # unit tests (budget maths, repeating rules, CSV parsing, categories, routing, insights)
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
| `src/lib/plan.ts` | Goals, the monthly plan (income average, bills, goal and emergency-fund amounts, free to spend) and alert levels |
| `src/lib/alarm.ts` | Alarm sound (Web Audio) and notifications |
| `src/lib/format.ts` | Currency- and category-aware formatters for components |
| `src/lib/pwa.ts` | Install prompt, online status, service worker registration |
| `src/lib/route.ts` | Hash routing (`#/budgets`) for the pages |
| `src/lib/insights.ts` | Overview insights, derived from totals, the plan and budget status |
| `src/components/` | Charts (SVG), form, lists, budgets, goals, plan, repeating panel, Settings page, and the Import and Export dialogs |
| `src/components/layout/` | App shell: sidebar, mobile top bar, tab bar, More sheet, add button |
| `src/components/overview/` | Balance hero, quick actions, insights card |
| `src/components/ui/` | Shared kit: icons and brand mark, page header and month switcher, empty state, error boundary |
| `src/index.css` | Design tokens (light and dark) and all component styles |
| `public/` | Manifest, icons, `sw.js` |
