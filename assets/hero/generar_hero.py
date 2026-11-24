#!/usr/bin/env python3
"""Genera el arte del hero (assets/hero/*.svg). Solo librería estándar.

    python3 assets/hero/generar_hero.py

Motivos: sol Inti escalonado con chakana, cordillera en capas con andenes, frontón de universidad cuyas
columnas son el PIM nacional 2012-2025 (data/resumen.json) y guarda de rombos de pallay.
Paleta v2 (assets/brand/BRAND.md). El arte es decorativo: se usa con alt="" y aria-hidden.
"""
import json
import math
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ROOT = AQUI.parent.parent

PAPEL = "#F4EEE2"; TINTA = "#1E1428"; ANIL = "#2B3FA8"; MAIZ = "#4A1F6B"; CHICHA = "#C81E64"
ROCOTO = "#C2410C"; SELVA = "#0B6B4E"; TITICACA = "#17637D"; AJI = "#F2B705"; COBRE = "#8A3B12"
COCHINILLA = "#C4122F"
GUARDA = [ANIL, MAIZ, CHICHA, ROCOTO, SELVA, TITICACA, AJI, COBRE, COCHINILLA]
ANIL_HONDO = "#22338C"   # añil un punto más oscuro para los rayos (misma familia que el fondo)


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def pia_serie():
    """PIA nacional de universidades 2012-2026 + PIA 2027 (dictamen/ley, expectativa_2027)."""
    try:
        d = json.loads((ROOT / "data" / "resumen.json").read_text(encoding="utf-8"))
        nac = d["nacional"]
        serie = [(int(a), nac[a]["pia"]) for a in sorted(nac) if nac[a].get("pia")]
        t = ((d.get("expectativa_2027") or {}).get("total_universidades") or {})
        if t.get("pia_2027"):
            serie.append((2027, t["pia_2027"]))
        return serie
    except Exception:
        return [(2012 + i, v * 1e6) for i, v in enumerate(
            [2906, 3331, 3411, 3526, 3497, 3534, 4039, 4554, 4588, 4598, 4697, 5641, 6969, 6955, 6700, 7552])]


CENTROS = {}   # x de cada columna (para las etiquetas HTML de años en hero.css)


def rombo(cx, cy, u, n, fill):
    """Rombo escalonado (pallay) de 2n+1 barras de alto u, como una sola ruta."""
    d = []
    for k in range(-n, n + 1):
        w = (2 * (n - abs(k)) + 1) * u
        d.append(f"M{f(cx - w / 2)} {f(cy + k * u - u / 2)}h{f(w)}v{f(u)}h{f(-w)}z")
    return f'<path fill="{fill}" d="{"".join(d)}"/>'


def disco_escalonado(cx, cy, r, u, fill, extra=""):
    """Círculo hecho de escalones de alto u (como tejido)."""
    d = []
    n = int(r // u)
    for k in range(-n, n):
        y0 = k * u; ym = y0 + u / 2
        w = 2 * math.sqrt(max(r * r - ym * ym, 0))
        w = round(w / u) * u
        if w <= 0:
            continue
        d.append(f"M{f(cx - w / 2)} {f(cy + y0)}h{f(w)}v{f(u)}h{f(-w)}z")
    return f'<path fill="{fill}" d="{"".join(d)}"{extra}/>'


def chakana(cx, cy, s, fill):
    """Cruz andina escalonada: 3 escalones por cuadrante, módulo s."""
    pts = [(-1, -3), (1, -3), (1, -2), (2, -2), (2, -1), (3, -1), (3, 1), (2, 1), (2, 2), (1, 2), (1, 3),
           (-1, 3), (-1, 2), (-2, 2), (-2, 1), (-3, 1), (-3, -1), (-2, -1), (-2, -2), (-1, -2)]
    p = " ".join(f"{f(cx + x * s)},{f(cy + y * s)}" for x, y in pts)
    return f'<polygon fill="{fill}" points="{p}"/>'


def rayos(cx, cy, n, R, fill, op):
    out = []
    for i in range(0, n, 2):
        a0 = 2 * math.pi * i / n - math.pi / 2; a1 = 2 * math.pi * (i + 1) / n - math.pi / 2
        out.append(f"M{f(cx)} {f(cy)}L{f(cx + R * math.cos(a0))} {f(cy + R * math.sin(a0))}"
                   f"L{f(cx + R * math.cos(a1))} {f(cy + R * math.sin(a1))}z")
    return f'<path fill="{fill}" opacity="{op}" d="{"".join(out)}"/>'


def escalonada(puntos, paso):
    """Convierte una poligonal en silueta de andenes: cada tramo se vuelve escalera de alto 'paso'."""
    out = [puntos[0]]
    for (x0, y0), (x1, y1) in zip(puntos, puntos[1:]):
        dy = y1 - y0
        n = max(1, int(abs(dy) // paso))
        for k in range(1, n + 1):
            xa = x0 + (x1 - x0) * k / n
            ya = y0 + dy * k / n
            if dy < 0:   # subida: primero sube, luego avanza
                out += [(out[-1][0], ya), (xa, ya)]
            else:        # bajada: avanza y luego baja
                out += [(xa, out[-1][1]), (xa, ya)]
    return out


def nevado(p_izq, cima, p_der, prof, fill):
    """Casquete de nieve sobre una cima: sigue las laderas y termina en zigzag escalonado."""
    (xl, yl), (xc, yc), (xr, yr) = p_izq, cima, p_der
    def en(t, xa, ya):
        return (xc + (xa - xc) * t, yc + (ya - yc) * t)
    tl = prof / (yl - yc); tr = prof / (yr - yc)
    a = en(tl, xl, yl); b = en(tr, xr, yr)
    n = 5; pts = [cima, b]
    for k in range(1, n):
        x = b[0] + (a[0] - b[0]) * k / n
        y = (b[1] + (a[1] - b[1]) * k / n) + (-prof * .35 if k % 2 else 0)
        pts += [(x, pts[-1][1]), (x, y)]
    pts += [(a[0], pts[-1][1]), a]
    return poli(pts, fill)


def poli(puntos, fill, extra=""):
    p = " ".join(f"{f(x)},{f(y)}" for x, y in puntos)
    return f'<polygon fill="{fill}" points="{p}"{extra}/>'


def templo(cx, base_y, ancho, alto_max, serie, s=1.0, animar=True):
    """Frontón + columnas-barras + escalinata. Devuelve (svg, y_arquitrabe)."""
    n = len(serie); vmax = max(v for _, v in serie)
    # Alturas proporcionales DESDE CERO (se leen como gráfico: nada de ejes truncados).
    # La caída 2025 -> 2026 se marca con capitel cochinilla y un ▼ chico, no exagerando la escala.
    gap = ancho * 0.30 / (n - 1); w = (ancho - gap * (n - 1)) / n
    x0 = cx - ancho / 2
    y_top_max = base_y - alto_max
    arq_h = 26 * s; arq_y = y_top_max - 10 * s - arq_h
    ala = 34 * s
    frontis_h = 78 * s
    out = []
    # columnas (barras de PIM)
    cols = []
    for i, (a, v) in enumerate(serie):
        h = alto_max * v / vmax
        x = x0 + i * (w + gap)
        ult = i == n - 1
        baja = i > 0 and v < serie[i - 1][1] and a >= 2026       # 2026 baja frente a 2025
        fill = AJI if ult else PAPEL
        CENTROS.setdefault(s, []).append((a, x + w / 2, base_y - h))
        cap = (f'<rect x="{f(x - 2 * s)}" y="{f(base_y - h)}" width="{f(w + 4 * s)}" height="{f((7 if baja else 5) * s)}" '
               f'fill="{COCHINILLA if baja else fill}"/>')
        fuste = f'<rect x="{f(x)}" y="{f(base_y - h)}" width="{f(w)}" height="{f(h)}" fill="{fill}"/>'
        estria = (f'<rect x="{f(x + w / 2 - 1 * s)}" y="{f(base_y - h + 10 * s)}" width="{f(2 * s)}" height="{f(max(h - 14 * s, 0))}" '
                  f'fill="{TINTA}" opacity="{.55 if ult else .16}"/>')
        # la última (2027) aún no es ley: borde punteado de tinta = "pendiente"
        pend = (f'<rect x="{f(x + 1.25 * s)}" y="{f(base_y - h + 1.25 * s)}" width="{f(w - 2.5 * s)}" height="{f(h - 2.5 * s)}" '
                f'fill="none" stroke="{TINTA}" stroke-width="{f(2.5 * s)}" stroke-dasharray="{f(6 * s)} {f(4 * s)}"/>') if ult else ""
        # brillo de la columna 2027: halo ají translúcido + destellos a los lados del capitel
        brillo = ""
        if ult:
            brillo = (f'<rect x="{f(x - 5 * s)}" y="{f(base_y - h - 4 * s)}" width="{f(w + 10 * s)}" height="{f(h + 4 * s)}" fill="{AJI}" opacity=".35"/>')
            for k, dy in enumerate((22, 48, 78)):
                yy = base_y - h + dy * s
                brillo += (f'<rect x="{f(x + w + 7 * s)}" y="{f(yy)}" width="{f((10 - k * 2) * s)}" height="{f(3 * s)}" fill="{AJI}"/>')
        if baja:   # ▼ cochinilla sobre el capitel de la columna que baja
            ty = base_y - h - 4 * s; tw = w * .9
            brillo += (f'<polygon fill="{COCHINILLA}" points="{f(x + w / 2 - tw / 2)},{f(ty - tw * .8)} '
                       f'{f(x + w / 2 + tw / 2)},{f(ty - tw * .8)} {f(x + w / 2)},{f(ty)}"/>')
        cols.append(f'<g class="col{" col-27" if ult else ""}">{brillo}{fuste}{estria if not ult else ""}{pend}{cap}</g>')
    out.append(f'<g class="cols">{"".join(cols)}</g>')
    # arquitrabe = friso de pallay
    ax0 = x0 - ala; ax1 = x0 + ancho + ala
    out.append(f'<rect x="{f(ax0)}" y="{f(arq_y)}" width="{f(ax1 - ax0)}" height="{f(arq_h)}" fill="{TINTA}"/>')
    nr = int((ax1 - ax0) // (22 * s))
    paso = (ax1 - ax0) / nr
    colores = [AJI, CHICHA, PAPEL]
    for k in range(nr):
        out.append(rombo(ax0 + paso * (k + .5), arq_y + arq_h / 2, 3.4 * s, 2, colores[k % 3]))
    out.append(f'<rect x="{f(ax0 - 6 * s)}" y="{f(arq_y - 7 * s)}" width="{f(ax1 - ax0 + 12 * s)}" height="{f(7 * s)}" fill="{PAPEL}"/>')
    # frontón (tímpano chicha con marco papel)
    by = arq_y - 7 * s
    apex = (cx, by - frontis_h)
    out.append(poli([(ax0 - 14 * s, by), apex, (ax1 + 14 * s, by)], PAPEL))
    ins = 13 * s
    t_l = (ax0 - 14 * s + ins * 2.3, by - ins * .55); t_r = (ax1 + 14 * s - ins * 2.3, by - ins * .55)
    t_a = (cx, apex[1] + ins * 1.25)
    out.append(poli([t_l, t_a, t_r], CHICHA))
    # en el tímpano: chakana ají con centro añil (el "ojo" del templo)
    cy_t = by - frontis_h * .36
    out.append(chakana(cx, cy_t, 7 * s, AJI))
    out.append(f'<rect x="{f(cx - 5 * s)}" y="{f(cy_t - 5 * s)}" width="{f(10 * s)}" height="{f(10 * s)}" fill="{ANIL}"/>')
    # rombos chicos a los lados del tímpano
    for dx in (-1, 1):
        out.append(rombo(cx + dx * 62 * s, by - 14 * s, 3 * s, 1, PAPEL))
    # escalinata
    esc = []
    for k, (ext, col) in enumerate([(ala, PAPEL), (ala + 18 * s, TINTA), (ala + 36 * s, PAPEL)]):
        esc.append(f'<rect x="{f(x0 - ext)}" y="{f(base_y + k * 12 * s)}" width="{f(ancho + 2 * ext)}" height="{f(12 * s)}" fill="{col}"/>')
    out.append("".join(esc))
    return "\n".join(out), apex[1]


# Sin animación dentro del SVG: en <img> no se controla y en algunos navegadores/headless se quedaba a medias.
# El estado por defecto es el FINAL (todas las columnas a su altura).
ESTILO = ""


def hero_escritorio(serie):
    W, H = 600, 664
    CIELO = 600          # cielo extra arriba: el arte se recorta con object-fit: cover desde abajo
    cx = 300
    sol_y = 232
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {-CIELO} {W} {H + CIELO}" width="{W}" height="{H + CIELO}" '
         f'preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">', ESTILO]
    # rayos del sol
    o.append(rayos(cx, sol_y, 48, 1100, MAIZ, ".55"))
    # sol Inti escalonado
    o.append(disco_escalonado(cx, sol_y, 112, 8, AJI))
    o.append(disco_escalonado(cx, sol_y, 84, 8, ROCOTO))
    o.append(disco_escalonado(cx, sol_y, 68, 8, AJI))
    # cordillera de fondo (titicaca) con nevados escalonados
    fondo = [(0, 300), (40, 262), (78, 286), (128, 196), (186, 292), (232, 268), (300, 346), (368, 270),
             (418, 300), (474, 176), (528, 270), (566, 246), (600, 270)]
    o.append(poli(fondo + [(600, H), (0, H)], TITICACA))
    o.append(nevado((78, 286), (128, 196), (186, 292), 30, PAPEL))
    o.append(nevado((418, 300), (474, 176), (528, 270), 34, PAPEL))
    # cerros medios (maíz) con andenes
    medio_i = escalonada([(0, 352), (70, 300), (150, 340), (215, 392)], 12)
    medio_d = escalonada([(380, 396), (450, 330), (520, 296), (600, 334)], 12)
    o.append(f'<clipPath id="cm">{poli(medio_i + [(215, H), (0, H)], "#000")}{poli(medio_d + [(600, H), (380, H)], "#000")}</clipPath>')
    o.append(poli(medio_i + [(215, H), (0, H)], MAIZ))
    o.append(poli(medio_d + [(600, H), (380, H)], MAIZ))
    # líneas de andén (selva) sobre los cerros medios
    o.append('<g clip-path="url(#cm)">' + "".join(
        f'<rect x="0" y="{y}" width="600" height="3" fill="{SELVA}"/>' for y in range(318, 600, 22)) + '</g>')
    # cerros cercanos (selva) a los lados del templo
    cerca_i = escalonada([(0, 470), (60, 440), (120, 486)], 10)
    o.append(poli(cerca_i + [(120, H), (0, H)], SELVA))
    cerca_d = escalonada([(486, 492), (550, 446), (600, 462)], 10)
    o.append(poli(cerca_d + [(600, H), (486, H)], SELVA))
    # templo
    tsvg, _ = templo(cx, 586, 318, 214, serie, s=1.0)
    o.append(tsvg)
    # suelo tinta bajo la escalinata
    o.append(f'<rect x="0" y="622" width="{W}" height="{H - 622}" fill="{TINTA}"/>')
    # años al pie de la primera y la última columna (texto del sistema: en <img> no cargan fuentes web)
    cs = CENTROS[1.0]
    fam = "font-family=\"Archivo, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif\" font-weight=\"800\" font-size=\"17\" text-anchor=\"middle\""
    o.append(f'<text x="{f(cs[0][1])}" y="651" fill="{PAPEL}" {fam}>{cs[0][0]}</text>')
    o.append(f'<text x="{f(cs[-1][1])}" y="651" fill="{AJI}" {fam}>▲ {cs[-1][0]}</text>')
    o.append("</svg>")
    return "\n".join(o)


def hero_movil(serie):
    """Banda horizontal para móvil: sol a la izquierda, templo a la derecha."""
    W, H = 375, 150
    sx, sy = 92, 76
    cx = 246
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" aria-hidden="true" focusable="false">',
         ESTILO]
    o.append(rayos(sx, sy, 28, 420, MAIZ, ".55"))
    o.append(disco_escalonado(sx, sy, 50, 5, AJI))
    o.append(disco_escalonado(sx, sy, 37, 5, ROCOTO))
    o.append(disco_escalonado(sx, sy, 30, 5, AJI))
    fondo = [(0, 92), (30, 50), (66, 96), (92, 112), (124, 84), (150, 100), (176, 70), (210, 104),
             (262, 96), (300, 58), (344, 30), (375, 60)]
    o.append(poli(fondo + [(W, H), (0, H)], TITICACA))
    o.append(nevado((0, 92), (30, 50), (66, 96), 13, PAPEL))
    o.append(nevado((300, 58), (344, 30), (375, 60), 12, PAPEL))
    mi = escalonada([(0, 118), (60, 100), (120, 112), (160, 134)], 6) + [(160, H), (0, H)]
    md = escalonada([(320, 128), (350, 104), (375, 98)], 6) + [(375, H), (320, H)]
    o.append(f'<clipPath id="cmm">{poli(mi, "#000")}{poli(md, "#000")}</clipPath>')
    o.append(poli(mi, MAIZ)); o.append(poli(md, MAIZ))
    o.append('<g clip-path="url(#cmm)">' + "".join(
        f'<rect x="0" y="{y}" width="{W}" height="2" fill="{SELVA}"/>' for y in range(100, H, 10)) + '</g>')
    o.append(poli(escalonada([(0, 136), (34, 122), (74, 142)], 5) + [(74, H), (0, H)], SELVA))
    tsvg, _ = templo(cx, 126, 150, 62, serie, s=0.42)
    o.append(tsvg)
    o.append(f'<rect x="0" y="141" width="{W}" height="{H - 141}" fill="{TINTA}"/>')
    o.append("</svg>")
    return "\n".join(o)


def guarda_tile():
    """Tesela de 9 tramos (720 x 20) con rombos escalonados; se repite en x."""
    seg = 80; h = 20
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {seg * 9} {h}" width="{seg * 9}" height="{h}">']
    for i, col in enumerate(GUARDA):
        x0 = i * seg
        o.append(f'<rect x="{x0}" y="0" width="{seg}" height="{h}" fill="{col}"/>')
        fg = TINTA if col == AJI else PAPEL
        for j in range(3):
            o.append(rombo(x0 + seg * (j + .5) / 3, h / 2, 2.6, 2, fg))
    o.append("</svg>")
    return "".join(o)


def main():
    serie = pia_serie()
    (AQUI / "hero.svg").write_text(hero_escritorio(serie), encoding="utf-8")
    (AQUI / "hero-movil.svg").write_text(hero_movil(serie), encoding="utf-8")
    (AQUI / "guarda.svg").write_text(guarda_tile(), encoding="utf-8")
    for n in ("hero.svg", "hero-movil.svg", "guarda.svg"):
        print(n, (AQUI / n).stat().st_size, "bytes")
    print("columnas:", serie[0][0], "-", serie[-1][0])
    for esc_, cs in CENTROS.items():
        print("escala", esc_, [(a, round(x, 1), round(y, 1)) for a, x, y in (cs[0], cs[-2], cs[-1])])


if __name__ == "__main__":
    main()
