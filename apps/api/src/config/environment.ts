import { applyDecorators } from '@nestjs/common';
import { plainToInstance, Transform, Type, type ClassConstructor } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsByteLength,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateBy,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { isIP } from 'node:net';

const NODE_ENVIRONMENTS = ['development', 'production', 'test'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** scheme://host[:port] — an origin, not a URL with a path or trailing slash. */
const ORIGIN_PATTERN = /^https?:\/\/[^/\s]+$/;

/** Express `trust proxy`: a hop count, or the addresses (IP, CIDR or proxy-addr keyword) of the trusted proxies. */
export type TrustProxy = number | string[];

const PROXY_ADDRESS_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** Keys that only a placeholder or a human-chosen phrase would contain. */
const PLACEHOLDER_SECRET_WORDS = ['changeme', 'secret', 'example', 'password'];
const MIN_DISTINCT_SECRET_CHARACTERS = 10;

/**
 * bcrypt work factor (log2 of the rounds): 4 is bcrypt's minimum, only fit for tests, and 10 OWASP's minimum for real
 * passwords; from 16 on, a single login takes seconds.
 */
const MIN_BCRYPT_COST = 4;
const MAX_BCRYPT_COST = 15;
const MIN_PRODUCTION_BCRYPT_COST = 10;

/**
 * Environment variables are strings: only the literals "true"/"false" become booleans. Anything else is passed through
 * so @IsBoolean rejects it (Boolean("false") === true is the classic trap this avoids).
 */
const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' ? true : normalized === 'false' ? false : value;
  });

/** Comma-separated list, blanks removed ("" means an empty list). */
const ToList = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : value,
  );

/**
 * "" → 0 (trust nobody), digits → a hop count, anything else → a list of proxy addresses. Digits must become a number:
 * Express reads the string "1" as the IP address 0.0.0.1 and would silently trust nobody. Blank list entries are kept
 * so that the validator rejects them instead of a typo quietly shrinking the list.
 */
const ToTrustProxy = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      return 0;
    }
    return /^\d+$/.test(trimmed)
      ? Number(trimmed)
      : trimmed.split(',').map((entry) => entry.trim());
  });

function isTrustProxy(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0;
  }
  return Array.isArray(value) && value.length > 0 && value.every(isProxyAddress);
}

/** An IPv4/IPv6 address with an optional /prefix, or a proxy-addr keyword such as "loopback". */
function isProxyAddress(entry: unknown): boolean {
  if (typeof entry !== 'string') {
    return false;
  }
  if (PROXY_ADDRESS_KEYWORDS.has(entry)) {
    return true;
  }
  const [address, prefix, ...rest] = entry.split('/');
  const version = isIP(address);
  if (version === 0 || rest.length > 0) {
    return false;
  }
  return (
    prefix === undefined ||
    (/^\d{1,3}$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128))
  );
}

const IsTrustProxy = () =>
  ValidateBy({
    name: 'isTrustProxy',
    validator: {
      validate: isTrustProxy,
      defaultMessage: () =>
        'TRUST_PROXY must be a hop count (0 = trust no proxy) or a comma-separated list of proxy IP addresses or CIDRs',
    },
  });

/** Length alone lets "a" × 32 or a memorable phrase through; a generated key has neither problem. */
function isGeneratedLookingSecret(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const lowerCased = value.toLowerCase();
  return (
    new Set(value).size >= MIN_DISTINCT_SECRET_CHARACTERS &&
    !PLACEHOLDER_SECRET_WORDS.some((word) => lowerCased.includes(word))
  );
}

// The message never includes the value: boot errors end up in logs.
const IsGeneratedLookingSecret = () =>
  ValidateBy({
    name: 'isGeneratedLookingSecret',
    validator: {
      validate: isGeneratedLookingSecret,
      defaultMessage: () =>
        'JWT_SECRET looks like a placeholder or a chosen phrase; generate one with: openssl rand -hex 32',
    },
  });

/**
 * BCRYPT_COST, read by the API (the login "dummy" hash) and by the seed (the stored admin hash). Both must use the same
 * value: login time would otherwise reveal whether an e-mail address exists. Each step doubles the time per hash.
 */
const IsBcryptCost = () =>
  applyDecorators(
    Type(() => Number),
    IsInt(),
    Min(MIN_BCRYPT_COST),
    Max(MAX_BCRYPT_COST),
    ValidateBy({
      name: 'isProductionBcryptCost',
      validator: {
        validate: (value: unknown, args) =>
          (args?.object as { NODE_ENV?: unknown }).NODE_ENV !== 'production' ||
          (typeof value === 'number' && value >= MIN_PRODUCTION_BCRYPT_COST),
        defaultMessage: () =>
          `BCRYPT_COST must be at least ${MIN_PRODUCTION_BCRYPT_COST} when NODE_ENV=production`,
      },
    }),
  );

/** Variables every database client needs: the API, the TypeORM CLI and the seed script. */
export class DatabaseEnvironment {
  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  DB_PORT = 5432;

  @IsString()
  @IsNotEmpty()
  DB_USER: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;

  @ToBoolean()
  @IsBoolean()
  DB_SSL = false;

  /**
   * Schema owner, used instead of DB_USER by the TypeORM CLI and the seed when set (see withMigrationCredentials).
   * The API itself only ever connects as DB_USER, a role that may read and write rows but not change the schema.
   */
  @ValidateIf((env: DatabaseEnvironment) => env.DB_MIGRATION_USER !== undefined)
  @IsString()
  @IsNotEmpty()
  DB_MIGRATION_USER?: string;

  @ValidateIf((env: DatabaseEnvironment) => env.DB_MIGRATION_USER !== undefined)
  @IsString({ message: 'DB_MIGRATION_PASSWORD is required when DB_MIGRATION_USER is set' })
  @IsNotEmpty()
  DB_MIGRATION_PASSWORD?: string;
}

/** Credentials for migrations and the seed: the schema owner when configured, otherwise DB_USER. */
export function withMigrationCredentials<T extends DatabaseEnvironment>(env: T): T {
  const { DB_MIGRATION_USER: user, DB_MIGRATION_PASSWORD: password } = env;
  return user && password ? { ...env, DB_USER: user, DB_PASSWORD: password } : env;
}

/** Full API configuration, validated once at boot: the process refuses to start on invalid values. */
export class AppEnvironment extends DatabaseEnvironment {
  @IsIn(NODE_ENVIRONMENTS)
  NODE_ENV: NodeEnvironment = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 4000;

  // HS256 is only as strong as its key: 32 characters is the floor (init-env.sh generates 64 hex chars).
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters long' })
  @IsGeneratedLookingSecret()
  JWT_SECRET: string;

  /** Access-token lifetime in seconds. There is no refresh token, so it is capped at one day. */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86_400)
  JWT_EXPIRES_IN = 3600;

  @IsString()
  @IsNotEmpty()
  JWT_ISSUER = 'simple-invoice-api';

  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE = 'simple-invoice-web';

  @ToBoolean()
  @IsBoolean()
  COOKIE_SECURE = false;

  /**
   * Browser origins allowed to call the API with credentials. Empty (the default) disables CORS altogether: the SPA
   * is same-origin behind nginx and the Vite proxy, and every allowlisted origin could read invoices with the cookie.
   */
  @ToList()
  @IsArray()
  @Matches(ORIGIN_PATTERN, {
    each: true,
    message: 'CORS_ORIGINS must be a comma-separated list of origins such as http://localhost:5173',
  })
  CORS_ORIGINS: string[] = [];

  /**
   * Which peers may set the client IP (the rate-limiting key) through X-Forwarded-For: the reverse proxy's address
   * (compose: the nginx container), or a hop count. 0 = use the socket address; trusting a header that nobody
   * sanitises would let every client pick its own IP, i.e. its own rate-limit bucket.
   */
  @ToTrustProxy()
  @IsTrustProxy()
  TRUST_PROXY: TrustProxy = 0;

  /** IANA time zone that defines "today" for the Overdue rule. */
  @IsTimeZone()
  APP_TIMEZONE = 'UTC';

  /** Default: NODE_ENV !== 'production' (see validateAppEnvironment). */
  @ToBoolean()
  @IsBoolean()
  SWAGGER_ENABLED: boolean;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  /** Per client IP on POST /auth/login. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LOGIN_LIMIT = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LOGIN_TTL_SECONDS = 60;

  /** Per account, whatever the client IP: failed logins allowed in a window before the account answers 429. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  LOGIN_MAX_FAILED_ATTEMPTS = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  LOGIN_FAILURE_WINDOW_SECONDS = 900;

  /** 12 takes about 250 ms per hash: offline cracking of a leaked hash stays expensive, a login stays fast enough. */
  @IsBcryptCost()
  BCRYPT_COST = 12;
}

/** Variables used by `npm run seed`. */
export class SeedEnvironment extends DatabaseEnvironment {
  @IsIn(NODE_ENVIRONMENTS)
  NODE_ENV: NodeEnvironment = 'development';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  SEED_ADMIN_EMAIL = 'reviewer@simpleinvoice.dev';

  // bcrypt ignores everything after 72 bytes, so a longer demo password would silently be truncated.
  @IsString({ message: 'SEED_ADMIN_PASSWORD is required to seed the admin user' })
  @IsByteLength(8, 72, { message: 'SEED_ADMIN_PASSWORD must be between 8 and 72 bytes long' })
  SEED_ADMIN_PASSWORD: string;

  /** Lets NODE_ENV=production seed the publicly documented demo password: a local review stack only. */
  @ToBoolean()
  @IsBoolean()
  SEED_ALLOW_DEMO_PASSWORD = false;

  /** With NODE_ENV=production, an existing admin keeps its (possibly rotated) password unless this is true. */
  @ToBoolean()
  @IsBoolean()
  SEED_RESET_ADMIN_PASSWORD = false;

  @IsTimeZone()
  APP_TIMEZONE = 'UTC';

  @IsBcryptCost()
  BCRYPT_COST = 12;
}

/** Parses raw environment variables into `schema`, or throws one error listing every problem. */
export function validateEnvironment<T extends object>(
  schema: ClassConstructor<T>,
  raw: Record<string, unknown>,
): T {
  const environment = plainToInstance(schema, raw);
  const errors = validateSync(environment);
  if (errors.length > 0) {
    const problems = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
  return environment;
}

export function validateAppEnvironment(raw: Record<string, unknown>): AppEnvironment {
  return validateEnvironment(AppEnvironment, {
    ...raw,
    // The OpenAPI document maps the whole API surface: on by default, but a production deployment opts in explicitly.
    SWAGGER_ENABLED: raw.SWAGGER_ENABLED ?? raw.NODE_ENV !== 'production',
  });
}
