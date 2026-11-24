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
--font-texto:   "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif;
```

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
`data-theme="light|dark"` en `<html>`: `localStorage["rp-theme"]` → `?tema=oscuro|claro` → `prefers-color-scheme`.
Las portadas de capítulo mantienen su color en ambos temas (el contraste del texto encima no cambia).

## 6. Logo y OG
Archivos sin cambios: `logo.svg`, `logo-dark.svg`, `logo-mark.svg`, favicons, `assets/og/*.png` (generadas por
`etl/og_generar.py`; regenerar con la paleta y fuentes de esta versión: fondo `#4A1F6B` o `#F4EEE2`, cifra en Archivo
62 %/900 color ají `#F2B705` o chicha `#C81E64`, textos en Atkinson). TTF: `~/Library/Fonts/Archivo[wdth,wght].ttf` y
`AtkinsonHyperlegibleNext[wght].ttf` (github.com/google/fonts `ofl/archivo`, `ofl/atkinsonhyperlegiblenext`).

## 7. Tono
Pícaro y cercano, nunca acusador. Describir datos: "no se gastó", "quedó sin devengar", "baja ejecución". Prohibido
"despilfarro", "malgasto", "corrupción", "robo". Cada cifra con fuente y año. Cada gráfico con su "Qué no dice este dato".
Explicar la jerga con analogías de estudiante (propina del ciclo, cachuelo, CEPRE).
