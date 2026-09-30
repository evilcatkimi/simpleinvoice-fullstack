import type { NextFunction, Request, Response } from 'express';

/**
 * API responses carry customer data and session details: they must not stay in the browser's disk cache (or a shared
 * cache) after logout. Only the static API documentation under `docsPathPrefix` may be cached.
 */
export function noStore(docsPathPrefix: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.path.startsWith(docsPathPrefix)) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  };
}
