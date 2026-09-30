import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { DatabaseEnvironment, validateEnvironment } from '../../src/config/environment';
import { buildDataSourceOptions } from '../../src/infrastructure/database/typeorm-options';
import type { E2eRun } from './test-environment';

/** The role setup of the compose `db` image: the e2e run gets exactly the production roles and grants. */
const APP_ROLES_SCRIPT = resolve(__dirname, '../../../../infra/postgres/initdb/01-app-roles.sh');

/**
 * The run's database and roles, set up as in production: the real role script, then the real migrations as the schema
 * owner. A setup that fails half-way leaves nothing behind.
 */
export async function createRunDatabase(run: E2eRun): Promise<void> {
  // An interrupted run skips the teardown; where process ids repeat (containers), its leftovers carry this run's names.
  await dropRunDatabase(run);
  const admin = adminEnvironment();
  try {
    await asAdmin(admin, async (client) => {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(run.database)}`);
    });
    createRoles(admin, run);
    await migrateAsOwner(admin, run);
  } catch (error) {
    // Best effort: the error worth reporting is the original one.
    await dropRunDatabase(run).catch(() => undefined);
    throw error;
  }
}

export async function dropRunDatabase(run: E2eRun): Promise<void> {
  if (!run.database.endsWith('_test')) {
    throw new Error(`Refusing to drop "${run.database}": the name must end with _test.`);
  }
  await asAdmin(adminEnvironment(), async (client) => {
    await client.query(
      `DROP DATABASE IF EXISTS ${client.escapeIdentifier(run.database)} WITH (FORCE)`,
    );
    // The roles' grants lived in the dropped database, so nothing else depends on them.
    for (const role of [run.app.user, run.owner.user]) {
      await client.query(`DROP ROLE IF EXISTS ${client.escapeIdentifier(role)}`);
    }
  });
}

/**
 * The only connection of the run allowed to create and drop databases and roles: E2E_DB_ADMIN_USER /
 * E2E_DB_ADMIN_PASSWORD, by default the bootstrap superuser of the dockerised PostgreSQL from the repository-root .env
 * (POSTGRES_USER / POSTGRES_PASSWORD), else DB_USER / DB_PASSWORD as given.
 */
function adminEnvironment(): DatabaseEnvironment {
  const user = process.env.E2E_DB_ADMIN_USER ?? process.env.POSTGRES_USER;
  const password = process.env.E2E_DB_ADMIN_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  const credentials = user && password ? { DB_USER: user, DB_PASSWORD: password } : {};
  return validateEnvironment(DatabaseEnvironment, {
    ...process.env,
    ...credentials,
    // CREATE/DROP DATABASE cannot run inside the target database: connect to the maintenance database.
    DB_NAME: 'postgres',
  });
}

/** Database and role names cannot be bound as parameters: they are generated (newE2eRun) and quoted by escapeIdentifier. */
async function asAdmin(
  admin: DatabaseEnvironment,
  work: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({
    host: admin.DB_HOST,
    port: admin.DB_PORT,
    user: admin.DB_USER,
    password: admin.DB_PASSWORD,
    database: admin.DB_NAME,
    ssl: admin.DB_SSL ? { rejectUnauthorized: true } : false,
  });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

/** Runs the script with psql, the way the postgres image runs it on an empty volume, but over TCP as the admin. */
function createRoles(admin: DatabaseEnvironment, run: E2eRun): void {
  execFileSync('sh', [APP_ROLES_SCRIPT], {
    env: {
      ...process.env,
      POSTGRES_USER: admin.DB_USER,
      POSTGRES_DB: run.database,
      DB_MIGRATION_USER: run.owner.user,
      DB_MIGRATION_PASSWORD: run.owner.password,
      DB_APP_USER: run.app.user,
      DB_APP_PASSWORD: run.app.password,
      PGHOST: admin.DB_HOST,
      PGPORT: String(admin.DB_PORT),
      PGPASSWORD: admin.DB_PASSWORD,
      // Certificate verification like the API's connections (rejectUnauthorized), against the system CAs.
      ...(admin.DB_SSL
        ? { PGSSLMODE: 'verify-full', PGSSLROOTCERT: 'system' }
        : { PGSSLMODE: 'disable' }),
    },
    // psql echoes each statement's tag; only errors are worth showing (they end up in the thrown error).
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

async function migrateAsOwner(admin: DatabaseEnvironment, run: E2eRun): Promise<void> {
  const dataSource = await new DataSource(
    buildDataSourceOptions({
      ...admin,
      DB_USER: run.owner.user,
      DB_PASSWORD: run.owner.password,
      DB_NAME: run.database,
    }),
  ).initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
