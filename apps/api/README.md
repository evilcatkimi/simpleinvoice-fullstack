# SimpleInvoice — API

NestJS 11 (Express 5) REST API for SimpleInvoice, backed by PostgreSQL 17 through TypeORM. It provides
authentication (JWT in an HttpOnly cookie or as a Bearer token), invoice search, detail and creation with
server-side totals, and a derived _Overdue_ status. Swagger UI is served at `/api/docs` (by default only when
`NODE_ENV` is not `production`; the compose stack enables it for the review).

For the whole stack (Docker, seed data, design decisions) see the [root README](../../README.md). The
request/response contract is in [docs/API_CONTRACT.md](../../docs/API_CONTRACT.md), and
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) (sections 2 and 4–7) shows the layers, flows and schema.

## Run it

```bash
# from the repository root, once: create .env and start PostgreSQL on 127.0.0.1:5434
# (on its first start the container creates the schema owner and the API's runtime role with the passwords in .env;
#  if the database was already initialised without this .env, run `make reset` first: it deletes all data)
./scripts/init-env.sh && docker compose up -d db

cd apps/api
npm ci
npm run migration:run  # as DB_MIGRATION_USER (schema owner)
npm run seed           # as DB_MIGRATION_USER
npm run start:dev      # as DB_USER · http://localhost:4000 · Swagger http://localhost:4000/api/docs
```

Requires Node.js 24+.

## Scripts

| Script                                                                | What it does                                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run start:dev`                                                   | watch mode (`nest start --watch`), pretty logs when `NODE_ENV=development`                                                                      |
| `npm run start:debug`                                                 | watch mode with the inspector                                                                                                                   |
| `npm run build` / `npm run start:prod`                                | compile to `dist/` / run `node dist/main.js`                                                                                                    |
| `npm run migration:run` · `migration:revert` · `migration:show`       | TypeORM CLI via ts-node (`src/infrastructure/database/data-source.ts`); connects as `DB_MIGRATION_USER` when set, else `DB_USER`                |
| `npm run migration:run:prod`                                          | same against the compiled `dist/` (the Docker entrypoint runs the equivalent `node node_modules/typeorm/cli.js …` itself: the image has no npm) |
| `npm run seed` / `npm run seed:prod`                                  | idempotent seed: reviewer account, Appendix A invoice, 40 generated invoices; same credentials as the migrations                                |
| `npm test` · `test:watch` · `test:cov`                                | Jest unit tests (`src/**/*.spec.ts`), coverage in `coverage/`                                                                                   |
| `npm run test:e2e`                                                    | Supertest e2e suites (`test/*.e2e-spec.ts`) against a real PostgreSQL database                                                                  |
| `npm run lint` · `lint:fix` · `typecheck` · `format` · `format:check` | ESLint (zero warnings), `tsc --noEmit`, Prettier                                                                                                |

## Structure

```
src/
├── main.ts                 bootstrap: pino logger, configureApp(), shutdown hooks, listen(PORT)
├── app.module.ts           modules + global enhancers: AllExceptionsFilter, ValidationPipe,
│                           throttler guard (Retry-After on every 429) → JwtAuthGuard (in this order)
├── app.setup.ts            HTTP middleware (request id → trust proxy → helmet → no-store → [CORS, only if
│                           CORS_ORIGINS] → cookie-parser → JSON only (415) → JSON ≤ 100 kB → depth ≤ 8) + Swagger;
│                           shared by main.ts and the e2e tests (both create the app with bodyParser: false)
├── config/                 environment.ts (class-validator schema, validated at boot), env-files.ts (.env loading),
│                           configuration-warnings.ts (hop-count TRUST_PROXY, insecure cookie in production)
├── shared/                 clock · dates · decorators (@Public, @CurrentUser) · errors · filters · http (request id,
│                           JSON-only body + depth limit, no-store) · logging · pagination · swagger · throttling
│                           · validation (incl. NoControlCharacters)
├── infrastructure/database/
│   ├── typeorm-options.ts  single source of connection settings (app, CLI, seed, e2e); synchronize: false,
│   │                       installExtensions: false
│   ├── data-source.ts      DataSource for the TypeORM CLI (schema owner credentials when configured)
│   ├── migrations/         hand-written SQL, listed in MIGRATIONS (typeorm-options.ts): 1790640000000-InitSchema.ts
│   │                       creates the whole schema; each later change adds its own class
│   ├── seeds/              run-seed.ts, seed.ts, demo-credentials.ts, appendix-a.ts, invoice-generator.ts, …
│   └── postgres-errors.ts  isUniqueViolation / isForeignKeyViolation (SQLSTATE + constraint name)
└── modules/
    ├── auth/        presentation: AuthController, DTOs · application: AuthService, ports PasswordHasher,
    │                AccessTokenIssuer, LoginAttemptLimiter, RevokedTokenStore · infrastructure:
    │                BcryptPasswordHasher (BCRYPT_COST), JWT token issuer, in-memory limiter and revoked-token
    │                store, AccessTokenVerifier, JwtAuthGuard, CsrfHeaderGuard, access-token cookie
    │                (si_access_token / __Host-si_access_token), JWT options
    ├── users/       application: UserRepository (port) · domain: User · infrastructure: TypeORM adapter + entity
    ├── invoices/    presentation: InvoicesController, DTOs, response mapper
    │                application: InvoicesService, InvoiceRepository (port)
    │                domain: invoice-calculator, invoice-status, money, errors
    │                infrastructure: TypeORM adapter, entities (customer embedded), list query builder, mapper
    ├── currencies/  GET /currencies (supported ISO 4217 codes + symbols)
    └── health/      GET /health (database ping; public, counted against the default per-IP limit)
test/                e2e suites, global setup / teardown (the run's own database and roles), helpers
```

**Conventions**

- **Dependencies point inward.** Controllers call services; services use domain functions and _ports_, which are
  abstract classes that double as Nest injection tokens (`InvoiceRepository`, `UserRepository`,
  `PasswordHasher`, `AccessTokenIssuer`, `LoginAttemptLimiter`, `RevokedTokenStore`, `Clock`). Infrastructure
  adapters implement the ports, so services never import TypeORM, bcrypt or the JWT library. The login-attempt limiter and the revoked-token store are
  in-memory adapters; several API instances would bind Redis-backed ones to the same ports.
- **Errors carry no HTTP.** The domain and application layers throw `ApplicationError` subclasses (kinds
  `business-rule`, `unauthenticated`, `not-found`, `conflict`, `rate-limited`). `AllExceptionsFilter` maps them
  to 400 / 401 / 404 / 409 / 429 (with `Retry-After`) and renders every error in one shape.
- **Money** is `decimal.js` (`Money`, precision 34, `ROUND_HALF_UP`). Columns are `numeric(14,2)` read as text,
  and responses carry JSON numbers with at most two decimals.
- **Calendar dates** are `YYYY-MM-DD` strings everywhere; the pg DATE parser is overridden so they never become
  JS `Date`s. _Today_ always comes from the injected `Clock` (`APP_TIMEZONE`).
- **Secure by default.** `JwtAuthGuard` is global; only routes decorated with `@Public()` skip it.

## Configuration

The variables are listed in [`.env.example`](../../.env.example) and explained in
[docs/CONFIGURATION.md](../../docs/CONFIGURATION.md#3-environment-variables). Loading order: real environment variables, then
`apps/api/.env` (optional overrides), then the repository-root `.env`; the first value found wins. With
`NODE_ENV=production`, `.env` files are ignored. The API validates everything at start-up and exits, listing
every problem, if a value is missing or invalid (for example a `JWT_SECRET` shorter than 32 characters, or a
`TRUST_PROXY` entry that is not an IP address or CIDR).

Settings with a security impact:

- **Database roles.** `DB_USER` / `DB_PASSWORD` is the API's runtime role (`simple_invoice_app`: `SELECT` and
  `INSERT` only). `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` (`simple_invoice_owner`, both or neither) is the
  schema owner that the TypeORM CLI and the seed use instead of `DB_USER` when set. The API never uses it.
- **`TRUST_PROXY`**: which peers may set the client IP (the rate-limiting key) through `X-Forwarded-For`. The
  default `0` trusts nobody. Behind a proxy, list its IP addresses or CIDRs; a hop count (`1`, …) trusts the
  header from whoever connects and is only safe when nothing but the proxy can reach the API port, so the API
  logs a warning for it. Compose sets nginx's fixed address.
- **`CORS_ORIGINS`**: empty by default, which leaves CORS off (the SPA is same-origin). A list of origins
  enables credentialed CORS for exactly those, with `GET`, `HEAD`, `POST`.
- **`COOKIE_SECURE`**: `true` behind HTTPS makes the cookie `Secure` and renames it `__Host-si_access_token`;
  `false` with `NODE_ENV=production` logs a warning.
- **`SWAGGER_ENABLED`**: defaults to `NODE_ENV !== 'production'`.
- **`LOGIN_MAX_FAILED_ATTEMPTS` / `LOGIN_FAILURE_WINDOW_SECONDS`** (10 / 900): the per-account login limit, on
  top of the per-IP `THROTTLE_LOGIN_LIMIT` / `THROTTLE_LOGIN_TTL_SECONDS` (5 / 60).
- **`BCRYPT_COST`** (default 12, allowed 4–15, at least 10 with `NODE_ENV=production`): the bcrypt work factor.
  The API (its dummy hash for unknown e-mails) and the seed (the stored hash) must use the same value, or login
  timing would reveal which e-mails exist.

## Database

- **Schema changes go through migrations** (`synchronize` is off). To add one, create the file in
  `src/infrastructure/database/migrations/` and **add the class to the `MIGRATIONS` array** in
  `typeorm-options.ts`. Migrations are listed explicitly, not globbed, so the same list works under ts-node,
  compiled JS and Jest.
- **Roles.** Tables created by the schema owner are readable and insertable by the runtime role through default
  privileges (`infra/postgres/initdb/01-app-roles.sh`); nothing grants `UPDATE` or `DELETE`. A feature that needs
  them must add a deliberate `GRANT` in its migration. TypeORM runs with `installExtensions: false`, so connecting
  never attempts DDL.
- The seed is safe to re-run: it upserts the reviewer and inserts only missing invoices. With
  `NODE_ENV=production` it keeps an existing reviewer's password unless `SEED_RESET_ADMIN_PASSWORD=true`, and it
  refuses the documented demo password unless `SEED_ALLOW_DEMO_PASSWORD=true`.

## Tests

- **Unit:** `npm test`. Pure domain logic, DTO validation through the real global `ValidationPipe`, guard, filter,
  repository and mapper tests with fakes.
- **e2e:** `npm run test:e2e`. It needs a reachable PostgreSQL server (the root `.env` points at the dockerised
  one) and the `psql` client on the PATH. The global setup creates the run's own database,
  `simple_invoice_<pid>_test`, and its owner and app roles with the real `infra/postgres/initdb/01-app-roles.sh`,
  then applies the real migrations as the owner; the global teardown drops them all, so concurrent runs do not
  interfere. Only that setup and teardown use the admin connection (`E2E_DB_ADMIN_USER` /
  `E2E_DB_ADMIN_PASSWORD`, by default `POSTGRES_USER` / `POSTGRES_PASSWORD` from the root `.env`, so create it with
  `make env` before the database's first start). Each suite boots
  the real `AppModule` through `configureApp()` as the least-privilege app role, like production, with a fixed
  clock (`2026-07-15`) and `BCRYPT_COST=4` for speed; fixtures are written as the owner.

## Docker image

`Dockerfile` is a multi-stage build on `node:24-alpine`, pinned by digest: full install and `nest build`, then
a production-only `npm ci --omit=dev`, then a runtime stage that runs as the `node` user with `tini` as PID 1.
The runtime stage deletes npm, npx, corepack and yarn, which the entrypoint does not need, and the install stages
set `SCARF_ANALYTICS=false`.

`docker-entrypoint.sh` first loads the secrets. For `DB_PASSWORD` and `JWT_SECRET`, it keeps a non-empty environment
value (from `.env`), and otherwise exports the content of the file named by `DB_PASSWORD_FILE` / `JWT_SECRET_FILE`.
Compose points these at the `secrets` volume. The application itself reads the environment only. Then it takes one
command:

- `migrate`: applies the migrations and the idempotent seed, then exits. Compose's one-shot `migrate` service
  runs it as uid 1001 with the schema owner's credentials, and `api` waits for it to complete successfully. The
  API runs as uid 1000 (`node`) and cannot read the owner's password file.
- `api` (the default): runs the migrations (`RUN_MIGRATIONS_ON_BOOT`) and the seed (`SEED_ON_BOOT`) first, both
  `true` by default for a standalone container, then `exec`s the API. Compose sets both to `false`, so the `api`
  container holds only the runtime role's credentials.

Nothing is written at runtime, so compose runs both containers with a read-only root filesystem.
