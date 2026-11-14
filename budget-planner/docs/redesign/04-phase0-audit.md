# Elora — Phase 0 audit and proposed plan

Response to the *Elora Master Product & Engineering Specification v1.0*, §14 (Phase 0: audit only).

- **Audited:** branch `claude/elora-ui-redesign-system-qd0dnz` at commit `787b999` (14 November 2026).
- **Method:** read and probe only. No application files were changed. Two temporary probe tests were run and deleted, and `git status` was clean afterwards.
- **Labels:** **[V]** verified in code or by running something · **[A]** assumption · **[R]** recommendation.

---

## 1. Executive summary

- **[V] What Elora is today:** a well-built, local-only budgeting app. It's a static React single-page app with no server, no login and no accounts. All data lives in one browser store, and nothing leaves the device except requests for exchange rates.
- **[V] Strong foundations:**
  - The money logic is pure, deterministic and separate from the screens.
  - 165 unit tests pass.
  - The UI redesign (rounds 1 and 2) meets the spec's Phase 1 goals.
- **[V] How far the spec reaches beyond this:** it describes a multi-user, cloud-backed, AI-assisted platform. About 70% of it needs things that don't exist yet: a backend, authentication, accounts, transfers and an AI layer.
- **[V] Most important correctness gaps:**
  - Money is stored as binary floating-point numbers.
  - Currency precision is fixed at 2 decimals for every currency.
  - Changing the base currency rewrites past conversions at today's rate.
  - A paused bill can drop out of the plan entirely.
- **[R] Safest path:** stay local-first and harden the data layer (versioned migrations, full backup and restore, money stored as whole minor units). Add accounts and transfers on top of that. Treat "add a backend" as an explicit decision gate before AI, sync or shared finances, because it ends the "your data never leaves this browser" promise.

## 2. Verified architecture

| Concern | Finding | Files |
| --- | --- | --- |
| Stack | React 19, TypeScript 5.8 (strict), Vite 6; runtime dependencies are only `react` and `react-dom` | `budget-planner/package.json` |
| Routing | Hash routes for 7 pages (`#/budgets`) | `src/lib/route.ts` |
| Styling | One token-based stylesheet, light and dark | `src/index.css` |
| State | One `AppData` object held in a React hook, saved to the browser on every change | `src/lib/store.ts:79` (key `bp.data`), `useAppData()` |
| Backend / database | **None** | — |
| Authentication | **None** | — |
| Network | Exchange rates only (ExchangeRate-API, with a fallback provider); sends no user data | `src/lib/currency.ts:105` |
| Offline / PWA | Service worker caches the app shell; offline loading verified in round 2 | `public/sw.js`, `src/lib/pwa.ts` |
| Hosting | Lint, test and build on every pull request; deploys `main` to GitHub Pages | `.github/workflows/deploy-pages.yml` |
| Project instructions | No `CLAUDE.md` or contributor docs; the README and `docs/redesign/01–03` are the documentation | — |
| ECC | v2.2.3 installed at user and project scope: 71 agents, 314 skills, 98 commands, hooks on 8 events. The GateGuard fact-checking hook is active | `.claude/settings.json`, `~/.claude/plugins/cache/ecc/ecc/2.2.3` |

**Data flow [V]:** a change in the UI goes through a handler in `App.tsx`, then a pure function in `lib/` (`store`, `recurring`, `plan`), then `setData`, then `writeJSON('bp.data')`. Calculations (`totals`, `budgetStatus`, `buildPlan`, `alertFor`) are recomputed on every render from the stored data. There's no cache layer, so nothing can go stale.

## 3. Feature inventory

| Feature | Status |
| --- | --- |
| Transactions: add, edit, delete, undo, search, filters | Working, local only [V] |
| Repeating items (monthly and yearly; back-fills missed payments; pause, resume, stop) | Working; one bug, F5 below [V] |
| Payments spread over months (e.g. yearly rent ÷ 12) | Working [V] |
| Monthly budgets per category | Working; monthly only, no weekly or custom periods [V] |
| Goals, emergency fund, automatic saving from income | Working [V] |
| Monthly plan (this is effectively Safe-to-Spend) | Working, deterministic, not configurable [V] |
| Overspending alerts, sound, browser notifications | Working; notifications are on-device only, with no push server [V] |
| Multiple currencies with live or manual rates | Working; precision issues below [V] |
| CSV import (with duplicate detection) and export | Working; **export holds transactions only** [V] |
| Insights | Rule-based text from the user's own numbers; no AI [V] |
| Accounts, balances, transfers | **Absent** [V] |
| Tags, subcategories, merchants, receipts | **Absent** [V] |
| Bills calendar, upcoming-bills view | **Absent**. The data exists (`nextOccurrence`); there's no screen [V] |
| Forecasting, what-if scenarios, debt, wealth / net worth | **Absent** [V] |
| AI assistant, households and sharing, learning content | **Absent** [V] |
| Full backup and restore | **Absent** [V] |
| Mocked or fake data | None. Old example data is clearly badged and can be removed [V] |

## 4. Answers to the specification's 12 questions

1. **Stack:** React, TypeScript and Vite as a static PWA [V].
2. **Backend:** none. Persistence is the browser's local storage [V].
3. **Where financial data lives:** in the user's browser only, under one key. It isn't encrypted [V].
4. **Authentication:** not implemented [V].
5. **User-level access control:** not applicable, since there's one user per browser and no server [V].
6. **What works:** see §3. Everything that exists works locally; nothing is mocked [V].
7. **How money is represented:** as JavaScript floating-point numbers in the base currency, rounded to 2 decimals in places. This doesn't meet §7 of the spec; details in §6 [V].
8. **Transfers and repeating transactions:** transfers don't exist. Repeating items create real transactions, with IDs derived from the rule and month so they can't be created twice. The plan sets their amount aside once and leaves them out of everyday spending, so there's no double counting [V].
9. **The crowded dashboard:** the original cause was one 3,800 px page with everything on it and red used for all spending. The redesign fixed this [V]. Still missing from the spec's dashboard list: upcoming commitments, and the ability to customise modules.
10. **Mobile:** a designed phone layout with a bottom tab bar, bottom sheets and touch targets of 40 px or more. Round 2 tested 8 widths from 375 to 1,440 px, light and dark, with no layout faults [V].
11. **Tests:** 165 unit tests on the money logic (`src/lib/*.test.ts`); run again during this audit, all pass [V]. There are no component tests. The browser checks (72) and accessibility scans (36) run from scripts outside the repo, so they aren't part of CI [V].
12. **Safest evolution path:** see §9.

## 5. Security and privacy

- **[V] Strengths:**
  - No secrets in the code; no server to attack.
  - No `innerHTML`, `eval` or console logging of data.
  - The only network call sends no user data.
  - Runtime dependencies have **0 known vulnerabilities** (`npm audit --omit=dev`).
- **[V] Data isn't encrypted on the device.** Anyone using that browser profile, and any script on the same origin, can read it.
- **[V] Shared origin on GitHub Pages.** The site is served from `thepaulesther.github.io/<repo>/`. Every Pages project on that account shares one origin, and therefore one local storage. Any other Pages site on the account could read `bp.data`. **[A]** It isn't known whether other Pages sites exist on the account.
- **[V] No Content-Security-Policy.** GitHub Pages can't send security headers.
- **[V] Development dependencies** have moderate advisories plus one critical (`tinypool`, part of the test runner, not shipped to users). `npm audit fix` is available.
- **[V] Data loss risk:** clearing browser data loses everything, and the CSV export isn't a full backup.

## 6. Financial correctness

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | Money is stored as floating point: 0.1 + 0.2 gives 0.30000000000000004 | probe; `totals()` in `budget.ts` |
| F2 | Zero-decimal currencies keep fractions: ¥1,500.75 is stored, ¥1,501 is shown | probe; `round2` assumes 2 decimals |
| F3 | Three-decimal currencies lose precision: KWD is rounded to 2 decimals | probe |
| F4 | Changing the base currency with "convert" rewrites all past amounts at one current rate. The spec says historical conversions must keep their original rates | `store.ts:302–303` |
| F5 | A bill paused after this month's payment counts nowhere, so Left to spend is too high | round 2 probe; `docs/redesign/03-review-round.md` (case B) |
| F6 | A repeating item is set aside before its start month | round 2 probe (case D) |
| F7 | Totals ignore time zones (`todayISO` uses local time; dates have no time part). Fine on one device; would need rules once data syncs | `budget.ts:305` |
| ✓ | Rate snapshots are kept per transaction (`original.rate`); repeating items correctly use the latest rate for each new payment | `budget.ts` `Money` type |

## 7. Technical debt and risks

- **`App.tsx` is about 1,000 lines** and holds every handler and all page layouts. It needs splitting into feature modules before more features arrive.
- **There's one data version (`version: 2`)** with an ad-hoc migration. Changing the schema safely needs versioned migrations, with an automatic snapshot taken before each one.
- **The browser checks and accessibility scans aren't in the repo or CI,** so regressions won't be caught automatically.
- **Local storage has a size limit** (about 5 MB per origin). **[A]** That's roughly 20,000+ transactions, which is fine for now.

## 8. Recommended target architecture [R]

- **Keep the current app.** Organise it into feature folders (`transactions`, `budgets`, `bills`, `goals`, `accounts`, `planning`) and move the money logic into a `domain/` layer that the screens and a future AI layer would both call. The existing pure functions already fit the spec's tool contracts: `buildPlan` would serve as `calculate_safe_to_spend`, `budgetStatus` as `get_budget_status`, and `totals` and `overviewInsights` similarly.
- **Storage behind an interface** (local now, a server-backed one later), so a move to a backend such as Supabase is a new adapter, not a rewrite.
- **A backend only when a feature needs one.** Sync, login, AI, sharing and push notifications all do; budgeting doesn't. When the time comes, compare Supabase with alternatives on cost, region and data residency. AI then sits behind a server proxy with a provider adapter, calling the same domain functions.

## 9. Staged plan

| Stage | Contents | Needs a backend? |
| --- | --- | --- |
| **0.5 Stabilise** | Merge PR #4 (**[A]** still open; not checked). Full JSON backup and restore. Versioned migrations with a snapshot taken before each. Move the browser and accessibility tests into the repo and CI. `npm audit fix` for development tools. Fix F5 and F6 if approved. | No |
| **1 Finish the dashboard** | An "Upcoming bills" module on the Overview, built from existing data. A loading/skeleton state where it's ever needed. Optional reordering of Overview sections. | No |
| **2 Money** | Store money as whole minor units, with precision per currency (fixes F1–F3; one migration from v2 to v3, with backup). Manual accounts (cash, bank, mobile money, credit), with existing data moved into a "Main" account. Transfers that never count as income or spending. Tags and merchant fields. A bills and subscriptions page with a calendar. Fix F4. | No |
| **3 Planning** | Safe-to-spend as a configurable, explained service (what's included and excluded, when the data was last updated). Irregular-income mode. Weekly and custom budget periods. Cash-flow forecast with clear "projected" labels. What-if scenarios. | No |
| **4 Debt and wealth** | Debts with repayment simulations; assets, liabilities and net worth, with valuation date, source and history. | No |
| **Gate** | **Decide on a backend:** provider, hosting region, authentication, row-level security, privacy policy, migrating each user's local data on their consent. | Yes, from here on |
| **5 Intelligence** | Read-only assistant behind a server proxy, using the domain functions as tools. Evaluation tests that prove it never invents figures. Core features keep working when the AI is down. | Yes |
| **6 Shared** | Households, roles, sharing selected items only, tests that one user can't read another's data. | Yes |
| **7 Global** | Languages and locales, regional providers, a native-app assessment, subscriptions. | Yes |

Each approved stage will follow the spec's report format (§13) and use the installed ECC agents that match the work:

- `planner` and `architect` for design
- `tdd-guide` for calculations
- `typescript-reviewer` and `react-reviewer` for code review
- `e2e-runner` and `a11y-architect` for browser and accessibility tests
- `database-reviewer` and `security-reviewer` from the backend gate onwards

## 10. Decisions requiring approval

Please answer each before implementation starts.

1. **Local-first for now?** Stages 0.5 to 4 stay on the device with no accounts or login. The backend gate comes before AI and sharing. Or do you want the backend sooner?
   - Answer:
2. **Convert stored money to whole minor units?** This changes how every amount is stored (one migration, with a backup taken first). The calculations keep the same meaning, but it's a change to business logic, so it needs sign-off.
   - Answer:
3. **Fix F5 (paused bill) and F6 (early set-aside)?** And for F4, when the base currency changes, should past amounts keep their original rates?
   - Answer:
4. **Accounts:** OK to move all existing transactions into a default "Main" account when accounts arrive?
   - Answer:
5. **Hosting:** stay on GitHub Pages (shared origin, no security headers) or move to Netlify or another host on its own domain?
   - Answer:
6. **PR #4:** merge it first, so later stages start from the redesigned app?
   - Answer:
7. **Target market:** which country and providers should the backend and regional decisions plan for first?
   - Answer:

No code changes will be made until these are approved.
