# 0002. Diseño de safeFetch (cliente HTTP seguro)

- **Estado:** aceptada (revisión manual aprobada el 18/11/2026)
- **Fecha:** 2026-11-17
- **Historia:** H1 (RF-02, RNF-01, RNF-13)

## Contexto
La herramienta visita URLs que ingresan terceros. Sin controles, sirve para SSRF: llegar a la red interna, a los metadatos de la nube o a servicios locales. Las reglas están en `CLAUDE.md`, regla 2.

## Decisión
- **Sin dependencias nuevas.** Solo `node:http`/`https`, `node:dns`, `node:net` (`BlockList`, `isIP`), `node:zlib` y el parser WHATWG de `URL`.
- **Validación por salto, en este orden:** URL (esquema http/https, sin credenciales, puerto 80/443, sin `localhost`), luego IP. Las IP literales se validan aparte y nunca pasan por el DNS. Los nombres se resuelven con todas las respuestas, y basta una IP no pública para rechazar.
- **Política de IP:** en IPv4, lista de bloqueo con todos los rangos especiales. En IPv6 se permite **solo unicast global `2000::/3`** y, dentro de ese rango, se bloquean Teredo/IETF (`2001::/23`), documentación y 6to4. Una lista de permitidos es más robusta que enumerar lo prohibido.
- **Anclaje de IP:** el request usa un `lookup` propio que no vuelve a consultar el DNS. Devuelve únicamente las IP ya validadas (y las revalida), soporta `all:true` y rechaza cualquier otro host. `servername` y `Host` llevan el nombre original, así que TLS verifica el certificado contra el nombre sin tocar `rejectUnauthorized` ni `checkServerIdentity`.
- **Conexión nueva por salto** (`agent: false`, `Connection: close`): ningún socket se reutiliza entre destinos.
- **Redirecciones manuales**, máximo 3. `Location` se resuelve contra la URL actual y el salto pasa por la validación completa.
- **Límites:** un solo `AbortSignal.timeout(10 s)` para DNS, conexión, TLS y cuerpo. Tope de 2 MB sobre los bytes que llegan y, si hay compresión, también sobre los descomprimidos (cubre bombas de compresión). No se confía en `Content-Length`.
- **`acceptEncoding` cerrado** (`identity` por defecto, o `gzip-br`). La página principal se pide con `gzip-br` para que PER-01 lea `Content-Encoding` de esa misma respuesta.
- **Opciones de prueba solo en una fábrica interna** (`create-safe-fetch.ts`): resolver falso, redirección de la conexión a un servidor local *después* de validar una IP pública, CA de prueba y timeout corto. El paquete exporta en runtime únicamente `safeFetch`, armado sin esas opciones. La política de IP nunca se relaja en las pruebas.
- **User-Agent:** `AuditorWebPyme/1.0 (+URL)`. La URL llega como parámetro (`contactUrl`); la API la toma de `AUDITOR_CONTACT_URL` y no arranca en producción si falta. Así el scanner sigue siendo puro.

## Consecuencias
- Los errores tienen un código cerrado (`SafeFetchErrorCode`) que la API traduce a mensajes en español.
- La información TLS (versión negociada, certificado) para SEC-03/SEC-04 se agrega en H3 sobre esta misma conexión.
- El límite de 1 request por segundo por dominio y `robots.txt` (regla 3) van en el orquestador del rastreo (H2/H3), no en `safeFetch`.

## Actualización (H3, 18/11/2026)
- La respuesta incluye el código de cada salto (`redirects: { url, status }[]`, para SEC-02) y los datos TLS de la conexión ya verificada (`tls`: versión, emisor y vigencia, para SEC-03 y SEC-04).
- Si la verificación TLS falla, `SafeFetchError.detail` lleva el código de Node (por ejemplo `CERT_HAS_EXPIRED`) y el orquestador arma `tls: { valid: false, error }`. **Nunca se reintenta con la verificación apagada** para obtener datos del certificado.
- El orquestador espera 1 s entre requests al mismo dominio. Las redirecciones dentro de una misma llamada (máximo 3) se siguen enseguida, como hace un navegador; queda anotado como limitación conocida de la regla 3.
