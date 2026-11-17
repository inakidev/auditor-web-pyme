# Plan de desarrollo: Auditor Web Pyme

Versión 0.1. Complementa a `REQUISITOS.md` y a `CLAUDE.md`. Las fechas se ajustan a las entregas de la materia; el plan se organiza por sprints de una semana.

## 1. Ciclo de vida y metodología

**Modelo elegido:** Scrum liviano con entregas incrementales (sprints de una semana) y tablero Kanban. **Por qué:** el equipo es de una persona asistida por IA; los requisitos se van afinando con el feedback de las pruebas con usuarios y del docente (los modelos secuenciales como cascada no toleran bien ese cambio); y el incremento permite mostrar algo usable desde el Sprint 1. Se toman de XP las pruebas primero (TDD) para los checks y la integración continua.

**Correspondencia con las siete fases del ciclo de vida (Kendall y Kendall, 2011):**

| Fase | Actividades en este proyecto | Entregable | Sprint |
|---|---|---|---|
| 1. Problemas, oportunidades y objetivos | Justificación, informe de viabilidad, objetivos medibles | `REQUISITOS.md` secciones 1 a 3 | 0 |
| 2. Requerimientos de información | Análisis de herramientas existentes, observación de la revisión manual, consulta a expertos, cuestionario, prototipo | Sección 4 y 10 de requisitos, guion y resultados | 0 |
| 3. Análisis de necesidades | Priorización MoSCoW, casos de uso, modelo de datos preliminar | Requisitos funcionales y no funcionales | 0 |
| 4. Diseño | Arquitectura, modelo de datos, API, wireframes del informe, diseño de seguridad | Este documento, ADRs, wireframes | 0 a 1 |
| 5. Desarrollo | Implementación por historias con TDD | Código, pruebas, CI | 1 a 4 |
| 6. Pruebas y verificación | Unitarias, integración, suite SSRF, e2e, usabilidad, aceptación | Plan y reportes de pruebas | 1 a 4 |
| 7. Implementación y mantenimiento | Despliegue con Docker, pruebas finales, plan de mantenimiento | Sitio en producción, manual, backlog de mejoras | 4 |

## 2. Arquitectura

```
  Navegador (React) --HTTPS--> API (Fastify) --> Cola en proceso --> Scanner
                                   |                                  |
                                   v                                  v
                               SQLite (Drizzle)           safeFetch --> Sitio objetivo
```

- **Web:** formulario de URL, vista de progreso, informe, exportación a PDF (en el navegador), login y panel de consultores.
- **API:** validación con zod, rate limiting, sesiones, endpoints de auditorías, leads y administración.
- **Cola en proceso:** concurrencia de 2 trabajos; los trabajos se registran en la base para sobrevivir a reinicios. Si hace falta escalar, se cambia por una cola externa (decisión futura).
- **Scanner:** librería pura. `safeFetch`, un `AuditContext` (página principal ya descargada, cabeceras, HTML parseado) y una lista de checks.

### Estructura del repositorio
```
apps/api/src/{routes,services,jobs,db,auth}
apps/web/src/{pages,components,lib}
packages/scanner/src/{net,checks,scoring,fixtures}
packages/shared/src/{schemas,types}
docs/{REQUISITOS.md,PLAN_DE_DESARROLLO.md,trazabilidad.md,decisiones/}
```

## 3. Modelo de datos (borrador)

- **users**: id, email, password_hash, role (`consultant`), mfa_secret (nullable), created_at.
- **audits**: id, token (aleatorio de 128 bits o más), url, domain, status (`queued|running|done|failed`), error_code, started_at, finished_at, expires_at, score_total, score_security, score_seo, score_analytics, score_trust, score_perf, requester_ip_hash, lead_id (nullable).
- **findings**: id, audit_id, check_id, category, status (`pass|warn|fail|na`), severity, title, evidence (JSON truncado), recommendation, effort (`low|medium|high`).
- **leads**: id, email, consent_at, domain, status (`new|contacted|proposal|closed`), created_at.
- **lead_events**: id, lead_id, user_id, from_status, to_status, note, created_at (historial de cambios con fecha y usuario, RF-14).
- **rate_limits** (o el almacenamiento del plugin): clave hasheada, ventana, contador.
Índices por `token`, `domain`, `created_at` y `expires_at`.

## 4. API (borrador)

| Método y ruta | Descripción | Acceso |
|---|---|---|
| `POST /api/audits` | Crea una auditoría `{url, email?, consent?}`; responde 202 con `{token}` | Público con rate limit |
| `GET /api/audits/:token` | Estado y, si terminó, el informe | Público con el token |
| `POST /api/auth/login`, `POST /api/auth/logout` | Sesión de consultores | Público / sesión |
| `GET /api/admin/audits` y `GET /api/admin/audits/:id` | Listado y detalle con filtros | Sesión |
| `GET /api/admin/compare?a=&b=` | Comparación de dos auditorías del mismo dominio | Sesión |
| `GET /api/admin/leads`, `PATCH /api/admin/leads/:id` | Gestión de leads | Sesión + CSRF |
| `DELETE /api/admin/audits/:id`, `DELETE /api/admin/leads/:id` | Borrado a pedido | Sesión + CSRF |
| `GET /api/health` | Estado del servicio | Público |

## 5. Catálogo de checks (todos pasivos)

Estado posible: cumple, advertencia, no cumple, no aplica. Severidad por defecto entre paréntesis (C crítica, A alta, M media, B baja, I informativa).

**Seguridad (SEC)**
| ID | Check |
|---|---|
| SEC-01 | HTTPS disponible (conexión TLS en el puerto 443) (C) |
| SEC-02 | HTTP redirige a HTTPS con 301 o 308 (A) |
| SEC-03 | Certificado válido: cadena, nombre de host y vencimiento (más de 14 días; avisar a menos de 30) (C/A) |
| SEC-04 | Versión de TLS negociada de 1.2 o superior (M) |
| SEC-05 | HSTS presente con `max-age` de al menos 6 meses (M) |
| SEC-06 | Content-Security-Policy presente (solo presencia y observaciones simples) (M) |
| SEC-07 | `X-Content-Type-Options: nosniff` (B) |
| SEC-08 | Protección contra clickjacking (`X-Frame-Options` o `frame-ancestors`) (M) |
| SEC-09 | `Referrer-Policy` (B) |
| SEC-10 | `Permissions-Policy` (I) |
| SEC-11 | Cookies con `Secure`, `HttpOnly` y `SameSite` según corresponda (M) |
| SEC-12 | Divulgación de versiones (`Server`, `X-Powered-By`, meta `generator` con versión) (B) |
| SEC-13 | Contenido mixto: recursos `http://` en una página HTTPS (M) |
| SEC-14 | Formularios que envían a HTTP o campos de contraseña en una página sin HTTPS (A) |
| SEC-15 | Scripts de terceros sin Subresource Integrity (I) |
| SEC-16 | `/.well-known/security.txt` presente (I) |

**SEO**
| ID | Check |
|---|---|
| SEO-01 | `title` presente y de largo razonable (A) |
| SEO-02 | Meta description presente y de largo razonable (M) |
| SEO-03 | Un solo H1 (M) |
| SEO-04 | `canonical` (B) |
| SEO-05 | `lang` del documento y coherencia con el idioma de título y descripción (heurística) (M) |
| SEO-06 | Meta `viewport` (A) |
| SEO-07 | Open Graph y Twitter Cards con título, descripción e imagen (M) |
| SEO-08 | Porcentaje de imágenes con `alt` (M) |
| SEO-09 | `robots.txt` presente y que no bloquee todo el sitio (A/C) |
| SEO-10 | `sitemap.xml` presente o declarado (B) |
| SEO-11 | Meta robots `noindex` accidental (C) |
| SEO-12 | Enlaces internos rotos (hasta 20 verificados) (M) |
| SEO-13 | `hreflang` si hay varios idiomas (B) |
| SEO-14 | Datos estructurados JSON-LD (I) |
| SEO-15 | Favicon (I) |

**Rendimiento liviano (PER)**: PER-01 compresión gzip o brotli (B), PER-02 tiempo de respuesta del HTML (M), PER-03 peso del HTML y cantidad de scripts referenciados (I).

**Analítica (ANA)**: ANA-01 detección de GA4, GTM, Matomo o Plausible (A si no hay ninguna), ANA-02 Universal Analytics obsoleto (`UA-`) (M), ANA-03 Meta Pixel (I), ANA-04 señal de aviso de cookies cuando hay trackers (I, heurística), ANA-05 enlaces de contacto medibles (`tel:`, `mailto:`, `wa.me`) (I).

**Confianza y contacto (TRU)**: TRU-01 medios de contacto visibles (A), TRU-02 formulario de contacto detectado (I), TRU-03 enlace a política de privacidad (M), TRU-04 redes sociales enlazadas (I), TRU-05 datos del negocio visibles (dirección, teléfono) (I). Idea para la versión 2: botón de arrepentimiento y enlace a Defensa del Consumidor en comercios electrónicos (**validar la normativa vigente antes de implementarlo**).

**Reglas de redacción de hallazgos.** Cada check devuelve un texto en lenguaje claro, evidencia mínima y la acción concreta. Los hallazgos heurísticos (idioma, cookies) se redactan como "podría ser un problema, verificalo" y no como una afirmación.

### Puntaje
Pesos por severidad: C = 5, A = 3, M = 2, B = 1, I = 0. Resultado por check: cumple = 1, advertencia = 0,5, no cumple = 0, no aplica = se excluye.
`Puntaje de categoría = 100 × Σ(peso × resultado) / Σ(peso)`.
Ponderación global inicial: seguridad 35 %, SEO 30 %, analítica 15 %, confianza 15 %, rendimiento 5 %. Todo se define en un archivo de configuración. Bandas: A ≥ 90, B 75 a 89, C 60 a 74, D 40 a 59, E < 40. Revisar pesos con los resultados de las pruebas de usabilidad.

## 6. Diseño de seguridad (resumen; el detalle obligatorio está en `CLAUDE.md`)

- **SSRF:** `safeFetch` con validación de todas las IPs, anclaje de IP, revalidación en redirects, límites de tiempo y tamaño, solo puertos 80/443.
- **Abuso:** tope por IP hasheada, cooldown por dominio, cola acotada, `robots.txt` respetado fuera de la página principal, User-Agent identificable. Términos de uso que establecen que solo se auditan sitios públicos.
- **XSS e inyección:** el contenido auditado no se ejecuta ni se renderiza; evidencia truncada y escapada; consultas parametrizadas.
- **Privacidad:** correo solo con consentimiento registrado; IP hasheada con sal; informes con vencimiento de 30 días; borrado a pedido; logs sin datos personales.
- **Cuentas de consultores:** argon2id, sesiones seguras, CSRF, bloqueo progresivo, TOTP como mejora.

## 7. Plan de pruebas

| Nivel | Qué cubre | Herramienta |
|---|---|---|
| Unitarias | Cada check con fixtures de HTML y cabeceras; puntaje; normalización de URL | Vitest |
| **Suite SSRF** | Casos de abajo; resolver DNS simulado | Vitest |
| Integración | API con base en memoria; servidor de fixture local que simula redirects, timeouts y respuestas enormes | Vitest + servidor de prueba |
| Seguridad | Fixtures con HTML malicioso (scripts, atributos, títulos enormes); límites de tasa; sesiones | Vitest |
| E2E | Flujo de URL a informe; login y panel | Playwright |
| Usabilidad | 2 o 3 personas leyendo un informe real y respondiendo el cuestionario | Manual |
| Aceptación | Revisión de los criterios de `REQUISITOS.md` contra el sistema desplegado; con pymes solo si se consiguen y con consentimiento | Manual |

**Casos mínimos de la suite SSRF** (todos deben ser rechazados): `http://127.0.0.1`, `http://localhost`, `http://0.0.0.0`, `http://10.0.0.1`, `http://172.16.0.1`, `http://192.168.1.1`, `http://169.254.169.254`, `http://[::1]`, `http://[fd00::1]`, `http://[fe80::1]`, `http://[::ffff:127.0.0.1]`, `http://2130706433` (decimal), `http://0177.0.0.1` (octal), `http://0x7f000001` (hexadecimal), `http://ejemplo.com@127.0.0.1`, `file:///etc/passwd`, `gopher://...`, `ftp://...`, puertos como `:22`, `:6379` y `:8080`, un dominio que resuelve a una IP interna, un dominio que primero resuelve a una IP pública y luego a una interna (rebinding), una redirección 302 a un destino interno, y una cadena de más de 3 redirects.

**Criterio de salida de cada sprint:** historias aceptadas, pruebas en verde, DoD cumplida y demo.

## 8. Plan por sprints

> **Nota:** el plan de trabajo vigente es [PLAN_DE_TRABAJO.md](PLAN_DE_TRABAJO.md), organizado por etapas. Las historias y los requisitos son los de esta sección; solo cambió el ritmo.

### Sprint 0: preparación, relevamiento y diseño
- Estructura del monorepo, scripts, ESLint con la regla anti-`fetch`, CI, Docker base.
- Relevamiento: análisis de herramientas existentes, cronometrar una revisión manual propia y consultar al equipo de la agencia; actualizar `REQUISITOS.md` (sección 10). Las entrevistas a pymes son opcionales.
- Wireframes del informe y prototipo navegable; ADRs iniciales (stack, cola en proceso, SQLite).
- **Salida:** requisitos revisados, repositorio con CI en verde, informe de viabilidad.

### Sprint 1: núcleo seguro
- H1 `safeFetch` con la suite SSRF completa (RF-02, RNF-01).
- H2 API de auditorías, cola y estado (RF-01, RF-09 parcial).
- H3 checks SEC-01 a SEC-05 y SEC-07 a SEC-09 (RF-03).
- H4 pantalla mínima: ingresar URL, ver progreso y resultados en bruto.
- **Demo:** auditar un sitio propio y ver los primeros hallazgos.

### Sprint 2: informe completo
- H5 checks de SEO y rendimiento liviano (RF-04).
- H6 checks de analítica (RF-05).
- H7 puntaje y bandas (RF-07).
- H8 informe web legible, en móvil (RF-08).
- H9 recomendaciones redactadas en rioplatense (RF-19).
- **Demo:** informe completo con puntajes.

### Sprint 3: negocio y administración
- H10 checks de confianza y contacto (RF-06) y resto de seguridad (SEC-06, SEC-10 a SEC-16).
- H11 captura de lead con consentimiento (RF-11).
- H12 login y panel de consultores (RF-12), estados y notas (RF-14).
- H13 exportación a PDF (RF-10).
- **Demo:** flujo de la pyme y flujo del consultor.

### Sprint 4: endurecimiento, pruebas y cierre
- H14 límites de uso, retención y purga, borrado (RF-15, RF-16, RNF-05).
- H15 comparación de auditorías (RF-13).
- H16 pruebas e2e, prueba de usabilidad con 2 o 3 personas (pymes si se consiguen) y ajuste de pesos y textos.
- H17 despliegue con Docker en un VPS, HTTPS, términos de uso y aviso de privacidad, manual de uso y de mantenimiento.
- H18 presentación final: problema, requisitos, ciclo de vida, resultados y lecciones.
- **Demo:** sistema en producción.

**Mejoras futuras (backlog):** TOTP, verificación de dominio (RF-17), monitoreo programado (RF-18), renderizado con navegador sin cabeza (con aislamiento fuerte), botón de arrepentimiento, planes de pago.

## 9. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Que la herramienta se use para atacar o espiar terceros | Media | Alto | Solo checks pasivos, límites de tasa, User-Agent identificable, términos de uso, sin sondeo de rutas |
| SSRF u otra falla en `safeFetch` | Media | Crítico | Suite de pruebas, revisión manual, regla anti-`fetch`, anclaje de IP |
| Falsos positivos o negativos | Alta | Medio | Textos prudentes, severidades calibradas, evidencia visible, pruebas con usuarios para ajustar |
| Sitios con WAF o que bloquean bots | Media | Medio | Estado "no pudimos acceder" sin penalizar; mensaje explicativo |
| Sitios que dependen de JavaScript para el contenido | Media | Medio | Informar la limitación; renderizado como mejora futura |
| Sin usuarios externos para probar | Media | Medio | Probar con 2 o 3 personas no técnicas (compañeros, familiares); el piloto con una pyme es opcional y se hace con permiso |
| Calidad o seguridad del código generado con IA | Media | Alto | TDD, revisión de cada diff, CI, dependencias verificadas, reglas de `CLAUDE.md` |
| Plazo corto | Alta | Medio | MoSCoW; los **C** quedan fuera sin culpa |
| Datos personales mal tratados | Baja | Alto | Mínimos, consentimiento, retención, purga, logs limpios |

## 10. Cómo trabajar con Claude Code

1. Poné `CLAUDE.md` en la raíz del repo y `REQUISITOS.md` y este plan en `docs/`. Revisá en la documentación vigente de Claude Code cómo restringir la lectura de archivos `.env`.
2. Una conversación por historia. Empezá siempre en modo plan, revisá el plan y recién entonces permití editar.
3. Pedí pruebas primero en los checks; revisá cada diff antes de aceptarlo.
4. Prompts sugeridos:
   - **Sprint 0:** "Leé CLAUDE.md, docs/REQUISITOS.md y docs/PLAN_DE_DESARROLLO.md. En modo plan, proponé la estructura del monorepo, los scripts raíz, la configuración de ESLint (incluida la regla que prohíbe `fetch` fuera de `safeFetch`) y el pipeline de CI. No escribas código todavía."
   - **H1:** "Implementá `safeFetch` con TDD. Primero escribí la suite SSRF con todos los casos de la sección 7 del plan, usando un resolver DNS inyectable. Después implementá hasta que pasen. Mostrame las decisiones sobre anclaje de IP y redirects."
   - **Cada check:** "Implementá el check SEO-05 con fixtures en español e inglés, incluyendo el caso de una página en inglés con la descripción en español. Redactá la recomendación en rioplatense."
   - **Cierre de historia:** "Corré lint, typecheck y tests; actualizá docs/trazabilidad.md y resumí lo hecho, lo pendiente y los riesgos que viste."
5. Declará el uso de Claude Code en el informe como herramienta del ciclo de vida y guardá evidencia (planes, PRs, decisiones).

## 11. Trazabilidad (plantilla de `docs/trazabilidad.md`)

| Requisito | Historia | Pruebas | Commit o PR | Estado |
|---|---|---|---|---|
| RF-02 | H1 | `safe-fetch.ssrf.test.ts` | [a completar] | Pendiente |
| RF-03 | H3, H10 | `checks/sec-*.test.ts` | [a completar] | Pendiente |
| ... | ... | ... | ... | ... |

## 12. Definición de hecho global (versión entregable)

Todos los requisitos **M** cumplidos; suite SSRF y pruebas de seguridad en verde; cobertura por encima del umbral; prueba de usabilidad realizada con al menos 2 personas y cuestionario respondido (el piloto con una pyme es opcional); despliegue funcionando con HTTPS; términos de uso, aviso de privacidad y manual publicados; documentación y trazabilidad actualizadas.
