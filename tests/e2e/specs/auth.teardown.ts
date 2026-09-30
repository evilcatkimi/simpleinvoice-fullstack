import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { expect, test as teardown } from '@playwright/test';
import { AUTH_STATE_PATH } from '../support/env';

/** The saved session is a valid JWT until it expires: do not leave it on disk after the run. */
teardown('forget the saved session', async () => {
  await rm(AUTH_STATE_PATH, { force: true });
  expect(existsSync(AUTH_STATE_PATH)).toBe(false);
});
