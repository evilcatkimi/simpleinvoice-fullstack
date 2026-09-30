/**
 * Port: access tokens withdrawn before they expire (logout). The adapter is in-memory, i.e. per process; running the
 * API as several instances needs a shared store (e.g. Redis) behind the same port.
 */
export abstract class RevokedTokenStore {
  /** Rejects the token `tokenId` until `expiresAt` (epoch seconds), after which it is invalid anyway. */
  abstract revoke(tokenId: string, expiresAt: number): Promise<void>;

  abstract isRevoked(tokenId: string): Promise<boolean>;
}
