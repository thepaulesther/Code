# Stage 3A — Repeating transfers and sync groundwork: report

**Status:** built and tested, awaiting review.
**Plan:** `12-stage-3-plan.md` §2. No server is involved; everything still stays on the device.

## What changed for people using Elora

- **Pay yourself every month.** In *Pay yourself* (or *Put money in*), tick **Repeat every month** and pick a day. Elora then moves that amount on that day each month, on its own.
  - **Never back-dated.** If the day has already passed this month, the first one is next month. If it's today, the first one happens straight away. A day after the 28th uses the month's last day in shorter months.
  - **Only if there's enough** (on by default): a month where the sending side's balance doesn't cover the amount is skipped, not made. If this month's one would be skipped, the form says so before saving.
  - **Stop any time** from the same screen. Transfers already made stay. Every action can be undone from the message that appears.
  - Like one-off transfers, these are never income or spending, so profit is unchanged.

## What changed underneath

**Data format v4** (upgraded automatically, after the same safety copy as every earlier upgrade):

| Addition | What it's for |
| --- | --- |
| `repeatingTransfers` | The monthly transfers above |
| `updatedAt` on every transaction, repeating item, goal, transfer and payment to sort | When two devices are merged later (3B), the latest change to each record wins |
| `tombstones` (deletion markers, last 2,000 kept) | A record deleted on one device doesn't come back from the other. Records moved, e.g. sorted from "to sort" into a book, aren't counted as deleted |
| `rateLog` | Each change of base currency with the rate used, so 3C can redo past amounts with each day's own rate |

Change times are set in one place on every save, so no screen needs to remember to do it. Opening the app still writes nothing when nothing has changed (tested). A restored backup counts as a change, so its records are stamped with the time of the restore.

## Tests

- **Unit: 289 passed** (13 new in `src/lib/sync-groundwork.test.ts`): start month and no back-dating, today's one made at once, catching up missed months once each, month-end days, skipping when the sending side can't cover it, stop and pause, exact save and read-back, change times only on changed records, deletion markers but not for moved records, v3 → v4 upgrade with nothing else changed, the rate log for converting and relabelling.
- **Browser: 100 passed, 4 skipped** (phone-only and desktop-only tests skip on the other) across desktop and phone: setting up and stopping a monthly Pay yourself, plus a WCAG 2.2 AA check of the form with a repeat set up, in light and dark.

## Not in this part

- Accounts, sign-in and sync (3B): Supabase, email and Google sign-in, standard encryption, as agreed. Needs you to create the Supabase project and share its keys through the secure form, and a privacy policy (I'll draft one for a lawyer to check).
- Daily rate history and converting past amounts at their own day's rate (3C).
