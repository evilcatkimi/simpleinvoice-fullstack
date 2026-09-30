import { TypeOverrides, types } from 'pg';
import type { DataSourceOptions } from 'typeorm';
import type { DatabaseEnvironment } from '../../config/environment';
import { InvoiceItemEntity } from '../../modules/invoices/infrastructure/invoice-item.entity';
import { InvoiceEntity } from '../../modules/invoices/infrastructure/invoice.entity';
import { UserEntity } from '../../modules/users/infrastructure/user.entity';
import { InitSchema1790640000000 } from './migrations/1790640000000-InitSchema';

const ENTITIES = [UserEntity, InvoiceEntity, InvoiceItemEntity];

/** Listed explicitly (not globbed) so the same list works from ts-node, compiled JS and Jest. */
const MIGRATIONS = [InitSchema1790640000000];

/**
 * DATE columns hold calendar dates. node-postgres would turn them into JS Dates at local midnight, which can move the
 * day when the process time zone differs from the data's; keep the 'YYYY-MM-DD' text Postgres sends. Scoped to this
 * pool instead of mutating pg's global parsers.
 */
const pgTypes = new TypeOverrides();
pgTypes.setTypeParser(types.builtins.DATE, (value: string) => value);

/** Single source of connection settings for the Nest app, the TypeORM CLI, the seed and the e2e setup. */
export function buildDataSourceOptions(env: DatabaseEnvironment): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL ? { rejectUnauthorized: true } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'schema_migrations',
    // The schema belongs to reviewed SQL migrations; letting entity metadata alter it could drop data or constraints.
    synchronize: false,
    migrationsRun: false,
    // TypeORM would otherwise run CREATE EXTENSION "uuid-ossp" on every connect: extensions come from migrations, and
    // the API's runtime role may not (and must not) change the schema.
    installExtensions: false,
    connectTimeoutMS: 5_000,
    extra: {
      max: 10,
      // A runaway query must not hold a pooled connection forever.
      statement_timeout: 15_000,
      types: pgTypes,
    },
  };
}
