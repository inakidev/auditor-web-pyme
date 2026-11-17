# 0001. Stack, monorepo y herramientas de calidad

- **Estado:** aceptada
- **Fecha:** 2026-11-17
- **Historia:** H0 (RNF-04, RNF-10, RNF-11, RNF-12)

## Contexto
Proyecto individual con plazo corto, que debe ser mantenible y apto para uso comercial, sin costos de licencias. La API, la web y el scanner comparten tipos y reglas de seguridad.

## Decisión
- **Monorepo con pnpm workspaces** (`apps/api`, `apps/web`, `packages/scanner`, `packages/shared`): un solo lockfile, una sola CI y tipos compartidos sin publicar paquetes.
- **Node.js 24 LTS** (soporte hasta abril de 2028). La 26 ya es LTS; se migra cuando convenga, sin urgencia.
- **TypeScript 6.0.3** en modo estricto (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No se usa la 7 porque typescript-eslint todavía no la soporta (`<6.1.0`).
- **ESLint con reglas de seguridad propias**: prohíbe `fetch` y equivalentes (también como `globalThis.fetch`, `window.fetch` y `self.fetch`), los módulos de red de Node (con y sin prefijo `node:`, también en `import()` dinámico) y los clientes HTTP de terceros fuera de `packages/scanner/src/net`. Excepciones acotadas: las pruebas del scanner pueden usar `http`/`https` para levantar servidores de fixture, y `apps/web/src/lib/api-client.ts` puede usar `fetch` para hablar con nuestra propia API. Una prueba (`test/eslint-rules.test.ts`) verifica la regla.
- **Vitest** con un proyecto por paquete y umbrales de cobertura (80 % scanner, 70 % resto).
- **Dependencias mínimas por historia**: cada paquete entra en la historia que lo usa.
- **pnpm sin scripts de instalación**: `allowBuilds` niega el script de esbuild (su binario llega por paquetes opcionales). Reduce la superficie de ataque de la cadena de suministro.
- **CI en GitHub Actions** con `permissions: contents: read` y acciones fijadas por SHA.
- **Docker multi-stage** con usuario sin privilegios; la imagen se construye en CI.

## Consecuencias
- Se puede volver a TypeScript 7 cuando typescript-eslint lo soporte (revisar en cada etapa).
- Los paquetes internos exportan su código fuente (`./src/index.ts`); cómo los consume la API compilada se resuelve en H2, cuando la API importe el scanner por primera vez.
- La prueba local de `docker compose up` queda para la etapa 6 (Docker Desktop necesita WSL2, todavía no instalado).
