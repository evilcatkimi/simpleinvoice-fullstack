#!/bin/sh
# Runs once, when the data volume is empty (docker-entrypoint-initdb.d), as the bootstrap superuser POSTGRES_USER.
# Creates the two roles SimpleInvoice uses, neither of them a superuser:
#   DB_MIGRATION_USER  owns the database and its public schema: migrations and the seed (compose `migrate` service)
#   DB_APP_USER        the API at runtime: may read and insert application rows, nothing else (no DDL, no COPY
#                      TO PROGRAM, no role or database creation), so an injection or a leaked password stays contained
# Nothing uses the bootstrap superuser after this script.
set -eu

for role in "$DB_MIGRATION_USER" "$DB_APP_USER"; do
  if [ "$role" = "$POSTGRES_USER" ]; then
    echo "01-app-roles.sh: \"$role\" is also POSTGRES_USER, the superuser; the application roles must differ" >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set db="$POSTGRES_DB" \
  --set owner="$DB_MIGRATION_USER" --set owner_password="$DB_MIGRATION_PASSWORD" \
  --set app="$DB_APP_USER" --set app_password="$DB_APP_PASSWORD" <<'SQL'
CREATE ROLE :"owner" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_password';
CREATE ROLE :"app"   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';

-- The owner creates the schema (pg_trgm is a trusted extension: creating it needs no superuser).
ALTER DATABASE :"db" OWNER TO :"owner";
ALTER SCHEMA public OWNER TO :"owner";

-- No implicit rights: PUBLIC loses CONNECT/TEMPORARY on the database and USAGE on the schema.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"app";
GRANT USAGE ON SCHEMA public TO :"app";

-- Every table the owner creates from now on (the migrations run later) can be read and inserted into by the API;
-- updating or deleting rows needs a deliberate grant when a feature requires it.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO :"app";
SQL
