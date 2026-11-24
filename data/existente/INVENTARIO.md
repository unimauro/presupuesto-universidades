# Inventario: datos que ya existían (repos locales y VPS)

Fecha: 23-nov-2026. Agente: inventario. En los repos ajenos y en el VPS solo se leyó.
Llave: pliego de 3 dígitos (p. ej. "514" = UNI). Montos en soles (S/) corrientes, salvo que se indique otra unidad.

## Archivos consolidados en `data/existente/`

| Archivo | Contenido | Cobertura | Generado por |
|---|---|---|---|
| `planilla.json` | Planilla AIRHSP por pliego universitario y año, solo agregados: servidores activos, docentes y no docentes, por régimen, por grupo ocupacional, docentes nombrados o contratados, pensiones y vacantes. Incluye nº de personas, masa mensual y costo anual. | 2017–2025 (corte en diciembre; 2020 en noviembre). De 48 pliegos en 2017 a 65 en 2025 | `etl/inventario_planilla.py` |
| `series_observatorios.json` | Serie PIA/PIM/cert/dev/gir/ejec_pct por año | **7 pliegos**: 510, 511, 513, 514, 518, 524, 528. Años 2012–2026 (2026 es parcial) | `etl/inventario_consolidar.py` |
| `detalle_observatorios.json` | Desgloses por genérica, fuente, función, categoría, producto/proyecto y unidad ejecutora (PIM y dev) | Esos 7 pliegos, solo 2025 (la UNALM también tiene 2026 parcial) | idem |
| `siaf_2024_2025.json` | **Detalle SIAF completo de todos los pliegos universitarios**: totales y cortes por genérica, fuente, rubro, programa presupuestal, actividad/proyecto, función, categoría de gasto y ejecutora (pia/pim/cert/comp/dev/gir) | 2024 y 2025 (años cerrados) | `etl/inventario_siaf_vps.sh` + `inventario_consolidar.py` |
| `siaf_vps/raw_{2024,2025}.json` | Cubo sin colapsar: pliego × ejecutora × act/proy × programa × función × fuente × rubro × categoría × genérica, más proyectos por CUI × fuente | idem | `etl/inventario_siaf_vps_remote.py` (corre en el VPS y emite a stdout) |
| `proyectos_2024_2025.json` | Proyectos de inversión (TIPO_ACT_PROY=2) por pliego: CUI, nombre, montos y desglose por fuente | 2024–2025 | idem |
| `conosce.json` | Adjudicaciones CONOSCE/OECE por pliego × año × objeto (bien, servicio, obra, consultoría): nº de procesos e ítems, monto referencial y monto adjudicado | 64 pliegos, 2018–2026 | `etl/inventario_conosce.sh` + consolidar |
| `conosce_raw.csv` | Extracción cruda (año × RUC × objeto × moneda) | idem | `etl/inventario_conosce.sh` |
| `universidades_peru_2025.json` | Cruce: PIM/dev 2025, PP 0137 (CTI) PIM/dev 2025 y mapeo pliego ↔ OpenAlex/ROR, con publicaciones y h-index | 36 pliegos. Venía en S/ millones con 1 decimal (±S/50 mil) | consolidar |

Reproducir: `python3 etl/inventario_planilla.py` (~10 min, solo stdlib) · `bash etl/inventario_siaf_vps.sh` (unos 15–25 min por año en el VPS) · `bash etl/inventario_conosce.sh` · `python3 etl/inventario_consolidar.py`.

## Hallazgos por fuente

### 1. Observatorios por universidad (repos locales)
`~/Documents/Repos/observatorio-{uni,sanmarcos,unsaac,unsa,villarreal,unalm,cantuta}/data/presupuesto-*.json`
- La serie 2012–2026 de PIA/PIM/cert/dev/gir viene de la Consulta Amigable hasta 2024 y, según el repo, de SIAF Datos Abiertos o de la Consulta Amigable para 2025–2026. El `_meta` de cada pliego trae la fecha de extracción: UNSAAC y UNALM el 16-nov-2026, el resto en jul-2026. Por eso el 2026 parcial de cada una tiene **cortes distintos**.
- Calidad: el PIM y el devengado 2025 coinciden con `universidades-peru` en los 7 pliegos, con una diferencia menor a S/50 mil que se explica por el redondeo de esa fuente.
- `observatorio-ensad` es el pliego 010 MINEDU, no una universidad. Se excluye.
- Los archivos `planilla-*.json` de los observatorios son **nominales** (vienen del PTE o del PAP, con nombres de personas). No se consolidaron.

### 2. Scrapers reutilizables de la Consulta Amigable
Ya se avisó a los agentes gasto, inversion e ingresos.
- **`observatorio-unalm/etl/scraper_ca_unalm.py`** es el más completo. Drill: Año → `BtnTipoGobierno` (E) → `BtnSector` (10) → `BtnPliego`. En el nivel pliego pulsa `BtnEjecutora`, `BtnFuncion`, `BtnGenerica`, `BtnProdProy`, `BtnFuenteAgregada` y `BtnProgramaPpto`. La sesión con requests y cookies pasa el WAF sin navegador.
- La página que devuelve `BtnPliego` en el sector 10 ya lista **todas** las universidades nacionales, con un POST por año.
- Variantes por pliego: `observatorio-{uni,sanmarcos,unsaac,unsa,villarreal,cantuta}/etl/scraper_ca_*.py`.
- Drill de dos niveles (X → Mes) en el ámbito Proyecto: `cien-dias-peru/etl/scrape_inversion_mef.py`. Programa presupuestal: `qhaway-dashboard/etl/scraper_programa.py`. Departamento: `qhaway-dashboard/etl/scraper_consulta_amigable.py`.
- La API SQL de Datos Abiertos (`build_mef_*.py` de observatorio-uni y `qhaway-dashboard/etl/build_mef.py`) responde **404** desde el 16-nov-2026. Esos scripts no sirven sin cambios.

### 3. AIRHSP (planilla oficial)
- Los CSV crudos 2017–2025 ya están en `~/salariosperu-data/mef_airhsp/PERSONALSP_AAAA.csv` (unos 550 MB cada uno, **sin nombres**). De ahí sale `planilla.json`, filtrando sector 10 y pliegos "U.N."/"UNIVERSIDAD".
- `peru-transparente/data/airhsp_por_pliego_regimen.csv.gz` es solo una foto de dic-2025, con llave por **nombre** de pliego (sin código) y con activos, pensionistas y vacantes **mezclados**. `planilla.json` lo reemplaza.
- Docente = grupo ocupacional "Docentes Universitarios" (régimen Carreras Especiales).
- Totales: los activos universitarios pasan de 43,918 (2017) a 52,429 (2025). Los docentes, de 24,075 a 28,637. El costo anual de activos sube de S/1.57 mil M a S/2.98 mil M.
- Caveat: `costo_anual` es el costo **programado** en el AIRHSP (incluye aportes, aguinaldos y escolaridad), no el devengado. Para el gasto ejecutado se usa la genérica 2.1 del SIAF.

### 4. VPS 217.15.168.100 (acceso SSH por llave: OK)
- **`/opt/qhaway-api/raw/2024-Gasto.csv.gz` y `2025-Gasto.csv.gz`**: detalle SIAF completo del MEF con PLIEGO. Pesan 718 y 740 MB y se descargaron el 1-jul-2026 y el 25-jun-2026; ambos años están cerrados. De ahí salen `siaf_2024_2025.json` y `proyectos_2024_2025.json`. No hay otros años en el VPS.
- `qhaway-db` (BD qhaway): `gasto_cubo` (557k filas), `gasto_sector`, `res_cubo_n` y `gasto_meta_*` están agregados por sector, departamento, función, fuente y programa, **sin pliego**. No sirven para cortar por universidad.
- `licitaperu-alertas-db-1` (BD gopues): `conosce_adjudicaciones` (550k), `conosce_contratos` (720k), `conosce_pac` (1.9M), `conosce_procesos` y `conosce_entidades` (RUC ↔ codigo_siaf). Para universidades se extrajo el agregado de adjudicaciones de 2018–2026.
  - Cruce por nombre normalizado más 5 alias revisados a mano.
  - Sin match: U.N. Autónoma de Bellas Artes, U.N. Autónoma de Chiclayo y U.N. de Folklore José María Arguedas. No aparecen como pliego en el AIRHSP 2025; probablemente dependen de MINEDU o se crearon en 2026.
  - `conosce_contratos` y `conosce_pac` no se extrajeron. Se pueden agregar igual por `codigo_entidad`.
- `peru-transparente-api` no tiene contenedor Postgres propio en el VPS. `pp2050-db` no trae datos por pliego.

### 5. Otros
- `universidades-peru/data/universidades.json` trae 95 universidades: OpenAlex, más PIM/dev 2025 y PP 0137 para 36 públicas, más el código `pliego`. Sirve para el agente contexto (publicaciones, h-index, investigadores).
- `peru-transparente/data/mef_personal_anual.csv`: genérica 2.1 a nivel nacional por año, no por pliego.
- No se encontraron datos de **ingresos** (recaudación RDR por pliego) en ningún repo ni en el VPS.

## Huecos que siguen abiertos
- Serie 2012–2023 por pliego para las ~55 universidades sin observatorio. Le toca al agente gasto, con un `BtnPliego` por año.
- Desglose por genérica o fuente antes de 2024, salvo lo que traen los 7 observatorios.
- Ingresos y recaudación por pliego.
