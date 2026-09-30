import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { AppEnvironment } from '../../../config/environment';
import type { RequestWithUser } from '../../../shared/decorators/current-user.decorator';
import { Public } from '../../../shared/decorators/public.decorator';
import { AccessTokenCookie } from './access-token-cookie';
import { AccessTokenVerifier } from './access-token-verifier';
import { InMemoryRevokedTokenStore } from './in-memory-revoked-token-store';
import { JwtAuthGuard } from './jwt-auth.guard';
import { buildJwtOptions } from './jwt-options';

const SECRET = 'unit-test-signing-key-that-is-at-least-32-characters';
const ISSUER = 'simple-invoice-api';
const AUDIENCE = 'simple-invoice-web';
const EXPIRES_IN = 3600;
const USER = { sub: 'ad1e0902-1928-4345-b513-60c86c94fc91', email: 'reviewer@simpleinvoice.dev' };

/** The claims the API issues: identity plus a unique token id. */
const claims = () => ({ ...USER, jti: randomUUID() });

class TestController {
  @Public()
  open(): void {}

  protectedRoute(): void {}
}

/** Like HealthController: @Public() on the class opens every route of the controller. */
@Public()
class PublicController {
  check(): void {}
}

/** The API's own token settings (what AuthModule registers), unless a test overrides the signing side. */
function jwtServiceFor(options: { secret?: string; audience?: string; expiresIn?: number } = {}) {
  const apiOptions = buildJwtOptions({
    secret: SECRET,
    expiresIn: EXPIRES_IN,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return new JwtService({
    ...apiOptions,
    secret: options.secret ?? SECRET,
    signOptions: {
      ...apiOptions.signOptions,
      audience: options.audience ?? AUDIENCE,
      expiresIn: options.expiresIn ?? 60,
    },
  });
}

function buildRequest({
  method = 'GET',
  headers = {},
  cookies = {},
}: {
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}): RequestWithUser {
  const lowerCased = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    method,
    headers: lowerCased,
    cookies,
    get: (name: string) => lowerCased[name.toLowerCase()],
  } as unknown as RequestWithUser;
}

function contextFor(
  request: RequestWithUser,
  handler: () => void = TestController.prototype.protectedRoute,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function guardFor({ cookieSecure = false } = {}) {
  const jwtService = jwtServiceFor();
  const revokedTokens = new InMemoryRevokedTokenStore();
  const config = { get: (key: keyof AppEnvironment) => key === 'COOKIE_SECURE' && cookieSecure };
  const guard = new JwtAuthGuard(
    new AccessTokenVerifier(
      jwtService,
      revokedTokens,
      new AccessTokenCookie(config as unknown as ConfigService<AppEnvironment, true>),
    ),
    new Reflector(),
  );
  return { guard, jwtService, revokedTokens };
}

describe('JwtAuthGuard', () => {
  const { guard, jwtService, revokedTokens } = guardFor();
  let token: string;

  beforeAll(async () => {
    token = await jwtService.signAsync(claims());
  });

  const rejectsBearer = (bearer: string) =>
    expect(
      guard.canActivate(
        contextFor(buildRequest({ headers: { Authorization: `Bearer ${bearer}` } })),
      ),
    ).rejects.toThrow(new UnauthorizedException('Invalid or expired access token'));

  it('lets @Public() routes through without a token', async () => {
    await expect(
      guard.canActivate(contextFor(buildRequest({}), TestController.prototype.open)),
    ).resolves.toBe(true);
  });

  it('rejects a protected route without a token', async () => {
    await expect(guard.canActivate(contextFor(buildRequest({})))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts a valid Bearer token and attaches the user', async () => {
    const request = buildRequest({ headers: { Authorization: `Bearer ${token}` } });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: USER.sub, email: USER.email });
  });

  it('accepts the HttpOnly cookie on safe methods', async () => {
    const request = buildRequest({ cookies: { si_access_token: token } });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user?.id).toBe(USER.sub);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'rejects a cookie-authenticated %s without X-Requested-With (CSRF)',
    async (method) => {
      const request = buildRequest({ method, cookies: { si_access_token: token } });

      await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
    },
  );

  it('accepts a cookie-authenticated POST sent by the SPA with X-Requested-With', async () => {
    const request = buildRequest({
      method: 'POST',
      cookies: { si_access_token: token },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('does not require the CSRF header for Bearer clients', async () => {
    const request = buildRequest({ method: 'POST', headers: { Authorization: `Bearer ${token}` } });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('prefers the Authorization header over the cookie', async () => {
    const request = buildRequest({
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cookies: { si_access_token: 'garbage' },
    });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('rejects a token with a tampered payload', async () => {
    const [header, , signature] = token.split('.');
    const forged = [header, base64url({ ...claims(), sub: 'someone-else' }), signature].join('.');

    await expect(
      guard.canActivate(
        contextFor(buildRequest({ headers: { Authorization: `Bearer ${forged}` } })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      ...claims(),
      iss: ISSUER,
      aud: AUDIENCE,
      iat: now,
      exp: now + 60,
    })}.`;

    await expect(
      guard.canActivate(
        contextFor(buildRequest({ headers: { Authorization: `Bearer ${unsigned}` } })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ['signed with another secret', { secret: 'another-signing-key-that-is-also-32-chars-long' }],
    ['issued for another audience', { audience: 'another-client' }],
    ['expired', { expiresIn: -10 }],
  ])('rejects a token %s', async (_description, options) => {
    const otherToken = await jwtServiceFor(options).signAsync(claims());

    await expect(
      guard.canActivate(
        contextFor(buildRequest({ headers: { Authorization: `Bearer ${otherToken}` } })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('honours @Public() on the controller class', async () => {
    const context = {
      getHandler: () => PublicController.prototype.check,
      getClass: () => PublicController,
      switchToHttp: () => ({ getRequest: () => buildRequest({}) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a correctly signed token that does not carry the identity claims', async () => {
    const withoutEmail = await jwtService.signAsync({ sub: USER.sub, jti: randomUUID() });

    await expect(
      guard.canActivate(
        contextFor(buildRequest({ headers: { Authorization: `Bearer ${withoutEmail}` } })),
      ),
    ).rejects.toThrow('Invalid or expired access token');
  });

  it('gives the same answer for expired and forged tokens, so it reveals nothing about why', async () => {
    const expired = await jwtServiceFor({ expiresIn: -10 }).signAsync(claims());
    const forged = await jwtServiceFor({
      secret: 'another-signing-key-that-is-also-32-chars-long',
    }).signAsync(claims());

    for (const rejected of [expired, forged, 'not-a-jwt']) {
      await rejectsBearer(rejected);
    }
  });

  it('asks for authentication when the cookie is present but empty', async () => {
    await expect(
      guard.canActivate(contextFor(buildRequest({ cookies: { si_access_token: '' } }))),
    ).rejects.toThrow(new UnauthorizedException('Authentication required'));
  });

  it('rejects a cookie-authenticated POST whose X-Requested-With has another value', async () => {
    const request = buildRequest({
      method: 'POST',
      cookies: { si_access_token: token },
      headers: { 'X-Requested-With': 'fetch' },
    });

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
  });

  it.each(['HEAD', 'OPTIONS'])(
    'treats %s as a safe method: the cookie is enough without X-Requested-With',
    async (method) => {
      const request = buildRequest({ method, cookies: { si_access_token: token } });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    },
  );

  it('accepts the Bearer scheme in any letter case', async () => {
    const request = buildRequest({ headers: { Authorization: `bearer ${token}` } });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it('ignores other Authorization schemes and falls back to the cookie, CSRF check included', async () => {
    const withoutCookie = buildRequest({ headers: { Authorization: `Basic ${token}` } });
    const withCookie = buildRequest({
      method: 'POST',
      headers: { Authorization: `Basic ${token}` },
      cookies: { si_access_token: token },
    });

    await expect(guard.canActivate(contextFor(withoutCookie))).rejects.toThrow(
      new UnauthorizedException('Authentication required'),
    );
    await expect(guard.canActivate(contextFor(withCookie))).rejects.toThrow(ForbiddenException);
  });

  describe('revocation (logout)', () => {
    it('rejects a token whose id was revoked, with the same answer as any invalid token', async () => {
      const tokenClaims = claims();
      const revoked = await jwtService.signAsync(tokenClaims);
      await revokedTokens.revoke(tokenClaims.jti, Math.floor(Date.now() / 1000) + 60);

      await rejectsBearer(revoked);
    });

    it('keeps accepting other tokens of the same user', async () => {
      await expect(
        guard.canActivate(
          contextFor(buildRequest({ headers: { Authorization: `Bearer ${token}` } })),
        ),
      ).resolves.toBe(true);
    });
  });

  describe('claims a correctly signed token must carry (defence in depth behind the signing key)', () => {
    it('rejects a token without exp (jsonwebtoken only checks exp when present)', async () => {
      const neverExpires = await new JwtService({
        secret: SECRET,
        signOptions: { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE },
      }).signAsync(claims());

      await rejectsBearer(neverExpires);
    });

    it('rejects a token older than JWT_EXPIRES_IN, even when its exp is still ahead (maxAge)', async () => {
      const issuedTwoHoursAgo = Math.floor(Date.now() / 1000) - 7200;
      const longLived = await jwtServiceFor({ expiresIn: 86_400 }).signAsync({
        ...claims(),
        iat: issuedTwoHoursAgo,
      });

      await rejectsBearer(longLived);
    });

    it('rejects a token issued in the future, which maxAge alone would keep alive', async () => {
      const inOneHour = Math.floor(Date.now() / 1000) + 3600;
      const fromTheFuture = await jwtServiceFor().signAsync({ ...claims(), iat: inOneHour });

      await rejectsBearer(fromTheFuture);
    });

    it.each([
      [
        'a sub that is not a UUID (it used to reach the users query and fail with a 500)',
        { sub: "x' OR '1'='1" },
      ],
      ['no token id (jti)', { jti: undefined }],
      ['a token id that is not a UUID', { jti: 42 }],
    ])('rejects %s', async (_case, override) => {
      const malformed = await jwtService.signAsync({ ...claims(), ...override });

      await rejectsBearer(malformed);
    });
  });

  describe('with COOKIE_SECURE=true', () => {
    const secure = guardFor({ cookieSecure: true });

    it('reads the session from the __Host- prefixed cookie', async () => {
      const secureToken = await secure.jwtService.signAsync(claims());
      const request = buildRequest({ cookies: { '__Host-si_access_token': secureToken } });

      await expect(secure.guard.canActivate(contextFor(request))).resolves.toBe(true);
    });

    it('ignores a cookie under the unprefixed name, which any subdomain could have planted', async () => {
      const planted = await secure.jwtService.signAsync(claims());

      await expect(
        secure.guard.canActivate(
          contextFor(buildRequest({ cookies: { si_access_token: planted } })),
        ),
      ).rejects.toThrow(new UnauthorizedException('Authentication required'));
    });
  });
});
