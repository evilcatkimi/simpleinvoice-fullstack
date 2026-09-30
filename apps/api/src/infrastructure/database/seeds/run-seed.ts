import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnvFiles } from '../../../config/env-files';
import {
  SeedEnvironment,
  validateEnvironment,
  withMigrationCredentials,
} from '../../../config/environment';
import { BcryptPasswordHasher } from '../../../modules/auth/infrastructure/bcrypt-password-hasher';
import { toCalendarDate } from '../../../shared/dates/calendar-date';
import { buildDataSourceOptions } from '../typeorm-options';
import { assertSeedPasswordAllowed, shouldResetAdminPassword } from './demo-credentials';
import { seedDatabase } from './seed';

/**
 * `npm run seed` (ts-node) / `npm run seed:prod` (compiled, run by the compose `migrate` service): admin user +
 * Appendix A + generated invoices. Connects as the schema owner when DB_MIGRATION_USER is set.
 */
async function main(): Promise<void> {
  loadEnvFiles();
  const env = validateEnvironment(SeedEnvironment, process.env);
  assertSeedPasswordAllowed(env);
  const resetAdminPassword = shouldResetAdminPassword(env);
  const dataSource = await new DataSource(
    buildDataSourceOptions(withMigrationCredentials(env)),
  ).initialize();
  try {
    const now = new Date();
    const summary = await seedDatabase(dataSource, new BcryptPasswordHasher(env.BCRYPT_COST), {
      admin: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD },
      resetAdminPassword,
      today: toCalendarDate(now, env.APP_TIMEZONE),
      now,
    });
    const skipped = summary.invoicesInDataset - summary.invoicesInserted;
    console.log(
      [
        'Seed complete',
        `  admin user : ${summary.adminEmail} (id ${summary.adminId})`,
        `  password   : ${resetAdminPassword ? 'set from SEED_ADMIN_PASSWORD' : 'kept if the account already existed (SEED_RESET_ADMIN_PASSWORD=true resets it)'}`,
        `  invoices   : ${summary.invoicesInserted} inserted, ${skipped} already present`,
      ].join('\n'),
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
