# 0007. Sesiones, CSRF y bloqueo del panel de consultores

- **Estado:** aceptada
- **Fecha:** 2026-11-18
- **Historia:** H12 (RF-12, RNF-02)

## Contexto
El panel muestra contactos con datos personales y todas las auditorías. Hace falta un ingreso robusto (argon2id, cookies seguras, CSRF, bloqueo por intentos) sin servicios pagos ni dependencias pesadas.

## Decisión

### Cookies
| Cookie | Contenido | Atributos |
|---|---|---|
| `__Host-csrf` | 256 bits aleatorios, antes del ingreso | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, 10 minutos |
| `__Host-sid` | 256 bits aleatorios; en la base solo su SHA-256 | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 8 horas |

El prefijo `__Host-` impide que un subdominio pise las cookies. Los navegadores aceptan `Secure` en `http://localhost`, así que funciona en desarrollo.

### CSRF
- **Antes del ingreso (doble envío):** `GET /api/auth/csrf` pone el token en la cookie y lo devuelve en el JSON. `POST /api/auth/login` exige la cabecera `X-CSRF-Token` igual a la cookie (`timingSafeEqual`). Al ingresar, la cookie se borra.
- **Con sesión (token sincronizado):** `HMAC-SHA256(id de sesión, "csrf")`. No se guarda: la base solo tiene el hash del id. Toda mutación lo exige en `X-CSRF-Token`.
- **Origin en todas las mutaciones:** tiene que estar y ser exactamente `PUBLIC_ORIGIN` (nunca se deriva de `Host`). Capa extra: si el navegador manda `Sec-Fetch-Site`, tiene que ser `same-origin`.

### Sesión
- Siempre una sesión nueva al ingresar; la que viniera en la cookie se borra (fijación de sesión).
- Vence a los 30 minutos sin uso (el último uso se actualiza como mucho una vez por minuto) y a las 8 horas como máximo. Vencida o inexistente: 401 y se borra la cookie.
- `Cache-Control: no-store` en `/api/auth/*` y `/api/admin/*`, también en los errores.

### Contraseñas y bloqueo
- argon2id con los mínimos de OWASP (19 MiB, t=2, p=1). Al arrancar se valida que `ADMIN_PASSWORD_HASH` sea un `$argon2id$` con parámetros iguales o mayores.
- Con un correo inexistente se verifica igual contra un hash ficticio: misma respuesta y tiempo parecido.
- Como máximo 2 verificaciones argon2 simultáneas y 8 en espera; si se llena, 503 (`LOGIN_BUSY`).
- **Contador por correo + IP** (`HMAC(IP_HASH_SALT, correo|IP)`), también para correos inexistentes: 5 fallos → 1 minuto, que se duplica con cada fallo extra hasta 15. Un ingreso correcto lo reinicia.
- **Tope por IP** (`HMAC(IP_HASH_SALT, IP)`): 20 fallos → 15 minutos, sin importar el correo.
- Los contadores vuelven a cero tras 15 minutos sin fallos. Las IPv6 se cuentan por su /64.
- Bloqueado: 429 con `Retry-After`.

### Configuración y primer usuario
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `IP_HASH_SALT` (32 caracteres o más) y `PUBLIC_ORIGIN` (https y sin barra final en producción). En producción la API no arranca si falta alguna o si quedó el valor de relleno de `.env.example`.
- El primer usuario se crea solo si la tabla `users` está vacía; nunca se pisa una contraseña existente.
- `pnpm --filter @auditor/api user:hash` pide la contraseña por entrada oculta (nunca por argumento) e imprime el hash.
- **El hash tiene signos `$`.** En `.env` va entre comillas simples: así ni Node ni Docker Compose los interpretan (verificado con `node --env-file` y `docker compose config`). Si se escribe en `environment:` de `docker-compose.yml`, cada `$` va como `$$`.

### Logs
- Los serializadores de Fastify se reemplazan: el de request por defecto incluía `remoteAddress`. Esto ya estaba desde H2 y ahora tiene prueba sobre la salida. Solo quedan el método, la URL redactada y el código de respuesta.
- pino oculta `req.headers.cookie`, `req.headers["x-csrf-token"]`, `res.headers["set-cookie"]` y los mismos campos bajo cualquier objeto.
- Nunca se registra el correo del intento: solo la clave hasheada del contador (`loginKey`).

### Rutas
Las pruebas mantienen una lista explícita de rutas públicas y otra de rutas del panel (`apps/api/src/routes/admin.test.ts`). Fallan si alguna ruta registrada no está en ninguna de las dos, o si una ruta del panel responde sin sesión. Los listados se paginan con un máximo de 100 por página. Los filtros se validan con zod: el dominio solo admite `[a-z0-9.-]`, así que no hay comodines de LIKE que escapar.

## Límites conocidos y pendientes
- **No hay cambio de contraseña en esta versión.** Para cambiarla hay que generar un hash nuevo y actualizar la base a mano (el arranque nunca pisa la existente).
- No hay TOTP (es requisito Should): queda para una versión futura.
- La purga periódica de sesiones y contadores vencidos llega en H14. Hasta entonces, las filas vencidas no habilitan nada: se rechazan y se borran al usarse.
- Detrás de un proxy (H15) hay que configurar `trustProxy` para que la IP del bloqueo sea la real y no la del proxy.

## Verificación (OWASP ASVS nivel 1, lo aplicable)
| Control | Cómo se cumple |
|---|---|
| Contraseñas con hash adaptativo | argon2id con mínimos de OWASP, validados al arrancar |
| Sin enumeración de usuarios | Mismo mensaje y código; hash ficticio para correos inexistentes |
| Protección contra fuerza bruta | Bloqueo progresivo por correo + IP y tope por IP |
| Id de sesión con entropía suficiente | 256 bits de `crypto.randomBytes`; solo el hash en la base |
| Sesión nueva al autenticarse | Se crea en cada ingreso y se descarta la anterior |
| Cookies seguras | `__Host-`, `HttpOnly`, `Secure`, `SameSite` |
| Vencimiento por inactividad y absoluto | 30 minutos y 8 horas |
| Cierre de sesión que invalida en el servidor | Borra la fila; la cookie vieja da 401 |
| CSRF | Doble envío antes del ingreso, token sincronizado después y Origin estricto |
| Respuestas sensibles sin caché | `no-store` en `/api/auth/*` y `/api/admin/*` |
| Autorización en cada ruta | Lista explícita de rutas probada; las del panel sin sesión dan 401 |
| Logs sin datos sensibles | Pruebas sobre la salida real del log |

## Consecuencias
- Dos dependencias nuevas: `argon2`, con build nativo habilitado solo para ese paquete en `allowBuilds`, y `@fastify/cookie`.
- La prueba de humo de CI necesita las cuatro variables nuevas. Usa valores descartables, marcados como tales.
