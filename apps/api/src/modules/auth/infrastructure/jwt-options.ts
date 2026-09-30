import type { JwtModuleOptions } from '@nestjs/jwt';

/** Clock skew accepted on exp, nbf, iat and maxAge. */
export const CLOCK_TOLERANCE_SECONDS = 5;

export interface JwtSettings {
  secret: string;
  /** Access-token lifetime in seconds (JWT_EXPIRES_IN). */
  expiresIn: number;
  issuer: string;
  audience: string;
}

/**
 * HS256 access tokens. The verifier pins the algorithm instead of trusting the token header, which defeats "alg: none"
 * and algorithm-confusion attacks; issuer and audience stop tokens minted for other systems; maxAge (which also makes
 * iat mandatory) caps every token at the configured lifetime from its issue time, whatever its exp claims.
 */
export function buildJwtOptions({
  secret,
  expiresIn,
  issuer,
  audience,
}: JwtSettings): JwtModuleOptions {
  return {
    secret,
    signOptions: { algorithm: 'HS256', expiresIn, issuer, audience },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer,
      audience,
      maxAge: expiresIn,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    },
  };
}
