# BACKLOG — Presupuesto de las Universidades Públicas del Perú

Objetivo: evaluar a TODAS las universidades públicas del Perú con datos del MEF (SIAF), en varios años:
cómo empezaron (PIA), cómo terminaron (PIM, devengado), en qué gastan (personal, bienes y servicios,
infraestructura/inversión, investigación), de dónde sale el dinero (RO, RDR, canon) y cuánto recaudan.

## Fuentes (estado al 23-nov-2026)
- API SQL MEF `datastore_search_sql` → **404 (caída/retirada)**. No usar.
- CSV anuales `fs.datosabiertos.mef.gob.pe/datastorefiles/{año}-Gasto.csv` → OK, 7–10 GB c/u (lento).
- Consulta Amigable (apps5.mineco.gob.pe/transparencia/Navegador) → OK, pre-agregada. Vía principal.

## Hecho (23-nov-2026)
- [x] Gasto 2012–2026, 71 pliegos, CA MEF, 0 descuadres (etl/gasto_consulta_amigable.py)
- [x] Ingresos 2012–2026 desde CSV MEF, validado vs CA ingresos (etl/ingresos_*.py)
- [x] Contexto SIRIES/OpenAlex/SUNEDU (etl/contexto_*.py)
- [x] Integrador etl/build.py: KPIs, índice, IPC BCRP (soles reales), capas resumen/anio/u
- [x] Frontend index (10+ secciones, ¿Subió o bajó?, Expectativa 2027), historias.html, OG con meme (etl/og_generar.py)
- [x] 71 páginas SEO u/<slug>/ + sitemap (etl/paginas_generar.py, paginas_verificar.py)
- [x] GTM-K2PJ776Z; deploy unimauro.github.io/presupuesto-universidades

## Hecho (24-nov-2026)
- [x] 2027 primero: bloque hero (▲ +S/ 852 M, +12.7 %), sección 02, análisis ¿a quién le dieron más? (etl/analisis2027.py, docs/ANALISIS_2027.md), p2027.json (428 obras, 14 nuevas), 57 disposiciones por grupo
- [x] Línea base vs Estado/Educación/PBI (data/baseline), IPC BCRP
- [x] Sistema visual v2 (BRAND.md), historias 12 capítulos, hero con arte peruano (assets/hero), uniPicker, ¿Se ejecutó?, cifras adaptativas, tema claro por defecto
- [x] Normativa 2016-2026 (73 DS, canon, leyes; PIA ley = SIAF 522/522)

## Pendientes
- [ ] Inversión: programas 2021–2023 completos + proyectos (agente inversion)
- [ ] Normativa: leyes 2016–2026, DS de transferencias, canon (agente normativa)
- [ ] Ley 2027 publicada: cambiar version a "ley" en etl/ley2027_build.py, re-correr build + analisis2027 + og + paginas + generar_hero
- [ ] Frontend: carga por capas + gráficos pulidos + P0/P1 de docs/UX_AUDIT.md (deep link #u, "sin dato" vs 0, buscador arriba, ranking móvil, contraste, 71 vs 65)
- [ ] historias.js: carga por capas + P1 de la auditoría
- [ ] Registrar sitemap en Google Search Console
- [ ] Reescribir historial si se quiere quitar la IP del VPS del commit 083e83e

## Regenerar todo
python3 etl/build.py && python3 etl/analisis2027.py && python3 etl/og_generar.py && python3 etl/paginas_generar.py && python3 etl/paginas_verificar.py && python3 assets/hero/generar_hero.py

## Decisiones
- Llave = código de PLIEGO (3 díg, ej. "514" UNI). Montos en soles (números crudos, no millones).
- Sitio estático (HTML+JS+Chart.js, sin build). Python con venv fuera del repo (~/.venvs/).
