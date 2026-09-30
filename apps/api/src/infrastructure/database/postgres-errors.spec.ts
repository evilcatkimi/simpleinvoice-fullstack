import { QueryFailedError } from 'typeorm';
import { isForeignKeyViolation, isUniqueViolation } from './postgres-errors';

function queryFailed(driverError: object): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], Object.assign(new Error('failed'), driverError));
}

describe('isUniqueViolation', () => {
  it('recognises a unique violation of the named constraint or unique index', () => {
    expect(
      isUniqueViolation(
        queryFailed({ code: '23505', constraint: 'invoices_invoice_number_upper_uq' }),
        'invoices_invoice_number_upper_uq',
      ),
    ).toBe(true);
  });

  it('ignores unique violations of other constraints', () => {
    expect(
      isUniqueViolation(
        queryFailed({ code: '23505', constraint: 'invoices_pkey' }),
        'invoices_invoice_number_upper_uq',
      ),
    ).toBe(false);
  });

  it('ignores other SQLSTATEs (e.g. check violations)', () => {
    expect(
      isUniqueViolation(
        queryFailed({ code: '23514', constraint: 'invoices_invoice_number_upper_uq' }),
        'invoices_invoice_number_upper_uq',
      ),
    ).toBe(false);
  });

  it('ignores errors that did not come from a query', () => {
    const lookalike = Object.assign(new Error('x'), {
      code: '23505',
      constraint: 'invoices_invoice_number_upper_uq',
    });
    expect(isUniqueViolation(lookalike, 'invoices_invoice_number_upper_uq')).toBe(false);
    expect(isUniqueViolation(undefined, 'invoices_invoice_number_upper_uq')).toBe(false);
  });
});

describe('isForeignKeyViolation', () => {
  it('recognises a foreign-key violation of the named constraint only', () => {
    const missingCreator = queryFailed({ code: '23503', constraint: 'invoices_created_by_fk' });

    expect(isForeignKeyViolation(missingCreator, 'invoices_created_by_fk')).toBe(true);
    expect(isForeignKeyViolation(missingCreator, 'invoice_items_invoice_id_fkey')).toBe(false);
    expect(
      isForeignKeyViolation(
        queryFailed({ code: '23505', constraint: 'invoices_created_by_fk' }),
        'invoices_created_by_fk',
      ),
    ).toBe(false);
  });
});
