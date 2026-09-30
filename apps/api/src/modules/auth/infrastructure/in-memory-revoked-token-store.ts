import { Injectable } from '@nestjs/common';
import type { RevokedTokenStore } from '../application/revoked-token-store';

/** Kept this long past the token's expiry: the verifier tolerates a few seconds of clock skew on `exp`. */
const RETENTION_AFTER_EXPIRY_MS = 60_000;

/**
 * Revoked token ids (jti) with the time they can be forgotten. Entries that reached it are dropped whenever a token is
 * revoked, so the map only holds tokens still within their lifetime (each one needed a successful login).
 */
@Injectable()
export class InMemoryRevokedTokenStore implements RevokedTokenStore {
  private readonly forgetAt = new Map<string, number>();

  revoke(tokenId: string, expiresAt: number): Promise<void> {
    const now = Date.now();
    for (const [id, time] of this.forgetAt) {
      if (time <= now) {
        this.forgetAt.delete(id);
      }
    }
    this.forgetAt.set(tokenId, expiresAt * 1000 + RETENTION_AFTER_EXPIRY_MS);
    return Promise.resolve();
  }

  isRevoked(tokenId: string): Promise<boolean> {
    return Promise.resolve(this.forgetAt.has(tokenId));
  }
}
