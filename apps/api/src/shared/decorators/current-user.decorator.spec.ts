import { HttpException, type ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator';

type ParamFactory = (data: unknown, context: ExecutionContext) => AuthenticatedUser;

/** The function Nest runs to resolve a @CurrentUser() parameter. */
function currentUserFactory(): ParamFactory {
  class TestController {
    handler(@CurrentUser() _user: AuthenticatedUser): void {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler') as Record<
    string,
    { factory: ParamFactory }
  >;
  return Object.values(args)[0].factory;
}

function contextWith(request: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('@CurrentUser()', () => {
  const resolve = currentUserFactory();

  it('injects the user that JwtAuthGuard attached to the request', () => {
    const user = {
      id: 'ad1e0902-1928-4345-b513-60c86c94fc91',
      email: 'reviewer@simpleinvoice.dev',
    };

    expect(resolve(undefined, contextWith({ user }))).toBe(user);
  });

  it('fails loudly (500, not a 401) when used on a route the guard did not authenticate', () => {
    const resolveAnonymous = () => resolve(undefined, contextWith({}));

    expect(resolveAnonymous).toThrow('@CurrentUser() requires an authenticated route');
    // A plain Error is a programming mistake: the exception filter turns it into a generic 500.
    expect(resolveAnonymous).not.toThrow(HttpException);
  });
});
