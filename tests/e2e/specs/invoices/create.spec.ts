import type { Request } from '@playwright/test';
import { expect, test } from '../../support/fixtures';
import { isApiCall } from '../../support/http';
import { aud, createInvoiceViaApi, type InvoiceDetail, newInvoice } from '../../support/invoices';

const isCreateRequest = isApiCall('POST', '/api/invoices');

test('validates required fields and the due date before sending anything', async ({
  page,
  createPage,
}) => {
  const createRequests: Request[] = [];
  page.on('request', (request) => {
    if (isCreateRequest(request)) createRequests.push(request);
  });
  await createPage.goto();

  await createPage.submitButton.click();
  await createPage.expectFieldError(createPage.customerName, 'Customer name is required');
  await createPage.expectFieldError(createPage.customerEmail, 'Customer email is required');
  await createPage.expectFieldError(createPage.invoiceNumber, 'Invoice number is required');
  await createPage.expectFieldError(createPage.itemName, 'Item name is required');
  await createPage.expectFieldError(createPage.rate, 'Rate is required');
  // The first invalid field receives the focus.
  await expect(createPage.customerName).toBeFocused();

  await createPage.invoiceDate.fill('2026-09-29');
  await createPage.dueDate.fill('2026-09-28');
  await createPage.submitButton.click();
  await createPage.expectFieldError(
    createPage.dueDate,
    'Due date must be on or after the invoice date',
  );

  expect(createRequests).toEqual([]);
  await expect(page).toHaveURL(/\/invoices\/new$/);
});

test('creates a Draft invoice whose totals are computed by the server', async ({
  page,
  createPage,
  listPage,
  detailPage,
}) => {
  const invoice = newInvoice();
  await createPage.goto();
  await createPage.fillForm(invoice);
  const response = await createPage.submit();

  // The form sends the inputs only; status and every total are the server's to compute.
  const sent = response.request().postDataJSON() as Record<string, unknown>;
  expect(sent).toMatchObject({
    invoiceNumber: invoice.invoiceNumber,
    currency: 'AUD',
    customer: { fullname: invoice.customerName, email: invoice.customerEmail },
    items: [{ name: invoice.itemName, quantity: 3, rate: 33.33 }],
    taxRate: 10,
    discount: 5,
  });
  for (const computed of ['status', 'totalAmount', 'balanceAmount', 'currencySymbol']) {
    expect(sent).not.toHaveProperty(computed);
  }

  expect(response.status(), await response.text()).toBe(201);
  const created = (await response.json()) as InvoiceDetail;
  expect(created).toMatchObject({
    invoiceNumber: invoice.invoiceNumber,
    status: 'Draft',
    currency: 'AUD',
    currencySymbol: 'AU$',
    items: [{ name: invoice.itemName, quantity: 3, rate: 33.33, amount: 99.99 }],
    taxRate: 10,
    invoiceSubTotal: 99.99,
    totalTax: 10,
    totalDiscount: 5,
    totalAmount: 104.99,
    totalPaid: 0,
    balanceAmount: 104.99,
  });
  expect(response.headers()['location']).toMatch(new RegExp(`/invoices/${created.invoiceId}$`));

  await expect(page.getByText(`Invoice ${invoice.invoiceNumber} created`)).toBeVisible();
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(listPage.heading).toBeVisible();

  const found = await listPage.search(invoice.invoiceNumber);
  expect(found.data.map((summary) => summary.invoiceId)).toEqual([created.invoiceId]);
  await listPage.expectInvoices(found.data);
  expect(await listPage.columnTexts('Status')).toEqual(['Draft']);
  expect(await listPage.columnTexts('Total amount')).toEqual([aud('104.99')]);

  await listPage.invoiceLink(invoice.invoiceNumber).click();
  await expect(detailPage.heading(invoice.invoiceNumber)).toBeVisible();
  await expect
    .poll(() => detailPage.readTerms(detailPage.summaryRegion))
    .toEqual({
      Subtotal: aud('99.99'),
      'Tax (10%)': aud('10.00'),
      Discount: aud('5.00'),
      Total: aud('104.99'),
      'Amount paid': aud('0.00'),
      'Outstanding balance': aud('104.99'),
    });
});

test('refuses a duplicate invoice number and keeps the form as typed', async ({
  page,
  createPage,
}) => {
  const existing = await createInvoiceViaApi(page.request, newInvoice());
  const duplicate = newInvoice({
    invoiceNumber: existing.invoiceNumber,
    customerName: 'E2E Second Buyer',
  });

  await createPage.goto();
  await createPage.fillForm(duplicate);
  const response = await createPage.submit();

  expect(response.status()).toBe(409);
  await createPage.expectFieldError(createPage.invoiceNumber, 'Invoice number already exists');
  await expect(createPage.invoiceNumber).toBeFocused();
  await expect(page).toHaveURL(/\/invoices\/new$/);
  await expect(createPage.customerName).toHaveValue(duplicate.customerName);
  await expect(createPage.rate).toHaveValue(duplicate.rate);
});
