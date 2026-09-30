import 'reflect-metadata';
import { dropRunDatabase } from './run-database';
import { currentE2eRun } from './test-environment';

/** Drops the database and roles of this run (see global-setup.ts); other runs' are left alone. */
export default async function globalTeardown(): Promise<void> {
  await dropRunDatabase(currentE2eRun());
}
