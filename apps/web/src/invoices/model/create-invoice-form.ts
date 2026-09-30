import { z } from 'zod';
import { addDays, isValidIsoDate, todayIsoDate } from '@/core/calendar/calendar-date';
import { withoutControlCharacters } from '@/core/validation/control-characters';
import type { CreateInvoiceRequest } from './invoice';

/** Default payment term used to pre-fill the due date. */
const DEFAULT_PAYMENT_TERM_DAYS = 30;

const INVOICE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/#-]*$/;
// A literal space, as the API accepts: \s would also let tabs and line breaks through.
const MOBILE_NUMBER_PATTERN = /^[+0-9()\- ]*$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const DECIMAL_2DP_PATTERN = /^\d+(\.\d{1,2})?$/;

type TextKind = 'single-line' | 'multi-line';

/** `.refine()` arguments mirroring the API's @NoControlCharacters on the same field. */
const noControlCharacters = (label: string, kind: TextKind = 'single-line') =>
  [
    withoutControlCharacters({ multiline: kind === 'multi-line' }),
    kind === 'multi-line'
      ? `${label} must not contain control characters`
      : `${label} must not contain tabs, line breaks or other control characters`,
  ] as const;

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

/** Optional free text: blank means "not provided" and is left out of the payload. */
const optionalText = (label: string, max: number, kind: TextKind) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .refine(...noControlCharacters(label, kind))
    .transform((value) => value || undefined);

const calendarDate = (label: string) =>
  z.string().min(1, `${label} is required`).refine(isValidIsoDate, `${label} must be a valid date`);

/**
 * Inputs hold text. Numbers are validated as text first (digits, at most 2 decimals — no float
 * surprises such as 0.1 + 0.2), then converted.
 */
const decimal = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(DECIMAL_2DP_PATTERN, `${label} must be a number with at most 2 decimal places`)
    .transform(Number);

const invoiceDates = z.object({
  invoiceDate: calendarDate('Invoice date'),
  dueDate: calendarDate('Due date'),
});

/** Mirrors the API's CreateInvoiceDto rules (docs/API_CONTRACT.md §4.3). */
export const createInvoiceFormSchema = z
  .object({
    customer: z.object({
      fullname: requiredText('Customer name', 120).refine(...noControlCharacters('Customer name')),
      email: z
        .string()
        .trim()
        .min(1, 'Customer email is required')
        .max(254, 'Customer email must be at most 254 characters')
        .pipe(z.email('Enter a valid email address')),
      mobileNumber: z
        .string()
        .trim()
        .max(32, 'Mobile number must be at most 32 characters')
        .regex(MOBILE_NUMBER_PATTERN, 'Mobile number may only contain digits, spaces and + - ( )')
        .transform((value) => value || undefined),
      address: optionalText('Address', 255, 'multi-line'),
    }),
    invoiceNumber: requiredText('Invoice number', 50).regex(
      INVOICE_NUMBER_PATTERN,
      'Start with a letter or digit, then use only letters, digits and . _ / # -',
    ),
    invoiceReference: optionalText('Reference', 100, 'single-line'),
    ...invoiceDates.shape,
    currency: z.string().min(1, 'Currency is required'),
    description: optionalText('Description', 500, 'multi-line'),
    item: z.object({
      name: requiredText('Item name', 200).refine(...noControlCharacters('Item name')),
      quantity: z
        .string()
        .trim()
        .min(1, 'Quantity is required')
        .regex(WHOLE_NUMBER_PATTERN, 'Quantity must be a whole number')
        .transform(Number)
        .pipe(
          z
            .number()
            .min(1, 'Quantity must be at least 1')
            .max(1_000_000, 'Quantity must be at most 1,000,000'),
        ),
      rate: decimal('Rate').pipe(
        z
          .number()
          .positive('Rate must be greater than 0')
          .max(1_000_000_000, 'Rate must be at most 1,000,000,000'),
      ),
    }),
    // Required although the API defaults it to 10: a blank field reads as "no tax" to most people,
    // so an explicit value (pre-filled with 10) is always sent instead of a silent server default.
    taxRate: decimal('Tax rate').pipe(z.number().max(100, 'Tax rate must be between 0 and 100')),
    discount: z
      .string()
      .trim()
      .regex(/^$|^\d+(\.\d{1,2})?$/, 'Discount must be a number with at most 2 decimal places')
      .transform((value) => (value === '' ? undefined : Number(value))),
  })
  .refine((invoice) => invoice.dueDate >= invoice.invoiceDate, {
    message: 'Due date must be on or after the invoice date',
    path: ['dueDate'],
    // Compare as soon as both dates are valid, even while other fields still have errors.
    when: (payload) => invoiceDates.safeParse(payload.value).success,
  });

export type CreateInvoiceFormValues = z.input<typeof createInvoiceFormSchema>;
export type CreateInvoiceFormOutput = z.output<typeof createInvoiceFormSchema>;

export function createInvoiceFormDefaults(today = todayIsoDate()): CreateInvoiceFormValues {
  return {
    customer: { fullname: '', email: '', mobileNumber: '', address: '' },
    invoiceNumber: '',
    invoiceReference: '',
    invoiceDate: today,
    dueDate: addDays(today, DEFAULT_PAYMENT_TERM_DAYS),
    currency: 'AUD',
    description: '',
    item: { name: '', quantity: '1', rate: '' },
    taxRate: '10',
    discount: '0',
  };
}

/**
 * Builds the POST /invoices body field by field, so nothing the API computes itself (totals,
 * status, currencySymbol) can ever leak into it. Blank optional fields are `undefined` and
 * therefore dropped by JSON.stringify.
 */
export function toCreateInvoiceRequest(values: CreateInvoiceFormOutput): CreateInvoiceRequest {
  return {
    invoiceNumber: values.invoiceNumber,
    invoiceReference: values.invoiceReference,
    invoiceDate: values.invoiceDate,
    dueDate: values.dueDate,
    currency: values.currency,
    description: values.description,
    customer: {
      fullname: values.customer.fullname,
      email: values.customer.email,
      mobileNumber: values.customer.mobileNumber,
      address: values.customer.address,
    },
    items: [{ name: values.item.name, quantity: values.item.quantity, rate: values.item.rate }],
    taxRate: values.taxRate,
    discount: values.discount,
  };
}
