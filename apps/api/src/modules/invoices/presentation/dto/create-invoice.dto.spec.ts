import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../../../shared/validation/validation-pipe';
import { CreateInvoiceDto } from './create-invoice.dto';

const pipe = createValidationPipe();

function validBody(): Record<string, unknown> {
  return {
    invoiceNumber: 'INV-2026-0100',
    invoiceDate: '2026-09-29',
    dueDate: '2026-10-29',
    currency: 'AUD',
    customer: { fullname: 'Jane Doe', email: 'jane@example.com' },
    items: [{ name: 'Consulting', quantity: 2, rate: 150.5 }],
  };
}

function validate(body: unknown): Promise<CreateInvoiceDto> {
  return pipe.transform(body, {
    type: 'body',
    metatype: CreateInvoiceDto,
  }) as Promise<CreateInvoiceDto>;
}

async function errorsFor(body: unknown): Promise<string[]> {
  try {
    await validate(body);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
}

describe('CreateInvoiceDto validation (global ValidationPipe)', () => {
  it('accepts a valid body and applies the default tax rate and discount', async () => {
    const dto = await validate(validBody());

    expect(dto).toBeInstanceOf(CreateInvoiceDto);
    expect(dto.taxRate).toBe(10);
    expect(dto.discount).toBe(0);
  });

  it('trims text, upper-cases the currency and stores blank optional fields as null', async () => {
    const dto = await validate({
      ...validBody(),
      invoiceNumber: '  INV-7  ',
      invoiceReference: '   ',
      currency: ' usd ',
      description: '',
      customer: {
        fullname: '  Jane Doe ',
        email: ' jane@example.com ',
        mobileNumber: ' ',
        address: ' Sydney ',
      },
      items: [{ name: ' Consulting ', quantity: 1, rate: 10 }],
    });

    expect(dto).toMatchObject({
      invoiceNumber: 'INV-7',
      invoiceReference: null,
      currency: 'USD',
      description: null,
      customer: {
        fullname: 'Jane Doe',
        email: 'jane@example.com',
        mobileNumber: null,
        address: 'Sydney',
      },
      items: [{ name: 'Consulting' }],
    });
  });

  describe('due date rule', () => {
    it('accepts a due date after the invoice date', async () => {
      expect(await errorsFor(validBody())).toEqual([]);
    });

    it('accepts a due date equal to the invoice date', async () => {
      expect(await errorsFor({ ...validBody(), dueDate: '2026-09-29' })).toEqual([]);
    });

    it('rejects a due date before the invoice date with the contract message', async () => {
      expect(await errorsFor({ ...validBody(), dueDate: '2026-09-28' })).toEqual([
        'dueDate must be on or after invoiceDate',
      ]);
    });
  });

  it('rejects impossible calendar dates', async () => {
    expect(await errorsFor({ ...validBody(), invoiceDate: '2026-02-30' })).toEqual([
      'invoiceDate must be a valid date in YYYY-MM-DD format',
    ]);
  });

  it('rejects fields owned by the server (status, totals, currencySymbol, createdBy)', async () => {
    const errors = await errorsFor({
      ...validBody(),
      status: 'Paid',
      totalAmount: 1,
      totalPaid: 1,
      currencySymbol: '$',
      createdBy: 'ad1e0902-1928-4345-b513-60c86c94fc91',
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'property status should not exist',
        'property totalAmount should not exist',
        'property totalPaid should not exist',
        'property currencySymbol should not exist',
        'property createdBy should not exist',
      ]),
    );
  });

  it('rejects unknown nested properties', async () => {
    const body = validBody();
    const errors = await errorsFor({
      ...body,
      customer: { ...(body.customer as object), vip: true },
      items: [{ name: 'Consulting', quantity: 1, rate: 1, amount: 999 }],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'customer.property vip should not exist',
        'items.0.property amount should not exist',
      ]),
    );
  });

  it('requires exactly one line item', async () => {
    expect(await errorsFor({ ...validBody(), items: [] })).toEqual([
      'items must contain at least 1 elements',
    ]);
    const twoItems = [
      { name: 'A', quantity: 1, rate: 1 },
      { name: 'B', quantity: 1, rate: 1 },
    ];
    expect(await errorsFor({ ...validBody(), items: twoItems })).toEqual([
      'items must contain no more than 1 elements',
    ]);
  });

  it.each([
    [{ quantity: 0 }, 'items.0.quantity must not be less than 1'],
    [{ quantity: 1.5 }, 'items.0.quantity must be an integer number'],
    [{ quantity: 1_000_001 }, 'items.0.quantity must not be greater than 1000000'],
    [{ rate: 0 }, 'items.0.rate must be a positive number'],
    [{ rate: -10 }, 'items.0.rate must be a positive number'],
    [{ rate: 10.123 }, 'items.0.rate must have at most 2 decimal places'],
    [{ rate: '10' }, 'items.0.rate must be a number conforming to the specified constraints'],
    [{ name: '   ' }, 'items.0.name should not be empty'],
  ])('validates line item %p', async (override, message) => {
    const item = { name: 'Consulting', quantity: 1, rate: 10, ...override };
    expect(await errorsFor({ ...validBody(), items: [item] })).toContain(message);
  });

  it.each([
    [{ taxRate: -1 }, 'taxRate must not be less than 0'],
    [{ taxRate: 100.01 }, 'taxRate must not be greater than 100'],
    [{ discount: -5 }, 'discount must not be less than 0'],
    [{ discount: 0.001 }, 'discount must have at most 2 decimal places'],
    [{ currency: 'XYZ' }, 'currency must be one of: AUD, USD, GBP, EUR, SGD, NZD, CAD, VND'],
  ])('validates amounts and currency %p', async (override, message) => {
    expect(await errorsFor({ ...validBody(), ...override })).toContain(message);
  });

  it('accepts explicit nulls for the optional fields (the contract marks them nullable)', async () => {
    const dto = await validate({
      ...validBody(),
      invoiceReference: null,
      description: null,
      customer: {
        fullname: 'Jane Doe',
        email: 'jane@example.com',
        mobileNumber: null,
        address: null,
      },
    });

    expect(dto).toMatchObject({
      invoiceReference: null,
      description: null,
      customer: { mobileNumber: null, address: null },
    });
  });

  it('accepts the largest quantity and rate, a 0 % and a 100 % tax rate', async () => {
    for (const override of [
      { items: [{ name: 'Fleet', quantity: 1_000_000, rate: 1_000_000_000 }] },
      { taxRate: 0 },
      { taxRate: 100 },
    ]) {
      expect(await errorsFor({ ...validBody(), ...override })).toEqual([]);
    }
  });

  it.each([
    [{ customer: undefined }, 'customer should not be null or undefined'],
    [{ items: { name: 'Consulting', quantity: 1, rate: 1 } }, 'items must be an array'],
    [
      { items: [{ name: 'Consulting', quantity: 1, rate: 1_000_000_000.01 }] },
      'items.0.rate must not be greater than 1000000000',
    ],
    [
      { items: [{ name: 'Consulting', quantity: '2', rate: 10 }] },
      'items.0.quantity must be an integer number',
    ],
  ])('rejects a malformed body %p', async (override, message) => {
    expect(await errorsFor({ ...validBody(), ...override })).toContain(message);
  });

  it('requires a customer name and a valid e-mail', async () => {
    const errors = await errorsFor({
      ...validBody(),
      customer: { fullname: '  ', email: 'not-an-email' },
    });

    expect(errors).toEqual([
      'customer.fullname should not be empty',
      'customer.email must be an email',
    ]);
  });

  describe('malformed input that used to reach the database (500 instead of 400)', () => {
    it('rejects an array where the customer object belongs', async () => {
      const errors = await errorsFor({
        ...validBody(),
        customer: [{ fullname: 'Jane Doe', email: 'jane@example.com' }],
      });

      expect(errors).toContain('customer must be an object');
    });

    it('rejects a nested array as the line item', async () => {
      const errors = await errorsFor({
        ...validBody(),
        items: [[{ name: 'Consulting', quantity: 1, rate: 1 }]],
      });

      expect(errors).toContain('each value in items must be an object');
    });

    it.each([
      [{ invoiceReference: 'PO\u0000778' }, 'invoiceReference must not contain control characters'],
      [{ description: 'Line\u0000one' }, 'description must not contain control characters'],
      [
        { customer: { fullname: 'Eve\u0000Null', email: 'eve@example.com' } },
        'customer.fullname must not contain control characters',
      ],
      [
        { customer: { fullname: 'Eve', email: 'eve@example.com', address: 'Street\u001b[31m' } },
        'customer.address must not contain control characters',
      ],
      [
        { items: [{ name: 'Consulting\u0007', quantity: 1, rate: 1 }] },
        'items.0.name must not contain control characters',
      ],
      [
        { customer: { fullname: 'Jane Doe\nAdmin', email: 'jane@example.com' } },
        'customer.fullname must not contain control characters',
      ],
    ])('rejects control characters: %p', async (override, message) => {
      expect(await errorsFor({ ...validBody(), ...override })).toContain(message);
    });

    it('keeps line breaks in the multi-line fields (textareas in the SPA)', async () => {
      const dto = await validate({
        ...validBody(),
        description: 'First line\r\nSecond line',
        customer: {
          fullname: 'Jane Doe',
          email: 'jane@example.com',
          address: '12 George St\nSydney NSW 2000',
        },
      });

      expect(dto.description).toBe('First line\r\nSecond line');
      expect(dto.customer.address).toBe('12 George St\nSydney NSW 2000');
    });

    it.each(['+61\t400', '+61\n400', '+61\u000b400'])(
      'accepts only literal spaces as separators in the mobile number (%j)',
      async (mobileNumber) => {
        const errors = await errorsFor({
          ...validBody(),
          customer: { fullname: 'Jane Doe', email: 'jane@example.com', mobileNumber },
        });

        expect(errors).toContain(
          'customer.mobileNumber may only contain digits, spaces and + ( ) -',
        );
      },
    );

    it('still accepts a formatted mobile number', async () => {
      expect(
        await errorsFor({
          ...validBody(),
          customer: {
            fullname: 'Jane Doe',
            email: 'jane@example.com',
            mobileNumber: '+61 (02) 400-000',
          },
        }),
      ).toEqual([]);
    });
  });

  it.each(['', '   ', 'INV 1', '-INV', 'INV\n1', 'x'.repeat(51)])(
    'rejects invoice number %p',
    async (invoiceNumber) => {
      expect((await errorsFor({ ...validBody(), invoiceNumber })).length).toBeGreaterThan(0);
    },
  );

  it.each(['INV-2026-0001', 'IV1780488206995', 'A', 'PO/2026#7', 'inv.2026_01'])(
    'accepts invoice number %p',
    async (invoiceNumber) => {
      expect(await errorsFor({ ...validBody(), invoiceNumber })).toEqual([]);
    },
  );
});
