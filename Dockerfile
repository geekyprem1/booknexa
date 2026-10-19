# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# BookNexa — production Docker build (Next.js 16 + Puppeteer)
#
# Why a Dockerfile instead of Nixpacks: the Nixpacks setup phase
# (nix-env) was failing on the build host with exit 255. This image
# gives deterministic control over the Chromium runtime deps that
# the server-side PDF engine (lib/pdf/render.ts) needs, and skips
# Puppeteer's 300MB Chromium download by using the system Chromium.
# ─────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
WORKDIR /app

# System Chromium + fonts. Installing the `chromium` package pulls in all
# the shared libraries Chromium needs to launch, so we don't hand-maintain
# the lib list. render.ts reads PUPPETEER_EXECUTABLE_PATH to use this binary.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's bundled Chromium download; use the system one instead.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NEXT_TELEMETRY_DISABLED=1

# ── deps ──────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time,
# so they must be present during `next build`. In Coolify, add these as
# environment variables with "Build Variable" enabled so they arrive here.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Give the Next.js build headroom on smaller hosts.
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN npm run build

# ── runner ────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
CMD ["npm", "run", "start"]
