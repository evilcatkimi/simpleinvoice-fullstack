import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { InvoiceEntity } from './invoice.entity';

/** The model supports many lines per invoice; the API currently accepts exactly one. */
@Entity({ name: 'invoice_items' })
export class InvoiceItemEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => InvoiceEntity, (invoice) => invoice.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: Relation<InvoiceEntity>;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  rate: string;

  /** quantity × rate, stored so the line reads exactly as it was issued. */
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  /** Display order of the line within the invoice. */
  @Column({ type: 'smallint', default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
