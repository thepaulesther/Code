# Stage 1 — Finish the dashboard: report

**Plan:** presented in the session and approved, with the month-end check-in added at the user's request.
**Branch:** `claude/elora-ui-redesign-system-qd0dnz`, brought up to date with `main` after PR #5 was merged.

## Objective

Finish the Overview without changing any calculation or the saved data format:
- an Upcoming bills module that looks past the month end
- loading states only where something actually waits
- optional reordering and hiding of Overview sections
- a month-end check-in, so money left over at the end of a month can be saved instead of being forgotten

## Existing behaviour inspected

- **`lib/reconcile.ts`:** `upcomingThisMonth`, from PR #5.
- **`lib/recurring.ts`:** `nextOccurrence`, `dueOccurrences` and `materialize`.
- **`lib/plan.ts`:** goals and contributions, and `syncAutoSavings`, which leaves contributions without `txId` alone.
- **`lib/store.ts`:** `addToGoal`.
- **`lib/setup.ts`:** the per-device preference pattern.
- **The Overview grid in `App.tsx`.**
- **Exchange-rate status in `CurrencyFields` and `SettingsPanel`.**

**Finding:** before this stage, nothing happened to money left over at the end of a month. Each month's balance starts from zero, budgets don't roll over, and money only reaches a goal when it is recorded. The surplus simply dropped out of view.

## Design and data changes

**No change to the stored financial data format** (still version 2, key `bp.data`), and no calculation changed.

### Upcoming (`lib/upcoming.ts`, `ComingUp.tsx`)

- **What it shows:**
  - "Later this month" lists items due after today.
  - "Early next month" lists next-month items due within 7 days of today, so a bill on the 1st is visible from late in the month before.
  - "Added today" lists repeating payments added automatically today.
- **Labels:** "Tomorrow" and "In 3 days" while an item is close, otherwise the date.
- **Totals:** for this month only, so they match the hero's "Still to pay this month" and the Plan page's balance comparison.
- **Always shown on the current month:**
  - "Nothing else due this month" when nothing is left to pay;
  - "Add a repeating bill", which opens the form already set to repeat monthly, when there are no repeating items yet;
  - a count of paused items, with a link to manage them.
- **Position:** it moves up next to Budgets. On Transactions it appears only when something is due.
- **Code:** `upcomingThisMonth` moved here, and `reconcile.ts` re-exports it.

### Month-end check-in (`lib/monthEnd.ts`, `MonthEndCard.tsx`)

- **What's left over:** a finished month's income minus its spending, the same as its balance (spread payments count by their monthly share), less money that already went into goals that month (including automatic savings).
- **When it's offered:** during the first 7 days of a month, for the month before.
  - "Not now" hides it for that month on this device.
  - When you look back at a past month on the Overview, its check-in is shown, without "Not now".
- **Add to goals:** split the amount across any goals that still need money. Each goal is capped at what it still needs, and the total is capped at what's left over.
  - The money is saved as ordinary goal contributions dated **the last day of the month it came from**. This differs from the "dated the 1st" in the proposal: dating it in the source month means the check-in clears itself and the money is never counted against the new month.
  - Undo is offered straight away.
- **Other cases:**
  - With no goals, it offers "Create a goal".
  - A month that spent more than it earned gets a calm note and a link to that month's transactions.
  - A month with no recorded income gets nothing, because "left over" would be meaningless.
- **Not included (Stage 3):** carrying money into the next month as spendable, and budget roll-over. Both change "Left to spend" and need their own approval and tests.

### Customise Overview (`lib/layout.ts`, `CustomiseOverview.tsx`)

- **Sections:** Coming up, Budgets, 6-month trend, Recent activity, Savings goals and Insights. Each can be moved up or down with buttons (keyboard and screen-reader friendly, every move announced) or hidden. The balance, the check-in and the quick actions stay at the top.
- **Where to open it:** a "Customise Overview" button at the foot of the Overview, and in Settings under Appearance. "Reset to default" restores the default order with everything shown.
- **Layout:** sections are laid out two per row on wide screens. The trend chart takes the wider side of its row, and a section on its own spans the full width. Screen order always follows the chosen order, so keyboard and screen-reader order match.
- **Storage:** a new per-device key, `elora.layout` = `{ order, hidden, dismissedMonthEnd }`. It's checked on every read: damaged values fall back to the default, unknown entries are dropped, and a section added in a later version appears near its default place. It's kept out of `bp.data`, so it needs no migration and isn't in backups. "Delete all data" resets it.

### Loading states

- **Audit result:** the app reads saved data synchronously from the browser, so no screen waits. The only background work is the exchange-rate refresh, which already shows "Getting today's rate…" and errors in the currency fields and in Settings.
- **Change:** none. Placeholder skeletons would only pretend to wait.

## Security and privacy

- **No new network requests, dependencies or permissions.**
- **`elora.layout`** holds display preferences only (section names and months), with no amounts.
- **Contributions:** the check-in creates them through the same data path as "Add money", with the same undo.

## Tests added

- **Unit tests (32 new):**
  - `upcoming.test.ts`: windows across the month and year end, short months, paused items, yearly items, today's automatic payments, currency conversion and totals.
  - `monthEnd.test.ts`: left over less savings, spread payments, the over-spent and no-income cases, the 7-day window, the year end, dismissal, split checks, last-day dating including 29 February, and a partial split.
  - `layout.test.ts`: damaged values, unknown and repeated entries, sections added later, the 12-month cap on dismissals, moves at the edges, and row arrangement.
- **Browser tests (`e2e/overview.spec.ts`, 13 per project, desktop and phone):** these use a fake clock and cover:
  - the month-end window, totals and paused items
  - "Nothing else due" and "Added today"
  - the empty state opening a repeating form
  - check-in split validation, last-day dating and undo
  - "Not now" surviving a reload, and looking back at October
  - the first-week limit
  - the over-spent note and its link
  - "Create a goal"
  - keyboard reordering with focus kept at the edges and the move announced, hiding, persistence, reset and a damaged setting
  - opening from Settings
  - axe WCAG 2.2 AA with the new cards and dialog open, in light and dark

## Commands run and results

- `npm run lint`: 0 problems. `tsc -b`: 0 errors.
- `npm test`: **251 passed** (219 before this stage).
- `npm run build` and `npm run build:artifact`: both succeed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run test:e2e`: **69 passed, 3 skipped by design** (43 before, plus 26 new).
- **Screenshots checked** at desktop width (light) and phone width (dark), with the check-in form and the Customise dialog open.

## Acceptance criteria

| Criterion | Result |
| --- | --- |
| Look-ahead correct across the month end, year end, short months and paused items, tested with a fixed date | Done (unit and browser tests) |
| Upcoming totals match "Still to pay" and the balance comparison | Done (browser test checks both show ₦30,000) |
| Custom order and hidden sections survive a reload; reset works; a damaged setting falls back to the default | Done (browser tests) |
| Month-end check-in: windows, a month with no income, full goals, undo, reload | Done (unit and browser tests) |
| Lint, types, unit, browser and accessibility tests pass locally and in CI, on desktop and phone | Passed locally; CI result is on the pull request |

## Known limitations and open items

1. **Carry-over and budget roll-over** are deliberately left for Stage 3 (Planning).
2. **The layout and check-in dismissals are per device** and aren't in backups (display preferences only).
3. **Next-month items aren't totalled.** They're shown so nothing due on the 1st comes as a surprise, but the totals stay this-month only so the figures reconcile.
4. **Still open from earlier:** the Vitest 5 upgrade, the Netlify items to verify, and testing on real devices.

## Recommended next task

Review this stage. Then **Stage 2 (Money)**: minor units with a v2→v3 migration and backup, a "Main" account, transfers, F4, and NGN/locale settings. The Vitest 5 upgrade can go in alongside as a small separate change.
