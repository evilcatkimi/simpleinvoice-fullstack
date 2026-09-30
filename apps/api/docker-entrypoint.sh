#!/bin/sh
# Usage: docker-entrypoint.sh [api|migrate]
#   migrate  apply the migrations and the idempotent seed, then exit (compose's one-shot `migrate` service, which
#            runs with the schema owner's credentials)
#   api      (default) optionally migrate and seed first (RUN_MIGRATIONS_ON_BOOT / SEED_ON_BOOT, for a standalone
#            container), then the API replaces this shell (tini stays PID 1)
set -eu

migrate() {
  echo "Applying database migrations..."
  node node_modules/typeorm/cli.js migration:run -d dist/infrastructure/database/data-source.js
}

seed() {
  echo "Seeding the database..."
  node dist/infrastructure/database/seeds/run-seed.js
}

case "${1:-api}" in
  migrate)
    migrate
    seed
    ;;
  api)
    if [ "${RUN_MIGRATIONS_ON_BOOT:-true}" = "true" ]; then
      migrate
    fi
    if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
      seed
    fi
    exec node dist/main.js
    ;;
  *)
    echo "Unknown command: $1 (expected: api or migrate)" >&2
    exit 64
    ;;
esac
