import { randomBytes } from 'node:crypto';
import { loadEnvFiles } from '../../src/config/env-files';

export const TEST_ADMIN = { email: 'e2e.admin@example.com', password: 'E2e-Password-123' };

export interface DatabaseCredentials {
  user: string;
  password: string;
}

/**
 * This run's database and roles, named after the Jest process: concurrent runs (two terminals, parallel CI jobs on one
 * server) each get their own. The global setup creates them, the global teardown drops them.
 */
export interface E2eRun {
  database: string;
  /** Schema owner: runs the migrations and writes the fixtures, like the compose `migrate` service. */
  owner: DatabaseCredentials;
  /** The API's runtime role (SELECT and INSERT only): the app under test connects as it, like in production. */
  app: DatabaseCredentials;
}

const RUN_VARIABLE = 'E2E_RUN';

export function newE2eRun(): E2eRun {
  const prefix = `simple_invoice_${process.pid}`;
  const password = () => randomBytes(24).toString('hex');
  return {
    // The suffix every destructive step checks: nothing here drops a database whose name does not end with _test.
    database: `${prefix}_test`,
    owner: { user: `${prefix}_owner`, password: password() },
    app: { user: `${prefix}_app`, password: password() },
  };
}

/** Test files run in worker processes spawned after the global setup: they inherit its environment. */
export function publishE2eRun(run: E2eRun): void {
  process.env[RUN_VARIABLE] = JSON.stringify(run);
}

export function currentE2eRun(): E2eRun {
  const published = process.env[RUN_VARIABLE];
  if (!published) {
    throw new Error(
      `${RUN_VARIABLE} is not set: run the e2e tests with test/jest-e2e.json, whose global setup creates the database.`,
    );
  }
  return JSON.parse(published) as E2eRun;
}

/**
 * Environment of every test file, applied before AppModule (and its ConfigModule) is imported: the API connects to the
 * run's database as the runtime role, and DB_MIGRATION_* name the owner for the fixtures (as for the TypeORM CLI and
 * the seed). DB_HOST and DB_PORT come from the root .env, unless exported.
 */
export function applyTestEnvironment(): void {
  loadEnvFiles();
  const run = currentE2eRun();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_NAME: run.database,
    DB_USER: run.app.user,
    DB_PASSWORD: run.app.password,
    DB_MIGRATION_USER: run.owner.user,
    DB_MIGRATION_PASSWORD: run.owner.password,
    LOG_LEVEL: 'silent',
    APP_TIMEZONE: 'UTC',
    TRUST_PROXY: '0',
    COOKIE_SECURE: 'false',
    CORS_ORIGINS: '',
    SWAGGER_ENABLED: 'true',
    JWT_EXPIRES_IN: '3600',
    // bcrypt's minimum: every login and fixture hashes a password, and the suites do not test the work factor.
    BCRYPT_COST: '4',
    // Suites log in many times from the same address and with wrong passwords on purpose; the throttling suite
    // installs its own low limits.
    THROTTLE_LOGIN_LIMIT: '1000',
    LOGIN_MAX_FAILED_ATTEMPTS: '1000',
  });
  process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
}
