# SimpleInvoice API image: build with the full toolchain, ship only compiled JS and production dependencies.

# Pinned by digest (Dependabot bumps it): the build is reproducible and a moved tag cannot swap the base image.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS base
WORKDIR /app

# Full dependency tree (TypeScript, Nest CLI) for the build.
FROM base AS deps
# @scarf/scarf (pulled in by swagger-ui-dist) reports installs from a postinstall script: opt out.
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Runtime dependencies only (bcrypt ships prebuilt musl binaries, so no compiler toolchain is needed).
FROM base AS prod-deps
ENV SCARF_ANALYTICS=false
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000
# tini runs as PID 1: it forwards SIGTERM to Node (graceful shutdown via enableShutdownHooks) and reaps zombies.
# The package managers go: the entrypoint only needs node, and code execution in the container gets no npm/npx,
# corepack or yarn to fetch and run packages with.
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
      /opt/yarn-*
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY docker-entrypoint.sh ./
# Application files stay owned by root and read-only for the unprivileged user the process runs as; nothing is
# written at runtime, so the container also works with a read-only root filesystem.
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# Run through sh so the script does not depend on the executable bit surviving a checkout (e.g. on Windows).
ENTRYPOINT ["/sbin/tini", "--", "sh", "./docker-entrypoint.sh"]
