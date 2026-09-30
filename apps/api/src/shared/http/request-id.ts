import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Short and log-safe: no whitespace, quotes or control characters that could forge log lines. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Reuses a caller-supplied id (for cross-service correlation) only when it is well-formed; otherwise mints one. */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : randomUUID();
}

/**
 * Registered before every other middleware so that each response — including body-parser failures that never reach
 * a controller — carries the id. pino-http reuses `req.id`, so log lines and error bodies share the same value.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
  req.id = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
