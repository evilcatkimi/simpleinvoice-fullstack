import type { NodeEnvironment } from '../../../config/environment';
import {
  assertSeedPasswordAllowed,
  DOCUMENTED_DEMO_PASSWORD,
  shouldResetAdminPassword,
} from './demo-credentials';

function policy(overrides: {
  NODE_ENV?: NodeEnvironment;
  SEED_ADMIN_PASSWORD?: string;
  SEED_ALLOW_DEMO_PASSWORD?: boolean;
  SEED_RESET_ADMIN_PASSWORD?: boolean;
}) {
  return {
    NODE_ENV: 'production' as NodeEnvironment,
    SEED_ADMIN_PASSWORD: DOCUMENTED_DEMO_PASSWORD,
    SEED_ALLOW_DEMO_PASSWORD: false,
    SEED_RESET_ADMIN_PASSWORD: false,
    ...overrides,
  };
}

describe('assertSeedPasswordAllowed', () => {
  it('refuses to seed the password published in README.md with NODE_ENV=production', () => {
    expect(() => assertSeedPasswordAllowed(policy({}))).toThrow(
      'Refusing to seed the publicly documented demo password with NODE_ENV=production',
    );
  });

  it('allows it for a local review stack that opts in (init-env.sh writes SEED_ALLOW_DEMO_PASSWORD=true)', () => {
    expect(() =>
      assertSeedPasswordAllowed(policy({ SEED_ALLOW_DEMO_PASSWORD: true })),
    ).not.toThrow();
  });

  it.each(['development', 'test'] as const)('allows it in %s', (nodeEnv) => {
    expect(() => assertSeedPasswordAllowed(policy({ NODE_ENV: nodeEnv }))).not.toThrow();
  });

  it('allows any other password in production', () => {
    expect(() =>
      assertSeedPasswordAllowed(policy({ SEED_ADMIN_PASSWORD: 'a-unique-long-passphrase-42' })),
    ).not.toThrow();
  });
});

describe('shouldResetAdminPassword', () => {
  it('keeps an existing password in production, so an operator rotation survives restarts', () => {
    expect(shouldResetAdminPassword(policy({}))).toBe(false);
  });

  it('resets it in production only on request', () => {
    expect(shouldResetAdminPassword(policy({ SEED_RESET_ADMIN_PASSWORD: true }))).toBe(true);
  });

  it.each(['development', 'test'] as const)(
    'always resets it in %s, so the documented credentials keep working',
    (nodeEnv) => {
      expect(shouldResetAdminPassword(policy({ NODE_ENV: nodeEnv }))).toBe(true);
    },
  );
});
