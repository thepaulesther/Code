# Ledgerly — budget planner

A small, private budget planner. Track income and expenses, set monthly limits per category, and see where your money goes. All data lives in your browser's `localStorage`; nothing is sent to a server.

## Features

- **Monthly overview**: income, expenses, net, and savings rate, with a change versus last month
- **6-month trend chart**: click a month to jump to it
- **Spending donut**: by category, with hover to highlight
- **Category budgets**: progress meters that turn amber at 80% and red when over
- **Transactions**: search, filter by income or expense, and delete
- **CSV export** and a full reset
- Light and dark mode, and works on phones

The app starts with sample data. Click **Reset** to clear it.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the budget logic
npm run build    # type-check + production build into dist/
```

## Structure

| Path | What it does |
| --- | --- |
| `src/lib/budget.ts` | Pure logic: totals, grouping, trend, budget status, parsing, CSV |
| `src/lib/storage.ts` | `usePersistentState`: localStorage-backed state with safe fallbacks |
| `src/components/` | Charts (SVG, no chart library), form, transaction list, budget panel |
| `src/App.tsx` | Page layout and state |
