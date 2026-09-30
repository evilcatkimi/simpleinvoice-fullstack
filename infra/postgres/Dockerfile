# PostgreSQL for SimpleInvoice: the official image (pinned by digest; Dependabot bumps it) plus the one-time role
# setup, baked in rather than bind-mounted. The script runs only when the data volume is empty.
# Plain Dockerfile syntax on purpose (no `COPY --chmod`): it must build with and without BuildKit.
FROM postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
COPY initdb/01-app-roles.sh /docker-entrypoint-initdb.d/01-app-roles.sh
# Executable, so the entrypoint runs it in its own shell instead of sourcing it into its own. Set explicitly because
# a checkout (e.g. on Windows) does not always keep the file mode.
RUN chmod 0755 /docker-entrypoint-initdb.d/01-app-roles.sh
