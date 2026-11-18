# syntax=docker/dockerfile:1

# slim (glibc) para usar los binarios precompilados de better-sqlite3.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/scanner/package.json packages/scanner/
COPY packages/shared/package.json packages/shared/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @auditor/api... build

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/auditor.db
RUN pnpm install --frozen-lockfile --prod --filter @auditor/api... \
  && pnpm store prune \
  && mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/scanner/dist packages/scanner/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
