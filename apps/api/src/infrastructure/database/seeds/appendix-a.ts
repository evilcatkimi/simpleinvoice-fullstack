import type { SeedInvoice } from './seed-invoice';

/**
 * The invoice from Appendix A of the assessment brief, reproduced verbatim. Its persisted status is Pending: the brief
 * shows it as "Overdue", which is a derived status that is never stored (it is past its 2026-07-03 due date).
 * The calculator reproduces the brief's figures: 2 × 1000 = 2000, tax 200, discount 20 → 2180, balance 728.66.
 */
export const APPENDIX_A_INVOICE: SeedInvoice = {
  id: '099ca7da-a290-40fa-93b9-1c43ae7bb887',
  invoiceNumber: 'IV1780488206995',
  invoiceReference: '#5721662',
  invoiceDate: '2026-06-03',
  dueDate: '2026-07-03',
  currency: 'AUD',
  description: 'Invoice is issued to Kanglee',
  status: 'Pending',
  customer: {
    fullname: 'Paul',
    email: 'paul@101digital.io',
    mobileNumber: '947717364111',
    address: 'Singapore',
  },
  item: {
    id: 'b1c2d3e4-0000-0000-0000-000000000001',
    name: 'Honda RC150',
    quantity: 2,
    rate: '1000',
  },
  taxRate: '10',
  discount: '20',
  totalPaid: '1451.34',
  // The brief's timestamp has no offset; it is interpreted as UTC.
  createdAt: new Date('2026-06-03T12:03:26.995Z'),
};
