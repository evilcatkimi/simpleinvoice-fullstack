# syntax=docker/dockerfile:1

# Base images are pinned by digest (Dependabot bumps them): a moved tag cannot swap what gets built or shipped.

# ---- Build: exact dependencies from the lockfile, type-check, bundle ----
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Runtime: static files + /api reverse proxy, as a non-root user ----
FROM nginxinc/nginx-unprivileged:1.30-alpine@sha256:ed04ec1ff34502c339ee5c3ae3f855442398edc1d05591e2b98981dcbbd20b1e AS runtime
# Our nginx.conf replaces the whole configuration; the stock site would only confuse the image's
# entrypoint scripts (they try to edit it, which fails on a read-only filesystem).
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
USER 101
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
