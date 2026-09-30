import type { DataSource, EntityManager } from 'typeorm';
import type { PasswordHasher } from '../../../modules/auth/application/password-hasher';
import { InvoiceItemEntity } from '../../../modules/invoices/infrastructure/invoice-item.entity';
import {
  toInvoiceItemRows,
  toInvoiceRow,
} from '../../../modules/invoices/infrastructure/invoice-persistence.mapper';
import { InvoiceEntity } from '../../../modules/invoices/infrastructure/invoice.entity';
import { APPENDIX_A_INVOICE } from './appendix-a';
import { generateInvoices } from './invoice-generator';
import { toSeededInvoice, type SeedInvoice } from './seed-invoice';

/** The `createdBy` of the Appendix A invoice. */
export const ADMIN_USER_ID = 'ad1e0902-1928-4345-b513-60c86c94fc91';
const ADMIN_FULLNAME = 'Demo Reviewer';
const GENERATED_INVOICE_COUNT = 40;
const GENERATOR_SEED = 101;

export interface AdminCredentials {
  email: string;
  password: string;
}

export interface SeedOptions {
  admin: AdminCredentials;
  /** Overwrite the password of an existing admin account (see shouldResetAdminPassword). */
  resetAdminPassword: boolean;
  /** Calendar date (APP_TIMEZONE) the generated dates are relative to. */
  today: string;
  now: Date;
}

export interface SeedSummary {
  adminId: string;
  adminEmail: string;
  invoicesInDataset: number;
  invoicesInserted: number;
}

/**
 * Idempotent: safe to run on every container start. Everything happens in one transaction. The hasher must be the
 * API's (same BCRYPT_COST), or login timing would tell the seeded account apart from unknown e-mails.
 */
export function seedDatabase(
  dataSource: DataSource,
  passwordHasher: PasswordHasher,
  options: SeedOptions,
): Promise<SeedSummary> {
  return dataSource.transaction(async (manager) => {
    await upsertAdminUser(manager, passwordHasher, options.admin, {
      resetPassword: options.resetAdminPassword,
    });
    const invoices = [
      APPENDIX_A_INVOICE,
      ...generateInvoices({
        count: GENERATED_INVOICE_COUNT,
        today: options.today,
        now: options.now,
        seed: GENERATOR_SEED,
      }),
    ];
    const invoicesInserted = await insertInvoices(manager, invoices, ADMIN_USER_ID);
    return {
      adminId: ADMIN_USER_ID,
      adminEmail: options.admin.email,
      invoicesInDataset: invoices.length,
      invoicesInserted,
    };
  });
}

/**
 * Creates the reviewer account with its fixed id, or refreshes its e-mail and name from the environment (so the
 * documented credentials keep working even after SEED_ADMIN_EMAIL changes). The password of an existing account is
 * only overwritten with `resetPassword`: otherwise a rotated password would silently revert on the next start.
 */
export async function upsertAdminUser(
  manager: EntityManager,
  passwordHasher: PasswordHasher,
  { email, password }: AdminCredentials,
  { resetPassword }: { resetPassword: boolean },
): Promise<void> {
  const passwordHash = await passwordHasher.hash(password);
  await manager.query(
    `INSERT INTO users (id, email, password_hash, fullname)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
       SET email         = EXCLUDED.email,
           password_hash = CASE WHEN $5::boolean THEN EXCLUDED.password_hash ELSE users.password_hash END,
           fullname      = EXCLUDED.fullname,
           updated_at    = now()`,
    [ADMIN_USER_ID, email, passwordHash, ADMIN_FULLNAME, resetPassword],
  );
}

/**
 * Inserts invoices whose number is not taken yet (ON CONFLICT DO NOTHING — numbers and ids are deterministic), then
 * the line items of the invoices that were actually inserted. Returns the number of new invoices.
 */
export async function insertInvoices(
  manager: EntityManager,
  seeds: readonly SeedInvoice[],
  createdBy: string,
): Promise<number> {
  const invoices = seeds.map((seed) => toSeededInvoice(seed, createdBy));
  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(InvoiceEntity)
    .values(invoices.map(toInvoiceRow))
    .orIgnore()
    // Rows skipped by ON CONFLICT are not returned, which tells us exactly which invoices are new.
    .returning('invoice_id')
    .execute();

  const insertedIds = new Set(
    (result.raw as { invoice_id: string }[]).map((row) => row.invoice_id),
  );
  const items = invoices
    .filter((invoice) => insertedIds.has(invoice.id))
    .flatMap((invoice) => toInvoiceItemRows(invoice));
  if (items.length > 0) {
    await manager.insert(InvoiceItemEntity, items);
  }
  return insertedIds.size;
}
