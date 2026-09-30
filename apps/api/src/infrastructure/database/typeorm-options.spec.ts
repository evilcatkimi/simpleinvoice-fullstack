import { types, type TypeOverrides } from 'pg';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import type { DatabaseEnvironment } from '../../config/environment';
import { buildDataSourceOptions } from './typeorm-options';

const ENV = {
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_USER: 'simple_invoice',
  DB_PASSWORD: 'secret',
  DB_NAME: 'simple_invoice',
  DB_SSL: false,
} satisfies DatabaseEnvironment;

/** @types/pg declares parsers as `(oid: number) => any`; at runtime they receive the column value as text. */
type TextParser = (value: string) => unknown;

function dateParserOf(parsers: {
  getTypeParser(oid: number, format?: 'text'): unknown;
}): TextParser {
  return parsers.getTypeParser(types.builtins.DATE, 'text') as TextParser;
}

function optionsFor(env: Partial<DatabaseEnvironment> = {}) {
  const options = buildDataSourceOptions({ ...ENV, ...env }) as PostgresConnectionOptions;
  return { options, extra: options.extra as { types: TypeOverrides; statement_timeout: number } };
}

describe('buildDataSourceOptions', () => {
  it('keeps DATE columns as YYYY-MM-DD strings, so calendar dates never shift with a time zone', () => {
    const parseDate = dateParserOf(optionsFor().extra.types);

    expect(parseDate('2026-01-01')).toBe('2026-01-01');
  });

  it("leaves pg's global DATE parser untouched (the override is scoped to this pool)", () => {
    optionsFor();

    expect(dateParserOf(types)('2026-01-01')).toBeInstanceOf(Date);
  });

  it('verifies the server certificate whenever SSL is enabled', () => {
    expect(optionsFor({ DB_SSL: true }).options.ssl).toEqual({ rejectUnauthorized: true });
    expect(optionsFor({ DB_SSL: false }).options.ssl).toBe(false);
  });

  it('never lets TypeORM alter the schema: reviewed migrations only, run explicitly', () => {
    expect(optionsFor().options).toMatchObject({ synchronize: false, migrationsRun: false });
  });

  it('never runs DDL on connect: extensions come from migrations, not from the runtime role', () => {
    expect(optionsFor().options).toMatchObject({ installExtensions: false });
  });

  it('applies the reviewed schema migration', () => {
    const names = (optionsFor().options.migrations as { name: string }[]).map(
      (migration) => migration.name,
    );

    expect(names).toEqual(['InitSchema1790640000000']);
  });

  it('bounds every query with a statement timeout', () => {
    expect(optionsFor().extra.statement_timeout).toBe(15_000);
  });
});
