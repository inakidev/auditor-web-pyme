# Auditor Web Pyme

Aplicación web que revisa de forma **pasiva** el sitio público de una pyme y devuelve un informe en español, con puntajes y acciones priorizadas en seguridad, SEO, analítica y confianza.

## Datos de la entrega

| Dato | Valor |
|---|---|
| Nombre y apellido | Iñaki Nicolás Antonena |
| Mail | iantonena@alumnos.kennedy.edu.ar |
| Fecha de entrega | 23/11/2026 |
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
| Puntos terminados | 61 de 85 |
| Avance | 71,8 % |
| Meta del Avance 3 | 51 puntos (60 %) |
| Última actualización | 18/11/2026 (H12, cierre de la etapa 5) |

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

Requisitos: Node.js 24 LTS, pnpm 12 y Git. Docker es opcional.

### 1. Instalar y probar

```
git clone https://github.com/inakidev/auditor-web-pyme.git
cd auditor-web-pyme
pnpm install        # compila argon2 y better-sqlite3 (habilitados en pnpm-workspace.yaml)
pnpm test           # todas las pruebas; no usan red ni necesitan .env
```

En Windows, si PowerShell bloquea `pnpm` por la política de ejecución, usá `pnpm.cmd` o corré una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 2. Configurar el entorno

```
cp .env.example .env              # PowerShell: Copy-Item .env.example .env
```

| Variable | Desarrollo | Producción |
|---|---|---|
| `AUDITOR_CONTACT_URL` | Opcional | Obligatoria: URL de contacto que va en el User-Agent |
| `PUBLIC_ORIGIN` | Si queda el valor de ejemplo, usa `http://localhost:5173` | Obligatoria: origen exacto de la web, con https y sin barra final |
| `IP_HASH_SALT` | Opcional | Obligatoria: 32 caracteres aleatorios o más |
| `ADMIN_EMAIL` y `ADMIN_PASSWORD_HASH` | Solo si querés entrar al panel | Obligatorias |
| `DATABASE_PATH`, `HOST`, `PORT`, `LOG_LEVEL` | Tienen valores por defecto | Tienen valores por defecto |

En producción la API no arranca si falta una variable obligatoria o si quedó el valor de ejemplo de `.env.example`.

Para generar la sal:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 3. Crear el usuario del panel

```
pnpm --filter @auditor/api user:hash
```

El comando pide la contraseña dos veces, sin mostrarla en pantalla. Nunca la recibe por argumento, así no queda en el historial de la terminal. Imprime un hash argon2id. Pegalo en `.env` **entre comillas simples**, porque el hash tiene signos `$` y sin comillas Docker Compose los interpreta como variables:

```
ADMIN_EMAIL=consultor@tu-agencia.com
ADMIN_PASSWORD_HASH='$argon2id$v=19$m=19456,t=2,p=1$...$...'
```

Si en cambio lo escribís en la sección `environment:` de `docker-compose.yml`, cada `$` va como `$$`.

El usuario se crea al arrancar la API, solo si no existe ninguno. Una contraseña existente nunca se pisa. Esta versión no permite cambiar la contraseña; ver el [ADR 0007](docs/decisiones/0007-sesiones-csrf-y-bloqueo.md).

### 4. Levantar la aplicación

```
pnpm dev            # API en http://127.0.0.1:3000 e interfaz en http://localhost:5173
```

- Informe: http://localhost:5173
- Panel: http://localhost:5173/panel

Para el panel usá Chrome, Edge o Firefox. Safari no acepta cookies `Secure` en `http://localhost`.

### Otros comandos

```
pnpm test:scanner   # solo las pruebas del scanner
pnpm test:coverage  # pruebas con cobertura (umbrales: 80 % scanner, 70 % resto)
pnpm lint           # ESLint y Prettier
pnpm typecheck      # TypeScript estricto
pnpm build          # compila todos los paquetes
pnpm check:guides   # verifica a mano que las guías de las recomendaciones respondan
docker compose up   # API en contenedor con la imagen de producción (lee .env)
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

**Licencia:** todos los derechos reservados (ver [LICENSE](LICENSE)). El repositorio es público solo para la evaluación académica. Que sea visible no autoriza a copiarlo ni a usarlo con fines comerciales.
