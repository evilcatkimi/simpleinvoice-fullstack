import * as bcrypt from 'bcrypt';
import type { DataSource, EntityManager } from 'typeorm';
import { BcryptPasswordHasher } from '../../../modules/auth/infrastructure/bcrypt-password-hasher';
import { APPENDIX_A_INVOICE } from './appendix-a';
import { ADMIN_USER_ID, seedDatabase, type SeedOptions } from './seed';

// bcrypt's minimum cost: a real hash, without the production work factor.
const PASSWORD_HASHER = new BcryptPasswordHasher(4);

const OPTIONS: SeedOptions = {
  admin: { email: 'reviewer@simpleinvoice.dev', password: 'Reviewer@2026' },
  resetAdminPassword: true,
  today: '2026-09-29',
  now: new Date('2026-09-29T10:00:00.000Z'),
};

/**
 * In-memory stand-in for PostgreSQL behind the seed transaction: the invoice INSERT behaves like
 * ON CONFLICT DO NOTHING ... RETURNING invoice_id, so a second run sees every invoice as taken.
 */
function fakeDatabase() {
  const storedInvoiceIds = new Set<string>();
  const storedItems: { invoiceId: string }[] = [];
  const userUpserts: unknown[][] = [];

  const manager = {
    query: jest.fn((_sql: string, parameters: unknown[]) => {
      userUpserts.push(parameters);
      return Promise.resolve([]);
    }),
    createQueryBuilder: () => {
      let rows: { id: string }[] = [];
      const builder = {
        insert: () => builder,
        into: () => builder,
        values: (values: { id: string }[]) => {
          rows = values;
          return builder;
        },
        orIgnore: () => builder,
        returning: () => builder,
        execute: () => {
          const inserted = rows.filter((row) => !storedInvoiceIds.has(row.id));
          inserted.forEach((row) => storedInvoiceIds.add(row.id));
          return Promise.resolve({ raw: inserted.map((row) => ({ invoice_id: row.id })) });
        },
      };
      return builder;
    },
    insert: jest.fn((_entity: unknown, items: { invoiceId: string }[]) => {
      storedItems.push(...items);
      return Promise.resolve();
    }),
  };
  const dataSource = {
    transaction: jest.fn((work: (entityManager: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  };
  const seed = (options: Partial<SeedOptions> = {}) =>
    seedDatabase(dataSource as unknown as DataSource, PASSWORD_HASHER, { ...OPTIONS, ...options });

  return { seed, dataSource, manager, storedInvoiceIds, storedItems, userUpserts };
}

describe('seedDatabase', () => {
  describe('the reviewer account', () => {
    it('stores a hash of the configured password made by the given hasher, never the password itself', async () => {
      const { seed, userUpserts } = fakeDatabase();

      await seed();

      const [[id, email, passwordHash, fullname]] = userUpserts as [
        [string, string, string, string],
      ];
      expect({ id, email, fullname }).toEqual({
        id: ADMIN_USER_ID,
        email: 'reviewer@simpleinvoice.dev',
        fullname: 'Demo Reviewer',
      });
      expect(passwordHash).not.toContain('Reviewer@2026');
      // The hasher's cost (BCRYPT_COST), the one the API's login "dummy" hash uses too.
      expect(passwordHash).toMatch(/^\$2[aby]\$04\$/);
      await expect(bcrypt.compare('Reviewer@2026', passwordHash)).resolves.toBe(true);
    });

    it.each([
      [true, 'overwrites'],
      [false, 'keeps'],
    ])(
      'resetAdminPassword=%p: the upsert %s the password of an existing account (e-mail and name always refresh)',
      async (resetAdminPassword) => {
        const { seed, manager, userUpserts } = fakeDatabase();

        await seed({ resetAdminPassword });

        const [sql] = manager.query.mock.calls[0];
        expect(sql).toContain(
          'password_hash = CASE WHEN $5::boolean THEN EXCLUDED.password_hash ELSE users.password_hash END',
        );
        expect(sql).toContain('email         = EXCLUDED.email');
        expect(userUpserts[0][4]).toBe(resetAdminPassword);
      },
    );
  });

  describe('invoices', () => {
    it('inserts Appendix A and 40 generated invoices with their line items, in one transaction', async () => {
      const { seed, dataSource, storedInvoiceIds, storedItems } = fakeDatabase();

      await expect(seed()).resolves.toEqual({
        adminId: ADMIN_USER_ID,
        adminEmail: 'reviewer@simpleinvoice.dev',
        invoicesInDataset: 41,
        invoicesInserted: 41,
      });
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(storedInvoiceIds.has(APPENDIX_A_INVOICE.id)).toBe(true);
      expect(new Set(storedItems.map((item) => item.invoiceId))).toEqual(storedInvoiceIds);
    });

    it('is idempotent: running it again inserts no invoice and no line item', async () => {
      const { seed, manager, storedItems } = fakeDatabase();
      await seed();

      await expect(seed()).resolves.toMatchObject({ invoicesInDataset: 41, invoicesInserted: 0 });
      expect(storedItems).toHaveLength(41);
      expect(manager.insert).toHaveBeenCalledTimes(1);
    });

    it('only adds line items for the invoices that were actually inserted', async () => {
      const { seed, storedInvoiceIds, storedItems } = fakeDatabase();
      storedInvoiceIds.add(APPENDIX_A_INVOICE.id);

      await expect(seed()).resolves.toMatchObject({ invoicesInserted: 40 });
      expect(storedItems).toHaveLength(40);
      expect(storedItems.map((item) => item.invoiceId)).not.toContain(APPENDIX_A_INVOICE.id);
    });
  });
});
