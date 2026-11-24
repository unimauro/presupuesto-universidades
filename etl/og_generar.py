#!/usr/bin/env python3
"""Genera las imágenes para compartir (Open Graph, 1200x630) con cifras REALES de data/observatorio.json.

Salidas (SVG + PNG vía rsvg-convert):
  assets/og/og.png              -> index.html (copia de la variante elegida, ver ELEGIDA)
  assets/og/og-historias.png    -> historias.html
  assets/og/og-2027.png         -> "Lo que viene en 2027" (signo de interrogación si aún no hay datos)
  assets/og/variantes/og-a-escalones.png, og-b-nadie.png, og-c-expectativa.png

Uso:  python3 etl/og_generar.py            (solo librería estándar; requiere rsvg-convert en el PATH)
Se ejecuta después de etl/build.py para que las cifras se actualicen con cada corrida.
Los fondos y el logo son ilustración propia (sin plantillas de memes ni imágenes de terceros).
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "observatorio.json"
SAMPLE = ROOT / "data" / "sample" / "observatorio.json"
OUT = ROOT / "assets" / "og"
VAR = OUT / "variantes"
URL = "unimauro.github.io/presupuesto-universidades"
ELEGIDA = "og-a-escalones"   # variante copiada como og.png

# Paleta (styles.css): azul tinta + ocre
BG = "#1B2230"; GRID = "#2B323E"; INK = "#26346F"; INK_L = "#8F9CF0"; INK_XL = "#C6CCF5"
OCHRE = "#E0A447"; OCHRE_D = "#B0741A"; PAPER = "#E9E6DF"; MUTED = "#9BA3B1"; PIA_C = "#8B94A6"
SERIF = "Georgia, 'Source Serif 4', serif"
SANS = "'Helvetica Neue', Helvetica, Arial, 'IBM Plex Sans', sans-serif"
NUM = SANS  # cifras en sans: Georgia usa números de estilo antiguo ("7.o") que se leen mal en miniatura


# ---------- datos ----------
def cargar():
    src = DATA if DATA.exists() else SAMPLE
    d = json.loads(src.read_text(encoding="utf-8"))
    return d, src == SAMPLE or d.get("ejemplo") is True


def anios_cerrados(d):
    parcial = {str(k) for k in (d.get("parcial") or {})}
    return sorted(str(a) for a in d.get("anios", []) if str(a) not in parcial)


def total(d, y):
    """Totales del conjunto para el año y (suma de universidades; nacional como respaldo)."""
    unis = [u for u in d["universidades"] if (u.get("anios") or {}).get(y, {}).get("total")]
    if unis:
        t = {k: sum((u["anios"][y]["total"].get(k) or 0) for u in unis) for k in ("pia", "pim", "dev")}
        t["n"] = len(unis)
        return t
    n = (d.get("nacional") or {}).get(y)
    if n:
        return {"pia": n.get("pia"), "pim": n.get("pim"), "dev": n.get("dev"), "n": n.get("n_unis")}
    return None


def share_personal(d, y):
    tot = per = 0.0
    for u in d["universidades"]:
        a = (u.get("anios") or {}).get(y) or {}
        dev = (a.get("total") or {}).get("dev")
        g = next((v for k, v in (a.get("generica") or {}).items() if k.strip().startswith("2.1")), None)
        if dev and g and g.get("dev") is not None:
            tot += dev; per += g["dev"]
    return per / tot if tot else None


def mil_millones(v):
    """6954551994 -> '7.0' (mil millones, 1 decimal, punto decimal como se usa en Perú)."""
    return f"{v / 1e9:.1f}"


# ---------- piezas SVG ----------
def t(x, y, s, size, fill=PAPER, fam=SANS, weight="400", anchor="start", extra=""):
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}" {extra}>{escape(str(s))}</text>')


def logo_mark(x, y, s):
    k = s / 64
    return (f'<g transform="translate({x} {y}) scale({k})">'
            f'<rect width="64" height="64" rx="12" fill="{INK}"/>'
            '<path d="M12 22 L32 11 L52 22 Z" fill="none" stroke="#E6E8F3" stroke-width="2.6" stroke-linejoin="round"/>'
            '<rect x="15" y="34" width="6" height="16" rx="1" fill="#E6E8F3"/>'
            '<rect x="25" y="27" width="6" height="23" rx="1" fill="#E6E8F3"/>'
            '<rect x="35" y="38" width="6" height="12" rx="1" fill="#E6E8F3" opacity=".7"/>'
            f'<rect x="45" y="30" width="4" height="20" rx="1" fill="{OCHRE}"/>'
            '<path d="M11 53 H53" stroke="#E6E8F3" stroke-width="2.6" stroke-linecap="round"/>'
            '<path d="M8 42 H56" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="2 2" opacity=".55"/></g>')


def lienzo(cuerpo, bg=BG, grid=GRID, sample=False, fuente="Fuente: MEF – Consulta Amigable (SIAF)"):
    aviso = t(1150, 44, "DATOS DE EJEMPLO", 22, OCHRE, weight="700", anchor="end") if sample else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="{grid}" stroke-width="1"/></pattern></defs>
<rect width="1200" height="630" fill="{bg}"/><rect width="1200" height="630" fill="url(#g)" opacity=".7"/>
{cuerpo}
<rect x="0" y="560" width="1200" height="70" fill="#12151B" opacity=".92"/>
{logo_mark(40, 573, 44)}
{t(98, 604, "Radiografía Presupuestal", 24, PAPER, SERIF, "700")}
{t(98, 622, fuente, 13, MUTED)}
{t(1160, 606, URL, 26, OCHRE, weight="600", anchor="end")}
{aviso}
</svg>'''


# ---------- variantes del OG principal ----------
def og_escalones(d, y, T, sample):
    vals = [("Me asignaron", "PIA", T["pia"], PIA_C), ("Me ampliaron", "PIM", T["pim"], INK_L), ("Gasté", "devengado", T["dev"], OCHRE)]
    top = max(v[2] for v in vals)
    base, hmax, w, gap, x0 = 535, 285, 300, 50, 75
    c = [t(75, 92, f"Presupuesto universitario {y},", 50, PAPER, SERIF, "700"),
         t(75, 150, "en 3 escalones", 50, OCHRE, SERIF, "700")]
    for i, (cap, sig, v, col) in enumerate(vals):
        h = hmax * v / top
        x = x0 + i * (w + gap)
        ytop = base - h
        c.append(f'<rect x="{x}" y="{ytop:.1f}" width="{w}" height="{h:.1f}" rx="8" fill="{col}"/>')
        c.append(t(x + 4, ytop - 16, cap, 36, PAPER, weight="700"))
        c.append(t(x + w / 2, ytop + 78, f"S/ {mil_millones(v)}", 66, BG, NUM, "700", "middle"))
        c.append(t(x + w / 2, ytop + 116, f"mil millones · {sig}", 22, BG, weight="600", anchor="middle"))
    return lienzo("\n".join(c), sample=sample, fuente=f"{T['n']} universidades públicas · {y} · Fuente: MEF – SIAF")


def og_nadie(d, y, T, sample):
    c = [t(80, 150, "Nadie:", 54, MUTED, SANS, "400"),
         t(80, 250, f"Las universidades públicas en {y}:", 54, PAPER, SANS, "700"),
         t(80, 380, f"*gastan S/ {mil_millones(T['dev'])} mil millones*", 68, OCHRE, NUM, "700"),
         t(80, 455, f"de S/ {mil_millones(T['pim'])} mil millones disponibles", 36, INK_XL, SANS, "400"),
         ]
    return lienzo("\n".join(c), sample=sample, fuente=f"Devengado vs PIM · {T['n']} universidades · Fuente: MEF – SIAF")


def og_expectativa(d, y, T, sample):
    ej = T["dev"] / T["pim"] if T["pim"] else None
    c = [f'<rect x="40" y="40" width="550" height="490" rx="18" fill="{INK}"/>',
         f'<rect x="610" y="40" width="550" height="490" rx="18" fill="{OCHRE_D}"/>',
         t(315, 120, "EXPECTATIVA", 46, INK_XL, SANS, "700", "middle", 'letter-spacing="4"'),
         t(315, 300, f"S/ {mil_millones(T['pim'])}", 132, "#FFFFFF", NUM, "700", "middle"),
         t(315, 360, "mil millones", 40, INK_XL, SANS, "600", "middle"),
         t(315, 470, f"presupuesto {y} (PIM)", 32, INK_XL, SANS, "400", "middle"),
         t(885, 120, "REALIDAD", 46, "#FFF4DF", SANS, "700", "middle", 'letter-spacing="4"'),
         t(885, 300, f"S/ {mil_millones(T['dev'])}", 132, "#FFFFFF", NUM, "700", "middle"),
         t(885, 360, "mil millones", 40, "#FFF4DF", SANS, "600", "middle"),
         t(885, 470, f"gastado: {ej * 100:.0f}%" if ej else "gastado", 32, "#FFF4DF", SANS, "400", "middle"),
         ]
    return lienzo("\n".join(c), sample=sample, fuente=f"{T['n']} universidades públicas · {y} · Fuente: MEF – SIAF")


# ---------- historias ----------
def og_historias(d, y, sample):
    sh = share_personal(d, y)
    cents = round(sh * 100) if sh is not None else None
    cx, cy, r = 935, 290, 200
    import math
    c = [t(70, 130, "POV: eres un sol", 72, PAPER, SERIF, "700"),
         t(70, 190, "del presupuesto universitario", 40, INK_XL, SANS, "400")]
    if cents is not None:
        a = 2 * math.pi * sh
        x1, y1 = cx + r * math.sin(a), cy - r * math.cos(a)
        big = 1 if sh > 0.5 else 0
        c += [f'<circle cx="{cx}" cy="{cy}" r="{r + 14}" fill="none" stroke="{OCHRE}" stroke-width="6"/>',
              f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{INK}"/>',
              f'<path d="M{cx} {cy} L{cx} {cy - r} A{r} {r} 0 {big} 1 {x1:.1f} {y1:.1f} Z" fill="{OCHRE}"/>',
              f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#12151B" stroke-width="3"/>',
              t(cx, cy + 26, "S/ 1", 80, "#FFFFFF", NUM, "700", "middle", 'stroke="#12151B" stroke-width="2" paint-order="stroke"'),
              t(70, 330, f"{cents} céntimos", 80, OCHRE, NUM, "700"),
              t(70, 385, "→ van a planilla", 44, PAPER, SANS, "700"),
              t(70, 470, f"{100 - cents} céntimos → todo lo demás", 38, INK_XL, SANS, "400")]
    else:
        c.append(t(70, 330, "¿Cuántos céntimos van a planilla?", 54, OCHRE, SERIF, "700"))
    return lienzo("\n".join(c), sample=sample, fuente=f"Personal y obligaciones sociales (genérica 2.1), devengado {y} · MEF – SIAF")


# ---------- 2027 ----------
def og_2027(d, sample):
    T27 = total(d, "2027")
    T26 = total(d, "2026")
    c = [t(70, 120, "Lo que viene en", 56, PAPER, SERIF, "700"),
         t(70, 250, "2027", 150, OCHRE, NUM, "700")]
    if T27 and T27.get("pia"):
        c += [t(1130, 300, f"S/ {mil_millones(T27['pia'])}", 150, INK_L, NUM, "700", "end"),
              t(1130, 360, "mil millones de PIA", 36, INK_XL, SANS, "600", "end")]
        if T26 and T26.get("pia"):
            var = T27["pia"] / T26["pia"] - 1
            c.append(t(70, 470, f"{'+' if var >= 0 else ''}{var * 100:.1f}% frente al PIA 2026 (nominal)", 38, PAPER))
        fuente = "PIA 2027 · Fuente: MEF – SIAF"
    else:
        c += [t(1110, 380, "S/ ¿?", 220, INK_L, NUM, "700", "end"),
              t(70, 440, (f"2026 arrancó con S/ {mil_millones(T26['pia'])} mil millones" if T26 and T26.get("pia") else "Aún sin datos de 2026"), 40, PAPER, SANS, "700"),
              t(70, 500, "El PIA 2027 llega con la Ley de Presupuesto", 32, MUTED)]
        fuente = "PIA 2026 · Fuente: MEF – SIAF · 2027 aún sin datos"
    return lienzo("\n".join(c), sample=sample, fuente=fuente)


def render(svg, nombre, carpeta):
    carpeta.mkdir(parents=True, exist_ok=True)
    s, p = carpeta / f"{nombre}.svg", carpeta / f"{nombre}.png"
    s.write_text(svg, encoding="utf-8")
    subprocess.run(["rsvg-convert", "-w", "1200", "-h", "630", str(s), "-o", str(p)], check=True)
    return p


def main():
    if not shutil.which("rsvg-convert"):
        sys.exit("Falta rsvg-convert (brew install librsvg).")
    d, sample = cargar()
    cerr = [y for y in anios_cerrados(d) if total(d, y)]
    if not cerr:
        sys.exit("No hay años cerrados con datos.")
    y = cerr[-1]
    T = total(d, y)
    print(f"Último año cerrado: {y} · n={T['n']} · PIA {T['pia']:,.0f} · PIM {T['pim']:,.0f} · DEV {T['dev']:,.0f}"
          + (" · DATOS DE EJEMPLO" if sample else ""))
    variantes = {"og-a-escalones": og_escalones, "og-b-nadie": og_nadie, "og-c-expectativa": og_expectativa}
    for nombre, fn in variantes.items():
        print("  ", render(fn(d, y, T, sample), nombre, VAR).relative_to(ROOT))
    shutil.copyfile(VAR / f"{ELEGIDA}.svg", OUT / "og.svg")
    shutil.copyfile(VAR / f"{ELEGIDA}.png", OUT / "og.png")
    print("   assets/og/og.png <-", ELEGIDA)
    print("  ", render(og_historias(d, y, sample), "og-historias", OUT).relative_to(ROOT))
    print("  ", render(og_2027(d, sample), "og-2027", OUT).relative_to(ROOT))


if __name__ == "__main__":
    main()
