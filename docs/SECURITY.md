# SimpleInvoice — Security

This document is the security record of SimpleInvoice: what is protected and against whom, which controls exist and where
they live in the code, every finding of the security review with its fix and the evidence that the fix works, the risks
that are accepted on purpose, and what a production deployment must add.

|          |                                                                                                                                                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | 2026-09-29                                                                                                                                                                                                                                     |
| Scope    | `apps/api` (NestJS API), `apps/web` (React SPA, nginx), `docker-compose.yml`, `infra/postgres`, `scripts/`, `Makefile`, `.github/workflows`, `tests/e2e`                                                                                       |
| Findings | 26: 1 High, 2 Medium, 13 Low, 10 Info (SEC-01 … SEC-26), plus one robustness fix (EXTRA-01)                                                                                                                                                    |
| Status   | 25 fixed (SEC-22 through SEC-06), SEC-23 accepted. Every fix is covered by unit/e2e tests, and the Docker-level checks in [Appendix A](#appendix-a--runtime-verification-docker) all passed on the compose stack built from zero on 2026-09-30 |

## 1. Scope, method and reporting

**Method.** Two independent review passes: pass 1 covered the API and the infrastructure (every production source file
read, then dynamic tests against the running compose stack and against a local build), pass 2 covered the SPA, nginx, the
Playwright suite and CI (source review, dependency audits, a headless-browser check of the cookie/CSRF model). Each finding
was then fixed with a test that fails without the fix. Evidence comes from four sources:

1. The automated suites (counts at the final verification, 2026-09-30): API unit tests (Jest, 45 suites / 549 tests), API
   end-to-end tests against a real PostgreSQL 17 running as the least-privilege app role (7 suites / 107 tests), web unit
   tests (Vitest, 24 files / 284 tests) and the Playwright suite on the compose stack (44 tests, incl. axe checks).
2. A regression proof: the final API e2e suite was run against the source as it was before the fixes; **38 of its 103
   tests fail there** (the others pin behaviour that already existed). Fixes that live in configuration parsing (SEC-01's
   proxy list, SEC-14, SEC-15's Swagger default) are covered by unit tests that the old configuration schema could not
   pass.
3. Local runtime checks without Docker: the real role-setup script, migrations, seed and the compiled API (`node
dist/main.js`) against a scratch database on a local PostgreSQL 17; the real `nginx.conf` on nginx 1.30.5 (the version
   of the `nginx-unprivileged:1.30-alpine` image) built locally, in front of a stand-in API and a stand-in DNS server.
4. Docker-level checks on the compose stack built from zero (Appendix A), run on 2026-09-30 after all fixes had landed;
   each result is recorded in the appendix.

**Reporting a vulnerability.** Please do not open a public issue. E-mail `security@simpleinvoice.example` (placeholder:
replace with the team's security contact) with the affected component, the steps to reproduce and the impact you
observed. Expect an acknowledgement within two business days and a fix or mitigation plan within ten.

## 2. Threat model

SimpleInvoice is a single-tenant invoicing application: signed-in users list, search, view and create invoices, which
contain customer personal data. It is delivered as a docker compose stack; nginx on port 3000 is the only network-facing
entry point.

| Assets                                                                   | Why they matter                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Invoices and their customer data (name, e-mail, phone, address, amounts) | personal data and business records: confidentiality and integrity            |
| User credentials (bcrypt hashes) and the reviewer account                | account takeover gives access to all invoices                                |
| Session tokens (JWT) and the HS256 signing key                           | a stolen token or key impersonates a user                                    |
| Database and its credentials                                             | full data access; with superuser rights, code execution on the database host |
| Secrets in `.env` (database passwords, JWT key)                          | unlock everything above                                                      |
| Availability of the API and the database                                 | bcrypt and SQL work can be abused to exhaust resources                       |

| Actor                                          | Capability considered                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Anonymous Internet client                      | reaches nginx (:3000); tries credential stuffing, spoofed headers, malformed input                   |
| Authenticated user                             | any user can read and create every invoice (single tenant by design, see §5); may store hostile text |
| Malicious web page visited by a signed-in user | cross-site form posts (CSRF), cross-origin reads, cookie planting from a sibling origin              |
| Other software on the reviewer's machine       | other `http://localhost:<port>` apps share cookies by host; local processes can reach loopback ports |
| Attacker with code execution in a container    | post-exploitation: tries package managers, the database, other containers                            |
| Supply chain                                   | a compromised npm package, base image or CI action                                                   |

**Trust boundaries.** Browser ↔ nginx (the SPA's same-origin `/api/*` proxy); nginx ↔ API on the `edge` network (the API
trusts `X-Forwarded-For` only from nginx's fixed address); API ↔ PostgreSQL on the `data` network (a DML-only role);
host ↔ containers (API and database published on 127.0.0.1 only); CI ↔ third-party actions (pinned by commit SHA).

**Entry points.** Public: `POST /auth/login`, `POST /auth/logout`, `GET /health`, the SPA's static files. Authenticated:
`GET /auth/me`, `GET/POST /invoices`, `GET /invoices/:id`, `GET /currencies`. Local only: Swagger UI at
`http://localhost:4000/api/docs`, PostgreSQL on `127.0.0.1:5434`.

## 3. Controls in place

| Control                                                                                                                                                                                          | ASVS 4.0 / OWASP API 2023 | Implementation                                                                                                                                           | Verified by                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Secure by default: a global guard requires a token on every route not marked `@Public()`                                                                                                         | V4.1.1 / API5             | `apps/api/src/app.module.ts`, `modules/auth/infrastructure/jwt-auth.guard.ts`                                                                            | `jwt-auth.guard.spec.ts`; e2e 401 on every protected route                                                      |
| HS256 pinned; `iss`/`aud`/`exp` checked; maxAge = `JWT_EXPIRES_IN`; `iat`, UUID `sub`/`jti` required                                                                                             | V3.5.3 / API2             | `modules/auth/infrastructure/jwt-options.ts`, `access-token-verifier.ts`                                                                                 | guard spec: `alg: none`, forged, expired, other audience, no `exp`, too old, future `iat`, non-UUID `sub` → 401 |
| Logout revokes the token (`jti`) until expiry                                                                                                                                                    | V3.3.1 / API2             | `application/auth.service.ts`, `infrastructure/in-memory-revoked-token-store.ts`                                                                         | e2e: reused token after logout → 401 (SEC-09)                                                                   |
| Session cookie HttpOnly, SameSite=Strict, `__Host-` + Secure over HTTPS; cleared with identical attributes                                                                                       | V3.4.1–3.4.5              | `infrastructure/access-token-cookie.ts`, `presentation/auth.controller.ts`                                                                               | controller spec; e2e `COOKIE_SECURE=true` suite                                                                 |
| CSRF: custom header required for cookie-authenticated unsafe requests and for logout; JSON-only bodies                                                                                           | V4.2.2 / API8             | `infrastructure/csrf-header.guard.ts`, `shared/http/json-body.ts`, `main.ts` (`bodyParser: false`)                                                       | e2e: header missing → 403; form login → 415                                                                     |
| No CORS unless an origin is allowlisted; no reflection                                                                                                                                           | V14.5.3 / API8            | `app.setup.ts`, `config/environment.ts` (`CORS_ORIGINS=[]`)                                                                                              | e2e default and allowlist suites                                                                                |
| Brute-force limits: per IP (5/min) and per account (10 failed / 15 min), client IP only from the trusted proxy                                                                                   | V2.2.1 / API4, API6       | `shared/throttling/throttling.ts`, `infrastructure/in-memory-login-attempt-limiter.ts`, `config/environment.ts` (`TRUST_PROXY`)                          | e2e `throttling.e2e-spec.ts` (SEC-01, SEC-18)                                                                   |
| Default rate limit of 300 requests/minute per IP on every route                                                                                                                                  | V11.1.4 / API4            | `shared/throttling/throttling.ts`                                                                                                                        | e2e `/health` carries `X-RateLimit-*`                                                                           |
| bcrypt cost 12 (`BCRYPT_COST`, validated ≥ 10 in production, one value for the API and the seed), 72-byte cap, NUL refused; dummy hash for unknown e-mails (no enumeration by message or timing) | V2.4.1, V2.4.4 / API2     | `infrastructure/bcrypt-password-hasher.ts`, `application/auth.service.ts`, `presentation/dto/login.dto.ts`, `config/environment.ts`                      | service and DTO specs; e2e identical 401 bodies                                                                 |
| Input validation: whitelist + forbidNonWhitelisted, typed objects, control characters refused, body ≤ 100 kB and ≤ 8 levels deep                                                                 | V5.1.3, V5.1.4 / API8     | `shared/validation/*`, `presentation/dto/*.dto.ts`, `shared/http/json-body.ts`, `app.setup.ts`                                                           | DTO specs; e2e malformed payloads → 400 with no error log                                                       |
| Server-owned fields (totals, status, creator) cannot be sent; totals computed with decimal.js                                                                                                    | V5.1.2 / API3, API6       | `create-invoice.dto.ts`, `domain/invoice-calculator.ts`                                                                                                  | DTO spec; e2e "rejects fields owned by the server"                                                              |
| SQL injection: parameters bound everywhere; sort columns from a whitelist; LIKE wildcards escaped                                                                                                | V5.3.4                    | `infrastructure/invoice-list.query.ts`, repositories                                                                                                     | unit + e2e (`'%'`, `'_'`, `\` literal)                                                                          |
| Invoice numbers unique regardless of case, race-free (unique index on `upper(invoice_number)`)                                                                                                   | V11.1.3                   | migrations `1790678400000-CaseInsensitiveInvoiceNumber.ts`, `1790702100000-DropCaseSensitiveInvoiceNumberConstraint.ts`, `typeorm-invoice.repository.ts` | e2e: `inv-x` after `INV-X` → 409; concurrent pair → 201 + 409                                                   |
| Errors: uniform shape, request id, no stack or SQL in responses; database data errors → 400 without echoing the value                                                                            | V7.4.1 / API8             | `shared/filters/all-exceptions.filter.ts`                                                                                                                | filter spec                                                                                                     |
| Logs: JSON, credentials redacted, no query strings, no failing rows or bound values                                                                                                              | V7.1.1, V7.1.2            | `shared/logging/logger-options.ts`                                                                                                                       | logger spec; e2e `logging.e2e-spec.ts` (real logger output)                                                     |
| `Cache-Control: no-store` on API responses                                                                                                                                                       | V8.2.1                    | `shared/http/no-store.ts`                                                                                                                                | e2e, including 4xx                                                                                              |
| Security headers: helmet on the API; strict CSP (`script-src 'self'`), XFO DENY, nosniff on the SPA                                                                                              | V14.4                     | `app.setup.ts`, `apps/web/nginx/security-headers.conf`                                                                                                   | e2e + Playwright (injected inline script blocked)                                                               |
| Least-privilege database access: API role has SELECT/INSERT only; migrations and seed as a separate owner role; no DDL at runtime                                                                | V1.4.4 / API8             | `infra/postgres/initdb/01-app-roles.sh`, `docker-compose.yml` (`migrate`), `typeorm-options.ts`                                                          | local PostgreSQL run (SEC-03); e2e no DDL on connect                                                            |
| Fail-fast configuration: invalid or weak settings stop the boot; risky ones are logged                                                                                                           | V14.1.1                   | `config/environment.ts`, `config/configuration-warnings.ts`                                                                                              | `environment.spec.ts`, `configuration-warnings.spec.ts`                                                         |
| Network exposure: only nginx on all interfaces; API and database on loopback; nginx cannot reach the database                                                                                    | V14.1.3 / API8            | `docker-compose.yml` (`edge`/`data` networks)                                                                                                            | A-2, A-7 (passed)                                                                                               |
| Containers: non-root, read-only root filesystem (api, web), `cap_drop: ALL`, no-new-privileges, tini, resource limits, no package managers in the API image, digests pinned                      | V14.1.5 / API8            | `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `infra/postgres/Dockerfile`                                                          | A-7, A-8 (passed)                                                                                               |
| Secrets: generated (`openssl rand`), independent per role, `.env` mode 0600 from creation, never committed or baked into images                                                                  | V2.10.4, V6.4.1           | `scripts/init-env.sh`, `.gitignore`, `.dockerignore`                                                                                                     | scratch-directory runs (SEC-13)                                                                                 |
| Supply chain: lockfiles with integrity, `npm audit` gate, Dependabot (npm, docker, actions), actions pinned by SHA, install telemetry off                                                        | V14.2.1                   | `.github/workflows/ci.yml`, `.github/dependabot.yml`, `apps/api/package.json`                                                                            | CI                                                                                                              |
| SPA: token never readable by JavaScript, no HTML-injection sinks, open-redirect guard, encoded `mailto:` links                                                                                   | V3.4.2, V5.2, V5.1.5      | `apps/web/src/core/api/api-client.ts`, `session/safe-redirect.ts`, `core/links/mailto.ts`                                                                | web unit tests; Playwright                                                                                      |

## 4. Findings and remediation

Severity follows the reviewers' rating. "Fixed" means the change is in place and the listed verification was run with the
stated result. Test names are quoted from the suites; `e2e` means `apps/api/test/*.e2e-spec.ts` (real PostgreSQL).

### SEC-01 · High · Fixed — Spoofed X-Forwarded-For bypassed the login brute-force limit and the global rate limit

- **Problem.** The compose file set `TRUST_PROXY=1` and published the API on every interface. Express then took the client
  IP from the right-most `X-Forwarded-For` entry _whoever connected_, so a client talking to port 4000 directly chose its
  own IP, i.e. a fresh rate-limit bucket per request (reviewer: rotating XFF → twelve 401s and no 429; 120 wrong
  passwords in 6 s without a 429).
- **Why it is a risk.** Unlimited online password guessing against the reviewer account, and unbounded requests (bcrypt
  cost 12 saturates the CPU; each spoofed key costs throttler memory).
- **Fix.**
  - `apps/api/src/config/environment.ts`: `TRUST_PROXY` is an Express trust-proxy value — a hop count or a list of proxy
    IPs/CIDRs (plus `loopback`, `linklocal`, `uniquelocal`); unset → `0` (trust nobody). Digit-only strings become numbers
    (Express reads the string `"1"` as the IP 0.0.0.1). Every list entry is validated (`isIP`, prefix ≤ 32/128), so a typo
    stops the boot. `config/configuration-warnings.ts` logs a warning for a hop count > 0.
  - `docker-compose.yml`: networks `edge` (web, api; subnet `10.203.47.0/24`, dynamic range `.128/25`, outside Docker's
    default pools) and `data` (migrate, api, db); nginx has the fixed address `10.203.47.10`; the API trusts exactly that
    address (`TRUST_PROXY: ${WEB_PROXY_IP:-10.203.47.10}`, not read from `.env`) and is published on `127.0.0.1` only.
    `EDGE_SUBNET` / `EDGE_IP_RANGE` / `WEB_PROXY_IP` override the three together.
  - Per-account limiting is SEC-18.
- **Verification.**
  - Unit `environment.spec.ts` › TRUST_PROXY: `'1'` → number 1; `'10.203.47.0/24, ::1'` → list; `-1`, `1.5`, `abc`,
    `10.203.47`, `10.203.47.0/33`, `::1/129`, `,` → boot error. `app.setup.spec.ts`: the list reaches `app.set('trust
proxy', …)` unchanged. `configuration-warnings.spec.ts`: hop count → warning.
  - e2e `throttling.e2e-spec.ts` › client IP behind the reverse proxy, with `TRUST_PROXY` flowing through the real
    configuration: untrusted peer with rotating spoofed XFF → `[401, 401, 401, 429]` (one bucket); trusted proxy → one
    bucket per proxy-appended client address (`2, 1, 2` remaining), whatever the client prepends. These pin the Express
    behaviour the fix relies on (they pass on the old code, which could not be configured this way: its schema accepted a
    hop count only, which is what the list-parsing unit tests prove).
  - `docker compose config` resolves the published API port to `host_ip: 127.0.0.1` and `TRUST_PROXY: 10.203.47.10`.
  - Runtime (2026-09-30): A-1, A-2, A-3 passed. Direct calls to :4000 with a rotating X-Forwarded-For: `401 401 401 401 401
429 429`; the default bucket counts 299/298/297 both directly and through nginx; port 4000 is refused on the LAN address.

### SEC-02 · Medium · Fixed — The documented demo password was re-applied on every boot, also in production, and shown in the public OpenAPI document

- **Problem.** `LoginDto` carried `example: 'Reviewer@2026'`, so Swagger UI pre-filled a working login; the seed ran on
  every API start with `NODE_ENV=production` and overwrote the admin password with the published one.
- **Why it is a risk.** Any deployment of the compose file exposes an account with a publicly known password (all invoices
  readable), and an operator's password rotation silently reverts at the next restart.
- **Fix.**
  - `modules/auth/presentation/dto/login.dto.ts`: no password example, generic e-mail example (also in
    `auth-response.dto.ts`).
  - `infrastructure/database/seeds/demo-credentials.ts`: `assertSeedPasswordAllowed()` makes the seed exit non-zero when
    `NODE_ENV=production`, the password is the documented one and `SEED_ALLOW_DEMO_PASSWORD` is not true;
    `shouldResetAdminPassword()`: in production an existing admin keeps its password unless `SEED_RESET_ADMIN_PASSWORD=true`
    (`seeds/seed.ts` upsert uses `CASE WHEN $5 …`).
  - `scripts/init-env.sh` writes `SEED_ALLOW_DEMO_PASSWORD=true` in the same step that writes the demo password;
    `.env.example` has `false` with a "local review only" comment; compose passes `${SEED_ALLOW_DEMO_PASSWORD:-false}` to
    the `migrate` service only.
- **Verification.**
  - Unit `demo-credentials.spec.ts` (7 cases), `seed.spec.ts` (reset flag reaches the SQL), `environment.spec.ts` (flags
    default to false).
  - e2e `platform.e2e-spec.ts` › "publishes no credentials": no password example; neither the demo nor the test password
    in `/api/docs-json`.
  - Local run (compiled seed, `NODE_ENV=production`): documented password without the flag → `Refusing to seed the
publicly documented demo password…`, exit code 1; with the flag → seeded; second line of the summary reports whether
    the password was set or kept.
  - `node dist/main.js` (production mode, Swagger enabled): `curl -s …/api/docs-json | grep -c 'Reviewer@2026'` → **0**.

### SEC-03 · Medium · Fixed — The API, migrations and seed connected as the PostgreSQL superuser

- **Problem.** `DB_USER` was the image's bootstrap superuser (`rolsuper, rolcreaterole, rolcreatedb, rolbypassrls` all
  true), and the entrypoint ran DDL on every boot with it.
- **Why it is a risk.** Any future SQL injection, driver bug or leaked `DB_PASSWORD` would become full database-server
  compromise: `COPY … TO PROGRAM` runs OS commands, `pg_read_file` reads server files, roles and databases can be
  created or dropped.
- **Fix.**
  - `infra/postgres/Dockerfile` (own image, pinned `postgres:17-alpine` digest) bakes in
    `infra/postgres/initdb/01-app-roles.sh` (not bind-mounted). On an empty volume it creates `simple_invoice_owner`
    (owns the database and schema `public`; runs migrations and seed) and `simple_invoice_app` (the API: `CONNECT`, schema
    `USAGE`, and via default privileges `SELECT, INSERT` on the tables — no UPDATE/DELETE/TRUNCATE, no DDL); both
    `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; `PUBLIC` loses `CONNECT` and schema rights; the script
    refuses role names equal to the superuser.
  - `docker-compose.yml`: a one-shot `migrate` service (same image, `command: ["migrate"]`, owner credentials, seed
    variables) runs `docker-entrypoint.sh migrate` and exits; `api` waits for `service_completed_successfully` and holds
    only the app role's credentials — no owner password, no seed password. `apps/api/docker-entrypoint.sh` gained the
    `migrate` command; standalone use of the image is unchanged.
  - `config/environment.ts`: `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` (both or neither); `withMigrationCredentials()`
    is used by `data-source.ts` (TypeORM CLI) and `run-seed.ts`.
  - `infrastructure/database/typeorm-options.ts`: `installExtensions: false` — TypeORM otherwise runs `CREATE EXTENSION IF
NOT EXISTS "uuid-ossp"` on every connect (the schema only uses the built-in `gen_random_uuid()`).
  - `scripts/init-env.sh` generates independent `POSTGRES_PASSWORD`, `DB_MIGRATION_PASSWORD`, `DB_PASSWORD` and upgrades an
    older `.env` (see SEC-13). The API e2e suite creates a database and an owner and app role per run with the same
    `01-app-roles.sh`, migrates and writes fixtures as that owner and boots the API as that app role; the admin
    (`E2E_DB_ADMIN_USER` / `_PASSWORD`, default `POSTGRES_USER` / `_PASSWORD`; CI sets them) only creates and drops them.
- **Verification.**
  - Local PostgreSQL 17, scratch database: the real `01-app-roles.sh` → roles created with all flags false, database owned
    by the owner, ACL `{owner=CTc, app=c}`; superuser-named role → script exits 1. Migrations and seed as the owner → all
    four tables owned by the owner, app grants exactly `INSERT,SELECT`, extensions `pg_trgm, plpgsql` only. As the app
    role: `rolsuper` = f; `CREATE TABLE` → _permission denied for schema public_; `COPY (select 1) TO PROGRAM 'id'` →
    _permission denied to COPY to or from an external program_; `UPDATE users`, `DELETE FROM invoices`, `TRUNCATE` →
    permission denied; `CREATE EXTENSION`, `CREATE ROLE`, `pg_read_file` → permission denied; another role cannot even
    connect. The compiled API running as the app role: health, login, list, create (201), case-duplicate (409), logout and
    revocation all correct; 0 error-level log lines; no extension attempt in the log. Scratch database and roles dropped.
  - e2e `database.e2e-spec.ts` › "runs no DDL when connecting": passes; with `installExtensions: true` it fails, having
    recorded `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`. Unit `typeorm-options.spec.ts`, `environment.spec.ts`.
  - Runtime (2026-09-30): A-1, A-4, A-5, A-6 passed. `migrate` exited 0 before `api` started; `simple_invoice_app` has
    rolsuper/rolcreaterole/rolcreatedb = f; as that role `CREATE TABLE` → _permission denied for schema public_,
    `COPY … TO PROGRAM` → _permission denied_, `DELETE` → _permission denied_, `SELECT` works; the api container holds no
    migration, seed or superuser secret and logs no extension statement.

### SEC-04 · Low · Fixed — Malformed but parseable input answered 500 (NUL bytes, arrays instead of objects, deep nesting)

- **Problem.** NUL bytes in text (PostgreSQL 22021), `customer` as an array (23502), `items` as a nested array
  (`DecimalError`) and 40,000 nested brackets on the unauthenticated login (stack overflow in the validation pipe) all
  produced 500s, each with error-level logs.
- **Why it is a risk.** Wrong status codes, log flooding and alert fatigue (the deep-nesting variant needs no account), and
  type confusion reaching the domain layer.
- **Fix.** `create-invoice.dto.ts`: `@IsObject()` on `customer`, `@IsObject({ each: true })` on `items`, mobile pattern
  `^[+0-9()\- ]*$` (literal space instead of `\s`, mirrored in the SPA's `create-invoice-form.ts`);
  `shared/validation/no-control-characters.validator.ts` on the reference, customer name, item name and search keyword,
  and on the description and address with tab/line breaks allowed (the SPA uses textareas for both — a deliberate
  extension of the reviewer's list); `login.dto.ts` refuses NUL in passwords (bcrypt stops at NUL);
  `shared/http/json-body.ts` rejects bodies nested deeper than 8 levels (iterative check, 400); the exception filter maps
  PostgreSQL data exceptions (SQLSTATE class 22) to 400 "Invalid input" without echoing the database message, and logs
  them as a warning (a validation gap to fix).
- **Verification.** Unit: validator, `json-body.spec.ts` (40,000 levels checked without recursion), DTO specs, filter spec.
  e2e `invoices.e2e-spec.ts` › "malformed input that used to answer 500": every payload from the report → 400, with an
  `afterEach` asserting no error-level log call; `platform.e2e-spec.ts` › 40,000 nested brackets → 400; `logging.e2e-spec.ts`
  › no `"level":50` line in the real log output. All fail on the pre-fix source.

### SEC-05 · Low · Fixed — Logs contained customer data from database errors and search terms

- **Problem.** Only `err.parameters` was redacted: `detail` ("Failing row contains (… name, e-mail, address …)"),
  `driverError` and class-22 messages (which quote the rejected value) were logged, and every list call logged the URL
  with `?keyword=<customer name>` plus the parsed `query`.
- **Why it is a risk.** Personal data in log storage, which usually has broader access and longer retention than the
  database.
- **Fix.** `shared/logging/logger-options.ts`: an `err` serializer drops `parameters`, `detail`, `driverError`, `where` and
  replaces class-22 messages (in the stack too) with `database data exception <SQLSTATE>`; a `req` serializer logs the
  route without its query string and without `query` (explicit allowlist of fields).
- **Verification.** Unit `logger-options.spec.ts` through the logger pino-http builds: failing row and bound values absent
  while SQLSTATE, table, column, SQL text and stack remain; class-22 value absent from message and stack; keyword absent.
  e2e `logging.e2e-spec.ts` with the production logger configuration writing to memory: a search for a sentinel customer
  name and a failed insert carrying it in `detail`/`parameters` → the sentinel never appears; the error line still has
  `"code":"23502"`.

### SEC-06 · Low · Fixed — Login and logout were exposed to cross-site request forgery

- **Problem.** Nest's default urlencoded parser let a cross-site HTML form log the victim into an attacker's account
  (200 + session cookie), and `POST /auth/logout` needed no header at all.
- **Why it is a risk.** Login CSRF attributes the victim's later work to the attacker's account; forced logout is a
  nuisance. SameSite=Strict does not stop it: the browser stores a cookie set by the response to a top-level form post
  (confirmed in a browser, SEC-22).
- **Fix.** `main.ts` and the e2e app use `bodyParser: false`; `configureApp` registers the JSON parser only, preceded by
  `requireJsonBody` (`shared/http/json-body.ts`): any body that is not `application/json` → **415**. Logout requires
  `X-Requested-With: XMLHttpRequest` through `CsrfHeaderGuard` (`modules/auth/infrastructure/csrf-header.guard.ts`), the
  same rule the JWT guard applies to cookie-authenticated unsafe requests; Swagger documents the required header.
- **Verification.** Unit `json-body.spec.ts`, `csrf-header.guard.spec.ts`. e2e `auth.e2e-spec.ts` › valid credentials as
  an HTML form or as `text/plain` → 415 and no `Set-Cookie`; logout without the header → 403, cookie untouched, session
  still valid. Local compiled API: form-encoded login → 415, logout without header → 403, with it → 204. The SPA already
  sends the header (`apps/web/src/core/api/api-client.ts`). Compose stack (A-9, 2026-09-30): cross-site form login through
  nginx → 415 with no `Set-Cookie`, `text/plain` → 415, logout without the header → 403.

### SEC-07 · Low · Fixed — Responses with customer data carried no Cache-Control

- **Problem.** Invoice and profile responses had only an `ETag`.
- **Why it is a risk.** Customer data could remain in the browser's disk cache (or a shared cache) after logout on a
  shared computer.
- **Fix.** `shared/http/no-store.ts`, registered early in `app.setup.ts`: `Cache-Control: no-store` on every response except
  the Swagger UI under `/api/docs`. nginx adds nothing for `/api/*`, so the API's header passes through.
- **Verification.** Unit `no-store.spec.ts`. e2e `platform.e2e-spec.ts` › Cache-Control: login (200 and 401), `/auth/me`,
  `/invoices` (200 and 401), `/invoices/:id` 404, invalid POST 400 → `no-store`; Swagger UI not. The Playwright API
  smoke test also asserts `no-store` on a 401 through nginx.

### SEC-08 · Low · Fixed — Session cookie without the `__Host-` prefix; Secure only by an opt-in flag

- **Problem.** The cookie `si_access_token` could be planted or overwritten by a sibling subdomain or a plain-HTTP
  response, and a TLS deployment that forgot `COOKIE_SECURE=true` sent the JWT over HTTP.
- **Why it is a risk.** Cookie tossing (the victim silently uses the attacker's session) and token exposure on the wire.
- **Fix.** `access-token-cookie.ts`: the `AccessTokenCookie` provider, the one place that derives the cookie from
  `COOKIE_SECURE`, names it `__Host-si_access_token` with `COOKIE_SECURE=true` (browsers then require Secure, `Path=/`, no
  `Domain`) and `si_access_token` on plain-HTTP localhost. The controller sets and clears that name, the token reader only
  reads that name, Swagger documents it; `configuration-warnings.ts` warns at boot when `NODE_ENV=production` and the
  cookie is not Secure.
- **Verification.** Unit: controller spec (prefixed name, Secure, `Path=/`, no `domain`; cleared under the same name),
  guard spec (prefixed cookie accepted, unprefixed ignored when secure), `app.setup.spec.ts` (Swagger scheme name), warnings
  spec. e2e `auth.e2e-spec.ts` › with `COOKIE_SECURE=true`: `Set-Cookie: __Host-si_access_token=…; Path=/; …; Secure`, no
  `Domain`; the cookie authenticates; the unprefixed name does not; logout clears the prefixed one.

### SEC-09 · Low · Fixed — Logout did not revoke the token; a deleted user's token could cause a 500

- **Problem.** After logout the same token kept working until expiry; a token whose user was deleted produced a 500 on
  `POST /invoices` (foreign-key violation).
- **Why it is a risk.** A token captured before logout (login response body, a copy on another device) stayed valid for up
  to `JWT_EXPIRES_IN`.
- **Fix.** Tokens carry `jti: randomUUID()` (`application/auth.service.ts`). Logout verifies the presented token (cookie or
  Bearer; failures ignored), revokes its `jti` until `exp` through the `RevokedTokenStore` port
  (`application/revoked-token-store.ts`, in-memory adapter `infrastructure/in-memory-revoked-token-store.ts`, entries kept
  one minute past expiry, expired ones purged), then clears the cookie. `AccessTokenVerifier` rejects revoked ids with the
  generic 401. The repository maps the `invoices_created_by_fk` violation to 401 "User no longer exists".
- **Verification.** Unit: service (`jti` per token; logout revokes until `exp`), store spec (3), controller spec (revokes the
  presented token; idempotent without one), guard spec (revoked → 401, other tokens unaffected), repository spec (23503 →
  401). e2e `auth.e2e-spec.ts` › logout revokes the SPA's cookie token and an API client's Bearer token (both copies → 401
  afterwards); other sessions of the same user unaffected; a deleted user's token creating an invoice → 401, not 500.
  Local compiled API: logout → 204, the same token on `/auth/me` → 401.

### SEC-10 · Low · Fixed — Container and compose hardening gaps

- **Problem.** The API runtime image kept npm, npx, corepack and yarn; no memory, CPU or PID limits; the database kept
  Docker's default capabilities; one flat network (nginx could reach PostgreSQL); base images referenced by tag only.
- **Why it is a risk.** Post-exploitation tooling inside the container, resource exhaustion of the host (see SEC-01's
  memory growth), and a wider blast radius if nginx or the API is compromised; a moved tag could swap a base image.
- **Fix.** `apps/api/Dockerfile`: the runtime stage deletes the package managers (the entrypoint only needs `node`).
  `docker-compose.yml`: `mem_limit` / `cpus` / `pids_limit` — api 512m / 1.0 / 200, web 128m / 0.5 / 100, db 1g / 1.0 /
  200, migrate 512m / 1.0 / 100; db `cap_drop: [ALL]` with only `CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID` (what the
  postgres entrypoint needs to prepare the data directory and switch user); the `edge`/`data` split of SEC-01 keeps nginx
  off the database network. Base images pinned by digest while keeping the tag: `node:24-alpine`,
  `nginxinc/nginx-unprivileged:1.30-alpine`, `postgres:17-alpine` (index digests taken from Docker Hub on 2026-09-29, the
  daemon being unavailable; Dependabot keeps them current).
- **Verification.** `docker compose config -q` passes; the resolved configuration shows the limits and capabilities.
  Runtime (2026-09-30): A-7 passed (no npm/npx/yarn/corepack in the api image; api 200 pids / 512 MiB / 1 CPU, web 100 /
  128 MiB / 0.5 CPU, migrate 100 / 512 MiB; db `cap_drop: ALL` + CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID; the web
  container cannot resolve `db`), A-8 passed (node and postgres digests equal the pinned ones; nginx is built from its
  pinned digest).

### SEC-11 · Low · Fixed — Production compose allowlisted development origins for credentialed CORS

- **Problem.** `CORS_ORIGINS` defaulted to `http://localhost:3000,http://localhost:5173` with credentials.
- **Why it is a risk.** Cookies are not port-scoped: any page served from `http://localhost:5173` (any other project's
  Vite dev server) could read every invoice with the reviewer's session and send the CSRF header.
- **Fix.** Default `CORS_ORIGINS` is empty in code and compose; `app.setup.ts` enables CORS only for a non-empty list,
  with methods `GET, HEAD, POST` and `maxAge: 600`. `.env.example` explains the opt-in; `init-env.sh` resets the old default
  in existing `.env` files.
- **Verification.** Unit `app.setup.spec.ts` (no `enableCors` by default; exact options with a list), env default `[]`. e2e
  `platform.e2e-spec.ts` › no ACAO for preflights or credentialed requests from `localhost:5173`/`:3000` by default; with
  an allowlist, only listed origins with the new methods and max age. Local compiled API: preflight from
  `http://localhost:5173` → no `Access-Control-Allow-Origin`.

### SEC-12 · Info · Fixed — The JWT verifier accepted tokens without `exp`, of any age, and with a malformed `sub`

- **Problem.** jsonwebtoken checks `exp` only when present; a far-future `exp` was accepted; `sub: "x' OR '1'='1"` reached
  the users query and returned 500.
- **Why it is a risk.** Defence in depth behind the signing key: a mis-issued token would never expire; malformed claims
  cause server errors.
- **Fix.** `jwt-options.ts`: `maxAge = JWT_EXPIRES_IN` (which also makes `iat` mandatory) and `clockTolerance: 5`;
  `access-token-verifier.ts` requires numeric `exp`, numeric `iat` not in the future, UUID `sub` and `jti`, string
  `email`.
- **Verification.** Unit `jwt-options.spec.ts`; guard spec › "claims a correctly signed token must carry": no `exp`, older
  than `JWT_EXPIRES_IN` despite a later `exp`, future `iat`, non-UUID `sub`, missing or non-UUID `jti` → 401. e2e: signed
  token without `jti`, and with `sub: "x' OR '1'='1"` → 401 (was 500).

### SEC-13 · Info · Fixed — init-env.sh wrote secrets before restricting the file mode

- **Problem.** `.env` was created under the caller's umask and only then `chmod 600`.
- **Why it is a risk.** A short window in which other local users could read the secrets.
- **Fix.** `scripts/init-env.sh`: `umask 077`, write to a `mktemp` file and `mv` it into place (atomic; nothing
  half-written). The script also upgrades an existing `.env` idempotently: it appends missing variables (new secrets
  generated the same way), replaces only exact values an earlier version generated (`DB_USER` equal to the superuser, with
  a new independent `DB_PASSWORD`; the old CORS and `TRUST_PROXY=1` defaults) and never regenerates `POSTGRES_PASSWORD`,
  `JWT_SECRET` or the admin password.
- **Verification.** Scratch copies: fresh run under `umask 022` → `-rw-------`, four independent secrets, no temporary file
  left; upgrade of an `.env` produced by the previous script → secrets kept (compared by hash), missing keys added, second
  run "`.env is up to date.`". `sh -n` passes. The review machine's `.env` was upgraded the same way.

### SEC-14 · Info · Fixed — JWT_SECRET was only length-checked

- **Problem.** Thirty-two identical characters or a memorable phrase passed.
- **Why it is a risk.** An HS256 key that can be guessed lets anyone mint tokens.
- **Fix.** `config/environment.ts`: besides ≥ 32 characters, at least 10 distinct characters and none of `changeme`,
  `secret`, `example`, `password`; the boot error suggests `openssl rand -hex 32` and never echoes the value.
- **Verification.** Unit `environment.spec.ts` › JWT_SECRET: six weak keys refused with the hint; a generated key accepted.
  Contract change: the old fixture `'x'.repeat(32)` was replaced by a generated-looking key.

### SEC-15 · Info · Fixed — Swagger on by default in production, token persisted in localStorage, /health outside the rate limiter

- **Problem.** Swagger defaulted to enabled whatever `NODE_ENV`; `persistAuthorization: true` kept the pasted token in
  localStorage; `/health` (a database query per call) was `@SkipThrottle()`.
- **Why it is a risk.** Disclosure of the API surface in real deployments, a token readable by any script on the API origin,
  and an unthrottled unauthenticated database-touching endpoint.
- **Fix.** `SWAGGER_ENABLED` defaults to `NODE_ENV !== 'production'` (compose sets `true` for the review, as the brief
  requires `/api/docs`); `persistAuthorization: false`; `/health` stays public but counts against the default 300/minute per
  IP (the 10-second container probe is far below it). The nginx part is SEC-20.
- **Verification.** Unit `environment.spec.ts` › SWAGGER_ENABLED (production → false, explicit true honoured),
  `app.setup.spec.ts` (persistAuthorization false). e2e `/health` returns `X-RateLimit-Limit: 300` (fails on the pre-fix
  source).

### SEC-16 · Info · Fixed — Invoice numbers were unique only case-sensitively

- **Problem.** `INV-001` and `inv-001` could coexist.
- **Why it is a risk.** Look-alike invoices invite payer confusion and duplicate billing; the case-insensitive search shows
  them side by side.
- **Fix.** New migration `1790678400000-CaseInsensitiveInvoiceNumber.ts`: `CREATE UNIQUE INDEX
invoices_invoice_number_upper_uq ON invoices (upper(invoice_number))` (`down` drops the index). On a table that already
  holds a case-only duplicate the migration fails and names the value (deliberate: such data needs a decision). The index
  implies the original case-sensitive `invoices_invoice_number_uq`, which `1790702100000-DropCaseSensitiveInvoiceNumberConstraint.ts`
  drops (`down` restores it); `typeorm-invoice.repository.ts` maps a violation of the index to 409.
- **Verification.** Unit `postgres-errors.spec.ts`, repository spec. e2e `invoices.e2e-spec.ts` › `inv-x` after `INV-X` →
  409; concurrent `E2E-CASE-RACE` / `e2e-case-race` → exactly one 201. Local PostgreSQL: the migration applied on the 41
  seeded invoices, `migration:revert` dropped the index, `migration:run` re-created it; the compiled API answered 409 to
  `verify-1` after `VERIFY-1`.

### SEC-17 · Info · Fixed — Install-time telemetry dependency

- **Problem.** `@scarf/scarf` (via `@nestjs/swagger` → `swagger-ui-dist`) runs a reporting `postinstall` in `npm ci`.
- **Why it is a risk.** Unwanted network calls from builds and CI (information disclosure about the build environment).
- **Fix.** `"scarfSettings": { "enabled": false }` in `apps/api/package.json`; `ENV SCARF_ANALYTICS=false` in the two
  `npm ci` stages of `apps/api/Dockerfile`; `SCARF_ANALYTICS: "false"` for the whole CI workflow.
- **Verification.** `@scarf/scarf/report.js` treats either setting as an opt-out (`scarfSettings.enabled === false` or
  `SCARF_ANALYTICS === 'false'`). Runtime (2026-09-30): the api build log only shows `ENV SCARF_ANALYTICS=false` and npm's
  install-scripts notice; the script exits without reporting.

### SEC-18 · Low · Fixed — No per-account login limit

- **Problem.** Even with SEC-01 fixed, an attacker with many source IPs was not limited per account.
- **Why it is a risk.** Distributed password guessing against the one well-known account.
- **Fix.** Port `LoginAttemptLimiter` (`modules/auth/application/login-attempt-limiter.ts`) and in-memory adapter
  (`infrastructure/in-memory-login-attempt-limiter.ts`): fixed windows per SHA-256 of the normalised e-mail (no address
  held in memory; unknown e-mails behave identically, so no enumeration). `AuthService.login` registers the attempt before
  any database or bcrypt work (so concurrent guesses cannot overshoot) and clears the count on success: only failures use
  the budget. Beyond `LOGIN_MAX_FAILED_ATTEMPTS` (10) per `LOGIN_FAILURE_WINDOW_SECONDS` (900) → 429 "Too many attempts, try
  again later" with `Retry-After` (`RateLimitedError`, mapped by the exception filter). The per-IP throttler is unchanged.
  Ended windows are swept at most once a minute.
- **Verification.** Unit limiter spec (6), service spec (locked account → 429 before any lookup; unknown e-mail counted;
  success clears), filter spec (`Retry-After`). e2e `throttling.e2e-spec.ts` › per account, each attempt from a new client
  IP: three failures → the right password gets 429 with `Retry-After` ≤ 900; unknown e-mail identical; a success resets the
  count. The Playwright override does not raise this limit (its single failed login is followed by a success).

### SEC-19 · Low · Fixed (by the web team) — `mailto:` header injection on the invoice detail screen

- **Problem.** The customer e-mail was interpolated into `href="mailto:…"` unencoded; addresses such as
  `billing?bcc=spy%40evil.example&subject=…@example.com` pass e-mail validation.
- **Why it is a risk.** Clicking the link pre-fills the reviewer's mail client with an attacker's Bcc, subject or body.
- **Fix.** `apps/web/src/core/links/mailto.ts` encodes the whole address (keeping `@` readable) and is used by
  `invoices/detail/invoice-detail-screen.tsx`.
- **Verification.** `apps/web/src/core/links/mailto.test.ts`; web suite green.

### SEC-20 · Low · Fixed — Swagger UI and the OpenAPI JSON reachable through nginx on the SPA origin

- **Problem.** `/api/api/docs` on port 3000 proxied to the API's Swagger UI and JSON.
- **Why it is a risk.** The API surface (and, before SEC-02, the demo credential) served from the public entry point.
- **Fix.** `apps/web/nginx/nginx.conf`: `location /api/api/ { return 404; }`. Swagger stays on `127.0.0.1:4000` for the review.
- **Verification.** nginx 1.30.5 built locally with the real configuration (only ports, paths and the upstream address
  substituted): `nginx -t` OK; `/api/api/docs`, `/api/api/docs-json`, `/api//api/docs`, `/api/%61pi/docs`,
  `/api/../api/api/docs` → 404 with the security headers; ordinary `/api/*` paths proxied exactly as before. Runtime
  (2026-09-30): A-10 passed — `/api/api/docs` → 404 through nginx, `nginx -t` OK.

### SEC-21 · Low · Fixed (by the lead) — GitHub Actions pinned by mutable tag

- **Problem.** `actions/checkout@v5`, `setup-node@v5`, `upload-artifact@v4`.
- **Why it is a risk.** A moved or compromised tag would run new code in CI with access to the job's environment.
- **Fix.** `.github/workflows/ci.yml` pins each action to a full commit SHA with the version in a comment; Dependabot's
  `github-actions` ecosystem keeps them current.
- **Verification.** `grep -nE 'uses: .+@v[0-9]' .github/workflows/ci.yml` → no match.

### SEC-22 · Info · Fixed through SEC-06 — Login/logout CSRF confirmed in a browser

- **Problem.** The pass-2 headless browser reproduced SEC-06 on a local stand-in of the stack: a cross-site form post to
  `/auth/login` → 200 and a stored Strict cookie; to `/auth/logout` → 204.
- **Why it is a risk.** Login CSRF signs the victim into the attacker's account, so invoices the victim then creates
  (with real customer data) land in an account the attacker controls; forced logout is a nuisance/DoS.
- **Fix.** SEC-06 (JSON-only bodies, logout header).
- **Verification.** In-process and compiled-API checks listed under SEC-06. On the compose stack (A-9, 2026-09-30) the same
  cross-site form posts through nginx → login 415 with no `Set-Cookie`, logout 403. A browser form submits exactly these
  requests (form encoding, no custom header), so the server-side rejection holds for browsers as well.

### SEC-23 · Info · Accepted — `style-src 'unsafe-inline'`, no HSTS on the SPA, no CSP reporting

- **Problem.** The SPA's CSP allows inline styles (the toast library injects a `<style>` element); only API responses carry
  HSTS (helmet); there is no `report-to`.
- **Why it is accepted.** Scripts remain locked to `'self'` (Playwright proves an injected inline script is blocked), so
  inline styles allow at most visual tampering; HSTS is meaningless over the plain-HTTP review stack and belongs to the TLS
  edge; reporting needs a collector the project does not run. Production items are in §6.

### SEC-24 · Info · Fixed (by the web and e2e teams) — The demo password duplicated as source-code fallbacks

- **Problem.** The e2e helper and a web fixture carried `'Reviewer@2026'` as fallbacks.
- **Why it is a risk.** A credential copied into source outlives its rotation and normalises committing secrets; if the
  demo password is ever reused for a real deployment, the repository discloses it.
- **Fix.** `tests/e2e/support/env.ts` reads `SEED_ADMIN_PASSWORD` from the environment or `.env` and fails without it; the
  web fixtures use a neutral test password. The API keeps one production copy, `seeds/demo-credentials.ts`, which the SEC-02
  guard needs; `init-env.sh` writes it for local reviews.
- **Verification.** `grep -rn 'Reviewer@2026' apps/web/src tests/e2e` → no match.

### SEC-25 · Low · Fixed — `make test-e2e` left the stack with a relaxed login limit

- **Problem.** The target recreated the shared stack's `api` with `THROTTLE_LOGIN_LIMIT=1000` and never restored it.
- **Why it is a risk.** After a routine test run, brute-force protection on the reviewer's stack was 200 times weaker,
  silently.
- **Fix.** `Makefile`: the Playwright run's status is captured, `docker compose up -d --wait api` (base file only) always
  restores the regular configuration, then the status is returned — also when tests fail. An interrupted run (Ctrl-C)
  skips the restore: `make up` fixes it.
- **Verification.** `make -n test-e2e` shows the sequence. Runtime (2026-09-30): A-11 passed — `make test-e2e` 44/44, and
  afterwards `THROTTLE_LOGIN_LIMIT` in the api container is back to 5; a second back-to-back run against the regular
  configuration also passed 44/44.

### EXTRA-01 · Robustness · Fixed — nginx resolved `api` only at startup

- **Problem.** `proxy_pass http://api:4000/` is resolved once; recreating the `api` container with a new address left nginx
  answering 502 until it was restarted (SEC-25's restore recreates `api`, so this matters).
- **Why it is a risk.** Availability: after any `api` recreate (deploy, crash restart) every API call through the web
  entry point fails with 502 until someone restarts nginx.
- **Fix.** `apps/web/nginx/nginx.conf`: Docker's DNS (`resolver 127.0.0.11 valid=10s ipv6=off`) and `upstream api_backend {
zone api_backend 1m; server api:4000 resolve; }` (supported by open-source nginx since 1.27.3). The initially proposed
  variable-plus-`rewrite` variant was not used: tested on nginx 1.30.5, the rewrite changes `$uri`, so the existing
  `Cache-Control` map added a second `Cache-Control: no-cache` to every API response; the `resolve` variant keeps URI
  handling identical. The upstream also keeps idle connections to the API (`keepalive 16` with `proxy_set_header Connection
""`, without which `proxy_http_version 1.1` reused nothing) and drops them after 4 s (`keepalive_timeout 4s`), before
  Node's 5 s keep-alive timeout, so nginx never picks a connection the API is closing (a sporadic 502).
- **Verification.** Local nginx 1.30.5 with the real configuration and a stand-in DNS server: `nginx -t` OK; requests reached
  the API resolved through DNS; after the DNS answer for `api` changed (old server stopped), the next request reached the new
  address **without restarting nginx** (200). URI handling compared with the previous configuration on normal and tricky
  paths (encoded `?`, `/`, spaces, query strings): identical. With keepalive: consecutive requests reused one upstream
  connection, after 4.5 s idle a new one was opened, and after an address change the new server answered within the
  resolver's validity window while the old one, still running, got no further requests. Runtime (2026-09-30): A-10 passed — `/api/health` answered through nginx before and after
  `docker compose up -d --force-recreate api` (no 502).

### SEC-26 · Info · Fixed — Transitive `js-yaml` advisory in the API's production dependencies

- **Location.** `apps/api/package.json` → `@nestjs/swagger@11.4.7` → `js-yaml@5.3.0`.
- **Problem.** GHSA-r3ph-w7gj-g6xm (moderate): `maxTotalMergeKeys` does not bound CPU use for empty merge sources. Found by
  the final architect verification (`npm audit --omit=dev` → 2 moderate).
- **Why it is a risk.** Low in this app (Swagger only serialises YAML, it never parses untrusted YAML), but an audit gate
  that tolerates known advisories erodes quickly; the CI gate is `--audit-level=high`, so it would not have flagged it.
- **Fix.** `overrides: { "@nestjs/swagger": { "js-yaml": "^5.4.2" } }` in `apps/api/package.json` (patched release of the
  same major; `npm audit fix --force` would have jumped to `@nestjs/swagger` 12, i.e. NestJS 12 / ESM).
- **Verification.** `npm ls js-yaml` → `@nestjs/swagger` uses `js-yaml@5.4.2`; `npm audit --omit=dev` → 0 vulnerabilities;
  build, 549 unit and 107 e2e tests pass.

## 5. Accepted risks

| Risk                                                                                                            | Why it is accepted                                                                                                                          | What changes it                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Every signed-in user can read and create every invoice (no object-level ownership)                              | The brief asks for "all available invoices within the system": single tenant, no roles. Ids are random UUIDs; `createdBy` is an audit field | With tenants or roles, scope queries in the repositories (tenant/owner `WHERE`) and add BOLA e2e tests (user B gets 404 for user A's invoice) |
| The JWT is also returned in the login response body                                                             | Required by the brief ("return JWT"); the SPA discards it and uses the HttpOnly cookie; the SPA CSP blocks script injection                 | Drop it from the body if the brief allows                                                                                                     |
| Rate-limit counters, account lockouts and revocations live in process memory                                    | One API instance; bounded (entries expire, lockout keys are hashes). A restart forgets them                                                 | Several instances: Redis (or similar) behind the same ports (`LoginAttemptLimiter`, `RevokedTokenStore`, throttler storage)                   |
| Account lockout can be triggered by anyone for 15 minutes                                                       | Standard trade-off of per-account limiting; the per-IP limit applies first; nothing reveals whether the account exists                      | CAPTCHA or step-up after failures; notify the user                                                                                            |
| A deleted user's unexpired token can still read invoices                                                        | There is no user deletion feature; tokens live ≤ `JWT_EXPIRES_IN` (1 h); `/auth/me` and invoice creation already answer 401                 | One primary-key lookup per request in the guard                                                                                               |
| The API role's default privileges also cover TypeORM's `schema_migrations` table (SELECT, INSERT)               | Only with an SQL injection (none found) could a bogus row make a future migration be skipped; visible with `migration:show`                 | `REVOKE ALL ON schema_migrations FROM simple_invoice_app` after migrating                                                                     |
| Plain HTTP in the local stack; `COOKIE_SECURE=false` (warned at boot); cookies shared by every `localhost` port | Local review setup; Safari refuses Secure cookies on http://localhost                                                                       | TLS at the edge + `COOKIE_SECURE=true` (§6); a dedicated host name such as `simpleinvoice.localhost`                                          |
| Secrets are environment variables (visible to `docker inspect` users)                                           | Standard for compose; `.env` is 0600 and git-ignored                                                                                        | Docker secrets / `*_FILE` variables or a secrets manager                                                                                      |
| Swagger UI is enabled in the review stack                                                                       | Required by the brief; published on 127.0.0.1 only and no longer re-exposed through nginx                                                   | `SWAGGER_ENABLED=false` (the production default)                                                                                              |
| The web port listens on all interfaces                                                                          | It is the entry point (e.g. testing on a phone)                                                                                             | Bind it to 127.0.0.1 in a compose override if not needed                                                                                      |
| Database root filesystem is writable; `tini` installed without a version pin                                    | Read-only PostgreSQL needs extra tmpfs mounts that could not be verified without Docker; the base image is digest-pinned                    | `read_only: true` + tmpfs for `/tmp` and `/var/run/postgresql` after verification                                                             |
| SEC-23 items                                                                                                    | See SEC-23                                                                                                                                  | See §6                                                                                                                                        |

## 6. Production hardening checklist

- [ ] Terminate TLS in front of nginx; set `COOKIE_SECURE=true` (cookie becomes `__Host-si_access_token`); send HSTS once for
      the whole origin from nginx and stop the API's own copy.
- [ ] Keep `SWAGGER_ENABLED` unset (off in production) or put the docs behind authentication.
- [ ] Choose a unique `SEED_ADMIN_PASSWORD`, keep `SEED_ALLOW_DEMO_PASSWORD=false`, rotate the admin password after the first
      login; consider not seeding production at all.
- [ ] Secrets from a secrets manager or Docker secrets; separate values per environment; rotate `JWT_SECRET` (it ends all
      sessions) and database passwords on a schedule.
- [ ] More than one API instance: shared stores for the throttler, the login-attempt limiter and the revocation list.
- [ ] Rate limiting and bot protection at the edge (WAF / reverse proxy) in front of `/auth/login`; set `TRUST_PROXY` to the
      real proxy addresses.
- [ ] Publish only the web entry point; keep the API and PostgreSQL on private networks.
- [ ] PostgreSQL: `DB_SSL=true` with verified certificates, encrypted backups with tested restores, admin access separate from
      the application roles, `REVOKE` on `schema_migrations` for the app role.
- [ ] Logs shipped centrally with access control and a retention period; alert on 5xx, on "database rejected a value"
      warnings and on spikes of 401/429.
- [ ] Image scanning (e.g. Trivy or Grype) and an SBOM in CI; keep Dependabot merging digest and SHA bumps; keep the
      `npm audit` gate.
- [ ] CSP: hashed styles instead of `'unsafe-inline'` if the toast library allows; add a `report-to` collector.
- [ ] Plan the NestJS 12 upgrade (ESM) before 11.x stops receiving security fixes.

## Appendix A — Runtime verification (Docker)

Run from the repository root on 2026-09-30, on the stack built from zero (`docker compose down -v && docker compose up -d
--wait`; the database roles are only created on an empty volume). Every check passed; re-run them the same way after
infrastructure changes.

| #    | Check                               | Command                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Expected                                                                                                  | Result (2026-09-30)                                                                                                                      |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A-1  | Stack from zero, migrate ordering   | `docker compose down -v && make up` (or `docker compose up -d --build --wait`), then `docker compose ps -a`                                                                                                                                                                                                                                                                                                                                                | `migrate` exited 0 before `api` started; `api`, `web`, `db` healthy                                       | passed: `migrate` exited 0 (00:53:59.8Z) before `api` started (00:54:00.1Z); all healthy; seed: 41 inserted                              |
| A-2  | Publish addresses and nginx address | `docker compose port api 4000`; `docker compose port db 5432`; `docker inspect simple-invoice-web-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'`; `curl --max-time 3 http://$(ipconfig getifaddr en0):4000/health`                                                                                                                                                                                                                | `127.0.0.1:4000`; `127.0.0.1:5434`; `10.203.47.10`; connection refused                                    | passed: `127.0.0.1:4000`; `127.0.0.1:5434`; `10.203.47.10`; refused                                                                      |
| A-3  | XFF spoofing                        | `for i in 1 2 3; do curl -s -o /dev/null -D - -H "X-Forwarded-For: 203.0.113.$i" http://localhost:4000/currencies \| grep -i '^x-ratelimit-remaining:'; done` (same against `http://localhost:3000/api/currencies`); `for i in $(seq 1 7); do curl -s -o /dev/null -w '%{http_code} ' -X POST http://localhost:4000/auth/login -H 'Content-Type: application/json' -H "X-Forwarded-For: 203.0.113.$i" -d '{"email":"x@example.com","password":"x"}'; done` | decreasing counts (one bucket) on both; `401 401 401 401 401 429 429`                                     | passed: 299/298/297 on both; `401 401 401 401 401 429 429`, `Retry-After` present                                                        |
| A-4  | Roles                               | `docker compose exec db psql -U simple_invoice_app -d simple_invoice -Atc "select rolsuper from pg_roles where rolname = current_user"`                                                                                                                                                                                                                                                                                                                    | `f`                                                                                                       | passed: `f`                                                                                                                              |
| A-5  | Privileges                          | `docker compose exec db psql -U simple_invoice_app -d simple_invoice -c 'create table t(i int)'` and `… -c "copy (select 1) to program 'id'"`                                                                                                                                                                                                                                                                                                              | both _permission denied_                                                                                  | passed: _permission denied for schema public_; _permission denied to COPY to or from an external program_                                |
| A-6  | API holds no DDL or seed secrets    | `docker compose exec api printenv \| grep -cE 'DB_MIGRATION\|SEED_ADMIN_PASSWORD\|POSTGRES_PASSWORD'`; `docker compose logs api \| grep -ci extension`                                                                                                                                                                                                                                                                                                     | `0`; `0`                                                                                                  | passed: `0`; `0`                                                                                                                         |
| A-7  | Container hardening                 | `docker compose exec api sh -c 'command -v npm npx yarn corepack \|\| echo none'`; `docker inspect simple-invoice-api-1 --format '{{.HostConfig.PidsLimit}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}'`; `docker inspect simple-invoice-db-1 --format '{{.HostConfig.CapDrop}} {{.HostConfig.CapAdd}}'`; `docker compose exec web wget -T 3 -q -O /dev/null http://db:5432/`                                                                         | `none`; `200 536870912 1000000000`; `[ALL] [CHOWN DAC_OVERRIDE FOWNER SETGID SETUID]`; `bad address 'db'` | passed: none; `200 536870912 1000000000`; `[ALL] [CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER CAP_SETGID CAP_SETUID]`; `bad address 'db:5432'` |
| A-8  | Pinned bases, no telemetry          | `docker image inspect node:24-alpine postgres:17-alpine nginxinc/nginx-unprivileged:1.30-alpine --format '{{index .RepoDigests 0}}'`; `docker compose build --no-cache --progress=plain api 2>&1 \| grep -ci scarf`                                                                                                                                                                                                                                        | digests equal the ones in the Dockerfiles (otherwise the build pulls the pinned ones); `0` report lines   | passed: node and postgres digests equal; nginx built from its pinned digest; build log: no report lines                                  |
| A-9  | CSRF in a browser (SEC-22)          | Repeat pass 2's cross-site form posts to `http://localhost:3000/api/auth/login` and `/api/auth/logout`                                                                                                                                                                                                                                                                                                                                                     | login 415 with no `Set-Cookie`; logout 403                                                                | passed (curl, same requests a form sends): 415 and no `Set-Cookie`; 403                                                                  |
| A-10 | nginx                               | `docker compose exec web nginx -t`; `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/api/docs`; `curl -s http://localhost:3000/api/health`; then `docker compose up -d --force-recreate api` and repeat the health call after it is healthy                                                                                                                                                                                               | `successful`; `404`; `{"status":"ok","db":"up"}` both times (no 502)                                      | passed: `successful`; `404`; `{"status":"ok","db":"up"}` before and after the recreate                                                   |
| A-11 | e2e restores limits (SEC-25)        | `make test-e2e`; `docker compose exec api printenv THROTTLE_LOGIN_LIMIT`                                                                                                                                                                                                                                                                                                                                                                                   | Playwright green; `5`                                                                                     | passed: 44/44 (twice); `5`                                                                                                               |
| A-12 | Cookie and headers through nginx    | `curl -s -D - -o /dev/null -H 'Content-Type: application/json' -d '{"email":"reviewer@simpleinvoice.dev","password":"<SEED_ADMIN_PASSWORD>"}' http://localhost:3000/api/auth/login \| grep -iE '^(set-cookie\|cache-control)'`                                                                                                                                                                                                                             | `si_access_token=…; HttpOnly; SameSite=Strict`; `Cache-Control: no-store`                                 | passed: `HttpOnly; SameSite=Strict` (no `Secure` on plain-HTTP localhost, as configured); `Cache-Control: no-store`                      |
