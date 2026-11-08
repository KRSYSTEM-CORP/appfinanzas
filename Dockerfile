# syntax=docker/dockerfile:1.7
# Imagen de KR POS para el servidor propio. Construir con:
#   docker build --target runner  -t kr-pos .
#   docker build --target migrate -t kr-pos-migrate .
# Las variables NEXT_PUBLIC_* se hornean en el build (ver ARG).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# prisma.config.ts exige DIRECT_URL incluso para `prisma generate`; es solo un marcador, no se conecta.
ENV DIRECT_URL=postgresql://build:build@localhost:5432/build \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npx prisma generate && npm run build

# Herramientas de migración (incluye el CLI de Prisma). No se despliega como app.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-bookworm-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN useradd --system --uid 10001 --create-home app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
