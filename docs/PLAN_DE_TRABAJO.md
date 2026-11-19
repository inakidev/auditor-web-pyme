# Plan de trabajo por etapas

Este es el plan vigente del proyecto. Las historias (H0 a H18), los requisitos y el alcance son los de `REQUISITOS.md` y `PLANIFICACION.md`; este documento define **el orden de trabajo y cuándo se da cada etapa por terminada**. Si hay una contradicción con los sprints de `PLAN_DE_DESARROLLO.md`, manda este documento.

El ritmo lo marca el tiempo que se le dedica: el plan no fija cuántos días lleva cada etapa. Una etapa termina cuando cumple su **puerta de salida**, no cuando pasa un número de días. Para tener datos reales del ritmo, al cerrar cada etapa se anotan en `PLANIFICACION.md` (sección 6) la fecha y las horas dedicadas.

Objetivo personal: terminar el proyecto completo antes de fin de noviembre. El límite de la plataforma para las entregas es el 1/12 a las 23:59.

## 1. Condiciones de trabajo

- Entorno listo antes de la etapa 1: Node.js LTS, pnpm, Git, el repositorio remoto creado y Claude Code funcionando.
- Decidir antes de la etapa 6 dónde se despliega (servidor virtual económico con Docker y HTTPS, o un servicio de alojamiento de aplicaciones).
- Durante el desarrollo no se auditan sitios de terceros: solo fixtures locales y sitios propios.
- Una historia por vez. No se abre la historia siguiente si no se cumplió la puerta de salida de la etapa, salvo que se decida antes qué recortar.

## 2. Resumen por etapa

| Etapa | Historias | Puntos de la etapa | Acumulado | Puerta de salida (qué tiene que funcionar) |
|---|---|---|---|---|
| 1 | H0, H1 | 11 | 11 | Integración continua en verde y suite SSRF completa pasando |
| 2 | H2, H3, H4 | 15 | 26 | Rebanada vertical: desde el navegador se ingresa la URL de un sitio propio publicado y se ven los hallazgos de seguridad (la integración con un servidor local se prueba dentro de las pruebas automáticas) |
| 3 | H5, H6, H7 | 11 | 37 | Auditoría con puntaje por categoría y global sobre los fixtures |
| 4 | H8, H9, H10 | 13 | 50 | Informe completo y legible en móvil, con recomendaciones en español |
| 5 | H11, H12 | 11 | 61 | Contacto con consentimiento y panel de consultores con sesión (supera el 60 % del Avance 3) |
| 6 | H13, H14, H15 | 13 | 74 | Aplicación desplegada con HTTPS, límites de uso y purga automática. Antes de exponer el sistema, el aviso de privacidad real tiene que estar publicado; hasta entonces no se cargan correos reales |
| 7 | H16, H17, H18 y cierre | 11 | 85 | Pruebas e2e y de usabilidad hechas, documentación al día y entrega lista |

**Avance 3:** se entrega al cerrar la etapa 5 (61 puntos, 72 %). La meta de la consigna es el 60 %, o sea 51 puntos.

## 3. Detalle por etapa

Cada etapa empieza con un pedido en **modo plan**: se aprueba el plan y recién entonces se implementa. Al cerrar la etapa se le pide: "corré lint, typecheck, tests y audit, actualizá `docs/trazabilidad.md` y resumí lo hecho, lo pendiente y los riesgos que viste", y se actualizan la tabla de progreso del README y el control de desvíos.

### Etapa 1: base y cliente HTTP seguro (H0 y H1)
- **H0:** estructura del monorepo, TypeScript estricto, ESLint con la regla que prohíbe `fetch` fuera de `safeFetch`, Vitest, integración continua y Docker base.
- **H1:** suite de pruebas SSRF primero (sección 2 de `pruebas.md`), con un resolver DNS inyectable, y después `safeFetch`.
- **Revisás vos:** `safeFetch` línea por línea (anclaje de IP, revalidación de redirects, límites de tiempo y de tamaño).
- **Pedido:** ver `ARRANQUE_ETAPA_1.md`.

### Etapa 2: rebanada vertical (H2, H3 y H4)
- API `POST /api/audits` y `GET /api/audits/:token` con cola en proceso y SQLite.
- Checks SEC-01 a SEC-05 y SEC-07 a SEC-09 con fixtures.
- Interfaz mínima con formulario de URL, progreso por consultas periódicas y lista de hallazgos.
- **Pedido:** "Ahora hacemos H2, H3 y H4. Objetivo: una rebanada vertical que funcione de punta a punta. API con cola en proceso y SQLite; checks de seguridad con fixtures y pruebas primero; interfaz mínima con formulario, progreso y hallazgos. En modo plan primero."

### Etapa 3: SEO, analítica y puntaje (H5, H6 y H7)
- Checks SEO-01 a SEO-15, PER-01 a PER-03 y ANA-01 a ANA-05, cada uno con fixtures y sus casos límite (por ejemplo, SEO-05 con una página en inglés y la descripción en español).
- Puntaje: fórmula y pesos de la sección 5 del plan, en un archivo de configuración.
- **Pedido:** "Ahora hacemos H5, H6 y H7. Cada check es un módulo independiente con fixtures. El puntaje usa los pesos y bandas de la sección 5 del plan, definidos en un archivo de configuración. Los checks heurísticos redactan sus resultados con cautela."

### Etapa 4: informe y confianza (H8, H9 y H10)
- Informe con diseño móvil primero: puntajes, hallazgos por severidad, evidencia siempre escapada y esfuerzo estimado.
- Una recomendación en español rioplatense por cada check.
- Checks restantes: TRU-01 a TRU-05 y SEC-06, SEC-10 a SEC-16.
- **Pedido:** "Ahora hacemos H8, H9 y H10. El informe sigue los wireframes del A2 (pantalla P3). No se usa `dangerouslySetInnerHTML`. Escribí las recomendaciones en español rioplatense y sin tecnicismos innecesarios."

### Etapa 5: contactos y panel (H11 y H12)
- Contacto: correo opcional con casilla de consentimiento y registro de la fecha.
- Panel: inicio de sesión con argon2id, cookie `HttpOnly`, `Secure` y `SameSite=Lax`, token CSRF y bloqueo progresivo; listado con filtros; primer usuario creado con variables de entorno.
- **Revisás vos:** la autenticación completa y que ninguna ruta de administración quede sin sesión.
- **Pedido:** "Ahora hacemos H11 y H12. Seguí las reglas de seguridad de CLAUDE.md. Mostrame antes de implementar cómo vas a manejar sesiones y CSRF."
- **Al cerrar esta etapa se entrega el Avance 3.**

### Etapa 6: seguridad operativa y despliegue (H13, H14 y H15)
- Límites de uso: por IP hasheada, por dominio y diario; respuesta 429 con mensaje claro.
- Retención: vencimiento a 30 días, purga diaria automática y borrado manual.
- Despliegue: Dockerfile multi-stage, `docker-compose`, HTTPS y variables de entorno; términos de uso y aviso de privacidad en borrador.
- **Revisás vos:** que no queden secretos en el repositorio y que las variables de entorno estén fuera del código.
- **Pedido:** "Ahora hacemos H13, H14 y H15. El despliegue debe poder repetirse desde cero con `docker compose up`. Los términos y el aviso de privacidad son borradores que yo voy a revisar."

### Etapa 7: pruebas y cierre (H16, H17, H18 y documentación)
- Pruebas e2e del flujo principal y del panel; prueba de usabilidad con 2 o 3 personas (media hora cada una) y el cuestionario de `pruebas.md`.
- Ajustes que salgan de las pruebas.
- H17 (exportar a PDF) y H18 (estados y notas de contactos) **solo si hay tiempo**.
- Actualizar README, trazabilidad, pruebas y mantenimiento con datos reales.
- **Pedido:** "Ahora hacemos H16 y el cierre. Escribí las pruebas e2e del flujo de la URL al informe y del inicio de sesión al panel. Después actualizá README, trazabilidad, pruebas y mantenimiento con datos reales."

## 4. Reglas de recorte si el avance real se queda corto

Se decide al cerrar cada etapa, comparando los puntos reales con la columna de acumulados de la sección 2.

| Situación | Decisión |
|---|---|
| Al cerrar la etapa 2 hay menos de 20 puntos | Dejar para después las historias de prioridad S (H9, H10) y reducir H3 a los checks SEC-01, 02, 03 y 05 |
| Al cerrar la etapa 4 hay menos de 45 puntos | Recortar H17 y H18 y simplificar el informe: sin esfuerzo estimado por hallazgo |
| Al cerrar la etapa 5 hay menos de 55 puntos | Panel solo de lectura: listado y detalle, sin filtros |
| Al cerrar la etapa 6 no está desplegado | Hacer la prueba de usabilidad con la aplicación en local y desplegar en la etapa 7 |

Lo que **no se recorta**: el cliente HTTP seguro y su suite de pruebas, la validación de entrada, el consentimiento para guardar correos, la autenticación y las pruebas del flujo principal.

## 5. Riesgos propios de este plan

| Riesgo | Mitigación |
|---|---|
| Aceptar código generado sin revisarlo | Revisión obligatoria de `safeFetch`, autenticación y despliegue; pruebas primero |
| Que la etapa 2 se estire por la cola y la interfaz | Usar consultas periódicas en lugar de conexiones en tiempo real |
| Que el despliegue falle en la etapa 6 | Probar el Docker de desarrollo desde la etapa 1 y decidir el servidor antes |
| Falsos positivos en checks heurísticos | Textos prudentes y revisión de resultados con sitios propios en la etapa 3 |
| Cansancio acumulado | Cada etapa termina con la puerta de salida, no con "un poco más" |
| Llegar tarde a la entrega por no medir el ritmo | Anotar fecha y horas al cerrar cada etapa y revisar el desvío |
