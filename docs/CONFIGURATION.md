# SimpleInvoice — Configuration and operations

This page covers how the stack is configured, which ports and networks it uses, the `make` targets, the full
local (non-Docker) setup, and troubleshooting. The short version is in the [root README](../README.md).

## Contents

1. [How configuration is loaded](#1-how-configuration-is-loaded)
2. [Generated secrets](#2-generated-secrets)
3. [Environment variables](#3-environment-variables)
4. [Ports and networks](#4-ports-and-networks)
5. [Make targets](#5-make-targets)
6. [Running without Docker](#6-running-without-docker)
7. [Troubleshooting](#7-troubleshooting)

## 1. How configuration is loaded

- **Every setting is an environment variable.** The API validates its environment with class-validator at start-up
  (`apps/api/src/config/environment.ts`). On an invalid value it refuses to start and lists every problem at once.
- **`.env` is optional.** A bare `docker compose up --build` works from a fresh clone. Compose supplies a default for
  every non-secret setting, and the one-shot `secrets` service generates the secrets (see [§2](#2-generated-secrets)).
  A `.env` in the repository root only overrides: **a value set in `.env` always wins** over the compose default
  and over the generated secret.
- **When you need a `.env`:**
  - to run the API or the API e2e tests on the host
  - to pin your own secrets
  - to change ports, the network range or the seed account

  `./scripts/init-env.sh` (`make env`) creates it from [`.env.example`](../.env.example) with random secrets and
  `umask 077`. Run on an existing `.env`, it only appends the variables that a newer version introduced and keeps
  every existing value.
- **Loading order outside Docker** (the API, the TypeORM CLI, the seed and the e2e tests):
  1. real environment variables
  2. `apps/api/.env` (optional per-developer overrides)
  3. the root `.env`

  The first value found wins. With `NODE_ENV=production`, the API ignores `.env` files.

## 2. Generated secrets

On the first start, the `secrets` service writes the four stack secrets into the `secrets` volume. The service is
`infra/postgres/generate-secrets.sh`, run from the db image, and it has no network. It never regenerates a file that
already exists, because the database roles were created with those passwords.

| File | Variable | Owner (mode 0400) | Read by |
| --- | --- | --- | --- |
| `postgres_password` | `POSTGRES_PASSWORD` | root | db entrypoint, before it drops privileges |
| `db_migration_password` | `DB_MIGRATION_PASSWORD` | uid 1001 | `migrate` (runs as 1001:1001) and the db entrypoint |
| `db_password` | `DB_PASSWORD` | uid 1000 | `api` (node user) and the db entrypoint |
| `jwt_secret` | `JWT_SECRET` | uid 1000 | `api` |

- **Services still receive secrets as environment variables.** Each entrypoint (`infra/postgres/entrypoint.sh`,
  `apps/api/docker-entrypoint.sh`) exports a variable from `.env` if it is non-empty, and otherwise from its file.
  The API image uses the `DB_PASSWORD_FILE` / `JWT_SECRET_FILE` convention for this. The application code reads the
  environment only.
- **Each container can read only its own secrets.** The `api` container cannot read `db_migration_password` or
  `postgres_password`.
- **Secrets stay out of `docker inspect`**, unless they are set in `.env`.
- **Data and secrets are deleted together.** `docker compose down -v` (`make reset`) removes both volumes, so the
  next start creates new secrets and new roles. Deleting only one of them would leave roles whose passwords nobody
  knows.
- **Mixing `.env` and generated secrets needs care.** The database roles get the passwords that are present when the
  volume is first initialised. If you add database passwords to `.env` after that, run `make reset` once (this
  **deletes all data**).

## 3. Environment variables

[`.env.example`](../.env.example) lists every variable, without secrets. Variables that do not apply to your setup can
be left out.

**Compose: ports and network**

| Variable | Default | Notes |
| --- | --- | --- |
| `WEB_PORT` / `API_PORT` / `DB_HOST_PORT` | `3000` / `4000` / `5434` | published host ports ([§4](#4-ports-and-networks)) |
| `EDGE_SUBNET` / `EDGE_IP_RANGE` / `WEB_PROXY_IP` | `10.203.47.0/24` / `10.203.47.128/25` / `10.203.47.10` | change all three together, then `docker compose down` once |
| `IMAGE_TAG` | `local` | tag of the three locally built images |

**Database**

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_DB` | `simple_invoice` | bootstrap superuser and database name; used once, on an empty volume |
| `POSTGRES_PASSWORD` | generated | bootstrap superuser password |
| `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` | `simple_invoice_owner` / generated | schema owner, used by `migrate`, the TypeORM CLI and the seed; set both or neither |
| `DB_HOST` / `DB_PORT` | `localhost` / `5434` | compose overrides them with `db:5432` |
| `DB_USER` / `DB_PASSWORD` | `simple_invoice_app` / generated | the API's runtime role: `SELECT` and `INSERT` only |
| `DB_NAME` | `simple_invoice` | |
| `DB_SSL` | `false` | `true`: TLS with certificate verification |
| `DB_PASSWORD_FILE` | set by compose | API image: file read when `DB_PASSWORD` is empty |

**API**

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | compose sets `production`: JSON logs, Swagger off by default, stricter seed |
| `PORT` | `4000` | |
| `JWT_SECRET` | generated (64 hex) | at least 32 characters and 10 distinct ones; placeholder words are refused |
| `JWT_SECRET_FILE` | set by compose | API image: file read when `JWT_SECRET` is empty |
| `JWT_EXPIRES_IN` | `3600` | token lifetime in seconds (60–86400), also the maximum token age |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `simple-invoice-api` / `simple-invoice-web` | |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS; the cookie becomes `__Host-si_access_token` |
| `CORS_ORIGINS` | empty (CORS off) | opt-in allowlist; the SPA is same-origin and needs none |
| `TRUST_PROXY` | `0` | proxies allowed to set the client IP; compose sets it to `WEB_PROXY_IP`, not the `.env` value |
| `APP_TIMEZONE` | `UTC` | IANA zone that defines "today" for _Overdue_ |
| `SWAGGER_ENABLED` | `true`; `false` in production | compose sets `true` for the review |
| `LOG_LEVEL` | `info` | `fatal` … `trace`, `silent` |
| `THROTTLE_LOGIN_LIMIT` / `THROTTLE_LOGIN_TTL_SECONDS` | `5` / `60` | login attempts per window per client IP |
| `LOGIN_MAX_FAILED_ATTEMPTS` / `LOGIN_FAILURE_WINDOW_SECONDS` | `10` / `900` | failed logins per account before `429` |
| `BCRYPT_COST` | `12` | 4–15, at least 10 in production; the API and the seed must agree |
| `RUN_MIGRATIONS_ON_BOOT` / `SEED_ON_BOOT` | `true` / `true` | API image, standalone; compose sets both to `false` for `api` |

**Seed**

| Variable | Default | Notes |
| --- | --- | --- |
| `SEED_ADMIN_EMAIL` | `reviewer@simpleinvoice.dev` | |
| `SEED_ADMIN_PASSWORD` | `Reviewer@2026` (compose, `.env.example`) | 8–72 bytes; the code has no default |
| `SEED_ALLOW_DEMO_PASSWORD` | `true` (compose, `.env.example`); `false` in code | lets production mode seed the documented demo password |
| `SEED_RESET_ADMIN_PASSWORD` | `false` | production mode keeps an existing admin's password unless `true` |

For any shared environment, set a unique `SEED_ADMIN_PASSWORD` and `SEED_ALLOW_DEMO_PASSWORD=false`.

**Web and tests**

| Variable | Default | Notes |
| --- | --- | --- |
| `API_PROXY_TARGET` | `http://localhost:4000` | where the Vite dev server forwards `/api/*` |
| `VITE_API_BASE_URL` | `/api` | API base URL as seen by the browser (build time) |
| `E2E_DB_ADMIN_USER` / `E2E_DB_ADMIN_PASSWORD` | `POSTGRES_USER` / `POSTGRES_PASSWORD` | API e2e: creates and drops each run's database and roles |
| `E2E_BASE_URL` / `E2E_API_URL` | `http://localhost:3000` / `http://localhost:4000` | Playwright target ([tests/e2e/README.md](../tests/e2e/README.md)) |

## 4. Ports and networks

| Service | Host address | Container port | Bound to |
| --- | --- | --- | --- |
| web (nginx: SPA + `/api/*` proxy) | <http://localhost:3000> | 8080 | all interfaces (`WEB_PORT`) |
| api (REST, Swagger `/api/docs`, OpenAPI `/api/docs-json`) | <http://localhost:4000> | 4000 | 127.0.0.1 only (`API_PORT`) |
| db (PostgreSQL) | `127.0.0.1:5434` | 5432 | 127.0.0.1 only (`DB_HOST_PORT`) |
| Vite dev server (no Docker) | <http://localhost:5173> | — | localhost |

- **Health checks:** <http://localhost:4000/health> for the API, <http://localhost:3000/healthz> for nginx. The db
  check runs `pg_isready` over TCP with a 30 s `start_period`, so `migrate` never connects to the temporary server
  that runs during first initialisation.
- **Swagger** is served on the API port only. Through nginx, `/api/api/*` answers 404.
- **Networks:** `edge` (web, api) and `data` (migrate, api, db). nginx cannot reach PostgreSQL. The `secrets`
  service has no network.
- **The nginx address is fixed.** nginx has `10.203.47.10` on `edge` (subnet `10.203.47.0/24`). Containers get
  dynamic addresses from `10.203.47.128/25` only, so no other container can take that address. The API trusts
  `X-Forwarded-For` from that address only (`TRUST_PROXY`).
- **Address clashes:** if `10.203.47.0/24` clashes with a VPN or LAN route, set `EDGE_SUBNET`, `EDGE_IP_RANGE` and
  `WEB_PROXY_IP` together in `.env`, then run `docker compose down` once.
- **Runtime settings:**
  - Logs rotate at 10 MB × 3 files per container (`json-file`).
  - `db` gets a 128 MB `/dev/shm`.
  - `api` has 20 s to drain requests on stop.
  - `migrate` and `secrets` reuse the locally built images (`pull_policy: never`).

## 5. Make targets

| Target | Does |
| --- | --- |
| `make up` | `docker compose up --build`: build and start the whole stack |
| `make down` | stop the stack; keeps the data and secrets volumes |
| `make reset` | `docker compose down -v`: also deletes the data and secrets volumes |
| `make logs` | follow the logs of all services |
| `make env` | optional: create `.env` with random secrets, or add new variables to an existing one |
| `make test` | API unit + API e2e + web tests (needs Node.js 24, PostgreSQL, `psql` and a root `.env`) |
| `make test-e2e` | start the stack with the e2e override, run Playwright, then restore the regular `api` |
| `make lint` | lint, format check and typecheck of both apps and the Playwright suite |

`./scripts/init-env.sh --force` regenerates every secret in `.env`. Run `make reset` afterwards, because the
database roles were created with the previous passwords.

## 6. Running without Docker

Prerequisites: Node.js **24+**, npm, and PostgreSQL 17 (or Docker for the database only).

**1. Create `.env`.** The local API must know the database passwords. Run this **before** the dockerised
database first initialises, or run `make reset` afterwards (this **deletes all data**):

```bash
./scripts/init-env.sh     # DB_HOST=localhost, DB_PORT=5434 and random secrets
```

**2. Database.** Pick one option.

- **PostgreSQL in Docker:** `docker compose up -d db`. It listens on `127.0.0.1:5434`, which `.env` points to. On
  its first start it creates the two roles with the passwords from `.env`.
- **Your own PostgreSQL 17 server:**
  1. Create the database and the two roles, as `infra/postgres/initdb/01-app-roles.sh` does (SQL below).
  2. Set `DB_HOST`, `DB_PORT` (usually 5432), `DB_NAME`, `DB_USER` / `DB_PASSWORD` and `DB_MIGRATION_USER` /
     `DB_MIGRATION_PASSWORD`.
  3. Make sure the `pg_trgm` contrib extension is available. It is a trusted extension, so the schema owner can
     create it.

  As a superuser:

  ```sql
  CREATE ROLE simple_invoice_owner LOGIN PASSWORD 'change-me-owner';
  CREATE ROLE simple_invoice_app LOGIN PASSWORD 'change-me-app';
  CREATE DATABASE simple_invoice OWNER simple_invoice_owner;
  \c simple_invoice
  ALTER SCHEMA public OWNER TO simple_invoice_owner;
  REVOKE ALL ON DATABASE simple_invoice FROM PUBLIC;
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  GRANT CONNECT ON DATABASE simple_invoice TO simple_invoice_app;
  GRANT USAGE ON SCHEMA public TO simple_invoice_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE simple_invoice_owner IN SCHEMA public
    GRANT SELECT, INSERT ON TABLES TO simple_invoice_app;
  ```

  For a throwaway database, a single role that owns it also works. Use it as `DB_USER` and delete the
  `DB_MIGRATION_*` lines.

**3. API**

```bash
cd apps/api
npm ci
npm run migration:run     # apply the schema (as DB_MIGRATION_USER)
npm run seed              # reviewer account + Appendix A + 40 generated invoices (as DB_MIGRATION_USER)
npm run start:dev         # http://localhost:4000, Swagger /api/docs, watch mode (as DB_USER)
```

**4. Web** (in a second terminal)

```bash
cd apps/web
npm ci
npm run dev               # http://localhost:5173; /api/* is proxied to http://localhost:4000
```

The Vite proxy strips `/api` the same way nginx does, so the cookie works as it does in Docker.

**Production mode without Docker:** run `npm run build`, `npm run migration:run:prod`, `npm run seed:prod` and
`npm run start:prod`. With `NODE_ENV=production` the API ignores `.env` files, so export the variables yourself.

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `migrate` fails with `password authentication failed for user "simple_invoice_owner"` | The volume was initialised with other passwords. For example, `.env` gained passwords after the first start, or the volume predates the roles. Run `make reset` (**deletes all data**), then `make up`. |
| Local API or API e2e: `password authentication failed` | The dockerised database was initialised before `.env` existed. Run `make reset`, then `docker compose up -d db`. |
| Compose error about the `edge` network or `10.203.47.10` | The network predates the fixed subnet. Run `docker compose down` once. |
| `Pool overlaps with other one on this address space` | Set `EDGE_SUBNET`, `EDGE_IP_RANGE` and `WEB_PROXY_IP` in `.env`, then run `docker compose down`. |
| `port is already allocated` | Change `WEB_PORT`, `API_PORT` or `DB_HOST_PORT` in `.env` (and `DB_PORT` for local runs). |
| Login answers **429** | Per IP: wait a minute. Per account: wait for the window in `Retry-After`. Both counters live in memory, so `docker compose restart api` clears them. |
| Changed `SEED_ADMIN_PASSWORD`, but the old password still works | Production mode keeps an existing password. Run `SEED_RESET_ADMIN_PASSWORD=true docker compose run --rm migrate`. |
| `migrate`: `Refusing to seed the publicly documented demo password` | `.env` sets `SEED_ALLOW_DEMO_PASSWORD=false` with the demo password. Choose another password, or set the flag to `true` for a local review. |
| `api` never starts; `migrate` exited non-zero | Check `docker compose logs migrate`. |
| `api` is unhealthy | Check `docker compose logs api`. An invalid configuration lists every problem. |
| `api` logs `COOKIE_SECURE is false with NODE_ENV=production` | This is expected on plain-HTTP localhost. Behind HTTPS, set `COOKIE_SECURE=true`. |
| **415** `Content-Type must be application/json` | Send a JSON body with `Content-Type: application/json`. |
| `POST /auth/logout` answers **403** | Send `X-Requested-With: XMLHttpRequest`. |
| `http://localhost:3000/api/api/docs` answers 404 | This is by design. Use <http://localhost:4000/api/docs>. |
| Local API: `JWT_SECRET must be at least 32 characters long` | Create `.env` with `./scripts/init-env.sh`. |
| `npm run test:e2e` cannot connect, or fails running `psql` | Start `docker compose up -d db`, install the `psql` client, and make sure the root `.env` exists. |
| Web dev server shows network errors | Start the API on port 4000, or set `API_PROXY_TARGET`. |
| Signed out after an hour | The token expired (`JWT_EXPIRES_IN`). Sign in again. |
| Docker hangs or builds are killed (Colima) | Give the VM at least 3 GB: `colima stop && colima start --memory 3`. |
