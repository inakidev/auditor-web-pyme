# Registro de pruebas

Las consignas no piden un informe de pruebas todavía, pero sí que se vayan anotando. Este documento se completa a medida que se prueba, con fecha y resultado reales.

## 1. Estrategia

| Nivel | Qué cubre | Herramienta |
|---|---|---|
| Unitarias | Cada check con fixtures de HTML y cabeceras; puntaje; normalización de URL | Vitest |
| Suite SSRF | Casos de la sección 2 de este documento | Vitest |
| Integración | API con base en memoria y servidor de fixture local | Vitest |
| Seguridad | HTML malicioso, límites de uso, sesiones | Vitest |
| E2E | Flujo de la URL al informe; inicio de sesión y panel | Playwright |
| Usabilidad | 2 o 3 personas leyendo un informe real | Manual, con cuestionario |

Reglas: los tests unitarios no usan red real; durante el desarrollo no se auditan sitios de terceros; cada defecto encontrado se registra en la sección 4 y, si es de seguridad, también en el registro de mantenimiento.

## 2. Casos de la suite SSRF (todos deben ser rechazados)

Marcar cada caso cuando exista su prueba y pase.

- [x] `http://127.0.0.1` y `http://localhost`
- [x] `http://0.0.0.0`
- [x] `http://10.0.0.1`, `http://172.16.0.1` y `http://192.168.1.1`
- [x] `http://169.254.169.254` (metadatos de la nube)
- [x] `http://[::1]`, `http://[fd00::1]` y `http://[fe80::1]`
- [x] `http://[::ffff:127.0.0.1]` (IPv4 mapeada)
- [x] `http://2130706433` (decimal), `http://0177.0.0.1` (octal) y `http://0x7f000001` (hexadecimal)
- [x] `http://ejemplo.com@127.0.0.1` (credenciales en la URL)
- [x] `file:///etc/passwd`, `gopher://...` y `ftp://...`
- [x] Puertos `:22`, `:6379` y `:8080`
- [x] Dominio que resuelve a una IP interna
- [x] Dominio que resuelve primero a una IP pública y después a una interna (rebinding)
- [x] Redirección 302 hacia un destino interno
- [x] Cadena de más de 3 redirecciones
- [x] Respuesta de más de 2 MB y respuesta que nunca termina (timeout)
- [x] Rangos adicionales: `192.0.0.1`, `198.18.0.1`, `240.0.0.1`, `255.255.255.255`, `100.64.0.1`
- [x] IPv6 con IPv4 embebida: `[64:ff9b::7f00:1]` (NAT64), `[2002:7f00:1::]` (6to4), `[2001::1]` (Teredo)
- [x] IP literal: se valida sin llamar al resolver DNS
- [x] DNS con varias respuestas, una pública y una interna: se rechaza
- [x] Redirección con `Location` relativa que se resuelve bien; redirecciones a otro esquema, a un puerto no permitido o con credenciales: se rechazan
- [x] Timeout global: DNS lento, servidor que envía el cuerpo de a goteo (cada byte reinicia la inactividad, pero se corta igual a los 10 s)
- [x] `Content-Length` falso (dice poco y manda más de 2 MB) y bomba de compresión (pocos KB comprimidos que superan 2 MB al descomprimir)
- [x] Conexión nueva por salto (sin reutilizar sockets)
- [x] Certificado autofirmado y certificado con un nombre que no coincide: se rechazan sin tocar la verificación TLS
- [x] Puerto no permitido rechazado por el camino de producción (sin la fábrica de pruebas)
- [x] Arranque en producción sin `AUDITOR_CONTACT_URL`: falla

## 3. Registro de ejecuciones

| Fecha | Nivel | Alcance | Resultado | Pruebas (pasan/total) | Cobertura | Observaciones |
|---|---|---|---|---|---|---|
| 17/11/2026 | Unitarias | H0: salud de la API, configuración, regla anti-fetch, web | Verde | 35/35 | 96,7 % líneas | Lint, typecheck y audit sin errores |
| 17/11/2026 | Unitarias, integración y seguridad | H1: suite SSRF, integración con servidores locales HTTP/HTTPS, camino de producción | Verde | 156/156 | 97,7 % líneas (scanner/net 98,2 %) | Sin red real; 3 corridas seguidas estables |
| 18/11/2026 | Unitarias e integración | H2: validación previa de URL, cola, API de auditorías con SQLite en memoria, recuperación al reiniciar, redacción de logs | Verde | 203/203 | 95,5 % líneas | Prueba de humo del dist de la API en local |
| 18/11/2026 | Unitarias e integración | H3: 8 checks de seguridad con fixtures (incluye que la evidencia nunca muestre valores crudos), orquestador sin red e integración contra servidores locales HTTP y HTTPS | Verde | 261/261 | 96,8 % líneas (scanner/checks 100 %) | CI con prueba de humo del dist y de la imagen Docker |
| 18/11/2026 | Unitarias | H4: cliente de la API, consulta periódica (corta en done/failed, reintentos espaciados), orden del informe, estados de las páginas y evidencia maliciosa escapada | Verde | 279/279 | 96,2 % líneas | `pnpm dev` verificado: proxy de Vite a la API |
| 18/11/2026 | Unitarias e integración | H5: SEO-01 a 15 y PER-01 a 03 con fixtures, parser de robots.txt (incluye patrón patológico), planificador compartido, recolección con presupuesto, regla ESLint contra fromURL | Verde | 345/345 | 96,6 % líneas (checks 100 %) | |
| 18/11/2026 | Unitarias | H6: ANA-01 a 05 con fixtures (solo HTML inicial, sin ejecutar JavaScript; la evidencia nombra la herramienta sin IDs) | Verde | 358/358 | | |
| 18/11/2026 | Unitarias e integración | H7: fórmula del puntaje, exclusión de "no aplica" y "no evaluado", reponderación del global, bandas, determinismo; puntajes guardados y devueltos por la API; resumen en la web | Verde | 374/374 | 96,9 % líneas (scoring 100 %) | |
| 18/11/2026 | Aceptación (sitio propio) | Auditoría real de clinica-chubut.vercel.app con SEO, rendimiento, analítica y puntaje | Verde tras corregir D-01 | 23 hallazgos | | 8 s de duración; 77/100 (B) sobre 4 de 5 áreas |
| 18/11/2026 | Unitarias e integración | H10: SEC-06 y SEC-10 a 16, TRU-01 a 05, security.txt con GET de 8 KB, respuestas recortadas con maxBodyBytes (incluye bomba de compresión) | Verde | 423/423 | 97 % líneas | |
| 18/11/2026 | Unitarias | H8: fases en memoria (P2), helmet en la API, informe P3 (nivel, cinco barras, prioridades, detalle plegable sin severidad en lo que cumple) | Verde | 428/428 | 97 % líneas | |
| 18/11/2026 | Unitarias y manual | H9: guías por check (constantes, https, fuentes permitidas, aviso "en inglés"), includeSubDomains con su escritura oficial; `pnpm check:guides` con safeFetch: 30 de 30 guías responden | Verde | 436/436 | 97 % líneas | 4 guías de MDN solo existen en inglés |
| 18/11/2026 | Aceptación (sitio propio) | Auditoría real de clinica-chubut.vercel.app con los 44 checks, fases y guías | Verde | 44 hallazgos (30 con guía) | | 9 s; 77/100 (B) sobre 5 de 5 áreas; fases visibles durante la revisión |
| 18/11/2026 | Unitarias e integración | H11: consentimiento obligatorio con correo, sin guardar nada sin él, versión del texto, errores sin repetir el valor, redacción del correo en logs; formulario con correo y casilla | Verde | 445/445 | | |
| 18/11/2026 | Unitarias e integración | H12: configuración obligatoria y hash argon2id válido; doble envío CSRF, token de sesión y Origin estricto (con prueba de mutación: sin la verificación de Origin fallan 5 pruebas); sesión nueva, vencimiento a 30 min y 8 h; bloqueo por correo + IP, tope por IP y /64; 503 con argon2 ocupado; logs sin correo, cookies, token ni IP; lista explícita de rutas; listados paginados y filtros con límites; P4 en la web | Verde | 580/580 | 95 % líneas | |
| 18/11/2026 | Manual (HTTP real) | Flujo completo con curl contra la API en desarrollo: csrf, ingreso, listado del panel, cierre y acceso posterior | Verde | 200, 200, 204 y 401 | | Git Bash cambia la codificación de los argumentos de curl con ñ: se mandó el cuerpo desde un archivo UTF-8 |
| 23/11/2026 | Unitarias e integración | H13 a H15: configuración de producción (variables juntas, hash PHC con pista de comillas o `$` perdidos), límites (tope, reinicio, cooldown, tope diario, mapa lleno, proxy), purga con reloj simulado, borrado manual, estáticos (lista blanca contra 14 intentos de salirse de `dist`), arranque con base vacía, health sin log, legales y CSP sin estilos inline | Verde | 683/683 | | |
| 23/11/2026 | Manual (navegador real) | Dist en Chrome headless con la consola capturada: portada, informe con barras, privacidad, términos e ingreso. Control positivo con CSP estricta y estilo y script inline | Verde | 0 violaciones en 5 páginas; 2 en el control | | El método detecta violaciones; la web no tiene ninguna |
| 23/11/2026 | Manual (dist en producción) | Arranque, health, portada con CSP, asset inexistente 404, ruta de la SPA 200; dos ciclos borrando la base; arranque sin variables | Verde | | | El primer usuario se recrea en cada ciclo; sin variables lista todas las faltantes y sale con 1 |
| 23/11/2026 | Rendimiento (memoria) | RSS del dist en Windows: reposo y pico con 2 auditorías simultáneas del sitio propio (cooldown en 0 para la medición) | Medido | | | Reposo 182 MB (86 MB después del recolector); pico 197 MB; 2 auditorías en 15,8 s. Límite del plan gratuito confirmado en el panel de Render: 512 MB y 0,15 de CPU. La medición dentro del contenedor no es posible: las métricas de memoria requieren un plan pago |
| 23/11/2026 | Aceptación (producción en Render) | Servicio creado con el Blueprint: health, `/api/config`, portada con CSP, ingreso real al panel con el hash cargado en Render, salida; cadena de proxies medida con `LOG_PROXY_CHAIN` y bloqueo de ingresos contra cabeceras falsas | Verde | Ingreso 200, panel 200, salida 204; con 3 saltos: 429 tras 5 fallos, también con `X-Forwarded-For` falso | | Con 1 y 2 saltos el bloqueo no funcionaba (la app tomaba la IP de un proxy que rota): se ajustó a 3 |

## 4. Registro de defectos

| ID | Fecha | Descripción | Severidad | Requisito afectado | Estado | Commit de la corrección |
|---|---|---|---|---|---|---|
| D-01 | 18/11/2026 | Con el reloj monotónico (fracciones de ms), `AbortSignal.timeout` recibía un deadline no entero y la auditoría real fallaba con INTERNAL_ERROR. Los fixtures no lo detectaban porque el reloj falso no avanzaba entre lecturas. Se encontró al auditar un sitio propio; se agregó una prueba de regresión con un reloj que avanza en fracciones. | Alta | RF-04 | Corregido | `fix(scanner): redondea el deadline…` |
| D-02 | 23/11/2026 | La migración 0003 creó `audits.lead_id` sin `ON DELETE SET NULL`, aunque el schema lo declara: borrar un contacto con auditorías habría fallado por la clave foránea. Se detectó al diseñar el borrado manual (H14), antes de que existiera esa función. Se desvincula a mano en la misma transacción, en el borrado y en la purga, con prueba. | Media | RF-16 | Corregido | `feat: agrega límites de uso, purga, borrado y despliegue en Render…` |

## 5. Prueba de usabilidad (cuando haya un prototipo funcional)

Cada persona lee un informe real y responde, de 1 a 5:

1. El informe fue fácil de entender.
2. Supe qué arreglar primero.
3. Confío en los resultados que muestra.
4. El tiempo de espera fue razonable.
5. Lo recomendaría a otra persona.

| Persona (anónima) | P1 | P2 | P3 | P4 | P5 | Comentarios y cambios resultantes |
|---|---|---|---|---|---|---|
| | | | | | | |
