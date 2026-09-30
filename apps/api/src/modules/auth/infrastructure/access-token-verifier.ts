import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import type { VerifiedAccessToken } from '../application/access-token';
import { RevokedTokenStore } from '../application/revoked-token-store';
import { AccessTokenCookie } from './access-token-cookie';
import { CLOCK_TOLERANCE_SECONDS } from './jwt-options';

/** Where a request carried its token: the Authorization header (API clients) or the session cookie (the SPA). */
export interface PresentedAccessToken {
  token: string;
  source: 'header' | 'cookie';
}

/** Finds and checks access tokens, for the JwtAuthGuard and for logout. */
@Injectable()
export class AccessTokenVerifier {
  constructor(
    private readonly jwtService: JwtService,
    private readonly revokedTokens: RevokedTokenStore,
    private readonly cookie: AccessTokenCookie,
  ) {}

  /** Authorization: Bearer header first (explicit API clients), then the HttpOnly cookie (the SPA). */
  extract(request: Request): PresentedAccessToken | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() === 'bearer' && token) {
      return { token, source: 'header' };
    }
    const cookieToken: unknown = request.cookies?.[this.cookie.name];
    if (typeof cookieToken === 'string' && cookieToken.length > 0) {
      return { token: cookieToken, source: 'cookie' };
    }
    return undefined;
  }

  /**
   * The claims of a token that is authentic, within its lifetime (JwtModule verify options), well-formed and not
   * revoked; undefined otherwise. Callers answer every failure alike, so a response never says why a token was refused.
   */
  async verify(token: string): Promise<VerifiedAccessToken | undefined> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token);
    } catch {
      return undefined;
    }
    if (!hasAccessTokenClaims(payload) || (await this.revokedTokens.isRevoked(payload.jti))) {
      return undefined;
    }
    return payload;
  }
}

/**
 * jsonwebtoken checks exp only when it is present and never looks at claim types. A correctly signed token without
 * exp, issued in the future, or whose sub is not a UUID (it would reach the users query and fail there) is refused.
 */
function hasAccessTokenClaims(
  payload: Record<string, unknown>,
): payload is Record<string, unknown> & VerifiedAccessToken {
  const latestIssuedAt = Date.now() / 1000 + CLOCK_TOLERANCE_SECONDS;
  return (
    isUUID(payload.sub) &&
    isUUID(payload.jti) &&
    typeof payload.email === 'string' &&
    typeof payload.exp === 'number' &&
    typeof payload.iat === 'number' &&
    payload.iat <= latestIssuedAt
  );
}
