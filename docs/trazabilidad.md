# Trazabilidad

Relaciona cada requisito con la historia que lo construye, las pruebas que lo verifican y el commit donde se cumple. Se actualiza al cerrar cada historia.

Estados: Pendiente, En curso, Hecho o Pospuesto (fuera de la versión entregable).

## Requisitos funcionales

| Requisito | Historia | Pruebas previstas | Commit o PR | Estado |
|---|---|---|---|---|
| RF-01 Solicitar auditoría | H2, H4 | Validación de URL; integración de la API | | Pendiente |
| RF-02 Validar destino | H1 | `packages/scanner/test/safe-fetch.{ssrf,integration,production}.test.ts` | `feat(scanner): agrega safeFetch…` | En revisión |
| RF-03 Checks de seguridad | H3, H10 | Un archivo de pruebas por check, con fixtures | | Pendiente |
| RF-04 Checks de SEO | H5 | Fixtures de HTML en español e inglés | | Pendiente |
| RF-05 Checks de analítica | H6 | Fixtures con GA4, GTM, Matomo y sin medición | | Pendiente |
| RF-06 Checks de confianza | H10 | Fixtures con y sin contacto y privacidad | | Pendiente |
| RF-07 Puntaje | H7 | Cálculo determinista con casos de borde | | Pendiente |
| RF-08 Informe web | H4, H8 | Componentes y e2e; revisión de legibilidad | | Pendiente |
| RF-09 Enlace único con vencimiento | H2, H8 | Token, estado 410 al vencer | | Pendiente |
| RF-10 Exportar a PDF | H17 | Generación y contenido | | Pendiente |
| RF-11 Contacto con consentimiento | H11 | Sin consentimiento no se guarda | | Pendiente |
| RF-12 Panel de consultores | H12 | Acceso con y sin sesión; filtros | | Pendiente |
| RF-13 Comparar auditorías | | | | Pospuesto |
| RF-14 Estados y notas | H18 | Historial con fecha y usuario | | Pendiente |
| RF-15 Límites de uso | H13 | Respuesta 429 y contadores hasheados | | Pendiente |
| RF-16 Borrado y purga | H14 | Borrado manual y purga automática | | Pendiente |
| RF-19 Recomendaciones | H9 | Revisión de textos por check | | Pendiente |

## Requisitos no funcionales

| Requisito | Historia | Verificación | Estado |
|---|---|---|---|
| RNF-01 SSRF y abuso | H1 | Suite SSRF en verde; falta la revisión manual de `safeFetch` | En revisión |
| RNF-02 Autenticación robusta | H12 | Pruebas de sesión, CSRF y bloqueo | Pendiente |
| RNF-03 Sin XSS | H8 | Fixtures maliciosos y CSP | Pendiente |
| RNF-04 Dependencias sin vulnerabilidades | H0 | `pnpm audit --prod --audit-level high` en CI | Hecho |
| RNF-05 Privacidad | H11, H14 | Revisión del modelo de datos y prueba de purga | Pendiente |
| RNF-06 Auditoría en 30 s (p95) | H16 | Medición con sitios de fixture | Pendiente |
| RNF-07 Respuesta de interfaz en 2 s | H16 | Medición en e2e | Pendiente |
| RNF-08 Usabilidad y accesibilidad | H8, H16 | Prueba con 2 o 3 personas; contraste AA | Pendiente |
| RNF-09 Fallos del sitio objetivo | H2, H3 | Servidor de fixture que falla a propósito | Pendiente |
| RNF-10 Mantenibilidad y cobertura | H0 | Umbrales de cobertura en CI; TS estricto; `test/eslint-rules.test.ts` | Hecho |
| RNF-11 Portabilidad con Docker | H0, H15 | Imagen base construida en CI (H0); despliegue desde cero (H15) | En curso |
| RNF-12 Observabilidad | H0, H15 | `GET /api/health` y logs sin IP (`apps/api/src/app.test.ts`) | En curso |
| RNF-13 Ética y límites | H1, H13 | User-Agent identificable probado (H1); límites de uso (H13) | En curso |
