# Elora design system

All tokens live at the top of `src/index.css` as CSS custom properties, with light and dark values. Components use the semantic tokens, never raw hex.

## One combined look

Elora's look combines the original Forest palette with the Tide brand (commit `efd4f4f`):

- **From Forest:** forest `#173F35`, sage `#A8BBA6` and cream `#F7F5EF`, and the forest-filled balance hero.
- **From Tide:**
  - the dawn-over-tide mark (redrawn on a forest tile, also the app icon) and the outlined lowercase "elora" wordmark;
  - Sora for headings and amounts and Figtree for text, bundled via `@fontsource` so they work offline, with no font host contacted;
  - dawn gold `#9E6A0A` for savings progress and the plan's savings segment;
  - blue `#1D6385` for money in and orange-red `#B4472A` for spending totals in stat tiles and charts, distinct for colour-blind readers (list rows keep spending in plain text);
  - uppercase stat labels.

The table below lists the forest tokens. Where Tide changed a value, the bullets above win: `--income`, `--money-out`, `--savings`, `--chart-income` and `--chart-expense`.

## Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#F7F5EF` cream | `#0E1714` | Page background |
| `--surface` | `#FFFFFF` | `#15201C` | Cards, sheets |
| `--surface-2` | `#F0EDE4` | `#1B2823` | Tracks, tinted panels, hover |
| `--accent-soft` | `#E7EEE5` light sage | `#1F302A` | Active nav, icon tiles, selected chips |
| `--border` / `--border-strong` | `#E4E1D7` / `#D2CFC3` | `#26352F` / `#34463E` | Card edges / inputs |
| `--text` | `#24332E` | `#E8EDE8` | Body text and normal spending |
| `--muted` | `#5F6B64` | `#A3B0A8` | Secondary text |
| `--subtle` | `#78847D` | `#7F8C85` | Icons, placeholders. **Not for text** (3.6:1 on cream) |
| `--accent` | `#173F35` forest | `#A8C4AE` sage | Primary buttons, active states |
| `--hero-bg` | `#173F35` | `#173F35` | The balance hero only |
| `--income` | `#1D6385` | `#7FC4E8` | Money in |
| `--money-out` | `#B4472A` | `#F2946F` | Spending totals in stat tiles and charts |
| `--savings` | `#9E6A0A` dawn gold | `#F0C26A` | Goal progress, the plan's savings segment |
| `--danger` | `#A8472F` | `#EE8F76` | Over budget, over plan, destructive actions |
| `--warn` | `#8F6410` | `#E3B45A` | Approaching a limit |
| `--cat-1…12` | earthy set | lighter set | Category colours; each ≥3:1 on white |

Rules:

- **Forest fills one surface**: the balance hero. Everywhere else forest is for primary buttons, links and active states.
- **Spending isn't red.** Expense amounts use `--text`. Red is kept for warnings, so it stays meaningful.
- Sage `#A8BBA6` is decorative on light surfaces (2:1); as text it appears only on forest (5.7:1).

Checked ratios: text 12.1:1 on cream; muted 5.1:1 on cream and 4.7:1 on light sage; accent 11.7:1 on white; danger 5.0:1 on `--surface-2`; dark-mode primary button 7.7:1. An axe-core scan of every page in both themes at desktop and phone widths reports no WCAG 2.2 A/AA violations.

## Typography

Sora (headings, amounts) and Figtree (text), bundled; system fonts as fallback. Scale: 12, 13, 14, 15 (body), 17, 20, 26, 34 (page title), 44 (hero; 38 on phones). Weights 400–700, tabular numerals (`.num`) for every amount, `-0.02em` tracking on large figures.

## Spacing, radii, elevation

- Spacing: 4px base (`--space-1` 4 … `--space-12` 48). Cards pad 20px (16px on phones); sections gap 20–24px.
- Radii: 6 (badges), 8 (inputs, small buttons), 12 (buttons, tiles), 16 (cards), 20 (hero, sheets). Fully round only for pills and progress tracks.
- Shadows: `--shadow-xs` (controls), `--shadow-sm` (cards), `--shadow-md` (floating button), `--shadow-lg` (dialogs, toast). Dark mode drops card shadows and relies on borders.

## Breakpoints

| Range | Navigation |
| --- | --- |
| < 600px | Top bar, bottom tab bar (Overview, Transactions, Budgets, Savings, More), floating add button, dialogs as bottom sheets |
| 600–1023px | 92px icon rail |
| ≥ 1024px | 248px sidebar |
| ≥ 1280px | Wider page gutters |

Touch devices (`pointer: coarse`) get 40px+ secondary controls; primary controls are 42–46px. Safe-area insets are respected by the top bar, tab bar, floating button, sheets and toast.

## Components

| Component | Where | Notes |
| --- | --- | --- |
| Buttons | `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.icon-btn`, `.link-btn`, `.link-more` | One height scale; disabled at 45% opacity |
| Card | `.card` + `.card-head` (`h2` + optional `.card-sub`, action on the right) | No cards inside cards; inner panels use one tinted style (`.inset` family) |
| Inputs | `.field`, `.money-input`, selects | One style with a focus ring; custom select chevron |
| Segmented / chips | `.segmented`, `.chip` (`aria-pressed`) | |
| Progress | `.meter` + `.meter-fill`, `.state-warn` / `.state-over` | Budgets, goals, plan |
| Rows | `.rows` (category avatar, title, sub, amount, actions); `.rows.compact` for glance lists | |
| Icons | `ui/Icon.tsx` | One 24px grid, 1.75 stroke, decorative (`aria-hidden`) |
| Page header | `ui/PageHeader.tsx`, `MonthSwitcher` | Heading receives focus on navigation |
| Empty state | `ui/EmptyState.tsx` | Icon, title, one sentence, optional action |
| Error state | `ui/ErrorBoundary.tsx` | Per page; says data is safe and offers reload |
| Dialog | `Modal.tsx` | Native `<dialog>`; bottom sheet on phones |
| Alerts, toast | `.alert-banner`, `.toast` | Toast offers Undo for every change |

Summary views reuse their full component (`BudgetPanel summary`, `GoalsPanel summary`, `TransactionList recent`) instead of duplicating it.
