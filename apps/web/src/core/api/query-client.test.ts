import { describe, expect, it } from 'vitest';
import { ApiError, NETWORK_ERROR_STATUS } from './api-client';
import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it.each([400, 401, 404, 409, 429])('never retries a %i', (status) => {
    expect(shouldRetry(0, new ApiError(status, ['client error']))).toBe(false);
  });

  it('retries network failures and server errors exactly once', () => {
    expect(shouldRetry(0, new ApiError(NETWORK_ERROR_STATUS, ['offline']))).toBe(true);
    expect(shouldRetry(0, new ApiError(503, ['unavailable']))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, ['unavailable']))).toBe(false);
  });
});
