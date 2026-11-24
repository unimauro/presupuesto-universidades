# Hero v3: arte peruano para index.html

Arte propio en SVG (sin imágenes de terceros), paleta v2 de `assets/brand/BRAND.md`:
sol Inti escalonado con rayos de afiche chicha, cordillera titicaca con nevados, cerros maíz con andenes,
y al centro el **frontón de la universidad** (tímpano chicha con chakana, friso de pallay) cuyas
**14 columnas son el PIM nacional 2012-2025** (la de 2025 en ají). La guarda de rombos de pallay cierra el hero.
En escritorio, tres cifras cuelgan de un cordel de feria; en móvil el arte es una banda al pie del hero.

| Archivo | Qué es | Peso |
|---|---|---|
| `hero.svg` | Arte de escritorio (600 × 1020, se recorta desde abajo con `object-fit: cover`) | 12.5 KB |
| `hero-movil.svg` | Banda horizontal para móvil (375 × 150) | 10.9 KB |
| `guarda.svg` | Tesela de la guarda (9 colores de capítulo, rombos escalonados), se repite en x | 4.5 KB |
| `hero.css` | Reglas del hero v3 (todo bajo `.hero-v3`, se carga después de `styles.css`) | 5.6 KB |
| `PREVIEW.html` | Vista previa con el topbar real (`/assets/hero/PREVIEW.html`, `?tema=oscuro`) | |
| `generar_hero.py` | Regenera los 3 SVG desde `data/resumen.json` (solo librería estándar) | |

Accesibilidad: el arte y las etiquetas van en un contenedor `aria-hidden="true"`; la frase `#hero-finding`
sigue en el DOM (en escritorio queda solo para lectores de pantalla, porque las etiquetas dicen lo mismo).
Texto papel sobre añil 7.6:1; etiquetas tinta sobre papel/ají ≥ 9.7:1. Animaciones (columnas que crecen dentro
del SVG, etiquetas que se balancean al cargar) solo con `prefers-reduced-motion: no-preference`.
El hero mantiene el añil en ambos temas (regla de portadas), así que el arte es el mismo en claro y oscuro.

## Integración (3 pasos)

### 1. `index.html`, en `<head>`, justo después de `<link rel="stylesheet" href="styles.css">`

```html
<link rel="stylesheet" href="assets/hero/hero.css">
```

### 2. `index.html`: reemplazar TODA la `<section class="hero" aria-labelledby="h-title"> … </section>` por:

```html
  <section class="hero hero-v3" aria-labelledby="h-title">
    <div class="hero-txt">
      <p class="kicker">Observatorio cívico · Datos del MEF (SIAF)</p>
      <h1 id="h-title">Radiografía Presupuestal de las Universidades Públicas del Perú</h1>
      <p class="lede">Cuánto se les asignó al inicio del año (<abbr title="Presupuesto Institucional de Apertura">PIA</abbr>), cuánto terminaron teniendo (<abbr title="Presupuesto Institucional Modificado">PIM</abbr>), cuánto gastaron realmente (<abbr title="Gasto reconocido como obligación de pago">devengado</abbr>), en qué y con qué dinero.</p>
      <p class="hero-finding" id="hero-finding">En 2025, las 65 universidades públicas con presupuesto propio tuvieron <strong>S/ 7.7 mil M</strong> (PIM); gastaron el <strong>90.1 %</strong>, y <strong>47 céntimos</strong> de cada sol gastado fueron a planilla de personal.</p>
      <form class="hero-search" id="hero-search" role="search" autocomplete="off">
        <label for="hs-input">Busca tu universidad</label>
        <div class="hs-row">
          <input id="hs-input" type="search" list="hs-list" placeholder="Sigla o nombre, p. ej. UNSAAC" aria-describedby="hs-msg">
          <button type="submit" class="btn">Ver ficha</button>
        </div>
        <datalist id="hs-list"></datalist>
        <p id="hs-msg" class="note" aria-live="polite"></p>
      </form>
      <p class="hero-meta" id="hero-meta"></p>
    </div>
    <div class="hero-arte" aria-hidden="true">
      <picture>
        <source media="(min-width: 1024px)" srcset="assets/hero/hero.svg" width="600" height="640">
        <img src="assets/hero/hero-movil.svg" alt="" width="375" height="150" decoding="async" fetchpriority="high">
      </picture>
      <p class="hc hc-pim"><b id="hc-pim">S/ 7.7 mil M</b><span>presupuesto <span id="hc-anio">2025</span> (PIM)</span></p>
      <p class="hc hc-ej"><b id="hc-ej">90.1 %</b><span>se llegó a gastar</span></p>
      <p class="hc hc-per"><b id="hc-per">47 céntimos</b><span>de cada sol gastado, a planilla</span></p>
    </div>
  </section>
```

Se conservan todos los ids que usa `app.js` (`h-title`, `hero-finding`, `hero-search`, `hs-input`, `hs-list`,
`hs-msg`, `hero-meta`). Los valores de las etiquetas son el respaldo estático (2025) si el JS no corre.

### 3. `app.js`, al final de `updateHero()` (después de la línea que escribe `#hero-finding`)

```js
    // Hero v3: cifras colgadas del arte (assets/hero/)
    const hc = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    hc('hc-anio', y); hc('hc-pim', fmtM(n.pim)); hc('hc-ej', fmtP(ej));
    if (per !== null) hc('hc-per', `${Math.round(per * 100)} céntimos`);
    const tPer = document.querySelector('.hc-per'); if (tPer) tPer.hidden = per === null;
```

`styles.css` no necesita cambios: `hero.css` sobreescribe lo del hero con `.hero.hero-v3` y no toca otra cosa.
Si se prefiere un solo CSS, pegar `hero.css` al final de `styles.css` y cambiar `url("guarda.svg")` por
`url("assets/hero/guarda.svg")`.

## Mantenimiento
- Las columnas son datos: cada año, después de `etl/build.py`, correr `python3 assets/hero/generar_hero.py`
  (toma los años cerrados de `data/resumen.json`; los parciales se excluyen).
- Composición: escritorio ≥ 1024 px = texto a la izquierda (título en 4 líneas), panel de arte a la derecha
  (`--arte-w: clamp(340px, 36vw, 640px)`) a sangre arriba y a la derecha, apoyado en la guarda.
  El alto mínimo del hero se calcula para que el sol nunca quede tapado por las etiquetas.
- Móvil: el arte es una banda de 375 × 150 al pie del hero (después del buscador), así que no empuja
  el buscador fuera de la primera pantalla.

## Capturas de verificación (scratchpad de la sesión, temporales)
1280 claro y oscuro, 1024, 1600 y 375 claro/oscuro (iframe), con `--force-prefers-reduced-motion`.
