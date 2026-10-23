FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=768
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/public-data/package.json ./packages/public-data/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund && npm rebuild better-sqlite3
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libdbus-1-3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production GCT_HOST=127.0.0.1 GCT_PORT=17840 GCT_FRONTEND_PORT=17840 GCT_DATA_DIR=/data GCT_CREDENTIAL_ENV_PATH=/data/credentials.env
USER node
CMD ["node", "apps/backend/dist/server.js"]
