# 0008. Despliegue en Render, límites de uso y retención

- **Estado:** aceptada
- **Fecha:** 2026-11-23
- **Historias:** H13, H14 y H15 (RF-15, RF-16, RNF-03, RNF-05, RNF-11, RNF-12)

## Contexto
La demo tiene que estar publicada sin costo. Se eligió Render, en su plan gratuito: un servicio web con Docker. Sus límites, según la documentación vigente, condicionan el diseño:
- se apaga a los 15 minutos sin tráfico y tarda alrededor de un minuto en volver;
- puede reiniciarse en cualquier momento;
- el disco es efímero y no se puede agregar uno persistente;
- da 750 horas por mes;
- la app tiene que escuchar en `0.0.0.0` y en `PORT` (10000 por defecto).

## Decisión

### Un solo contenedor
- La API sirve también la web compilada, desde el manejador de "no encontrado". Así no agrega rutas ni tapa las de `/api`, y solo responde a GET y HEAD.
- **Sin dependencias.** Al arrancar se lee `apps/web/dist` a memoria y se arma una lista blanca exacta de rutas; nunca se toca el disco por pedido. Se rechazan:
  - las codificaciones `%2f`, `%5c`, `%00` y `%25`;
  - las barras invertidas, el byte nulo y los segmentos `.` y `..`.
- Una ruta con extensión que no existe da 404, nunca el HTML de la SPA.
- **Cache:** `index.html` va con `no-cache`; `/assets/*`, que tiene hash en el nombre, va con un año e `immutable`.
- **Cabeceras:** `nosniff` en todo.
- **CSP del documento:** `default-src 'self'`, sin `'unsafe-inline'` ni orígenes externos. Para cumplirla, las barras de puntaje y progreso dejaron de usar `style` y pasaron a clases con pasos de 5 %. El valor exacto queda en `aria-valuenow`.
- **Verificación en Chrome headless:** el control positivo da 2 violaciones; las 5 páginas reales, ninguna.

### Configuración
- En producción `PORT` es obligatoria.
- Todos los problemas de configuración se informan juntos y sin stack trace.
- `ADMIN_PASSWORD_HASH` tiene que tener el formato PHC de argon2id. Si no lo tiene, el mensaje dice si parece que trae comillas o que perdió los `$`.
- **Panel de Render:** el hash se pega tal cual. La documentación de Render no dice que interprete los valores, y la validación del arranque detecta si se altera.
- **`IP_HASH_SALT`:** con `generateValue: true` se genera una única vez. Cambiarla reinicia los contadores.
- **`CONTACT_CAPTURE_ENABLED`:** por defecto es `false` en producción. Así no se cargan correos reales hasta publicar los textos legales. La web consulta `GET /api/config` y, mientras no sabe el valor, no ofrece el campo (falla cerrado).

### IP del cliente detrás del proxy
- La documentación de Render no dice qué cabecera usa ni cuántos saltos hay delante de la app; solo menciona Cloudflare y un balanceador que termina TLS.
- `TRUST_PROXY_HOPS` es configurable. **Medición en producción (23/11/2026)** con `LOG_PROXY_CHAIN`, que registra solo la cantidad de entradas de `X-Forwarded-For`:
  - un pedido normal llega con 3 entradas: el cliente y dos proxies;
  - un pedido con una cabecera falsa llega con 4, porque la falsa queda a la izquierda.
- **Valor elegido: 3.** Con 1 o 2, la clave del bloqueo cambiaba en cada pedido, porque la app tomaba la IP de un proxy que rota; el sexto intento fallido seguía dando 401. Con 3:
  - tras 5 fallos, los intentos siguientes dan 429;
  - un `X-Forwarded-For` falsificado, con una o dos entradas, no esquiva el bloqueo.

  `render.yaml` queda en 3.
- **Hallazgo:** Fastify 5.12 ignora el `trustProxy` numérico, porque decidió fallar cerrado. Se pasa una función que confía en los primeros N saltos. Es seguro solo porque al servicio de Render se llega únicamente a través de su proxy. Ejecutado fuera de un proxy, `TRUST_PROXY_HOPS` tiene que quedar en 0.
- Las pruebas verifican que un `X-Forwarded-For` falsificado por el cliente no esquiva el límite.

### Límites de uso (H13)
- **Topes:** viven en memoria, porque la base es efímera y persistirlos no aportaría nada. Se aplican solo a `POST /api/audits`.
  - Por IP: HMAC con sal sobre el /64 en IPv6.
  - Cooldown por dominio: el host va en minúsculas, punycode y sin punto final.
  - Tope diario: corta a la medianoche de Buenos Aires y el mensaje lo dice.
- **Revisión antes de consumir:** se revisan todos los topes y recién después se consume cupo. Un pedido rechazado o inválido no gasta cupo, y un 429 no extiende ni reinicia el período.
- **`Retry-After`:** en segundos enteros, redondeado hacia arriba.
- **Memoria acotada:** como máximo 10.000 claves por mapa. Al llenarse, primero se descartan las vencidas; si sigue lleno, las claves nuevas reciben 429 genérico (falla cerrado). Nunca se expulsa una clave vigente, para que nadie pueda reiniciar un contador llenando el mapa.
- **Lo que no limitan:** `/api/health` no pasa por los límites, no toca la base y no escribe en el log (`logLevel: 'silent'`). Lo consulta un ping externo.
- **Valores por defecto:** 20 auditorías por IP por hora, 30 s por dominio, 300 por día, 2 simultáneas y 20 en cola. Alcanzan para que alguien pruebe varias veces seguidas.

### Retención y borrado (H14)
- **Purga:** corre al arrancar y cada hora, en una sola transacción. Borra:
  - los informes de más de 30 días, con sus hallazgos en cascada;
  - los contactos, 30 días después de su última auditoría, o de su alta si no les quedan;
  - las sesiones vencidas;
  - los contadores de ingreso.
- Las constantes de retención viven en `packages/shared` y el aviso de privacidad las muestra, así que siempre coinciden.
- **Contadores de ingreso:** se respeta el horizonte del ADR 0007. Se borran solo si pasaron más de 15 minutos sin fallos y no hay bloqueo vigente. No hay discrepancia: el bloqueo máximo es de 15 minutos desde el último fallo, y a partir de ese momento `recordFailure` ya trata el contador como vencido.
- **Borrado manual:** `DELETE /api/admin/audits/:id` y `DELETE /api/admin/leads/:id`, con sesión, Origin y CSRF.
- **D-02:** la migración 0003 creó `audits.lead_id` sin `ON DELETE SET NULL`, aunque el schema lo declara. El vínculo se pone en null a mano en la misma transacción; no hace falta migración.

### Legales (H15)
- `/privacidad` y `/terminos` son borradores marcados como tales.
- Reflejan lo que la app hace: datos guardados, retención, huella de IP solo en memoria, dos cookies técnicas solo en el panel, base efímera y alojamiento fuera de la Argentina.
- Incluyen la Ley 25.326, las leyendas de la AAIP, cómo ejercer los derechos y un canal para que el titular de un sitio pida que no se lo revise.

## Consecuencias
- No hay dependencias nuevas.
- Los límites y las sesiones se pierden con cada reinicio de la demo. Se acepta y se documenta.
- Una instancia prendida todo el mes usa unas 744 de las 750 horas gratuitas.
- **RNF-11** decía "VPS económico". La demo usa un PaaS gratuito con la misma imagen Docker, y `docker compose up` sigue funcionando para un VPS.
- **Memoria medida en Windows (Node 24, dist):**

  | Momento | RSS |
  |---|---|
  | En reposo, recién arrancado | 182 MB |
  | En reposo, después del recolector de basura | 86 MB |
  | Pico con 2 auditorías simultáneas | 197 MB |

  El panel de Render confirma los límites del plan gratuito: 512 MB de memoria y 0,15 de CPU. Las métricas de memoria y CPU solo están disponibles en planes pagos, así que el consumo dentro del contenedor no se puede medir en la demo. La medición local deja un margen amplio.
