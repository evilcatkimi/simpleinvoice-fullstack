import { http, HttpResponse } from 'msw';
import type {
  CreateInvoiceRequest,
  InvoiceDetail,
  InvoiceListResponse,
  InvoiceSummary,
} from '@/invoices/model/invoice';
import type { AuthUser, Credentials } from '@/session/session-api';
import {
  APPENDIX_A_INVOICE,
  buildInvoices,
  CURRENCIES,
  DEMO_USER,
  TEST_PASSWORD,
} from './fixtures';

/**
 * A small in-memory implementation of docs/API_CONTRACT.md, so tests exercise real request/response
 * round trips (query strings, status codes, error bodies) instead of mocked hooks.
 */
interface FakeApiState {
  currentUser: AuthUser | null;
  invoices: InvoiceDetail[];
  /** Query strings received by GET /invoices, oldest first. */
  listRequests: URLSearchParams[];
  /** Bodies received by POST /invoices. */
  createRequests: unknown[];
}

function initialState(): FakeApiState {
  return {
    currentUser: null,
    invoices: [APPENDIX_A_INVOICE, ...buildInvoices(24)],
    listRequests: [],
    createRequests: [],
  };
}

export const fakeApi: FakeApiState = initialState();

export function resetFakeApi(): void {
  Object.assign(fakeApi, initialState());
}

export function lastListRequest(): URLSearchParams | undefined {
  return fakeApi.listRequests.at(-1);
}

/** Builds an error response in the API's global exception-filter format. */
export function apiErrorResponse(status: number, message: string | string[], error: string) {
  return HttpResponse.json(
    {
      statusCode: status,
      message,
      error,
      path: '/test',
      timestamp: new Date().toISOString(),
      requestId: 'req-test-123',
    },
    { status },
  );
}

const unauthorized = () => apiErrorResponse(401, 'Unauthorized', 'Unauthorized');

function toSummary(invoice: InvoiceDetail): InvoiceSummary {
  const { invoiceId, invoiceNumber, invoiceReference, invoiceDate, dueDate, currency } = invoice;
  return {
    invoiceId,
    invoiceNumber,
    invoiceReference,
    invoiceDate,
    dueDate,
    currency,
    currencySymbol: invoice.currencySymbol,
    customer: { fullname: invoice.customer.fullname, email: invoice.customer.email },
    totalAmount: invoice.totalAmount,
    totalPaid: invoice.totalPaid,
    balanceAmount: invoice.balanceAmount,
    status: invoice.status,
    createdAt: invoice.createdAt,
  };
}

function listInvoices(query: URLSearchParams): InvoiceListResponse {
  const page = Number(query.get('page') ?? 1);
  const pageSize = Number(query.get('pageSize') ?? 10);
  const sortBy = (query.get('sortBy') ?? 'invoiceDate') as
    'invoiceDate' | 'dueDate' | 'totalAmount';
  const direction = query.get('ordering') === 'ASC' ? 1 : -1;
  const keyword = query.get('keyword')?.toLowerCase();
  const status = query.get('status');
  const fromDate = query.get('fromDate');
  const toDate = query.get('toDate');

  const matches = fakeApi.invoices
    .filter(
      (invoice) =>
        !keyword ||
        invoice.invoiceNumber.toLowerCase().includes(keyword) ||
        invoice.customer.fullname.toLowerCase().includes(keyword),
    )
    .filter((invoice) => !status || invoice.status === status)
    .filter((invoice) => !fromDate || invoice.invoiceDate >= fromDate)
    .filter((invoice) => !toDate || invoice.invoiceDate <= toDate)
    .sort((a, b) => (a[sortBy] < b[sortBy] ? -1 : a[sortBy] > b[sortBy] ? 1 : 0) * direction);

  return {
    data: matches.slice((page - 1) * pageSize, page * pageSize).map(toSummary),
    paging: {
      page,
      pageSize,
      total: matches.length,
      totalPages: Math.ceil(matches.length / pageSize),
    },
  };
}

function createInvoice(body: CreateInvoiceRequest): InvoiceDetail {
  const [item] = body.items;
  const subTotal = item.quantity * item.rate;
  const totalTax = Math.round(subTotal * body.taxRate) / 100;
  const totalAmount = subTotal + totalTax - (body.discount ?? 0);
  return {
    invoiceId: crypto.randomUUID(),
    invoiceNumber: body.invoiceNumber,
    invoiceReference: body.invoiceReference ?? null,
    invoiceDate: body.invoiceDate,
    dueDate: body.dueDate,
    currency: body.currency,
    currencySymbol: CURRENCIES.find((currency) => currency.code === body.currency)?.symbol ?? '',
    description: body.description ?? null,
    status: 'Draft',
    customer: {
      fullname: body.customer.fullname,
      email: body.customer.email,
      mobileNumber: body.customer.mobileNumber ?? null,
      address: body.customer.address ?? null,
    },
    items: [{ id: crypto.randomUUID(), ...item, amount: subTotal }],
    taxRate: body.taxRate,
    invoiceSubTotal: subTotal,
    totalTax,
    totalDiscount: body.discount ?? 0,
    totalAmount,
    totalPaid: 0,
    balanceAmount: totalAmount,
    createdAt: new Date().toISOString(),
    createdBy: DEMO_USER.id,
  };
}

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as Credentials;
    if (email.toLowerCase() !== DEMO_USER.email || password !== TEST_PASSWORD) {
      return apiErrorResponse(401, 'Invalid email or password', 'Unauthorized');
    }
    fakeApi.currentUser = DEMO_USER;
    return HttpResponse.json({
      accessToken: 'header.payload.signature',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: DEMO_USER,
    });
  }),

  http.get('/api/auth/me', () =>
    fakeApi.currentUser
      ? HttpResponse.json({ ...fakeApi.currentUser, createdAt: '2026-01-01T00:00:00.000Z' })
      : unauthorized(),
  ),

  http.post('/api/auth/logout', () => {
    fakeApi.currentUser = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/invoices', ({ request }) => {
    if (!fakeApi.currentUser) return unauthorized();
    const query = new URL(request.url).searchParams;
    fakeApi.listRequests.push(query);
    return HttpResponse.json(listInvoices(query));
  }),

  http.get('/api/invoices/:invoiceId', ({ params }) => {
    if (!fakeApi.currentUser) return unauthorized();
    const invoice = fakeApi.invoices.find((candidate) => candidate.invoiceId === params.invoiceId);
    return invoice
      ? HttpResponse.json(invoice)
      : apiErrorResponse(404, 'Invoice not found', 'Not Found');
  }),

  http.post('/api/invoices', async ({ request }) => {
    if (!fakeApi.currentUser) return unauthorized();
    const body = (await request.json()) as CreateInvoiceRequest;
    fakeApi.createRequests.push(body);
    if (fakeApi.invoices.some((invoice) => invoice.invoiceNumber === body.invoiceNumber)) {
      return apiErrorResponse(409, 'Invoice number already exists', 'Conflict');
    }
    const invoice = createInvoice(body);
    fakeApi.invoices.push(invoice);
    return HttpResponse.json(invoice, {
      status: 201,
      headers: { Location: `/invoices/${invoice.invoiceId}` },
    });
  }),

  http.get('/api/currencies', () =>
    fakeApi.currentUser ? HttpResponse.json(CURRENCIES) : unauthorized(),
  ),
];
