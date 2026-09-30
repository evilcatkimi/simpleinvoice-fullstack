import { QueryFailedError } from 'typeorm';
import { isDataException, isDataExceptionCode } from './sqlstate';

function queryFailed(driverError: object): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], Object.assign(new Error('failed'), driverError));
}

describe('isDataException', () => {
  it.each(['22021', '22P02', '22001', '22003', '22007', '22008'])(
    'recognises SQLSTATE %s (class 22, data exception) on a TypeORM query error',
    (code) => {
      expect(isDataException(queryFailed({ code }))).toBe(true);
    },
  );

  it('recognises the code on the driver error itself as well', () => {
    expect(
      isDataException(Object.assign(new Error('invalid input syntax'), { code: '22P02' })),
    ).toBe(true);
  });

  it('ignores constraint violations, non-errors and look-alike codes', () => {
    expect(isDataException(queryFailed({ code: '23505' }))).toBe(false);
    expect(isDataException({ code: '22P02' })).toBe(false);
    expect(isDataException(undefined)).toBe(false);
    expect(isDataExceptionCode('ECONNREFUSED')).toBe(false);
    expect(isDataExceptionCode(22021)).toBe(false);
    expect(isDataExceptionCode('22')).toBe(false);
  });
});
