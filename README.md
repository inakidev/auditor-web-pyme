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

> **Demo pública:** los informes no se conservan entre reinicios del servicio y el primer acceso puede tardar hasta un minuto (plan gratuito de Render). Ver [Despliegue](#despliegue-en-render).

## Qué problema resuelve

Los sitios de las pymes suelen tener fallas que sus dueños no ven: certificados vencidos, falta de cabeceras de seguridad, metadatos incompletos, formularios rotos o falta de medición. Una revisión manual lleva tiempo y reúne herramientas dispersas. Esta aplicación hace la revisión en minutos y la entrega en un informe claro, con las acciones ordenadas por prioridad.

## Estado del proyecto

El avance se mide en **puntos de historia** sobre el alcance de la versión entregable (85 puntos). La meta del Avance 3 es llegar al 60 % (51 puntos). El detalle está en [docs/PLANIFICACION.md](docs/PLANIFICACION.md).

| Indicador | Valor |
|---|---|
| Puntos terminados | 80 de 85 |
| Avance | 94,1 % |
| Meta del Avance 3 | 51 puntos (60 %) |
| Última actualización | 23/11/2026 (H17 y H18; H16 en revisión hasta cargar la prueba de usabilidad) |

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
| `PORT` | 3000 por defecto | Obligatoria (Render la define sola) |
| `TRUST_PROXY_HOPS` | 0 (conexión directa) | 3 detrás del proxy de Render (medido) |
| `CONTACT_CAPTURE_ENABLED` | `true` | `false` hasta publicar los textos legales |
| `DEMO_NOTICE` | `true` | `true` en la demo |
| `AUDIT_LIMIT_PER_IP`, `AUDIT_LIMIT_WINDOW_MINUTES`, `DOMAIN_COOLDOWN_SECONDS`, `DAILY_AUDIT_CAP`, `AUDIT_CONCURRENCY`, `AUDIT_MAX_PENDING` | 20 por hora, 30 s, 300 por día, 2 y 20 | Igual (ver `.env.example`) |
| `DATABASE_PATH`, `HOST`, `LOG_LEVEL` | Tienen valores por defecto | Tienen valores por defecto |

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
pnpm test:e2e       # e2e en Chromium (la primera vez: pnpm exec playwright install chromium)
docker compose up   # API en contenedor con la imagen de producción (lee .env)
```

## Cómo se usa

**Para una pyme:**
1. En la portada, escribí la dirección de tu sitio y, si querés que te contactemos, tu correo con la casilla de consentimiento.
2. Esperá unos segundos mientras se ven las fases de la revisión.
3. El informe muestra el puntaje con su nivel, lo que conviene arreglar primero y el detalle por área, con guías.
4. Con **Descargar PDF** lo guardás o lo imprimís. El enlace del informe dura 30 días.

**Para el consultor** (en `/panel`, con usuario y contraseña):
- **Auditorías:** listado con filtros por dominio, fecha, puntaje y estado; detalle de cada informe y borrado.
- **Contactos:** quienes dejaron su correo. En el detalle de cada contacto se cambia el estado (nuevo, contactado, propuesta o cerrado), se agregan notas y queda el historial con fecha y usuario.

## Despliegue en Render

La demo corre en el plan gratuito de Render: un solo servicio web con Docker que sirve la API y la web compilada. La configuración está en [render.yaml](render.yaml) (Blueprint) y las decisiones en el [ADR 0008](docs/decisiones/0008-despliegue-en-render-y-limites.md).

**Ciclo de vida del plan gratuito:**
- Se apaga tras 15 minutos sin tráfico y tarda hasta un minuto en volver.
- Render puede reiniciarlo en cualquier momento.
- El disco es efímero: la base SQLite se pierde en cada reinicio, redeploy o apagado. Al arrancar, la API crea la base vacía, corre las migraciones y crea el usuario del panel desde `ADMIN_EMAIL` y `ADMIN_PASSWORD_HASH`. No hay que hacer nada para recrearlo.
- Da 750 horas por mes. Un ping externo a `/api/health` cada pocos minutos mantiene el servicio despierto (unas 744 horas en un mes de 31 días). Un segundo servicio gratuito en la misma cuenta agotaría las horas.

**Crear el servicio:**
1. En Render, **New → Blueprint**, elegí este repositorio. Render lee `render.yaml`.
2. Completá las variables que pide:
   - `PUBLIC_ORIGIN`: la URL final del servicio, por ejemplo `https://auditor-web-pyme.onrender.com`, sin barra final. Tiene que coincidir **exactamente**. Si Render le agrega un sufijo al nombre porque ya existe, corregila en el panel. Un `PUBLIC_ORIGIN` incorrecto rompe el ingreso al panel por la verificación de Origin.
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD_HASH`: el hash se genera en tu máquina con `pnpm --filter @auditor/api user:hash`. En el panel de Render pegalo **tal cual, sin comillas y sin escapar los `$`**: Render no interpreta el valor. Si quedara mal (comillas o sin los `$`), la API no arranca y el log dice cuál de los dos problemas tiene.
   - `AUDITOR_CONTACT_URL`: por ahora, `https://github.com/inakidev/auditor-web-pyme`.
3. `IP_HASH_SALT` se genera sola una única vez. Cambiarla reinicia los contadores de uso, que de todas formas viven en memoria y se pierden con cada reinicio.
4. La región es `virginia`, la más cercana a la Argentina de la lista de Render. No se puede cambiar después.
5. `TRUST_PROXY_HOPS` va en 3: se midió el 23/11/2026 con `LOG_PROXY_CHAIN=true`, que muestra cuántas entradas trae `X-Forwarded-For` sin mostrar las IP. Con 3 el bloqueo de ingresos responde 429 tras 5 fallos y una cabecera falsa no lo esquiva; con 1 o 2 la app tomaba la IP de un proxy que rota. Si Render cambia su red, repetí la medición y la prueba.

Si falta alguna variable obligatoria, la API no arranca y el log las lista todas juntas.

### Antes de entregar

- [x] Textos legales revisados y publicados (23/11/2026); `CONTACT_CAPTURE_ENABLED=true`.
- [ ] `autoDeployTrigger` en `off` (en el panel o en `render.yaml`): cada deploy borra la base y reinicia en frío.
- [ ] Ping externo activo contra `/api/health`.
- [ ] Credenciales del docente cargadas en el panel.

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
