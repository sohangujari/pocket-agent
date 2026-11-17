# Pocket Agent — self-hosted image
# Build:  docker build -t pocket-agent .
# Run:    docker run -p 3000:3000 --env-file .env pocket-agent
#
# The database needs the `vector` and `pg_trgm` extensions. Use the
# pgvector/pgvector image (see docker-compose.yml) or Supabase.

FROM node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Install dependencies first so the layer is cached between code changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY supabase ./supabase

RUN npm ci --no-audit --no-fund

RUN npm run build

EXPOSE 3000

# Migrations are idempotent; the runner records applied files.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
