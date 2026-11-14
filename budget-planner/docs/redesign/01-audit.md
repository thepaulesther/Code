# Elora redesign — Stage A: audit and proposal

Audit of the app as it stood at `644642c` (branded "Ledgerly" in the code), before any redesign change.

## 1. Current architecture

| Concern | What exists |
| --- | --- |
| Framework | React 19 + TypeScript 5.8, Vite 6, single-page app |
| Routing | **None.** One long page rendered by `App.tsx`; Settings, Import, Export and Edit are `<dialog>` modals |
| Styling | One global stylesheet, `src/index.css` (590 lines), plain CSS with custom properties and BEM-ish class names. No CSS framework, no CSS modules |
| Component library | None; hand-written components in `src/components/` |
| State | `useAppData()` in `lib/store.ts`: one `AppData` object persisted to `localStorage` (`bp.data`). All handlers live in `App.tsx` |
| Business logic | Pure functions in `src/lib/` (budget maths, recurring rules, plan/goals/alerts, CSV, currency). Well separated from the UI |
| Data source | 100% real user data from `localStorage`. App starts empty; legacy example data is flagged `sample: true` with a badge and a "Remove examples" banner |
| Network | Only exchange rates (ExchangeRate-API, fallback currency-api). No auth, no backend |
| PWA | Manifest, icons, `public/sw.js` (prod only); `build:artifact` makes a single-file HTML |
| Tests | Vitest, 6 files, **153 tests, all passing** — logic only (`lib/*.test.ts`); no component/UI tests |
| Lint / build | ESLint flat config (clean); `tsc -b && vite build` (succeeds, 318 kB JS / 26 kB CSS) |
| CI | `.github/workflows/deploy-pages.yml`: lint → test → build, deploys `main` to GitHub Pages |

## 2. Screen inventory

Everything is one scrolling page plus modals:

1. **Top bar** — logo + name, month switcher, Install / Import / Export / Settings text buttons
2. **Welcome card** (empty state: choose currency + 3 setup steps)
3. **Example-data banner** (legacy data only)
4. **Overspending alert banner** (near plan / over plan / over income)
5. **Stat tiles** — Income, Expenses, Net, Savings rate (with % vs last month)
6. **Monthly plan card** — income basis, allocation bar, free-to-spend meter, per-day amount
7. **Last 6 months** bar chart (click a month to jump)
8. **Where it went** donut + legend
9. **Monthly budgets** (view + inline edit)
10. **Savings goals** (progress, add/take money, edit, delete, emergency fund, auto-save)
11. **Transactions** list (search, filter, edit, delete, spread shares, foreign currency)
12. **Sidebar**: Add transaction form, Repeating panel (pause/resume/stop)
13. **Modals**: Settings (theme, base currency switch/convert, plan & alerts, categories, install help, delete all), Import CSV (mapping, preview, dedupe, currency), Export CSV, Edit transaction, New/Edit goal

## 3. UI/UX problems

- **No hierarchy.** Four equal stat tiles open the page; nothing says "this is your position". Net is no more prominent than savings rate.
- **Everything at once.** Plan, chart, donut, budgets, goals, transactions, form and repeating items all compete on one page (2,400 px tall on desktop, 3,800 px on mobile).
- **Red everywhere.** Every expense figure, expense bar and the Expenses tile is coral red, so normal spending reads as an error and real warnings (over budget) lose their signal.
- **Colour noise.** 12 saturated category colours, plus purple goal meters, ochre emergency fund and blue bills, compete with the green brand.
- **Inconsistent buttons.** Text-only ghost buttons for primary actions (Import, Export, Settings, New goal, Add money), a full-width primary in the form, a black pill for the active filter chip. Destructive and neutral actions look alike.
- **Inconsistent radii/spacing.** 6/8/9/10/12/14/16/99px radii; 2/4/6/8/10/12/14/16/22px gaps with no scale.
- **No iconography** apart from a pencil and a text "×"; month arrows are text glyphs (‹ ›).
- **Settings is a modal** even though it's a full configuration area.
- **Add transaction occupies a permanent column** even when the user is only reviewing.

## 4. Mobile problems (390 px)

- The desktop layout is stacked, not redesigned: 3,800 px of scrolling; the form and repeating panel come *before* the plan and charts.
- Top-bar actions are small text links (≈28 px tall) — below the 44 px touch-target guideline. Row edit/delete icons are 28 px.
- No persistent navigation; reaching Transactions means scrolling past everything.
- Toast sits over content at the bottom with no awareness of navigation.
- Stat tiles in a 2×2 grid at 22 px still wrap long currency values.
- Plan rows squeeze long hint text into narrow columns.
- No horizontal overflow was found (checked programmatically) — that part is fine.

## 5. Component inventory

| Component | Responsibility | Keep? |
| --- | --- | --- |
| `Modal` | native `<dialog>`, Esc/outside click | Keep, restyle; becomes a bottom sheet on mobile |
| `TransactionForm` | add + edit, currency/rate, repeat, spread, replace-rule logic | Keep logic untouched; host it in a modal |
| `TransactionList` | month list, search, filter, edit/delete | Keep; restyle rows, icons |
| `RecurringPanel` | repeating items, pause/resume/stop | Keep |
| `BudgetPanel` | budgets view/edit | Keep |
| `GoalsPanel` (+ `GoalForm`) | goals, money in/out, emergency fund | Keep; lift the goal modal to app level so it works from any page |
| `PlanCard` | monthly plan | Keep |
| `Charts` (`TrendChart`, `SpendingDonut`) | SVG charts | Keep; restyle via tokens |
| `SettingsDialog` | all settings | Keep sections; render as a page |
| `ImportDialog`, `ExportDialog` | CSV | Keep as modals |
| `CurrencySelect`, `RateField` | currency inputs | Keep |

Duplication: `fullDate` defined twice; `.meter` reused with three different colour overrides; four near-identical "tinted box" styles (`convert-box`, `switch-panel`, `share-options`, `replace-note`). No duplicated *components*.

## 6. Functionality that must be preserved

Transactions add/edit/delete (incl. one-off → repeating, "also change future payments", undo toasts); recurring monthly/yearly items with back-fill, pause/resume/stop (optionally deleting payments); spread payments (yearly rent ÷ 12); budgets; savings goals incl. emergency fund, suggested target, add/take money, income-share and automatic saving; monthly plan (income basis, bills, goals, emergency, free to spend, per day, shortfall); overspending alerts with sound and notifications and once-per-level logic; CSV import (mapping, date/amount formats, dedupe, foreign currency) and export (copy/download); multi-currency with live rates and manual rates; base-currency convert/relabel; custom categories with rename propagation; theme (system/light/dark); example-data removal; delete all data; PWA install/offline; the single-file artifact build. **No authentication exists**, so there's none to preserve.

## 7. Colour tokens: accessibility check

| Pair | Ratio | Verdict |
| --- | --- | --- |
| Primary text `#24332E` on cream `#F7F5EF` | 12.13 | AAA |
| Forest `#173F35` on white | 11.67 | AAA (buttons, links) |
| **Muted `#78847D` on cream** | **3.57** | **Fails AA for text** |
| **Muted `#78847D` on white** | **3.89** | **Fails AA for text** |
| **Sage `#A8BBA6` on white** | **2.03** | Decorative only, never text |
| Sage `#A8BBA6` on forest | 5.74 | OK for text on the forest hero |
| Proposed muted text `#5F6B64` on cream / white / light sage | 5.10 / 5.56 / 4.71 | AA |

Decision: muted *text* uses `#5F6B64`; the provisional `#78847D` is kept as `--text-subtle` for icons, placeholders and dividers only (≥3:1 for non-text UI on white).

## 8. Recommended redesign architecture

- **Keep** React + Vite + plain CSS + `lib/`. No new runtime dependencies.
- **Add lightweight hash routing** (`#/transactions`, ~40 lines in `lib/route.ts`). Reason: the brief asks for distinct sections with navigation; hash URLs work on GitHub Pages sub-paths and inside the single-file artifact without server config, and avoid adding `react-router`.
- **App shell**: desktop sidebar (≥1024 px), tablet icon rail (600–1023 px), mobile top bar + bottom tab bar + "More" sheet + floating Add button (<600 px).
- **Pages**: Overview, Transactions, Budgets, Savings, Insights (primary); Plans, Settings (secondary). All state and handlers stay in `App.tsx`; pages only arrange existing panels.
- **Design tokens** in `index.css` `:root` (colour, type scale, spacing, radii, shadows, motion; breakpoints documented as they can't be CSS variables in media queries), with light and dark themes.
- **Small shared UI kit** in `components/ui/`: `Icon`, `PageHeader`, `MonthSwitcher`, `EmptyState`, `ErrorBoundary`. Existing class-based primitives (`.btn-*`, `.card`, `.field`, `.meter`, `.pill`, `.badge`) remain the API and are restyled, not duplicated.
- **Colour semantics**: forest = brand/primary action; green = income; neutral text for normal spending; terracotta reserved for over-budget, over-plan and destructive actions; ochre for "near limit".

### "Total balance"

Elora records income and spending; it has no bank-account balances. To avoid presenting an invented figure, the hero shows **this month's balance (income − spending)**, which is the existing `totals().net`, labelled as such.

## 9. Files likely to change

`src/index.css` (rewrite), `src/App.tsx` (shell + pages, same handlers), new `src/lib/route.ts`, new `src/components/ui/*`, new `src/components/layout/*`, new `src/components/overview/*`, light edits to `TransactionForm` (optional initial type, no-card variant), `GoalsPanel` (export goal dialog), `SettingsDialog` (page variant), `TransactionList` (icons, row limit), `Charts` (tokens), brand strings in components, `index.html`, `public/manifest.webmanifest`, `public/icon.svg`, README. **No changes** to `src/lib/budget.ts`, `plan.ts`, `recurring.ts`, `csv.ts`, `currency.ts`, `store.ts` logic or the stored data shape.
