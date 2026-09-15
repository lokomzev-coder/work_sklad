# Block T deploy (2026-09-15): production image for self-hosting on the
# user's own Linux server (docker-compose.yml runs this alongside Postgres
# and Caddy). Debian-slim base, not alpine — @prisma/adapter-pg + pg's
# native bindings and Prisma's own generator have historically been more
# reliable against glibc than musl; image size is a secondary concern here.
FROM node:22-slim AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma generate only needs the schema, not a live DB — this placeholder
# satisfies prisma.config.ts's datasource.url so the command doesn't fail
# on an unset env var during the image build (the real DATABASE_URL is
# supplied at container runtime via docker-compose's env_file).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Block M4 phase B (lib/print/pdf-browser.ts) — "Скачать PDF" renders via a
# real headless Chromium via Playwright, not a static HTML dump. This has
# to be installed into THIS stage specifically, not copied from `builder`:
# --with-deps pulls in real OS shared libraries (libnss3, libatk, etc.)
# that only exist by actually running apt in the image that will run them,
# not by copying a directory across stages. Must run as root, before the
# USER switch below. Fixed absolute path (not under node_modules) so it
# isn't disturbed by anything else touching /app.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Pinned to the exact version in package.json — Playwright ties its browser
# binary release tightly to its own npm package version, a mismatch here
# would silently break at runtime rather than fail the build. Installed
# into an isolated /tmp dir, NOT run as a bare `npx` from /app: the
# standalone copy above already has a partial `playwright` entry in
# node_modules (only the launcher code Next's tracing found reachable,
# not its CLI bin script) — npx resolves that local, broken copy first
# instead of fetching a real one, failing with "playwright: not found".
RUN mkdir -p /tmp/pw-install && cd /tmp/pw-install && npm init -y >/dev/null \
  && npm install --no-save playwright@1.63.0 \
  && npx playwright install --with-deps chromium \
  && cd /app && rm -rf /tmp/pw-install

# Storage dir for local file uploads (src/lib/file-storage.ts) — mounted as
# a named volume in docker-compose.yml so uploads survive image rebuilds.
RUN mkdir -p ./storage/uploads \
  && chown -R nextjs:nodejs ./storage ./.next ./public /ms-playwright

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
