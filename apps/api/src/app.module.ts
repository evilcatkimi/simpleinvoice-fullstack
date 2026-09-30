import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ENV_FILE_PATHS, shouldLoadEnvFiles } from './config/env-files';
import { validateAppEnvironment, type AppEnvironment } from './config/environment';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/infrastructure/jwt-auth.guard';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { HealthModule } from './modules/health/health.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { UsersModule } from './modules/users/users.module';
import { ClockModule } from './shared/clock/clock.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { buildLoggerOptions } from './shared/logging/logger-options';
import { RetryAfterThrottlerGuard } from './shared/throttling/retry-after-throttler.guard';
import { buildThrottlerOptions } from './shared/throttling/throttling';
import { createValidationPipe } from './shared/validation/validation-pipe';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ENV_FILE_PATHS,
      ignoreEnvFile: !shouldLoadEnvFiles(),
      validate: validateAppEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildLoggerOptions,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) =>
        buildThrottlerOptions({
          limit: config.get('THROTTLE_LOGIN_LIMIT', { infer: true }),
          ttlSeconds: config.get('THROTTLE_LOGIN_TTL_SECONDS', { infer: true }),
        }),
    }),
    DatabaseModule,
    ClockModule,
    UsersModule,
    AuthModule,
    InvoicesModule,
    CurrenciesModule,
    HealthModule,
  ],
  providers: [
    // Global enhancers are registered here (not in main.ts) so they are part of the DI graph and are active in
    // e2e tests exactly as in production.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    // Order matters: throttling runs first so floods are rejected before any token verification work.
    { provide: APP_GUARD, useClass: RetryAfterThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
})
export class AppModule {}
