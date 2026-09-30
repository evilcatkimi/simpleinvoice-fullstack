import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the case-sensitive UNIQUE (invoice_number): the unique index on upper(invoice_number) already refuses every pair
 * it refused (equal numbers have equal upper()), so it only cost a second index write per insert and a second
 * constraint name to map to 409. Nothing reads invoice numbers by exact match: search uses the trigram index. `down`
 * restores it; the upper() index guarantees the existing rows satisfy it.
 */
export class DropCaseSensitiveInvoiceNumberConstraint1790702100000 implements MigrationInterface {
  name = 'DropCaseSensitiveInvoiceNumberConstraint1790702100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE invoices DROP CONSTRAINT invoices_invoice_number_uq`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_number_uq UNIQUE (invoice_number)`,
    );
  }
}
