import { configurationWarnings } from './configuration-warnings';

const SAFE = {
  NODE_ENV: 'production',
  COOKIE_SECURE: true,
  TRUST_PROXY: ['10.203.47.10'],
} as const;

describe('configurationWarnings', () => {
  it('says nothing about a hardened production configuration', () => {
    expect(configurationWarnings({ ...SAFE, TRUST_PROXY: [...SAFE.TRUST_PROXY] })).toEqual([]);
  });

  it('warns that a hop count trusts X-Forwarded-For from whoever can reach the API port', () => {
    expect(configurationWarnings({ ...SAFE, TRUST_PROXY: 1 })).toEqual([
      expect.stringContaining(
        'TRUST_PROXY=1 takes the client IP from X-Forwarded-For whoever connects',
      ),
    ]);
  });

  it('does not warn when no proxy is trusted', () => {
    expect(configurationWarnings({ ...SAFE, TRUST_PROXY: 0 })).toEqual([]);
  });

  it('warns when production serves the session cookie without Secure', () => {
    expect(configurationWarnings({ ...SAFE, TRUST_PROXY: 0, COOKIE_SECURE: false })).toEqual([
      expect.stringContaining('COOKIE_SECURE is false with NODE_ENV=production'),
    ]);
  });

  it.each(['development', 'test'] as const)(
    'accepts a plain-HTTP cookie in %s (http://localhost)',
    (nodeEnv) => {
      expect(
        configurationWarnings({ NODE_ENV: nodeEnv, COOKIE_SECURE: false, TRUST_PROXY: 0 }),
      ).toEqual([]);
    },
  );
});
