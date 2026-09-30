import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithUser } from '../../../shared/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../../../shared/decorators/public.decorator';
import { AccessTokenVerifier } from './access-token-verifier';
import { requireCsrfHeader } from './csrf-header.guard';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Registered globally (APP_GUARD): every route requires a valid access token unless it is marked @Public().
 * Algorithm, issuer, audience and maximum age are pinned in the JwtModule verify options (jwt-options.ts).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const credential = this.accessTokens.extract(request);
    if (!credential) {
      throw new UnauthorizedException('Authentication required');
    }

    // Browsers attach cookies automatically, so a cookie alone does not prove the SPA sent the request. A custom
    // header cannot be added cross-origin without a CORS preflight, which the API does not grant.
    // Bearer clients (Swagger, curl) are not exposed to CSRF: the token must be attached explicitly.
    if (credential.source === 'cookie' && !SAFE_METHODS.has(request.method)) {
      requireCsrfHeader(request);
    }

    const token = await this.accessTokens.verify(credential.token);
    if (!token) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = { id: token.sub, email: token.email };
    return true;
  }
}
