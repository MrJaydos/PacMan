# --- deps stage -------------------------------------------------------
# better-sqlite3 is a native module. node:20-slim (Debian/glibc) has
# prebuilt binaries available for it on npm most of the time, but we still
# install build tools here as a fallback so `npm ci` can compile from
# source if a prebuild isn't published for this platform/arch. None of that
# toolchain gets shipped in the final image.
FROM node:20-slim AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- runtime stage ------------------------------------------------------
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/leaderboard.db

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js rateLimiter.js ./
COPY public ./public

# Non-root user; /data is where the leaderboard volume gets mounted.
RUN groupadd --system app && useradd --system --gid app --home /app app \
    && mkdir -p /data \
    && chown -R app:app /app /data
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
