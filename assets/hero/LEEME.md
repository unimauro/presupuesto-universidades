# Hero v3: presupuesto 2027 como protagonista + arte peruano

**Orden de lectura:** primero, si el presupuesto TOTAL de las universidades sube o baja en 2027 (bloque `#hero-2027`,
que ya llena `renderHero2027()` en app.js). Después, el título del sitio (más chico), el buscador, la explicación,
el hallazgo 2025 y los metadatos. A la derecha (escritorio) o al pie (móvil) va el arte.

**Arte** (SVG propio, paleta v2 de `assets/brand/BRAND.md`): sol Inti escalonado con rayos de afiche chicha,
cordillera titicaca con nevados, cerros maíz con andenes y, al centro, el **frontón de una universidad** (tímpano
chicha con chakana, friso de pallay). Sus **16 columnas son el PIA de las universidades de 2012 a 2027**. La de 2027
va en ají con borde punteado de tinta, porque aún no es ley, y crece al final de la animación. Al pie van los años
2012 y 2027. Una guarda de rombos de pallay cierra el hero.

**Sello "Dictamen · pendiente de publicación"** (`#h27-sello`): una etiqueta ají girada sobre la esquina inferior
derecha del bloque 2027, junto al botón. Es el espacio reservado para el estado del trámite y se ve en todos los tamaños.

| Archivo | Qué es | Peso |
|---|---|---|
| `hero.svg` | Arte de escritorio (600 × 1264, se recorta desde abajo con `object-fit: cover`) | 13.6 KB |
| `hero-movil.svg` | Banda horizontal para móvil (375 × 150) | 11.6 KB |
| `guarda.svg` | Tesela de la guarda (9 colores de capítulo), se repite en x | 4.5 KB |
| `hero.css` | Reglas del hero v3, todas bajo `.hero-v3`; se carga después de `styles.css` | |
| `PREVIEW.html` | Vista previa con el topbar real (`/assets/hero/PREVIEW.html`, `?tema=oscuro`) | |
| `generar_hero.py` | Regenera los SVG desde `data/resumen.json` (PIA 2012-2026 + `expectativa_2027.total_universidades.pia_2027`) | |

**Accesibilidad:** el arte es `aria-hidden` con `alt=""`. Texto papel sobre añil 7.6:1, papel sobre tinta >15:1,
tinta sobre ají 9.7:1. La única animación (columnas que crecen dentro del SVG) solo corre con
`prefers-reduced-motion: no-preference`. El hero conserva el añil en ambos temas, así que el arte es el mismo en claro y oscuro.

## Integración (3 pasos)

### 1. `index.html`, en `<head>`, justo después de `<link rel="stylesheet" href="styles.css">`

```html
<link rel="stylesheet" href="assets/hero/hero.css">
```

### 2. `index.html`: reemplazar TODA la `<section class="hero" aria-labelledby="h-title"> … </section>` por:

```html
  <section class="hero hero-v3" aria-labelledby="h-title">
    <div class="hero-txt">
      <div class="h27 up" id="hero-2027" aria-labelledby="h27-k">
        <p class="h27-sello" id="h27-sello">Dictamen · pendiente de publicación</p>
        <p class="h27-k" id="h27-k">Presupuesto 2027 · universidades públicas</p>
        <div class="h27-row">
          <span class="h27-arrow" aria-hidden="true">▲</span>
          <div>
            <p class="h27-total" id="h27-total">S/ 7,552 M</p>
            <p class="h27-delta" id="h27-delta">+S/ 852 M (+12.7 %) frente al PIA 2026</p>
          </div>
        </div>
        <p class="h27-count" id="h27-count">47 universidades suben (+4 nuevas) · 16 bajan</p>
        <p class="h27-fine" id="h27-fine">Con las mismas universidades: +12.3 %. Supera incluso el PIM 2026 (S/ 7.4 mil M). Fuente: dictamen del Presupuesto 2027 (5-nov-2026; aprobado por el Pleno el 20-nov-2026, pendiente de publicación).</p>
        <a class="btn h27-btn" href="#expectativa">Ver el detalle 2027</a>
      </div>
      <p class="kicker">Observatorio cívico · Datos del MEF (SIAF)</p>
      <h1 id="h-title">Radiografía Presupuestal de las Universidades Públicas del Perú</h1>
      <form class="hero-search" id="hero-search" role="search" autocomplete="off">
        <div class="hs-row">
          <div id="hs-picker" class="up-host grow"></div>
          <button type="submit" class="btn">Ver ficha</button>
        </div>
        <p id="hs-msg" class="note" aria-live="polite"></p>
      </form>
      <p class="lede">Cuánto se les asignó al inicio del año (<abbr title="Presupuesto Institucional de Apertura">PIA</abbr>), cuánto terminaron teniendo (<abbr title="Presupuesto Institucional Modificado">PIM</abbr>), cuánto gastaron realmente (<abbr title="Gasto reconocido como obligación de pago">devengado</abbr>), en qué y con qué dinero.</p>
      <p class="hero-finding" id="hero-finding">En 2025, las 65 universidades públicas con presupuesto propio tuvieron <strong>S/ 7.7 mil M</strong> (PIM); gastaron el <strong>90.1 %</strong>, y <strong>47 céntimos</strong> de cada sol gastado fueron a planilla de personal.</p>
      <p class="hero-meta" id="hero-meta"></p>
    </div>
    <div class="hero-arte" aria-hidden="true">
      <picture>
        <source media="(min-width: 1024px)" srcset="assets/hero/hero.svg" width="600" height="664">
        <img src="assets/hero/hero-movil.svg" alt="" width="375" height="150" decoding="async" fetchpriority="high">
      </picture>
    </div>
  </section>
```

Cambios respecto del hero actual: la sección lleva la clase `hero-v3`; el texto va envuelto en `.hero-txt`;
se agrega `<p class="h27-sello" id="h27-sello">` dentro de `#hero-2027`; el buscador sube justo debajo del título
(para que en 375 px entre en la primera pantalla); al final se agrega `.hero-arte` (decorativo).
Se conservan todos los ids que usa app.js (`hero-2027`, `h27-*`, `h-title`, `hero-finding`, `hero-search`,
`hs-picker`, `hs-msg`, `hero-meta`).

### 3. `app.js`, en `renderHero2027()`, después de `box.className = 'h27 ' + upDown;`

```js
    // Sello del estado del trámite (hero v3)
    const sello = $('#h27-sello', box), ver = st.x.version;
    if (sello) sello.textContent = ver === 'ley' ? '' : `${(EXP_VERSION[ver] || [ver || 'Proyecto'])[0]} · pendiente de publicación`;
```

Con la ley publicada el sello queda vacío y se oculta solo (`:empty`). Nota: `renderHero2027()` reescribe
`className`, así que `hero.css` estiliza `.hero-v3 .h27` y no depende de clases extra en ese nodo.

`styles.css` no necesita cambios. Si se prefiere un solo CSS, pegar `hero.css` al final de `styles.css` y cambiar
`url("guarda.svg")` por `url("assets/hero/guarda.svg")`.

## Mantenimiento
- Las columnas son datos. Cada vez que cambie `data/resumen.json` (nuevo PIA, ley 2027 publicada), correr
  `python3 assets/hero/generar_hero.py`.
- Escritorio (1024 px o más): texto a la izquierda; panel de arte a la derecha (`--arte-w: clamp(340px, 36vw, 640px)`),
  a sangre arriba y a la derecha, apoyado en la guarda. Si el panel queda muy alto, el SVG se ajusta por alto y
  recorta los cerros de los lados; el templo siempre queda entero.
- Móvil: el arte es una banda de 375 × 150 al pie del hero; no empuja el buscador.

## Capturas de verificación
Tomadas en 1024, 1280 claro y oscuro, y 375 claro y oscuro (iframe), con `--force-prefers-reduced-motion`
(ver el reporte de la sesión).
