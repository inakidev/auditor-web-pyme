# 0006. Contactos con consentimiento expreso

- **Estado:** aceptada
- **Fecha:** 2026-11-18
- **Historia:** H11 (RF-11, RNF-05)

## Contexto
La agencia quiere captar contactos, pero el correo es un dato personal (Ley 25.326): solo se puede guardar con consentimiento expreso y registrado.

## Decisión
- El correo es **opcional**. Si viene correo sin `consent: true`, la API responde 400 (`CONSENT_REQUIRED`) y **no guarda nada**, ni el correo ni la auditoría. Sin correo, el consentimiento se ignora.
- Tabla `leads` (correo, fecha de consentimiento, **versión del texto aceptado** `consent_text_version`, dominio, estado, fecha de alta). El texto de la casilla vive en `packages/shared` (`CONSENT_TEXT`); si cambia, se sube la versión.
- El correo se normaliza (sin espacios, en minúsculas) y se valida con zod (máx. 254 caracteres). Los errores de validación **no repiten el valor recibido**.
- El correo nunca aparece en el informe público ni en los logs: pino redacta `req.body.email` y cualquier campo `email` como defensa extra.
- La auditoría guarda `lead_id`; los contactos solo se ven en el panel de consultores (H12).

## Límite conocido
Sin verificación por correo (doble opt-in), **alguien podría cargar el correo de un tercero**. Se mitiga con el texto claro de la casilla, el registro de fecha y versión, el borrado a pedido (H14) y los límites de uso (H13). La verificación por correo queda como mejora futura.

## Consecuencias
- Hasta que el aviso de privacidad real esté publicado (H15), la página `/privacidad` dice "en preparación" y **no se cargan correos reales**. Quedó como condición de la puerta de salida de la etapa 6.
