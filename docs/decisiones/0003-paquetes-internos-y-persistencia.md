# 0003. Paquetes internos, persistencia y cola de auditorías

- **Estado:** aceptada
- **Fecha:** 2026-11-18
- **Historia:** H2 (RF-01, RF-09)

## Contexto
La API usa el scanner y los tipos compartidos. En desarrollo conviene usar el código fuente sin compilar; en producción, el código compilado. Las auditorías tienen que sobrevivir a reinicios y no pueden saturar el servidor.

## Decisión
- **Exports con condición `development`** en `packages/scanner` y `packages/shared`: `development` apunta a `src/index.ts` (tsx con `--conditions=development`, Vitest, Vite y `tsc --noEmit` con `customConditions`), mientras `types`/`default` apuntan a `dist`. El build (`tsconfig.build.json`) anula la condición y compila contra `dist`; `pnpm -r build` respeta el orden de dependencias. Sin dependencias nuevas.
- **SQLite con better-sqlite3 y Drizzle**: migraciones generadas con drizzle-kit en `apps/api/drizzle` y aplicadas al arrancar. Pruebas con `:memory:`. better-sqlite3 es el único paquete con script de instalación habilitado (`allowBuilds` de pnpm 12, equivalente a `onlyBuiltDependencies`).
- **Imagen `node:24-slim`** (glibc) para usar los binarios precompilados de better-sqlite3, con la base en un volumen (`/app/data`).
- **Token del informe**: 256 bits aleatorios en base64url; la base guarda solo su SHA-256. Si se filtra la base, los informes no quedan expuestos.
- **Cola en proceso** con concurrencia 2 y hasta 20 trabajos en espera (503 al llenarse). Los trabajos viven en la base: al arrancar, los `running` pasan a `failed` (`INTERRUPTED`) y los `queued` se retoman en orden.
- **Borde de la API**: zod con `.strict()`, `bodyLimit` de 2 KB y validación previa sin red (`normalizeTargetUrl` del scanner). Errores con código cerrado y mensaje en español; nunca detalles internos.
- **Logs**: los tokens se redactan (`/api/audits/:token`, `/informe/:token`); sin IP ni cabeceras.
- **Pruebas de humo** en CI: el `dist` de la API y la imagen Docker arrancan y responden `/api/health`.

## Consecuencias
- Los puntajes (H7), el lead (H11) y la IP hasheada (H13) se agregan con migraciones nuevas.
- Si hace falta escalar a varios procesos, la cola en proceso se reemplaza por una externa (decisión futura).
