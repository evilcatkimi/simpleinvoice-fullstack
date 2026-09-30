import { Column } from 'typeorm';

/**
 * Customer columns embedded in the `invoices` row: an invoice is a legal snapshot and must keep the customer as they
 * were when it was issued, even if the customer's details change later.
 */
export class InvoiceCustomerColumns {
  @Column({ name: 'customer_fullname', type: 'varchar', length: 120 })
  fullname: string;

  @Column({ name: 'customer_email', type: 'varchar', length: 254 })
  email: string;

  @Column({ name: 'customer_mobile', type: 'varchar', length: 32, nullable: true })
  mobileNumber: string | null;

  @Column({ name: 'customer_address', type: 'varchar', length: 255, nullable: true })
  address: string | null;
}
