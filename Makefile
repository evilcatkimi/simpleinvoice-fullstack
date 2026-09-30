.PHONY: env up down reset logs test test-api test-web test-e2e lint

## Create .env with random secrets, or add what a newer version introduced (existing secrets are kept)
env:
	./scripts/init-env.sh

## One command: create .env if needed, build and start db + api + web
up: env
	docker compose up --build

## Stop the stack (keeps the database volume)
down:
	docker compose down

## Stop the stack and wipe the database volume (next `make up` re-creates the roles, re-migrates and re-seeds)
reset:
	docker compose down -v

logs:
	docker compose logs -f

test: test-api test-web

test-api:
	cd apps/api && npm test && npm run test:e2e

test-web:
	cd apps/web && npm test

## Full-stack browser tests: starts (or updates) the stack with a raised per-IP login limit
## (tests/e2e/docker-compose.e2e.yml), installs the test runner and Chromium and runs Playwright. The regular api
## configuration is always restored afterwards, failed tests included (after an interrupted run: `make up`).
test-e2e: env
	docker compose -f docker-compose.yml -f tests/e2e/docker-compose.e2e.yml up -d --build --wait
	status=0; (cd tests/e2e && npm ci --no-audit --no-fund && npx playwright install chromium && npm test) || status=$$?; \
	docker compose up -d --wait api; exit $$status

## Static checks of the three packages, as CI runs them (tests/e2e needs `npm ci` there once, e.g. via `make test-e2e`)
lint:
	cd apps/api && npm run lint && npm run format:check && npm run typecheck
	cd apps/web && npm run lint && npm run format:check && npm run typecheck
	cd tests/e2e && npm run typecheck && npm run lint && npm run format:check
