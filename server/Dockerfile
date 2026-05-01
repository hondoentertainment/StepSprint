# StepSprint API Dockerfile
# For SQLite dev, use `npm run dev` directly; this image targets Postgres prod.
# Swaps schema.postgresql.prisma → schema.prisma before generating the Prisma
# client so the production build is wired for PostgreSQL.

# ---- Stage 1: builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps needed for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Use the PostgreSQL schema for the production Prisma client.
# The dev schema (schema.prisma) targets SQLite; schema.postgresql.prisma
# targets Postgres and is the canonical production schema.
RUN cp prisma/schema.postgresql.prisma prisma/schema.prisma

RUN npx prisma generate
RUN npm run build

# Prune dev dependencies so we can copy a lean node_modules into the runtime stage.
RUN npm prune --omit=dev


# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime

WORKDIR /app

# curl is used by the HEALTHCHECK below; tini reaps zombies from prisma calls.
RUN apk add --no-cache curl tini libc6-compat \
    && addgroup -S stepsprint \
    && adduser -S -G stepsprint stepsprint

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder --chown=stepsprint:stepsprint /app/node_modules ./node_modules
COPY --from=builder --chown=stepsprint:stepsprint /app/dist ./dist
COPY --from=builder --chown=stepsprint:stepsprint /app/prisma ./prisma
COPY --from=builder --chown=stepsprint:stepsprint /app/package.json ./package.json

USER stepsprint

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# prisma db push syncs the schema to Postgres without requiring provider-specific
# migration files (the existing migrations were generated for SQLite).
# TODO: once PostgreSQL migrations are generated, switch back to migrate deploy.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
