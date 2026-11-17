# Arranque: Etapa 1 (H0 y H1)

## 0. Antes de abrir Claude Code

1. En la carpeta del repo, copiá estos archivos a `docs/` (reemplazan a los anteriores):
   - `PLAN_DE_TRABAJO.md` (nuevo)
   - `PLANIFICACION.md`
   - `PLAN_DE_DESARROLLO.md`
   - `gantt.png`
2. Si ya habías copiado `PLAN_7_DIAS.md`, borralo.
3. En `CLAUDE.md`, dentro de "Documentos que mandan", agregá esta línea antes de la de `docs/decisiones/`:
   ```
   - `docs/PLAN_DE_TRABAJO.md`: plan vigente por etapas, con la puerta de salida de cada una y las reglas de recorte.
   ```
4. En `README.md`, dentro de "Documentación", agregá:
   ```
   - [Plan de trabajo por etapas](docs/PLAN_DE_TRABAJO.md)
   ```
5. Verificá: `node -v` (LTS), `pnpm -v`, `git --version`.
6. Primer commit, antes de que Claude Code toque nada:
   ```
   git init
   git add .
   git commit -m "docs: kit inicial del proyecto (requisitos, plan y planificación)"
   git branch -M main
   git remote add origin <URL-del-repo-privado>
   git push -u origin main
   ```
   Si todavía no agregaste al docente como colaborador, hacelo ahora (Settings, Collaborators).

## 1. Abrí Claude Code en la raíz del repo y pegá esto

```
Leé CLAUDE.md, docs/PLAN_DE_TRABAJO.md (sección de la etapa 1), docs/REQUISITOS.md (RNF de seguridad y RF-01), y del docs/PLAN_DE_DESARROLLO.md solo las secciones de arquitectura, diseño de seguridad (safeFetch) y plan de pruebas SSRF. No leas el resto.

Hacemos la etapa 1: H0 y H1. Entramos en modo plan.

Parte 1, H0 (preparación):
- Proponé la estructura del monorepo pnpm (apps/api, apps/web, packages/scanner, packages/shared), TypeScript estricto, ESLint con la regla que prohíbe fetch/axios/http fuera de safeFetch, Prettier, Vitest, scripts raíz (dev, test, test:scanner, lint, typecheck, build), CI en GitHub Actions y Docker base.
- Verificá las versiones vigentes de cada dependencia en el registro antes de fijarlas. No inventes paquetes.
- Listame las dependencias con una línea de justificación cada una.

Parte 2, H1 (cliente HTTP seguro), con TDD:
- Primero la suite SSRF completa (los 15 casos del plan más los de CLAUDE.md regla 2), con un resolver DNS inyectable y sin red real.
- Recién después safeFetch en packages/scanner/src/net/safe-fetch.ts.
- Al terminar, explicame cómo funcionan el anclaje a la IP validada y la revalidación de redirects, y qué casos de la suite los cubren.

Mostrame el plan completo y esperá mi OK antes de escribir código. Al cerrar cada parte: pnpm lint && pnpm typecheck && pnpm test, trazabilidad actualizada y un resumen de lo hecho, lo pendiente y los riesgos que viste.
```

## 2. Qué revisás vos antes de dar el OK

- **El plan de H0:** que no agregue dependencias que no estén en el stack de `CLAUDE.md`.
- **safeFetch, línea por línea** (es lo que más importa de todo el proyecto):
  - que valide todas las IP que devuelve el DNS, no solo la primera;
  - que conecte a la IP validada y no vuelva a resolver el nombre;
  - que cada redirect pase otra vez por la validación (máximo 3);
  - que corte la lectura a 2 MB y a 10 s;
  - que no mande cookies ni credenciales.
- **La regla de ESLint:** probá a mano que `fetch('http://x')` fuera de `safeFetch` rompa el lint.

## 3. Puerta de salida de la etapa 1

No se pasa a la etapa 2 si no se cumple todo esto:
- [ ] Integración continua en verde en GitHub.
- [ ] Suite SSRF completa pasando, sin red real.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` en verde.
- [ ] `docs/trazabilidad.md` actualizada y tabla del README en 11 de 85.
- [ ] Revisaste `safeFetch` vos mismo.
- [ ] Anotaste en `docs/PLANIFICACION.md` (sección 6) la fecha de cierre y las horas dedicadas.

## 4. Prompt de cierre de cada etapa

```
Corré pnpm lint && pnpm typecheck && pnpm test && pnpm audit --prod. Actualizá docs/trazabilidad.md y la tabla de estado del README. Resumime lo hecho, lo pendiente y los riesgos de seguridad que viste, aunque no sean de la tarea actual.
```

## 5. Prompts de las etapas 2 a 7

Están en `docs/PLAN_DE_TRABAJO.md`, sección 3, uno por etapa.
