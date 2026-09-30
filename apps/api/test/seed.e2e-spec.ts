import { DataSource } from 'typeorm';
import {
  SeedEnvironment,
  validateEnvironment,
  withMigrationCredentials,
} from '../src/config/environment';
import { seedDatabase } from '../src/infrastructure/database/seeds/seed';
import { buildDataSourceOptions } from '../src/infrastructure/database/typeorm-options';
import { BcryptPasswordHasher } from '../src/modules/auth/infrastructure/bcrypt-password-hasher';
import { TEST_ADMIN } from './setup/test-environment';
import { TODAY } from './utils/test-app';

describe('Seed (e2e)', () => {
  it('inserts Appendix A and the 40 generated invoices, and nothing when it runs again', async () => {
    // What `npm run seed` does: its environment, and a connection as the schema owner (the compose migrate service).
    const env = validateEnvironment(SeedEnvironment, {
      ...process.env,
      SEED_ADMIN_EMAIL: TEST_ADMIN.email,
      SEED_ADMIN_PASSWORD: TEST_ADMIN.password,
    });
    const dataSource = await new DataSource(
      buildDataSourceOptions(withMigrationCredentials(env)),
    ).initialize();
    try {
      await dataSource.query('TRUNCATE invoice_items, invoices, users RESTART IDENTITY CASCADE');
      const seed = () =>
        seedDatabase(dataSource, new BcryptPasswordHasher(env.BCRYPT_COST), {
          admin: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD },
          resetAdminPassword: false,
          today: TODAY,
          now: new Date(`${TODAY}T09:00:00.000Z`),
        });

      await expect(seed()).resolves.toMatchObject({ invoicesInDataset: 41, invoicesInserted: 41 });
      await expect(seed()).resolves.toMatchObject({ invoicesInDataset: 41, invoicesInserted: 0 });

      const [rows] = await dataSource.query<[{ users: number; invoices: number; items: number }]>(
        `SELECT (SELECT count(*) FROM users)::int         AS users,
                (SELECT count(*) FROM invoices)::int      AS invoices,
                (SELECT count(*) FROM invoice_items)::int AS items`,
      );
      expect(rows).toEqual({ users: 1, invoices: 41, items: 41 });
    } finally {
      await dataSource.destroy();
    }
  });
});
