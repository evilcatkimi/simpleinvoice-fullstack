import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Identity attached to the request by JwtAuthGuard once the access token is verified. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };

/** Injects the authenticated user into a route handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user) {
      // Only reachable if the decorator is used on a @Public() route: a programming error, not a client error.
      throw new Error('@CurrentUser() requires an authenticated route');
    }
    return user;
  },
);
