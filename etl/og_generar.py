#!/usr/bin/env python3
"""Genera las imágenes para compartir (Open Graph, 1200x630) con cifras REALES de data/observatorio.json.

Sistema visual v2 ("afiche de feria con datos", ver assets/brand/BRAND.md §1-3 y §6): colores planos,
cifra gigante en Archivo extra condensada 900, textos en Atkinson Hyperlegible Next y una guarda de
rombos escalonados con los colores de capítulo.

Salidas (SVG + PNG vía rsvg-convert):
  assets/og/og.png              -> index.html (copia de la variante elegida, ver ELEGIDA)
  assets/og/og-historias.png    -> historias.html
  assets/og/og-2027.png         -> "Lo que viene en 2027" (signo de interrogación si aún no hay datos)
  assets/og/variantes/          -> variantes del OG principal y la versión clara de historias

Uso:  python3 etl/og_generar.py            (solo librería estándar; requiere rsvg-convert en el PATH)
Se ejecuta después de etl/build.py para que las cifras se actualicen con cada corrida.

FUENTES (rsvg-convert usa las del sistema; si faltan, cae a una de respaldo SIN error, el script avisa):
  ~/Library/Fonts/Archivo[wdth,wght].ttf                 github.com/google/fonts ofl/archivo
  ~/Library/Fonts/AtkinsonHyperlegibleNext[wght].ttf     github.com/google/fonts ofl/atkinsonhyperlegiblenext
  ~/Library/Fonts/ArchivoExtraCondensed[wght].ttf        instancia wdth=62 de Archivo, porque rsvg/pango
      no aplica el eje de ancho (font-stretch) de una fuente variable. Se crea con fontTools (venv aparte):
      python3 -m venv ~/.venvs/fonttools && ~/.venvs/fonttools/bin/pip install fonttools
      ~/.venvs/fonttools/bin/python etl/og_generar.py --instanciar-archivo "<ruta>/Archivo[wdth,wght].ttf"
  Luego: fc-cache -f
Cifras grandes con números proporcionales (por defecto en Archivo; los tabulares dejan costura en "11").
Todo es ilustración propia (sin plantillas de memes ni imágenes de terceros).
"""
import json
import math
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

# Paleta v2 (BRAND.md §1-2)
PAPEL = "#F4EEE2"; PAPEL2 = "#EAE1CF"; TINTA = "#1E1428"; TINTA2 = "#5E5468"
ANIL = "#2B3FA8"; MAIZ = "#4A1F6B"; CHICHA = "#C81E64"; ROCOTO = "#C2410C"; SELVA = "#0B6B4E"
TITICACA = "#17637D"; AJI = "#F2B705"; COBRE = "#8A3B12"; COCHINILLA = "#C4122F"
GUARDA = [ANIL, MAIZ, CHICHA, ROCOTO, SELVA, TITICACA, AJI, COBRE, COCHINILLA]
LILA = "#D2BDF0"          # texto secundario sobre maíz (pensiones, tema oscuro)
# Etapas en versión clara (sobre fondo oscuro maíz): PIA adobe, PIM añil, devengado chicha
PIA_O = "#B5A68C"; PIM_O = "#7C8EF0"; DEV_O = "#FF5C9A"

FONTS_REQ = ("Archivo ExtraCondensed", "Archivo", "Atkinson Hyperlegible Next")
DISPLAY = "'Archivo ExtraCondensed', 'Archivo', 'Arial Narrow', sans-serif"   # titulares y cifras héroe (900)
CIFRAS = "'Archivo', sans-serif"
TEXTO = "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', sans-serif"


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


def millones(v):
    """6967055836 -> '6,967' (millones de soles, sin decimales, separador de miles como en index)."""
    return f"{round(v / 1e6):,}"


# ---------- piezas SVG ----------
def t(x, y, s, size, fill=PAPEL, fam=TEXTO, weight="400", anchor="start", extra=""):
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}" {extra}>{escape(str(s))}</text>')


def disp(x, y, s, size, fill=PAPEL, anchor="start", weight="900"):
    """Titular/cifra de afiche: Archivo extra condensada 900, números proporcionales."""
    return t(x, y, s, size, fill, DISPLAY, weight, anchor, 'letter-spacing="-0.5"')


def logo_mark(x, y, s):
    """Símbolo del logo (sin cambios en v2, BRAND.md §6)."""
    k = s / 64
    return (f'<g transform="translate({x} {y}) scale({k})">'
            '<rect width="64" height="64" rx="12" fill="#26346F"/>'
            '<path d="M12 22 L32 11 L52 22 Z" fill="none" stroke="#E6E8F3" stroke-width="2.6" stroke-linejoin="round"/>'
            '<rect x="15" y="34" width="6" height="16" rx="1" fill="#E6E8F3"/>'
            '<rect x="25" y="27" width="6" height="23" rx="1" fill="#E6E8F3"/>'
            '<rect x="35" y="38" width="6" height="12" rx="1" fill="#E6E8F3" opacity=".7"/>'
            '<rect x="45" y="30" width="4" height="20" rx="1" fill="#E0A447"/>'
            '<path d="M11 53 H53" stroke="#E6E8F3" stroke-width="2.6" stroke-linecap="round"/>'
            '<path d="M8 42 H56" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="2 2" opacity=".55"/></g>')


def rombo(cx, cy, u, n, fill):
    """Rombo escalonado (motivo de pallay) hecho de 2n+1 barras de alto u."""
    out = []
    for k in range(-n, n + 1):
        w = (2 * (n - abs(k)) + 1) * u
        out.append(f'<rect x="{cx - w / 2:.1f}" y="{cy + k * u - u / 2:.1f}" width="{w:.1f}" height="{u}" fill="{fill}"/>')
    return "".join(out)


def guarda(y, h=36):
    """Franja de guarda: 9 tramos con los colores de capítulo y rombos escalonados encima."""
    seg = 1200 / len(GUARDA)
    out = []
    for i, col in enumerate(GUARDA):
        x0 = i * seg
        out.append(f'<rect x="{x0:.1f}" y="{y}" width="{seg + 0.5:.1f}" height="{h}" fill="{col}"/>')
        fg = TINTA if col == AJI else PAPEL
        for j in range(4):
            out.append(rombo(x0 + seg * (j + 0.5) / 4, y + h / 2, 4, 3, fg))
    return "\n".join(out)


def lienzo(cuerpo, bg=MAIZ, claro=False, sample=False, fuente="Fuente: MEF – Consulta Amigable (SIAF)"):
    ink = TINTA if claro else PAPEL
    sub = TINTA2 if claro else LILA
    url_c = CHICHA if claro else AJI
    aviso = disp(1160, 60, "DATOS DE EJEMPLO", 30, url_c, "end", "800") if sample else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="{bg}"/>
{cuerpo}
{logo_mark(40, 527, 46)}
{t(98, 552, "Radiografía Presupuestal", 26, ink, DISPLAY, "800")}
{t(98, 578, fuente, 16, sub)}
{t(1160, 562, URL, 27, url_c, TEXTO, "700", "end")}
<rect x="0" y="590" width="1200" height="4" fill="{TINTA}"/>
{guarda(594)}
{aviso}
</svg>'''


# ---------- variantes del OG principal ----------
def og_escalones(d, y, T, sample):
    vals = [("Me asignaron", "PIA", T["pia"], PIA_O), ("Me ampliaron", "PIM", T["pim"], PIM_O), ("Gasté", "devengado", T["dev"], DEV_O)]
    top = max(v[2] for v in vals)
    base, hmax, w, gap, x0 = 505, 280, 320, 40, 60
    c = [disp(60, 100, f"Presupuesto universitario {y},", 76),
         disp(60, 172, "en 3 escalones", 76, AJI)]
    for i, (cap, sig, v, col) in enumerate(vals):
        h = hmax * v / top
        x = x0 + i * (w + gap)
        ytop = base - h
        c.append(f'<rect x="{x}" y="{ytop:.1f}" width="{w}" height="{h:.1f}" fill="{col}"/>')
        c.append(f'<rect x="{x}" y="{ytop:.1f}" width="{w}" height="6" fill="{TINTA}" opacity=".25"/>')
        c.append(t(x, ytop - 14, cap, 34, PAPEL, TEXTO, "700"))
        c.append(disp(x + w / 2, ytop + 104, f"S/ {millones(v)}", 100, TINTA, "middle"))
        c.append(t(x + w / 2, ytop + 140, f"millones · {sig}", 24, TINTA, TEXTO, "700", "middle"))
    return lienzo("\n".join(c), sample=sample, fuente=f"{T['n']} universidades públicas · {y} · MEF – SIAF")


def og_nadie(d, y, T, sample):
    c = [t(70, 120, "Nadie:", 54, TINTA2, TEXTO, "400"),
         disp(70, 220, f"Las universidades públicas en {y}:", 84, TINTA),
         disp(70, 380, f"*gastan S/ {millones(T['dev'])} millones*", 124, CHICHA),
         t(70, 460, f"de S/ {millones(T['pim'])} millones disponibles", 38, TINTA2, TEXTO, "700"),
         ]
    return lienzo("\n".join(c), bg=PAPEL, claro=True, sample=sample,
                  fuente=f"Devengado vs PIM · {T['n']} universidades · MEF – SIAF")


def og_expectativa(d, y, T, sample):
    ej = T["dev"] / T["pim"] if T["pim"] else None
    c = [f'<rect x="40" y="40" width="550" height="460" fill="{ANIL}"/>',
         f'<rect x="610" y="40" width="550" height="460" fill="{CHICHA}"/>',
         disp(315, 120, "EXPECTATIVA", 64, PAPEL, "middle", "800"),
         disp(315, 330, f"S/ {millones(T['pim'])}", 190, AJI, "middle"),
         t(315, 385, "millones", 40, PAPEL, TEXTO, "700", "middle"),
         t(315, 460, f"presupuesto {y} (PIM)", 30, PAPEL, TEXTO, "400", "middle"),
         disp(885, 120, "REALIDAD", 64, "#FFFFFF", "middle", "800"),
         disp(885, 330, f"S/ {millones(T['dev'])}", 190, "#FFFFFF", "middle"),
         t(885, 385, "millones", 40, "#FFFFFF", TEXTO, "700", "middle"),
         t(885, 460, f"gastado: {ej * 100:.0f}%" if ej else "gastado", 30, "#FFFFFF", TEXTO, "400", "middle"),
         ]
    return lienzo("\n".join(c), sample=sample, fuente=f"{T['n']} universidades públicas · {y} · MEF – SIAF")


# ---------- historias ----------
def og_historias(d, y, T, sample, claro=False):
    ink = TINTA if claro else PAPEL
    cifra = CHICHA if claro else AJI
    sub = TINTA2 if claro else LILA
    c = [disp(60, 118, "¿A dónde se va la plata", 104, ink),
         disp(60, 222, "de tu universidad?", 104, ink),
         disp(54, 420, f"S/ {millones(T['dev'])} millones", 200, cifra),
         t(62, 480, f"gastaron las {T['n']} universidades públicas en {y}. Te lo contamos en 8 historias.", 29, sub, TEXTO, "700"),
         ]
    return lienzo("\n".join(c), bg=PAPEL if claro else MAIZ, claro=claro, sample=sample,
                  fuente=f"Devengado {y} · MEF – Consulta Amigable (SIAF)")


# ---------- 2027 ----------
def og_2027(d, sample):
    T27 = total(d, "2027")
    T26 = total(d, "2026")
    c = [disp(60, 120, "Lo que viene en", 96),
         disp(60, 300, "2027", 230, AJI)]
    if T27 and T27.get("pia"):
        c += [disp(1140, 300, f"S/ {millones(T27['pia'])}", 200, PAPEL, "end"),
              t(1140, 350, "millones de PIA", 36, LILA, TEXTO, "700", "end")]
        if T26 and T26.get("pia"):
            var = T27["pia"] / T26["pia"] - 1
            c.append(t(60, 470, f"{'+' if var >= 0 else ''}{var * 100:.1f}% frente al PIA 2026 (nominal)", 38, PAPEL, TEXTO, "700"))
        fuente = "PIA 2027 · MEF – SIAF"
    else:
        c += [disp(1140, 330, "S/ ¿?", 300, DEV_O, "end"),
              t(60, 400, (f"2026 arrancó con S/ {millones(T26['pia'])} millones" if T26 and T26.get("pia") else "Aún sin datos de 2026"), 40, PAPEL, TEXTO, "700"),
              t(60, 460, "El PIA 2027 llega con la Ley de Presupuesto", 32, LILA)]
        fuente = "PIA 2026 · MEF – SIAF · 2027 aún sin datos"
    return lienzo("\n".join(c), sample=sample, fuente=fuente)


def render(svg, nombre, carpeta):
    carpeta.mkdir(parents=True, exist_ok=True)
    s, p = carpeta / f"{nombre}.svg", carpeta / f"{nombre}.png"
    s.write_text(svg, encoding="utf-8")
    subprocess.run(["rsvg-convert", "-w", "1200", "-h", "630", str(s), "-o", str(p)], check=True)
    return p


def fuentes_ok():
    """Avisa si faltan las fuentes de marca (rsvg caería en una de respaldo sin error)."""
    if not shutil.which("fc-list"):
        return True
    out = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True).stdout
    fams = {f.strip() for line in out.splitlines() for f in line.split(",")}
    faltan = [f for f in FONTS_REQ if f not in fams]
    if faltan:
        print("AVISO: faltan fuentes para rsvg-convert:", ", ".join(faltan), "(ver docstring)", file=sys.stderr)
    return not faltan


def instanciar_archivo(src):
    """Crea ArchivoExtraCondensed[wght].ttf (wdth=62) en ~/Library/Fonts. Requiere fontTools."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    f = instancer.instantiateVariableFont(TTFont(src), {"wdth": 62})
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16):
            rec.string = "Archivo ExtraCondensed"
        elif rec.nameID == 6:
            rec.string = "ArchivoExtraCondensed"
        elif rec.nameID == 3:
            rec.string = "ArchivoExtraCondensed-wdth62"
    dst = Path.home() / "Library" / "Fonts" / "ArchivoExtraCondensed[wght].ttf"
    f.save(dst)
    print("Creada", dst, "→ ejecutar: fc-cache -f")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--instanciar-archivo":
        return instanciar_archivo(sys.argv[2])
    if not shutil.which("rsvg-convert"):
        sys.exit("Falta rsvg-convert (brew install librsvg).")
    fuentes_ok()
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
    print("  ", render(og_historias(d, y, T, sample), "og-historias", OUT).relative_to(ROOT))
    print("  ", render(og_historias(d, y, T, sample, claro=True), "og-historias-clara", VAR).relative_to(ROOT))
    print("  ", render(og_2027(d, sample), "og-2027", OUT).relative_to(ROOT))


if __name__ == "__main__":
    main()
