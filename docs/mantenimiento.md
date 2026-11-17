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
| | | | | | | |

## 3. Plan de mantenimiento posterior a la entrega

| Tarea | Frecuencia | Cómo |
|---|---|---|
| Revisar dependencias vulnerables | Mensual y en cada integración | Auditoría de dependencias; actualizar las que tengan avisos altos o críticos |
| Renovación del certificado HTTPS | Automática | El servidor web la renueva sola; se verifica en la revisión mensual |
| Revisión de registros y errores | Semanal | Buscar errores repetidos, picos de uso y rechazos del cliente HTTP seguro |
| Purga de informes vencidos | Diaria | Tarea automática; se verifica que corra |
| Copia de seguridad de la base | Diaria | Copia del archivo de la base fuera del servidor y prueba de restauración mensual |
| Revisión de los checks | Trimestral | Ajustar umbrales y textos según cambios en las recomendaciones de seguridad y de SEO |
| Revisión de pesos del puntaje | Con cada piloto o prueba de usabilidad | Contrastar con los resultados y las opiniones de los usuarios |
| Actualización de la documentación | En cada cambio | Léame, manuales, trazabilidad y decisiones |

## 4. Responsable y contacto

Mantenedor: Iñaki Nicolás Antonena (iantonena@alumnos.kennedy.edu.ar).
