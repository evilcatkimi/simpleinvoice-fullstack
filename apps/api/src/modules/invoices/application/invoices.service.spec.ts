import { Test } from '@nestjs/testing';
import { Clock } from '../../../shared/clock/clock';
import { BusinessRuleViolationError } from '../../../shared/errors/application-errors';
import type { Invoice, NewInvoice } from '../domain/invoice';
import { InvoiceCalculationError } from '../domain/invoice-calculator';
import { DuplicateInvoiceNumberError, InvoiceNotFoundError } from '../domain/invoice.errors';
import { buildInvoice } from '../testing/invoice.fixtures';
import { InvoiceRepository } from './invoice.repository';
import {
  InvoicesService,
  type CreateInvoiceCommand,
  type InvoiceSearchQuery,
} from './invoices.service';

const TODAY = '2026-09-29';
const USER_ID = 'ad1e0902-1928-4345-b513-60c86c94fc91';

function command(overrides: Partial<CreateInvoiceCommand> = {}): CreateInvoiceCommand {
  return {
    invoiceNumber: 'INV-2026-0100',
    invoiceDate: '2026-09-29',
    dueDate: '2026-10-29',
    currency: 'AUD',
    customer: { fullname: 'Jane Doe', email: 'jane@example.com' },
    items: [{ name: 'Consulting', quantity: 2, rate: 150.5 }],
    taxRate: 10,
    discount: 0,
    ...overrides,
  };
}

/** Money fields as exact strings, so assertions never compare floats. */
function amounts(invoice: NewInvoice) {
  return {
    taxRate: invoice.taxRate.toFixed(2),
    invoiceSubTotal: invoice.invoiceSubTotal.toFixed(2),
    totalTax: invoice.totalTax.toFixed(2),
    totalDiscount: invoice.totalDiscount.toFixed(2),
    totalAmount: invoice.totalAmount.toFixed(2),
    totalPaid: invoice.totalPaid.toFixed(2),
    balanceAmount: invoice.balanceAmount.toFixed(2),
    items: invoice.items.map((item) => [item.rate.toFixed(2), item.amount.toFixed(2)]),
  };
}

describe('InvoicesService', () => {
  const repository = { search: jest.fn(), findById: jest.fn(), create: jest.fn() };
  let service: InvoicesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    repository.create.mockImplementation((invoice: NewInvoice) =>
      Promise.resolve<Invoice>({ ...invoice, createdAt: new Date('2026-09-29T08:00:00.000Z') }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: InvoiceRepository, useValue: repository },
        { provide: Clock, useValue: { today: () => TODAY } },
      ],
    }).compile();
    service = moduleRef.get(InvoicesService);
  });

  const storedInvoice = (): NewInvoice => (repository.create.mock.calls[0] as [NewInvoice])[0];

  describe('create', () => {
    it('stores a Draft invoice owned by the caller, with the currency symbol derived on the server', async () => {
      await service.create(command(), USER_ID);

      expect(storedInvoice()).toMatchObject({
        invoiceNumber: 'INV-2026-0100',
        status: 'Draft',
        createdBy: USER_ID,
        currency: 'AUD',
        currencySymbol: 'AU$',
        invoiceReference: null,
        description: null,
        customer: {
          fullname: 'Jane Doe',
          email: 'jane@example.com',
          mobileNumber: null,
          address: null,
        },
      });
      expect(storedInvoice().id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('computes every total on the server, starting with nothing paid', async () => {
      await service.create(command({ discount: 1.1 }), USER_ID);

      expect(amounts(storedInvoice())).toEqual({
        taxRate: '10.00',
        invoiceSubTotal: '301.00',
        totalTax: '30.10',
        totalDiscount: '1.10',
        totalAmount: '330.00',
        totalPaid: '0.00',
        balanceAmount: '330.00',
        items: [['150.50', '301.00']],
      });
    });

    it('defaults the tax rate to 10 % and the discount to 0', async () => {
      await service.create(command({ taxRate: undefined, discount: undefined }), USER_ID);

      expect(amounts(storedInvoice())).toMatchObject({
        taxRate: '10.00',
        totalTax: '30.10',
        totalDiscount: '0.00',
      });
    });

    it('returns the stored invoice with its effective status', async () => {
      const created = await service.create(command({ dueDate: '2026-09-29' }), USER_ID);

      expect(created.status).toBe('Draft');
      expect(created.createdAt).toEqual(new Date('2026-09-29T08:00:00.000Z'));
    });

    it('rejects a discount above subtotal plus tax without touching the repository', async () => {
      await expect(service.create(command({ discount: 331.11 }), USER_ID)).rejects.toThrow(
        new InvoiceCalculationError('discount must not exceed subtotal plus tax'),
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a total the database cannot store as a 400 business error, before any write', async () => {
      // The largest quantity and rate the DTO accepts: 10^15 does not fit numeric(14,2).
      const tooLarge = command({
        items: [{ name: 'Fleet', quantity: 1_000_000, rate: 1_000_000_000 }],
      });

      await expect(service.create(tooLarge, USER_ID)).rejects.toThrow(
        new InvoiceCalculationError('invoice total must not exceed 999999999999.99'),
      );
      await expect(service.create(tooLarge, USER_ID)).rejects.toBeInstanceOf(
        BusinessRuleViolationError,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('reports a new invoice whose due date has already passed as Overdue, while storing it as Draft', async () => {
      const created = await service.create(
        command({ invoiceDate: '2026-09-01', dueDate: '2026-09-15' }),
        USER_ID,
      );

      expect(storedInvoice().status).toBe('Draft');
      expect(created.status).toBe('Overdue');
    });

    it('rejects an unsupported currency', async () => {
      await expect(service.create(command({ currency: 'XYZ' }), USER_ID)).rejects.toBeInstanceOf(
        BusinessRuleViolationError,
      );
    });

    it('propagates a duplicate invoice number reported by the repository', async () => {
      repository.create.mockRejectedValue(new DuplicateInvoiceNumberError());

      await expect(service.create(command(), USER_ID)).rejects.toThrow(DuplicateInvoiceNumberError);
    });
  });

  describe('getById', () => {
    it('returns the invoice with Overdue derived for today', async () => {
      repository.findById.mockResolvedValue(
        buildInvoice({ status: 'Pending', dueDate: '2026-09-28' }),
      );

      await expect(service.getById('099ca7da-a290-40fa-93b9-1c43ae7bb887')).resolves.toMatchObject({
        invoiceNumber: 'IV1780488206995',
        status: 'Overdue',
      });
    });

    it('throws InvoiceNotFoundError for an unknown id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
        new InvoiceNotFoundError(),
      );
    });
  });

  describe('search', () => {
    const query: InvoiceSearchQuery = {
      page: 3,
      pageSize: 10,
      sortBy: 'totalAmount',
      ordering: 'ASC',
      status: 'Overdue',
    };

    it('passes one reference date to the repository and derives statuses with it', async () => {
      repository.search.mockResolvedValue({
        items: [buildInvoice({ status: 'Pending', dueDate: '2026-09-28' })],
        total: 21,
      });

      const page = await service.search(query);

      expect(repository.search).toHaveBeenCalledWith({ ...query, today: TODAY });
      expect(page).toMatchObject({ page: 3, pageSize: 10, total: 21, totalPages: 3 });
      expect(page.items.map((invoice) => invoice.status)).toEqual(['Overdue']);
    });

    it('reports zero pages for an empty result', async () => {
      repository.search.mockResolvedValue({ items: [], total: 0 });

      await expect(service.search({ ...query, page: 1 })).resolves.toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      });
    });
  });
});
