import { readLocationState } from '@/core/routing/location-state';

const DEFAULT_AUTHENTICATED_PATH = '/invoices';

/** Router state the route guard hands to the login screen. */
export interface LoginLocationState {
  from: string;
}

/** "//host" and "/\host" are protocol-relative URLs: used as a link they leave this origin. */
const PROTOCOL_RELATIVE = /^[/\\]{2}/;

/**
 * Where to go after signing in: the screen the user was bounced from, if it is a path of this app.
 * The value is parsed exactly like the browser would, so "//evil.example", "/\evil.example",
 * "/\t/evil.example" or "https://…" can never turn the login screen into an open redirect.
 */
export function getPostLoginPath(locationState: unknown): string {
  return sanitizeRedirectPath(
    readLocationState(locationState, 'from' satisfies keyof LoginLocationState),
  );
}

export function sanitizeRedirectPath(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/') || PROTOCOL_RELATIVE.test(path)) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  let url: URL;
  try {
    url = new URL(path, window.location.origin);
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  // Checked again after parsing: dot segments ("/..//host", "/%2e%2e//host") collapse into "//host"
  // while the origin still looks like ours.
  if (
    url.origin !== window.location.origin ||
    PROTOCOL_RELATIVE.test(url.pathname) ||
    url.pathname === '/login'
  ) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
