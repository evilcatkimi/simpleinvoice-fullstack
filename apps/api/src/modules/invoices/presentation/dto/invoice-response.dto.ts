import { ApiProperty, OmitType } from '@nestjs/swagger';
import { SUPPORTED_CURRENCY_CODES } from '../../../currencies/domain/currencies';
import { INVOICE_STATUSES, type InvoiceStatus } from '../../domain/invoice-status';

export class CustomerSummaryDto {
  @ApiProperty({ example: 'Paul' })
  fullname: string;

  @ApiProperty({ example: 'paul@101digital.io' })
  email: string;
}

export class CustomerDetailDto extends CustomerSummaryDto {
  @ApiProperty({ example: '947717364111', nullable: true, type: String })
  mobileNumber: string | null;

  @ApiProperty({ example: 'Singapore', nullable: true, type: String })
  address: string | null;
}

export class InvoiceItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Honda RC150' })
  name: string;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: 1000 })
  rate: number;

  @ApiProperty({ example: 2000, description: 'quantity × rate' })
  amount: number;
}

/** One row of the invoice list. Money values are JSON numbers rounded to 2 decimals. */
export class InvoiceSummaryDto {
  @ApiProperty({ format: 'uuid', example: '099ca7da-a290-40fa-93b9-1c43ae7bb887' })
  invoiceId: string;

  @ApiProperty({ example: 'IV1780488206995' })
  invoiceNumber: string;

  @ApiProperty({ example: '#5721662', nullable: true, type: String })
  invoiceReference: string | null;

  @ApiProperty({ format: 'date', example: '2026-06-03' })
  invoiceDate: string;

  @ApiProperty({ format: 'date', example: '2026-07-03' })
  dueDate: string;

  @ApiProperty({ enum: SUPPORTED_CURRENCY_CODES, example: 'AUD' })
  currency: string;

  @ApiProperty({ example: 'AU$' })
  currencySymbol: string;

  @ApiProperty({ type: CustomerSummaryDto })
  customer: CustomerSummaryDto;

  @ApiProperty({ example: 2180 })
  totalAmount: number;

  @ApiProperty({ example: 1451.34 })
  totalPaid: number;

  @ApiProperty({ example: 728.66 })
  balanceAmount: number;

  @ApiProperty({ enum: INVOICE_STATUSES, example: 'Overdue' })
  status: InvoiceStatus;

  @ApiProperty({ format: 'date-time', example: '2026-06-03T12:03:26.995Z' })
  createdAt: string;
}

export class InvoiceDetailDto extends OmitType(InvoiceSummaryDto, ['customer'] as const) {
  @ApiProperty({ example: 'Invoice is issued to Kanglee', nullable: true, type: String })
  description: string | null;

  @ApiProperty({ type: CustomerDetailDto })
  customer: CustomerDetailDto;

  @ApiProperty({ type: [InvoiceItemDto] })
  items: InvoiceItemDto[];

  @ApiProperty({ example: 10, description: 'Tax percentage' })
  taxRate: number;

  @ApiProperty({ example: 2000 })
  invoiceSubTotal: number;

  @ApiProperty({ example: 200 })
  totalTax: number;

  @ApiProperty({ example: 20 })
  totalDiscount: number;

  @ApiProperty({ format: 'uuid', example: 'ad1e0902-1928-4345-b513-60c86c94fc91' })
  createdBy: string;
}

export class PagingDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 41, description: 'Number of invoices matching the filters' })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class InvoicePageDto {
  @ApiProperty({ type: [InvoiceSummaryDto] })
  data: InvoiceSummaryDto[];

  @ApiProperty({ type: PagingDto })
  paging: PagingDto;
}
