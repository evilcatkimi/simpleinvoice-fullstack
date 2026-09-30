import type { AccessTokenClaims } from './access-token';

/** Port for minting access tokens (JWT adapter in the infrastructure layer). */
export abstract class AccessTokenIssuer {
  /** How long every issued token stays valid, in seconds. */
  abstract readonly lifetimeSeconds: number;

  abstract sign(claims: AccessTokenClaims): Promise<string>;
}
