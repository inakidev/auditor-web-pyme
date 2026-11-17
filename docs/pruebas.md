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

- [ ] `http://127.0.0.1` y `http://localhost`
- [ ] `http://0.0.0.0`
- [ ] `http://10.0.0.1`, `http://172.16.0.1` y `http://192.168.1.1`
- [ ] `http://169.254.169.254` (metadatos de la nube)
- [ ] `http://[::1]`, `http://[fd00::1]` y `http://[fe80::1]`
- [ ] `http://[::ffff:127.0.0.1]` (IPv4 mapeada)
- [ ] `http://2130706433` (decimal), `http://0177.0.0.1` (octal) y `http://0x7f000001` (hexadecimal)
- [ ] `http://ejemplo.com@127.0.0.1` (credenciales en la URL)
- [ ] `file:///etc/passwd`, `gopher://...` y `ftp://...`
- [ ] Puertos `:22`, `:6379` y `:8080`
- [ ] Dominio que resuelve a una IP interna
- [ ] Dominio que resuelve primero a una IP pública y después a una interna (rebinding)
- [ ] Redirección 302 hacia un destino interno
- [ ] Cadena de más de 3 redirecciones
- [ ] Respuesta de más de 2 MB y respuesta que nunca termina (timeout)

## 3. Registro de ejecuciones

| Fecha | Nivel | Alcance | Resultado | Pruebas (pasan/total) | Cobertura | Observaciones |
|---|---|---|---|---|---|---|
| | | | | | | |

## 4. Registro de defectos

| ID | Fecha | Descripción | Severidad | Requisito afectado | Estado | Commit de la corrección |
|---|---|---|---|---|---|---|
| | | | | | | |

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
