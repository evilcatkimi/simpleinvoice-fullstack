import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { DuplicateInvoiceNumberError, InvoiceCreatorNotFoundError } from '../domain/invoice.errors';
import { buildInvoice, buildInvoiceEntity } from '../testing/invoice.fixtures';
import { InvoiceItemEntity } from './invoice-item.entity';
import { InvoiceEntity } from './invoice.entity';
import { TypeOrmInvoiceRepository } from './typeorm-invoice.repository';

function queryFailed(code: string, constraint: string): QueryFailedError {
  const driverError = Object.assign(new Error('database error'), { code, constraint });
  return new QueryFailedError('INSERT INTO "invoices" ...', [], driverError);
}

/** The query builder an invoice is read with; only its result is scripted (the SQL itself is covered e2e). */
function queryReturning(entity: InvoiceEntity | null) {
  const query = {
    leftJoinAndSelect: () => query,
    where: () => query,
    getOne: () => Promise.resolve(entity),
    getOneOrFail: () => Promise.resolve(entity),
  };
  return query;
}

describe('TypeOrmInvoiceRepository', () => {
  const manager = { insert: jest.fn(), createQueryBuilder: jest.fn() };
  const dataSource = {
    transaction: jest.fn((work: (entityManager: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    ),
  };
  const ormRepository = { createQueryBuilder: jest.fn() };
  let repository: TypeOrmInvoiceRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmInvoiceRepository,
        { provide: getRepositoryToken(InvoiceEntity), useValue: ormRepository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    repository = moduleRef.get(TypeOrmInvoiceRepository);
  });

  describe('create', () => {
    const invoice = buildInvoice();

    beforeEach(() => {
      manager.createQueryBuilder.mockReturnValue(queryReturning(buildInvoiceEntity()));
    });

    it('inserts the invoice and its items in one transaction, amounts as exact strings', async () => {
      const stored = await repository.create(invoice);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.insert).toHaveBeenNthCalledWith(
        1,
        InvoiceEntity,
        expect.objectContaining({
          id: invoice.id,
          status: 'Pending',
          totalAmount: '2180.00',
          totalPaid: '1451.34',
          balanceAmount: '728.66',
        }),
      );
      expect(manager.insert).toHaveBeenNthCalledWith(2, InvoiceItemEntity, [
        expect.objectContaining({
          invoiceId: invoice.id,
          rate: '1000.00',
          amount: '2000.00',
          position: 0,
        }),
      ]);
      expect(stored.totalAmount.toFixed(2)).toBe('2180.00');
    });

    it('translates a violation of the unique index on upper(invoice_number) into DuplicateInvoiceNumberError', async () => {
      manager.insert.mockRejectedValueOnce(
        queryFailed('23505', 'invoices_invoice_number_upper_uq'),
      );

      await expect(repository.create(invoice)).rejects.toThrow(DuplicateInvoiceNumberError);
    });

    it('answers "user no longer exists" (401), not a 500, when the creator was deleted after login', async () => {
      manager.insert.mockRejectedValueOnce(queryFailed('23503', 'invoices_created_by_fk'));

      const creation = repository.create(invoice);

      await expect(creation).rejects.toThrow(InvoiceCreatorNotFoundError);
      await expect(creation).rejects.toMatchObject({
        kind: 'unauthenticated',
        message: 'User no longer exists',
      });
    });

    it('rethrows every other database error untouched', async () => {
      const otherViolation = queryFailed('23505', 'invoices_pkey');
      manager.insert.mockRejectedValueOnce(otherViolation);

      await expect(repository.create(invoice)).rejects.toBe(otherViolation);
    });
  });

  describe('findById', () => {
    it('maps the stored invoice and its items to the domain', async () => {
      ormRepository.createQueryBuilder.mockReturnValue(queryReturning(buildInvoiceEntity()));

      const invoice = await repository.findById('099ca7da-a290-40fa-93b9-1c43ae7bb887');

      expect(invoice?.balanceAmount.toFixed(2)).toBe('728.66');
      expect(invoice?.items.map((item) => item.amount.toFixed(2))).toEqual(['2000.00']);
    });

    it('returns null when the invoice does not exist', async () => {
      ormRepository.createQueryBuilder.mockReturnValue(queryReturning(null));

      await expect(repository.findById('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
    });
  });
});
