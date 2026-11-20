# Stage 2B — The new Dashboard: report

**Status:** done on branch `claude/brave-sagan-ma2do3`, in pull request #9 together with 2A (this session can only push to that branch). Plan: `09-stage-2-plan.md` §3. Design: the Elora Dashboard canvas.
**Labels:** **[V]** verified · **[A]** assumption · **[R]** recommendation.

## What changed

- **The Dashboard is the home page** (`#/`). The previous home page is now **Overview** (`#/overview`), still in the sidebar and the phone tab bar. New users see the setup steps on the Dashboard.
- **Balance card:**
  - The book's balance this month (income − spending ± transfers), with **In** and **Out**.
  - An **eye button** that hides every amount; the choice is remembered on the device.
  - **Add money** (**Record sale** in Business), plus **Pay yourself / Move money** when business mode is on.
  - The latest payment underneath, linking to all transactions.
- **Payments to sort:** shown when there are unsorted payments.
  - Each one has **Personal**, **Business** or **Split**.
  - **Split** opens a slider that shows both parts live, then **Save split**.
  - Sorting and splitting can be undone.
- **Money boxes:** the book's monthly budgets as small icon tiles, four to a row on phones, with short amounts (₦18.5K). A gold dot means nearly used; a red dot means over.
  - Tapping a tile opens: whether a repeating bill is set up, what's left (or how much over), about how much a day, **Add expense** (starting on that box's category) and **Edit**.
  - A **New box** tile goes to Budgets.
- **Savings and Free to spend tiles:** each opens its details (goals with progress, or the plan's split) and links to the full page. A note says interest comes later with a partner bank.
- **Pay yourself / Put money in:**
  - Moves money between the books as a transfer.
  - Shows both balances before and after.
  - Says plainly that it isn't spending and doesn't change profit.
- **The phone's + button** opens a short labelled menu:
  - **Personal:** Add expense, Add income, Move money between sides (business mode only), Move to savings, New money box.
  - **Business:** Record sale, Add expense, Pay yourself, Move to savings, New money box.
- **The add sheet says which side it adds to** when business mode is on.
- **CSV import in business mode** puts rows in "Payments to sort" instead of the book on screen (2A's open item).

## Checks

- **Lint and type check:** clean.
- **`npm test`:** 267 passed.
- **`npm run test:e2e`:** **86 passed, 4 skipped by design.**
  - **6 new Dashboard tests:** balance and boxes, add from a box, hide amounts across a reload, sort/split/undo, Pay yourself, the phone + menu, and axe WCAG 2.2 AA in light and dark with a box, a split and the savings panel open.
  - **Existing tests:** updated to open Overview where they test it; the phone "add" helper now uses the + menu.
- **Builds:** both succeed.
- **Screenshots checked:** phone (light), phone in business mode with a split open, and desktop (dark).

**Found and fixed by the checks:**
1. The eye button's spoken name didn't include its visible text.
2. The gold savings figure was too faint on a hovered tile (the pair the brand book flags); it's now in text colour.
3. Tile amounts were cut off on phones; they now use short amounts.

## Different from the canvas design, and why

1. **Bottom bar:** it keeps the app's existing tabs (Dashboard, Overview, Transactions, Savings, More) with the + floating above, instead of a + in the middle of the bar. The tab bar is shared by every page, so changing it is a separate change.
2. **No Ask Elora bar.** The assistant isn't built yet, so an empty input would mislead.
3. **Repeats is worked out, not stored:** a box "repeats" when a repeating bill exists for that category. A separate setting would be a second source of truth.
4. **Pay yourself doesn't repeat yet.** A monthly transfer needs repeating transfers in the data. **[R]** Add them with Stage 3.
5. **The + menu is phones only.** On a computer the same actions are on the balance card and the page's Add button.

## Recommended next task

Review and merge pull request #9 (2A and 2B). Then Stage 3: accounts and sign-in, repeating transfers, and the F4 fix with historical exchange rates.
