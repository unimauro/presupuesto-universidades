# Auditoría UX/UI — Radiografía Presupuestal (móvil primero)

Fecha: 23-nov-2026 · Alcance: `index.html` + `app.js` + `styles.css` (agente `frontend`) e `historias.*` + `assets/brand` (agente `ui-historias`).
Método: Playwright + Chrome real con emulación móvil (375×812, DPR 2, táctil), 768×1024 y 1280×800; tema claro y oscuro; red limitada (Slow 4G = 1.6 Mbps/150 ms RTT + CPU ×4, y Fast 4G = 9 Mbps/60 ms); sitio en vivo y build local. Capturas en el scratchpad de la sesión (`shots2/*.png`), no versionadas.

Prioridades: **P0** bloquea una tarea central o da un dato engañoso · **P1** importante, afecta a la mayoría de visitas móviles · **P2** mejora.

---

## Resumen: lo que funciona bien

- Base mobile-first sólida: sin scroll horizontal de página a 375 px (`scrollWidth = 375` en vivo), tablas dentro de `.table-wrap`, KPIs en 2 columnas, gráficos de barras horizontales con alto según el número de filas (`sizeFor`).
- Todos los `<canvas>` tienen `aria-label`; todas las `<img>` tienen `alt`; todos los `select`/`input` tienen label. Hay `skip link`, `:focus-visible` visible (ocre 3 px) y `prefers-reduced-motion`.
- Las advertencias honestas ya existen: año en curso punteado, "índice referencial, NO oficial", "avance financiero, no físico", S/ por estudiante como "cota superior". El tono es neutral.
- Modo oscuro bien resuelto en index (los contrastes oscuros pasan AA: muted 7.2:1, accent 7.15:1).
- Desktop (1280) limpio: sidebar con scrollspy y 6 KPIs en una fila.

---

## P0 — bloqueantes

### P0-1. El enlace directo a una ficha (`#u=514`) no lleva a la ficha
- **Dónde:** `app.js` → `handleHash()` (≈ l. 1434) + `setupLazy()`.
- **Problema:** se abre `index.html#u=514` en el celular y la página termina en la sección 3 ("Empezaron y terminaron"), no en la ficha. `#ficha.getBoundingClientRect().top` = **3957 px** (en vivo) y **5420 px** (local) después de 6 s. El selector sí queda en 514, pero el usuario no lo ve. Es la función que se va a compartir por WhatsApp y Twitter, así que es lo primero que verá un periodista.
- **Causa:** `scrollIntoView` corre una sola vez en un `requestAnimationFrame`, mientras las secciones de arriba todavía muestran el skeleton (220 px). Cuando el lazy-render las pinta (ranking, trayectoria, etc. miden miles de px), la ficha se va hacia abajo. `html { scroll-behavior: smooth }` lo empeora.
- **Fix:**
  ```js
  function handleHash() {
    const m = /^#u=([^&]+)/.exec(location.hash); if (!m) return;
    const p = decodeURIComponent(m[1]); if (!uniBy(p)) return;
    S.ficha.uni = p;
    if (!S.rendered.has('ficha')) renderSection('ficha'); else renderFicha();
    const sec = $('#ficha'); if (!sec) return;
    // Fija la posición mientras lo de arriba cambia de alto
    const pin = () => sec.scrollIntoView({ behavior: 'instant', block: 'start' });
    pin();
    const ro = new ResizeObserver(pin); ro.observe($('#main'));
    const stop = () => ro.disconnect();
    setTimeout(stop, 2500);
    ['wheel', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, stop, { once: true, passive: true }));
  }
  ```
  Alternativa más robusta: con un hash `#u=`, que el lazy-render **no** pinte las secciones de arriba de la ficha hasta que el usuario haga scroll hacia arriba. También sirve reservar en cada `.sec-body` un `min-height` aproximado al alto final (`content-visibility:auto; contain-intrinsic-size: 1px 1800px`).
- **Verificación:** con 375 px y `#u=514`, `#ficha.getBoundingClientRect().top` debe quedar entre 0 y 120 a los 3 s.

### P0-2. "Sin proyectos de inversión registrados" en universidades que sí invierten
- **Dónde:** ficha (sección 8), tarjetas "Proyectos de inversión" y "Programas presupuestales" (`.empty`).
- **Problema:** la ficha de UNMSM muestra "% Inversión 10.6 %" y, más abajo, "Sin proyectos de inversión registrados este año". También dice "Sin datos por programa". Un lector entiende que **no hay** proyectos, cuando en realidad **no se cargaron**. Es un dato engañoso: el principio anti-overclaiming aplica también al sentido contrario.
- **Fix (copy):** separar los dos casos:
  - dataset ausente → "Aún no tenemos el detalle de proyectos para esta universidad (fuente pendiente). El gasto en inversión sí aparece en el total: S/ X M."
  - dataset presente pero vacío → "El MEF no registra proyectos con PIM en {año}."
  El `normalize()` debe marcar `u.anios[y].proyectos === undefined` (sin dato) de manera distinta a `[]` (cero).

---

## P1 — importantes

### P1-1. El hero no cuenta nada: se ve el título y luego 8–9 s de skeleton en 4G
- **Evidencia:** captura `m375_light_fold.png`. En el primer pantallazo hay título + lede genérico + metadatos; ningún número. Medido en vivo: **datos visibles a los 8.7 s en Slow 4G** (2.6 s en Fast 4G); DCL 2.1 s. Transferencia: 1,037 KB, de los cuales `observatorio.json` pesa 930 KB gzip.
- **Fix:**
  1. Hallazgo en el hero, **pre-renderizado en HTML** (no depende del JSON) y actualizado por el ETL:
     ```html
     <p class="hero-stat"><strong>S/ 7,734 M</strong> tuvieron las 65 universidades públicas en 2025 (PIM).
       Gastaron el <strong>90.1 %</strong>; 47 céntimos de cada sol fueron a planilla.</p>
     ```
     El JS lo reemplaza si el año cambia. Con esto la primera pantalla comunica sin esperar.
  2. Debajo, el buscador "Mi universidad" (ver P1-9).
  3. Cambiar `h1` largo por algo más corto en móvil: "¿Cuánto tienen y en qué gastan las universidades públicas?" y dejar "Radiografía Presupuestal…" en el kicker/brand.

### P1-2. Peso del JSON: 5 MB (930 KB gzip), con 67 % de ingresos detallados que el front casi no usa
- **Evidencia:** `universidades[].anios[].ingresos` = **3,378 KB** de 5,074 KB. `app.js` y `historias.js` solo leen `ingresos.total` y `ingresos.fuente` (l. 94, 547; historias l. 57). El resto (`ingresos.generica`, etc.) sobra en la primera carga. Además, `fetch(url, {cache:'no-cache'})` obliga a revalidar en cada visita.
- **Fix:**
  - ETL: dividir en `data/core.json` (nacional + por universidad: kpi, generica, fuente, total, programa, categoría + `ingresos.{total,fuente}`) → estimado ≈ 1.7 MB bruto / **≈ 300 KB gzip**, y `data/detalle/{pliego}.json` con el detalle de ingresos, proyectos y transferencias, que se carga al abrir la ficha.
  - Quitar `cache:'no-cache'` y versionar por query: `fetch('data/core.json?v=' + BUILD)` (GitHub Pages ya manda `max-age=600`).
  - Meta objetivo: datos visibles en < 3.5 s en Slow 4G.

### P1-3. Ranking en móvil: solo se leen 2 de 12 columnas y el encabezado desaparece
- **Dónde:** `#rk-table` (sección 2). Captura `rank_view.png`.
- **Problema:** a 375 px se ve `# · Universidad · PIA · PIM` y nada más. La columna más interesante (% Ejec., Índice) está a 4–8 swipes horizontales, sin ninguna pista de que la tabla sigue. El `th { position: sticky; top: 0 }` no funciona dentro de `.table-wrap` con `overflow-x:auto` y además quedaría debajo del topbar, así que al bajar las columnas quedan sin título.
- **Fix:**
  - Móvil (< 560 px): selector de métrica en vez de 12 columnas → tabla de 3 columnas `Universidad | {métrica elegida} | % Ejec.` con un `<select id="rk-metric">` (PIM, Devengado, % Ejec., % Personal, % Inversión, % I+D, S/ por estudiante, Índice). La tabla completa queda para ≥ 560 px y para el CSV.
  - Si se mantiene la tabla ancha: sombra a la derecha como pista de scroll:
    ```css
    .table-wrap { background:
      linear-gradient(to right, var(--surface) 30%, transparent) left/24px 100% no-repeat local,
      linear-gradient(to left, var(--surface) 30%, transparent) right/24px 100% no-repeat local,
      radial-gradient(farthest-side at 100% 50%, rgba(0,0,0,.18), transparent) right/10px 100% no-repeat scroll,
      var(--surface); }
    ```
    y que la columna sticky sea **Universidad** (no `#`); `.table-wrap{max-height:70vh;overflow:auto}` para que el `thead` sticky funcione dentro del wrap.

### P1-4. Un mismo color significa tres cosas distintas
- **Dónde:** `--ochre/--c-dev/--k3` (#b0741a).
- **Problema:** el ocre es **Devengado** (líneas PIA/PIM/Dev), **Bienes y servicios** (composición del gasto) y **RDR** (fuentes) en la misma ficha, una tarjeta debajo de la otra (captura `f_top.png`). Además, el azul tinta es PIM y también "Personal" y también "Recursos ordinarios". En el celular, con leyendas abajo, esto confunde.
- **Fix:** reservar `--c-pia/--c-pim/--c-dev` solo para la serie PIA/PIM/Devengado. Para las categorías, usar una paleta categórica que **no** repita esos tres tonos (p. ej. Personal `#3d5a80`, Pensiones `#98c1d9`, Bienes y servicios `#55753a`, Activos `#8e4a68`, Otros `#b8b0a0`; fuentes RO `#3d5a80`, RDR `#c06c3e`, RD `#55753a`, DyT `#8e4a68`). Mantener el mismo color para la misma categoría en index y en historias.
- Relacionado: en "Trayectoria {uni}" la leyenda está en orden `PIA, Devengado, PIM`; en el resto es `PIA, PIM, Devengado`. Unificar el orden de los datasets.

### P1-5. Contraste insuficiente (WCAG AA) en texto pequeño
| Elemento | Colores | Ratio | Requiere |
|---|---|---|---|
| `.pill.warn` (semáforo 75–90 %) | #b7860b sobre #f8eed2 | **2.82:1** | 4.5:1 |
| `.kicker`, `.sec-n` (12 px, ocre) | #b0741a sobre #f5f3ee | **3.53:1** | 4.5:1 |
| `.nav a .n` (11 px) | #b0741a sobre #faf8f4 | 3.69:1 | 4.5:1 |
| Barra "Otros gastos" `--k4` | #b8b0a0 sobre #fff | 2.15:1 | 3:1 (gráfico) |

- **Fix (claro):** `--warn:#8a6508` (texto de la píldora, 4.6:1 sobre `--warn-bg`); añadir `--ochre-text:#8f5d12` para el texto ocre pequeño (kicker, `.sec-n`, `.n`) y dejar `--ochre` para barras y bordes; `--k4:#9a917f`. Las barras de la ejecución anual pueden seguir con el ocre actual (3.27:1, pasa para elementos gráficos).

### P1-6. Objetivos táctiles por debajo de 44 px
- **Evidencia:** 136 controles < 44 px de alto en index a 375 px. Los más usados: chips de nav 34 px, `select`/`input` 38 px, `#theme-toggle` 38×38, `.seg button` 36 px, encabezados ordenables `button.sort` **19 px** de alto, `a.uni-link` **18 px** (ej. "UNI" de 25×18).
- **Fix:**
  ```css
  @media (pointer: coarse) {
    select, input[type=search], .btn, .icon-btn { min-height: 44px; }
    .icon-btn { width: 44px; height: 44px; }
    .nav a { min-height: 40px; }            /* chips: 40 + 6 de gap ≈ objetivo de 44 */
    .seg button { min-height: 44px; }
    th button.sort { padding: 12px 4px; margin: -12px -4px; }
    .uni-link { display: inline-block; padding: 12px 0; margin: -12px 0; }
    td .uni-link { display: block; }        /* toda la celda tocable */
  }
  ```

### P1-7. Mapa: atrapa el scroll con un dedo y los círculos de Lima se tapan
- **Dónde:** `drawMap()`; captura `m375_light_mapa.png`.
- **Problema:** en el celular el mapa (420 px, más que media pantalla) captura el arrastre con un dedo, y el usuario se queda "atrapado" al hacer scroll. En Lima hay unas 10 universidades superpuestas que no se pueden tocar una por una.
- **Fix:** `L.map('map', { dragging: !L.Browser.mobile, tap: false, scrollWheelZoom: false })` con un aviso "Usa dos dedos para mover el mapa", o un botón "Activar mapa". En Lima: separar los círculos de las sedes con coordenadas casi iguales (desplazamiento en espiral de 0.02°) o poner debajo una lista "Universidades en Lima Metropolitana" con enlace a cada ficha. Añadir `aria-label` al contenedor y un enlace "Ver como tabla" (ranking filtrado por departamento) como alternativa accesible.

### P1-8. Inconsistencias numéricas visibles en la primera pantalla
- Hero: "**71** universidades" · KPI: "Universidades públicas **65**" · Ficha UNMSM: "puesto 12 de **71**". El lector ve dos cifras distintas sin explicación.
- **Fix:** hero → "65 universidades con presupuesto en 2025 (71 en el padrón; 6 sin pliego propio o recién creadas)". En el índice, "puesto X de N" con N = universidades con dato ese año.
- KPI "% a I+D (PP 0137) **s/d**" como sexto KPI del resumen (en vivo dice 0.44 %, en local s/d). Si es s/d, no ocupar un KPI destacado: reemplazar por "% en personal" o mostrar "Sin dato del PP 0137 para 2025".

### P1-9. Falta el buscador "Mi universidad" arriba
- La tarea n.º 1 de un ciudadano o periodista es "¿y mi universidad?". Hoy tiene que llegar a la sección 8 (≈ 9,000 px más abajo en móvil) o adivinar que el nombre en el ranking se puede tocar.
- **Fix:** en el hero, un `<input type="search" list="unis-dl">` con un datalist de siglas y nombres. Al elegir, `location.hash = '#u=' + pliego` (con el P0-1 corregido). Etiqueta: "Busca tu universidad". Agregar también el chip "Ficha" como primer elemento visible del nav móvil.

### P1-10. Selects de universidad en MAYÚSCULAS y truncados
- `#tr-uni`, `#fi-uni`, comparador: "UNMSM — UNIVERSIDAD NACIONAL MA…". En 375 px solo se lee la sigla.
- **Fix:** en las opciones usar `corto + ' — ' + toTitleCase(nombre)` y ordenar por sigla; en móvil, mostrar solo la sigla en la opción seleccionada (el nombre completo sale en el `h3` de la ficha). Una función `titleCase` que respete las minúsculas de "de/del/la/y" y las siglas.

### P1-11. Año parcial 2026 en las barras apiladas sin marca
- "Evolución del conjunto" (gasto) y las barras de fuentes muestran 2026 con la misma opacidad: parece una caída del 25 %. En las líneas sí está punteado.
- **Fix:** en todos los datasets por año, `backgroundColor: ctx => isPartial(labels[ctx.dataIndex]) ? withAlpha(c, .45) : c` + patrón rayado o etiqueta del eje "2026*" con la nota "*parcial al 22-nov".

### P1-12 (historias). Paleta y tema distintos a index; sin conmutador de tema
- **Dónde:** `historias.css` (`@media (prefers-color-scheme: dark)`), `historias.html`.
- **Problema:** index arranca **siempre en claro** (ignora el sistema) y tiene botón; historias sigue el sistema y no tiene botón. Con el celular en modo oscuro, el usuario pasa de una página crema a una azul noche al tocar "Historias" (capturas `m375_fold.png` vs `h375_fold.png`). Los tokens son los mismos, pero el comportamiento no.
- **Fix:** un solo mecanismo en ambas páginas: `localStorage('rp-theme')` → si no existe, `prefers-color-scheme` → `data-theme` en `<html>`, y el mismo botón en el header de historias. En historias, mover los tokens oscuros a `:root[data-theme="dark"]` (y en `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`). El cambio en index: `if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';`.

### P1-13 (historias). Etiquetas de universidad cortadas por la izquierda en las barras
- **Evidencia:** captura `h_1.png`/`h_2.png`: "N. TECNOLÓGICA DE SAN…", ".N. DE ARTE DIEGO QUIS…". La etiqueta se trunca al final pero el eje la recorta al inicio, así que no se lee ni la sigla. Además mezcla siglas ("UNASAM") con nombres completos en mayúsculas.
- **Fix:** usar siempre `u.corto` (sigla) como etiqueta del eje en móvil y el nombre completo en el tooltip:
  ```js
  y: { ticks: { callback(v){ const u = rows[v]; return u.corto || shorten(u.nombre, 14); } } }
  ```
  y para universidades sin sigla, generarla en el ETL (UNTELS, UNAAT…).

### P1-14 (historias). Formato de cifras distinto al de index
- index: "S/ 6,954.6 M"; historias: "S/ 7.0 mil millones" en **IBM Plex Mono**, a 2 líneas por tarjeta. Al redondear, PIA (6,954.6) y devengado (6,967.1) aparecen iguales: "S/ 7.0 mil millones" y "S/ 7.0 mil millones".
- **Fix:** usar el mismo formateador que index (`S/ 6,955 M` o `S/ 6.95 mil M`) con Plex Sans `tabular-nums` (la mono ocupa ~20 % más ancho y parte las cifras en dos líneas a 375 px). Si se quiere mantener "mil millones", usar 2 decimales.

---

## P2 — mejoras

| # | Dónde | Problema | Fix |
|---|---|---|---|
| P2-1 | Gráficos (index) | Tooltips: en táctil hay que acertar al punto; el modo `index` solo está en algunos gráficos. | `interaction: { mode: 'index', intersect: false }` por defecto en `chartTheme()` para líneas y barras verticales; `mode:'nearest', axis:'y'` en las horizontales. |
| P2-2 | Glosario | `abbr[title]` no funciona en el celular (no hay hover). PIA/PIM/devengado/RDR/genérica/PP 0137 aparecen sin explicación en móvil. | Botón `ⓘ` (44 px) que abre un `<details>` en línea o un popover nativo `popover` con la definición; un bloque "Cómo leer este presupuesto en 4 pasos" (PIA → PIM → certificado → devengado) en el hero o al inicio de la sección 3. Nada de modales. |
| P2-3 | Ficha | Mide ~4,500 px a 375: 10 KPIs + 6 gráficos + comparador + tabla. | Sub-tabs dentro de la ficha (Resumen · Gasto · Fuentes · Inversión · Comparar) o `<details open>` por bloque; KPIs en 2 filas con "ver más". |
| P2-4 | Compartir | "Copiar enlace" solo copia. | `navigator.share({ title, text: 'UNMSM 2025: PIM S/ 757 M, ejecutó 94.7 %', url })` cuando exista; si no, copiar. Imagen OG por universidad (generada en el ETL: `assets/og/u-514.png`) para que WhatsApp muestre la tarjeta. |
| P2-5 | Nav móvil | 11 chips en scroll horizontal sin pista de que hay más ("Empezaron y ter…" se corta sin degradado). | Máscara a la derecha: `.nav ol{mask-image:linear-gradient(90deg,#000 85%,transparent)}`; textos cortos en móvil ("Resumen", "Ranking", "PIA→PIM", "Gasto", "Fuentes", "Obras", "I+D", "Ficha", "Mapa", "Método"). |
| P2-6 | Topbar | `#year-global` de 104 px muestra "2025" pero la opción "2026 (parcial, a 22-nov-2026)" se corta. Hay 6 selectores de año repetidos (rk-year, tr-year, c-year, in-year, id-year, mp-year). | Un solo año global; quitar los selectores por sección o convertirlos en un texto "Año: 2025 (cambiar arriba)". Etiqueta corta en la opción: "2026 (parcial)". |
| P2-7 | Accesibilidad | El scrollspy usa `aria-current="true"`; los segmentados usan `aria-pressed` (bien). Falta `aria-live` al filtrar el ranking. | `aria-current="location"`; `<p class="count" aria-live="polite">`. |
| P2-8 | Gráficos | Ejes Y con "S/ 8,000 M" ocupan ~30 % del ancho a 375 px. | En móvil `tickM` compacto: "8 mil M" o "8,000" con la unidad en el subtítulo ("millones de soles"). |
| P2-9 | Gasto | La "Lectura: con más del 70 % en personal tiene poco margen para mantenimiento…" es una interpretación. | Suavizar: "suele dejar menos margen…" y citar que depende del tamaño y del RDR. |
| P2-10 | Historias | `summary` "Qué no dice este dato" mide 32 px de alto; enlaces de fuentes de 16 px; chips del header de 32 px. | `summary{padding:12px 0}`; `.top-nav a{padding:12px 10px}`. Mover "Qué no dice este dato" **antes** de la fuente y abrirlo por defecto en la primera historia. |
| P2-11 | Historias | La nav cruzada es mínima: en historias no hay enlace a la ficha de la universidad resaltada. | Si `#sel-uni` tiene valor, mostrar el botón "Ver ficha completa de {sigla} →" que apunte a `index.html#u={pliego}`; en cada historia, "Explorar en el observatorio →" a la sección equivalente (`#gasto`, `#idi`…). |
| P2-12 | Brand | `historias.html` no tiene `theme-color` para el modo oscuro; el OG de index es relativo (`assets/og/og.png`), y algunos scrapers no lo resuelven. | `<meta name="theme-color" media=…>` doble, como en index; `og:image` absoluto y `og:url`/`canonical` en index. |
| P2-13 | Comparador | El "nacional" no está como opción de comparación. | Agregar "Promedio nacional" y "Mediana de universidades de su tamaño" como Universidad B o C. |
| P2-14 | Rendimiento | Chart.js (≈ 70 KB gzip) bloquea el render diferido junto con el JSON; 16 canvases a la vez. | Ya hay lazy render por sección (bien). Destruir los charts fuera de la pantalla en móvil si la memoria sube; `preload` del JSON core: `<link rel="preload" href="data/core.json" as="fetch" crossorigin>`. |

---

## Top 10 (orden de ejecución sugerido)

1. **P0-1** Deep link `#u=` que no llega a la ficha → `ResizeObserver`/scroll anclado.
2. **P0-2** "Sin proyectos" ≠ "sin dato": distinguir ausencia de cero.
3. **P1-2** Dividir el JSON (core ≈ 300 KB gzip + detalle por pliego) y quitar `cache:'no-cache'` (hoy 8.7 s en Slow 4G).
4. **P1-1** Hallazgo pre-renderizado en el hero.
5. **P1-9** Buscador "Mi universidad" en el hero.
6. **P1-3** Ranking móvil con selector de métrica (3 columnas) + pista de scroll.
7. **P1-4** Paleta: el ocre/azul solo para PIA/PIM/Devengado; categorías con colores propios, iguales en ambas páginas.
8. **P1-5 + P1-6** Contraste AA (píldora warn, kicker ocre) y objetivos táctiles de 44 px.
9. **P1-12/13/14** Historias: mismo tema y botón, siglas en los ejes y mismo formato de cifras.
10. **P1-8 + P1-11** Coherencia 71/65 y marcar el año parcial en todas las barras.

---

## Estado de los fixes

**Historias (`ui-historias`), verificado el 23-nov-2026 a 375 px en claro y oscuro, con el build local:**
- Resueltos: P1-12 (tema según el sistema + `#theme-toggle` de 44×44), P1-13 (siglas en el eje: "UN Tecnológica…" ya no se corta), P1-14 (formato `S/ 6,954.6 M` y Plex Sans; se quitó la carga de Plex Mono), P1-4 en historias (paleta categórica propia), P2-10, P2-11 (las anclas `#variacion`, `#gasto`, `#idi`, `#infra`, `#fuentes`, `#trayectoria` y `#ranking` existen en index) y P2-12 (`og-historias.png` existe). Sin errores JS y sin scroll horizontal (`scrollWidth = 375`).
- Pendientes menores (P2): `a.brand` de 32 px de alto; enlaces de fuentes y "Volver al observatorio" del pie de 16–18 px. Siglas faltantes → ETL.

**Index (`frontend`):** pendiente de verificar.
