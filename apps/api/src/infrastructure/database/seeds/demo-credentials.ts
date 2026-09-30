import type { SeedEnvironment } from '../../../config/environment';

/**
 * The reviewer password published in README.md (the assessment asks for documented credentials). Anyone can read it,
 * so it must never protect a production deployment by accident.
 */
export const DOCUMENTED_DEMO_PASSWORD = 'Reviewer@2026';

type SeedPasswordPolicy = Pick<
  SeedEnvironment,
  'NODE_ENV' | 'SEED_ADMIN_PASSWORD' | 'SEED_ALLOW_DEMO_PASSWORD' | 'SEED_RESET_ADMIN_PASSWORD'
>;

/** Fails the seed, and with it the deployment, rather than provisioning a production admin with a public password. */
export function assertSeedPasswordAllowed(env: SeedPasswordPolicy): void {
  if (
    env.NODE_ENV === 'production' &&
    env.SEED_ADMIN_PASSWORD === DOCUMENTED_DEMO_PASSWORD &&
    !env.SEED_ALLOW_DEMO_PASSWORD
  ) {
    throw new Error(
      'Refusing to seed the publicly documented demo password with NODE_ENV=production: set a unique ' +
        'SEED_ADMIN_PASSWORD, or SEED_ALLOW_DEMO_PASSWORD=true for a local review stack.',
    );
  }
}

/**
 * Whether the seed overwrites the password of an existing admin account. Outside production it does, so the documented
 * credentials always work; in production a rotated password must survive restarts, so only on explicit request.
 */
export function shouldResetAdminPassword(env: SeedPasswordPolicy): boolean {
  return env.NODE_ENV !== 'production' || env.SEED_RESET_ADMIN_PASSWORD;
}
