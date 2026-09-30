#!/usr/bin/env sh
# Optional. Creates .env from .env.example with freshly generated secrets, or adds to an existing .env the variables a
# newer template introduced (existing values, secrets included, are kept).
#
# `docker compose up` does not need it: compose generates its own secrets. Use it to run the API without Docker (it
# must know the passwords the dockerised database was created with, so run this before the first `docker compose up`,
# or `make reset` afterwards) or to choose the stack's secrets yourself.
#
# Usage: ./scripts/init-env.sh           create or complete .env (idempotent; `make env` runs this)
#        ./scripts/init-env.sh --force   regenerate everything; then `make reset`, because the database roles were
#                                        created with the previous passwords
set -eu
# The file holds secrets: everything this script creates is readable by the owner only, from the first byte.
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    node -e "process.stdout.write(require('crypto').randomBytes($1).toString('hex'))"
  fi
}

# A template line with its intentionally empty secret filled in: independent secrets for the bootstrap superuser, the
# schema owner, the API's runtime role and the JWT key.
fill() {
  case "$1" in
    POSTGRES_PASSWORD= | DB_MIGRATION_PASSWORD= | DB_PASSWORD=) printf '%s%s\n' "$1" "$(random_hex 24)" ;;
    JWT_SECRET=) printf '%s%s\n' "$1" "$(random_hex 32)" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

create() {
  while IFS= read -r line || [ -n "$line" ]; do
    fill "$line"
  done <"$EXAMPLE_FILE" >"$TMP_FILE"
  mv "$TMP_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE with random POSTGRES_PASSWORD, DB_MIGRATION_PASSWORD, DB_PASSWORD and JWT_SECRET."
}

complete() {
  missing="$(grep -E '^[A-Z][A-Z0-9_]*=' "$EXAMPLE_FILE" | cut -d= -f1 | while IFS= read -r key; do
    grep -q "^$key=" "$ENV_FILE" || echo "$key"
  done)"
  if [ -z "$missing" ]; then
    echo ".env is up to date."
    return
  fi
  cp "$ENV_FILE" "$TMP_FILE"
  printf '\n# Added by scripts/init-env.sh (see .env.example)\n' >>"$TMP_FILE"
  for key in $missing; do
    fill "$(grep "^$key=" "$EXAMPLE_FILE" | head -n 1)" >>"$TMP_FILE"
  done
  mv "$TMP_FILE" "$ENV_FILE"
  echo "Added to .env:" $missing
}

TMP_FILE="$(mktemp "$ROOT_DIR/.env.XXXXXX")"
trap 'rm -f "$TMP_FILE"' EXIT

case "${1:-}" in
  --force) create ;;
  "") if [ -f "$ENV_FILE" ]; then complete; else create; fi ;;
  *)
    echo "Usage: $0 [--force]" >&2
    exit 64
    ;;
esac
