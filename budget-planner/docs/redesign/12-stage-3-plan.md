# Stage 3 — Accounts, sync and money that moves on its own: plan

**Status:** proposed, awaiting decisions. No code has been changed for Stage 3.
**Based on:** the next steps in `11-stage-2b-report.md` (accounts and sign-in, repeating transfers, F4 with historical rates) and the roadmap's **backend gate** in `04-phase0-audit.md` §"Gate": *provider, hosting region, authentication, row-level security, privacy policy, migrating each user's local data on their consent.*
**Labels:** **[V]** verified · **[A]** assumption · **[R]** recommendation.

---

## 1. Why this stage is different

Until now Elora has had **no server**: everything lives in the browser on one device **[V]**. Accounts, sign-in, using Elora on two phones, and (later) bank connections, partner savings and the assistant all need one. Choosing it is the roadmap's "gate", so this stage starts with decisions only the owner can make, then builds in three parts:

- **3A — Local first, no server yet (can start straight away):** repeating transfers ("Pay yourself every month"), the remaining F4 work that doesn't need rates history, and the groundwork the sync needs (stable record IDs and change times).
- **3B — Accounts and sync:** sign-in, a copy of your data on the server, two devices in step, and moving existing local data up **only with your consent**.
- **3C — Exchange-rate history (F4):** daily rates stored on the server, so past amounts keep the rate of their own day when the base currency changes.

## 2. Part 3A — no server needed

1. **Repeating transfers.** "Pay yourself ₦200,000 every month on the 30th", and "Put money into the business" on a schedule. Same rules as repeating bills: never back-dated, can be paused or stopped, always shown before it happens. Optionally "only if it's still safe" (the business balance covers it after its boxes).
2. **Sync groundwork.** Every record gets an `updatedAt` time, and deletions leave a small marker, so two devices can later be merged without losing changes. This is a small data change (format v4) with the same safety-copy upgrade as v3.
3. **F4, the part that needs no rates:** when the base currency is converted, past amounts that were *entered* in the new currency go back to exactly what was typed (this already works **[V]**); everything else keeps a record of the rate used, so a later fix can redo it with real historical rates.

## 3. Part 3B — accounts and sync (needs your decisions)

### What it would do
- **Sign in** on any phone or computer and see the same money.
- **Works offline first, as now:** changes are saved on the device and sent when online. Nothing stops working without internet.
- **Your consent first:** existing users choose whether to move their data up; nothing is uploaded silently. Not signing in stays possible (local only, as today).
- **Only you can read your data:** row-level security on the server, so one account can never read another's.

### Decision 1: where the server runs (provider and region) **[needs you]**

| Option | What it is | Notes |
| --- | --- | --- |
| **Supabase** **[R]** | Hosted Postgres database with sign-in, row-level security and an API built in | Fastest to build on; open source, so you can move to your own server later. Check which hosting regions are offered when you sign up, including whether one is in or near Africa **[A]** |
| **Firebase (Google)** | Google's hosted database and sign-in | Strong phone-number sign-in and offline sync **[A]**; its document model is less suited to money reports |
| **Your own server** | A small API and database you host (e.g. on an African cloud) | Most control over where data lives; slowest and most work to run safely |

The **Nigeria Data Protection Act (NDPA 2023)** applies to storing people's financial data. Storing data outside Nigeria can be allowed with the right safeguards, but you need a privacy policy and a lawful basis, and a Nigerian data-protection lawyer should confirm the hosting choice **[A — get legal advice]**.

### Decision 2: how people sign in **[needs you]**

| Option | Notes |
| --- | --- |
| **Email link or code** **[R to start]** | Cheap, works everywhere, no passwords to forget |
| **Google sign-in** **[R alongside]** | One tap on most Android phones |
| **Phone number with SMS code** | Most familiar in Nigeria, but each SMS costs money and needs an SMS provider; worth adding once there are users |

### Decision 3: encryption level **[needs you]**
- **Standard [R]:** encrypted in transit and at rest by the provider, protected by row-level security. Allows account recovery and, later, the assistant and bank features.
- **End-to-end:** encrypted on the phone with a key only you hold. Most private, but a lost key means lost data, and server features (assistant, alerts) can't read anything.

### Decision 4: a privacy policy and terms **[needs you]**
Required before anyone's data goes on a server. I can draft a plain-language version for a lawyer to check.

### What you'll need to do
- **Create the account** with the chosen provider (I can't sign up on your behalf), then share the project's keys through the secure credentials form, never in chat.
- **Decide the app's web address** if moving off GitHub Pages (the earlier Netlify assessment, `06-netlify-assessment.md`, covers this).

## 4. Part 3C — exchange-rate history (F4)
Once there's a server: store one rate per currency per day (from the same rate source Elora already uses), and when the base currency is converted, convert each past amount at **its own day's rate**. Until then, the base-currency switch keeps its note explaining what "convert" does.

## 5. Order

1. **3A first** (no decisions needed): repeating transfers, sync groundwork (format v4), F4 groundwork. One pull request.
2. **Your decisions** on provider, sign-in, encryption and the privacy policy.
3. **3B**: accounts and sync. One pull request, behind a setting until it's proven.
4. **3C**: rates history and the full F4 fix.

## 6. Risks to user data

| Risk | Handling |
| --- | --- |
| Two devices change the same thing | Last change per record wins, using `updatedAt`; deletions are kept as markers so nothing comes back by accident; tested with two simulated devices |
| A failed upload or download | Local data stays the source of truth until the server confirms; safety copy before any merge |
| Data moved without consent | Uploading existing data is a clear, separate choice, and can be undone by deleting the account |
| Someone else's data visible | Row-level security, plus automated tests that one account can't read another's |

## 7. Decisions needed

1. **Start 3A now?** (repeating transfers, sync groundwork, F4 groundwork) **[R: yes]**
2. **Provider:** Supabase **[R]**, Firebase, or your own server?
3. **Sign-in:** email and Google to start, phone later **[R]**?
4. **Encryption:** standard **[R]** or end-to-end?
5. **Privacy policy:** shall I draft one for a lawyer to check?
