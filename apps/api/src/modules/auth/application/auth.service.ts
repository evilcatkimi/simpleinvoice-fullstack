import { Injectable, type OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { RateLimitedError, UnauthenticatedError } from '../../../shared/errors/application-errors';
import { UserRepository } from '../../users/application/user.repository';
import type { User } from '../../users/domain/user';
import type { AccessTokenClaims, VerifiedAccessToken } from './access-token';
import { AccessTokenIssuer } from './access-token-issuer';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { PasswordHasher } from './password-hasher';
import { RevokedTokenStore } from './revoked-token-store';

/** Same message for "no such user" and "wrong password": the response must not reveal which e-mails exist. */
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many attempts, try again later';

export interface LoginResult {
  accessToken: string;
  /** Token lifetime in seconds. */
  expiresIn: number;
  user: User;
}

@Injectable()
export class AuthService implements OnModuleInit {
  /** Hash of a random secret nobody knows, compared against when the e-mail is unknown. */
  private dummyPasswordHash: string;

  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly loginAttempts: LoginAttemptLimiter,
    private readonly revokedTokens: RevokedTokenStore,
    private readonly accessTokens: AccessTokenIssuer,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.passwordHasher.hash(randomBytes(32).toString('hex'));
  }

  async login(email: string, password: string): Promise<LoginResult> {
    // Before any database or bcrypt work, and the same for unknown e-mails: a locked answer reveals nothing either.
    const retryAfterSeconds = await this.loginAttempts.registerAttempt(email);
    if (retryAfterSeconds > 0) {
      throw new RateLimitedError(TOO_MANY_ATTEMPTS_MESSAGE, retryAfterSeconds);
    }

    const credentials = await this.users.findCredentialsByEmail(email);
    // Exactly one bcrypt comparison runs whether or not the user exists, so response timing does not leak which
    // e-mail addresses are registered (user enumeration).
    const passwordMatches = await this.passwordHasher.verify(
      password,
      credentials?.passwordHash ?? this.dummyPasswordHash,
    );
    if (!credentials || !passwordMatches) {
      throw new UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE);
    }
    await this.loginAttempts.registerSuccess(email);

    const { passwordHash: _passwordHash, ...user } = credentials;
    const claims: AccessTokenClaims = { sub: user.id, email: user.email, jti: randomUUID() };
    return {
      accessToken: await this.accessTokens.sign(claims),
      expiresIn: this.accessTokens.lifetimeSeconds,
      user,
    };
  }

  /** The token stays unusable until it would have expired anyway. */
  async logout(token: VerifiedAccessToken): Promise<void> {
    await this.revokedTokens.revoke(token.jti, token.exp);
  }

  /** The token may outlive the account: always confirm the user still exists. */
  async getProfile(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthenticatedError('User no longer exists');
    }
    return user;
  }
}
