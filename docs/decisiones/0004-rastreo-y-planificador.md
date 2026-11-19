# 0004. Rastreo liviano, planificador por host y presupuesto de tiempo

- **Estado:** aceptada
- **Fecha:** 2026-11-18
- **Historia:** H5 (RF-04, RNF-06, RNF-13)

## Contexto
Los checks de SEO necesitan, además de la portada, `robots.txt`, el sitemap, el favicon y verificar enlaces internos. La regla 3 de `CLAUDE.md` fija los límites: portada más hasta 4 páginas internas, hasta 20 enlaces verificados, 1 request por segundo por dominio y respetar `robots.txt` fuera de la portada. RNF-06 pide una auditoría completa en 30 s o menos (p95) "con hasta 5 páginas".

## Decisión
- **Planificador compartido** (`HostScheduler`): 1 request por segundo por host, contado desde el inicio de cada request y **compartido entre todos los trabajos** del proceso (dos auditorías simultáneas del mismo sitio no duplican la carga). El reloj es monotónico.
- **Orden de descargas:** portada por HTTPS (`gzip, br`) y por HTTP; `robots.txt`; `sitemap.xml` con `HEAD` solo si `robots.txt` no declara uno; `favicon.ico` con `HEAD` solo si el HTML no declara un ícono; hasta 20 enlaces internos con `HEAD`.
- **Sitemap declarado en otro host:** no se descarga, solo se informa.
- **Enlaces:** deduplicados; sin `mailto:`, `tel:`, anclas, `javascript:` ni externos. Los vetados por `robots.txt` (o con `robots.txt` ilegible) quedan como **no verificados**, nunca rotos. 401, 403, 429, 405 y 501 también quedan como no verificados. La evidencia muestra las URLs sin query ni fragmento.
- **Presupuesto de 25 s solo para la fase de enlaces:** cada request recibe como deadline lo que queda del presupuesto; con menos de 1 s, los enlaces restantes quedan como no verificados ("verificamos N de M").
- **Parser de `robots.txt` propio** (RFC 9309): token de producto exacto, regla más larga y, ante empate, allow. El matcher es iterativo (sin regex ni backtracking exponencial), con límites de 500 reglas, 512 caracteres por patrón y 512 KB de archivo.
- **cheerio solo con `load(string)`** (parse5). cheerio trae `undici` como dependencia transitiva para su helper `fromURL`; ESLint prohíbe importar `undici` y `fromURL`.
- **Estado `not_evaluated`:** un check que falla o que no se pudo evaluar (por ejemplo, `robots.txt` con timeout) se muestra como "No evaluado" y queda fuera del puntaje; nunca cuenta como 0 ni como cumple.

## Desviación registrada
- **Páginas internas:** por ahora no se descargan ni analizan las 4 páginas internas que permite la regla 3; los checks de SEO corren solo sobre la portada y las páginas internas se usan únicamente para verificar enlaces con `HEAD`. RNF-06 se actualizó en REQUISITOS.md 0.3 para reflejar este alcance. Analizar páginas internas queda como mejora futura.
- **GET de respaldo** (aprobado el 18/11/2026; ampliado a 404/410 el mismo día, porque algunos servidores responden 404 al `HEAD` y 200 al `GET`): si un servidor no acepta `HEAD` (405/501) o responde 404/410, se confirma con un `GET` con `maxBodyBytes` de 8 KB. La opción de `safeFetch` solo puede bajar el tope (`Math.min(pedido, 2 MB)`, entero positivo; cualquier otro valor usa el tope normal) y nunca viene de datos del usuario. Si la respuesta supera los 8 KB, el enlace queda como no verificado.
- **Duración:** con 1 request por segundo, la auditoría completa puede rondar los 30 s (portada, robots, sitemap, favicon y 25 s de enlaces). Se mide en H16 contra RNF-06.
