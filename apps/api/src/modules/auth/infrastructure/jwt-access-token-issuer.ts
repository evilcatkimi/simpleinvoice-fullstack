import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AppEnvironment } from '../../../config/environment';
import type { AccessTokenClaims } from '../application/access-token';
import type { AccessTokenIssuer } from '../application/access-token-issuer';

/**
 * Algorithm, issuer, audience and expiry come from the JwtModule sign options (buildJwtOptions), whose expiry is the
 * same JWT_EXPIRES_IN: the lifetime announced to clients is the one written into the token.
 */
@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
  readonly lifetimeSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.lifetimeSeconds = config.get('JWT_EXPIRES_IN', { infer: true });
  }

  sign(claims: AccessTokenClaims): Promise<string> {
    return this.jwtService.signAsync(claims);
  }
}
