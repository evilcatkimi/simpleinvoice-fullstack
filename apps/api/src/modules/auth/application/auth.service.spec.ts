import { Test } from '@nestjs/testing';
import { RateLimitedError, UnauthenticatedError } from '../../../shared/errors/application-errors';
import { UserRepository } from '../../users/application/user.repository';
import type { User, UserCredentials } from '../../users/domain/user';
import { AccessTokenIssuer } from './access-token-issuer';
import { AuthService } from './auth.service';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { PasswordHasher } from './password-hasher';
import { RevokedTokenStore } from './revoked-token-store';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const DUMMY_HASH = '$2b$12$dummy.hash.for.unknown.users.................';

const user: User = {
  id: 'ad1e0902-1928-4345-b513-60c86c94fc91',
  email: 'reviewer@simpleinvoice.dev',
  fullname: 'Demo Reviewer',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
};
const credentials: UserCredentials = {
  ...user,
  passwordHash: '$2b$12$stored.hash.of.the.real.password..............',
};

describe('AuthService', () => {
  const users = { findCredentialsByEmail: jest.fn(), findById: jest.fn() };
  const passwordHasher = { hash: jest.fn(), verify: jest.fn() };
  const loginAttempts = { registerAttempt: jest.fn(), registerSuccess: jest.fn() };
  const revokedTokens = { revoke: jest.fn(), isRevoked: jest.fn() };
  const accessTokens = { sign: jest.fn(), lifetimeSeconds: 3600 };
  let service: AuthService;

  beforeEach(async () => {
    jest.resetAllMocks();
    passwordHasher.hash.mockResolvedValue(DUMMY_HASH);
    loginAttempts.registerAttempt.mockResolvedValue(0);
    accessTokens.sign.mockResolvedValue('signed.jwt.token');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: users },
        { provide: PasswordHasher, useValue: passwordHasher },
        { provide: LoginAttemptLimiter, useValue: loginAttempts },
        { provide: RevokedTokenStore, useValue: revokedTokens },
        { provide: AccessTokenIssuer, useValue: accessTokens },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
    await service.onModuleInit();
  });

  describe('login', () => {
    it('returns a signed token and the user (without the hash) for valid credentials', async () => {
      users.findCredentialsByEmail.mockResolvedValue(credentials);
      passwordHasher.verify.mockResolvedValue(true);

      const result = await service.login('reviewer@simpleinvoice.dev', 'Reviewer@2026');

      expect(passwordHasher.verify).toHaveBeenCalledWith('Reviewer@2026', credentials.passwordHash);
      expect(accessTokens.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
        jti: expect.stringMatching(UUID_PATTERN) as string,
      });
      expect(result).toEqual({ accessToken: 'signed.jwt.token', expiresIn: 3600, user });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('gives every token its own id, so that logout can revoke exactly that token', async () => {
      users.findCredentialsByEmail.mockResolvedValue(credentials);
      passwordHasher.verify.mockResolvedValue(true);

      await service.login(user.email, 'Reviewer@2026');
      await service.login(user.email, 'Reviewer@2026');

      const [[first], [second]] = accessTokens.sign.mock.calls as [
        [{ jti: string }],
        [{ jti: string }],
      ];
      expect(first.jti).not.toBe(second.jti);
    });

    it('rejects a wrong password with the generic message', async () => {
      users.findCredentialsByEmail.mockResolvedValue(credentials);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(service.login(user.email, 'wrong')).rejects.toThrow(
        new UnauthenticatedError('Invalid email or password'),
      );
      expect(accessTokens.sign).not.toHaveBeenCalled();
    });

    it('runs one bcrypt comparison against a dummy hash for unknown e-mails', async () => {
      users.findCredentialsByEmail.mockResolvedValue(null);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(service.login('nobody@example.com', 'whatever')).rejects.toThrow(
        new UnauthenticatedError('Invalid email or password'),
      );
      // Same work as for a real account, so the response time does not reveal whether the e-mail exists.
      expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
      expect(passwordHasher.verify).toHaveBeenCalledWith('whatever', DUMMY_HASH);
    });

    it('never authenticates an unknown e-mail, even if the dummy comparison matched', async () => {
      users.findCredentialsByEmail.mockResolvedValue(null);
      passwordHasher.verify.mockResolvedValue(true);

      await expect(service.login('nobody@example.com', 'whatever')).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
    });
  });

  describe('per-account attempt limit', () => {
    it('refuses a locked account with 429 before any database lookup or bcrypt work', async () => {
      loginAttempts.registerAttempt.mockResolvedValue(840);

      const attempt = service.login(user.email, 'Reviewer@2026');

      await expect(attempt).rejects.toThrow(
        new RateLimitedError('Too many attempts, try again later', 840),
      );
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 840 });
      expect(users.findCredentialsByEmail).not.toHaveBeenCalled();
      expect(passwordHasher.verify).not.toHaveBeenCalled();
    });

    it('counts the attempt on the e-mail as typed, whether or not the account exists', async () => {
      users.findCredentialsByEmail.mockResolvedValue(null);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(service.login('nobody@example.com', 'guess')).rejects.toBeInstanceOf(
        UnauthenticatedError,
      );
      expect(loginAttempts.registerAttempt).toHaveBeenCalledWith('nobody@example.com');
      expect(loginAttempts.registerSuccess).not.toHaveBeenCalled();
    });

    it('keeps a wrong password counted', async () => {
      users.findCredentialsByEmail.mockResolvedValue(credentials);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(service.login(user.email, 'wrong')).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(loginAttempts.registerSuccess).not.toHaveBeenCalled();
    });

    it('clears the failed attempts after a successful login', async () => {
      users.findCredentialsByEmail.mockResolvedValue(credentials);
      passwordHasher.verify.mockResolvedValue(true);

      await service.login(user.email, 'Reviewer@2026');

      expect(loginAttempts.registerSuccess).toHaveBeenCalledWith(user.email);
    });
  });

  describe('logout', () => {
    it('revokes the token id until the token would have expired anyway', async () => {
      await service.logout({
        sub: user.id,
        email: user.email,
        jti: '6f1c7a52-8d0e-4f3b-9a2d-1c5e7b9d3f10',
        exp: 1_790_682_000,
      });

      expect(revokedTokens.revoke).toHaveBeenCalledWith(
        '6f1c7a52-8d0e-4f3b-9a2d-1c5e7b9d3f10',
        1_790_682_000,
      );
    });
  });

  describe('getProfile', () => {
    it('returns the current user', async () => {
      users.findById.mockResolvedValue(user);

      await expect(service.getProfile(user.id)).resolves.toEqual(user);
    });

    it('rejects a token whose user no longer exists', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.getProfile(user.id)).rejects.toBeInstanceOf(UnauthenticatedError);
    });
  });
});
