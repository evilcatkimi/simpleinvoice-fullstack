import { describe, expect, it } from 'vitest';
import {
  createInvoiceFormDefaults,
  type CreateInvoiceFormValues,
  createInvoiceFormSchema,
  toCreateInvoiceRequest,
} from './create-invoice-form';

const validValues: CreateInvoiceFormValues = {
  ...createInvoiceFormDefaults('2026-09-29'),
  customer: { fullname: ' Jane Doe ', email: 'jane@example.com', mobileNumber: '', address: '' },
  invoiceNumber: 'INV-2026-0001',
  item: { name: 'Consulting', quantity: '2', rate: '150.50' },
};

/** Validation issues ("path: message") after applying `change` to a valid form. */
function issuesAfter(change: (values: CreateInvoiceFormValues) => void): string[] {
  const values = structuredClone(validValues);
  change(values);
  const result = createInvoiceFormSchema.safeParse(values);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('createInvoiceFormDefaults', () => {
  it('starts today with a 30-day term, AUD, 10% tax and no discount', () => {
    expect(createInvoiceFormDefaults('2026-09-29')).toMatchObject({
      invoiceDate: '2026-09-29',
      dueDate: '2026-10-29',
      currency: 'AUD',
      taxRate: '10',
      discount: '0',
    });
  });
});

describe('createInvoiceFormSchema', () => {
  it('accepts a valid form and converts text inputs to typed values', () => {
    const result = createInvoiceFormSchema.parse(validValues);

    expect(result.customer).toEqual({
      fullname: 'Jane Doe',
      email: 'jane@example.com',
      mobileNumber: undefined,
      address: undefined,
    });
    expect(result.item).toEqual({ name: 'Consulting', quantity: 2, rate: 150.5 });
    expect(result).toMatchObject({ taxRate: 10, discount: 0 });
  });

  it.each<[string, (values: CreateInvoiceFormValues) => void, string]>([
    [
      'a blank customer name',
      (v) => void (v.customer.fullname = '   '),
      'customer.fullname: Customer name is required',
    ],
    [
      'an invalid email',
      (v) => void (v.customer.email = 'jane@'),
      'customer.email: Enter a valid email address',
    ],
    [
      'letters in the mobile number',
      (v) => void (v.customer.mobileNumber = 'call me'),
      'customer.mobileNumber: Mobile number may only contain digits, spaces and + - ( )',
    ],
    [
      'a tab inside the mobile number',
      (v) => void (v.customer.mobileNumber = '+61\t400 000 000'),
      'customer.mobileNumber: Mobile number may only contain digits, spaces and + - ( )',
    ],
    [
      'a tab inside the customer name',
      (v) => void (v.customer.fullname = 'Jane\tDoe'),
      'customer.fullname: Customer name must not contain tabs, line breaks or other control characters',
    ],
    [
      'a line break inside the reference',
      (v) => void (v.invoiceReference = 'PO\n778'),
      'invoiceReference: Reference must not contain tabs, line breaks or other control characters',
    ],
    [
      'a NUL character in the item name',
      (v) => void (v.item.name = 'Consulting\u0000'),
      'item.name: Item name must not contain tabs, line breaks or other control characters',
    ],
    [
      'an escape sequence in the address',
      (v) => void (v.customer.address = 'Sydney \u001b[2J'),
      'customer.address: Address must not contain control characters',
    ],
    [
      'a DEL character in the description',
      (v) => void (v.description = 'September\u007f'),
      'description: Description must not contain control characters',
    ],
    [
      'an invoice number starting with a symbol',
      (v) => void (v.invoiceNumber = '-INV'),
      'invoiceNumber: Start with a letter or digit, then use only letters, digits and . _ / # -',
    ],
    [
      'an impossible date',
      (v) => void (v.invoiceDate = '2026-02-30'),
      'invoiceDate: Invoice date must be a valid date',
    ],
    [
      'a due date before the invoice date',
      (v) => void (v.dueDate = '2026-09-28'),
      'dueDate: Due date must be on or after the invoice date',
    ],
    [
      'a fractional quantity',
      (v) => void (v.item.quantity = '1.5'),
      'item.quantity: Quantity must be a whole number',
    ],
    [
      'a zero quantity',
      (v) => void (v.item.quantity = '0'),
      'item.quantity: Quantity must be at least 1',
    ],
    ['a zero rate', (v) => void (v.item.rate = '0'), 'item.rate: Rate must be greater than 0'],
    [
      'a rate with 3 decimals',
      (v) => void (v.item.rate = '10.555'),
      'item.rate: Rate must be a number with at most 2 decimal places',
    ],
    [
      'a tax rate above 100',
      (v) => void (v.taxRate = '100.01'),
      'taxRate: Tax rate must be between 0 and 100',
    ],
    [
      'a negative discount',
      (v) => void (v.discount = '-5'),
      'discount: Discount must be a number with at most 2 decimal places',
    ],
  ])('rejects %s', (_, change, issue) => {
    expect(issuesAfter(change)).toEqual([issue]);
  });

  it('reports the due-date rule even while other fields are still invalid', () => {
    expect(
      issuesAfter((values) => {
        values.customer.fullname = '';
        values.dueDate = '2026-09-01';
      }),
    ).toEqual([
      'customer.fullname: Customer name is required',
      'dueDate: Due date must be on or after the invoice date',
    ]);
  });

  it('keeps the line breaks and tabs a textarea produces in the address and description', () => {
    const result = createInvoiceFormSchema.parse({
      ...validValues,
      customer: { ...validValues.customer, address: '12 George St\r\nSydney\tNSW' },
      description: 'Line one\nLine two',
    });

    expect(result.customer.address).toBe('12 George St\r\nSydney\tNSW');
    expect(result.description).toBe('Line one\nLine two');
  });

  it('treats an empty discount as "not provided"', () => {
    expect(
      createInvoiceFormSchema.parse({ ...validValues, discount: ' ' }).discount,
    ).toBeUndefined();
  });

  it.each<[string, Partial<CreateInvoiceFormValues>, Record<string, unknown>]>([
    [
      'leading zeros in the quantity',
      { item: { name: 'X', quantity: '007', rate: '1' } },
      { item: { name: 'X', quantity: 7, rate: 1 } },
    ],
    [
      'the largest quantity and rate',
      { item: { name: 'X', quantity: '1000000', rate: '1000000000' } },
      { item: { name: 'X', quantity: 1_000_000, rate: 1_000_000_000 } },
    ],
    [
      'a padded rate',
      { item: { name: 'X', quantity: '1', rate: ' 150.50 ' } },
      { item: { name: 'X', quantity: 1, rate: 150.5 } },
    ],
    ['a 0 % tax rate', { taxRate: '0' }, { taxRate: 0 }],
    ['a fractional tax rate', { taxRate: '7.25' }, { taxRate: 7.25 }],
    ['a discount with cents', { discount: '12.5' }, { discount: 12.5 }],
  ])('accepts %s', (_case, change, expected) => {
    expect(createInvoiceFormSchema.parse({ ...validValues, ...change })).toMatchObject(expected);
  });

  it.each<[string, (values: CreateInvoiceFormValues) => void, string]>([
    [
      'a quantity above 1,000,000',
      (v) => void (v.item.quantity = '1000001'),
      'item.quantity: Quantity must be at most 1,000,000',
    ],
    [
      'a rate above 1,000,000,000',
      (v) => void (v.item.rate = '1000000000.01'),
      'item.rate: Rate must be at most 1,000,000,000',
    ],
    [
      'exponent notation',
      (v) => void (v.item.rate = '1e3'),
      'item.rate: Rate must be a number with at most 2 decimal places',
    ],
    [
      'a discount with fractions of a cent',
      (v) => void (v.discount = '0.001'),
      'discount: Discount must be a number with at most 2 decimal places',
    ],
  ])('rejects %s', (_, change, issue) => {
    expect(issuesAfter(change)).toEqual([issue]);
  });
});

describe('toCreateInvoiceRequest', () => {
  it('builds the contract payload with one item and no computed fields', () => {
    const payload = toCreateInvoiceRequest(
      createInvoiceFormSchema.parse({ ...validValues, invoiceReference: 'PO-778', discount: '' }),
    );

    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      invoiceNumber: 'INV-2026-0001',
      invoiceReference: 'PO-778',
      invoiceDate: '2026-09-29',
      dueDate: '2026-10-29',
      currency: 'AUD',
      customer: { fullname: 'Jane Doe', email: 'jane@example.com' },
      items: [{ name: 'Consulting', quantity: 2, rate: 150.5 }],
      taxRate: 10,
    });
  });

  it('sends every optional field once filled in, trimmed', () => {
    const payload = toCreateInvoiceRequest(
      createInvoiceFormSchema.parse({
        ...validValues,
        invoiceReference: '  PO-778 ',
        description: ' September consulting ',
        customer: {
          fullname: 'Jane Doe',
          email: ' jane@example.com ',
          mobileNumber: ' +61 400 000 000 ',
          address: ' Sydney NSW ',
        },
        discount: '20',
      }),
    );

    expect(payload).toMatchObject({
      invoiceReference: 'PO-778',
      description: 'September consulting',
      customer: {
        fullname: 'Jane Doe',
        email: 'jane@example.com',
        mobileNumber: '+61 400 000 000',
        address: 'Sydney NSW',
      },
      discount: 20,
    });
  });

  it('builds the payload field by field, so server-owned fields can never leak into it', () => {
    const values = createInvoiceFormSchema.parse(validValues);
    const smuggled = Object.assign(values, {
      status: 'Paid',
      totalAmount: 1,
      currencySymbol: '$',
      createdBy: 'someone-else',
    });
    Object.assign(smuggled.item, { amount: 999 });
    Object.assign(smuggled.customer, { vip: true });

    const payload = JSON.stringify(toCreateInvoiceRequest(smuggled));

    for (const field of ['status', 'totalAmount', 'currencySymbol', 'createdBy', 'amount', 'vip']) {
      expect(payload).not.toContain(`"${field}"`);
    }
  });
});
