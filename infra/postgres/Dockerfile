# PostgreSQL for SimpleInvoice: the official image (pinned by digest; Dependabot bumps it) plus
#   - the one-time role setup, run only when the data volume is empty;
#   - generate-secrets.sh, which compose's one-shot `secrets` service runs from this image (no extra image to pull,
#     nothing bind-mounted);
#   - an entrypoint that takes each password from .env or, failing that, from the generated file.
# Plain Dockerfile syntax on purpose (no `COPY --chmod`): it must build with and without BuildKit.
FROM postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
COPY initdb/01-app-roles.sh /docker-entrypoint-initdb.d/01-app-roles.sh
COPY entrypoint.sh generate-secrets.sh /usr/local/bin/
# Executable, so the postgres entrypoint runs the role script in its own shell instead of sourcing it. Set explicitly
# because a checkout (e.g. on Windows) does not always keep the file mode.
RUN chmod 0755 /docker-entrypoint-initdb.d/01-app-roles.sh /usr/local/bin/entrypoint.sh /usr/local/bin/generate-secrets.sh
ENTRYPOINT ["entrypoint.sh"]
# Setting ENTRYPOINT clears the CMD inherited from the base image.
CMD ["postgres"]
