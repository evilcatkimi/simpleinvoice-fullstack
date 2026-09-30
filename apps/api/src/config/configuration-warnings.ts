import type { AppEnvironment } from './environment';

type WarningInputs = Pick<AppEnvironment, 'NODE_ENV' | 'COOKIE_SECURE' | 'TRUST_PROXY'>;

/**
 * Settings that are valid, and needed by some deployments, but weaken security when used by mistake. They are logged
 * at boot instead of refused: the local review stack legitimately runs NODE_ENV=production over plain HTTP.
 */
export function configurationWarnings(env: WarningInputs): string[] {
  const warnings: string[] = [];
  if (typeof env.TRUST_PROXY === 'number' && env.TRUST_PROXY > 0) {
    warnings.push(
      `TRUST_PROXY=${env.TRUST_PROXY} takes the client IP from X-Forwarded-For whoever connects: only safe when ` +
        "nothing but the reverse proxy can reach the API port. Prefer the proxy's IP address or CIDR.",
    );
  }
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    warnings.push(
      'COOKIE_SECURE is false with NODE_ENV=production: browsers send the session cookie over plain HTTP. Serve ' +
        'the API over HTTPS and set COOKIE_SECURE=true.',
    );
  }
  return warnings;
}
