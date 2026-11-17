# Auditor Web Pyme

## Qué es este proyecto
Aplicación web que audita, de forma **pasiva** (solo hace lo que haría un navegador), el sitio público de una pyme y devuelve un informe **en español** con puntajes y acciones priorizadas en cuatro áreas: **seguridad**, **SEO**, **analítica/medición** y **confianza/contacto** (más una revisión liviana de rendimiento).

Tiene dos usos: herramienta comercial de una agencia de desarrollo web para pymes de la Patagonia, y proyecto real de la materia Taller de Proyectos II (Universidad Kennedy), que se evalúa por **todo el ciclo de vida del software**, no solo por el código.

## Documentos que mandan (leelos antes de tocar código)
- `docs/REQUISITOS.md`: requisitos funcionales y no funcionales (IDs `RF-xx`, `RNF-xx`).
- `docs/PLAN_DE_DESARROLLO.md`: arquitectura, catálogo de checks, plan de pruebas y plan por sprints.
- `docs/PLAN_DE_TRABAJO.md`: plan vigente por etapas, con la puerta de salida de cada una y las reglas de recorte.
- `docs/decisiones/`: registro de decisiones de arquitectura (un archivo por decisión, formato ADR corto).
- `docs/trazabilidad.md`: matriz requisito -> prueba -> commit. Mantenela actualizada.

Si algo que te pido contradice esos documentos, avisame antes de implementar.

## Stack (versiones: verificá las vigentes, no confíes en tu memoria)
- Monorepo con pnpm workspaces y TypeScript en modo estricto.
- `apps/api`: Node.js + Fastify, zod, Drizzle ORM + SQLite (better-sqlite3), pino, argon2.
- `apps/web`: React + Vite + Tailwind + React Router + TanStack Query.
- `packages/scanner`: librería pura con los checks y `safeFetch`. No depende de Fastify ni de la base.
- `packages/shared`: esquemas zod y tipos compartidos.
- Pruebas: Vitest (unitarias e integración), Playwright (e2e, cuando llegue el momento).
- Calidad: ESLint, Prettier, `tsc --noEmit`. CI en GitHub Actions.
- Contenedores: Docker multi-stage + `docker-compose.yml` para desarrollo.

## Comandos (crealos como scripts del repo raíz en el Sprint 0)
- `pnpm dev`: levanta api y web.
- `pnpm test`: todas las pruebas. `pnpm test:scanner`: solo el scanner.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- `pnpm audit --prod`: debe quedar sin vulnerabilidades altas o críticas.
Antes de dar una tarea por terminada corré `pnpm lint && pnpm typecheck && pnpm test`.

## Arquitectura en una mirada
Web (React) -> API (Fastify) -> cola de trabajos en proceso -> Scanner (`safeFetch` + checks) -> SQLite.
Cada check implementa la interfaz `Check { id, category, run(ctx): Promise<Finding[]> }`, es independiente y se prueba con fixtures de HTML/cabeceras, **sin red**.
Estructura de módulos y modelo de datos: ver `docs/PLAN_DE_DESARROLLO.md`.

## Reglas de seguridad (obligatorias, es una herramienta que visita URLs ingresadas por usuarios)
1. **Toda request saliente pasa por `safeFetch`** (`packages/scanner/src/net/safe-fetch.ts`). Prohibido usar `fetch`, `axios` o `http` en cualquier otro lugar; hacelo cumplir con una regla de ESLint (`no-restricted-imports` / `no-restricted-globals`).
2. `safeFetch` debe: aceptar solo `http`/`https` en puertos 80/443; rechazar URLs con credenciales (`user:pass@`); resolver DNS y validar **todas** las IPs; bloquear loopback, privadas RFC1918, link-local (incluida `169.254.169.254`), CGNAT `100.64.0.0/10`, `0.0.0.0/8`, multicast y reservadas; en IPv6 bloquear `::1`, `fc00::/7`, `fe80::/10` y las IPv4 mapeadas; normalizar IPs en formato decimal/octal/hexadecimal; **conectar a la IP ya validada** (evita DNS rebinding); revalidar en cada redirect (máximo 3); timeout de 10 s; cortar la lectura a 2 MB; no enviar cookies ni credenciales; User-Agent identificable `AuditorWebPyme/1.0 (+URL de contacto)`.
3. Límites de rastreo: la página principal + hasta 4 páginas internas, hasta 20 enlaces verificados, 1 request por segundo por dominio, y respetar `robots.txt` para todo lo que no sea la página principal.
4. **Nunca ejecutes ni renderices el HTML/JS del sitio auditado.** Parsealo con `cheerio` (o parse5), guardá solo evidencia truncada (máx. 300 caracteres) y mostrala siempre escapada. Prohibido `dangerouslySetInnerHTML`.
5. Validá toda entrada con zod en el borde de la API. Consultas SQL solo vía ORM o parametrizadas.
6. Rate limiting: por IP (guardada **hasheada con sal**), por dominio objetivo (cooldown) y tope diario. Cola con tamaño máximo y concurrencia limitada.
7. Login de consultores: argon2id, cookie de sesión `HttpOnly` + `Secure` + `SameSite=Lax`, token CSRF en mutaciones, bloqueo progresivo por intentos fallidos. TOTP es requisito "Should".
8. Secretos solo en variables de entorno. `.env` va en `.gitignore`. No loguees secretos, IPs sin hashear ni contenido de páginas. Logs estructurados con pino.
9. La web envía cabeceras de seguridad (helmet) y una CSP estricta.
10. Cada dependencia nueva se justifica en una línea en el PR. Verificá que el paquete exista, esté mantenido y tenga licencia compatible. No inventes nombres de paquetes ni APIs: consultá la documentación vigente.

## Qué NO hace esta herramienta (no-objetivos)
Sin pruebas de intrusión, sin sondeo de rutas sensibles (`/.env`, `/wp-admin`, etc.), sin fuerza bruta, sin escaneo de puertos, sin explotación de vulnerabilidades, sin rastreo masivo, sin guardar el contenido de las páginas. Si una idea cae en alguno de estos casos, frená y consultame.

## Desarrollo y pruebas
- Durante el desarrollo **no audites sitios de terceros**. Usá fixtures locales, un servidor de prueba propio (levantado en los tests) y sitios nuestros.
- Los checks se desarrollan con TDD: primero fixtures y pruebas, después implementación.
- La suite de SSRF es obligatoria y se amplía con cada hallazgo (lista de casos en el plan, sección de pruebas).
- Umbral de cobertura: 80 % en `packages/scanner`, 70 % en el resto.
- Las pruebas unitarias no usan red real.

## Convenciones
- Código e identificadores en inglés; **textos de interfaz y de informes en español rioplatense** (voseo, tono claro y sin tecnicismos innecesarios).
- Commits en formato Conventional Commits y con el ID del requisito: `feat(scanner): detecta HSTS ausente (RF-03)`.
- Un PR (o commit grande) por historia, chico y revisable. Cada historia actualiza `docs/trazabilidad.md`.
- Errores con tipos explícitos; nada de `any`. Funciones puras donde se pueda.
- Cada decisión de arquitectura no trivial se registra en `docs/decisiones/NNNN-titulo.md`.

## Cómo quiero que trabajes
1. Empezá cada tarea en **modo plan**: leé los documentos, proponé el enfoque y esperá mi OK antes de escribir código.
2. Trabajá **de a una historia** del backlog por vez, en el orden del plan.
3. Antes de agregar una dependencia, cambiar la arquitectura o tocar `safeFetch`, preguntame.
4. Al terminar una historia: pruebas en verde, lint y typecheck limpios, trazabilidad actualizada y un resumen de lo hecho, lo pendiente y los riesgos que viste.
5. Si algo es ambiguo o no está en los requisitos, **preguntá**: no lo rellenes con suposiciones silenciosas.
6. Señalá cualquier problema de seguridad que detectes en lo que ya está escrito, aunque no sea parte de la tarea.
7. **Eficiencia:** mínimo impacto y máxima eficacia en todo momento. Leé solo lo necesario (por rangos si el archivo es grande), no releas lo ya leído, no uses subagentes salvo que sea imprescindible y respondé breve y al punto.

## Definición de hecho (DoD)
- Cumple los criterios de aceptación del requisito en `docs/REQUISITOS.md`.
- Pruebas nuevas y existentes en verde; cobertura por encima del umbral.
- `pnpm lint`, `pnpm typecheck` y `pnpm audit --prod` sin errores.
- Sin secretos ni datos personales en código, logs o fixtures.
- Documentación y trazabilidad actualizadas.
- Se puede demostrar en la interfaz (si aplica).

## Contexto académico
Es el proyecto individual de Taller de Proyectos II. Hay entregas parciales por módulo que evalúan: selección y justificación del proyecto, relevamiento y documentación de requisitos, presentación del problema y del ciclo de vida elegido, y luego diseño, desarrollo, pruebas e implementación. Por eso mantené los documentos de `docs/` al día: son parte del entregable.
