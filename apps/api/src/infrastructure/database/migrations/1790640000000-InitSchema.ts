import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema, written by hand so every constraint is deliberate. Business invariants are enforced by the
 * database as well as the application: a buggy code path or a manual SQL fix cannot store inconsistent invoices.
 */
export class InitSchema1790640000000 implements MigrationInterface {
  name = 'InitSchema1790640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Trigram indexes make the case-insensitive "contains" search (ILIKE '%term%') indexable.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE TABLE users (
        id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        email         varchar(254) NOT NULL,
        password_hash varchar(100) NOT NULL,
        fullname      varchar(120) NOT NULL,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now()
      )
    `);
    // E-mail addresses are unique regardless of case: Admin@x.io and admin@x.io are the same login.
    await queryRunner.query(`CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email))`);

    // Overdue is derived at read time and deliberately cannot be stored.
    await queryRunner.query(`CREATE TYPE invoice_status AS ENUM ('Draft', 'Pending', 'Paid')`);

    await queryRunner.query(`
      CREATE TABLE invoices (
        invoice_id        uuid           PRIMARY KEY,
        invoice_number    varchar(50)    NOT NULL,
        invoice_reference varchar(100),
        invoice_date      date           NOT NULL,
        due_date          date           NOT NULL,
        currency          char(3)        NOT NULL,
        currency_symbol   varchar(8)     NOT NULL,
        description       varchar(500),
        status            invoice_status NOT NULL DEFAULT 'Draft',
        customer_fullname varchar(120)   NOT NULL,
        customer_email    varchar(254)   NOT NULL,
        customer_mobile   varchar(32),
        customer_address  varchar(255),
        tax_rate          numeric(5,2)   NOT NULL DEFAULT 10,
        invoice_sub_total numeric(14,2)  NOT NULL,
        total_tax         numeric(14,2)  NOT NULL,
        total_discount    numeric(14,2)  NOT NULL DEFAULT 0,
        total_amount      numeric(14,2)  NOT NULL,
        total_paid        numeric(14,2)  NOT NULL DEFAULT 0,
        balance_amount    numeric(14,2)  NOT NULL,
        created_by        uuid           NOT NULL,
        created_at        timestamptz    NOT NULL DEFAULT now(),
        updated_at        timestamptz    NOT NULL DEFAULT now(),
        CONSTRAINT invoices_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT invoices_due_date_check CHECK (due_date >= invoice_date),
        CONSTRAINT invoices_tax_rate_check CHECK (tax_rate BETWEEN 0 AND 100),
        CONSTRAINT invoices_amounts_non_negative_check CHECK (
          invoice_sub_total >= 0 AND total_tax >= 0 AND total_discount >= 0
          AND total_amount >= 0 AND total_paid >= 0 AND balance_amount >= 0
        ),
        CONSTRAINT invoices_total_paid_check CHECK (total_paid <= total_amount),
        CONSTRAINT invoices_balance_check CHECK (balance_amount = total_amount - total_paid),
        CONSTRAINT invoices_total_check CHECK (total_amount = invoice_sub_total + total_tax - total_discount)
      )
    `);
    // Invoice numbers are unique regardless of letter case: INV-001 and inv-001 look like one invoice to a payer (and the
    // case-insensitive search lists them together), which invites duplicate billing. The only uniqueness rule, so a
    // duplicate maps to one constraint name (409); search does not need it (it uses the trigram index below).
    await queryRunner.query(
      `CREATE UNIQUE INDEX invoices_invoice_number_upper_uq ON invoices (upper(invoice_number))`,
    );
    // Sort keys of the list endpoint.
    await queryRunner.query(`CREATE INDEX invoices_invoice_date_idx ON invoices (invoice_date)`);
    await queryRunner.query(`CREATE INDEX invoices_due_date_idx ON invoices (due_date)`);
    await queryRunner.query(`CREATE INDEX invoices_total_amount_idx ON invoices (total_amount)`);
    // Status filters always combine the stored status with the due date (derived Overdue).
    await queryRunner.query(
      `CREATE INDEX invoices_status_due_date_idx ON invoices (status, due_date)`,
    );
    // Foreign keys are not indexed automatically in PostgreSQL.
    await queryRunner.query(`CREATE INDEX invoices_created_by_idx ON invoices (created_by)`);
    await queryRunner.query(
      `CREATE INDEX invoices_invoice_number_trgm_idx ON invoices USING gin (invoice_number gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX invoices_customer_fullname_trgm_idx ON invoices USING gin (customer_fullname gin_trgm_ops)`,
    );

    await queryRunner.query(`
      CREATE TABLE invoice_items (
        id         uuid          PRIMARY KEY,
        invoice_id uuid          NOT NULL REFERENCES invoices (invoice_id) ON DELETE CASCADE,
        name       varchar(200)  NOT NULL,
        quantity   integer       NOT NULL CHECK (quantity > 0),
        rate       numeric(14,2) NOT NULL CHECK (rate > 0),
        amount     numeric(14,2) NOT NULL CHECK (amount >= 0),
        position   smallint      NOT NULL DEFAULT 0,
        created_at timestamptz   NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX invoice_items_invoice_id_idx ON invoice_items (invoice_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE invoice_items`);
    await queryRunner.query(`DROP TABLE invoices`);
    await queryRunner.query(`DROP TYPE invoice_status`);
    await queryRunner.query(`DROP TABLE users`);
    // pg_trgm is intentionally kept: it may have existed before this migration or be used by other schemas.
  }
}
