#!/bin/sh
# Entrypoint of the db image. Each password comes from its environment variable (.env) or, when that is empty, from
# the file the compose `secrets` service generated; then the official entrypoint takes over (and drops to the
# postgres user, keeping the environment). Outside compose, without the files, it behaves like the official image.
set -eu

DIR="${SECRETS_DIR:-/run/secrets}"

# $1 variable, $2 file name in $DIR
from_file() {
  eval "current=\${$1:-}"
  if [ -z "$current" ] && [ -s "$DIR/$2" ]; then
    export "$1=$(cat "$DIR/$2")"
  fi
}

from_file POSTGRES_PASSWORD postgres_password
from_file DB_MIGRATION_PASSWORD db_migration_password
from_file DB_APP_PASSWORD db_password

exec docker-entrypoint.sh "$@"
