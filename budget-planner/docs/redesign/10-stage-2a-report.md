# Stage 2A — Money and books: report

**Status:** done on branch `claude/brave-sagan-ma2do3`, not merged. Plan: `09-stage-2-plan.md` (approved).
**Labels:** **[V]** verified · **[A]** assumption · **[R]** recommendation.

## What changed

### Data format v3, one upgrade
- Saved data is now **format v3**. Version 2 data is upgraded once, on first open, after a verified safety copy (the Stage 0.5 snapshot system) **[V: browser test]**.
- **Everything existing goes to Personal**, and an empty **Business** book is added with business categories (Stock, Shop rent, Staff pay, Transport and delivery, Tax, Utilities, Equipment, Other; income: Sales, Services, Other income).
- **Amounts are saved as whole minor units**, with each currency's own precision: kobo for NGN, cents for USD, whole yen for JPY. A foreign original keeps its own currency's units **[V: unit tests]**.
- The upgrade never changes its input, and every amount reads back exactly. A test checks that month totals are identical before and after **[V]**.
- A failed or partial upgrade changes nothing and shows the recovery screen, as before.

### Two books
- **Screens work on one book at a time** (`viewOf` and `mergeView` in `src/lib/books.ts`), so every existing feature works unchanged within each book.
- **Shared between the books:** currency, theme, alerts, number format and business mode. **Separate per book:** categories, budgets, goals, repeating items, the plan and the alerts history.
- **Repeating items** come due in both books, whichever one is on screen. **Delete all data**, **backups** and **currency changes** cover both books.

### Transfers, splits, unsorted, accounts (data and calculations)
- **Transfers** (e.g. Pay yourself) change each book's balance but are never income or spending. Moving money between books leaves combined wealth unchanged **[V]**.
- **Splits** are saved as two linked entries sharing a `splitId`; the parts always add up to the whole, and impossible splits are refused **[V]**.
- **Unsorted** payments can be placed in a book or split **[V]**.
- **One "Main" account per book** is stored, ready for bank-linked accounts later.

### Business mode
- **Off by default.** Settings › Business › "I also run a business" turns it on.
- When on, every page shows a **Personal / Business switch** at the top, and a gold **Business** tag while viewing Business.
- Turning it off hides the switch and keeps the business data.

### Nigeria first
- **New users get Nigerian number and date formats** (`en-NG`, e.g. "16 Nov 2026"). Existing users keep their device's format.
- **Settings › Number and date format** lets anyone choose: Nigeria, Ghana, Kenya, South Africa, UK, US or the device's format.
- **Currency menus list the naira first**, then other African currencies.

### Also
- **CSV export** adds a "side" column (Personal or Business) when business mode is on.
- **Vitest upgraded from 3.2 to 5.1**, in its own commit (development only).

## Checks

- `npm run lint`: clean.
- `npm test`: **267 passed** (251 before; 16 new in `books.test.ts`).
- `npm run test:e2e`: **75 passed, 3 skipped by design** (72 before, plus 2 new: the one-time upgrade with its safety copy, and business mode keeping the books apart).
- `npm run build` and `npm run build:artifact`: both succeed.
- `npm audit --omit=dev`: 0 vulnerabilities. Full `npm audit` reports 7 moderate notices in typescript-eslint's copy of minimatch: development only, not shipped, and present before this stage.

## Where this differs from the plan

1. **Calculations still run in naira, rounded to the kobo, as before.** Amounts are stored and backed up in kobo, and converted exactly at load and save. Moving every calculation to integer kobo would touch every screen for no visible gain, so it wasn't done **[R]**.
2. **F4 is not fixed.** When the base currency changes with "convert", past amounts still use one rate. A real fix needs the exchange rate *on each past date*, which the app doesn't have offline. **[R]** Fix it once there's a server with a rate history (Stage 3), or ask for a rate per month when converting.
3. **New users still choose their currency.** The naira is first in the list, and the format defaults to Nigerian. Picking NGN automatically would skip the "choose your currency" setup step, so it wasn't done.
4. **CSV import still goes into the book on screen.** Imported rows should go to Unsorted, but that is only useful once the Dashboard's Unsorted strip exists (2B), or the rows would be invisible.
5. **Transfers, splits and unsorted have no screens yet.** They are tested in code; their screens come in 2B (Pay yourself, Split, the Unsorted strip).

## Recommended next task

**Stage 2B: the new Dashboard** from the canvas design, using this data layer: the balance card, Unsorted strip, money-box tiles, Savings and Financial plan tiles, bottom bar and + menu, Add with "Adding to" and Split, and Pay yourself. Also: CSV import into Unsorted when business mode is on.
