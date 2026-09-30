import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Clock } from '../../../shared/clock/clock';
import { BusinessRuleViolationError } from '../../../shared/errors/application-errors';
import { toPage, type Page } from '../../../shared/pagination/page';
import { findCurrency } from '../../currencies/domain/currencies';
import type { InvoiceSummaryView, InvoiceView } from '../domain/invoice';
import {
  calculateInvoiceTotals,
  DEFAULT_DISCOUNT,
  DEFAULT_TAX_RATE,
} from '../domain/invoice-calculator';
import { InvoiceNotFoundError } from '../domain/invoice.errors';
import { withEffectiveStatus } from '../domain/invoice-status';
import { Money } from '../domain/money';
import { InvoiceRepository, type InvoiceSearchCriteria } from './invoice.repository';

export type InvoiceSearchQuery = Omit<InvoiceSearchCriteria, 'today'>;

/** What a user provides to create an invoice; everything else is computed or assigned here. */
export interface CreateInvoiceCommand {
  invoiceNumber: string;
  invoiceReference?: string | null;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  description?: string | null;
  customer: {
    fullname: string;
    email: string;
    mobileNumber?: string | null;
    address?: string | null;
  };
  items: { name: string; quantity: number; rate: number }[];
  taxRate?: number;
  discount?: number;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
  ) {}

  async search(query: InvoiceSearchQuery): Promise<Page<InvoiceSummaryView>> {
    // One "today" for the whole request: the SQL filter and the displayed status must agree.
    const today = this.clock.today();
    const { items, total } = await this.invoices.search({ ...query, today });
    return toPage(
      items.map((invoice) => withEffectiveStatus(invoice, today)),
      total,
      query,
    );
  }

  async getById(id: string): Promise<InvoiceView> {
    const invoice = await this.invoices.findById(id);
    if (!invoice) {
      throw new InvoiceNotFoundError();
    }
    return withEffectiveStatus(invoice, this.clock.today());
  }

  /**
   * Totals are always computed on the server (clients cannot send them), new invoices always start as Draft with
   * nothing paid, and they belong to the authenticated user.
   */
  async create(command: CreateInvoiceCommand, createdBy: string): Promise<InvoiceView> {
    const currency = findCurrency(command.currency);
    if (!currency) {
      throw new BusinessRuleViolationError(`Unsupported currency ${command.currency}`);
    }
    const taxRate = new Money(command.taxRate ?? DEFAULT_TAX_RATE);
    const totals = calculateInvoiceTotals({
      items: command.items,
      taxRate,
      discount: command.discount ?? DEFAULT_DISCOUNT,
    });

    const invoice = await this.invoices.create({
      id: randomUUID(),
      invoiceNumber: command.invoiceNumber,
      invoiceReference: command.invoiceReference ?? null,
      invoiceDate: command.invoiceDate,
      dueDate: command.dueDate,
      currency: currency.code,
      currencySymbol: currency.symbol,
      description: command.description ?? null,
      status: 'Draft',
      customer: {
        fullname: command.customer.fullname,
        email: command.customer.email,
        mobileNumber: command.customer.mobileNumber ?? null,
        address: command.customer.address ?? null,
      },
      items: command.items.map((item, index) => ({
        id: randomUUID(),
        name: item.name,
        quantity: item.quantity,
        rate: new Money(item.rate),
        amount: totals.lineAmounts[index],
      })),
      taxRate,
      invoiceSubTotal: totals.subTotal,
      totalTax: totals.taxAmount,
      totalDiscount: totals.discount,
      totalAmount: totals.totalAmount,
      totalPaid: totals.totalPaid,
      balanceAmount: totals.balanceAmount,
      createdBy,
    });
    return withEffectiveStatus(invoice, this.clock.today());
  }
}
