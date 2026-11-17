# Certificados de prueba (claves descartables)

**Estas claves son descartables y solo sirven para las pruebas automáticas. No son secretos** y no protegen nada: se commitean a propósito para que la suite de `safeFetch` pueda probar TLS sin red.

| Archivo | Qué es |
|---|---|
| `ca.crt` | CA de prueba (su clave privada se borró al generar los certificados) |
| `fixture.crt` / `fixture.key` | Certificado para `fixture.test`, firmado por la CA de prueba |
| `selfsigned.crt` / `selfsigned.key` | Certificado autofirmado para `fixture.test` |

Vigencia: 10 años desde el 17/11/2026. Para regenerarlos, ver el historial del commit de H1 (comandos `openssl` con curva `prime256v1`).
