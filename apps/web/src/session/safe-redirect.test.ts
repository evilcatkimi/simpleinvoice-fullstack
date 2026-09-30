import { describe, expect, it } from 'vitest';
import { getPostLoginPath, sanitizeRedirectPath } from './safe-redirect';

describe('sanitizeRedirectPath', () => {
  it.each(['/invoices?status=Paid&page=2', '/invoices/099ca7da-a290-40fa-93b9-1c43ae7bb887#items'])(
    'keeps the in-app path %s',
    (path) => {
      expect(sanitizeRedirectPath(path)).toBe(path);
    },
  );

  it.each([
    '//evil.example/phish',
    '/\\evil.example',
    '/\\/evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r\n/evil.example',
    ' //evil.example',
    'https://evil.example',
    'HTTPS://evil.example/invoices',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil example', // not even a valid URL
    'invoices',
    '/login',
    '/login?from=/invoices',
    '',
    42,
    null,
    undefined,
  ])('falls back to the invoice list for %j', (path) => {
    expect(sanitizeRedirectPath(path)).toBe('/invoices');
  });

  it.each(['/%2F%2Fevil.example', '/%5Cevil.example', '/%2f%2fevil.example/phish'])(
    'keeps percent-encoded slashes as a harmless in-app path (%s)',
    (path) => {
      const result = sanitizeRedirectPath(path);

      expect(result).toBe(path);
      expect(result).toMatch(/^\/[^/\\]/);
    },
  );

  // The URL parser resolves dot segments, so these would otherwise come back as the
  // protocol-relative "//evil.example", which leaves the origin once used as a link.
  it.each([
    '/..//evil.example',
    '/.//evil.example',
    '/%2e%2e//evil.example',
    '/invoices/../..//evil.example',
  ])('never returns a protocol-relative path for the dot-segment trick %j', (path) => {
    expect(sanitizeRedirectPath(path)).toBe('/invoices');
  });
});

describe('getPostLoginPath', () => {
  it('reads the screen the guard bounced the user from', () => {
    expect(getPostLoginPath({ from: '/invoices/new' })).toBe('/invoices/new');
  });

  it.each([null, undefined, 'from', { from: 42 }, { to: '/invoices/new' }])(
    'ignores unexpected router state %j',
    (state) => {
      expect(getPostLoginPath(state)).toBe('/invoices');
    },
  );
});
