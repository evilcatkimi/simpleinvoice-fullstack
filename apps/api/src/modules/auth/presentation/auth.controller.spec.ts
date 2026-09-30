import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AppEnvironment } from '../../../config/environment';
import { UnauthenticatedError } from '../../../shared/errors/application-errors';
import { buildThrottlerOptions } from '../../../shared/throttling/throttling';
import type { User } from '../../users/domain/user';
import type { VerifiedAccessToken } from '../application/access-token';
import type { AuthService } from '../application/auth.service';
import { AccessTokenCookie } from '../infrastructure/access-token-cookie';
import type { AccessTokenVerifier } from '../infrastructure/access-token-verifier';
import { AuthController } from './auth.controller';

const USER: User = {
  id: 'ad1e0902-1928-4345-b513-60c86c94fc91',
  email: 'reviewer@simpleinvoice.dev',
  fullname: 'Demo Reviewer',
  createdAt: new Date('2026-09-01T08:30:00.000Z'),
};

const VERIFIED_TOKEN: VerifiedAccessToken = {
  sub: 'ad1e0902-1928-4345-b513-60c86c94fc91',
  email: 'reviewer@simpleinvoice.dev',
  jti: '6f1c7a52-8d0e-4f3b-9a2d-1c5e7b9d3f10',
  exp: 1_790_682_000,
};

function setup({ cookieSecure = false } = {}) {
  const authService = { login: jest.fn(), getProfile: jest.fn(), logout: jest.fn() };
  authService.login.mockResolvedValue({
    accessToken: 'signed.jwt.token',
    expiresIn: 3600,
    user: USER,
  });
  authService.getProfile.mockResolvedValue(USER);
  const config = {
    get: jest.fn((key: string) => (key === 'COOKIE_SECURE' ? cookieSecure : undefined)),
  };
  const accessTokens = { extract: jest.fn(), verify: jest.fn() };
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };
  const request = {} as Request;
  const controller = new AuthController(
    authService as unknown as AuthService,
    accessTokens as unknown as AccessTokenVerifier,
    new AccessTokenCookie(config as unknown as ConfigService<AppEnvironment, true>),
  );
  const login = () =>
    controller.login(
      { email: USER.email, password: 'Reviewer@2026' },
      response as unknown as Response,
    );
  const logout = () => controller.logout(request, response as unknown as Response);
  return { authService, accessTokens, request, response, controller, login, logout };
}

describe('AuthController', () => {
  describe('POST /auth/login', () => {
    it('sets the token in an HttpOnly, SameSite=Strict cookie that expires with the token', async () => {
      const { response, login } = setup();

      await login();

      expect(response.cookie).toHaveBeenCalledWith('si_access_token', 'signed.jwt.token', {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/',
        maxAge: 3_600_000,
      });
    });

    it('marks the cookie Secure and __Host- prefixed when COOKIE_SECURE is enabled (HTTPS deployments)', async () => {
      const { response, login } = setup({ cookieSecure: true });

      await login();

      // The prefix makes browsers refuse the cookie unless it is Secure, Path=/ and has no Domain.
      expect(response.cookie).toHaveBeenCalledWith(
        '__Host-si_access_token',
        'signed.jwt.token',
        expect.objectContaining({ secure: true, path: '/' }),
      );
      const [[, , options]] = response.cookie.mock.calls as [[string, string, object]];
      expect(options).not.toHaveProperty('domain');
    });

    it('returns the Bearer token and only the public user fields', async () => {
      const { authService, login } = setup();
      // Even if the service ever handed back more than the User type promises, only three fields leave the API.
      authService.login.mockResolvedValue({
        accessToken: 'signed.jwt.token',
        expiresIn: 3600,
        user: { ...USER, passwordHash: '$2b$12$should.never.leave.the.server' },
      });

      await expect(login()).resolves.toEqual({
        accessToken: 'signed.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: { id: USER.id, email: USER.email, fullname: USER.fullname },
      });
    });

    it('sets no cookie when the credentials are rejected', async () => {
      const { authService, response, login } = setup();
      authService.login.mockRejectedValue(new UnauthenticatedError('Invalid email or password'));

      await expect(login()).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('counts every attempt against the strict login rate limit', () => {
      const { throttlers } = buildThrottlerOptions({ limit: 5, ttlSeconds: 60 }) as {
        throttlers: ThrottlerOptions[];
      };
      const loginThrottler = throttlers.find((throttler) => throttler.name === 'login');
      const context = {
        getHandler: () => AuthController.prototype.login,
        getClass: () => AuthController,
      } as unknown as ExecutionContext;

      expect(loginThrottler?.skipIf?.(context)).toBe(false);
    });
  });

  describe('POST /auth/logout', () => {
    it.each([false, true])(
      'clears the cookie with the name and attributes it was set with (secure: %p), or browsers keep it',
      async (cookieSecure) => {
        const { response, login, logout } = setup({ cookieSecure });
        await login();

        await logout();

        const [[name, , setWith]] = response.cookie.mock.calls as [[string, string, object]];
        const { maxAge: _maxAge, ...attributes } = setWith as { maxAge: number };
        expect(response.clearCookie).toHaveBeenCalledWith(name, attributes);
        expect(attributes).toEqual({
          httpOnly: true,
          sameSite: 'strict',
          secure: cookieSecure,
          path: '/',
        });
      },
    );

    it('revokes the presented token, so a copy captured before logout stops working', async () => {
      const { authService, accessTokens, request, logout } = setup();
      accessTokens.extract.mockReturnValue({ token: 'presented.jwt', source: 'cookie' });
      accessTokens.verify.mockResolvedValue(VERIFIED_TOKEN);

      await logout();

      expect(accessTokens.extract).toHaveBeenCalledWith(request);
      expect(accessTokens.verify).toHaveBeenCalledWith('presented.jwt');
      expect(authService.logout).toHaveBeenCalledWith(VERIFIED_TOKEN);
    });

    it.each([
      ['no token at all', undefined, undefined],
      [
        'an invalid, expired or already revoked token',
        { token: 'stale.jwt', source: 'header' },
        undefined,
      ],
    ])('only clears the cookie for %s (idempotent)', async (_case, presented, verified) => {
      const { authService, accessTokens, response, logout } = setup();
      accessTokens.extract.mockReturnValue(presented);
      accessTokens.verify.mockResolvedValue(verified);

      await logout();

      expect(authService.logout).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith('si_access_token', expect.any(Object));
    });
  });

  describe('GET /auth/me', () => {
    it('re-reads the profile of the authenticated user and returns its creation date in ISO-8601', async () => {
      const { authService, controller } = setup();

      await expect(controller.me({ id: USER.id, email: USER.email })).resolves.toEqual({
        id: USER.id,
        email: USER.email,
        fullname: 'Demo Reviewer',
        createdAt: '2026-09-01T08:30:00.000Z',
      });
      expect(authService.getProfile).toHaveBeenCalledWith(USER.id);
    });
  });
});
