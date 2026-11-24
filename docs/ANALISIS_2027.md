# ¿A quién le dieron más en 2027?

Reparto del aumento del presupuesto de apertura (PIA) de las universidades públicas entre 2026 y 2027.

**Fuente:** dictamen del Presupuesto 2027 (5-nov-2026), anexos 4 y 5 del proyecto, comparado contra el PIA 2026 del SIAF (Consulta Amigable del MEF). Montos nominales. El Pleno aprobó la autógrafa el 20-nov-2026, pero sus anexos por universidad todavía no están publicados, así que los montos pueden variar.

**Cómo regenerarlo:** `python3 etl/build.py && python3 etl/analisis2027.py`. El resultado queda en `data/analisis2027.json`.

## Total

- **PIA 2026:** S/ 6,700.1 M.
- **PIA 2027:** S/ 7,551.8 M.
- **Aumento neto:** **+S/ 851.6 M (+12.7 %)**.
- **Suben:** 51 universidades, que suman +S/ 1,008.9 M. De ellas, 47 ya tenían PIA en 2026 y 4 son nuevas (sin PIA 2026).
- **Bajan:** 16 universidades, que suman −S/ 157.2 M.
- **Sin monto 2027:** 4 universidades (578, 579, 582 y 583). El art. 87 prevé financiar su arranque con la reserva de contingencia, sin monto fijado.

## Concentración

- **Las 5 que más suben se llevan el 52 % del aumento neto,** y las 10 primeras, el 76 %.

| Universidad | Δ PIA 2027 vs 2026 | Δ % | Δ en inversión | Δ en recursos determinados (canon) |
|---|---|---|---|---|
| U.N. del Santa (Áncash) | +S/ 131.2 M | +129 % | +S/ 124.0 M | +S/ 114.6 M |
| U.N. Ciro Alegría (La Libertad) | +S/ 96.2 M | +334 % | +S/ 96.5 M | +S/ 96.2 M |
| U.N. San Agustín (Arequipa) | +S/ 84.3 M | +23 % | +S/ 69.2 M | −S/ 4.7 M |
| U.N. Mayor de San Marcos (Lima) | +S/ 71.3 M | +11 % | +S/ 60.8 M | +S/ 0.2 M |
| U.N. Santiago Antúnez de Mayolo (Áncash) | +S/ 57.7 M | +51 % | +S/ 52.2 M | +S/ 43.6 M |

## En qué va el aumento

| Genérica | Δ 2027 vs 2026 |
|---|---|
| Inversión (2.6, activos no financieros) | **+S/ 592.5 M (70 %)** |
| Personal (2.1) | +S/ 207.4 M |
| Bienes y servicios (2.3) | +S/ 41.3 M |
| Otros | +S/ 16.6 M |
| Pensiones (2.2) | −S/ 6.1 M |

## De dónde sale

| Fuente | Δ 2027 vs 2026 |
|---|---|
| Recursos directamente recaudados (RDR) | +S/ 292.3 M |
| Recursos determinados (canon y similares) | +S/ 266.0 M |
| Recursos ordinarios | +S/ 244.5 M |
| Donaciones y transferencias | +S/ 48.9 M |

El aumento de RDR es una **proyección de recaudación propia**. El PIA de RDR suele estar subestimado y se amplía durante el año, así que parte de esa subida puede ser un ajuste contable y no plata nueva.

## Quién baja y por qué

Casi todas las bajadas se explican por **menos inversión financiada con canon**:

| Universidad | Δ total | Δ en inversión | Δ en canon (RD) |
|---|---|---|---|
| U.N. Intercultural de Quillabamba (Cusco) | −S/ 30.5 M (−39 %) | −S/ 29.9 M | −S/ 19.0 M |
| U.N. de Arte Diego Quispe Tito (Cusco) | −S/ 22.4 M (−33 %) | −S/ 21.9 M | −S/ 21.5 M |
| U.N. San Antonio Abad (Cusco) | −S/ 20.3 M (−5 %) | −S/ 33.5 M | −S/ 33.3 M |
| U.N. Altoandina de Tarma (Junín) | −S/ 17.4 M (−39 %) | −S/ 17.1 M | (recursos ordinarios −S/ 18.7 M) |
| U.N. de Moquegua | −S/ 13.8 M (−18 %) | −S/ 10.7 M | −S/ 10.0 M |

- **Cusco** es el único departamento con una caída fuerte: **−S/ 73.3 M**. Las tres universidades de la región pierden recursos determinados. La hipótesis es una menor proyección del canon gasífero de Camisea; **no está verificada con la transferencia de canon por recurso.**
- **Los departamentos que más ganan** son Áncash (+S/ 188.9 M), La Libertad (+S/ 152.2 M), Lima (+S/ 126.9 M), Arequipa (+S/ 84.3 M) y Cajamarca (+S/ 59.7 M).

## ¿Reciben más las que ejecutan mejor?

No se observa relación:

- La correlación de rangos entre la ejecución de 2025 y la variación % del PIA 2027 es **ρ = −0.01**.
- La correlación entre la ejecución de proyectos en 2025 y el aumento en inversión 2027 es **ρ = 0.06**.

El reparto parece seguir sobre todo al **canon disponible** y a la cartera de proyectos, no al desempeño de ejecución. Es una asociación descriptiva, no un juicio causal.

## Por estudiante

En las 48 universidades con matrícula (SIRIES 2023), la mediana del PIA por estudiante pasa de **S/ 18,954 (2026)** a **S/ 20,752 (2027)**. Ojo: la matrícula usada es de 2023.
