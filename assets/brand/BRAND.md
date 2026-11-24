# Identidad visual — Radiografía Presupuestal

Concepto: fachada universitaria (frontón) cuyas columnas son barras de presupuesto, vista "en rayos X"
(trazo luminoso sobre fondo tinta + línea de escaneo punteada). Sobrio, cívico, sin dramatismo.

## Archivos
| Uso | Ruta |
|---|---|
| Logo horizontal 400×64 (fondo claro) | `assets/brand/logo.svg` |
| Logo horizontal (fondo oscuro) | `assets/brand/logo-dark.svg` |
| Símbolo | `assets/brand/logo-mark.svg` |
| Favicon | `assets/brand/favicon.svg`, `favicon-32.png`, `favicon-180.png` (apple-touch), `favicon-512.png` |
| OG 1200×630 | `assets/og/og.png` (index), `og-historias.png` (historias), `og-2027.png`; variantes en `assets/og/variantes/`. **Generados** por `python3 etl/og_generar.py` con cifras reales de `data/observatorio.json` — no editar a mano; regenerar tras `etl/build.py`. |

```html
<link rel="icon" href="assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/brand/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="assets/brand/favicon-180.png">
<meta property="og:image" content="https://unimauro.github.io/presupuesto-universidades/assets/og/og.png">
<meta name="twitter:card" content="summary_large_image">
```

## Paleta (unificada con `styles.css` de la página principal: azul tinta + ocre)
Fuente de verdad: `styles.css` (`:root` y `:root[data-theme="dark"]`). Si cambia allí, actualizar aquí y en `historias.css`.

| Rol | Token en styles.css | Claro | Oscuro |
|---|---|---|---|
| Fondo de página | `--bg` | `#F5F3EE` | `#12151B` |
| Superficie / tarjeta | `--surface` | `#FFFFFF` | `#1A1F28` |
| Texto | `--ink` | `#1B2230` | `#E9E6DF` |
| Texto secundario | `--muted` | `#5A6373` | `#9BA3B1` |
| Bordes | `--line` | `#E3DED4` | `#2B323E` |
| Acento (azul tinta) | `--accent` | `#26346F` | `#9AA6F0` |
| Ocre | `--ochre` | `#B0741A` | `#E0A447` |
| Bien / alerta / mal | `--good` `--warn` `--bad` | `#2C7A4B` `#B7860B` `#B23A3A` | `#5CBF83` `#E2B440` `#EC7570` |

Series fijas (iguales en app.js e historias.js): **PIA** `--c-pia` `#8B94A6` / `#6F7889` · **PIM** `--c-pim` `#26346F` / `#8F9CF0` · **Devengado** `--c-dev` `#B0741A` / `#E0A447`.
Categóricas `--k1…--k7` (claro): `#26346F` `#8791C9` `#B0741A` `#B8B0A0` `#55753A` `#8E4A68` `#6E5B46`.
Genéricas: 2.1→k1, 2.2→k2, 2.3→k3, 2.5→k4, 2.6→k5. Fuentes: RO→k1, RDR→k3.
Resaltado de una universidad en historias: `#8E4A68` (claro) / `#D48AAB` (oscuro).

Colores del logo/OG: fondo del símbolo `#26346F`, trazos `#E6E8F3`, barra ocre `#E0A447`, línea de escaneo blanca.
OG: fondo `#1B2230`, rejilla `#2B323E`, edificio `#C6CCF5`/`#8F9CF0`, ocre `#E0A447`.
(Se descartó el teal `#0E7C86` de la versión inicial para no confundirse con otro observatorio.)

Tema: atributo `data-theme="light|dark"` en `<html>`, persistido en `localStorage["rp-theme"]`, forzable con `?tema=oscuro|claro`. Por defecto claro.

## Tipografías (Google Fonts)
- Títulos: **Source Serif 4** (600/700)
- Texto/UI: **IBM Plex Sans** (400/500/600)
- Cifras/tablas: **IBM Plex Mono** (400/500) con `font-variant-numeric: tabular-nums`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet">
```

## Tokens CSS
Usar directamente los de `styles.css`. `historias.css` replica los mismos valores con nombres propios (`--paper`=`--bg`, `--card`=`--surface`, `--ink-2`=`--muted`, `--amber`=`--ochre`).

## Tono
Describir datos, no acusar. Evitar "despilfarro", "malgasto", "corrupción". Preferir "no se ejecutó",
"quedó sin devengar", "baja ejecución". Siempre fuente (MEF – Consulta Amigable / SIAF) y año.
