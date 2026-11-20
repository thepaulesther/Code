# Stage 2 — Money and books: implementation plan

**Status:** proposed, awaiting approval. No code has been changed for Stage 2.
**Based on:** the "Recommended next task" in `08-stage-1-report.md` (minor units with a v2→v3 migration and backup, a Main account, transfers, F4, NGN and locale settings), plus the product decisions made since:

- Nigeria is the base country; naira first.
- Two modes, **Personal** and **Business** (sole traders, market sellers, small businesses).
- Elora sees and advises now; moving money and interest come later through licensed partners. Elora never holds money.
- The new **Dashboard** design on the Elora Dashboard canvas: balance with money in and out, an "Unsorted" strip, money boxes as small icon tiles, Savings and Financial plan tiles, one + button, a bottom bar (Dashboard, Overview, +, Activity, Me).
- Separating business from personal money: every entry belongs to one side; transfers between sides ("Pay yourself") are not spending; payments can be split; unclear payments wait in "Unsorted".

**Labels:** **[V]** verified · **[A]** assumption · **[R]** recommendation.

---

## 1. Why this order

The new Dashboard needs data the app doesn't store yet: which side (Personal or Business) an entry belongs to, transfers, splits and "unsorted". Stage 2 was already going to change how amounts are stored (minor units). Doing both in **one** data-format change means one migration, one automatic safety copy and one set of migration tests, instead of two. **[R]**

So Stage 2 has two parts, each its own pull request:

- **2A — Money and books (data).** The v3 format and everything that calculates with it. Small visible changes only.
- **2B — The new Dashboard (screens).** Built from the canvas design, on top of 2A.

Planning features (carry-over, budget roll-over) move from Stage 3 to Stage 4. Stage 3 becomes accounts and sign-in, as in the product roadmap.

## 2. Part 2A — Money and books

### 2.1 One new data format (v3), one migration

Today's format is version 2 (`src/lib/migrations.ts`, `CURRENT_VERSION = 2`) **[V]**. v3 adds:

| Change | Today **[V]** | In v3 |
| --- | --- | --- |
| Amounts | Naira as decimals (`amount: 4200.5`) | Whole kobo (`amount: 420050`), so totals never drift by fractions of a kobo |
| Which side | None | Every transaction, repeating item, budget and goal has `book: 'personal' \| 'business'` |
| Unsorted | None | A transaction may have `book: null` until sorted (CSV imports now; bank connections later) |
| Transfers | None | New type `transfer`, with `from` and `to` books. Counted in neither income nor spending |
| Splits | None | A split payment is saved as two linked transactions sharing a `splitId`, one per side **[R]** |
| Main account | None | One "Main" account per book, so bank-linked accounts can be added later without another format change |
| Exchange rates (F4) | Only today's rate is kept | Each converted entry keeps the rate it was converted at, so changing the base currency never rewrites history |

**Migration rules:** every existing entry goes to **Personal** (nothing is lost or guessed); amounts are converted to kobo with exact rounding; a safety copy is taken first (Stage 0.5's snapshot system **[V]**); and a failed migration leaves the stored data untouched and shows the recovery screen.

**Older cached app versions:** Stage 0.5 made the app refuse to overwrite data it can't read (`05-stage-0.5-plan.md` §2, fixed in 3.1) **[V]**. An old copy of the app opening v3 data shows the recovery screen instead of wiping it. This stage adds a browser test for exactly that case.

### 2.2 Business mode

- **Off by default.** Turned on in Settings ("I also run a business"), or at setup. With it off, the app looks and behaves as today. **[R]**
- **Switching mode** changes which book the screens show and where new entries go.
- **Separate figures:** income, spending, budgets, the plan and alerts are calculated per book. Transfers move money between books without counting as income or spending; a split counts each part on its own side.
- **"Everything" totals** (both books, transfers excluded) are available for the Overview page in 2B.

### 2.3 Nigeria first

- New users default to **NGN** and `en-NG` number and date formatting. Existing users keep their currency.
- A **country and format** setting replaces "whatever the browser says" **[V: today formatting follows the browser locale]**.
- Business categories ready to use: stock, shop rent, staff pay, transport and delivery, tax, pay yourself.

### 2.4 Also in 2A

- **Backups and CSV:** the backup format carries books, transfers and splits; CSV export adds a "Side" column; CSV import puts rows without a side into Unsorted.
- **The Vitest 5 upgrade** as a separate small commit, as recommended in the Stage 1 report.

## 3. Part 2B — The new Dashboard

Built from the approved canvas screens, replacing today's Overview as the home screen:

1. **Header:** greeting, Personal/Business switch (only when business mode is on), notifications.
2. **Balance card:** balance, money in and out, hide-amounts eye, latest payment strip. A gold "Business" tag and edge in business mode.
3. **Unsorted strip:** sort a payment with one tap (Personal, Business or Split with a slider). Elora remembers the choice for the same payee next time.
4. **Money boxes:** small icon tiles, four to a row. Tapping one opens: repeats or not, left to spend or set aside, about a day, Add expense, Edit. A box is today's category budget plus a "repeats" flag; savings-type boxes are linked to goals. **[R]**
5. **Savings** and **Financial plan** tiles.
6. **Bottom bar** with Dashboard, Overview, +, Activity, Me. The + opens Add expense, Add income, Move to savings, Move between boxes, New money box (Record sale and Pay yourself in business mode).
7. **New screens:** Add expense or income with "Adding to" and Split; Pay yourself, with "safe to pay yourself" worked out after the business boxes are covered.
8. **Overview** keeps today's charts and insights, and gains the "Everything" view.

Same standards as earlier stages: works offline, phone first, light and dark, WCAG 2.2 AA (automated checks on every page), no new runtime dependencies. **[R]**

## 4. Files expected to change

- **2A:** `src/lib/migrations.ts` (v2→v3), `store.ts` (types, validation), `budget.ts`, `plan.ts`, `recurring.ts`, `insights.ts` (per-book totals, transfers, splits, kobo), `currency.ts` (F4), `format.ts` (locale), `backup.ts`, `csv.ts`, Settings (business mode, country and format), and their tests.
- **2B:** a new Dashboard screen and components (balance card, unsorted strip, box tiles and detail, bottom bar and + menu), Add and Pay-yourself sheets, `App.tsx` and `AppShell.tsx` navigation, `index.css`, and new browser tests.

## 5. Risks to user data and how each is handled

| Risk | Handling |
| --- | --- |
| Migration loses or changes amounts | Safety copy first; exact kobo conversion; tests that every v2 amount survives to the kobo and totals are unchanged before and after |
| Old cached app meets v3 data | Recovery screen, not a wipe (Stage 0.5); new browser test |
| Transfers or splits counted twice | Unit tests: totals per book and "Everything" with transfers and splits; Pay yourself leaves combined wealth unchanged |
| Restore of an old v2 backup | Runs through the same migration |
| Wrong side chosen | Every entry can be moved or split afterwards |

## 6. Out of scope for Stage 2

Accounts, sign-in and any server; bank connections; real money movement, auto-save and interest; the AI assistant and voice entry; carry-over and budget roll-over (now Stage 4); multi-currency business books.

## 7. Decisions needed before I start

1. **Approve the order:** 2A (data) first, then 2B (Dashboard), as two pull requests.
2. **Business mode off by default**, turned on in Settings or at setup. OK?
3. **Splits as two linked entries** (one per side) rather than one entry with parts. Simpler totals and exports; editing one part offers to edit both. OK?
4. **Money boxes = category budgets plus a "repeats" flag**, savings boxes linked to goals, so existing budgets become boxes automatically. OK?
5. **Existing data all goes to Personal** in the migration. OK?
6. **New users default to NGN and Nigerian formatting.** Existing users keep their settings. OK?
