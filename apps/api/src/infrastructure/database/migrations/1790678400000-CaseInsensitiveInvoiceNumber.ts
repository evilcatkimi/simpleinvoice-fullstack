import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Invoice numbers become unique regardless of letter case: INV-001 and inv-001 look like one invoice to a payer (and
 * the case-insensitive search lists them together), which invites duplicate billing. The now redundant case-sensitive
 * UNIQUE constraint is dropped by the next migration. On a table that already holds such a pair, this migration fails
 * and names the clashing value.
 */
export class CaseInsensitiveInvoiceNumber1790678400000 implements MigrationInterface {
  name = 'CaseInsensitiveInvoiceNumber1790678400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX invoices_invoice_number_upper_uq ON invoices (upper(invoice_number))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX invoices_invoice_number_upper_uq`);
  }
}
