# SimpleInvoice — web app

React 19 + TypeScript single-page app for the SimpleInvoice assessment. You can sign in, browse and filter
invoices, open an invoice and create one. In Docker, nginx serves it and also reverse-proxies `/api/*` to the
API, so the browser only ever talks to one origin.

For the whole stack see the [root README](../../README.md). The API shapes the app relies on are in
[docs/API_CONTRACT.md](../../docs/API_CONTRACT.md), and
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md#3-frontend-structure) shows this app's structure.

## Run it

```bash
cd apps/web
npm ci
npm run dev    # http://localhost:5173 — /api is proxied to http://localhost:4000 (API_PROXY_TARGET)
npm test       # Vitest against an in-memory fake of the API contract; no backend needed
```

Requires Node.js 24+. For the dev server, the API must be running on port 4000 (see the
[API README](../api/README.md)).

| Script                  | What it does                                                                  |
| ----------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server with the `/api` proxy                                         |
| `npm run build`         | Type-check (`tsc -b`) and build to `dist/`                                    |
| `npm run preview`       | Serve `dist/` locally (same proxy)                                            |
| `npm run lint`          | ESLint (type-aware, hooks, jsx-a11y, TanStack Query, Vitest, Testing Library) |
| `npm run typecheck`     | TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`   |
| `npm test`              | Vitest + Testing Library + MSW                                                |
| `npm run test:watch`    | Same, in watch mode                                                           |
| `npm run test:coverage` | Same, with a V8 coverage report in `coverage/`                                |
| `npm run format`        | Prettier (with Tailwind class sorting)                                        |

| Variable            | Used by        | Default                 | Purpose                             |
| ------------------- | -------------- | ----------------------- | ----------------------------------- |
| `API_PROXY_TARGET`  | dev server     | `http://localhost:4000` | Where Vite forwards `/api/*`        |
| `VITE_API_BASE_URL` | build (bundle) | `/api`                  | API base URL as seen by the browser |

## Layout

```
src/
├── main.tsx          entry point
├── bootstrap/        composition root: providers, route table, browser router
├── shell/            app chrome: header (user, sign out), crash screens (error boundaries), 404 screen
├── core/             building blocks without UI
│   ├── api/          fetch client (ApiError, CSRF header, 401 hook) + React Query defaults
│   ├── calendar/     "YYYY-MM-DD" helpers that never shift through a time zone
│   ├── formatting/   money, dates and numbers via Intl
│   ├── links/        mailto: links that cannot smuggle extra headers
│   ├── routing/      reader for untyped router state
│   └── validation/   the API's control-character rule, shared by the form schemas
├── ui/               design system: buttons, fields, cards, feedback and query-error states, hooks
├── session/          login screen, route guard, current-user cache, safe post-login redirect
├── invoices/
│   ├── model/        contract types, URL list-query schema, create-invoice form schema
│   ├── data/         API calls, React Query hooks and keys
│   ├── list/  detail/  create/    one folder per screen
│   └── common/       status badge, "back to the same list view" state
└── test-support/     MSW fake API, fixtures, render helper, test setup
```

Routes (`bootstrap/route-table.tsx`): `/login`, and behind `SessionGuard` → `AppShell`: `/` (redirects to
`/invoices`), `/invoices`, `/invoices/new`, `/invoices/:invoiceId`, and a 404 screen for anything else.
Two error boundaries catch rendering bugs: one inside the shell, so a crashed screen keeps the header and
Sign out, and one at the root for anything outside it.

Every screen is bundled eagerly: the app's own code is about 14 kB gzipped (React and the libraries, ~157 kB,
sit in separately cached chunks), so route-level `lazy()` would save a few kB at the price of a round trip on
the first visit to each screen.

## Talking to the API

- `core/api/api-client.ts` (`apiRequest`) calls **relative** URLs under `/api` with `credentials: 'same-origin'`.
  nginx (Docker) or the Vite proxy (dev) strips the prefix, so the HttpOnly cookie is first-party and CORS never
  applies.
- Every request sends `X-Requested-With: XMLHttpRequest`. The API requires it on cookie-authenticated
  `POST`/`PUT`/`PATCH`/`DELETE` as its CSRF defence.
- A non-2xx answer becomes an `ApiError` with `status`, the API's `messages[]`, `error` and `requestId`, which
  error screens show so a failure can be traced in the API logs. A network failure is `status 0`.
- `getErrorMessage` turns any error into text for people: the API's own message for 4xx answers written for
  users (400, 401, 404, 409), a fixed sentence for 403, 413 and 429 (whose texts are for developers) and for
  every 5xx.
- React Query retries network and 5xx failures once and never retries 4xx (`core/api/query-client.ts`).

## Design decisions

- **Session.** The JWT lives only in the HttpOnly cookie set by the API. `session-api.ts` drops the token from
  the login response body at the API boundary, so no script (and no XSS) can read it; the app only keeps the user
  profile. The password exists only as the login mutation's variables, dropped as soon as the attempt is over
  (`gcTime: 0`, `reset()` after a failure). A 401 from any protected call ends the session: every query and
  mutation is removed from the cache, and the route guard sends the user to the login screen, then back to the
  page they were on. That return path is parsed like a URL and must stay on this origin (no open redirect).
- **Server state** lives in TanStack Query. The signed-in user is a cache entry rather than React context, so
  every screen reads the current value, even during the navigation that follows login or logout.
- **List state lives in the URL** (`page, pageSize, sortBy, ordering, status, keyword, fromDate, toDate`),
  validated with zod. An invalid value falls back to its default, defaults are left out of the URL, and any
  change other than the page goes back to page 1 (re-selecting what is already applied changes nothing).
  Search is debounced (300 ms), capped at the API's 100 characters, and replaces the history entry instead of
  pushing one per keystroke. Refresh, back/forward and shared links all show the same view.
- **Money and dates.** Amounts are displayed exactly as the API returns them, prefixed with the invoice's own
  `currencySymbol` (AU$, S$, £…; the ISO code if a symbol is ever missing), with `en-GB` digit grouping and 2
  decimals. The client never computes totals (the create form says the server does). Calendar dates are parsed
  and formatted in UTC so `2026-06-03` never renders as 2 June.
- **Forms.** react-hook-form + zod mirror the contract's validation table (e.g. due date ≥ invoice date,
  rate > 0 with at most 2 decimals, no control characters in text fields except tab and line breaks in address
  and description, a password of at most 72 UTF-8 bytes). The request body is built field by field, so status
  and totals can never be sent. The tax rate stays required (pre-filled with 10) rather than falling back to the
  API default when blank, because a blank field reads as "no tax". A 409 marks the invoice number field; other
  server errors show in an alert that receives focus. After a create, the list is reset rather than
  invalidated, so its first render already contains the new invoice.
- **Accessibility.** Every control has a label; errors use `aria-invalid` and `aria-describedby`; the first
  invalid field gets focus; after a navigation focus moves to `<main>`, as a page load would; one status region
  that stays mounted announces the result count or the empty state; tables use `th` scope and `aria-sort`;
  there is a skip link. Status is shown as text as well as colour, and focus is never hidden under the sticky
  header. Readable secondary text is `slate-600` (7.6:1 on white, 7.3:1 on the `slate-50` page); `slate-500`,
  only 4.55:1 on `slate-50`, is left to decorative icons, input placeholders on white (4.76:1, kept lighter
  than typed text) and disabled controls.
- **Responsive.** A table from 768 px (`md`), cards below; checked at 375 px and 1440 px.

## Tests

Tests sit next to the code they cover (`*.test.ts(x)`). Screens are rendered with the real route table,
providers and React Query against **MSW**. `test-support/fake-api.ts` is a small in-memory implementation of the
API contract (query strings, status codes, error bodies), so tests exercise real request/response round trips
instead of mocked hooks. The main flows covered:

- **Login:** validation, server errors, 429, neither the token nor the password being kept.
- **Session guard:** safe redirect, session expiry on a 401, a cache emptied on sign-out.
- **Shell:** focus after navigation, a crashed screen contained inside the shell.
- **List:** URL state, debounced search, filters, sorting, paging, mobile cards, the status region, empty and
  error states.
- **Create:** form validation, the exact payload, 409/400 handling, double-submit protection, the list shown
  after a create.
- **Detail:** rendering and not-found.
- **Helpers:** formatting, calendar, mailto and validation functions, the API client.
- **Accessibility** (`bootstrap/accessibility.test.tsx`): axe on every screen, in its normal and error states,
  failing on serious or critical violations (colour contrast is left to the browser suite).
- **Time zones** (`core/time-zone.test.tsx`): the date helpers and screens run in `America/Los_Angeles`, where
  UTC midnight is still the previous day.

ESLint runs `@vitest/eslint-plugin` and `eslint-plugin-testing-library` on the tests, which catch an un-awaited
`findBy` or user event, side effects inside `waitFor` and tests without assertions.

## Docker

`Dockerfile` builds with `node:24-alpine` (`npm ci`, `npm run build`) and serves `dist/` from
`nginxinc/nginx-unprivileged:1.30-alpine` on port 8080 as a non-root user. `nginx/nginx.conf` writes only to
`/tmp`, so the container runs with a read-only root filesystem. It:

- serves `/healthz`
- proxies `/api/*` to `http://api:4000/` with the `/api` prefix stripped, and forwards `X-Request-Id`
- falls back to `index.html` for client-side routes
- caches hashed `/assets/` as immutable and revalidates everything else
- sends security headers on every response (`nginx/security-headers.conf`), including a CSP without
  `unsafe-inline` for scripts (styles allow it for the toast library)

## Known limitations

- One line item per invoice, as the assessment specifies (the model and payload already use an array).
- Display formats use `en-GB` for every visitor rather than the browser's locale.
- If the session expires while the create form is open, the redirect to login discards what was typed.
- `FALLBACK_CURRENCIES` (used until `GET /currencies` answers) duplicates the API's list and must be kept in
  sync with it.
