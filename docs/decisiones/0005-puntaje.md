# 0005. Puntaje por categoría y global

- **Estado:** aceptada
- **Fecha:** 2026-11-18
- **Historia:** H7 (RF-07)

## Contexto
RF-07 pide un puntaje por categoría y uno global, con ponderación documentada y editable, que dé siempre el mismo resultado para los mismos datos. La categoría confianza no tiene checks hasta H10.

## Decisión
- **Fórmula** (plan, sección 5): por categoría, `100 × Σ(peso × resultado) / Σ(peso)`, con pesos por severidad C=5, A=3, M=2, B=1, I=0 y resultados cumple=1, advertencia=0,5, no cumple=0.
- **Fuera del puntaje:** "no aplica" y **"no evaluado"** (un check que falló o no se pudo evaluar). Nunca cuentan como 0 ni como cumple, y se muestran en el informe.
- **Categoría sin checks con peso:** queda "sin datos" (`null`), nunca 0.
- **Global:** ponderación inicial seguridad 35 %, SEO 30 %, analítica 15 %, confianza 15 % y rendimiento 5 %, **repartida entre las categorías con datos**. La API devuelve sobre cuántas categorías se calculó (`categoriesUsed` de `categoriesTotal`) y la interfaz lo muestra.
- **Bandas:** A ≥ 90, B 75 a 89, C 60 a 74, D 40 a 59, E < 40, sobre el global redondeado.
- **Configuración** en `packages/scanner/src/scoring/config.ts`; la fórmula (`scoreFindings`) es una función pura del scanner. La API la aplica al guardar los hallazgos y guarda los puntajes en columnas propias (para filtrar por puntaje en el panel, RF-12).

## Consecuencias
- Hasta H10, el global se calcula sobre 4 de 5 categorías como máximo.
- Los pesos se revisan con los resultados de la prueba de usabilidad (H16) cambiando solo la configuración.
