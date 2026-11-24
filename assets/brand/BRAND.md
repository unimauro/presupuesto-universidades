# Identidad visual — Radiografía Presupuestal

Concepto: fachada universitaria (frontón) cuyas columnas son barras de presupuesto, vista "en rayos X"
(trazo luminoso sobre fondo tinta + línea de escaneo punteada). Sobrio, cívico, sin dramatismo.

## Archivos
| Uso | Ruta |
|---|---|
| Logo horizontal (fondo claro) | `assets/brand/logo.svg` |
| Logo horizontal (fondo oscuro) | `assets/brand/logo-dark.svg` |
| Símbolo | `assets/brand/logo-mark.svg` |
| Favicon | `assets/brand/favicon.svg`, `favicon-32.png`, `favicon-180.png` (apple-touch), `favicon-512.png` |
| OG 1200×630 | `assets/og/og.png` (fuente `og.svg`) |

```html
<link rel="icon" href="assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/brand/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="assets/brand/favicon-180.png">
<meta property="og:image" content="assets/og/og.png">  <!-- usar URL absoluta al desplegar -->
<meta name="twitter:card" content="summary_large_image">
```

## Paleta
| Token | Hex | Uso |
|---|---|---|
| `--ink` | `#0F2233` | texto principal, fondos oscuros, header |
| `--ink-2` | `#4A5A68` | texto secundario |
| `--paper` | `#F7F6F2` | fondo de página |
| `--card` | `#FFFFFF` | tarjetas |
| `--line` | `#DDE3E8` | bordes, rejilla |
| `--xray` | `#7FD6D0` | acento sobre fondo oscuro (logo) |
| `--accent` | `#0E7C86` | acento sobre fondo claro (links, serie principal) — contraste AA en blanco |
| `--amber` | `#C77D12` | segunda serie / resaltado (logo: `#E3A33B`) |
| `--warn` | `#B4462E` | alertas / avisos de datos (no para "culpables") |
| `--ok` | `#2F7D4F` | ejecución alta |

Series de gráficos (orden): `#0E7C86`, `#C77D12`, `#5B6EAE`, `#8A9AA6`, `#2F7D4F`, `#B4462E`.
PIA = gris `#8A9AA6`, PIM = `#0E7C86`, Devengado = `#C77D12`.

Modo oscuro: `--paper #0B1824`, `--card #12263A`, `--ink #EAF0F4`, `--ink-2 #A9BAC6`, `--line #24405A`, `--accent #7FD6D0`, `--amber #E3A33B`.

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
```css
:root{
  --ink:#0F2233; --ink-2:#4A5A68; --paper:#F7F6F2; --card:#FFFFFF; --line:#DDE3E8;
  --xray:#7FD6D0; --accent:#0E7C86; --amber:#C77D12; --warn:#B4462E; --ok:#2F7D4F;
  --c-pia:#8A9AA6; --c-pim:#0E7C86; --c-dev:#C77D12;
  --font-head:"Source Serif 4",Georgia,serif;
  --font-body:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-num:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  --radius:10px; --shadow:0 1px 2px rgba(15,34,51,.06),0 4px 16px rgba(15,34,51,.06);
}
@media (prefers-color-scheme:dark){:root{
  --ink:#EAF0F4; --ink-2:#A9BAC6; --paper:#0B1824; --card:#12263A; --line:#24405A;
  --accent:#7FD6D0; --amber:#E3A33B; --c-pim:#7FD6D0; --c-dev:#E3A33B;
}}
```

## Tono
Describir datos, no acusar. Evitar "despilfarro", "malgasto", "corrupción". Preferir "no se ejecutó",
"quedó sin devengar", "baja ejecución". Siempre fuente (MEF – Consulta Amigable / SIAF) y año.
