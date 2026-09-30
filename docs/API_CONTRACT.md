# SimpleInvoice — API & Architecture Contract

> Single source of truth shared by the backend (`apps/api`) and frontend (`apps/web`).
> Any change to a request/response shape must be made here first.

## 0. Stack & repository layout (monorepo)

| Layer | Tech |
| --- | --- |
| Runtime | Node.js 24 LTS (TypeScript compiled to JavaScript — the spec mandates TypeScript on both tiers) |
| Backend | NestJS 11 (CommonJS; NestJS 12 is ESM-only and its Jest/TypeORM-CLI tooling needs experimental flags) + TypeScript strict, TypeORM + `pg`, class-validator/class-transformer, @nestjs/swagger, @nestjs/jwt, @nestjs/throttler, helmet, cookie-parser, bcrypt, decimal.js, nestjs-pino |
| Database | PostgreSQL 17 (explicit SQL migrations, CHECK constraints, pg_trgm indexes) |
| Frontend | React 19 + TypeScript strict, Vite, React Router, TanStack Query, react-hook-form + zod, Tailwind CSS v4, sonner (toasts) |
| Tests | Backend: Jest (unit) + Supertest e2e against real Postgres. Frontend: Vitest + React Testing Library + MSW. Full stack: Playwright (`tests/e2e/`). |
| Delivery | docker compose: `secrets` (one-shot, first start: generates the database passwords and the JWT key into the `secrets` volume), `db` (postgres:17-alpine + one-time role setup, `infra/postgres`), `migrate` (one-shot: migrations + seed as the schema owner), `api` (NestJS, port 4000, published on 127.0.0.1 only), `web` (nginx serving the SPA on container port 8080, published on host port 3000, reverse-proxies `/api/*` to `api:4000`). Networks: `edge` (web, api) and `data` (migrate, api, db) |

```
simple-invoice/
├── apps/
│   ├── api/                      NestJS API (layered modules)
│   │   ├── src/
│   │   │   ├── config/                   env schema + validation
│   │   │   ├── shared/                   decorators, exception filter, request-id, validators, clock, logging
│   │   │   ├── infrastructure/database/  data-source, migrations/, seeds/
│   │   │   └── modules/<name>/{domain,application,infrastructure,presentation}
│   │   │                                 auth · users · invoices · currencies · health
│   │   └── test/                         e2e (supertest, real PostgreSQL)
│   └── web/                      React SPA
│       └── src/  main.tsx (entry) · bootstrap/ (providers, route table, app) · shell/ (layout, not-found)
│                 core/ (api client + query client, calendar, formatting, links: mailto helper, validation)
│                 ui/ (primitives, hooks/) · session/ (auth) · invoices/{model,data,list,detail,create,common} · test-support/
├── tests/e2e/                    Playwright full-stack tests
├── infra/postgres/               db image: official postgres:17-alpine + one-time role setup (initdb/01-app-roles.sh),
│                                 secret generation (generate-secrets.sh), secret-loading entrypoint
├── docs/                         API_CONTRACT.md, ARCHITECTURE.md (diagrams), CONFIGURATION.md, SECURITY.md
├── scripts/init-env.sh           optional: writes .env with random secrets (running without Docker)
├── docker-compose.yml
├── Makefile
└── README.md
```

## 1. Conventions

- Backend routes are mounted at the root (no global prefix) exactly as the spec lists them: `POST /auth/login`, `GET /invoices`, …
  Swagger UI: `GET /api/docs` (JSON at `/api/docs-json`).
- The browser never talks to `:4000` directly. The SPA calls **relative** URLs under `/api` (e.g. `/api/invoices`):
  - docker: nginx `location /api/ { proxy_pass http://api_backend/; }` with `upstream api_backend { server api:4000 resolve; }` (prefix stripped; `api` re-resolved while nginx runs). `/api/api/*` answers 404: Swagger is not re-exposed on the web origin
  - local dev: Vite `server.proxy['/api']` → `http://localhost:4000` with `rewrite: p => p.replace(/^\/api/, '')`
  - Result: same-origin in every environment → the auth cookie is first-party, CORS is not needed by the SPA.
- JSON property names are camelCase. DB columns are snake_case.
- Dates (`invoiceDate`, `dueDate`, `fromDate`, `toDate`) are `YYYY-MM-DD` strings (calendar dates, no timezone).
  Timestamps (`createdAt`) are ISO-8601 UTC strings.
- Money in responses is a JSON **number** rounded to 2 decimals (computed with decimal.js, stored as `numeric(14,2)`).
- Every response carries an `X-Request-Id` header (echoed from the request if present and valid, otherwise generated).
- Every API response except the Swagger UI (`/api/docs*`) carries `Cache-Control: no-store`, error responses included.
- Request bodies are JSON only: a request with a body whose `Content-Type` is not `application/json` gets **415**
  `"Content-Type must be application/json"` (bodiless requests such as logout need no Content-Type). Bodies nested deeper than
  8 levels get 400 `"Request body is nested too deeply"`.

## 2. Error format (global exception filter — every non-2xx response)

```json
{
  "statusCode": 400,
  "message": ["dueDate must be on or after invoiceDate"],
  "error": "Bad Request",
  "path": "/invoices",
  "timestamp": "2026-09-29T04:00:00.000Z",
  "requestId": "0f8d…"
}
```

- `message` is `string[]` for validation errors (400 from ValidationPipe), otherwise a `string`.
- 500s never leak internals: `"message": "Internal server error"`; the real error is logged server-side with the requestId.
- Postgres unique violation on `invoice_number` (exact or differing only in letter case) → **409** `{"statusCode":409,"message":"Invoice number already exists","error":"Conflict"}`.
- A value PostgreSQL rejects as malformed (SQLSTATE class 22; validation normally catches it first) → **400** `"Invalid input"`; the database message is not echoed.
- Status codes used: 200, 201, 204, 400, 401, 403, 404, 409, 413 (JSON body > 100 kB), 415 (body not JSON), 429 (with `Retry-After`), 500, 503 (`/health` only).

## 3. Authentication

- `POST /auth/login` (public, JSON body only)
  - Rate limits, both answered with **429**: per client IP 5 requests / 60 s (`THROTTLE_LOGIN_*`, headers `X-RateLimit-*-login`,
    `Retry-After-login` and `Retry-After`), and per account `LOGIN_MAX_FAILED_ATTEMPTS` (10) failed logins per `LOGIN_FAILURE_WINDOW_SECONDS` (900 s)
    whatever the IP → `"Too many attempts, try again later"` with `Retry-After` (seconds). Only failures count: a successful login
    clears the account's count. Unknown e-mails are counted the same way (no account enumeration). The client IP is the socket
    address unless the peer is a trusted proxy (`TRUST_PROXY`, §9).
  - Body: `{ "email": string (valid email, ≤254, trimmed+lowercased), "password": string (1..72 bytes UTF-8 — bcrypt ignores bytes beyond 72; no NUL character) }`
  - 200:
    ```json
    {
      "accessToken": "<jwt>",
      "tokenType": "Bearer",
      "expiresIn": 3600,
      "user": {
        "id": "uuid",
        "email": "reviewer@simpleinvoice.dev",
        "fullname": "Demo Reviewer"
      }
    }
    ```
  - Also sets the session cookie `<name>=<jwt>; HttpOnly; SameSite=Strict; Path=/; Max-Age=<expiresIn>`, where `<name>` is
    `si_access_token` when `COOKIE_SECURE=false` (plain-HTTP localhost) and `__Host-si_access_token` plus `Secure` when
    `COOKIE_SECURE=true` (HTTPS; the prefix makes browsers reject the cookie unless it is Secure, `Path=/` and has no `Domain`).
  - 401 `"Invalid email or password"` for unknown email OR wrong password (same message, same timing: a dummy bcrypt compare runs when the user does not exist).
- `GET /auth/me` (protected) → 200 `{ "id", "email", "fullname", "createdAt" }`; 401 if the user no longer exists.
- `POST /auth/logout` (public, idempotent) → 204. **Requires `X-Requested-With: XMLHttpRequest`** (403 without it, session
  untouched). Revokes the presented token — cookie or `Authorization: Bearer` — until its expiry, then clears the cookie; without
  a (valid) token it only clears the cookie. Revocation is server-side (a denylist of token ids, `jti`): the same token presented
  again afterwards, e.g. a copied cookie or Bearer header, gets 401 `"Invalid or expired access token"`.
- JWT: HS256 only (algorithm pinned on verify), claims `sub` (user id, UUID), `email`, `jti` (random UUID, what logout revokes),
  `iat`, `iss`=`JWT_ISSUER`, `aud`=`JWT_AUDIENCE`, `exp` = iat + `JWT_EXPIRES_IN` seconds (default **3600**). Verification also
  enforces maxAge = `JWT_EXPIRES_IN` from `iat` (5 s clock tolerance) and refuses tokens without `exp`, with a future `iat`, a
  non-UUID `sub`/`jti`, or a revoked `jti` — all with the same 401 `"Invalid or expired access token"`. Revocations are kept in
  process memory (one API instance; see SECURITY.md).
- Guard: a **global** `JwtAuthGuard` (APP_GUARD) — every route is protected unless decorated `@Public()` (secure by default).
  Token lookup order: `Authorization: Bearer <jwt>` header, then the session cookie (`si_access_token`, or
  `__Host-si_access_token` when `COOKIE_SECURE=true`; the other name is ignored).
- CSRF defence for cookie auth: SameSite=Strict cookie **and**, when the token came from the cookie on an unsafe method
  (POST/PUT/PATCH/DELETE), the request must carry `X-Requested-With: XMLHttpRequest`, otherwise 403. The SPA's API client always sends that header.
  Bearer-header clients (Swagger, curl) are unaffected, except on logout (above). JSON-only bodies (415 otherwise) mean an HTML
  form cannot post a login either. CORS is disabled unless `CORS_ORIGINS` lists origins (§9).
- The SPA never stores the JWT in `localStorage`/`sessionStorage`/JS memory; it relies on the HttpOnly cookie. It keeps only the user profile (from `/auth/me`) in React state.

## 4. Invoices

### 4.1 `GET /invoices` (protected)

| Query | Type | Rules / default |
| --- | --- | --- |
| `page` | int | 1..100000, default 1 |
| `pageSize` | int | 1..100, default 10 |
| `sortBy` | enum | `invoiceDate` \| `dueDate` \| `totalAmount`, default `invoiceDate` |
| `ordering` | enum | `ASC` \| `DESC` (case-insensitive input, normalised to upper), default `DESC` |
| `status` | enum | `Draft` \| `Pending` \| `Paid` \| `Overdue` (optional) |
| `keyword` | string | trimmed, ≤100 chars, no control characters; case-insensitive partial match on invoice number OR customer name. `%`, `_`, `\` are escaped (literal match). |
| `fromDate` | date | `YYYY-MM-DD`, invoiceDate ≥ fromDate |
| `toDate` | date | `YYYY-MM-DD`, invoiceDate ≤ toDate; 400 if `fromDate > toDate` |

Unknown query params → 400 (`forbidNonWhitelisted`). Secondary sort for stable pagination: `created_at DESC, invoice_id ASC`.

Status filter semantics (because Overdue is derived; `today` = current calendar date in `APP_TIMEZONE`, passed to SQL as a parameter):

- `Overdue` → `status <> 'Paid' AND due_date < :today`
- `Paid` → `status = 'Paid'`
- `Draft` / `Pending` → `status = :status AND due_date >= :today` (an overdue Draft is shown as Overdue, so it must not appear under Draft)

200:

```json
{
  "data": [
    {
      "invoiceId": "uuid",
      "invoiceNumber": "IV1780488206995",
      "invoiceReference": "#5721662",
      "invoiceDate": "2026-06-03",
      "dueDate": "2026-07-03",
      "currency": "AUD",
      "currencySymbol": "AU$",
      "customer": { "fullname": "Paul", "email": "paul@101digital.io" },
      "totalAmount": 2180,
      "totalPaid": 1451.34,
      "balanceAmount": 728.66,
      "status": "Overdue",
      "createdAt": "2026-06-03T12:03:26.995Z"
    }
  ],
  "paging": { "page": 1, "pageSize": 10, "total": 41, "totalPages": 5 }
}
```

### 4.2 `GET /invoices/:id` (protected)

- `:id` must be a UUID → otherwise 400 (`ParseUUIDPipe`). Not found → 404 `"Invoice not found"`.
- 200 `InvoiceDetail`:

```json
{
  "invoiceId": "uuid",
  "invoiceNumber": "IV1780488206995",
  "invoiceReference": "#5721662",
  "invoiceDate": "2026-06-03",
  "dueDate": "2026-07-03",
  "currency": "AUD",
  "currencySymbol": "AU$",
  "description": "Invoice is issued to Kanglee",
  "status": "Overdue",
  "customer": {
    "fullname": "Paul",
    "email": "paul@101digital.io",
    "mobileNumber": "947717364111",
    "address": "Singapore"
  },
  "items": [
    {
      "id": "uuid",
      "name": "Honda RC150",
      "quantity": 2,
      "rate": 1000,
      "amount": 2000
    }
  ],
  "taxRate": 10,
  "invoiceSubTotal": 2000,
  "totalTax": 200,
  "totalDiscount": 20,
  "totalAmount": 2180,
  "totalPaid": 1451.34,
  "balanceAmount": 728.66,
  "createdAt": "2026-06-03T12:03:26.995Z",
  "createdBy": "ad1e0902-1928-4345-b513-60c86c94fc91"
}
```

Optional fields (`invoiceReference`, `description`, `customer.mobileNumber`, `customer.address`) are `null` when absent.

### 4.3 `POST /invoices` (protected, CSRF header rule applies to cookie auth)

Body (`CreateInvoiceDto`, whitelist + forbidNonWhitelisted — `status`, totals, `currencySymbol`, `createdBy` are rejected if sent):

```json
{
  "invoiceNumber": "INV-2026-0100",
  "invoiceReference": "PO-778",
  "invoiceDate": "2026-09-29",
  "dueDate": "2026-10-29",
  "currency": "AUD",
  "description": "Optional text",
  "customer": {
    "fullname": "Jane Doe",
    "email": "jane@example.com",
    "mobileNumber": "+61 400 000 000",
    "address": "Sydney"
  },
  "items": [{ "name": "Consulting", "quantity": 2, "rate": 150.5 }],
  "taxRate": 10,
  "discount": 0
}
```

| Field | Rule |
| --- | --- |
| `invoiceNumber` | required, trimmed, 1..50 chars, pattern `^[A-Za-z0-9][A-Za-z0-9._/#-]*$`, unique regardless of letter case (`INV-1` and `inv-1` clash; unique index on `upper(invoice_number)` → 409) |
| `invoiceReference` | optional, ≤100, no control characters |
| `invoiceDate` | required, valid calendar date `YYYY-MM-DD` |
| `dueDate` | required, valid date, **must be ≥ invoiceDate** → 400 `"dueDate must be on or after invoiceDate"` |
| `currency` | required, one of the supported ISO-4217 codes (see `GET /currencies`); `currencySymbol` is derived server-side |
| `description` | optional, ≤500, no control characters except tab / line feed / carriage return (multi-line) |
| `customer` | required, an object (an array is rejected) |
| `customer.fullname` | required, non-empty after trim, ≤120, no control characters |
| `customer.email` | required, valid email, ≤254 |
| `customer.mobileNumber` | optional, ≤32, pattern `^[+0-9()\- ]*$` (literal spaces only: no tabs or line breaks) |
| `customer.address` | optional, ≤255, no control characters except tab / line feed / carriage return (multi-line) |
| `items` | array with **exactly 1** element, each an object (model supports many; spec limits to one) |
| `items[].name` | required, non-empty after trim, ≤200, no control characters |
| `items[].quantity` | required, integer 1..1,000,000 |
| `items[].rate` | required, number > 0, ≤ 1,000,000,000, max 2 decimals |
| `taxRate` | optional, number 0..100, max 2 decimals, **default 10** |
| `discount` | optional, number ≥ 0, max 2 decimals, **default 0**; absolute amount in invoice currency; must be ≤ subTotal + taxAmount → 400 `"discount must not exceed subtotal plus tax"` |
| (totals) | subTotal + taxAmount must fit `numeric(14,2)` (the per-field maxima allow 10¹⁵) → 400 `"invoice total must not exceed 999999999999.99"` |

Server-side calculation (decimal.js, ROUND_HALF_UP to 2 dp):

```
subTotal      = Σ quantity × rate
taxAmount     = round2(subTotal × taxRate / 100)
totalAmount   = subTotal + taxAmount − discount
totalPaid     = 0 (new invoice)
balanceAmount = totalAmount − totalPaid
status        = Draft (always)
createdBy     = authenticated user id (from JWT)
```

201 → `InvoiceDetail` + `Location: /invoices/<id>` header.

## 5. `GET /currencies` (protected)

200 → `[{ "code": "AUD", "symbol": "AU$", "name": "Australian Dollar" }, …]`
Supported: AUD (AU$), USD (US$), GBP (£), EUR (€), SGD (S$), NZD (NZ$), CAD (CA$), VND (₫).

## 6. `GET /health` (public, counted against the default per-IP limit of 300 requests / minute)

200 `{ "status": "ok", "db": "up" }` · 503 when the DB is unreachable. Used by the docker healthcheck (every 10 s, far below the limit).

## 7. Database schema (explicit migrations, no `synchronize`)

One migration creates everything below: `apps/api/src/infrastructure/database/migrations/1790640000000-InitSchema.ts`.


- `users(id uuid PK default gen_random_uuid(), email varchar(254) NOT NULL, password_hash varchar(100) NOT NULL, fullname varchar(120) NOT NULL, created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now())`
  - `UNIQUE INDEX users_email_lower_uq ON users (lower(email))`
- enum `invoice_status AS ENUM ('Draft','Pending','Paid')` — Overdue is never stored.
- `invoices(invoice_id uuid PK, invoice_number varchar(50) NOT NULL, invoice_reference varchar(100), invoice_date date NOT NULL, due_date date NOT NULL, currency char(3) NOT NULL, currency_symbol varchar(8) NOT NULL, description varchar(500), status invoice_status NOT NULL default 'Draft', customer_fullname varchar(120) NOT NULL, customer_email varchar(254) NOT NULL, customer_mobile varchar(32), customer_address varchar(255), tax_rate numeric(5,2) NOT NULL default 10, invoice_sub_total numeric(14,2) NOT NULL, total_tax numeric(14,2) NOT NULL, total_discount numeric(14,2) NOT NULL default 0, total_amount numeric(14,2) NOT NULL, total_paid numeric(14,2) NOT NULL default 0, balance_amount numeric(14,2) NOT NULL, created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL default now(), updated_at timestamptz NOT NULL default now())`
  - `UNIQUE INDEX invoices_invoice_number_upper_uq ON invoices (upper(invoice_number))`, the only uniqueness rule on invoice numbers (letter case ignored)
  - CHECKs: `due_date >= invoice_date`, `tax_rate BETWEEN 0 AND 100`, all amounts `>= 0`, `total_paid <= total_amount`, `balance_amount = total_amount - total_paid`, `total_amount = invoice_sub_total + total_tax - total_discount`
  - Indexes: `(invoice_date)`, `(due_date)`, `(total_amount)`, `(status, due_date)`, `(created_by)`, GIN trigram on `invoice_number` and `customer_fullname` (`CREATE EXTENSION IF NOT EXISTS pg_trgm`)
- Customer is **embedded** in `invoices` (snapshot semantics: an invoice must keep the customer details as they were when issued).
- Roles (compose, created once on an empty volume by `infra/postgres/initdb/01-app-roles.sh`): `DB_MIGRATION_USER` owns the
  database and the `public` schema and runs migrations + seed; `DB_USER` (the API) has `CONNECT`, schema `USAGE` and, through
  default privileges, `SELECT, INSERT` on the tables — no DDL, no UPDATE/DELETE/TRUNCATE, not a superuser. `PUBLIC` has no rights.
  TypeORM runs with `installExtensions: false`: the API issues no DDL on connect.
- `invoice_items(id uuid PK, invoice_id uuid NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE, name varchar(200) NOT NULL, quantity integer NOT NULL CHECK (quantity > 0), rate numeric(14,2) NOT NULL CHECK (rate > 0), amount numeric(14,2) NOT NULL CHECK (amount >= 0), position smallint NOT NULL default 0, created_at timestamptz NOT NULL default now())`, index `(invoice_id)`.

## 8. Seed (`npm run seed`, idempotent)

- Admin user: id `ad1e0902-1928-4345-b513-60c86c94fc91` (the `createdBy` from Appendix A), email `SEED_ADMIN_EMAIL` (default `reviewer@simpleinvoice.dev`), password `SEED_ADMIN_PASSWORD` (demo value `Reviewer@2026` documented in README), fullname `Demo Reviewer`. Upsert by id: email and fullname are refreshed from env; the password of an existing account only outside production, or with `SEED_RESET_ADMIN_PASSWORD=true` (a rotated production password survives restarts).
- With `NODE_ENV=production` the seed refuses the documented demo password (non-zero exit, so the `migrate` service and the stack
  fail loudly) unless `SEED_ALLOW_DEMO_PASSWORD=true`. The review stack opts in: compose and `.env.example` default to the
  demo password together with `SEED_ALLOW_DEMO_PASSWORD=true`. Any shared environment sets a unique `SEED_ADMIN_PASSWORD` and
  `SEED_ALLOW_DEMO_PASSWORD=false`.
- In docker compose the seed runs in the one-shot `migrate` service as the schema owner (`DB_MIGRATION_USER`); the API container
  holds neither the owner credentials nor the seed password. Re-run it with `docker compose run --rm migrate`.
- Appendix A invoice inserted verbatim (ids, dates, amounts, item) with persisted status `Pending` (it is Overdue by derivation).
- 40 generated invoices (`INV-2026-0001` … `INV-2026-0040`) from a seeded PRNG (mulberry32, seed 101, deterministic): mixed Draft/Pending/Paid (unpaid ones either not yet due or 67–364 days old, so every status filter returns rows on any day), invoice dates spread over the last ~12 months relative to the seed date, due dates 7–60 days after, various currencies/customers/amounts, some partial payments for Pending, full payment for Paid.
- `INSERT … ON CONFLICT DO NOTHING … RETURNING invoice_id` (invoice numbers and ids are deterministic) → re-running never duplicates; items are inserted only for the invoices actually inserted.

## 9. Environment variables (validated at boot — the app refuses to start on invalid config)

The API reads its configuration from the environment only. In compose, `.env` is optional: the entrypoints export `DB_PASSWORD` / `JWT_SECRET` from `.env` when set, else from the files the `secrets` service generated (`DB_PASSWORD_FILE` / `JWT_SECRET_FILE`). The full list, with compose defaults, is in [CONFIGURATION.md](CONFIGURATION.md#3-environment-variables).


| Var | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | |
| `PORT` | `4000` | API port |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | – / 5432 / – / – / – | required; `DB_USER` is the API's runtime role (`simple_invoice_app` in compose) |
| `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` | – | schema owner (`simple_invoice_owner`); used instead of `DB_USER` by the TypeORM CLI and the seed when set (both or neither) |
| `DB_SSL` | `false` | |
| `JWT_SECRET` | – | required, ≥32 chars, ≥10 distinct characters, must not contain `changeme`/`secret`/`example`/`password` (boot error suggests `openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | `3600` | seconds, 60..86400 (no refresh token) |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `simple-invoice-api` / `simple-invoice-web` | |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS: cookie `__Host-si_access_token` + `Secure`. The API warns at boot when `NODE_ENV=production` and it is false |
| `CORS_ORIGINS` | _(empty = CORS disabled)_ | comma-separated origin allowlist for cross-origin browser callers (credentials, `GET`/`HEAD`/`POST`, preflight cached 600 s); the SPA needs none |
| `TRUST_PROXY` | `0` | which peers may set the client IP (rate-limiting key) via `X-Forwarded-For`: `0` = none (socket address), a hop count (`1`, … — only safe if nothing but the proxy reaches the API port; boot warning), or a comma-separated list of IPs/CIDRs (and proxy-addr keywords `loopback`, `linklocal`, `uniquelocal`). Compose sets it to nginx's fixed address (`WEB_PROXY_IP`), not from `.env` |
| `APP_TIMEZONE` | `UTC` | IANA tz used to compute "today" for Overdue |
| `SWAGGER_ENABLED` | `true`, but `false` when `NODE_ENV=production` | compose sets `true` for the review (the brief asks for `/api/docs`) |
| `LOG_LEVEL` | `info` | |
| `THROTTLE_LOGIN_LIMIT` / `THROTTLE_LOGIN_TTL_SECONDS` | `5` / `60` | per client IP |
| `LOGIN_MAX_FAILED_ATTEMPTS` / `LOGIN_FAILURE_WINDOW_SECONDS` | `10` / `900` | per account (failed logins only) |
| `BCRYPT_COST` | `12` | bcrypt work factor, 4..15 and ≥ 10 when `NODE_ENV=production`; read by the API (login dummy hash) and the seed (stored hash), which must agree (compose passes it to `api` and `migrate`) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `reviewer@simpleinvoice.dev` / – | seed only; compose and `.env.example` set the demo password `Reviewer@2026` |
| `SEED_ALLOW_DEMO_PASSWORD` / `SEED_RESET_ADMIN_PASSWORD` | `false` / `false` | seed only, see §8 (compose and `.env.example` set the first to `true` for the review stack) |
| `RUN_MIGRATIONS_ON_BOOT` / `SEED_ON_BOOT` | `true` / `true` | api image entrypoint (standalone `docker run`); compose sets `false` for `api`, the `migrate` service does both |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `simple_invoice` / generated / `simple_invoice` | db container (compose) |
| `DB_PASSWORD_FILE` / `JWT_SECRET_FILE` | – | API image entrypoint: file read when the variable is empty (compose points them at the `secrets` volume) |
| `WEB_PORT` / `API_PORT` / `DB_HOST_PORT` | `3000` / `4000` / `5434` | published host ports (API and DB on 127.0.0.1 only) |
| `VITE_API_BASE_URL` (web, build time) | `/api` | base path of every SPA API call; the default keeps calls same-origin behind nginx or the Vite proxy |
| `API_PROXY_TARGET` (web, dev server) | `http://localhost:4000` | where `npm run dev` proxies `/api` (prefix stripped) |
| `EDGE_SUBNET` / `EDGE_IP_RANGE` / `WEB_PROXY_IP` | `10.203.47.0/24` / `10.203.47.128/25` / `10.203.47.10` | compose `edge` network, its dynamic range and nginx's fixed address (also the API's `TRUST_PROXY`); change together |
| `E2E_DB_ADMIN_USER` / `E2E_DB_ADMIN_PASSWORD` | `POSTGRES_USER` / `POSTGRES_PASSWORD` | API e2e suite only: creates and drops each run's `simple_invoice_<pid>_test` database and its owner and app roles (made by `01-app-roles.sh` through `psql`); the suite migrates as that owner and runs the API as that app role |

## 10. Security-relevant behaviour (summary)

The rules above that exist for security, in one place; the threat model, the reasoning and the verification of each are in
[SECURITY.md](SECURITY.md).

| Area | Contract |
| --- | --- |
| Rate limits | login 429 per IP and per account (failed attempts) with `Retry-After`; default 300 requests / minute per IP on every route, `/health` included |
| Client IP | socket address unless the peer is a trusted proxy (`TRUST_PROXY`); compose trusts only nginx's fixed address |
| Session | `si_access_token` / `__Host-si_access_token` HttpOnly, SameSite=Strict cookie; logout needs `X-Requested-With` and revokes the token |
| Tokens | HS256, `jti`, `exp` and `iat` required, maxAge = `JWT_EXPIRES_IN`; revoked or malformed tokens → 401 |
| Requests | JSON bodies only (415), ≤ 100 kB (413), ≤ 8 levels deep (400); control characters rejected in text fields |
| Responses | `Cache-Control: no-store` (Swagger UI excepted); no CORS unless `CORS_ORIGINS` is set; 500s never carry internals |
| Database | API connects as a DML-only role (SELECT, INSERT); migrations and seed run as the schema owner in the `migrate` service |

## 11. Route summary and curl examples

Routes are mounted at the root, e.g. `http://localhost:4000/invoices`. Through nginx, the same routes are under `/api`,
e.g. `http://localhost:3000/api/invoices`.

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | public, rate-limited (§3) | token + user; sets the session cookie |
| `GET` | `/auth/me` | JWT | current user |
| `POST` | `/auth/logout` | public, `X-Requested-With` required | `204`; revokes the token |
| `GET` | `/invoices` | JWT | `{ data, paging }` (§4.1) |
| `GET` | `/invoices/:id` | JWT | detail; `400` non-UUID, `404` unknown |
| `POST` | `/invoices` | JWT (+ CSRF header for cookie callers) | `201` Draft + `Location`; `409` duplicate |
| `GET` | `/currencies` | JWT | supported currencies |
| `GET` | `/health` | public | `200` or `503` |
| `GET` | `/api/docs`, `/api/docs-json` | public when `SWAGGER_ENABLED` | Swagger UI and OpenAPI document (API port only) |

**Bearer flow** (the way Swagger and scripts call the API; needs `jq`):

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@simpleinvoice.dev","password":"Reviewer@2026"}' | jq -r .accessToken)

# Overdue invoices, highest total first, two per page
curl -s "http://localhost:4000/invoices?status=Overdue&sortBy=totalAmount&ordering=DESC&pageSize=2" \
  -H "Authorization: Bearer $TOKEN"

# Create an invoice (the server computes every total)
curl -s -X POST http://localhost:4000/invoices \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"invoiceNumber":"INV-2026-0100","invoiceDate":"2026-09-29","dueDate":"2026-10-29","currency":"AUD",
       "customer":{"fullname":"Jane Doe","email":"jane@example.com"},
       "items":[{"name":"Consulting","quantity":2,"rate":150.5}],"taxRate":10,"discount":0}'
# → 201, Location: /invoices/<uuid>, status "Draft", invoiceSubTotal 301, totalTax 30.1, totalAmount 331.1

# Log out: the token is revoked on the server
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:4000/auth/logout \
  -H "Authorization: Bearer $TOKEN" -H 'X-Requested-With: XMLHttpRequest'     # 204
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/auth/me \
  -H "Authorization: Bearer $TOKEN"                                            # 401
```

**Cookie flow** (the way the browser calls the API). Cookie-authenticated `POST`s without the CSRF header are refused:

```bash
curl -s -c jar.txt -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@simpleinvoice.dev","password":"Reviewer@2026"}' > /dev/null
curl -s -o /dev/null -w '%{http_code}\n' -b jar.txt "http://localhost:3000/api/invoices?keyword=paul"   # 200
curl -s -o /dev/null -w '%{http_code}\n' -b jar.txt -X POST http://localhost:3000/api/invoices \
  -H 'Content-Type: application/json' -d '{}'                                  # 403: no X-Requested-With
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/login \
  -d 'email=reviewer@simpleinvoice.dev&password=Reviewer@2026'                 # 415: not JSON
```
