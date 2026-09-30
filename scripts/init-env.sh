#!/usr/bin/env sh
# Creates .env from .env.example with freshly generated secrets, or completes an existing .env with what a newer
# version of the template introduced. Existing values, secrets included, are kept.
# Usage: ./scripts/init-env.sh           create .env, or upgrade it (idempotent; `make env` runs this)
#        ./scripts/init-env.sh --force   regenerate everything; then `make reset`, because the database roles were
#                                        created with the previous passwords
set -eu
# The file holds secrets: everything this script creates is readable by the owner only, from the first byte.
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"
DEMO_ADMIN_PASSWORD="Reviewer@2026" # documented reviewer credential (README.md)

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    node -e "process.stdout.write(require('crypto').randomBytes($1).toString('hex'))"
  fi
}

# Value of variable $1 in file $2 (empty when absent).
value_of() {
  sed -n "s/^$1=//p" "$2" | head -n 1
}

# A template line with its intentionally empty secret filled in: independent secrets for the bootstrap superuser,
# the schema owner, the API's runtime role and the JWT key. The seed may only use the documented demo password when
# told so (SEED_ALLOW_DEMO_PASSWORD, local review only), which is set together with that password.
fill() {
  case "$1" in
    POSTGRES_PASSWORD= | DB_MIGRATION_PASSWORD= | DB_PASSWORD=) printf '%s%s\n' "$1" "$(random_hex 24)" ;;
    JWT_SECRET=) printf '%s%s\n' "$1" "$(random_hex 32)" ;;
    SEED_ADMIN_PASSWORD=) printf '%s%s\n' "$1" "$DEMO_ADMIN_PASSWORD" ;;
    SEED_ALLOW_DEMO_PASSWORD=false)
      if [ "$admin_password" = "$DEMO_ADMIN_PASSWORD" ]; then
        printf 'SEED_ALLOW_DEMO_PASSWORD=true\n'
      else
        printf '%s\n' "$1"
      fi
      ;;
    *) printf '%s\n' "$1" ;;
  esac
}

create() {
  admin_password="$DEMO_ADMIN_PASSWORD"
  while IFS= read -r line || [ -n "$line" ]; do
    fill "$line"
  done <"$EXAMPLE_FILE" >"$TMP_FILE"
  mv "$TMP_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE with random POSTGRES_PASSWORD, DB_MIGRATION_PASSWORD, DB_PASSWORD and JWT_SECRET."
}

# Replaces KEY=<exact old value> by KEY=<new value>: values an earlier version generated, never a deliberate setting.
replace_value() {
  if grep -q "^$1=" "$TMP_FILE" && [ "$(value_of "$1" "$TMP_FILE")" = "$2" ]; then
    sed "s|^$1=.*|$1=$3|" "$TMP_FILE" >"$TMP_FILE.next"
    mv "$TMP_FILE.next" "$TMP_FILE"
    changed="$changed $1"
  fi
}

upgrade() {
  admin_password="$(value_of SEED_ADMIN_PASSWORD "$ENV_FILE")"
  changed=""
  cp "$ENV_FILE" "$TMP_FILE"

  # Earlier versions made the API connect as the PostgreSQL superuser; it now has a least-privilege role.
  postgres_user="$(value_of POSTGRES_USER "$ENV_FILE")"
  reset_needed=""
  if [ -n "$postgres_user" ] && [ "$(value_of DB_USER "$ENV_FILE")" = "$postgres_user" ]; then
    replace_value DB_USER "$postgres_user" "$(value_of DB_USER "$EXAMPLE_FILE")"
    replace_value DB_PASSWORD "$(value_of DB_PASSWORD "$ENV_FILE")" "$(random_hex 24)"
    reset_needed="yes"
  fi
  # Old defaults that are no longer safe: CORS for two localhost origins, and trusting one proxy hop from anyone.
  replace_value CORS_ORIGINS "http://localhost:3000,http://localhost:5173" ""
  replace_value TRUST_PROXY "1" "0"

  missing="$(grep -E '^[A-Z][A-Z0-9_]*=' "$EXAMPLE_FILE" | cut -d= -f1 | while IFS= read -r key; do
    grep -q "^$key=" "$ENV_FILE" || echo "$key"
  done)"
  if [ -n "$missing" ]; then
    printf '\n# Added by scripts/init-env.sh (see .env.example)\n' >>"$TMP_FILE"
    for key in $missing; do
      fill "$(grep "^$key=" "$EXAMPLE_FILE" | head -n 1)" >>"$TMP_FILE"
    done
  fi

  if [ -z "$missing$changed" ]; then
    echo ".env is up to date."
    return
  fi
  mv "$TMP_FILE" "$ENV_FILE"
  if [ -n "$missing" ]; then
    echo "Added to .env:" $missing
  fi
  if [ -n "$changed" ]; then
    echo "Updated in .env (values from an earlier version):$changed"
  fi
  if [ -n "$reset_needed" ]; then
    echo "The API now uses its own database role: run 'make reset' once so the database is re-created with it."
  fi
}

TMP_FILE="$(mktemp "$ROOT_DIR/.env.XXXXXX")"
trap 'rm -f "$TMP_FILE" "$TMP_FILE.next"' EXIT

case "${1:-}" in
  --force) create ;;
  "") if [ -f "$ENV_FILE" ]; then upgrade; else create; fi ;;
  *)
    echo "Usage: $0 [--force]" >&2
    exit 64
    ;;
esac
