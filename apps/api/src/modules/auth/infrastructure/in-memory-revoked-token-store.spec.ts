import { InMemoryRevokedTokenStore } from './in-memory-revoked-token-store';

describe('InMemoryRevokedTokenStore', () => {
  const NOW = new Date('2026-09-29T10:00:00.000Z');
  const nowSeconds = NOW.getTime() / 1000;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports a revoked token id, and only that one', async () => {
    const store = new InMemoryRevokedTokenStore();

    await store.revoke('token-a', nowSeconds + 3600);

    await expect(store.isRevoked('token-a')).resolves.toBe(true);
    await expect(store.isRevoked('token-b')).resolves.toBe(false);
  });

  it('keeps the entry a minute past the expiry, beyond the verifier clock tolerance', async () => {
    const store = new InMemoryRevokedTokenStore();
    await store.revoke('token-a', nowSeconds + 10);

    jest.advanceTimersByTime(10_000 + 59_000);
    await store.revoke('trigger-a-purge', nowSeconds + 3600);

    await expect(store.isRevoked('token-a')).resolves.toBe(true);
  });

  it('forgets tokens that expired for good, so memory only holds live tokens', async () => {
    const store = new InMemoryRevokedTokenStore();
    await store.revoke('token-a', nowSeconds + 10);

    jest.advanceTimersByTime(10_000 + 60_000);
    await store.revoke('trigger-a-purge', nowSeconds + 3600);

    await expect(store.isRevoked('token-a')).resolves.toBe(false);
    await expect(store.isRevoked('trigger-a-purge')).resolves.toBe(true);
  });
});
