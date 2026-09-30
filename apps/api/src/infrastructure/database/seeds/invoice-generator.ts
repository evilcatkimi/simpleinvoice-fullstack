import { SUPPORTED_CURRENCY_CODES } from '../../../modules/currencies/domain/currencies';
import { calculateInvoiceTotals } from '../../../modules/invoices/domain/invoice-calculator';
import { PERSISTED_INVOICE_STATUSES } from '../../../modules/invoices/domain/invoice-status';
import { Money, roundMoney } from '../../../modules/invoices/domain/money';
import { addDays } from '../../../shared/dates/calendar-date';
import type { SeedInvoice } from './seed-invoice';
import { SeededRandom } from './seeded-random';

// Fictitious customers; e-mails use the reserved example.* domains (RFC 2606).
const CUSTOMERS: readonly SeedInvoice['customer'][] = [
  {
    fullname: 'Olivia Bennett',
    email: 'olivia.bennett@example.com',
    mobileNumber: '+61 412 555 019',
    address: '12 George St, Sydney NSW 2000, Australia',
  },
  {
    fullname: 'Nguyen Van An',
    email: 'an.nguyen@example.com',
    mobileNumber: '+84 90 555 1234',
    address: '15 Le Loi, District 1, Ho Chi Minh City, Vietnam',
  },
  {
    fullname: 'Tran Thi Mai',
    email: 'mai.tran@example.org',
    mobileNumber: '+84 91 555 7788',
    address: '22 Hang Bai, Hoan Kiem, Hanoi, Vietnam',
  },
  {
    fullname: 'Wei Chen',
    email: 'wei.chen@example.net',
    mobileNumber: '+65 8123 4567',
    address: '1 Raffles Place, Singapore 048616',
  },
  {
    fullname: "Liam O'Connor",
    email: 'liam.oconnor@example.com',
    mobileNumber: null,
    address: '8 Grafton St, Dublin 2, Ireland',
  },
  {
    fullname: 'Sophie Laurent',
    email: 'sophie.laurent@example.org',
    mobileNumber: '+33 6 55 12 34 56',
    address: '5 Rue de Rivoli, 75001 Paris, France',
  },
  {
    fullname: 'James Whitaker',
    email: 'james.whitaker@example.net',
    mobileNumber: '+44 7700 900123',
    address: '221 Baker St, London NW1 6XE, United Kingdom',
  },
  {
    fullname: 'Mateo García',
    email: 'mateo.garcia@example.com',
    mobileNumber: null,
    address: null,
  },
  {
    fullname: 'Priya Patel',
    email: 'priya.patel@example.org',
    mobileNumber: '+64 21 555 0199',
    address: '100 Queen St, Auckland 1010, New Zealand',
  },
  {
    fullname: 'Ethan Clarke',
    email: 'ethan.clarke@example.net',
    mobileNumber: '+1 416 555 0142',
    address: '200 Bay St, Toronto ON M5J 2J2, Canada',
  },
  {
    fullname: 'Le Minh Khoa',
    email: 'khoa.le@example.com',
    mobileNumber: '+84 93 555 2468',
    address: '9 Bach Dang, Hai Chau, Da Nang, Vietnam',
  },
  {
    fullname: 'Grace Kim',
    email: 'grace.kim@example.org',
    mobileNumber: '+61 3 5550 1234',
    address: '45 Collins St, Melbourne VIC 3000, Australia',
  },
  {
    fullname: 'Hannah Schmidt',
    email: 'hannah.schmidt@example.net',
    mobileNumber: null,
    address: 'Friedrichstrasse 43, 10117 Berlin, Germany',
  },
  {
    fullname: 'Acme Logistics Pty Ltd',
    email: 'accounts@acme-logistics.example.com',
    mobileNumber: '+61 2 5550 9876',
    address: '3 Port Rd, Brisbane QLD 4000, Australia',
  },
  {
    fullname: 'Blue Harbour Café',
    email: 'hello@blueharbour.example.com',
    mobileNumber: '+65 6555 0101',
    address: '30 Marina Blvd, Singapore 018980',
  },
  {
    fullname: 'Northwind Traders',
    email: 'billing@northwind.example.org',
    mobileNumber: null,
    address: '400 Market St, San Francisco CA 94111, USA',
  },
];

const LINE_ITEMS = [
  'Website redesign',
  'Monthly SEO retainer',
  'Cloud hosting (12 months)',
  'Mobile app maintenance',
  'UX research workshop',
  'Payment gateway integration',
  'Penetration test',
  'Data migration',
  'Support hours',
  'Brand identity package',
  'Business laptop',
  'Honda RC150 service',
  'Conference booth rental',
  'Copywriting (10 articles)',
  'API development sprint',
  'Ergonomic office chairs',
] as const;

const DESCRIPTIONS = [
  'Services rendered this month',
  'Milestone 1 of 3',
  'Hardware purchase',
  'Annual subscription',
  'Please quote the invoice number when paying',
] as const;

const TAX_RATES = ['0', '5', '7', '8', '9', '10', '10', '15'] as const;

export interface GenerateInvoicesOptions {
  count: number;
  /** Calendar date the dataset is relative to (YYYY-MM-DD). */
  today: string;
  /** Creation timestamps are never later than this instant. */
  now: Date;
  seed: number;
}

/**
 * Deterministic demo invoices, dated relative to `today` so the list always contains current, due-soon and overdue
 * invoices whenever the seed runs. Invoice numbers are fixed, which makes re-running the seed a no-op.
 */
export function generateInvoices(options: GenerateInvoicesOptions): SeedInvoice[] {
  const random = new SeededRandom(options.seed);
  return Array.from({ length: options.count }, (_, index) =>
    generateInvoice(random, index, options),
  );
}

function generateInvoice(
  random: SeededRandom,
  index: number,
  { today, now }: GenerateInvoicesOptions,
): SeedInvoice {
  // Round-robin keeps the stored statuses balanced (about a third each).
  const status = PERSISTED_INVOICE_STATUSES[index % PERSISTED_INVOICE_STATUSES.length];
  // Paid invoices are spread over the last year. Half of the unpaid ones are still within terms and the rest are
  // past due, so the Draft, Pending and Overdue filters all return data whatever day the seed runs.
  let daysAgo: number;
  if (status === 'Paid') {
    daysAgo = random.int(0, 364);
  } else {
    daysAgo = random.chance(0.5) ? random.int(0, 6) : random.int(67, 364);
  }
  const invoiceDate = addDays(today, -daysAgo);
  const dueDate = addDays(invoiceDate, random.int(7, 60));

  const quantity = random.int(1, 25);
  const rate = new Money(random.int(1_500, 480_000)).dividedBy(100);
  const taxRate = random.pick(TAX_RATES);
  const discount = random.chance(0.4)
    ? roundMoney(rate.times(quantity).times(random.int(2, 15)).dividedBy(100))
    : new Money(0);
  const { totalAmount } = calculateInvoiceTotals({
    items: [{ quantity, rate }],
    taxRate,
    discount,
  });

  let totalPaid = new Money(0);
  if (status === 'Paid') {
    totalPaid = totalAmount;
  } else if (status === 'Pending' && random.chance(0.5)) {
    totalPaid = roundMoney(totalAmount.times(random.int(10, 90)).dividedBy(100));
  }

  const createdAt = new Date(
    `${invoiceDate}T${String(random.int(8, 17)).padStart(2, '0')}:00:00.000Z`,
  );
  createdAt.setUTCMinutes(random.int(0, 59), random.int(0, 59));

  return {
    id: random.uuid(),
    invoiceNumber: `INV-2026-${String(index + 1).padStart(4, '0')}`,
    invoiceReference: random.chance(0.6) ? `PO-${random.int(10_000, 99_999)}` : null,
    invoiceDate,
    dueDate,
    currency: random.pick(SUPPORTED_CURRENCY_CODES),
    description: random.chance(0.5) ? random.pick(DESCRIPTIONS) : null,
    status,
    customer: { ...random.pick(CUSTOMERS) },
    item: { id: random.uuid(), name: random.pick(LINE_ITEMS), quantity, rate: rate.toFixed(2) },
    taxRate,
    discount: discount.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    createdAt: new Date(Math.min(createdAt.getTime(), now.getTime())),
  };
}
