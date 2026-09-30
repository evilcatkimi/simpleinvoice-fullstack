import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CsrfHeaderGuard } from './csrf-header.guard';

function contextWith(headers: Record<string, string>): ExecutionContext {
  const request = { get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('CsrfHeaderGuard', () => {
  const guard = new CsrfHeaderGuard();

  it('lets the SPA through: it sends X-Requested-With: XMLHttpRequest on every call', () => {
    expect(guard.canActivate(contextWith({ 'x-requested-with': 'XMLHttpRequest' }))).toBe(true);
  });

  it.each([
    ['no header (a cross-site form or image)', {}],
    ['another value', { 'x-requested-with': 'fetch' }],
    ['a lower-cased value', { 'x-requested-with': 'xmlhttprequest' }],
  ])('refuses %s with 403', (_case, headers) => {
    expect(() => guard.canActivate(contextWith(headers))).toThrow(
      new ForbiddenException('Missing X-Requested-With: XMLHttpRequest header'),
    );
  });
});
