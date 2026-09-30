import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsCalendarDate, IsOnOrAfter } from '../../../../shared/validation/date.validators';
import { NoControlCharacters } from '../../../../shared/validation/no-control-characters.validator';
import { ToUpperCase, TrimToUndefined } from '../../../../shared/validation/transforms';
import {
  INVOICE_SORT_FIELDS,
  SORT_ORDERS,
  type InvoiceSortField,
  type SortOrder,
} from '../../application/invoice.repository';
import type { InvoiceSearchQuery } from '../../application/invoices.service';
import { INVOICE_STATUSES, type InvoiceStatus } from '../../domain/invoice-status';

const MAX_PAGE_SIZE = 100;

export class ListInvoicesQueryDto implements InvoiceSearchQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 100_000, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = 10;

  @ApiPropertyOptional({ enum: INVOICE_SORT_FIELDS, default: 'invoiceDate' })
  @IsIn(INVOICE_SORT_FIELDS)
  sortBy: InvoiceSortField = 'invoiceDate';

  @ApiPropertyOptional({
    enum: SORT_ORDERS,
    default: 'DESC',
    description: 'Case-insensitive',
  })
  @ToUpperCase()
  @IsIn(SORT_ORDERS)
  ordering: SortOrder = 'DESC';

  @ApiPropertyOptional({
    enum: INVOICE_STATUSES,
    description: 'Overdue = not Paid and due before today (derived, never stored)',
  })
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Case-insensitive partial match on invoice number or customer name',
  })
  @TrimToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @NoControlCharacters()
  keyword?: string;

  @ApiPropertyOptional({ format: 'date', description: 'invoiceDate on or after (YYYY-MM-DD)' })
  @IsOptional()
  @IsCalendarDate()
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date', description: 'invoiceDate on or before (YYYY-MM-DD)' })
  @IsOptional()
  @IsCalendarDate()
  @IsOnOrAfter('fromDate')
  toDate?: string;
}
