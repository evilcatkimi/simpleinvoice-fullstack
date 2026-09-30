import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `.env` files in precedence order: `apps/api/.env` (optional per-developer overrides), then the repository-root
 * `.env` shared with docker compose. Real environment variables always win over both. Paths are resolved from this
 * file (identical depth in `src/` and `dist/`) so every entry point behaves the same whatever the working directory.
 */
export const ENV_FILE_PATHS = [
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../../../.env'),
];

/** Production configuration comes exclusively from the real environment (container / orchestrator). */
export function shouldLoadEnvFiles(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * For entry points that run outside Nest (TypeORM CLI, seed, e2e setup): same files and precedence as ConfigModule.
 * `process.loadEnvFile` never overrides variables that are already set, and the first file wins.
 */
export function loadEnvFiles(): void {
  if (!shouldLoadEnvFiles()) {
    return;
  }
  for (const path of ENV_FILE_PATHS) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
    }
  }
}
