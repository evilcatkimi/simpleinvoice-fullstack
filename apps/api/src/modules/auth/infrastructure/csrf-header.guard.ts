import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Header the SPA sends on every call. A cross-site form, link or image cannot set it, and a cross-origin fetch would
 * need a CORS preflight that the API does not grant.
 */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

export function requireCsrfHeader(request: Request): void {
  if (request.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw new ForbiddenException(`Missing ${CSRF_HEADER}: ${CSRF_HEADER_VALUE} header`);
  }
}

/**
 * For public routes that act on the session (logout): without it, any site could make the victim's browser post to
 * the route and, through the response, clear the session cookie. Authenticated routes get the same rule from the
 * JwtAuthGuard whenever the token comes from the cookie.
 */
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    requireCsrfHeader(context.switchToHttp().getRequest<Request>());
    return true;
  }
}
