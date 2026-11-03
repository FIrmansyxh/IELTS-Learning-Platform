# syntax=docker/dockerfile:1.7
# Multi-stage: web (Next standalone), worker (esbuild bundle + ffmpeg), migrate (tsx + pg_dump).
# Base dipin ke tag eksplisit; catat digest di VERSIONS.md setelah `docker pull`.
ARG NODE_IMAGE=node:22.20.0-alpine3.22

# ---------- deps: semua dependensi (termasuk dev) ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- prod-deps: hanya dependensi produksi (untuk worker) ----------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- builder: build Next + bundle worker ----------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:worker

# ---------- web ----------
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# ffprobe (paket ffmpeg) dipakai untuk validasi unggahan aset admin.
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=builder --chown=1000:1000 /app/.next/standalone ./
COPY --from=builder --chown=1000:1000 /app/.next/static ./.next/static
COPY --from=builder --chown=1000:1000 /app/public ./public
# Mount point; di Compose rootfs read-only dan /app/.next/cache berupa tmpfs.
RUN mkdir -p /app/.next/cache /data/assets && chown -R 1000:1000 /app/.next/cache /data/assets
USER 1000:1000
EXPOSE 3000
CMD ["node", "server.js"]

# ---------- worker ----------
FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=prod-deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=builder --chown=1000:1000 /app/dist ./dist
COPY --chown=1000:1000 package.json ./
RUN mkdir -p /data/assets && chown 1000:1000 /data/assets
USER 1000:1000
CMD ["node", "dist/index.js"]

# ---------- migrate: migrasi + seed (tsx), pg_dump untuk backup pra-migrasi ----------
FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
RUN apk add --no-cache postgresql16-client
WORKDIR /app
COPY --from=deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --chown=1000:1000 package.json package-lock.json tsconfig.json drizzle.config.ts ./
COPY --chown=1000:1000 drizzle ./drizzle
COPY --chown=1000:1000 scripts ./scripts
COPY --chown=1000:1000 src ./src
USER 1000:1000
CMD ["npm", "run", "db:migrate"]
