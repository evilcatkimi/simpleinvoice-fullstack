import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

const E2E_DIR = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(E2E_DIR, '..', '..');

/** The repository's root .env (optional overrides); empty when it does not exist. */
function readRootEnv(): NodeJS.Dict<string> {
  try {
    return parseEnv(readFileSync(path.join(REPO_ROOT, '.env'), 'utf8'));
  } catch {
    return {};
  }
}

const rootEnv = readRootEnv();
const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

/** The SPA, served by nginx, which also proxies /api/* to the API. */
export const WEB_URL = withoutTrailingSlash(process.env.E2E_BASE_URL ?? 'http://localhost:3000');

/** The API's own port, for the browserless smoke tests. */
export const API_URL = withoutTrailingSlash(process.env.E2E_API_URL ?? 'http://localhost:4000');

/** A variable from the environment, else from the root .env; blank counts as missing. */
const setting = (name: string): string | undefined =>
  process.env[name] || rootEnv[name] || undefined;

/**
 * The seeded demo account: the credentials the API seeds (SEED_ADMIN_*, from the environment or the root .env), else
 * the defaults docker-compose.yml seeds on a fresh clone (the reviewer account documented in README.md).
 */
export const DEMO_USER = {
  email: setting('SEED_ADMIN_EMAIL') ?? 'reviewer@simpleinvoice.dev',
  password: setting('SEED_ADMIN_PASSWORD') ?? 'Reviewer@2026',
  fullname: 'Demo Reviewer',
};

/**
 * Browser storage (the HttpOnly session cookie) saved by the setup project and deleted by the
 * teardown project. Git-ignored. One file per run: the runner process names it and its workers
 * inherit the variable, so two runs from the same checkout never read each other's half-written file.
 */
process.env.E2E_AUTH_STATE ??= path.join(E2E_DIR, '.auth', `reviewer-${process.pid}.json`);
export const AUTH_STATE_PATH: string = process.env.E2E_AUTH_STATE;

/** Storage state of a visitor who has never signed in. */
export const ANONYMOUS_STATE = { cookies: [], origins: [] };

/** The session cookie; the API names it `__Host-si_access_token` when COOKIE_SECURE=true (HTTPS). */
export function isSessionCookie(name: string): boolean {
  return name === 'si_access_token' || name === '__Host-si_access_token';
}
