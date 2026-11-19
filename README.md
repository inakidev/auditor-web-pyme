# Auditor Web Pyme

Aplicación web que revisa de forma **pasiva** el sitio público de una pyme y devuelve un informe en español, con puntajes y acciones priorizadas en seguridad, SEO, analítica y confianza.

## Datos de la entrega

| Dato | Valor |
|---|---|
| Nombre y apellido | Iñaki Nicolás Antonena |
| Mail | iantonena@alumnos.kennedy.edu.ar |
| Fecha de entrega | [completar el día de la entrega] |
| Carrera | Tecnicatura Universitaria en Tecnologías de la Información, orientada a Desarrollo Web |
| Materia | Taller de Proyectos II |
| Nombre del informe | Avance 3: Repositorio y avance del proyecto (Auditor Web Pyme) |
| Integrantes | 1 (trabajo individual) |

## Qué problema resuelve

Los sitios de las pymes suelen tener fallas que sus dueños no ven: certificados vencidos, falta de cabeceras de seguridad, metadatos incompletos, formularios rotos o falta de medición. Una revisión manual lleva tiempo y reúne herramientas dispersas. Esta aplicación hace la revisión en minutos y la entrega en un informe claro, con las acciones ordenadas por prioridad.

## Estado del proyecto

El avance se mide en **puntos de historia** sobre el alcance de la versión entregable (85 puntos). La meta del Avance 3 es llegar al 60 % (51 puntos). El detalle está en [docs/PLANIFICACION.md](docs/PLANIFICACION.md).

| Indicador | Valor |
|---|---|
| Puntos terminados | 50 de 85 |
| Avance | 58,8 % |
| Meta del Avance 3 | 51 puntos (60 %) |
| Última actualización | 18/11/2026 (H9) |

> Actualizá esta tabla cada vez que se cierra una historia. Una historia cuenta solo si cumple su definición de hecho (pruebas en verde, revisión hecha y documentación al día).

## Estructura del repositorio

```
apps/api          API (Node.js, Fastify)
apps/web          Interfaz web (React)
packages/scanner  Librería de checks y cliente HTTP seguro
packages/shared   Tipos y esquemas compartidos
docs/             Requisitos, plan, planificación, trazabilidad, pruebas y mantenimiento
```

## Cómo ejecutarlo

Requisitos: Node.js 24 LTS y pnpm 12. Copiá `.env.example` como `.env` antes de empezar.

```
pnpm install
pnpm dev            # API en http://127.0.0.1:3000 e interfaz en http://localhost:5173
pnpm test           # todas las pruebas (pnpm test:scanner: solo el scanner)
pnpm lint           # ESLint y Prettier
pnpm typecheck      # TypeScript estricto
pnpm build          # compila todos los paquetes
pnpm check:guides   # verifica a mano que las guías de las recomendaciones respondan
docker compose up   # API en contenedor (requiere Docker)
```

## Metodología y planificación

Scrum liviano con sprints cortos, tablero Kanban y pruebas primero en los checks. Las fases siguen el ciclo de vida de Kendall y Kendall (2011). Ver [docs/PLANIFICACION.md](docs/PLANIFICACION.md), que incluye la estructura de desglose del trabajo, el cronograma y el control de desvíos.

## Documentación

- [Requisitos](docs/REQUISITOS.md)
- [Plan de desarrollo](docs/PLAN_DE_DESARROLLO.md)
- [Planificación, cronograma y seguimiento](docs/PLANIFICACION.md)
- [Plan de trabajo por etapas](docs/PLAN_DE_TRABAJO.md)
- [Trazabilidad requisito, historia y prueba](docs/trazabilidad.md)
- [Registro de pruebas](docs/pruebas.md)
- [Registro de mantenimiento](docs/mantenimiento.md)

## Colaboración

Proyecto individual. Todo el trabajo, con su fecha y autor, queda registrado en el historial de commits y en el tablero de historias del repositorio.

## Uso académico

Proyecto desarrollado para Taller de Proyectos II (Universidad Kennedy). Solo realiza análisis pasivos de sitios públicos y no debe usarse para fines ofensivos.
