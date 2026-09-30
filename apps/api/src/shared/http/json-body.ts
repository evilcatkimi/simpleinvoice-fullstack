import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The deepest legitimate body is 3 levels (invoice → items → item); 8 leaves headroom without allowing bombs. */
const MAX_JSON_DEPTH = 8;

/**
 * The API reads JSON bodies only, so anything else is refused (415) instead of being quietly ignored. This is also a
 * CSRF control: an HTML form can post form-encoded or text/plain bodies to another site without a CORS preflight,
 * JSON it cannot.
 */
export function requireJsonBody(req: Request, _res: Response, next: NextFunction): void {
  if (carriesBody(req) && !req.is('application/json')) {
    next(new UnsupportedMediaTypeException('Content-Type must be application/json'));
    return;
  }
  next();
}

/** A bodiless POST (logout) is fine: fetch sends it with Content-Length: 0 and no Content-Type. */
function carriesBody(req: Request): boolean {
  const length = req.headers['content-length'];
  return req.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0');
}

/**
 * Runs right after the JSON parser. Class validation walks bodies recursively, so a few kB of nested brackets would
 * otherwise overflow its stack and turn into a 500.
 */
export function rejectDeeplyNestedJson(req: Request, _res: Response, next: NextFunction): void {
  if (exceedsJsonDepth(req.body, MAX_JSON_DEPTH)) {
    next(new BadRequestException('Request body is nested too deeply'));
    return;
  }
  next();
}

/** Iterative on purpose: the check itself must not recurse on hostile input. */
export function exceedsJsonDepth(value: unknown, maxDepth: number): boolean {
  const pending: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }];
  for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
    const { node, depth } = entry;
    if (typeof node !== 'object' || node === null) {
      continue;
    }
    if (depth > maxDepth) {
      return true;
    }
    for (const child of Object.values(node)) {
      pending.push({ node: child, depth: depth + 1 });
    }
  }
  return false;
}
