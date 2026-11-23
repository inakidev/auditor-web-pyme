# Registro de mantenimiento

Las consignas piden ir tomando nota de cualquier mantenimiento o prueba que se realice. Este documento reúne el registro y el plan de mantenimiento posterior a la entrega.

## 1. Tipos de mantenimiento

| Tipo | Qué es | Ejemplo en este proyecto |
|---|---|---|
| Correctivo | Corregir errores detectados | Un check que da un falso positivo |
| Adaptativo | Adaptarse a cambios del entorno | Actualizar una librería o cambiar de versión de Node.js |
| Perfectivo | Mejorar funciones o rendimiento | Agregar un check nuevo o mejorar un texto de recomendación |
| Preventivo | Evitar fallas futuras | Aumentar la cobertura de pruebas o revisar dependencias |

## 2. Registro

| Fecha | Tipo | Descripción | Causa | Solución | Requisito | Commit o PR |
|---|---|---|---|---|---|---|
| 18/11/2026 | Correctivo | La auditoría real fallaba con INTERNAL_ERROR (D-01) | Deadline fraccionario en `AbortSignal.timeout` | Redondeo y prueba de regresión con reloj que avanza en fracciones | RF-04 | `fix(scanner): redondea el deadline…` |
| 18/11/2026 | Perfectivo | Guías: 6 enlaces caídos o redirigidos | Cambios en los sitios de las guías | `pnpm check:guides` y URLs corregidas | RF-19 | `feat: agrega guías a las recomendaciones…` |
| 18/11/2026 | Adaptativo | Google responde 404 al HEAD de algunas páginas | Comportamiento del servidor externo | GET de respaldo con tope reducido tras 404 o 410 | RF-04 | `feat(scanner): confirma con GET…` |
| 23/11/2026 | Correctivo | Borrar un contacto con auditorías habría fallado (D-02) | Migración sin `ON DELETE SET NULL` | Desvínculo manual en la misma transacción | RF-16 | `feat: agrega límites de uso, purga…` |
| 23/11/2026 | Adaptativo | `trustProxy` numérico sin efecto | Fastify 5.12 lo ignora (falla cerrado) | Función propia de confianza por saltos | RF-15 | `feat: agrega límites de uso, purga…` |
| 23/11/2026 | Adaptativo | El bloqueo de ingresos no funcionaba en Render | La cadena real tiene 3 saltos de proxy, no 1 | Medición con `LOG_PROXY_CHAIN` y `TRUST_PROXY_HOPS=3` | RNF-02, RF-15 | `fix: ajusta TRUST_PROXY_HOPS a 3…` |
| 23/11/2026 | Correctivo | El botón de borrado quedaba trabado (D-03) | Recarga del detalle borrado con reintentos | Navegar primero y marcar los datos como desactualizados | RF-16 | `test: agrega pruebas e2e…` |
| 23/11/2026 | Preventivo | Pruebas e2e y de accesibilidad en CI | Cubrir el flujo completo en un navegador real | Playwright y axe en un job propio de CI | RNF-07, RNF-08 | `test: agrega pruebas e2e…` |

## 3. Plan de mantenimiento posterior a la entrega

| Tarea | Frecuencia | Cómo |
|---|---|---|
| Revisar dependencias vulnerables | Mensual y en cada integración | Auditoría de dependencias; actualizar las que tengan avisos altos o críticos |
| Renovación del certificado HTTPS | Automática | El servidor web la renueva sola; se verifica en la revisión mensual |
| Revisión de registros y errores | Semanal | Buscar errores repetidos, picos de uso y rechazos del cliente HTTP seguro |
| Purga de informes vencidos | Diaria | Tarea automática; se verifica que corra |
| Copia de seguridad de la base | Diaria | Copia del archivo de la base fuera del servidor y prueba de restauración mensual. No aplica a la demo en Render: su disco es efímero y la base se pierde en cada reinicio (ADR 0008) |
| Revisión de los checks | Trimestral | Ajustar umbrales y textos según cambios en las recomendaciones de seguridad y de SEO |
| Revisión de pesos del puntaje | Con cada piloto o prueba de usabilidad | Contrastar con los resultados y las opiniones de los usuarios |
| Actualización de la documentación | En cada cambio | Léame, manuales, trazabilidad y decisiones |

## 4. Responsable y contacto

Mantenedor: Iñaki Nicolás Antonena (iantonena@alumnos.kennedy.edu.ar).
