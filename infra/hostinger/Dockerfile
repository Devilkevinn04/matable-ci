FROM node:22-bookworm AS builder

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --include=dev
COPY . .

ARG VITE_WHATSAPP_ADMIN_PHONE=0102749775
ENV VITE_WHATSAPP_ADMIN_PHONE=${VITE_WHATSAPP_ADMIN_PHONE}
RUN npm run lint \
    && npm run test:ci \
    && npm run build \
    && ./node_modules/.bin/esbuild scripts/migrate-neon.ts --bundle --platform=node --format=esm --packages=external --outfile=build/migrate-postgres.mjs \
    && npm prune --omit=dev \
    && printf 'BUILD_VERIFIED\n'

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/migrations ./migrations
COPY --from=builder --chown=node:node /app/scripts/smoke-production.mjs /app/scripts/check-production-readiness.mjs ./scripts/

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health',{headers:{'X-Forwarded-Proto':'https'}}).then(async r=>{if(!r.ok||(await r.json()).status!=='ok')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "build/server.cjs"]
