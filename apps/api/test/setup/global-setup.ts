import 'reflect-metadata';
import { loadEnvFiles } from '../../src/config/env-files';
import { createRunDatabase } from './run-database';
import { newE2eRun, publishE2eRun } from './test-environment';

/**
 * Creates this run's database and roles once per run and migrates it from scratch, so the schema under test is exactly
 * what `npm run migration:run` produces and the API runs with the production grants. The test files find the run in
 * the environment they inherit; global-teardown.ts drops it all.
 */
export default async function globalSetup(): Promise<void> {
  loadEnvFiles();
  const run = newE2eRun();
  await createRunDatabase(run);
  publishE2eRun(run);
}
