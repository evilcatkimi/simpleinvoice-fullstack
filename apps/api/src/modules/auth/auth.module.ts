import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { AppEnvironment } from '../../config/environment';
import { UsersModule } from '../users/users.module';
import { AccessTokenIssuer } from './application/access-token-issuer';
import { AuthService } from './application/auth.service';
import { LoginAttemptLimiter } from './application/login-attempt-limiter';
import { PasswordHasher } from './application/password-hasher';
import { RevokedTokenStore } from './application/revoked-token-store';
import { AccessTokenCookie } from './infrastructure/access-token-cookie';
import { AccessTokenVerifier } from './infrastructure/access-token-verifier';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { InMemoryLoginAttemptLimiter } from './infrastructure/in-memory-login-attempt-limiter';
import { InMemoryRevokedTokenStore } from './infrastructure/in-memory-revoked-token-store';
import { JwtAccessTokenIssuer } from './infrastructure/jwt-access-token-issuer';
import { buildJwtOptions } from './infrastructure/jwt-options';
import { JwtAuthGuard } from './infrastructure/jwt-auth.guard';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) =>
        buildJwtOptions({
          secret: config.get('JWT_SECRET', { infer: true }),
          expiresIn: config.get('JWT_EXPIRES_IN', { infer: true }),
          issuer: config.get('JWT_ISSUER', { infer: true }),
          audience: config.get('JWT_AUDIENCE', { infer: true }),
        }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenCookie,
    AccessTokenVerifier,
    JwtAuthGuard,
    { provide: AccessTokenIssuer, useClass: JwtAccessTokenIssuer },
    {
      provide: PasswordHasher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) =>
        new BcryptPasswordHasher(config.get('BCRYPT_COST', { infer: true })),
    },
    { provide: RevokedTokenStore, useClass: InMemoryRevokedTokenStore },
    {
      provide: LoginAttemptLimiter,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) =>
        new InMemoryLoginAttemptLimiter({
          maxFailedAttempts: config.get('LOGIN_MAX_FAILED_ATTEMPTS', { infer: true }),
          windowSeconds: config.get('LOGIN_FAILURE_WINDOW_SECONDS', { infer: true }),
        }),
    },
  ],
  // JwtAuthGuard is registered as a global guard by AppModule, which controls the order of global guards; configureApp
  // names the cookie in the OpenAPI document.
  exports: [JwtAuthGuard, AccessTokenCookie],
})
export class AuthModule {}
