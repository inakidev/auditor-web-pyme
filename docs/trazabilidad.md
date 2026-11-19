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
| RF-10 Exportar a PDF | H17 | Generación y contenido | | Pendiente |
| RF-11 Contacto con consentimiento | H11 | `api/src/routes/audits.test.ts` (sin consentimiento no se guarda nada; fecha y versión del texto; el correo no sale en el informe ni en los logs) | `feat: agrega el contacto con consentimiento…` | Hecho |
| RF-12 Panel de consultores | H12 | Acceso con y sin sesión; filtros | | Pendiente |
| RF-13 Comparar auditorías | | | | Pospuesto |
| RF-14 Estados y notas | H18 | Historial con fecha y usuario | | Pendiente |
| RF-15 Límites de uso | H13 | Respuesta 429 y contadores hasheados | | Pendiente |
| RF-16 Borrado y purga | H14 | Borrado manual y purga automática | | Pendiente |
| RF-19 Recomendaciones | H9 | Textos en rioplatense revisados (sin tuteo); `scanner/test/checks/guides.test.ts` (guías https de fuentes permitidas); `pnpm check:guides` (30 de 30 responden, 18/11/2026) | `feat: agrega guías…` | Hecho |

## Requisitos no funcionales

| Requisito | Historia | Verificación | Estado |
|---|---|---|---|
| RNF-01 SSRF y abuso | H1 | Suite SSRF en verde y revisión manual de `safeFetch` aprobada (18/11/2026) | Hecho |
| RNF-02 Autenticación robusta | H12 | Pruebas de sesión, CSRF y bloqueo | Pendiente |
| RNF-03 Sin XSS | H4, H8 | Evidencia maliciosa escapada (`web/src/App.test.tsx`); regla ESLint contra dangerouslySetInnerHTML; helmet con CSP `default-src 'none'` en la API y `no-referrer` (H8); CSP del documento web en H15 | En curso |
| RNF-04 Dependencias sin vulnerabilidades | H0 | `pnpm audit --prod --audit-level high` en CI | Hecho |
| RNF-05 Privacidad | H11, H14 | Correo solo con consentimiento y sin logs (H11); prueba de purga (H14); aviso de privacidad antes de exponer (etapa 6) | En curso |
| RNF-06 Auditoría en 30 s (p95) | H5, H16 | Portada y verificación de hasta 20 enlaces con presupuesto de 25 s (H5); medición con fixtures y sitios propios (H16). Primera medición: 8 s en un sitio propio | En curso |
| RNF-07 Respuesta de interfaz en 2 s | H16 | Medición en e2e | Pendiente |
| RNF-08 Usabilidad y accesibilidad | H8, H16 | Diseño móvil primero, etiquetas con contraste AA, roles ARIA en barras y progreso (H8); prueba con 2 o 3 personas (H16) | En curso |
| RNF-09 Fallos del sitio objetivo | H2, H3 | Errores del scanner → `failed` con mensaje claro (H2); si HTTPS falla, sigue con HTTP y corre los checks posibles (H3); un check que falla queda como "no aplica" | Hecho |
| RNF-10 Mantenibilidad y cobertura | H0 | Umbrales de cobertura en CI; TS estricto; `test/eslint-rules.test.ts` | Hecho |
| RNF-11 Portabilidad con Docker | H0, H15 | Imagen base construida en CI (H0); despliegue desde cero (H15) | En curso |
| RNF-12 Observabilidad | H0, H15 | `GET /api/health` y logs sin IP (`apps/api/src/app.test.ts`); CI en verde | En curso |
| RNF-13 Ética y límites | H1, H13 | User-Agent identificable (H1); 1 request por segundo por host con planificador compartido y robots.txt respetado para los enlaces (H5); límites de uso (H13) | En curso |
