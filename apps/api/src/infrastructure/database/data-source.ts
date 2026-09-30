import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnvFiles } from '../../config/env-files';
import {
  DatabaseEnvironment,
  validateEnvironment,
  withMigrationCredentials,
} from '../../config/environment';
import { buildDataSourceOptions } from './typeorm-options';

/**
 * DataSource for the TypeORM CLI (`npm run migration:*`). Only the DB_* variables are required; migrations run as the
 * schema owner (DB_MIGRATION_USER) when it is configured, since the API's runtime role cannot change the schema.
 */
loadEnvFiles();

export default new DataSource(
  buildDataSourceOptions(
    withMigrationCredentials(validateEnvironment(DatabaseEnvironment, process.env)),
  ),
);
