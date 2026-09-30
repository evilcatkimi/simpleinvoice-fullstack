import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import {
  DatabaseEnvironment,
  validateAppEnvironment,
  validateEnvironment,
  withMigrationCredentials,
  type AppEnvironment,
} from '../../src/config/environment';
import {
  ADMIN_USER_ID,
  insertInvoices,
  upsertAdminUser,
} from '../../src/infrastructure/database/seeds/seed';
import type { SeedInvoice } from '../../src/infrastructure/database/seeds/seed-invoice';
import { buildDataSourceOptions } from '../../src/infrastructure/database/typeorm-options';
import { PasswordHasher } from '../../src/modules/auth/application/password-hasher';
import type { LoginResponseDto } from '../../src/modules/auth/presentation/dto/auth-response.dto';
import { Clock } from '../../src/shared/clock/clock';
import { TEST_ADMIN } from '../setup/test-environment';

/** Frozen "today" so Overdue derivation is deterministic. */
export const TODAY = '2026-07-15';

/**
 * Name of the test app's second connection, as the schema owner: the API's own role may only SELECT and INSERT, so
 * the fixtures (TRUNCATE, the admin upsert) are written the way the seed writes them in production.
 */
const FIXTURES_CONNECTION = 'fixtures';

class FixedClock extends Clock {
  constructor(private readonly date: string) {
    super();
  }

  today(): string {
    return this.date;
  }
}

export interface TestAppOptions {
  /**
   * Configuration values for this app only (e.g. COOKIE_SECURE, TRUST_PROXY), on top of the validated test
   * environment. They reach every consumer — module factories, guards and configureApp — like real variables would.
   */
  env?: Partial<AppEnvironment>;
  /** Further provider overrides (e.g. the throttler limits). */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/**
 * Boots the real AppModule, connected as the API's runtime role, with the same HTTP setup as main.ts. Only the clock
 * is replaced by default; the fixtures connection is added alongside and closed with the app.
 */
export async function createTestApp({
  env,
  customize = (builder) => builder,
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  const owner = withMigrationCredentials(validateEnvironment(DatabaseEnvironment, process.env));
  let builder = Test.createTestingModule({
    imports: [
      AppModule,
      TypeOrmModule.forRoot({ ...buildDataSourceOptions(owner), name: FIXTURES_CONNECTION }),
    ],
  })
    .overrideProvider(Clock)
    .useValue(new FixedClock(TODAY));
  if (env) {
    const values = { ...validateAppEnvironment(process.env), ...env };
    builder = builder
      .overrideProvider(ConfigService)
      .useValue({ get: (key: keyof AppEnvironment) => values[key] });
  }
  const moduleRef = await customize(builder).compile();
  // bodyParser: false as in main.ts: configureApp registers the JSON parser, and nothing else.
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  return app;
}

export function http(app: NestExpressApplication) {
  return request(app.getHttpServer());
}

function fixtures(app: NestExpressApplication): DataSource {
  return app.get<DataSource>(getDataSourceToken(FIXTURES_CONNECTION));
}

/** No users, no invoices: every token issued before now belongs to a deleted account. */
export async function clearDatabase(app: NestExpressApplication): Promise<void> {
  await fixtures(app).query('TRUNCATE invoice_items, invoices, users RESTART IDENTITY CASCADE');
}

/** Every suite starts from empty tables plus the reviewer account, hashed like the API hashes (BCRYPT_COST). */
export async function resetDatabase(app: NestExpressApplication): Promise<void> {
  await clearDatabase(app);
  await upsertAdminUser(fixtures(app).manager, app.get(PasswordHasher), TEST_ADMIN, {
    resetPassword: true,
  });
}

export async function seedInvoices(
  app: NestExpressApplication,
  invoices: SeedInvoice[],
): Promise<void> {
  await insertInvoices(fixtures(app).manager, invoices, ADMIN_USER_ID);
}

export interface Session {
  accessToken: string;
  /** `<cookie name>=<jwt>`, ready for a Cookie header. */
  cookie: string;
  bearer: { Authorization: string };
}

export async function login(app: NestExpressApplication): Promise<Session> {
  const response = await http(app).post('/auth/login').send(TEST_ADMIN).expect(200);
  const { accessToken } = response.body as LoginResponseDto;
  const [cookie] = response.get('Set-Cookie') ?? [];
  return {
    accessToken,
    cookie: cookie.split(';')[0],
    bearer: { Authorization: `Bearer ${accessToken}` },
  };
}
