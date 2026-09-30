import {
  AppEnvironment,
  DatabaseEnvironment,
  SeedEnvironment,
  validateAppEnvironment,
  validateEnvironment,
  withMigrationCredentials,
} from './environment';

/** 32 characters shaped like `openssl rand -hex 16` output. */
const GENERATED_SECRET = '3f9a1c7e5b2d8f4a6c0e9b1d7a3f5c8e';

const required = {
  DB_HOST: 'localhost',
  DB_USER: 'simple_invoice',
  DB_PASSWORD: 'secret',
  DB_NAME: 'simple_invoice',
  JWT_SECRET: GENERATED_SECRET,
};

describe('environment validation', () => {
  it('applies the documented defaults', () => {
    expect(validateAppEnvironment(required)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      DB_PORT: 5432,
      DB_SSL: false,
      JWT_EXPIRES_IN: 3600,
      JWT_ISSUER: 'simple-invoice-api',
      JWT_AUDIENCE: 'simple-invoice-web',
      COOKIE_SECURE: false,
      CORS_ORIGINS: [],
      TRUST_PROXY: 0,
      APP_TIMEZONE: 'UTC',
      SWAGGER_ENABLED: true,
      LOG_LEVEL: 'info',
      THROTTLE_LOGIN_LIMIT: 5,
      THROTTLE_LOGIN_TTL_SECONDS: 60,
      LOGIN_MAX_FAILED_ATTEMPTS: 10,
      LOGIN_FAILURE_WINDOW_SECONDS: 900,
      BCRYPT_COST: 12,
    });
  });

  it('parses numbers, booleans and lists from their string form', () => {
    const env = validateAppEnvironment({
      ...required,
      PORT: '8080',
      DB_PORT: '5434',
      COOKIE_SECURE: 'true',
      SWAGGER_ENABLED: 'FALSE',
      TRUST_PROXY: '1',
      CORS_ORIGINS: ' https://invoices.example.com, http://localhost:5173 ,',
    });

    expect(env).toBeInstanceOf(AppEnvironment);
    expect(env).toMatchObject({
      PORT: 8080,
      DB_PORT: 5434,
      COOKIE_SECURE: true,
      SWAGGER_ENABLED: false,
      TRUST_PROXY: 1,
      CORS_ORIGINS: ['https://invoices.example.com', 'http://localhost:5173'],
    });
  });

  it.each([
    [{ JWT_SECRET: 'too-short' }, 'JWT_SECRET must be at least 32 characters long'],
    [{ JWT_SECRET: 'x'.repeat(31) }, 'JWT_SECRET must be at least 32 characters long'],
    [{ JWT_SECRET: undefined }, 'JWT_SECRET must be at least 32 characters long'],
    [{ DB_HOST: undefined }, 'DB_HOST should not be empty'],
    [{ DB_PASSWORD: '' }, 'DB_PASSWORD should not be empty'],
    [{ APP_TIMEZONE: 'Mars/Olympus_Mons' }, 'APP_TIMEZONE must be a valid IANA time-zone'],
    [{ COOKIE_SECURE: 'yes' }, 'COOKIE_SECURE must be a boolean value'],
    [{ COOKIE_SECURE: '1' }, 'COOKIE_SECURE must be a boolean value'],
    [{ DB_SSL: 'on' }, 'DB_SSL must be a boolean value'],
    [{ JWT_EXPIRES_IN: '10' }, 'JWT_EXPIRES_IN must not be less than 60'],
    [{ JWT_EXPIRES_IN: '86401' }, 'JWT_EXPIRES_IN must not be greater than 86400'],
    [{ JWT_EXPIRES_IN: '3600.5' }, 'JWT_EXPIRES_IN must be an integer number'],
    [{ PORT: 'abc' }, 'PORT must be an integer number'],
    [{ PORT: '0' }, 'PORT must not be less than 1'],
    [{ PORT: '65536' }, 'PORT must not be greater than 65535'],
    [{ DB_PORT: '70000' }, 'DB_PORT must not be greater than 65535'],
    [{ THROTTLE_LOGIN_LIMIT: '0' }, 'THROTTLE_LOGIN_LIMIT must not be less than 1'],
    [{ THROTTLE_LOGIN_TTL_SECONDS: '0' }, 'THROTTLE_LOGIN_TTL_SECONDS must not be less than 1'],
    [{ LOGIN_MAX_FAILED_ATTEMPTS: '0' }, 'LOGIN_MAX_FAILED_ATTEMPTS must not be less than 1'],
    [{ LOGIN_MAX_FAILED_ATTEMPTS: 'ten' }, 'LOGIN_MAX_FAILED_ATTEMPTS must be an integer number'],
    [{ LOGIN_FAILURE_WINDOW_SECONDS: '0' }, 'LOGIN_FAILURE_WINDOW_SECONDS must not be less than 1'],
    [{ BCRYPT_COST: '3' }, 'BCRYPT_COST must not be less than 4'],
    [{ BCRYPT_COST: '16' }, 'BCRYPT_COST must not be greater than 15'],
    [{ BCRYPT_COST: '12.5' }, 'BCRYPT_COST must be an integer number'],
    [{ NODE_ENV: 'production', BCRYPT_COST: '9' }, 'BCRYPT_COST must be at least 10 when NODE_ENV'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV must be one of the following values'],
    [{ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL must be one of the following values'],
    [{ CORS_ORIGINS: 'http://localhost:5173/app' }, 'CORS_ORIGINS must be a comma-separated list'],
    [{ CORS_ORIGINS: 'http://localhost:5173/' }, 'CORS_ORIGINS must be a comma-separated list'],
    // A wildcard would let any site make credentialed requests with the auth cookie.
    [{ CORS_ORIGINS: '*' }, 'CORS_ORIGINS must be a comma-separated list'],
  ])('refuses to start with %p', (override, message) => {
    expect(() => validateAppEnvironment({ ...required, ...override })).toThrow(message);
  });

  it('accepts the boundary values: a 32-character secret, a 1-day token and port 65535', () => {
    expect(
      validateAppEnvironment({
        ...required,
        JWT_SECRET: GENERATED_SECRET,
        JWT_EXPIRES_IN: '86400',
        PORT: '65535',
      }),
    ).toMatchObject({ JWT_SECRET: GENERATED_SECRET, JWT_EXPIRES_IN: 86_400, PORT: 65_535 });
  });

  describe('BCRYPT_COST', () => {
    it.each([
      ['test', '4', 4],
      ['development', '4', 4],
      ['production', '10', 10],
      ['production', '15', 15],
    ])('NODE_ENV=%s accepts %s: the low costs only exist for test runs', (nodeEnv, raw, cost) => {
      expect(
        validateAppEnvironment({ ...required, NODE_ENV: nodeEnv, BCRYPT_COST: raw }).BCRYPT_COST,
      ).toBe(cost);
    });

    it('applies the same rule to the seed, which hashes the stored password the API compares with', () => {
      const seed = (env: Record<string, string>) =>
        validateEnvironment(SeedEnvironment, {
          ...required,
          SEED_ADMIN_PASSWORD: 'Reviewer@2026',
          ...env,
        });

      expect(seed({}).BCRYPT_COST).toBe(12);
      expect(seed({ BCRYPT_COST: '4' }).BCRYPT_COST).toBe(4);
      expect(() => seed({ NODE_ENV: 'production', BCRYPT_COST: '4' })).toThrow(
        'BCRYPT_COST must be at least 10 when NODE_ENV=production',
      );
    });
  });

  describe('JWT_SECRET', () => {
    const OPENSSL_HINT = 'generate one with: openssl rand -hex 32';

    it.each([
      ['one repeated character', 'k'.repeat(32)],
      ['fewer than 10 distinct characters', 'abcabcabc1abcabcabc2abcabcabc3ab'],
      ['a placeholder', 'please-changeme-before-deploying-0123'],
      ['the word "secret"', 'my-super-Secret-signing-key-2026-xyz'],
      ['the word "example"', 'Example-jwt-key-4f8a2c9d1e7b3a6f0c5d'],
      ['the word "password"', 'PASSWORD-for-the-simple-invoice-api1'],
    ])('refuses a key made of %s, and says how to generate one', (_kind, secret) => {
      expect(() => validateAppEnvironment({ ...required, JWT_SECRET: secret })).toThrow(
        OPENSSL_HINT,
      );
    });

    it('accepts what init-env.sh generates (openssl rand -hex 32)', () => {
      const generated = 'b41c9e07d3f85a26e1c04b9f7d2a638e5f0c1b8a9d47e2f36c05a1d8e9b7f423';

      expect(validateAppEnvironment({ ...required, JWT_SECRET: generated }).JWT_SECRET).toBe(
        generated,
      );
    });
  });

  describe('TRUST_PROXY', () => {
    it.each([
      ['', 0],
      ['0', 0],
      ['1', 1],
      [' 2 ', 2],
      ['10.203.47.10', ['10.203.47.10']],
      ['10.203.47.0/24, ::1', ['10.203.47.0/24', '::1']],
      ['loopback,uniquelocal', ['loopback', 'uniquelocal']],
      ['fd00::/8', ['fd00::/8']],
    ])('reads %p as the Express trust-proxy value %p', (raw, expected) => {
      expect(validateAppEnvironment({ ...required, TRUST_PROXY: raw }).TRUST_PROXY).toEqual(
        expected,
      );
    });

    it('turns a digits-only value into a number: Express would read the string "1" as the IP 0.0.0.1', () => {
      expect(typeof validateAppEnvironment({ ...required, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(
        'number',
      );
    });

    it.each([
      '-1',
      '1.5',
      'abc',
      '10.203.47',
      '10.203.47.0/33',
      '::1/129',
      '10.0.0.1/8/1',
      ',',
      '10.0.0.1,',
    ])('refuses to start with TRUST_PROXY=%p', (raw) => {
      expect(() => validateAppEnvironment({ ...required, TRUST_PROXY: raw })).toThrow(
        'TRUST_PROXY must be a hop count (0 = trust no proxy) or a comma-separated list of proxy IP addresses or CIDRs',
      );
    });
  });

  describe('SWAGGER_ENABLED', () => {
    it.each([
      ['development', true],
      ['test', true],
      ['production', false],
    ])(
      'defaults to %p → %p: production publishes the API map only on purpose',
      (nodeEnv, enabled) => {
        expect(validateAppEnvironment({ ...required, NODE_ENV: nodeEnv }).SWAGGER_ENABLED).toBe(
          enabled,
        );
      },
    );

    it('can be enabled explicitly in production (the review stack does)', () => {
      expect(
        validateAppEnvironment({ ...required, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })
          .SWAGGER_ENABLED,
      ).toBe(true);
    });
  });

  it.each([
    ['true', true],
    [' TRUE ', true],
    ['false', false],
    ['False', false],
  ])('reads the boolean %p as %p (never Boolean("false") === true)', (raw, expected) => {
    expect(
      validateAppEnvironment({
        ...required,
        DB_SSL: raw,
        COOKIE_SECURE: raw,
        SWAGGER_ENABLED: raw,
      }),
    ).toMatchObject({ DB_SSL: expected, COOKIE_SECURE: expected, SWAGGER_ENABLED: expected });
  });

  it.each(['Asia/Ho_Chi_Minh', 'America/Los_Angeles', 'Australia/Sydney'])(
    'accepts the IANA time zone %s',
    (timeZone) => {
      expect(validateAppEnvironment({ ...required, APP_TIMEZONE: timeZone }).APP_TIMEZONE).toBe(
        timeZone,
      );
    },
  );

  it('allows no cross-origin browser callers when CORS_ORIGINS is empty', () => {
    expect(validateAppEnvironment({ ...required, CORS_ORIGINS: '' }).CORS_ORIGINS).toEqual([]);
  });

  it('never echoes the rejected secret in the error (boot errors end up in logs)', () => {
    let message = '';
    try {
      validateAppEnvironment({ ...required, JWT_SECRET: 'hunter2-leaked-secret' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('JWT_SECRET');
    expect(message).not.toContain('hunter2');
  });

  it('reports every problem at once', () => {
    const validateEmpty = () => validateAppEnvironment({});

    for (const variable of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET']) {
      expect(validateEmpty).toThrow(`- ${variable} `);
    }
  });

  describe('schema-owner credentials for migrations and the seed', () => {
    it('requires a password as soon as DB_MIGRATION_USER is set', () => {
      expect(() =>
        validateEnvironment(DatabaseEnvironment, { ...required, DB_MIGRATION_USER: 'owner' }),
      ).toThrow('DB_MIGRATION_PASSWORD is required when DB_MIGRATION_USER is set');
      expect(() =>
        validateEnvironment(DatabaseEnvironment, {
          ...required,
          DB_MIGRATION_USER: 'owner',
          DB_MIGRATION_PASSWORD: '',
        }),
      ).toThrow('DB_MIGRATION_PASSWORD should not be empty');
    });

    it('uses the schema owner instead of DB_USER when configured', () => {
      const env = validateEnvironment(DatabaseEnvironment, {
        ...required,
        DB_MIGRATION_USER: 'simple_invoice_owner',
        DB_MIGRATION_PASSWORD: 'owner-password',
      });

      expect(withMigrationCredentials(env)).toMatchObject({
        DB_USER: 'simple_invoice_owner',
        DB_PASSWORD: 'owner-password',
        DB_NAME: 'simple_invoice',
      });
      // The validated environment itself still holds the runtime role.
      expect(env.DB_USER).toBe('simple_invoice');
    });

    it('falls back to DB_USER when no schema owner is configured (a single-role local database)', () => {
      const env = validateEnvironment(DatabaseEnvironment, required);

      expect(withMigrationCredentials(env)).toBe(env);
    });
  });

  it('lets database tooling run without the API secrets', () => {
    expect(
      validateEnvironment(DatabaseEnvironment, { ...required, JWT_SECRET: undefined }),
    ).toMatchObject({
      DB_HOST: 'localhost',
      DB_PORT: 5432,
    });
  });

  it('requires a seed admin password between 8 and 72 bytes', () => {
    expect(() => validateEnvironment(SeedEnvironment, required)).toThrow(
      'SEED_ADMIN_PASSWORD is required to seed the admin user',
    );
    expect(() =>
      validateEnvironment(SeedEnvironment, { ...required, SEED_ADMIN_PASSWORD: 'é'.repeat(37) }),
    ).toThrow('SEED_ADMIN_PASSWORD must be between 8 and 72 bytes long');
    expect(
      validateEnvironment(SeedEnvironment, {
        ...required,
        SEED_ADMIN_EMAIL: ' Reviewer@SimpleInvoice.dev ',
        SEED_ADMIN_PASSWORD: 'Reviewer@2026',
      }),
    ).toMatchObject({ SEED_ADMIN_EMAIL: 'reviewer@simpleinvoice.dev' });
  });

  it('measures the seed password in bytes: 72 are accepted, 73 and 7 are not', () => {
    const seed = (password: string) =>
      validateEnvironment(SeedEnvironment, { ...required, SEED_ADMIN_PASSWORD: password });

    expect(seed('p'.repeat(72)).SEED_ADMIN_PASSWORD).toHaveLength(72);
    expect(() => seed('p'.repeat(73))).toThrow('between 8 and 72 bytes');
    expect(() => seed('p'.repeat(7))).toThrow('between 8 and 72 bytes');
  });

  it('reads the seed password policy flags, which default to the safe value', () => {
    const seed = (env: Record<string, string>) =>
      validateEnvironment(SeedEnvironment, {
        ...required,
        SEED_ADMIN_PASSWORD: 'Reviewer@2026',
        ...env,
      });

    expect(seed({})).toMatchObject({
      NODE_ENV: 'development',
      SEED_ALLOW_DEMO_PASSWORD: false,
      SEED_RESET_ADMIN_PASSWORD: false,
    });
    expect(
      seed({
        NODE_ENV: 'production',
        SEED_ALLOW_DEMO_PASSWORD: 'true',
        SEED_RESET_ADMIN_PASSWORD: 'TRUE',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      SEED_ALLOW_DEMO_PASSWORD: true,
      SEED_RESET_ADMIN_PASSWORD: true,
    });
    expect(() => seed({ SEED_ALLOW_DEMO_PASSWORD: 'yes' })).toThrow(
      'SEED_ALLOW_DEMO_PASSWORD must be a boolean value',
    );
  });

  it('requires a valid seed admin e-mail', () => {
    expect(() =>
      validateEnvironment(SeedEnvironment, {
        ...required,
        SEED_ADMIN_EMAIL: 'reviewer-at-example',
        SEED_ADMIN_PASSWORD: 'Reviewer@2026',
      }),
    ).toThrow('SEED_ADMIN_EMAIL must be an email');
  });
});
