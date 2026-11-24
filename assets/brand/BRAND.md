# Identidad visual — Radiografía Presupuestal (v2, nov-2026)

**Público:** estudiantes universitarios peruanos (18-25) que llegan desde el celular por un link de WhatsApp, X o TikTok.
**Concepto:** *afiche de feria con datos*. La energía de los afiches chicha de Lima y de las guardas de los textiles andinos
(bloques de color plano, letras gruesas y apretadas, franjas que se repiten), aplicada con disciplina de periodismo de datos:
fondo de papel, una cifra gigante por capítulo y gráficos sin adornos. Serio en los datos, cercano en el tono.

Fuente de verdad de los tokens: este archivo. `historias.css` ya los usa; `styles.css` (index) y las OG deben adoptarlos.

---

## 1. Paleta base

| Token | Nombre | Claro | Oscuro | Uso |
|---|---|---|---|---|
| `--color-papel` | Papel | `#F4EEE2` | `#16101D` | Fondo de página |
| `--color-papel-2` | Papel hondo | `#EAE1CF` | `#221A2B` | Fondos de gráficos, campos, chips |
| `--color-tinta` | Tinta (negro morado) | `#1E1428` | `#F2EBDF` | Texto principal, trazos fuertes |
| `--color-tinta-2` | Tinta suave | `#5E5468` | `#B3A8BD` | Texto secundario, ejes (6.2:1 / 8.2:1) |
| `--color-linea` | Línea | `#D6CAB5` | `#3A2F45` | Rejillas y bordes finos |

### Colores de marca (portadas de capítulo, "a sangre")
Cada capítulo abre con un bloque de color plano a todo el ancho. El texto encima va en `--color-sobre-*`.

| Token | Nombre e inspiración | Hex | Texto encima | Contraste |
|---|---|---|---|---|
| `--color-anil` | Añil (tinte de textiles) | `#2B3FA8` | papel `#F4EEE2` | 7.6:1 |
| `--color-maiz` | Maíz morado | `#4A1F6B` | papel | 10.7:1 |
| `--color-rocoto` | Rocoto | `#C2410C` | blanco `#FFFFFF` | 5.2:1 |
| `--color-titicaca` | Titicaca (azul petróleo) | `#17637D` | papel | 5.8:1 |
| `--color-selva` | Selva | `#0B6B4E` | papel | 5.6:1 |
| `--color-chicha` | Rosado chicha | `#C81E64` | blanco | 5.5:1 |
| `--color-aji` | Ají amarillo | `#F2B705` | tinta `#1E1428` | 9.7:1 |
| `--color-cobre` | Cobre | `#8A3B12` | papel | 6.7:1 |
| `--color-cochinilla` | Cochinilla (rojo de la bandera) | `#C4122F` | blanco | 6.0:1 |

Regla: un capítulo = un color; nunca dos portadas seguidas del mismo color. El ají amarillo es también el **resaltador**
(ver "Tu universidad").

## 2. Colores de datos (fijos en todo el sitio)

### Etapas del presupuesto
| Serie | Token | Claro | Oscuro | Analogía para estudiantes |
|---|---|---|---|---|
| PIA | `--color-pia` | `#8A7756` adobe | `#B5A68C` | La plata con la que arrancas el ciclo |
| PIM | `--color-pim` | `#2B3FA8` añil | `#7C8EF0` | La que terminas teniendo (te cayó plata extra) |
| Devengado | `--color-dev` | `#C81E64` chicha | `#FF5C9A` | Lo que de verdad gastaste |

### Tu universidad (resaltado)
`--color-tu` `#F2B705` (ají) con borde `--color-tu-borde` = tinta (`#1E1428` / en oscuro `#16101D` sobre `#F7C843`).
En gráficos: punto o barra ají con contorno de tinta de 2 px y etiqueta sobre fondo ají (efecto resaltador).
En texto: `<mark>` con fondo ají y texto tinta. Ningún otro dato usa ají relleno con contorno tinta.

### Genéricas de gasto
| Categoría | Token | Claro | Oscuro |
|---|---|---|---|
| Personal (2.1, planilla) | `--color-personal` | `#4A1F6B` maíz | `#A57BD6` |
| Pensiones (2.2) | `--color-pensiones` | `#9B7BC0` lila | `#D2BDF0` |
| Bienes y servicios (2.3, incluye CAS) | `--color-bys` | `#D9651A` naranja rocoto | `#F59A45` |
| Inversión / activos no financieros (2.6) | `--color-inversion` | `#0B6B4E` selva | `#3FBF8C` |
| Otros (2.4, 2.5, resto) | `--color-otros` | `#B0A38B` arena | `#6F6579` |

### Fuentes de financiamiento
| Fuente | Token | Claro | Oscuro |
|---|---|---|---|
| RO, recursos ordinarios (del Tesoro) | `--color-ro` | `#17637D` titicaca | `#4FB3D1` |
| RDR, recursos directamente recaudados (lo que cobra la universidad) | `--color-rdr` | `#C2410C` rocoto | `#FF7A3D` |
| RD, recursos determinados (canon, sobrecanon, regalías) | `--color-canon` | `#A27A00` oro | `#E0B341` |
| DyT, donaciones y transferencias | `--color-dyt` | `#8C7FA0` | `#A89BBB` |

Contraste: todas las marcas de datos ≥ 3:1 contra su fondo salvo "otros" (arena), que siempre lleva etiqueta directa.
Los textos pequeños nunca van en estos colores: van en `--color-tinta` o `--color-tinta-2`.

## 3. Tipografía

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

| Rol | Familia | Ajustes | Token |
|---|---|---|---|
| Cifras héroe y titulares | **Archivo** (variable) | `font-stretch: 62%` (extra condensada), peso 800–900, `line-height: .86`, `letter-spacing: -.01em` | `--font-display` |
| Cifras en gráficos, ejes, etiquetas | **Archivo** | `font-stretch: 85–100%`, peso 500–700, `font-variant-numeric: tabular-nums` | `--font-cifras` |
| Texto de lectura y UI | **Atkinson Hyperlegible Next** | 400/700, 17–19 px, `line-height: 1.55`, máx. 62 caracteres | `--font-texto` |

```css
--font-display: "Archivo", "Arial Narrow", system-ui, sans-serif;
--font-cifras:  "Archivo", system-ui, sans-serif;
--font-texto:   "Cifras Texto", "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif;
```
**Cero sin barra:** Atkinson Hyperlegible Next dibuja el 0 con barra ("2Ø25") y no trae variante sin ella (probado: `zero`, `ss01–05`, `salt`, `cv01–02`). Por eso los dígitos del texto vienen de Archivo con un `@font-face` "Cifras Texto" limitado a `unicode-range: U+0030-0039` (ver cabecera de `historias.css`).

**Por qué.** Archivo extra condensada a peso 900 da letras de afiche: altas, apretadas, de pintor de carteles, y permite que
una cifra como `S/ 6,967` ocupe casi todo el ancho de un celular sin romperse. Al ser variable, la misma familia baja a ancho
normal para ejes y etiquetas, con cifras tabulares, así que todo el sitio habla con una sola voz numérica. Atkinson Hyperlegible
Next fue diseñada para máxima legibilidad (distingue 1/l/I y 0/O) y rinde muy bien en pantallas chicas con poca luz, que es
donde se lee este sitio. Reemplaza a Bricolage Grotesque + Plus Jakarta Sans, que se veían correctas pero intercambiables.

Escala (móvil → escritorio, `clamp`):
- Cifra héroe: 92 → 220 px, Archivo 62 % / 900
- Cifra de capítulo: 84 → 180 px, Archivo 62 % / 900
- Titular de capítulo (h2): 30 → 56 px, Archivo 75 % / 800, `line-height: .98`
- Entradilla: 19 → 22 px, Atkinson 400
- Texto: 17 → 18 px, Atkinson 400
- Etiquetas de gráfico: 13 → 14 px, Archivo 92 % / 600, tabular
Formato de cifras igual al index: `S/ 6,954.6 M`, porcentajes `49%`.

## 4. Formas y recursos
- **Guarda**: franja de rombos escalonados (motivo de pallay) en `currentColor`, 12 px de alto, como borde superior de cada
  portada. En el hero, la guarda es el **índice**: una franja por capítulo, en su color y enlazada.
- Bordes 2 px en tinta; sombras duras desplazadas (`6px 6px 0 var(--color-aji)`) solo en el buscador y botones principales.
  Radios: 0 en bloques, 999 px en chips, 4 px en campos. Sin degradados.
- Gráficos en SVG propio: waffle (de cada sol), escalones (PIA→PIM→devengado), enjambre/beeswarm (comparar ~65
  universidades), skyline ordenado, histograma, barras con etiqueta directa, línea con anotaciones.
- Movimiento: un solo gesto por gráfico al entrar en pantalla (barras que crecen, puntos que caen); nada con
  `prefers-reduced-motion: reduce`.

## 5. Tema
**Claro siempre por defecto** (no se sigue `prefers-color-scheme`). Oscuro solo si el usuario lo elige: botón `#theme-toggle`
(guarda `localStorage["rp-theme"]="dark"`) o `?tema=oscuro`. Script en `<head>`: `rp-theme` → `?tema=` → `light`, y fija
`data-theme` en `<html>`. Los tokens oscuros viven solo en `:root[data-theme="dark"]`.
Las portadas de capítulo mantienen su color en ambos temas.

## 5b. Formato de cifras (adaptativo)
- ≥ 1,000 M → `S/ 7.7 mil M` · ≥ 1 M → `S/ 53.4 M` · ≥ 100 mil → `S/ 850 mil` · ≥ 1 mil → `S/ 19.7 mil` · menos → `S/ 40`
- Espacios no separables entre `S/`, número y unidad (no se parte en dos líneas).
- Porcentajes: ≥ 100 % sin decimales; variaciones ≥ 1000 % como `×11.5 veces`; signo menos tipográfico `−`.
- Cifra héroe: número + unidad aparte (`S/ 7.0` + `mil millones`).
- Cuando hay que comparar montos cercanos (PIA vs devengado) se usa el formato fino `S/ 6,954.6 M` (`solesF()` en historias.js).

## 5c. Equivalencias para `styles.css` (index)
| Token actual de index | Token v2 | Claro | Oscuro |
|---|---|---|---|
| `--bg` | `--color-papel` | `#F4EEE2` | `#16101D` |
| `--surface` | `--color-papel` (tarjetas sin relleno; separar con borde) | `#F4EEE2` | `#16101D` |
| `--surface-2` | `--color-papel-2` | `#EAE1CF` | `#221A2B` |
| `--ink` | `--color-tinta` | `#1E1428` | `#F2EBDF` |
| `--muted` | `--color-tinta-2` | `#5E5468` | `#B3A8BD` |
| `--line` | `--color-linea` | `#D6CAB5` | `#3A2F45` |
| `--line-strong` | `--color-tinta` | `#1E1428` | `#F2EBDF` |
| `--accent` | `--color-anil` (enlaces/UI) | `#2B3FA8` | `#7C8EF0` |
| `--accent-soft` | — | `#DCE0F4` | `#262A4A` |
| `--ochre` | `--color-aji` (resaltado, barras) | `#F2B705` | `#F7C843` |
| `--ochre-text` | `--color-cobre` (texto pequeño) | `#8A3B12` | `#F7C843` |
| `--c-pia` / `--c-pim` / `--c-dev` | `--color-pia` / `--color-pim` / `--color-dev` | `#8A7756` / `#2B3FA8` / `#C81E64` | `#B5A68C` / `#7C8EF0` / `#FF5C9A` |
| `--good` / `--warn` / `--bad` | (semáforo) | `#0B6B4E` / `#A27A00` / `#C4122F` | `#3FBF8C` / `#E0B341` / `#FF6B7A` |
| `--good-bg` / `--warn-bg` / `--bad-bg` | | `#D7EBDF` / `#F6E9C2` / `#F6D6DA` | `#163326` / `#3A2F12` / `#3E1820` |
| `--g1` 2.1 | `--color-personal` | `#4A1F6B` | `#A57BD6` |
| `--g2` 2.2 | `--color-pensiones` | `#9B7BC0` | `#D2BDF0` |
| `--g3` 2.3 | `--color-bys` | `#D9651A` | `#F59A45` |
| `--g4` 2.5 | `--color-otros` | `#B0A38B` | `#6F6579` |
| `--g5` 2.6 | `--color-inversion` | `#0B6B4E` | `#3FBF8C` |
| `--g6` 2.4 | `--color-dyt-gasto` | `#6E5B46` | `#B79E82` |
| `--g7` 2.8 | `--color-deuda` | `#17637D` | `#4FB3D1` |
| `--f1` RO | `--color-ro` | `#17637D` | `#4FB3D1` |
| `--f2` RDR | `--color-rdr` | `#C2410C` | `#FF7A3D` |
| `--f3` RD (canon) | `--color-canon` | `#A27A00` | `#E0B341` |
| `--f4` DyT | `--color-dyt` | `#8C7FA0` | `#A89BBB` |
| `--f5` ROOC | `--color-rooc` | `#5E5468` | `#B3A8BD` |
| `--serif` (títulos) | `--font-display` | Archivo 62–75 %, 800–900 | |
| `--font` (texto) | `--font-texto` | Atkinson Hyperlegible Next | |
Historias agrupa 2.4, 2.5 y 2.8 en "Otros"; index puede separarlos con `--g4`, `--g6`, `--g7`.

## 6. Logo y OG
Archivos sin cambios: `logo.svg`, `logo-dark.svg`, `logo-mark.svg`, favicons, `assets/og/*.png` (generadas por
`etl/og_generar.py`; regenerar con la paleta y fuentes de esta versión: fondo `#4A1F6B` o `#F4EEE2`, cifra en Archivo
62 %/900 color ají `#F2B705` o chicha `#C81E64`, textos en Atkinson). TTF: `~/Library/Fonts/Archivo[wdth,wght].ttf` y
`AtkinsonHyperlegibleNext[wght].ttf` (github.com/google/fonts `ofl/archivo`, `ofl/atkinsonhyperlegiblenext`).

## 7. Tono
Pícaro y cercano, nunca acusador. Describir datos: "no se gastó", "quedó sin devengar", "baja ejecución". Prohibido
"despilfarro", "malgasto", "corrupción", "robo". Cada cifra con fuente y año. Cada gráfico con su "Qué no dice este dato".
Explicar la jerga con analogías de estudiante (propina del ciclo, cachuelo, CEPRE).
