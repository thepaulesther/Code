# Redesign round 2: review findings and plan

Response to the external design review (13-screen brief). Calculations were investigated first; none were changed.

## Calculation investigation

Probed `buildPlan` (`src/lib/plan.ts`) with controlled inputs (3 months of £3,000 income, £1,000 rent).

| Case | Bills | Everyday spending | Left to spend | Verdict |
| --- | --- | --- | --- | --- |
| A. Rent set to repeat, paid this month | £1,000 | £0 | £2,000 | Correct, counted once |
| B. Same rent, rule **paused after** this month's payment | £0 | £0 | **£3,000** | **Bug**: the payment counts nowhere; left to spend is overstated |
| C. Rent typed by hand, not repeating | £0 | £1,000 | £2,000 | Leftover correct, but the plan's "Free to spend" reads £3,000 because one-off rent isn't a bill |
| D. Repeating item that **starts next month** | £1,000 | £0 | £2,000 | Conservative: set aside before its first payment |

**Overview £4,200 vs Plan £4,633.33** (from the screenshots): intentional. The Overview shows income *recorded this month*; the plan uses the *average of the 3 complete months before* (Aug £4,850 + Sep £4,200 + Oct £4,850 ÷ 3). Fixed by explaining both in the interface, not by changing either.

**No double counting** in any case: payments linked to a repeating item are reserved under bills and excluded from everyday spending; spread payments are counted by their monthly share.

**Needs your decision (not changed):**
- B: count a paused rule's already-made payments as everyday spending, or keep the rule's amount reserved for the month it was paused in.
- D: only reserve a repeating item from its start month.

## Plan (in priority order)

1. **Financial clarity**: one set of terms used everywhere: *Balance this month*, *Income*, *Spending*, *Savings rate*, *Free to spend* (the monthly allowance), *Left to spend* (what remains of it this month). Hero says the balance is recorded income minus recorded spending, not a bank balance. The plan states its income basis, compares it with this month's recorded income, and explains what counts as a bill. A "How these numbers are worked out" panel on the Plan page.
2. **Overview**: quieter supporting figures; one primary quick action; goals shown as rings and budgets as bars, so they don't look like the same feature; budget status in words, not only colour; trend card summarises the selected month in words; calmer insights; collapsible trend on phones; shortcuts to Plan and Insights.
3. **Mobile**: add-transaction sheet focuses the amount, keeps the submit button pinned, and resizes with the keyboard on Android; floating button no longer covers the last content.
4. **Pages**: Transactions gets a category filter, visible active filters and Clear; repeating payments are marked with an icon; Budgets show limit, spent and remaining in words; Savings leads with total saved and shows remaining per goal; Insights includes the written insights next to its charts, with comparable category bars; Plan leads with *Left to spend*.
5. **New users**: a five-step setup checklist (currency, income, spending, budgets, goal) with progress, skippable and dismissible; the empty dashboard sections stay out of the way until there is data.
6. **Your data**: Settings explains that clearing browser data or changing device removes it, and offers Export there.
