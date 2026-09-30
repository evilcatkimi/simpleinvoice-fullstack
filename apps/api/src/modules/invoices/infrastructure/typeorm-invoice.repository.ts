import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type SelectQueryBuilder } from 'typeorm';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../infrastructure/database/postgres-errors';
import type {
  InvoiceRepository,
  InvoiceSearchCriteria,
  InvoiceSearchResult,
} from '../application/invoice.repository';
import type { Invoice, NewInvoice } from '../domain/invoice';
import { DuplicateInvoiceNumberError, InvoiceCreatorNotFoundError } from '../domain/invoice.errors';
import { InvoiceItemEntity } from './invoice-item.entity';
import {
  buildInvoiceListConditions,
  INVOICE_ALIAS,
  INVOICE_SUMMARY_COLUMNS,
  SORT_COLUMNS,
} from './invoice-list.query';
import {
  toInvoice,
  toInvoiceItemRows,
  toInvoiceRow,
  toInvoiceSummary,
} from './invoice-persistence.mapper';
import {
  INVOICE_CREATED_BY_FOREIGN_KEY,
  INVOICE_NUMBER_CASE_INSENSITIVE_INDEX,
  InvoiceEntity,
} from './invoice.entity';

@Injectable()
export class TypeOrmInvoiceRepository implements InvoiceRepository {
  constructor(
    @InjectRepository(InvoiceEntity) private readonly invoices: Repository<InvoiceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async search(criteria: InvoiceSearchCriteria): Promise<InvoiceSearchResult> {
    const filtered = this.invoices.createQueryBuilder(INVOICE_ALIAS);
    for (const condition of buildInvoiceListConditions(criteria, criteria.today)) {
      filtered.andWhere(condition.sql, condition.params);
    }
    // The tie-breakers make the order total, so rows never repeat or vanish between pages.
    const page = filtered
      .clone()
      .select(INVOICE_SUMMARY_COLUMNS)
      .orderBy(SORT_COLUMNS[criteria.sortBy], criteria.ordering)
      .addOrderBy(`${INVOICE_ALIAS}.createdAt`, 'DESC')
      .addOrderBy(`${INVOICE_ALIAS}.id`, 'ASC')
      .offset((criteria.page - 1) * criteria.pageSize)
      .limit(criteria.pageSize);
    // The total: a plain COUNT(*) over the same filters, without order or paging. getManyAndCount() leaves the
    // expression to a TypeORM heuristic (COUNT(DISTINCT invoice_id) as soon as a join appears), and COUNT(*) OVER ()
    // on the page query leaves no row to read the total from when the page is past the end.
    const count = filtered.clone().select('COUNT(*)', 'total');

    const rows = await page.getMany();
    // COUNT(*) is a bigint, which node-postgres returns as text.
    const counted = await count.getRawOne<{ total: string }>();
    return { items: rows.map(toInvoiceSummary), total: Number(counted?.total ?? 0) };
  }

  async findById(id: string): Promise<Invoice | null> {
    const entity = await withItems(this.invoices.createQueryBuilder(INVOICE_ALIAS), id).getOne();
    return entity && toInvoice(entity);
  }

  async create(invoice: NewInvoice): Promise<Invoice> {
    try {
      // Invoice and line items are written atomically: an invoice without its items must never be visible.
      return await this.dataSource.transaction(async (manager) => {
        await manager.insert(InvoiceEntity, toInvoiceRow(invoice));
        await manager.insert(InvoiceItemEntity, toInvoiceItemRows(invoice));
        // Re-read inside the transaction so the caller gets exactly what was stored (DB defaults included).
        const stored = await withItems(
          manager.createQueryBuilder(InvoiceEntity, INVOICE_ALIAS),
          invoice.id,
        ).getOneOrFail();
        return toInvoice(stored);
      });
    } catch (error) {
      // The unique index is the source of truth: a pre-check SELECT would race with concurrent requests.
      if (isUniqueViolation(error, INVOICE_NUMBER_CASE_INSENSITIVE_INDEX)) {
        throw new DuplicateInvoiceNumberError();
      }
      // Tokens are not re-checked against the users table on every request: one can outlive its account.
      if (isForeignKeyViolation(error, INVOICE_CREATED_BY_FOREIGN_KEY)) {
        throw new InvoiceCreatorNotFoundError();
      }
      throw error;
    }
  }
}

/**
 * One invoice with its line items, in one statement. findOne() would add LIMIT 1, and TypeORM pairs a limit with a
 * join by first running a SELECT DISTINCT for the ids: two round trips for a primary-key lookup.
 */
function withItems(
  query: SelectQueryBuilder<InvoiceEntity>,
  id: string,
): SelectQueryBuilder<InvoiceEntity> {
  return query
    .leftJoinAndSelect(`${INVOICE_ALIAS}.items`, 'item')
    .where(`${INVOICE_ALIAS}.id = :id`, { id });
}
