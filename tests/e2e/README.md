# SimpleInvoice — end-to-end tests

Playwright tests that drive the **real stack** in Chromium: React SPA → nginx → NestJS API →
PostgreSQL. Nothing is mocked; the suite is also the integration check between the SPA and the API.

## Run

One command from the repository root (Docker and Node 24 required; no `.env` needed):

```bash
make test-e2e
```

It starts or updates the stack with [`docker-compose.e2e.yml`](docker-compose.e2e.yml), which
raises the per-IP login rate limit (see [Design notes](#design-notes)), installs the test
dependencies and Chromium, and runs the suite. Afterwards it always restores the regular api
configuration, failed tests included; after an interrupted run, `make up` does it.

Against a stack that is already running:

```bash
cd tests/e2e
npm ci && npx playwright install chromium   # once
npm test                                     # every project
npm run test:desktop | test:mobile | test:api
npm run test:headed                          # watch it run
npm run report                               # HTML report of the last run (playwright-report/)
npm run typecheck && npm run lint && npm run format:check
```

| Variable                                   | Default                                                                                                           | Purpose                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `E2E_BASE_URL`                             | `http://localhost:3000`                                                                                           | The SPA (nginx), also used for `/api/*`                    |
| `E2E_API_URL`                              | `http://localhost:4000`                                                                                           | The API port, for browserless smoke tests                  |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | the environment, then the root `.env`, then the compose defaults (`reviewer@simpleinvoice.dev` / `Reviewer@2026`) | Account to sign in with; set it if the stack seeds another |
| `CI`                                       | unset                                                                                                             | 1 retry, `test.only` forbidden                             |

Failures keep a screenshot; a retried test also records a trace (`npx playwright show-trace`).

## Projects

| Project            | What                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `setup`            | Signs in once through the login screen and saves the session cookie to `.auth/` (git-ignored).                |
| `teardown`         | Runs after everything that needs the session and deletes that file (it holds a valid JWT).                    |
| `desktop-chromium` | 1440 × 900. Sign-in and sign-out, invoice list, detail, create, security headers and CSP, accessibility.      |
| `mobile-chromium`  | 390 × 844 with touch. Cards, tapping a card, creating an invoice, no sideways scroll, accessibility.          |
| `api`              | No browser. Health, 401 and `no-store` without a token, no CORS for other origins, CSRF rule, Bearer clients. |

```
specs/
  auth.setup.ts                 UI sign-in, saves storage state
  auth/                         redirects and deep links, validation, bad credentials, cookie flags, sign-out
  invoices/                     list (search, filters, sort, paging, date range, reset, back/forward), detail, create
  security/                     headers on the document, CSP enforced and never violated
  a11y/                         axe on every main screen, in both browser projects
  mobile/                       phone layout
  api/                          HTTP-level smoke tests
support/
  env.ts  fixtures.ts  http.ts  invoices.ts  accessibility.ts  pages/   (page objects, one per screen)
```

## Design notes

- **One sign-in per run.** The session is an HttpOnly cookie, which Playwright's `storageState`
  captures, and signed-in tests start from it in their own browser context. Signing out revokes the
  token on the server, so the sign-out test uses a session of its own. Each run writes its own file
  (`.auth/reviewer-<pid>.json`), so two runs started from the same checkout cannot read each
  other's half-written session; the `teardown` project deletes it.
- **Two workers.** Each worker drives its own Chromium next to the Docker VM on the same machine;
  a run takes 10–15 seconds.
- **Rate limits.** The API accepts `THROTTLE_LOGIN_LIMIT` logins per minute per client IP (5 by
  default), and all browser traffic reaches it through nginx, i.e. from one IP. A run makes 5 login
  requests (setup, deep link, wrong then right password, the sign-out test's own session). The e2e
  compose override raises the login limits, so runs can follow each other. Against a stack started
  without it, run `npm test` at most once a minute; the setup project reports a 429 with this
  advice. Failed logins also count per account (`LOGIN_MAX_FAILED_ATTEMPTS` per
  `LOGIN_FAILURE_WINDOW_SECONDS`), but a successful login resets that count and the suite's only
  failed attempt is followed by one, so it never locks the demo account. The general limit (300
  requests per minute per route) is not a concern: a run makes about 50 list requests.
- **Data isolation.** Tests only add data, never rely on absolute counts, and never depend on each
  other. New invoices get unique numbers (`E2E-<timestamp>-<hex>`). List tests compare the screen
  with the exact API response the UI action triggered (captured with `waitForResponse`), or narrow
  the list to known seed data (the Appendix A invoice, statuses a new Draft never has, oldest-first
  paging that concurrent inserts cannot shift). `make reset` wipes the accumulated test invoices.
- **No sleeps.** Waiting relies on web-first assertions, `expect.poll` and awaited responses.
  Locators are roles, labels and text: what a user (or a screen reader) sees.
- **Console guard.** Every browser test fails on a Content Security Policy violation or an uncaught
  page error (`support/fixtures.ts`). A dedicated test injects an inline script to prove that the
  CSP blocks it and that the guard notices.
- **Accessibility.** `@axe-core/playwright` checks the login, list, detail, create and 404 screens
  against WCAG 2.x A/AA at both viewports (forms with their field errors showing); serious or
  critical violations fail. Colour contrast needs a real browser, so it is checked here rather than
  in the SPA's jsdom unit tests.
- **Lint.** ESLint with type-checked typescript-eslint (`no-floating-promises`: a forgotten await
  lets a test end before its action or assertion ran) and `eslint-plugin-playwright`.
