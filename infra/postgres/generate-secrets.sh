#!/bin/sh
# Compose's one-shot `secrets` service: creates the stack's random secrets in the `secrets` volume on the first start,
# so a fresh clone runs with a bare `docker compose up` and no .env. Files that already exist are kept: the database
# roles were created with them. A value set in .env still wins over its file (entrypoint.sh here, and
# apps/api/docker-entrypoint.sh).
#
# Each file is readable by the one process user that needs it, nothing else:
#   postgres_password      root (the db entrypoint, before it drops to the postgres user)
#   db_migration_password  uid 1001, the `migrate` service
#   db_password, jwt_secret uid 1000, the API (node user)
# The db entrypoint runs as root and reads all three database passwords to create the roles.
set -eu
umask 077

DIR="${SECRETS_DIR:-/run/secrets}"
API_UID=1000
MIGRATE_UID=1001

# $1 file name, $2 random bytes (written hex-encoded), $3 owner uid
ensure_secret() {
  file="$DIR/$1"
  if [ ! -s "$file" ]; then
    od -An -v -tx1 -N "$2" /dev/urandom | tr -d ' \n' >"$file.tmp"
    if [ "$(wc -c <"$file.tmp")" -ne $(($2 * 2)) ]; then
      rm -f "$file.tmp"
      echo "secrets: could not generate $1" >&2
      exit 1
    fi
    # rename is atomic: an interrupted run never leaves a truncated secret behind
    mv "$file.tmp" "$file"
    echo "secrets: generated $1"
  fi
  chown "$3:$3" "$file"
  chmod 0400 "$file"
}

ensure_secret postgres_password 24 0
ensure_secret db_migration_password 24 "$MIGRATE_UID"
ensure_secret db_password 24 "$API_UID"
ensure_secret jwt_secret 32 "$API_UID"
