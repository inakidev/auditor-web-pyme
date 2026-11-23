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
# La API y la web compilada van en el mismo contenedor (un solo servicio en Render).
RUN pnpm --filter "@auditor/api..." --filter "@auditor/web..." build

FROM base AS runtime
# PORT no se fija acá: la define la plataforma (Render usa 10000) y en producción es obligatoria.
ENV NODE_ENV=production HOST=0.0.0.0 DATABASE_PATH=/app/data/auditor.db
RUN pnpm install --frozen-lockfile --prod --filter @auditor/api... \
  && pnpm store prune \
  && mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/scanner/dist packages/scanner/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
