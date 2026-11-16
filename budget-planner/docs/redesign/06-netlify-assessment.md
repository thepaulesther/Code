# Moving Elora to Netlify and its own domain: assessment

**Status:** assessment only. Nothing has been deployed, no account or domain has been created, and production hosting (GitHub Pages) is unchanged.
**Labels:** **[V]** verified here · **[A]** assumption · **[TV]** to verify on Netlify's own pages before deciding.

> Netlify's website and documentation were **not reachable from this environment** (its network blocks `netlify.com`). Plan names, prices, limits and exact configuration syntax below are therefore marked **[TV]**. Nothing about Netlify's current pricing is stated as fact.

## 1. Why move

| Today (GitHub Pages) [V] | With a dedicated domain on Netlify |
| --- | --- |
| Served from `thepaulesther.github.io/<repo>/`, an address **shared** with every other Pages site on the account, so they share browser storage | Elora gets its own origin (e.g. `app.elora…`), so no other site shares its storage |
| No custom response headers, so no real Content-Security-Policy, `frame-ancestors` or HSTS | Custom headers through a `_headers` file or `netlify.toml` [TV for exact syntax] |
| Deploys from GitHub Actions after lint, tests and build | Same gate is possible (§4) |

**Worth knowing:** GitHub Pages also supports custom domains, which would fix the shared-storage problem on its own. It still couldn't send security headers. So the case for Netlify is the headers and the deploy previews, not only the domain.

## 2. Security headers: tested draft [V]

The headers below were served with the real production build, and the full browser suite (41 tests: journeys, data safety, offline service worker, layout, accessibility) **passed under them** with no policy violations. The exchange-rate hosts weren't contacted live in that run, because tests block outside requests.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://open.er-api.com https://cdn.jsdelivr.net; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY

/sw.js
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

What each part does:

- **`script-src 'self'`:** only Elora's own scripts can run. This is the main protection for data in browser storage.
- **`style-src 'unsafe-inline'`:** needed because a dozen components set widths with inline styles (progress bars, chart segments). Allowing inline *styles* is much lower risk than inline *scripts*.
- **`connect-src`:** limits network calls to the two exchange-rate providers. Any new provider must be added here.
- **`sw.js` must not be cached,** or app updates could be delayed. Hashed files in `/assets/` can be cached for a year.
- **Not yet included:** `Strict-Transport-Security`. Add it (for example `max-age=31536000`) once the domain is confirmed on HTTPS. HSTS *preload* is a separate, hard-to-reverse decision.
- `upgrade-insecure-requests` was left out of the local test because it would break plain-HTTP localhost; it's harmless in production on HTTPS.

## 3. PWA compatibility [V]

- The build uses relative paths (`base: './'`), and the manifest uses `start_url: "./"` and `scope: "./"`. The same files work at a domain root or a sub-path with no changes.
- The service worker is served from the same folder as the page, so its scope covers the app. With the headers above, it installed and served the app offline in the test run.
- Hash routes (`#/budgets`) need no server rewrites.
- **[A]** Installed home-screen apps belong to their origin. Users who installed Elora from GitHub Pages will need to install it again from the new address.

## 4. Deployment options

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| **A. GitHub Actions deploys to Netlify** (recommended) | After `build` and `e2e` pass on `main`, a job runs the Netlify CLI to deploy `budget-planner/dist` [TV for current CLI command and flags]. Needs a Netlify token saved as a GitHub secret. | Tests stay the gate, exactly as today; one pipeline | A secret to manage |
| B. Netlify builds from GitHub itself | Netlify watches the repo; base directory `budget-planner`, build command `npm run build`, publish `dist` [TV] | Automatic deploy previews for every pull request [TV for free plan] | Netlify would deploy without waiting for our browser tests unless configured otherwise [TV] |

Draft `netlify.toml` for option B, or for local `netlify` CLI use [TV for syntax]:

```toml
[build]
  base = "budget-planner"
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"
```

**Nothing has been added to the repo.** These are drafts for review.

## 5. Moving existing users' data (the main risk)

Browser storage belongs to the website address. **Nothing in a user's browser moves to a new domain automatically** [V]. Users who open the new address see an empty Elora unless they bring their data across.

Proposed sequence, with each step needing your approval:

1. **Now (done in Stage 0.5):** full backup and restore exists, so users can move their data.
2. **Before switching:** add a notice on the GitHub Pages site saying Elora is moving, with a **Download full backup** button and the new address. This is a small code change.
3. **Switch:** the new domain goes live and users restore their backup there. The setup guide can offer "Restore from backup" as a first step.
4. **Keep the old site running** with the notice for a transition period you choose (e.g. 3 months), so nobody is cut off. Don't delete it while people may still have data there.
5. **[A]** A server redirect from the old address can't carry data across and would strand anyone who hasn't backed up yet. So don't redirect until the transition ends.

## 6. Domain and HTTPS

- **[TV]** Netlify issues certificates automatically for custom domains (historically via Let's Encrypt), and lets you choose whether HTTPS is enforced.
- You'll need to register a domain (e.g. a `.com`, or a `.ng` / `.com.ng` for the Nigerian market) and point its DNS at Netlify. Registrar choice and cost are outside this assessment.

## 7. Cost and terms: to verify before deciding [TV]

Check on Netlify's pricing page and terms:

- Whether the free plan allows **commercial use**, if Elora will charge or carry a business name.
- Free-plan **bandwidth or usage credits**, and what happens at the limit: the site pauses, or overage charges apply. A paused site would make Elora unreachable for new visits; already-installed copies keep working offline.
- Build minutes, if using option B.
- Whether **deploy previews** and **custom headers** are on the free plan.
- **Data processing terms**, for the privacy policy. Elora sends no user data to the host, but the host still sees visitors' IP addresses in request logs.

## 8. Recommendation

1. Verify the [TV] items above on Netlify's site. A few minutes; this environment can't reach it.
2. Approve the domain name.
3. Then, as a separate approved step:
   - add `_headers` (as tested here) and the Actions deploy job (option A)
   - deploy to a Netlify preview address and run the browser suite against it
   - add the moving notice to the old site
   - switch the domain and keep the old site running during the transition

Alternatives considered: **Cloudflare Pages** also supports custom headers and previews [TV]. **GitHub Pages with a custom domain** fixes the shared storage but not the headers.
