# BACKLOG — Presupuesto de las Universidades Públicas del Perú

Objetivo: evaluar a TODAS las universidades públicas del Perú con datos del MEF (SIAF), en varios años:
cómo empezaron (PIA), cómo terminaron (PIM, devengado), en qué gastan (personal, bienes y servicios,
infraestructura/inversión, investigación), de dónde sale el dinero (RO, RDR, canon) y cuánto recaudan.

## Fuentes (estado al 23-nov-2026)
- API SQL MEF `datastore_search_sql` → **404 (caída/retirada)**. No usar.
- CSV anuales `fs.datosabiertos.mef.gob.pe/datastorefiles/{año}-Gasto.csv` → OK, 7–10 GB c/u (lento).
- Consulta Amigable (apps5.mineco.gob.pe/transparencia/Navegador) → OK, pre-agregada. Vía principal.

## Pendientes
- [ ] Gasto por universidad × año × genérica / fuente / actividad-proyecto (agente gasto)
- [ ] Inversión: proyectos, programas presupuestales (0066 formación, 0137 CTI), función (agente inversión)
- [ ] Ingresos: RDR y otros, PIM vs recaudado (agente ingresos)
- [ ] Contexto: estudiantes, docentes, publicaciones, región, fundación (agente contexto)
- [ ] Frontend mobile-first (agente frontend)
- [ ] Integración + índice de evaluación + metodología/caveats (integrador)
- [ ] Deploy GitHub Pages

## Decisiones
- Llave = código de PLIEGO (3 díg, ej. "514" UNI). Montos en soles (números crudos, no millones).
- Sitio estático (HTML+JS+Chart.js, sin build). Python con venv fuera del repo (~/.venvs/).
