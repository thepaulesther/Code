# Stage 0.5 — Stabilisation: implementation plan

**Status:** revision 2, proposed, awaiting approval. No code has been changed for Stage 0.5.
**Based on:** *Final Phase 0 Decisions & Development Approval*, the follow-up decisions (local-first; minor units; fix F4, F5 and F6; Main account; move towards Netlify and an Elora domain; inspect PR #4 without merging; Nigeria first) and `04-phase0-audit.md`.
**Labels:** **[V]** verified · **[A]** assumption · **[R]** recommendation.

---

## 1. PR #4 inspection

| Check | Result |
| --- | --- |
| State | Open, not a draft, not merged [V] |
| Branch | `claude/elora-ui-redesign-system-qd0dnz` → `main`; 13 commits; 42 files; +3,705 / −870 [V] |
| Conflicts | None. GitHub reports `mergeable_state: clean`, and `main` hasn't moved since the branch was created (`644642c`) [V] |
| CI on the latest commit (`8f0842f`) | `build` (lint, unit tests, production build) **passed**; `deploy` skipped, as expected for a pull request [V] |
| Local run | 165/165 unit tests pass and lint is clean (run during the audit) [V] |
| Reviews | None from people. 12 comments, all from the ECC Tools bot: the security-evidence gate **passed** on every commit. Its only relevant note is "user-facing UI changes may ship without browser coverage", which item 3.6 below addresses. The other notes (RAG corpora, analyzer fixtures, harness compatibility) don't apply to this project [V] |
| Description | **Out of date.** It describes round 1 only; it doesn't mention round 2 (financial clarity, setup guide, filters) or the Phase 0 audit [V] |

### Full-diff review and test run (head `0f731ae`)

**Tests run against a clean install (`npm ci`) [V]:**

| Layer | Result |
| --- | --- |
| Lint | Clean |
| Unit tests | 165/165 pass |
| Type-check (`tsc -b`) | No errors |
| Production build and single-file build | Both succeed |
| Browser regression (72 checks, desktop and phone) | 72/72 pass, no console errors |
| Layout sweep (8 widths × 7 pages × light and dark) | 112 renders, no faults |
| Add-transaction sheet (4 phone sizes, including a keyboard-height viewport) | Pass |
| axe WCAG 2.2 A/AA | 36/36 scans, no violations |

**Money logic [V]:** the PR changes none. Of `budget.ts`, `plan.ts`, `recurring.ts`, `store.ts`, `csv.ts` and `currency.ts`, only `csv.ts` differs, and only by a brand name in a comment.

**Code review:** by the installed ECC `react-reviewer` and `typescript-reviewer` agents, each finding then checked by hand. No high-severity defects. Findings confirmed in the code:

| # | Severity | Finding | Where |
| --- | --- | --- | --- |
| P1 | Medium | The "Spending is up/down X% on <last month>" insight compares a partly finished month with a whole one. On the 3rd it can say "down 85%" with a positive tone. The "so far" note is only in the detail line | `src/lib/insights.ts:94` |
| P2 | Medium | The "▲/▼ X% vs last month" lines under Income and Spending have the same partial-month problem. **Already on `main`** (the old stat tiles); the PR carried it into the hero | `src/components/overview/BalanceHero.tsx:6`, `src/App.tsx` (`delta`) |
| P3 | Medium | Savings "Progress" adds up money saved beyond a goal's target, so it can overstate overall progress (goal A 150 of 100 and goal B 0 of 100 shows 75%) | `src/App.tsx:676` |
| P4 | Medium | A new user who presses "Hide guide" sees the floating add button beside the quick actions; the visibility check doesn't re-run when the guide is hidden | `src/App.tsx:377` (effect dependencies) |
| P5 | Medium | Keyboard and screen-reader focus is lost when "Skip for now" or "Hide guide" removes the focused button | `src/components/overview/SetupGuide.tsx` |
| P6 | Low | "Delete all data" keeps the guide's per-device state, so a user who had hidden it gets an empty app with no guide | `src/App.tsx:754`, `src/lib/setup.ts` |
| P7 | Low | Two quick "Skip" presses can drop one, because the update reads a stale value | `src/lib/setup.ts:32` |
| P8 | Low | Repeating the same validation error doesn't scroll it into view again | `src/components/TransactionForm.tsx` |
| P9 | Low | In development only (React StrictMode), the first page load moves focus to the heading | `src/App.tsx` route effect |

Reviewed and found fine: hash routing, `useIsPhone`, the trend chart's keyboard access, category filter state, the budget and goal summary modes, the goal dialog moved to app level, Undo, Settings reset and export wiring, and storage error handling. The service-worker cache keeps its old name, but `sw.js` changed, so a new worker installs and re-fetches the icons and manifest. Not a problem.

**Recommendation [R]:** fix P1–P8 on the PR branch (step 0 below; P9 is development-only and is fixed alongside), re-run every test layer, update the PR description to cover rounds 1 and 2 and the audit, then you decide on the merge. I won't merge it. Stage 0.5 then starts from `main` as its own PR.

## 2. A data-loss path that exists today

Found while designing the migrations [V]. In `src/lib/store.ts`:

- `loadData()` returns **empty data** whenever the saved data fails `isAppData()`. That happens if the version isn't exactly 2, a budget value isn't a number, or a save was only partly written.
- `useAppData()` then saves that empty data straight away (`useEffect(() => writeJSON(KEY, data))`), **overwriting what was stored**.

Today this needs corrupted storage. **Once a v3 data format exists (Stage 2), it becomes likely:** a phone running an older cached app version would see the v3 data as invalid and wipe it.

A second, smaller risk [V]: two open tabs each save their whole copy, so the last tab to save silently undoes changes made in the other.

**Both are fixed in item 3.1 below, before any migration can ship.**

## 3. Scope

Each item is listed with what it changes and how it will be tested.

### 3.0 Step 0: fix the PR #4 review findings (on the PR branch, before merge)

- **P1, P2:** for the current month, compare with the previous month **up to the same day** ("vs the same point last month"), using the same `effectiveInMonth` totals; past months compare whole months. A neutral tone when the comparison is partial. One shared helper replaces the two duplicated ones. Unit tests: 3rd of the month, last day, empty previous month, 29–31-day months.
- **P3:** Progress counts each goal up to its target. "Saved so far" stays the real total.
- **P4:** the visibility check also re-runs when the guide is shown or hidden.
- **P5:** after Skip, focus moves to the next step's button; after Hide, to the page heading.
- **P6:** "Delete all data" also resets the guide's state.
- **P7:** the skip and un-skip updates use the latest value.
- **P8:** a repeated error scrolls into view again.
- **P9:** the route effect compares with the previous route rather than a "first run" flag.

These change presentation only. P1 and P2 change which figures are compared, not how anything is calculated or stored.

### 3.1 Protect stored data on load (no-overwrite guarantee)

- Replace `loadData()` with `openStore()`, which reports one of these states:

  | State | What happens |
  | --- | --- |
  | `ok` | Load normally |
  | `migrated` | An older format was upgraded (§3.3) |
  | `newer` | Saved by a newer version of Elora |
  | `unreadable` | Fails validation |
  | `empty` | First visit |

- **`newer` and `unreadable` never write to `bp.data`.** The app shows a recovery screen instead:
  - It explains what happened in plain words.
  - It offers to **download the stored data exactly as it is**.
  - For `newer`, it offers to reload so the app updates. For `unreadable`, it offers to start fresh, which needs an explicit confirmation and first copies the unreadable data to a separate quarantine key.
- **No save happens until loading has succeeded.**
- **Multiple tabs:** listen for the browser's `storage` event. When another tab changes the data, adopt its version instead of overwriting it.
- `writeJSON` will report success or failure. A failed save (for example, storage full) shows a message instead of failing silently.

### 3.2 Full JSON backup and restore

**Backup file:** `elora-backup-YYYY-MM-DD.json`

```json
{
  "format": "elora-backup",
  "formatVersion": 1,
  "dataVersion": 2,
  "app": "Elora",
  "exportedAt": "2026-11-14T20:00:00.000Z",
  "counts": { "transactions": 51, "repeating": 1, "budgets": 4, "goals": 2 },
  "checksum": "sha256-…",
  "data": { "…the complete AppData…" }
}
```

- **Included:** everything in `AppData`, which covers transactions, repeating items, budgets, goals and their contributions, all settings (currency, categories, theme, plan, alerts), the cached exchange rates and the alert history.
- **Not included:** the setup guide's per-device "hidden/skipped" state. That's a device preference, not financial data.
- **Checksum:** a SHA-256 of `data`. It detects a truncated or edited file. It is **not** a security measure, and the interface won't claim it is.

**Restore** happens in Settings › Your data › "Restore from backup…":

1. **Read and validate** the file before anything is replaced:
   - The JSON must parse and use the right format.
   - The checksum and counts must match.
   - Every record passes a strict validator: finite, non-negative amounts; real `YYYY-MM-DD` dates; known types; IDs present and unique.
   - Errors are listed in plain words, and nothing is changed.
2. **Upgrade** an older backup through the same migrations used on load (§3.3). A backup from a newer version is refused with an explanation.
3. **Preview** the backup next to the current data: counts, date range, currency, export date.
4. **Confirm.** "Replace my current data" is a deliberate, separate step, never the default. A **snapshot of the current data is taken first**, and a toast offers **Undo**.
5. Restore only replaces; it never merges. Merging would be a new feature and is out of scope.

**Where it appears:**
- Settings › Your data: Download full backup, Restore from backup, and saved snapshots (download, restore, delete).
- The phone's More sheet gets a "Back up" entry.

The CSV export stays as it is and keeps its "transactions only" label.

The single-file preview build can't download files (the viewer blocks it). There, the backup appears as text to copy, the same way the CSV export already works.

### 3.3 Versioned migrations with a recoverable snapshot

- New `src/lib/migrations.ts`:
  - `CURRENT_VERSION = 2`
  - an ordered list of steps (`from n to n+1`), each a pure function with its own tests
- The existing upgrade from the original two-key format (`bp.transactions` + `bp.budgets`) moves into this list as **v1 → v2**. That means the framework is exercised by real data from day one, even though Stage 0.5 itself adds no new format.
- **Before any upgrade:**
  1. Copy the raw stored data to `bp.snapshot.v<from>.<timestamp>`.
  2. Read the copy back and check that it's identical.
  3. Only then run the steps, validate the result, and write it.
- **If any step fails:** nothing is written, the original stays where it was, and the recovery screen offers the snapshot for download.
- **If the snapshot can't be saved** (storage full): the upgrade doesn't run, and the user is asked to download the data first.
- Keep the 2 most recent snapshots and list them in Settings. Each can be downloaded, restored or deleted.

### 3.4 Fix F5 and F6

Both changes are in `buildPlan()` (`src/lib/plan.ts`). No stored data changes.

- **F5, paused bills:** a payment linked to a repeating item that is paused (or no longer exists) still counts under **Bills** for the month it was paid. "Free to spend" and "Left to spend" then match reality.
  - Today, in the probe case: Bills £0 and Left to spend £3,000.
  - After the fix: Bills £1,000 and Left to spend £2,000.
- **F6, early set-aside:** a repeating item is only set aside from its `startMonth` onwards.
  - Today, in the probe case: £1,000 set aside the month before it starts.
  - After the fix: £0.
- **Tests:** the four round-2 probe cases (A–D in `03-review-round.md`) become permanent tests in `plan.test.ts`, with expected values. Cases A and C must be unchanged by the fix.

### 3.5 Dependency and security updates

- `npm audit fix`, no `--force`. The dry run [V] shows only the test runner changing (vitest 3.2.4 → 3.2.7, a patch release, plus its sub-packages). Nothing that ships to users changes. After the fix: re-run `npm audit` and report what remains, and re-run all tests.
- Add development-only test dependencies (§3.6): `@playwright/test`, pinned to **1.63.0** to match the browser already installed here [V], and `@axe-core/playwright`. There are no new runtime dependencies.
- **Disclosure copy** (Settings › Your data, and the privacy note): the data is stored unencrypted in this browser and can be read by anyone with access to this browser profile, and by other scripts running on the same website address. Elora doesn't claim browser storage is secure.
- **Netlify migration assessment** (decision 5: moving towards Netlify and a dedicated Elora domain). A separate document covering:
  - **Deployment:** build settings, branch previews, and how the GitHub Actions checks fit.
  - **PWA compatibility:** service-worker scope and caching headers, manifest, icons, offline behaviour on the new origin.
  - **Security headers:** a draft `_headers` file, including the CSP the app needs, with the exchange-rate hosts as the only allowed connections.
  - **Domain and HTTPS** setup.
  - **Moving existing users' data:** browser data can't follow a change of address on its own, so the move depends on the backup and restore in §3.2. The assessment will spell out the steps users would take.
  - **Cost:** checked against Netlify's current published plans when written.
  - **No deployment and no change to production hosting** without your approval. Any config files are drafts in the document, not added to the repo.

### 3.6 Browser and accessibility tests in the repository and CI

```
budget-planner/
  playwright.config.ts        builds, serves with vite preview, Chromium, phone and desktop projects
  e2e/fixtures.ts             seeded and empty data, blocks the exchange-rate API so tests are offline and repeatable
  e2e/journeys.spec.ts        the 72 checks from round 2 (setup guide, add/edit/delete/undo, filters,
                              repeating items, budgets, goals, plan, CSV import/export, theme, categories,
                              navigation, delete all)
  e2e/data-safety.spec.ts     backup → wipe → restore round trip; restore refuses invalid, tampered and
                              newer files; confirmation required; snapshot + Undo; corrupted and
                              newer-version data are never overwritten (stored bytes compared before and after)
  e2e/offline.spec.ts         service worker serves the app with the network off
  e2e/responsive.spec.ts      8 widths (375–1440) × 7 pages × light and dark: no sideways scrolling,
                              clipped text or covered content
  e2e/a11y.spec.ts            axe WCAG 2.2 A/AA on every page and the main dialogs, both themes
```

- **New script:** `npm run test:e2e`.
- **CI:** a new `e2e` job in `.github/workflows/deploy-pages.yml` that installs Chromium and runs on every pull request. Traces and screenshots are saved **only when a test fails**. Deployment waits for both `build` and `e2e` to pass. **[A]** The job should take about 3–6 minutes; I'll report the real time.
- **Unit tests added:** `migrations.test.ts`, `backup.test.ts` (round trip, checksum, every validator rule, newer-version refusal), the store load states, and the F5/F6 cases.

### 3.7 Verify offline, CSV import and export

Both are covered by the automated tests above. They're listed separately so the report states their results explicitly.

## 4. Files expected to change

**Changed**

| File | Why |
| --- | --- |
| `src/lib/store.ts` | `openStore()` load states, no write before a successful load, `storage`-event sync, v1→v2 moved to migrations |
| `src/lib/storage.ts` | `writeJSON` reports success or failure |
| `src/lib/plan.ts`, `src/lib/plan.test.ts` | F5, F6 and their tests |
| `src/App.tsx` | Recovery screen gate, restore wiring, save-failure message |
| `src/components/SettingsPanel.tsx` | Backup, restore, snapshots, disclosure text |
| `src/components/layout/AppShell.tsx` | "Back up" in the More sheet; privacy-note wording |
| `src/index.css` | Styles for the recovery screen and restore dialog |
| `package.json`, `package-lock.json` | vitest patch; Playwright and axe as development dependencies; `test:e2e` script |
| `.github/workflows/deploy-pages.yml` | `e2e` job; deploy needs it |
| `tsconfig.node.json`, `eslint.config.js`, `.gitignore` | Type-checking and linting for `e2e/`; ignore test output |
| `README.md` | Backup and restore, data safety, running browser tests |

**Step 0 (PR #4 branch):** `src/lib/insights.ts` (+ test), `src/components/overview/BalanceHero.tsx`, `src/components/overview/SetupGuide.tsx`, `src/lib/setup.ts`, `src/App.tsx`, `src/components/TransactionForm.tsx`, possibly a small shared helper in `src/lib/` for the same-day comparison (+ test).

**New**

`src/lib/migrations.ts` (+ test) · `src/lib/backup.ts` (+ test) · `src/components/RecoveryScreen.tsx` · `src/components/RestoreDialog.tsx` · `playwright.config.ts` · `e2e/*.ts` · `docs/redesign/06-netlify-assessment.md`

**Not changed:** the money logic in `budget.ts`, `recurring.ts`, `csv.ts` and `currency.ts`; the stored data format (stays version 2); the `bp.data` key.

## 5. Risks to user data and how each is handled

| Risk | Handling |
| --- | --- |
| A restore replaces good data with a bad file | Strict validation, checksum and counts, preview, explicit confirmation, snapshot first, Undo |
| A migration fails partway | It works on a copy; nothing is written unless every step and the final validation pass; a verified snapshot is taken first |
| An old cached app opens newer data | `newer` state: read-only recovery screen, never written |
| Corrupted storage | `unreadable` state: quarantined copy, downloadable, never silently replaced |
| Snapshots fill browser storage (about 5 MB limit) | Keep 2, show their size, allow deleting; if a snapshot can't be saved, the upgrade doesn't run |
| Two tabs overwrite each other | `storage`-event sync |
| The F5/F6 fixes change figures users have seen | Intended and limited to the plan's Bills, Free to spend and Left to spend. Covered by tests with expected values; listed in the report |
| The checksum is mistaken for security | The interface and docs call it an integrity check only |

## 6. Out of scope for Stage 0.5

Stage 1 and later work: upcoming bills, minor units, accounts, locale settings. Also: merging restores, encrypting stored data, any hosting change or deployment, and any backend.

**Where the approved items land:**
- **F4** (keep historical exchange-rate snapshots when the base currency changes) goes in **Stage 2**, together with the minor-units migration, so stored amounts change format only once, with one backup and one tested migration. Until then, a note in the base-currency switch explains what "convert" does today.
- **The Main account and Nigeria-first defaults** also arrive in Stage 2 and Stage 3.
- **Not touched in Stage 0.5:** NGN, mobile-money account types, irregular income.

**Noted for Stage 1/2 [V]:** number and date formatting currently follows the browser's locale. User-selectable country and locale settings belong to the international foundations, which Stage 2 already covers.

## 7. Decisions needed before I start

1. **Step 0:** may I fix P1–P9 on the PR #4 branch, re-run every test layer and update the PR description? You then decide on the merge.
2. **Approve this Stage 0.5 scope**, including the two fixes in §2 (no overwrite on load, multi-tab sync). They weren't in your list but protect data.
3. **F5 approach:** count a paused bill's already-made payment under **Bills** (recommended) or under everyday spending. *Left to spend* is the same either way; only the Bills / Free to spend split differs.
4. **New development-only dependencies:** `@playwright/test` 1.63.0 and `@axe-core/playwright`. OK?
5. **F4 in Stage 2** (with the minor-units migration) rather than Stage 0.5. OK?
