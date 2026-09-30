/** Claims carried by the access token (in addition to the registered iat / exp / iss / aud). */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  /** Random token id: what logout revokes. */
  jti: string;
}

/** A token whose signature and claims were checked. `exp` (epoch seconds) bounds how long a revocation must last. */
export interface VerifiedAccessToken extends AccessTokenClaims {
  exp: number;
}
