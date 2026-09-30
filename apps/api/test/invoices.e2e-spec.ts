import type { NestExpressApplication } from '@nestjs/platform-express';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ADMIN_USER_ID } from '../src/infrastructure/database/seeds/seed';
import type {
  InvoiceDetailDto,
  InvoicePageDto,
} from '../src/modules/invoices/presentation/dto/invoice-response.dto';
import type { ErrorResponseBody } from '../src/shared/filters/all-exceptions.filter';
import { createInvoiceBody, seedInvoice } from './utils/invoice-builders';
import {
  createTestApp,
  http,
  login,
  resetDatabase,
  seedInvoices,
  type Session,
} from './utils/test-app';

describe('Invoices API (e2e)', () => {
  let app: NestExpressApplication;
  let session: Session;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    session = await login(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    http(app)
      .post('/invoices')
      .set(session.bearer)
      .send(body as object);
  const errorOf = (body: unknown) => body as ErrorResponseBody;

  describe('create → list → detail workflow', () => {
    it('creates an invoice with server-computed totals and finds it in the list and by id', async () => {
      const created = await post(
        createInvoiceBody({
          invoiceNumber: 'E2E-WORKFLOW-001',
          items: [{ name: 'Consulting', quantity: 3, rate: 33.35 }],
          taxRate: 10,
          discount: 0.05,
        }),
      ).expect(201);
      const invoice = created.body as InvoiceDetailDto;

      expect(created.headers.location).toBe(`/invoices/${invoice.invoiceId}`);
      expect(invoice).toMatchObject({
        invoiceNumber: 'E2E-WORKFLOW-001',
        status: 'Draft',
        currency: 'AUD',
        currencySymbol: 'AU$',
        invoiceSubTotal: 100.05,
        totalTax: 10.01, // 10.005 rounded half-up
        totalDiscount: 0.05,
        totalAmount: 110.01,
        totalPaid: 0,
        balanceAmount: 110.01,
        createdBy: ADMIN_USER_ID,
        items: [{ name: 'Consulting', quantity: 3, rate: 33.35, amount: 100.05 }],
      });

      const list = await http(app)
        .get('/invoices')
        .query({ keyword: 'e2e-workflow' })
        .set(session.bearer)
        .expect(200);
      const page = list.body as InvoicePageDto;
      expect(page.paging).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
      expect(page.data).toEqual([
        {
          invoiceId: invoice.invoiceId,
          invoiceNumber: 'E2E-WORKFLOW-001',
          invoiceReference: 'PO-778',
          invoiceDate: '2026-07-15',
          dueDate: '2026-08-14',
          currency: 'AUD',
          currencySymbol: 'AU$',
          customer: { fullname: 'Jane Doe', email: 'jane@example.com' },
          totalAmount: 110.01,
          totalPaid: 0,
          balanceAmount: 110.01,
          status: 'Draft',
          createdAt: invoice.createdAt,
        },
      ]);

      const detail = await http(app)
        .get(`/invoices/${invoice.invoiceId}`)
        .set(session.bearer)
        .expect(200);
      expect(detail.body).toEqual(invoice);
    });
  });

  describe('POST /invoices', () => {
    it('rejects a duplicate invoice number with 409', async () => {
      await post(createInvoiceBody({ invoiceNumber: 'E2E-DUP-001' })).expect(201);

      const response = await post(createInvoiceBody({ invoiceNumber: 'E2E-DUP-001' })).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        statusCode: 409,
        message: 'Invoice number already exists',
        error: 'Conflict',
        path: '/invoices',
      });
    });

    it('lets exactly one of two concurrent requests claim an invoice number', async () => {
      const body = createInvoiceBody({ invoiceNumber: 'E2E-RACE-001' });

      const responses = await Promise.all([post(body), post(body)]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const list = await http(app)
        .get('/invoices')
        .query({ keyword: 'E2E-RACE-001' })
        .set(session.bearer)
        .expect(200);
      expect((list.body as InvoicePageDto).paging.total).toBe(1);
    });

    it('answers 400, not 500, when the total exceeds what numeric(14,2) can store', async () => {
      const response = await post(
        createInvoiceBody({ items: [{ name: 'Fleet', quantity: 1_000_000, rate: 1_000_000_000 }] }),
      ).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        statusCode: 400,
        message: 'invoice total must not exceed 999999999999.99',
        error: 'Bad Request',
      });
    });

    it('rejects a due date before the invoice date with the contract message', async () => {
      const response = await post(
        createInvoiceBody({ invoiceDate: '2026-07-15', dueDate: '2026-07-14' }),
      ).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        statusCode: 400,
        message: ['dueDate must be on or after invoiceDate'],
        error: 'Bad Request',
      });
    });

    it('accepts a due date equal to the invoice date', async () => {
      await post(createInvoiceBody({ invoiceDate: '2026-07-15', dueDate: '2026-07-15' })).expect(
        201,
      );
    });

    it('rejects fields owned by the server', async () => {
      const response = await post(
        createInvoiceBody({
          status: 'Paid',
          totalAmount: 1,
          currencySymbol: '$',
          createdBy: ADMIN_USER_ID,
        }),
      ).expect(400);

      expect(errorOf(response.body).message).toEqual(
        expect.arrayContaining([
          'property status should not exist',
          'property totalAmount should not exist',
          'property currencySymbol should not exist',
          'property createdBy should not exist',
        ]),
      );
    });

    it('rejects a discount larger than subtotal plus tax', async () => {
      const response = await post(
        createInvoiceBody({
          items: [{ name: 'X', quantity: 1, rate: 100 }],
          taxRate: 10,
          discount: 110.01,
        }),
      ).expect(400);

      expect(errorOf(response.body).message).toBe('discount must not exceed subtotal plus tax');
    });

    it('answers 400, not 500, for fractions of a cent (including exponent notation)', async () => {
      const response = await post(
        createInvoiceBody({ items: [{ name: 'X', quantity: 1, rate: 1e-7 }] }),
      ).expect(400);

      expect(errorOf(response.body).message).toEqual([
        'items.0.rate must have at most 2 decimal places',
      ]);
    });

    it('rejects bodies larger than 100 kB with 413 and the standard error shape', async () => {
      const response = await post(createInvoiceBody({ description: 'x'.repeat(120_000) })).expect(
        413,
      );

      expect(errorOf(response.body)).toMatchObject({ statusCode: 413, error: 'Payload Too Large' });
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('rejects malformed JSON with 400', async () => {
      const response = await http(app)
        .post('/invoices')
        .set(session.bearer)
        .set('Content-Type', 'application/json')
        .send('{"invoiceNumber": ')
        .expect(400);

      expect(errorOf(response.body).statusCode).toBe(400);
    });

    it('requires authentication', async () => {
      await http(app).post('/invoices').send(createInvoiceBody()).expect(401);
    });

    it('treats invoice numbers that differ only in letter case as duplicates', async () => {
      await post(createInvoiceBody({ invoiceNumber: 'INV-X' })).expect(201);

      const response = await post(createInvoiceBody({ invoiceNumber: 'inv-x' })).expect(409);

      expect(errorOf(response.body).message).toBe('Invoice number already exists');
    });

    it('lets exactly one of two concurrent look-alike numbers through', async () => {
      const responses = await Promise.all([
        post(createInvoiceBody({ invoiceNumber: 'E2E-CASE-RACE' })),
        post(createInvoiceBody({ invoiceNumber: 'e2e-case-race' })),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    });
  });

  describe('malformed input that used to answer 500', () => {
    let errorLog: jest.SpiedFunction<PinoLogger['error']>;

    beforeEach(() => {
      errorLog = jest.spyOn(PinoLogger.prototype, 'error');
    });

    afterEach(() => {
      const errorLogCalls = [...errorLog.mock.calls];
      errorLog.mockRestore();
      // Answered as client errors: nothing is logged at error level (no alert noise, no stack per request).
      expect(errorLogCalls).toEqual([]);
    });

    it.each([
      [
        'a NUL byte in a customer name',
        { customer: { fullname: 'Eve\u0000Null', email: 'eve@example.com' } },
        'customer.fullname must not contain control characters',
      ],
      [
        'an array of customers',
        { customer: [{ fullname: 'J', email: 'j@example.com' }] },
        'customer must be an object',
      ],
      [
        'a nested array of line items',
        { items: [[{ name: 'X', quantity: 1, rate: 1 }]] },
        'each value in items must be an object',
      ],
    ])('POST /invoices with %s → 400', async (_case, override, message) => {
      const response = await post(createInvoiceBody(override)).expect(400);

      expect(errorOf(response.body).message).toContain(message);
    });

    it('GET /invoices?keyword=abc%00def → 400', async () => {
      const response = await http(app)
        .get('/invoices?keyword=abc%00def')
        .set(session.bearer)
        .expect(400);

      expect(errorOf(response.body).message).toContain(
        'keyword must not contain control characters',
      );
    });

    it('GET /invoices/:id → 400 when the id is not a UUID (never reaches the database)', async () => {
      await http(app).get("/invoices/x' OR '1'='1").set(session.bearer).expect(400);
    });
  });

  describe('GET /invoices/:id', () => {
    it('rejects an id that is not a UUID', async () => {
      const response = await http(app).get('/invoices/not-a-uuid').set(session.bearer).expect(400);

      expect(errorOf(response.body).message).toBe('Validation failed (uuid is expected)');
    });

    it('returns 404 in the standard error shape for an unknown invoice', async () => {
      const response = await http(app)
        .get('/invoices/00000000-0000-4000-8000-000000000000')
        .set(session.bearer)
        .expect(404);

      expect(errorOf(response.body)).toEqual({
        statusCode: 404,
        message: 'Invoice not found',
        error: 'Not Found',
        path: '/invoices/00000000-0000-4000-8000-000000000000',
        timestamp: expect.any(String) as string,
        requestId: response.headers['x-request-id'],
      });
    });
  });

  describe('GET /invoices (today is frozen at 2026-07-15)', () => {
    const customer = (fullname: string) => ({
      fullname,
      email: 'customer@example.com',
      mobileNumber: null,
      address: null,
    });
    const item = (rate: string) => ({ id: randomUUID(), name: 'Service', quantity: 1, rate });

    beforeAll(async () => {
      await resetDatabase(app);
      await seedInvoices(app, [
        // Draft, not due yet
        seedInvoice({
          invoiceNumber: 'LIST-001',
          status: 'Draft',
          invoiceDate: '2026-07-01',
          dueDate: '2026-07-31',
          customer: customer('Alice Nguyen'),
          item: item('100.00'),
        }),
        // Draft, due yesterday → Overdue
        seedInvoice({
          invoiceNumber: 'LIST-002',
          status: 'Draft',
          invoiceDate: '2026-06-01',
          dueDate: '2026-07-14',
          customer: customer('Bob Tran'),
          item: item('250.00'),
        }),
        // Pending, due today → still Pending
        seedInvoice({
          invoiceNumber: 'LIST-003',
          status: 'Pending',
          invoiceDate: '2026-07-10',
          dueDate: '2026-07-15',
          customer: customer('Carol 100% Co'),
          item: item('75.50'),
        }),
        // Pending, partially paid, long overdue
        seedInvoice({
          invoiceNumber: 'LIST-004',
          status: 'Pending',
          invoiceDate: '2026-05-01',
          dueDate: '2026-06-01',
          customer: customer('Dave_Smith'),
          item: item('999.99'),
          totalPaid: '100.00',
        }),
        // Paid after its due date → Paid, never Overdue
        seedInvoice({
          invoiceNumber: 'LIST-005',
          status: 'Paid',
          invoiceDate: '2026-04-01',
          dueDate: '2026-04-30',
          customer: customer("Erin O'Brien"),
          item: item('500.00'),
          totalPaid: '500.00',
        }),
        seedInvoice({
          invoiceNumber: 'LIST-006',
          status: 'Paid',
          invoiceDate: '2026-07-12',
          dueDate: '2026-08-12',
          customer: customer('alice cooper'),
          item: item('10.00'),
          totalPaid: '10.00',
        }),
      ]);
    });

    async function list(query: Record<string, string | number> = {}): Promise<InvoicePageDto> {
      const response = await http(app)
        .get('/invoices')
        .query(query)
        .set(session.bearer)
        .expect(200);
      return response.body as InvoicePageDto;
    }
    const numbersOf = (page: InvoicePageDto) => page.data.map((invoice) => invoice.invoiceNumber);

    it('defaults to the first 10 invoices, newest invoice date first', async () => {
      const page = await list();

      expect(page.paging).toEqual({ page: 1, pageSize: 10, total: 6, totalPages: 1 });
      expect(numbersOf(page)).toEqual([
        'LIST-006',
        'LIST-003',
        'LIST-001',
        'LIST-002',
        'LIST-004',
        'LIST-005',
      ]);
    });

    it.each([
      ['Overdue', ['LIST-002', 'LIST-004']],
      ['Draft', ['LIST-001']],
      ['Pending', ['LIST-003']],
      ['Paid', ['LIST-006', 'LIST-005']],
    ])('filters by effective status %s', async (status, expected) => {
      const page = await list({ status });

      expect(numbersOf(page)).toEqual(expected);
      expect(page.data.every((invoice) => invoice.status === status)).toBe(true);
    });

    it('sorts by total amount in both directions (ordering is case-insensitive)', async () => {
      const ascending = ['LIST-006', 'LIST-003', 'LIST-001', 'LIST-002', 'LIST-005', 'LIST-004'];

      expect(numbersOf(await list({ sortBy: 'totalAmount', ordering: 'asc' }))).toEqual(ascending);
      expect(numbersOf(await list({ sortBy: 'totalAmount', ordering: 'DESC' }))).toEqual(
        [...ascending].reverse(),
      );
    });

    it('sorts by due date', async () => {
      expect(numbersOf(await list({ sortBy: 'dueDate', ordering: 'ASC' }))).toEqual([
        'LIST-005',
        'LIST-004',
        'LIST-002',
        'LIST-003',
        'LIST-001',
        'LIST-006',
      ]);
    });

    it('paginates without gaps or overlaps', async () => {
      const first = await list({ pageSize: 4, page: 1 });
      const second = await list({ pageSize: 4, page: 2 });

      expect(first.paging).toEqual({ page: 1, pageSize: 4, total: 6, totalPages: 2 });
      expect(first.data).toHaveLength(4);
      expect(second.data).toHaveLength(2);
      expect(new Set([...numbersOf(first), ...numbersOf(second)]).size).toBe(6);
    });

    it('returns an empty page past the last one', async () => {
      const page = await list({ pageSize: 4, page: 3 });

      expect(page.data).toEqual([]);
      expect(page.paging).toEqual({ page: 3, pageSize: 4, total: 6, totalPages: 2 });
    });

    it('searches invoice numbers and customer names, case-insensitively and partially', async () => {
      expect(numbersOf(await list({ keyword: 'ALICE' }))).toEqual(['LIST-006', 'LIST-001']);
      expect(numbersOf(await list({ keyword: "o'brien" }))).toEqual(['LIST-005']);
      expect((await list({ keyword: 'list-00' })).paging.total).toBe(6);
    });

    it('matches LIKE wildcards literally', async () => {
      expect(numbersOf(await list({ keyword: '%' }))).toEqual(['LIST-003']);
      expect(numbersOf(await list({ keyword: '_' }))).toEqual(['LIST-004']);
      expect(numbersOf(await list({ keyword: '\\' }))).toEqual([]);
    });

    it('filters by an inclusive invoice-date range', async () => {
      expect(numbersOf(await list({ fromDate: '2026-07-01', toDate: '2026-07-12' }))).toEqual([
        'LIST-006',
        'LIST-003',
        'LIST-001',
      ]);
    });

    it('combines filters', async () => {
      expect(numbersOf(await list({ status: 'Overdue', keyword: 'dave' }))).toEqual(['LIST-004']);
    });

    it.each([
      [{ fromDate: '2026-07-12', toDate: '2026-07-01' }, 'toDate must be on or after fromDate'],
      [{ pageSize: 101 }, 'pageSize must not be greater than 100'],
      [
        { sortBy: 'customer' },
        'sortBy must be one of the following values: invoiceDate, dueDate, totalAmount',
      ],
      [{ unknown: 'x' }, 'property unknown should not exist'],
      // ?page=1&page=2 reaches the API as an array (HTTP parameter pollution).
      [{ page: ['1', '2'] }, 'page must be an integer number'],
    ])('rejects invalid query %p', async (query, message) => {
      const response = await http(app)
        .get('/invoices')
        .query(query)
        .set(session.bearer)
        .expect(400);

      expect(errorOf(response.body).message).toContain(message);
    });
  });
});
