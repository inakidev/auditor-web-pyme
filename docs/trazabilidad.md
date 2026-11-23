# Trazabilidad

Relaciona cada requisito con la historia que lo construye, las pruebas que lo verifican y el commit donde se cumple. Se actualiza al cerrar cada historia.

Estados: Pendiente, En curso, Hecho o Pospuesto (fuera de la versión entregable).

## Requisitos funcionales

| Requisito | Historia | Pruebas previstas | Commit o PR | Estado |
|---|---|---|---|---|
| RF-01 Solicitar auditoría | H2, H4 | `scanner/test/target-url.test.ts`; `api/src/routes/audits.test.ts`; `web/src/App.test.tsx` | `feat(api): agrega auditorías…`, `feat(web): agrega la interfaz mínima…` | Hecho |
| RF-02 Validar destino | H1 | `packages/scanner/test/safe-fetch.{ssrf,integration,production}.test.ts` | `feat(scanner): agrega safeFetch…` | Hecho |
| RF-03 Checks de seguridad | H3, H10 | `scanner/test/checks/security.test.ts` (fixtures, sin red) y `run-audit.integration.test.ts`, `security-extra.test.ts` | `feat(scanner): agrega los checks…` (H3 y H10) | Hecho |
| RF-04 Checks de SEO | H5 | `scanner/test/checks/seo.test.ts` (fixtures es/en, incluye página en inglés con descripción en español), `crawl/*.test.ts` | `feat(scanner): agrega los checks de SEO…` | Hecho |
| RF-05 Checks de analítica | H6 | `scanner/test/checks/analytics.test.ts` (GA4, GTM, Matomo, Plausible, UA, Meta Pixel, aviso de cookies, sin medición; la evidencia no muestra IDs) | `feat(scanner): agrega los checks de analítica…` | Hecho |
| RF-06 Checks de confianza | H10 | `scanner/test/checks/trust.test.ts` (contacto, formulario, privacidad, redes, datos del negocio; la evidencia nunca copia datos) | `feat(scanner): agrega los checks de confianza…` | Hecho |
| RF-07 Puntaje | H7 | `scanner/test/scoring.test.ts` (fórmula, exclusiones, repondera, bandas, determinismo); `api/src/routes/audits.test.ts`; integración con fixtures | `feat: agrega el puntaje…` | Hecho |
| RF-08 Informe web | H4, H8 | `web/src/App.test.tsx` (estados del informe, orden por severidad); e2e en H16; pantallas P2 y P3 de los wireframes | `feat(web): agrega la interfaz mínima…`, `feat(web): arma el informe…` | Hecho (la validación con usuarios es H16) |
| RF-09 Enlace único con vencimiento | H2, H8 | `api/src/routes/audits.test.ts` (token de 256 bits, hash en la base, 404 y 410) | `feat(api): agrega auditorías…` | Hecho |
| RF-10 Exportar a PDF | H17 | `web/src/App.test.tsx` (botón y encabezado de impresión con logo, fecha y URL); `e2e/informe.spec.ts` (imprime con todas las secciones abiertas, oculta la navegación y genera un PDF real en Chromium) | `feat(web): exporta el informe a PDF…` | Hecho |
| RF-11 Contacto con consentimiento | H11 | `api/src/routes/audits.test.ts` (sin consentimiento no se guarda nada; fecha y versión del texto; el correo no sale en el informe ni en los logs) | `feat: agrega el contacto con consentimiento…` | Hecho |
| RF-12 Panel de consultores | H12 | `api/src/routes/admin.test.ts` (lista explícita de rutas públicas y del panel; sin sesión, 401; paginado de hasta 100; filtros por dominio, fecha, puntaje y estado con límites); `web/src/App.test.tsx` (P4: ingreso, listados y detalle) | `feat: agrega el panel de consultores con sesión…` | Hecho |
| RF-13 Comparar auditorías | | | | Pospuesto |
| RF-14 Estados y notas | H18 | `api/src/routes/leads.test.ts` (estado y notas con fecha y usuario, historial ordenado, validación, CSRF, notas fuera de los logs, borrado en cascada con el contacto y la purga); `e2e/panel.spec.ts` (cambio de estado y nota desde el panel) | `feat: agrega el seguimiento de contactos…` | Hecho |
| RF-15 Límites de uso | H13 | `api/src/limits/usage-limits.test.ts` y `api/src/routes/limits.test.ts` (tope por IP, cooldown por dominio normalizado, tope diario a la medianoche de Buenos Aires, 429 con `Retry-After` entero, el 429 no extiende el período, reinicio del contador, mapa lleno falla cerrado sin expulsar claves vigentes, IP solo como HMAC, `X-Forwarded-For` falsificado no esquiva el límite) | `feat: agrega límites de uso, purga, borrado y despliegue en Render…` | Hecho |
| RF-16 Borrado y purga | H14 | `api/src/jobs/purge.test.ts` (reloj simulado: informes a 30 días sin hallazgos huérfanos, contactos 30 días después de su última auditoría, sesiones, contadores con el horizonte del ADR 0007); `api/src/routes/admin.test.ts` (borrado manual con sesión y CSRF, purga al arrancar) | `feat: agrega límites de uso, purga, borrado y despliegue en Render…` | Hecho |
| RF-19 Recomendaciones | H9 | Textos en rioplatense revisados (sin tuteo); `scanner/test/checks/guides.test.ts` (guías https de fuentes permitidas); `pnpm check:guides` (30 de 30 responden, 18/11/2026) | `feat: agrega guías…` | Hecho |

## Requisitos no funcionales

| Requisito | Historia | Verificación | Estado |
|---|---|---|---|
| RNF-01 SSRF y abuso | H1 | Suite SSRF en verde y revisión manual de `safeFetch` aprobada (18/11/2026) | Hecho |
| RNF-02 Autenticación robusta | H12 | `api/src/routes/auth.test.ts` (cookies `__Host-`, doble envío y token sincronizado, Origin estricto, sesión nueva al ingresar, vencimiento a 30 min y 8 h, bloqueo por correo + IP y tope por IP, /64 en IPv6, 503 con argon2 ocupado, logs sin correo, cookies ni IP); `api/src/config.test.ts` (variables obligatorias y hash argon2id válido); lista ASVS nivel 1 en el ADR 0007 | Hecho |
| RNF-03 Sin XSS | H4, H8 | Evidencia maliciosa escapada (`web/src/App.test.tsx`); regla ESLint contra dangerouslySetInnerHTML; helmet con CSP `default-src 'none'` en la API y `no-referrer` (H8); CSP del documento web sin 'unsafe-inline' (`api/src/static/serve-web.test.ts`), sin atributos `style` (`web/src/App.test.tsx`) y verificada en Chrome headless con control positivo (H15); en cada corrida de `e2e/` la consola queda sin errores ni violaciones de CSP y la evidencia maliciosa no se ejecuta (H16) | Hecho |
| RNF-04 Dependencias sin vulnerabilidades | H0 | `pnpm audit --prod --audit-level high` en CI | Hecho |
| RNF-05 Privacidad | H11, H14 | Correo solo con consentimiento y sin logs (H11); prueba de purga (H14); captura de correos apagada por defecto en producción hasta publicar los textos legales, que el responsable revisó y aprobó el 23/11/2026 (H15) | Hecho |
| RNF-06 Auditoría en 30 s (p95) | H5, H16 | Presupuesto de 25 s para enlaces (H5). Medición en producción (Render, 0,15 de CPU), 10 auditorías del sitio propio el 23/11/2026: p95 7,3 s, media 7,1 s | Hecho |
| RNF-07 Respuesta de interfaz en 2 s | H16 | `e2e/calidad.spec.ts`: carga completa de las vistas sin auditoría entre 18 y 126 ms (medición local) | Hecho |
| RNF-08 Usabilidad y accesibilidad | H8, H16 | Móvil primero y contraste AA (H8); `e2e/calidad.spec.ts`: axe WCAG 2 A y AA sin violaciones en todas las vistas y sin scroll horizontal a 375 px (H16); falta la prueba de usabilidad con personas | En curso |
| RNF-09 Fallos del sitio objetivo | H2, H3 | Errores del scanner → `failed` con mensaje claro (H2); si HTTPS falla, sigue con HTTP y corre los checks posibles (H3); un check que falla queda como "no aplica" | Hecho |
| RNF-10 Mantenibilidad y cobertura | H0 | Umbrales de cobertura en CI; TS estricto; `test/eslint-rules.test.ts` | Hecho |
| RNF-11 Portabilidad con Docker | H0, H15 | Imagen base construida en CI (H0); imagen con API y web, usuario no root y base escribible verificados en CI; `render.yaml`; arranque con base vacía (`api/src/app.test.ts`); desplegada en Render el 23/11/2026 con ingreso al panel y bloqueo verificados en producción (H15) | Hecho |
| RNF-12 Observabilidad | H0, H15 | `GET /api/health` sin base ni log por cada ping (`api/src/routes/limits.test.ts`); logs sin IP; prueba de humo con cierre limpio en CI (H15) | Hecho |
| RNF-13 Ética y límites | H1, H13 | User-Agent identificable (H1); 1 request por segundo por host con planificador compartido y robots.txt respetado para los enlaces (H5); límites de uso por IP, dominio y día (H13) | Hecho |
