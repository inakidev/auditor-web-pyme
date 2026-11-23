# Requisitos: Auditor Web Pyme

Versión 0.4 (borrador a validar con las técnicas de la sección 4). Todo lo marcado como **[Hipótesis]** o **[Supuesto]** debe confirmarse con usuarios reales antes de darlo por cerrado.

## 1. Propósito y contexto

**Problema.** Muchas pymes tienen un sitio web con fallas que no ven: certificados vencidos, falta de cabeceras de seguridad, páginas que Google no entiende, formularios o medios de contacto rotos o sin medición. Detectarlo hoy exige a la agencia una revisión manual con varias herramientas sueltas, que lleva mucho tiempo **[Hipótesis: [X] horas por sitio; medir cronometrando una revisión manual propia]** y produce informes poco comparables entre sí.

**Oportunidad.** Una herramienta que haga la revisión pasiva en minutos y entregue un informe claro en español sirve como diagnóstico gratuito para captar clientes y como base de seguimiento (antes y después de un trabajo).

**Objetivos medibles** (a validar):
- O1. Un diagnóstico completo en menos de 30 s en el percentil 95 y con un informe legible por una persona no técnica.
- O2. Reducir el tiempo de la revisión manual de la agencia a menos de 10 minutos por sitio (incluida la lectura del informe) **[Hipótesis]**.
- O3. Que al menos el 60 % de las personas no técnicas que prueben la herramienta entiendan el informe sin ayuda **[Hipótesis; medir en prueba de usabilidad]**.
- O4. Captar leads con consentimiento expreso para el equipo comercial de la agencia.

## 2. Partes interesadas (stakeholders)

| Parte | Rol | Interés principal |
|---|---|---|
| Dueños o responsables de pymes | Usuarios externos | Entender qué le pasa a su sitio y qué arreglar primero |
| Equipo de la agencia (consultores) | Usuarios internos / patrocinador | Diagnósticos rápidos, leads, seguimiento y evidencia para presupuestar |
| Desarrollador (autor del proyecto) | Analista, desarrollador y mantenedor | Entregar un producto viable, seguro y documentado |
| Docente / institución | Evaluador | Que se cumpla todo el ciclo de vida del software |
| Titulares de los sitios auditados | Afectados | Que la herramienta no cause daños ni cargas excesivas |
| Proveedores de hosting de los sitios auditados | Afectados indirectos | Que el tráfico de la herramienta sea mínimo y identificable |

## 3. Alcance

**Dentro (versión 1):** análisis pasivo de una URL pública; checks de seguridad, SEO, analítica, confianza/contacto y rendimiento liviano; puntajes; informe web con enlace único; exportación a PDF; captura de leads con consentimiento; panel de consultores con historial y comparación.

**Fuera (versión 1):** pruebas de intrusión o de vulnerabilidades; rastreo masivo; renderizado de JavaScript (los sitios que dependen totalmente de JS se informan con la limitación); correcciones automáticas; monitoreo continuo; multi-organización.

## 4. Técnicas de relevamiento (según el módulo)

1. **Análisis de herramientas y documentación existentes** (por ejemplo, las que se usan hoy para revisar un sitio): qué miden, qué informan y qué les falta. Es investigación de datos duros, una de las técnicas del módulo.
2. **Observación y medición de la revisión manual actual**: hacer una revisión manual de un sitio propio, cronometrar los pasos y anotar las herramientas usadas.
3. **Consulta a expertos y a quienes conocen el problema**: el equipo de la agencia, que trabaja con pymes, y el docente.
4. **Prototipado** de la pantalla de informe y revisión con 2 o 3 personas (compañeros, familiares o conocidos no técnicos).
5. **Cuestionario** breve posterior a la prueba del prototipo (apéndice B).
6. **Entrevistas a dueños de pymes** (apéndice A): **opcionales**; suman evidencia si se consiguen, pero el trabajo no depende de ellas.
Los hallazgos se vuelcan en la sección 10.

## 5. Requisitos funcionales

Prioridad según MoSCoW: **M** (debe), **S** (debería), **C** (podría).

| ID | Requisito | Prior. | Criterio de aceptación |
|---|---|---|---|
| RF-01 | El usuario ingresa la URL de un sitio y solicita una auditoría. | M | Se acepta `ejemplo.com` o `https://ejemplo.com`; se normaliza; una URL inválida muestra un mensaje claro y no inicia nada. |
| RF-02 | El sistema valida que el destino sea público y permitido antes de conectarse. | M | Se rechazan IPs internas, esquemas no web, puertos distintos de 80/443 y URLs con credenciales; todos los casos de la suite SSRF pasan. |
| RF-03 | Ejecutar los checks de **seguridad** pasiva del catálogo (SEC-xx). | M | Cada check devuelve estado (cumple / advertencia / no cumple / no aplica), severidad, evidencia y recomendación. |
| RF-04 | Ejecutar los checks de **SEO** (SEO-xx). | M | Idem RF-03. Detecta al menos título, descripción, H1, idioma, viewport, etiquetas sociales, alt, robots y sitemap. |
| RF-05 | Ejecutar los checks de **analítica y medición** (ANA-xx). | M | Detecta GA4, GTM, Matomo/Plausible y Meta Pixel a partir del HTML; informa si no hay ninguna medición. |
| RF-06 | Ejecutar los checks de **confianza y contacto** (TRU-xx). | S | Detecta teléfono, correo, WhatsApp, formulario y política de privacidad. |
| RF-07 | Calcular el puntaje por categoría y el global, con ponderación documentada y editable por configuración. | M | Mismo resultado para los mismos datos; la fórmula está en el plan; los checks "no aplica" no cuentan. |
| RF-08 | Mostrar el informe web: resumen, puntajes, hallazgos ordenados por severidad, evidencia, recomendación y esfuerzo estimado. | M | Se entiende sin ayuda técnica (validado en prueba de usabilidad); funciona en móvil. |
| RF-09 | El informe se abre con un enlace único no adivinable y vence a los 30 días. | M | Token de al menos 128 bits; pasado el vencimiento responde 410; no hay listado público. |
| RF-10 | Exportar el informe a PDF. | S | El PDF incluye logo, fecha, URL, puntajes y hallazgos; se genera en el navegador. |
| RF-11 | Captura opcional del correo del interesado con casilla de consentimiento expreso. | M | Sin consentimiento no se guarda el correo; el consentimiento queda registrado con fecha. |
| RF-12 | Panel para consultores con login: lista de auditorías y leads con filtros y detalle. | M | Solo accesible con sesión válida; filtra por dominio, fecha, puntaje y estado. |
| RF-13 | Comparar dos auditorías del mismo dominio. | S | Muestra diferencias de puntaje y hallazgos nuevos, resueltos y persistentes. |
| RF-14 | Gestionar el estado de cada lead (nuevo, contactado, propuesta, cerrado) y agregar notas. | S | Cambios persistidos con fecha y usuario. |
| RF-15 | Limitar el uso: por IP, por dominio (cooldown) y tope diario. | M | Al superar el límite responde 429 con un mensaje claro; los contadores no guardan IPs sin hashear. |
| RF-16 | Eliminar auditorías y leads a pedido, y borrado automático por vencimiento. | M | El consultor puede borrar; una tarea diaria purga lo vencido. |
| RF-17 | Verificar la propiedad del dominio (meta tag o archivo) para habilitar chequeos extendidos en futuras versiones. | C | Fuera de la v1; queda registrado como decisión. |
| RF-18 | Auditoría programada y alerta de cambios. | C | Fuera de la v1. |
| RF-19 | Textos de recomendación en español rioplatense con enlaces a guías. | S | Cada check tiene una recomendación redactada y revisada. |

## 6. Requisitos no funcionales

| ID | Categoría | Requisito | Métrica / verificación |
|---|---|---|---|
| RNF-01 | Seguridad | Control de SSRF y abuso en todas las conexiones salientes (reglas de `CLAUDE.md`). | Suite SSRF completa en verde; revisión manual de `safeFetch`. |
| RNF-02 | Seguridad | Autenticación robusta de consultores (argon2id, cookies seguras, CSRF, bloqueo por intentos). | Pruebas automáticas y lista de verificación OWASP ASVS nivel 1. |
| RNF-03 | Seguridad | Protección frente a XSS: nunca se renderiza contenido del sitio auditado. | Pruebas con fixtures maliciosos; CSP estricta; sin `dangerouslySetInnerHTML`. |
| RNF-04 | Seguridad | Dependencias sin vulnerabilidades altas o críticas. | `pnpm audit --prod` en CI. |
| RNF-05 | Privacidad | Datos mínimos: correo solo con consentimiento; IP hasheada; retención de 30 días para informes. | Revisión del modelo de datos; prueba de purga. Alineado con la Ley 25.326 **[validar con asesoramiento]**. |
| RNF-06 | Rendimiento | Auditoría completa en ≤ 30 s (p95): portada por HTTPS y HTTP, robots.txt, sitemap, favicon y verificación de hasta 20 enlaces internos (con presupuesto de 25 s para los enlaces). | Medición con sitios de fixture y con sitios propios. |
| RNF-07 | Rendimiento | Respuesta de la interfaz ≤ 2 s en vistas que no esperan una auditoría. | Medición en pruebas e2e. |
| RNF-08 | Usabilidad | Interfaz en español rioplatense, móvil primero, contraste AA, lenguaje no técnico. | Prueba de usabilidad con 3 personas; revisión de contraste. |
| RNF-09 | Confiabilidad | Fallos del sitio objetivo (timeout, WAF, caídas) se informan sin romper la auditoría ni penalizar el puntaje. | Pruebas con servidor de fixture que falla a propósito. |
| RNF-10 | Mantenibilidad | Cada check es un módulo independiente; TypeScript estricto; cobertura ≥ 80 % en el scanner y ≥ 70 % en el resto. | Reporte de cobertura en CI. |
| RNF-11 | Portabilidad | Se despliega con Docker en un VPS económico o en un PaaS gratuito (la demo usa Render; ver ADR 0008). | `docker compose up` funciona en un entorno limpio y la misma imagen corre en Render. |
| RNF-12 | Observabilidad | Logs estructurados sin datos personales; métricas básicas (auditorías, errores, duración). | Revisión de logs; endpoint de salud. |
| RNF-13 | Ética y legalidad | Solo análisis pasivo, identificable (User-Agent), con límites de tasa y respeto de `robots.txt`. | Revisión del catálogo de checks; términos de uso publicados. |

## 7. Restricciones y supuestos

**Restricciones:** proyecto individual; plazo de la cursada; herramienta de desarrollo asistida con Claude Code (se declara como parte del proceso); presupuesto mínimo (hosting económico, sin servicios pagos obligatorios).

**Supuestos [a validar]:**
- S1. La experiencia del equipo de la agencia con sitios de pymes es una fuente válida para definir los problemas habituales; probar con una pyme real es opcional.
- S2. La mayoría de los sitios objetivo sirven su contenido principal en HTML sin renderizado JS obligatorio.
- S3. Un informe pasivo aporta valor aunque no detecte vulnerabilidades profundas.
- S4. Los términos de uso y el aviso de privacidad se redactan con una revisión básica antes de publicar.

## 8. Historias de usuario principales

1. Como **dueño de una pyme**, quiero pegar la dirección de mi sitio y ver en un minuto qué está mal y qué conviene arreglar primero, para decidir sin ser técnico.
2. Como **dueño de una pyme**, quiero que el informe me diga cuánto cuesta de esfuerzo cada arreglo, para priorizar.
3. Como **consultor**, quiero ver todas las auditorías y leads en un panel, para llamar a los interesados con el informe en la mano.
4. Como **consultor**, quiero comparar el antes y el después de un trabajo, para mostrar resultados al cliente.
5. Como **titular de un sitio auditado**, quiero que la herramienta no me genere carga ni riesgos, para no tener problemas con mi hosting.
6. Como **consultor**, quiero borrar los datos de una persona si lo pide, para cumplir con la privacidad.

## 9. Priorización y validación

Se priorizó con MoSCoW. La primera versión entregable incluye todos los **M** y los **S** que alcancen en el tiempo. Los requisitos se validan en tres momentos: (1) revisión del prototipo del informe con 2 personas; (2) revisión del backlog con el equipo de la agencia; (3) prueba de usabilidad y aceptación con 2 o 3 personas (pymes, si se consiguen; si no, personas no técnicas). Los cambios se registran con fecha en el historial de este documento.

## 10. Hallazgos del relevamiento (completar)

- Herramientas analizadas y qué cubre cada una: [a completar].
- Cómo se hace hoy la revisión manual (pasos, herramientas) y cuánto tarda: [a completar].
- Problemas más frecuentes encontrados en sitios de pymes: [a completar].
- Qué esperan recibir en el informe quienes lo probaron: [a completar].
- Cambios resultantes en el backlog: [a completar].

## Apéndice A. Guion de entrevista (dueños de pymes; opcional)

1. ¿Tenés sitio web? ¿Quién lo hizo y quién lo mantiene hoy?
2. ¿Para qué lo usás (vender, recibir consultas, mostrar información)?
3. ¿Sabés cuánta gente entra y de dónde? ¿Cómo lo medís?
4. ¿Alguna vez tuviste un problema (se cayó, mensajes de "no seguro", spam, consultas que no llegaron)?
5. Si una herramienta te mostrara qué tiene mal el sitio, ¿qué querrías ver primero?
6. ¿Preferís un puntaje, una lista de tareas o ambos?
7. ¿Qué te daría confianza para dejar tu correo y recibir el informe?
8. ¿Qué términos técnicos no entendés y qué palabras usarías vos?
9. ¿Cuánto tiempo estarías dispuesto a esperar un resultado?
10. ¿Pagarías por un seguimiento mensual? ¿Qué te haría falta para decidirlo?

## Apéndice B. Cuestionario posterior a la prueba (1 a 5)

1. El informe fue fácil de entender.
2. Supe qué arreglar primero.
3. Confío en los resultados que muestra.
4. El tiempo de espera fue razonable.
5. Lo recomendaría a otra persona. Comentario libre.

## Historial de cambios

- 0.1: borrador inicial.
- 0.2: las entrevistas a pymes pasan a ser opcionales; se agregan técnicas de relevamiento que no dependen de terceros.
- 0.3 (18/11/2026): RNF-06 refleja el alcance real del rastreo (portada y verificación de enlaces internos, sin analizar páginas internas). Ver ADR 0004.
