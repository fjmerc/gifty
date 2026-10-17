# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22-alpine

# React build is architecture-independent: build once natively, not under QEMU
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS frontend
WORKDIR /src
COPY gifty-frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY gifty-frontend/ ./
# INLINE_RUNTIME_CHUNK=false: no inline script in index.html (CSP script-src 'self')
ENV REACT_APP_API_BASE_URL=/api GENERATE_SOURCEMAP=false INLINE_RUNTIME_CHUNK=false
RUN npm run build

# Backend deps install natively too (npm under QEMU can hang for hours), picking the
# target's prebuilt packages. No dependency needs a native build: msgpackr-extract ships
# prebuilt binaries per platform and falls back to plain JS without them
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
ARG TARGETARCH
WORKDIR /app
COPY gifty-backend/package*.json ./
RUN case "$TARGETARCH" in \
      amd64) cpu=x64 ;; \
      arm64) cpu=arm64 ;; \
      *) echo "unsupported TARGETARCH '$TARGETARCH'" >&2; exit 1 ;; \
    esac \
 && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --os=linux --cpu=$cpu --libc=musl

FROM ${NODE_IMAGE} AS runtime
# Release builds pass the tag; local builds fall back to package.json's version
ARG GIFTY_VERSION=
RUN apk add --no-cache su-exec tini
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY gifty-backend/ ./
COPY --from=frontend /src/build ./public
RUN chmod +x /app/docker-entrypoint.sh && mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    PUBLIC_DIR=/app/public \
    LOG_TO_FILE=false \
    MONGO_URI=mongodb://mongo:27017/gifty \
    REDIS_HOST=redis \
    GIFTY_VERSION=${GIFTY_VERSION}
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
