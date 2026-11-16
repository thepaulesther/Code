# Stage 0.5 — Stabilisation: report

**Plan:** `05-stage-0.5-plan.md` (revision 2, approved). **Hosting assessment:** `06-netlify-assessment.md`.
**Branch:** `claude/elora-ui-redesign-system-qd0dnz`, restarted from `main` after PR #4 was merged.

## Objective

Make Elora's local data safe to evolve before larger changes:
- backup and restore
- versioned migrations with safety copies
- no silent overwrites
- the F5 and F6 planning fixes
- browser and accessibility tests in CI
- a hosting assessment

## Commits

| Commit | What |
| --- | --- |
| `40ae92f` (in PR #4) | Step 0: the PR #4 review fixes |
| `5ce675b` | Never overwrite unreadable or newer data; versioned migrations; safety copies; recovery screen; multi-tab sync; save-failure notice |
| `cbb250b` | Full JSON backup and restore; safety copies before restore and before "Delete all data"; storage disclosure |
| `10512dd` | F5 (paused bills) and F6 (no set-aside before a bill starts), with regression tests A–D |
| `8fa819c` | Playwright and axe tests in the repo and CI; dependency updates; chart accessibility fix |
| (this commit) | Netlify assessment and this report |

## Existing behaviour inspected

- **`store.ts`:** `loadData()` and `useAppData()`, which held the data-loss path.
- **`plan.ts`:** `buildPlan()` bills and everyday spending.
- **`storage.ts`:** the storage helpers.
- **`ExportDialog`:** the CSV export only.
- **The CI workflow.**
- **`npm audit` output.**

## Design and data changes

- **No change to the stored data format** (still version 2, key `bp.data`). Existing data loads as before. Load-time validation is no stricter than before; the strict, record-by-record checks apply only to files being restored.
- **New storage keys:**
  - `bp.snapshot.<reason>.<time>`: safety copies, newest three kept
  - `bp.unreadable.<time>`: a copy kept before "Start fresh"
  - `elora.setup`: the setup guide's per-device state, from PR #4
- **Opening the app now writes nothing unless something changed.** Before, it rewrote the data on every load.
- **One calculation change, F5 and F6, as approved:**
  - **F5:** a paused bill's payment this month counts under Bills.
  - **F6:** repeating items count from their start month.
  - **Effect:** only Bills, Free to spend and Left to spend change, and only in those two situations.

## Security and privacy

- Settings now says plainly that data is stored **unencrypted**, can be read by anyone using the browser profile and by other scripts on the same website address, and shouldn't be used on shared computers.
- The backup checksum is described as an integrity check, never as security.
- Backups are files the user controls; Elora sends nothing anywhere.
- **Dependencies:**
  - Shipped: still 0 known vulnerabilities.
  - Development: vitest patched (3.2.4 → 3.2.7).
  - New test-only packages, all pinned exactly and published more than two weeks ago: `@playwright/test` 1.63.0, `@axe-core/playwright` 4.14.0 and `@types/node` 22.20.5.
- **Security headers drafted and tested:** the full browser suite passes under the proposed Content-Security-Policy and related headers (see the assessment). Nothing is deployed.

## Tests added or changed

| Area | Tests |
| --- | --- |
| Migrations and load states | 13 unit tests: every state; quota failures; the original format upgraded with a verified safety copy; stored text unchanged for newer or unreadable data |
| Backup | 21 unit tests: exact round trip; tampered, newer, incomplete and foreign files refused; every validation rule |
| Plan F5/F6 | 6 unit tests (cases A–D); all 23 existing plan tests unchanged |
| Month comparison (step 0) | 8 + 1 unit tests |
| Browser journeys | 10 tests × desktop and phone |
| Data safety | Recovery screens, no-overwrite checks comparing stored text before and after, two-tab sync, backup round trip, refused files, undo, safety copies |
| Offline | The service worker serves the app with the network off |
| Layout | 8 widths × 7 pages × light and dark |
| Accessibility | axe WCAG 2.2 A/AA on every page, the new-user Overview, the add sheet and the restore dialog, both themes |

## Commands run and results (branch head, after a clean `npm ci`)

| Command | Result |
| --- | --- |
| `npm run lint` | 0 problems |
| `npx tsc -b` (app, config and test files) | 0 errors |
| `npm test` | **214 passed** (11 files) |
| `npm run build` / `npm run build:artifact` | Both succeed (71 modules) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:e2e` | **41 passed, 3 skipped by design**, 36 s. The skips: the tab test is desktop-only; the layout sweep runs once |
| `test:e2e` under the proposed security headers | 41 passed, 3 skipped |

CI runs the same commands on the pull request (`build` and the new `e2e` job). Results are reported on the PR.

## Acceptance criteria (from the approved plan)

| Criterion | Status |
| --- | --- |
| PR #4 inspected, findings fixed, merged by you | Done |
| Full JSON backup preserves all financial data and settings | Done; round trip tested to be exact |
| Restore validates before replacing; never replaces without confirmation | Done; refused files leave data untouched (tested) |
| Versioned migrations; recoverable snapshot before each | Done; no snapshot means no upgrade (tested) |
| F5 and F6 fixed, with regression tests | Done |
| Browser and accessibility tests in the repo and CI | Done (CI result on the PR) |
| Development dependencies reviewed and safely updated | Done; remaining items below |
| Offline still works | Done (tested) |
| CSV import and export still work | Done (tested) |
| Hosting compared; no migration without approval | Assessment written; pricing to be verified (Netlify unreachable here) |
| Storage risks communicated without overclaiming | Done |

## Known limitations and open items

1. **Vitest 5:** two critical and eight moderate advisories remain, all in **development-only** tooling (the test runner's UI/API server and worker options, which this project doesn't use, and a lint helper). They need Vitest 5, a major upgrade. I recommend doing it as a small separate task.
2. **Netlify details are unverified:** prices, plan limits, commercial-use terms and exact config syntax couldn't be checked from here.
3. **Real devices:** not tested on a real iOS or Android device with an on-screen keyboard; only emulated phones and a keyboard-height viewport.
4. **Restore only replaces:** merging two datasets isn't supported; that would be a new feature.
5. **The old CSV export** still holds transactions only, by design; the full backup is the complete option.
6. **F4** (keep historical exchange rates when the base currency changes) is scheduled for Stage 2 with the minor-units migration, as approved.
7. **Exchange-rate hosts:** the tests block external requests, so the live exchange-rate calls weren't exercised under the new headers.

## Recommended next task

Review this stage. When you approve:
- **Stage 1:** an Upcoming bills module on the Overview, built from existing data, and optional section reordering.
- **Separately, a small one:** the Vitest 5 upgrade.
- **Hosting:** check the Netlify items in §7 of the assessment.
