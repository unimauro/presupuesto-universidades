#!/usr/bin/env python3
"""Páginas estáticas SEO: una por universidad + índice A-Z + sitemap.xml + robots.txt + OG por universidad.

Lee SOLO data/observatorio.json (correr DESPUÉS de etl/build.py). Python stdlib; para las imágenes OG usa
`rsvg-convert` si está instalado (si no, deja el .svg y omite el .png).

Salidas:
  u/index.html                       índice de universidades agrupadas por departamento
  u/<slug>/index.html                ficha estática por universidad (texto pre-renderizado, SVG inline, sin JS)
  u/u.css                            CSS mínimo compartido (paleta de assets/brand/BRAND.md)
  u/slugs.json                       mapa pliego -> slug (ESTABLE: si existe se reutiliza; nunca se renombra)
  assets/og/u/<slug>.png             imagen OG 1200x630 por universidad
  sitemap.xml, robots.txt

Slug = nombre oficial completo en minúsculas, sin tildes, con guiones
  (514 -> "universidad-nacional-de-ingenieria"). URL: <BASE>u/<slug>/

Uso:
  python3 etl/paginas_generar.py            # todo
  python3 etl/paginas_generar.py --sin-og   # sin regenerar PNG (más rápido)
"""
import html
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://unimauro.github.io/presupuesto-universidades/"
SITE = "Radiografía Presupuestal"
SD = "sin dato"

GTM = """<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-K2PJ776Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  dataLayer.push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
</script>"""

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900'
         '&family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">')

# Tema: CLARO por defecto siempre; oscuro solo si el usuario lo eligió en el sitio (localStorage rp-theme) o ?tema=oscuro.
THEME_JS = ("<script>(function(){var t=null;try{t=localStorage.getItem('rp-theme')}catch(e){}"
            "var m=/[?&]tema=(oscuro|claro)/.exec(location.search);if(m)t=m[1]==='oscuro'?'dark':'light';"
            "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)})();</script>")

E = lambda s: html.escape("" if s is None else str(s), quote=True)


# ---------------------------------------------------------------- utilidades
def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


NB = "\u00a0"


def _d1(x):
    return f"{x:,.1f}"


def fm(v):
    """Montos adaptativos: >=1,000 M -> 'S/ 7.7 mil M'; >=1 M -> 'S/ 53.4 M'; <1 M -> 'S/ 850 mil'; <1,000 -> 'S/ 850'."""
    v = num(v)
    if v is None:
        return SD
    a, sg = abs(v), "−" if v < 0 else ""
    if a >= 1e9:
        return f"{sg}S/{NB}{_d1(a / 1e9)}{NB}mil{NB}M"
    if a >= 1e6:
        return f"{sg}S/{NB}{_d1(a / 1e6)}{NB}M"
    if a >= 1e3:
        return f"{sg}S/{NB}{a / 1e3:,.0f}{NB}mil"
    return f"{sg}S/{NB}{a:,.0f}"


def fs(v):
    """Per cápita: >=1,000 -> 'S/ 87.7 mil'; si no, 'S/ 850'."""
    v = num(v)
    if v is None:
        return SD
    return f"S/{NB}{_d1(v / 1e3)}{NB}mil" if abs(v) >= 1e3 else f"S/{NB}{v:,.0f}"


def fp(r, d=1):
    """Porcentaje adaptativo: >=1000 % -> '×11.5 veces'; >=100 % sin decimales; si no, d decimales."""
    r = num(r)
    if r is None:
        return SD
    pc = r * 100
    if abs(pc) >= 1000:
        return f"×{r:,.1f}{NB}veces"
    if abs(pc) >= 100:
        return f"{pc:,.0f}{NB}%"
    return f"{pc:.{d}f}{NB}%"


def fn(v):
    v = num(v)
    return SD if v is None else f"{v:,.0f}"


def div(a, b):
    a, b = num(a), num(b)
    return a / b if a is not None and b else None


def safe_url(u):
    try:
        p = urlparse(str(u or "").strip())
    except ValueError:
        return None
    return p.geturl() if p.scheme in ("http", "https") and p.netloc else None


def slugify(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


SMALL = {"de", "del", "y", "e", "en"}
ART = {"la", "las", "los", "el"}  # en minúscula solo tras "de"/"en" ("de la Selva"), no en "Agraria La Molina"
UPPER = {"VRAEM", "UNI", "II", "III"}


def title_es(s):
    out = []
    for i, w in enumerate((s or "").split()):
        if w in UPPER:
            out.append(w)
        elif i and (w.lower() in SMALL or (w.lower() in ART and out[-1].lower() in ("de", "en"))):
            out.append(w.lower())
        else:
            out.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(out)


def jsonld(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def find(d, pat):
    rx = re.compile(pat, re.I)
    hits = [v for k, v in (d or {}).items() if rx.search(k)]
    if not hits:
        return None
    return {m: sum((num(h.get(m)) or 0) for h in hits) for m in ("pia", "pim", "dev", "recaudado")}


# ---------------------------------------------------------------- modelo
class Uni:
    def __init__(self, u, obs):
        self.u = u
        self.pliego = u["pliego"]
        self.nombre = title_es(u.get("nombre") or "")
        c = (u.get("corto") or "").strip()
        self.sigla = c if c and not c.upper().startswith("U.N.") else None
        self.corto = self.sigla or self.nombre.replace("Universidad Nacional", "U. N.")
        self.depto = title_es(u.get("departamento")) if u.get("departamento") else None
        self.ciudad = u.get("ciudad")
        parcial = obs.get("parcial") or {}
        ys = sorted(u.get("anios", {}), key=int)
        self.years = ys
        self.cerrados = [y for y in ys if y not in parcial]
        self.ult = self.cerrados[-1] if self.cerrados else None
        self.parciales = [y for y in ys if y in parcial]

    def a(self, y):
        return (self.u.get("anios") or {}).get(y) or {}

    def t(self, y, m):
        return num((self.a(y).get("total") or {}).get(m))


def load_slugs(unis):
    path = os.path.join(ROOT, "u", "slugs.json")
    old = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = (json.load(f) or {}).get("slugs", {})
    used, out = set(), {}
    for x in unis:
        s = old.get(x.pliego) or slugify(x.u.get("nombre")) or f"pliego-{x.pliego}"
        if s in used:
            s = f"{s}-{x.pliego}"
        used.add(s)
        out[x.pliego] = s
    return out


# ---------------------------------------------------------------- SVG
def svg_serie(x, ipc):
    """Barras PIM vs devengado por año (nominal). 2026 parcial con trama."""
    rows = [(y, x.t(y, "pim"), x.t(y, "dev")) for y in x.years]
    rows = [r for r in rows if r[1] or r[2]]
    if not rows:
        return ""
    W, H, L, R, T, B = 640, 300, 58, 8, 30, 34
    mx = max(max(p or 0, d or 0) for _, p, d in rows) or 1
    step = 10 ** max(0, len(str(int(mx / 1e6 / 4))) - 1)
    tick = max(step, round(mx / 1e6 / 4 / step) * step) if mx >= 4e6 else max(mx / 1e6 / 4, 0.1)
    top = tick * 1e6 * (int(mx / (tick * 1e6)) + 1)
    pw, ph = W - L - R, H - T - B
    yy = lambda v: T + ph - ph * (v / top)
    g = [f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-labelledby="c1t c1d" preserveAspectRatio="xMidYMid meet">',
         f'<title id="c1t">PIM y devengado por año, {E(x.corto)}</title>',
         f'<desc id="c1d">Barras en millones de soles nominales. {E(rows[0][0])}–{E(rows[-1][0])}.</desc>',
         '<defs><pattern id="hp" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
         '<rect width="3" height="6" class="f-dev"/></pattern></defs>']
    k = 0
    while k * tick * 1e6 <= top + 1:
        v = k * tick * 1e6
        g.append(f'<line class="gl" x1="{L}" x2="{W - R}" y1="{yy(v):.1f}" y2="{yy(v):.1f}"/>'
                 f'<text class="ax" x="{L - 6}" y="{yy(v) + 4:.1f}" text-anchor="end">{k * tick:g}</text>')
        k += 1
    g.append(f'<text class="ax" x="4" y="16">millones de S/</text>')
    n = len(rows)
    slot = pw / n
    bw = min(16, slot * 0.36)
    for i, (y, p, d) in enumerate(rows):
        cx = L + slot * i + slot / 2
        par = y in x.parciales
        if p:
            g.append(f'<rect class="f-pim{" par" if par else ""}" x="{cx - bw - 1:.1f}" y="{yy(p):.1f}" width="{bw:.1f}" '
                     f'height="{T + ph - yy(p):.1f}"><title>{E(y)} PIM {E(fm(p))}</title></rect>')
        if d:
            g.append(f'<rect class="{"f-hp" if par else "f-dev"}" x="{cx + 1:.1f}" y="{yy(d):.1f}" width="{bw:.1f}" '
                     f'height="{T + ph - yy(d):.1f}"{" fill=\"url(#hp)\"" if par else ""}><title>{E(y)} devengado {E(fm(d))}</title></rect>')
        lab = y if n <= 8 or i % 2 == 0 or i == n - 1 else ""
        if lab:
            g.append(f'<text class="ax" x="{cx:.1f}" y="{H - 8}" text-anchor="middle">{E(lab[2:] if n > 8 else lab)}{"*" if par else ""}</text>')
    g.append(f'<line class="bl" x1="{L}" x2="{W - R}" y1="{T + ph}" y2="{T + ph}"/></svg>')
    return "".join(g)


GEN = [("2.1", "Personal", "k1"), ("2.2", "Pensiones", "k2"), ("2.3", "Bienes y servicios", "k3"),
       ("2.6", "Inversión (activos no financieros)", "k5"), ("2.5", "Otros gastos", "k4"),
       ("2.4", "Donaciones y transferencias", "k6"), ("2.8", "Deuda", "k7")]


def gen_parts(a):
    gen = a.get("generica") or {}
    dev = num((a.get("total") or {}).get("dev"))
    parts = []
    for code, lbl, k in GEN:
        v = sum(num(val.get("dev")) or 0 for kk, val in gen.items() if kk.strip().startswith(code))
        if v > 0 and dev:
            parts.append((lbl, k, v, v / dev))
    return parts


def svg_genericas(x, y):
    parts = gen_parts(x.a(y))
    if not parts:
        return ""
    W, H = 640, 44
    g = [f'<svg class="chart stack" viewBox="0 0 {W} {H}" role="img" aria-labelledby="c2t">'
         f'<title id="c2t">Composición del devengado {E(y)} por genérica de gasto</title>']
    xx = 0.0
    tot = sum(p[3] for p in parts) or 1
    for lbl, k, v, s in parts:
        w = W * s / tot
        g.append(f'<rect class="f-{k}" x="{xx:.1f}" y="0" width="{max(w, 0.5):.1f}" height="{H}"><title>{E(lbl)}: {E(fp(s))} ({E(fm(v))})</title></rect>')
        if w > 54:
            g.append(f'<text class="in" x="{xx + 8:.1f}" y="{H / 2 + 6:.1f}">{E(f"{s * 100:.0f} %")}</text>')
        xx += w
    g.append("</svg>")
    legend = "".join(f'<li><i class="sw f-{k}"></i>{E(lbl)} <b>{E(fp(s) if s >= 0.001 else "< 0.1 %")}</b></li>' for lbl, k, v, s in parts)
    return "".join(g) + f'<ul class="legend">{legend}</ul>'


# ---------------------------------------------------------------- textos
def fuentes_txt(a):
    f = a.get("fuente") or {}
    dev = num((a.get("total") or {}).get("dev"))
    lbl = [("ORDINARIOS", "recursos ordinarios del Tesoro (RO)"), ("DIRECTAMENTE", "recursos directamente recaudados (RDR)"),
           ("DETERMINADOS", "recursos determinados (canon, sobrecanon, regalías y otros)"),
           ("DONACIONES", "donaciones y transferencias"), ("CREDITO", "operaciones oficiales de crédito")]
    out = []
    for key, txt in lbl:
        v = sum(num(val.get("dev")) or 0 for kk, val in f.items() if key in kk.upper())
        if v > 0 and dev:
            out.append((v / dev, txt, v))
    out.sort(reverse=True)
    return out


def ranking_info(obs):
    return sum(1 for u in obs["universidades"] if num((u.get("indice") or {}).get("rank")))


def real(v, y, ipc):
    i = num((ipc or {}).get(y))
    return v * 100 / i if num(v) is not None and i else None


def resumen(x, obs, n_rank):
    y = x.ult
    ipc = (obs.get("ipc") or {}).get("indice") or {}
    P = []
    if not y:
        yp = x.parciales[-1] if x.parciales else None
        if yp:
            P.append(f"<p>La {E(x.nombre)} es un pliego presupuestal reciente: aún no tiene un año fiscal cerrado en los datos. "
                     f"En {E(yp)} (parcial, {E((obs.get('parcial') or {}).get(yp, ''))}) su presupuesto modificado (PIM) es "
                     f"<strong>{E(fm(x.t(yp, 'pim')))}</strong> y lleva devengado {E(fm(x.t(yp, 'dev')))} "
                     f"({E(fp(div(x.t(yp, 'dev'), x.t(yp, 'pim'))))}).</p>")
        return "".join(P), {}
    a = x.a(y)
    k = a.get("kpi") or {}
    pia, pim, dev = x.t(y, "pia"), x.t(y, "pim"), x.t(y, "dev")
    ej = div(dev, pim)
    sin = (pim or 0) - (dev or 0)
    # 1. Cuánto tuvo y cuánto gastó
    var_pim = div((pim or 0) - (pia or 0), pia) if pia and pim else None
    inicio = (f"empezó con un presupuesto de apertura (PIA) de <strong>{E(fm(pia))}</strong>. Durante el año se modificó a "
              if pia else "no tuvo presupuesto de apertura (PIA en cero: recibió recursos ya iniciado el año). Durante el año se le asignaron ")
    P.append(f"<p>En <strong>{E(y)}</strong> (último año cerrado), la {E(x.nombre)}{f' ({E(x.sigla)})' if x.sigla else ''} "
             f"{inicio}"
             f"<strong>{E(fm(pim))}</strong> (PIM{f', {E(fp(var_pim))} más que el PIA' if var_pim and var_pim > 0 else (f', {E(fp(-var_pim))} menos que el PIA' if var_pim and var_pim < 0 else '')}) "
             f"y devengó (ejecutó) <strong>{E(fm(dev))}</strong>, es decir, el <strong>{E(fp(ej))}</strong> de su PIM. "
             f"{f'Quedaron sin devengar {E(fm(sin))}.' if sin > 0 and pim else ''}</p>")
    # 2. En qué gasta
    parts = {lbl: s for lbl, _, _, s in gen_parts(a)}
    if parts:
        bits = [f"{E(lbl.lower() if lbl != 'Inversión (activos no financieros)' else 'inversión en obras y equipos (activos no financieros)')} "
                f"<strong>{E(fp(s))}</strong>" for lbl, s in sorted(parts.items(), key=lambda t: -t[1]) if s >= 0.01][:5]
        P.append(f"<p id=\"en-que-gasta\"><strong>¿En qué gasta?</strong> Del devengado {E(y)}: {', '.join(bits)}. "
                 f"La ejecución de su presupuesto de inversión (genérica 2.6) fue {E(fp(k.get('ejec_inversion')))} "
                 f"y la de sus proyectos de inversión, {E(fp(k.get('ejec_proyectos')))}.</p>")
    # 3. De dónde viene
    fu = fuentes_txt(a)
    if fu:
        bits = [f"{E(t)} <strong>{E(fp(s))}</strong>" for s, t, _ in fu if s >= 0.005]
        P.append(f"<p id=\"financiamiento\"><strong>¿De dónde viene el dinero?</strong> Por fuente de financiamiento, el devengado {E(y)} se pagó con "
                 f"{', '.join(bits)}.</p>")
    # 4. Cuánto recauda
    ing = a.get("ingresos") or {}
    rs = ing.get("rdr_sin_saldos") or {}
    rec = num(rs.get("recaudado"))
    if rec == 0 and not num(rs.get("pim")):
        P.append(f"<p id=\"recauda\"><strong>¿Cuánto recauda?</strong> En {E(y)} no registra recaudación de recursos propios (RDR).</p>")
    elif rec is not None:
        rp = num(rs.get("pim"))
        P.append(f"<p id=\"recauda\"><strong>¿Cuánto recauda?</strong> En {E(y)} captó <strong>{E(fm(rec))}</strong> de recursos propios "
                 f"(RDR: matrículas, servicios, venta de bienes, etc., sin contar saldos de balance de años anteriores)"
                 f"{f', el {E(fp(div(rec, rp), 0))} de lo previsto en su PIM de ingresos RDR ({E(fm(rp))})' if rp else ''}.</p>")
    else:
        P.append(f"<p id=\"recauda\"><strong>¿Cuánto recauda?</strong> Recursos propios (RDR) {E(y)}: {SD}.</p>")
    # 5. Investigación
    if num(k.get("idi_pim")):
        P.append(f"<p id=\"investigacion\"><strong>Investigación.</strong> Al programa presupuestal 0137 (ciencia, tecnología e innovación) le asignó "
                 f"{E(fm(k.get('idi_pim')))} de PIM ({E(fp(k.get('pct_idi')))} de su presupuesto) y devengó "
                 f"{E(fm(k.get('idi_dev')))} ({E(fp(k.get('ejec_idi')))}). Es un indicador aproximado: no incluye investigación "
                 f"financiada desde otros programas.</p>")
    elif a.get("programa"):
        P.append(f"<p id=\"investigacion\"><strong>Investigación.</strong> En {E(y)} no registra presupuesto en el programa 0137 (ciencia, tecnología e "
                 f"innovación). Puede financiar investigación desde otros programas (p. ej. con canon), que este indicador no capta.</p>")
    else:
        P.append(f"<p id=\"investigacion\"><strong>Investigación.</strong> Programa 0137 en {E(y)}: {SD}.</p>")
    # 6. Gasto por estudiante
    est = num(a.get("estudiantes"))
    gpe = num(k.get("gasto_por_estudiante"))
    if est and gpe:
        ea = a.get("estudiantes_anio") or y
        P.append(f"<p><strong>Gasto por estudiante.</strong> Con {E(fn(est))} matriculados (SIRIES-MINEDU, matrícula de {E(ea)}), "
                 f"el devengado {E(y)} equivale a unos <strong>{E(fs(gpe))}</strong> por estudiante al año. Es una división "
                 f"simple: incluye pensiones, obras e investigación, y la matrícula suma pregrado y posgrado.</p>")
    else:
        P.append(f"<p><strong>Gasto por estudiante.</strong> Sin dato (no hay matrícula SIRIES reciente para esta universidad).</p>")
    # 7. Índice referencial
    ix = x.u.get("indice") or {}
    if num(ix.get("rank")):
        P.append(f"<p><strong>Índice referencial.</strong> Ocupa el puesto <strong>{E(ix['rank'])} de {E(n_rank)}</strong> "
                 f"(puntaje {E(ix.get('score'))}/100) en el índice de gestión presupuestal de este observatorio, calculado con "
                 f"{E(', '.join(ix.get('ventana') or []))}. Es un índice <em>referencial, no oficial</em>: combina ejecución, "
                 f"inversión, investigación y recursos propios; no mide calidad académica.</p>")
    else:
        P.append("<p><strong>Índice referencial.</strong> No figura en el índice (no tiene suficientes años cerrados con datos).</p>")
    # 8. Subió o bajó en soles reales
    base = "2016" if x.t("2016", "dev") else next((yy for yy in x.cerrados if x.t(yy, "dev")), None)
    rb, rl = real(x.t(base, "dev"), base, ipc) if base else None, real(dev, y, ipc)
    if base and base != y and rb and rl:
        ch = rl / rb - 1
        verbo = "creció" if ch > 0.02 else ("cayó" if ch < -0.02 else "se mantuvo casi igual")
        P.append(f"<p><strong>¿Subió o bajó?</strong> Descontando la inflación (soles de 2025, IPC Lima del BCRP), su gasto devengado "
                 f"{verbo}: de {E(fm(rb))} en {E(base)} a {E(fm(rl))} en {E(y)} "
                 f"(<strong>{'+' if ch > 0 else '−' if ch < 0 else ''}{E(fp(abs(ch)))}</strong> real).</p>")
    # 9. 2026 parcial
    for yp in x.parciales:
        P.append(f"<p><strong>{E(yp)} (parcial, {E((obs.get('parcial') or {}).get(yp, ''))}).</strong> PIM {E(fm(x.t(yp, 'pim')))}; "
                 f"devengado acumulado {E(fm(x.t(yp, 'dev')))} ({E(fp(div(x.t(yp, 'dev'), x.t(yp, 'pim'))))}). "
                 f"El año aún no termina: no comparar su ejecución con años cerrados.</p>")
    # 10. Expectativa 2027
    e = x.u.get("expectativa_2027")
    xo = obs.get("expectativa_2027") or {}
    if isinstance(e, dict) and (num(e.get("pia_2027")) is not None):
        v = str(xo.get("version") or "").lower()
        vlbl = {"proyecto": "proyecto de ley", "dictamen": "dictamen", "autografa": "autógrafa", "ley": "ley publicada"}.get(v, "documento")
        vv = div((num(e.get("pia_2027")) or 0) - (num(e.get("pia_2026")) or 0), num(e.get("pia_2026"))) if num(e.get("pia_2026")) else None
        P.append(f"<p id=\"exp-2027\"><strong>2027 esperado.</strong> Según el {E(vlbl)} de presupuesto 2027{f' ({E(xo.get('norma'))})' if xo.get('norma') else ''}, "
                 f"su PIA 2027 sería <strong>{E(fm(e.get('pia_2027')))}</strong>"
                 f"{f' frente a {E(fm(e.get('pia_2026')))} de PIA 2026 ({'+' if vv > 0 else '−' if vv < 0 else ''}{E(fp(abs(vv)))})' if vv is not None else ''}."
                 f"{'' if v == 'ley' else ' Cifras sujetas a cambio.'}</p>")
    facts = {"y": y, "pia": pia, "pim": pim, "dev": dev, "ej": ej}
    return "".join(P), facts


def transferencias_html(x):
    items = []
    for y in ([x.ult] if x.ult else []) + x.parciales:
        for t in (x.a(y).get("transferencias") or []):
            if isinstance(t, dict):
                items.append((y, t))
    if not items:
        return ""
    li = []
    for y, t in sorted(items, key=lambda p: str(p[1].get("fecha") or p[0])):
        u = safe_url(t.get("url"))
        norma = E(t.get("norma") or "Norma")
        norma = f'<a href="{E(u)}" rel="noopener nofollow">{norma}</a>' if u else norma
        li.append(f'<li><span>{norma} <small>{E(t.get("fecha") or y)}</small></span><b>{E(fm(t.get("monto")))}</b>'
                  f'{f"<br><small>{E(t.get("finalidad"))}</small>" if t.get("finalidad") else ""}</li>')
    return f'<section id="transferencias"><h2>Transferencias y normas</h2><ul class="tlist">{"".join(li)}</ul></section>'


def tabla(x, obs):
    ipc = (obs.get("ipc") or {}).get("indice") or {}
    rows = []
    for y in x.years:
        pia, pim, dev = x.t(y, "pia"), x.t(y, "pim"), x.t(y, "dev")
        if not (pia or pim or dev):
            continue
        par = y in x.parciales
        rows.append(f'<tr{" class=par" if par else ""}><th scope="row">{E(y)}{"*" if par else ""}</th><td>{E(fm(pia))}</td>'
                    f'<td>{E(fm(pim))}</td><td>{E(fm(dev))}</td><td>{E(fp(div(dev, pim)))}</td><td>{E(fm(real(dev, y, ipc)))}</td></tr>')
    pz = ", ".join(f"{y}: {(obs.get('parcial') or {}).get(y, '')}" for y in x.parciales)
    return (f'<div class="tw"><table><caption>Serie anual del presupuesto de gasto (soles)</caption><thead><tr>'
            f'<th scope="col">Año</th><th scope="col">PIA</th><th scope="col">PIM</th><th scope="col">Devengado</th>'
            f'<th scope="col">% ejec.</th><th scope="col">Dev. en S/ de 2025</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>'
            f'<p class="note">{f"* Año parcial ({E(pz)}). " if pz else ""}Montos nominales salvo la última columna, '
            f'deflactada con el IPC Lima (BCRP), base 2025.</p>')


# ---------------------------------------------------------------- plantilla
def head(title, desc, canon, og, extra=""):
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
{GTM}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{E(canon)}">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#26346F">
<meta property="og:type" content="article">
<meta property="og:locale" content="es_PE">
<meta property="og:site_name" content="{E(SITE)}">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{E(canon)}">
<meta property="og:image" content="{E(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{E(title)}">
<meta name="twitter:description" content="{E(desc)}">
<meta name="twitter:image" content="{E(og)}">
<link rel="icon" href="{{R}}assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="{{R}}assets/brand/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="{{R}}assets/brand/favicon-180.png">
{FONTS}
<link rel="stylesheet" href="{{U}}u.css">
{THEME_JS}
{extra}</head>
"""


# Navegación = la de index.html (mismos id de sección). Se enlaza a <R>#<id>.
SECCIONES = [("resumen", "1", "Resumen nacional"), ("variacion", "2", "¿Subió o bajó?"), ("ranking", "3", "Ranking"),
             ("trayectoria", "4", "Empezaron y terminaron"), ("expectativa", "4", "Expectativa 2027"),
             ("gasto", "5", "¿En qué gastan?"), ("fuentes", "6", "¿De dónde viene?"), ("infra", "7", "Infraestructura"),
             ("idi", "8", "Investigación"), ("ficha", "9", "Ficha y comparador"), ("mapa", "10", "Mapa"),
             ("metodologia", "11", "Metodología")]
HAS_EXP = [True]


def topbar(R):
    li = "".join(f'<li><a href="{R}#{i}"><span class="n">{n}</span>{E(t)}</a></li>'
                 for i, n, t in SECCIONES if i != "expectativa" or HAS_EXP[0])
    li += (f'<li class="nav-ext"><a href="{R}historias.html"><span class="n">→</span>Historias</a></li>'
           f'<li class="nav-ext"><a href="{R}u/" aria-current="true"><span class="n">→</span>Universidades (A-Z)</a></li>')
    return (f'<a class="skip" href="#main">Saltar al contenido</a>'
            f'<header class="topbar"><div class="topbar-row"><a class="brand" href="{R}" aria-label="Inicio: Radiografía Presupuestal">'
            f'<img src="{R}assets/brand/logo-mark.svg" alt="" width="28" height="28"><span class="brand-txt"><strong>Radiografía Presupuestal</strong>'
            f'<span class="brand-sub">Universidades públicas del Perú</span></span></a></div>'
            f'<nav class="nav" aria-label="Secciones del observatorio"><ol>{li}</ol></nav></header>')


def footer(obs, R):
    fu = []
    for f in obs.get("fuentes") or []:
        u = safe_url(f.get("url"))
        nm = E(f.get("nombre"))
        fu.append(f'<li><a href="{E(u)}" rel="noopener">{nm}</a></li>' if u else f"<li>{nm}</li>")
    ipc = obs.get("ipc") or {}
    iu = safe_url(ipc.get("url"))
    if ipc:
        fu.append(f'<li>{f"<a href=\"{E(iu)}\" rel=\"noopener\">" if iu else ""}BCRP · IPC Lima{"</a>" if iu else ""} '
                  f'(deflactor, base 2025)</li>')
    return (f'<footer class="foot" id="fuentes-datos"><h2>Fuentes y advertencias</h2><ul class="src">{"".join(fu)}</ul>'
            f'<p>Montos en soles corrientes (nominales) salvo que se indique "soles de 2025". PIA = presupuesto inicial de apertura; '
            f'PIM = presupuesto modificado; devengado = gasto reconocido (ejecución). Recursos determinados incluye canon, '
            f'sobrecanon y regalías. El índice es referencial y no oficial. "{SD}" = el dato no está disponible en las fuentes; no equivale a cero.</p>'
            f'<p>Datos generados el {E((obs.get("generado") or "")[:10])}. Observatorio cívico independiente; no es una publicación oficial del MEF ni de las universidades. '
            f'<a href="{R}">Volver al observatorio</a></p></footer>')


def page_uni(x, obs, slugs, by_dep, n_rank):
    slug = slugs[x.pliego]
    R, U = "../../", "../"
    canon = f"{BASE}u/{slug}/"
    og = f"{BASE}assets/og/u/{slug}.png"
    body_res, f = resumen(x, obs, n_rank)
    ys = [y for y in x.years if x.t(y, "pim") or x.t(y, "dev")]
    span = f"{ys[0]}–{ys[-1]}" if ys else ""
    nm = x.sigla or x.nombre
    if f:
        y = f["y"]
        title = f"Presupuesto {x.nombre}{f' ({x.sigla})' if x.sigla else ''} {y}: {fm(f['pim'])}"
        desc = (f"¿Cuánto gasta la {nm}? En {y} tuvo un presupuesto (PIM) de {fm(f['pim'])} y ejecutó {fm(f['dev'])} "
                f"({fp(f['ej'])}). Planilla, inversión, investigación, ingresos propios y serie {span}. Datos MEF.")
    else:
        yp = x.parciales[-1] if x.parciales else ""
        title = f"Presupuesto {x.nombre} {yp}: {fm(x.t(yp, 'pim'))}"
        desc = f"Presupuesto de la {x.nombre} {yp}: PIM {fm(x.t(yp, 'pim'))}, devengado parcial {fm(x.t(yp, 'dev'))}. Datos MEF."
    ld = [{
        "@context": "https://schema.org", "@type": "CollegeOrUniversity", "name": x.nombre,
        **({"alternateName": x.sigla} if x.sigla else {}),
        "url": canon,
        "address": {"@type": "PostalAddress", "addressCountry": "PE",
                    **({"addressLocality": x.ciudad} if x.ciudad else {}), **({"addressRegion": x.depto} if x.depto else {})},
        **({"foundingDate": str(x.u["creacion"])} if num(x.u.get("creacion")) else {}),
        **({"geo": {"@type": "GeoCoordinates", "latitude": x.u["lat"], "longitude": x.u["lng"]}}
           if num(x.u.get("lat")) and num(x.u.get("lng")) else {}),
    }, {
        "@context": "https://schema.org", "@type": "Dataset",
        "name": f"Presupuesto y ejecución de la {x.nombre} {span}",
        "description": desc, "url": canon, "inLanguage": "es",
        "temporalCoverage": f"{ys[0]}/{ys[-1]}" if ys else None,
        "spatialCoverage": {"@type": "Place", "name": ", ".join(p for p in (x.ciudad, x.depto, "Perú") if p)},
        "isBasedOn": [safe_url(s.get("url")) for s in obs.get("fuentes") or [] if safe_url(s.get("url"))],
        "creator": {"@type": "Organization", "name": SITE, "url": BASE},
        "variableMeasured": ["PIA", "PIM", "Devengado", "Porcentaje de ejecución"],
        "dateModified": (obs.get("generado") or "")[:10],
    }, {
        "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": SITE, "item": BASE},
            {"@type": "ListItem", "position": 2, "name": "Universidades", "item": BASE + "u/"},
            {"@type": "ListItem", "position": 3, "name": x.nombre, "item": canon}]}]
    ld[1] = {k: v for k, v in ld[1].items() if v is not None}
    extra = f'<script type="application/ld+json">{jsonld(ld)}</script>\n'
    h = head(title, desc, canon, og, extra).replace("{R}", R).replace("{U}", U)

    meta = " · ".join(E(p) for p in (x.ciudad, x.depto, f"creada en {x.u['creacion']}" if num(x.u.get("creacion")) else None,
                                      x.u.get("licencia")) if p)
    kp = ""
    if f:
        kp = (f'<div class="kpis"><div><span>PIA {E(f["y"])}</span><b>{E(fm(f["pia"]))}</b></div>'
              f'<div><span>PIM {E(f["y"])}</span><b class="c-pim">{E(fm(f["pim"]))}</b></div>'
              f'<div><span>Devengado</span><b class="c-dev">{E(fm(f["dev"]))}</b></div>'
              f'<div><span>Ejecución</span><b>{E(fp(f["ej"]))}</b></div></div>')
    gen = svg_genericas(x, x.ult) if x.ult else ""
    pares = [o for o in by_dep.get(x.depto, []) if o.pliego != x.pliego]
    dep_html = ""
    if pares:
        dep_html = (f'<section id="mismo-departamento"><h2>Otras universidades públicas de {E(x.depto)}</h2><ul class="ulist">'
                    + "".join(f'<li><a href="../{E(slugs[o.pliego])}/">{E(o.nombre)}</a></li>' for o in pares) + "</ul></section>")
    body = f"""<body>
{topbar(R)}
<main id="main" tabindex="-1">
<nav class="crumbs" aria-label="Ruta"><a href="{R}">Inicio</a> › <a href="../">Universidades</a> › <span>{E(nm)}</span></nav>
<h1>Presupuesto de la {E(x.nombre)}{f' <span class="sig">({E(x.sigla)})</span>' if x.sigla else ''}</h1>
<p class="meta">{meta} · Pliego {E(x.pliego)}</p>
{kp}
<a class="cta" href="{R}#u={E(x.pliego)}">Ver ficha interactiva →</a>
@@TOC@@
<section class="txt" id="resumen-u"><h2>Resumen en lenguaje llano</h2>{body_res}</section>
<section id="evolucion"><h2>PIM y devengado por año</h2>
<p class="legend-i"><i class="sw f-pim"></i>PIM <i class="sw f-dev"></i>Devengado{' <i class="sw f-hp2"></i>parcial' if x.parciales else ''}</p>
{svg_serie(x, obs)}
</section>
{f'<section id="gasto-u"><h2>¿En qué se gastó? Devengado {E(x.ult)}</h2>{gen}</section>' if gen else ''}
<section id="serie"><h2>Serie {E(span)}</h2>{tabla(x, obs)}</section>
{transferencias_html(x)}
{dep_html}
<section class="more"><a class="cta alt" href="{R}#u={E(x.pliego)}">Ficha interactiva</a><a class="cta alt" href="{R}historias.html">Historias</a><a class="cta alt" href="../">Todas las universidades</a></section>
</main>
{footer(obs, R)}
</body>
</html>
"""
    toc = [("resumen-u", "Resumen"), ("en-que-gasta", "¿En qué gasta?"), ("financiamiento", "¿De dónde viene?"),
           ("recauda", "¿Cuánto recauda?"), ("investigacion", "Investigación"), ("exp-2027", "2027 esperado"),
           ("evolucion", "Gráfico PIM y devengado"), ("gasto-u", "Composición del gasto"), ("serie", "Serie anual"),
           ("transferencias", "Transferencias"), ("mismo-departamento", "Mismo departamento"), ("fuentes-datos", "Fuentes")]
    probe = body + footer(obs, R)
    items = "".join(f'<li><a href="#{i}">{E(t)}</a></li>' for i, t in toc if f'id="{i}"' in probe)
    body = body.replace("@@TOC@@", f'<nav class="enpagina" aria-label="En esta página"><h2>En esta página</h2><ol>{items}</ol></nav>')
    return h + body


def page_index(unis, obs, slugs, by_dep):
    R, U = "../", ""
    canon = BASE + "u/"
    yl = max((x.ult for x in unis if x.ult), key=int)
    title = f"Presupuesto de las {len(unis)} universidades públicas del Perú, por departamento"
    desc = (f"Lista A-Z de las {len(unis)} universidades públicas del Perú con su presupuesto (PIM) y ejecución {yl}: "
            f"cuánto recibe y cuánto gasta cada una, con datos del MEF.")
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": title, "numberOfItems": len(unis),
          "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{BASE}u/{slugs[x.pliego]}/", "name": x.nombre}
                              for i, x in enumerate(sorted(unis, key=lambda z: z.nombre))]}
    h = head(title, desc, canon, BASE + "assets/og/og.png",
             f'<script type="application/ld+json">{jsonld(ld)}</script>\n').replace("{R}", R).replace("{U}", U)
    secs = []
    deps = sorted(by_dep, key=lambda d: (d is None, slugify(d or "")))
    toc = " · ".join(f'<a href="#{E(slugify(d or "sin-departamento"))}">{E(d or "Sin departamento")}</a>' for d in deps)
    for d in deps:
        li = []
        for x in sorted(by_dep[d], key=lambda z: z.nombre):
            y = x.ult or (x.parciales[-1] if x.parciales else None)
            par = "*" if y in x.parciales else ""
            q = slugify(" ".join(filter(None, (x.nombre, x.sigla, d, x.ciudad)))).replace("-", " ")
            li.append(f'<li data-q="{E(q)}" data-n="{E(slugify(x.nombre))}" data-pim="{x.t(y, "pim") or 0:.0f}"><a href="{E(slugs[x.pliego])}/">{E(x.nombre)}</a>{f" <small>({E(x.sigla)})</small>" if x.sigla else ""}'
                      f'<span class="r">PIM {E(y)}{par}: {E(fm(x.t(y, "pim")))} · ejec. {E(fp(div(x.t(y, "dev"), x.t(y, "pim")), 0))}</span></li>')
        secs.append(f'<section class="dep" id="{E(slugify(d or "sin-departamento"))}"><h2>{E(d or "Sin departamento registrado")} '
                    f'<small>({len(by_dep[d])})</small></h2><ul class="ulist idx">{"".join(li)}</ul></section>')
    body = f"""<body>
{topbar(R)}
<main id="main" tabindex="-1">
<nav class="crumbs" aria-label="Ruta"><a href="{R}">Inicio</a> › <span>Universidades</span></nav>
<h1>Universidades públicas del Perú: presupuesto por universidad</h1>
<p class="lead">{len(unis)} universidades públicas (pliegos del sector Educación). Para cada una: cuánto recibió (PIA, PIM), cuánto ejecutó
(devengado), en qué gasta, de dónde viene el dinero, cuánto recauda e investigación, con datos del MEF. Año de referencia {E(yl)} (último cerrado);
* = universidad creada recientemente, solo con datos parciales de {E(", ".join(obs.get("parcial") or {}))}.</p>
<div class="tools" id="tools" hidden>
<label class="srch"><span>Buscar</span><input id="q" type="search" placeholder="Nombre, sigla o departamento" autocomplete="off"></label>
<label class="ord"><span>Ordenar</span><select id="ord"><option value="dep">Por departamento</option><option value="n">Por nombre (A-Z)</option><option value="pim">Por PIM (mayor a menor)</option></select></label>
<p class="cnt" id="cnt" aria-live="polite"></p>
</div>
<p class="toc" id="toc">{toc}</p>
<div id="grp">{"".join(secs)}</div>
<section id="flat" hidden><ul class="ulist idx" id="flatul"></ul></section>
<p id="nores" class="note" hidden>Ninguna universidad coincide con la búsqueda.</p>
<script>{INDEX_JS}</script>
<section class="more"><a class="cta alt" href="{R}">Observatorio interactivo</a><a class="cta alt" href="{R}historias.html">Historias</a></section>
</main>
{footer(obs, R)}
</body>
</html>
"""
    return h + body


# ---------------------------------------------------------------- OG
def og_svg(x):
    name = x.sigla or x.nombre
    if x.sigla:
        lines, fsz = [x.sigla], 120 if len(x.sigla) <= 8 else 92
        sub = x.nombre
    else:
        words, lines, cur = x.nombre.replace("Universidad Nacional", "U. N.").split(), [], ""
        for w in words:
            if len(cur) + len(w) + 1 > 24 and cur:
                lines.append(cur)
                cur = w
            else:
                cur = (cur + " " + w).strip()
        lines.append(cur)
        lines = lines[:3]
        fsz, sub = 64, ""
    sub_lines = []
    if sub:
        cur = ""
        for w in sub.split():
            if len(cur) + len(w) + 1 > 52 and cur:
                sub_lines.append(cur)
                cur = w
            else:
                cur = (cur + " " + w).strip()
        sub_lines.append(cur)
        sub_lines = sub_lines[:2]
    y = x.ult or (x.parciales[-1] if x.parciales else "")
    par = " (parcial)" if y in x.parciales else ""
    pim, dev = x.t(y, "pim"), x.t(y, "dev")
    F = "font-family=\"'Plus Jakarta Sans', Arial, sans-serif\""
    S = "font-family=\"'Bricolage Grotesque', 'Plus Jakarta Sans', Arial, sans-serif\""
    t = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">',
         '<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#2B323E" stroke-width="1"/></pattern></defs>',
         '<rect width="1200" height="630" fill="#1B2230"/><rect width="1200" height="630" fill="url(#g)"/>',
         f'<text x="70" y="92" {F} font-size="26" fill="#E0A447" letter-spacing="3">PRESUPUESTO {E(y)}{E(par.upper())} · DATOS MEF</text>']
    yy = 92 + fsz + 20
    for ln in lines:
        t.append(f'<text x="70" y="{yy}" {S} font-size="{fsz}" font-weight="800" fill="#E9E6DF">{E(ln)}</text>')
        yy += int(fsz * 1.08)
    for ln in sub_lines:
        t.append(f'<text x="70" y="{yy - fsz // 2 + 30}" {F} font-size="30" fill="#C6CCF5">{E(ln)}</text>')
        yy += 38
    t.append(f'<text x="70" y="470" {F} font-size="30" fill="#9BA3B1">PIM</text>'
             f'<text x="70" y="535" {F} font-size="64" font-weight="700" fill="#C6CCF5">{E(fm(pim))}</text>'
             f'<text x="640" y="470" {F} font-size="30" fill="#9BA3B1">Devengado ({E(fp(div(dev, pim), 0))})</text>'
             f'<text x="640" y="535" {F} font-size="64" font-weight="700" fill="#E0A447">{E(fm(dev))}</text>'
             f'<text x="70" y="595" {F} font-size="24" fill="#9BA3B1">unimauro.github.io/presupuesto-universidades · Radiografía Presupuestal</text>'
             '</svg>')
    return "".join(t)


def render_og(jobs):
    exe = shutil.which("rsvg-convert")
    if not exe:
        print("  (sin rsvg-convert: no se generan PNG OG)")
        return 0

    def one(j):
        svg, png = j
        r = subprocess.run([exe, "-w", "1200", "-h", "630", "-o", png], input=svg.encode("utf-8"), capture_output=True)
        return r.returncode == 0

    with ThreadPoolExecutor(max_workers=6) as ex:
        return sum(ex.map(one, jobs))


# ---------------------------------------------------------------- main
INDEX_JS = "(function(){var $=function(i){return document.getElementById(i)},L=[].slice.call(document.querySelectorAll('#grp li[data-q]')),\nH=L.map(function(li){return li.parentNode}),q=$('q'),o=$('ord'),N=function(t){return t.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()};\n$('tools').hidden=false;\nfunction run(){var t=N(q.value),m=o.value,n=0,flat=m!=='dep';\nL.forEach(function(li){var ok=!t||t.split(' ').every(function(w){return li.dataset.q.indexOf(w)>=0});li.hidden=!ok;if(ok)n++});\nif(flat){var s=L.slice().sort(m==='pim'?function(a,b){return b.dataset.pim-a.dataset.pim}:function(a,b){return a.dataset.n<b.dataset.n?-1:1});\ns.forEach(function(li){$('flatul').appendChild(li)})}else{L.forEach(function(li,i){H[i].appendChild(li)});\n[].forEach.call(document.querySelectorAll('#grp section.dep'),function(sec){sec.hidden=!sec.querySelector('li:not([hidden])')})}\n$('grp').hidden=flat;$('flat').hidden=!flat;$('toc').hidden=flat||!!t;$('nores').hidden=n>0;\n$('cnt').textContent=n+' de '+L.length+' universidades';\ntry{var u=new URL(location);t?u.searchParams.set('q',q.value):u.searchParams.delete('q');m!=='dep'?u.searchParams.set('orden',m):u.searchParams.delete('orden');history.replaceState(null,'',u)}catch(e){}}\nvar p=new URLSearchParams(location.search);if(p.get('q'))q.value=p.get('q');if(/^(n|pim)$/.test(p.get('orden')||''))o.value=p.get('orden');\nq.addEventListener('input',run);o.addEventListener('change',run);run()})();"

CSS_PATH = os.path.join(ROOT, "u", "u.css")


def main():
    sin_og = "--sin-og" in sys.argv
    with open(os.path.join(ROOT, "data", "observatorio.json"), encoding="utf-8") as f:
        obs = json.load(f)
    unis = [Uni(u, obs) for u in obs["universidades"]]
    slugs = load_slugs(unis)
    by_dep = {}
    for x in unis:
        by_dep.setdefault(x.depto, []).append(x)
    for v in by_dep.values():
        v.sort(key=lambda z: z.nombre)
    n_rank = ranking_info(obs)
    HAS_EXP[0] = bool(obs.get("expectativa_2027"))
    os.makedirs(os.path.join(ROOT, "u"), exist_ok=True)
    og_dir = os.path.join(ROOT, "assets", "og", "u")
    os.makedirs(og_dir, exist_ok=True)

    sizes, jobs = [], []
    for x in unis:
        d = os.path.join(ROOT, "u", slugs[x.pliego])
        os.makedirs(d, exist_ok=True)
        s = page_uni(x, obs, slugs, by_dep, n_rank)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(s)
        sizes.append(len(s.encode("utf-8")))
        jobs.append((og_svg(x), os.path.join(og_dir, slugs[x.pliego] + ".png")))
    with open(os.path.join(ROOT, "u", "index.html"), "w", encoding="utf-8") as f:
        f.write(page_index(unis, obs, slugs, by_dep))
    with open(os.path.join(ROOT, "u", "slugs.json"), "w", encoding="utf-8") as f:
        json.dump({"patron": "u/<slug>/  (slug = nombre oficial sin tildes, minúsculas, guiones; estable)",
                   "base": BASE, "generado": obs.get("generado"),
                   "slugs": dict(sorted(slugs.items()))}, f, ensure_ascii=False, indent=1)

    lastmod = (obs.get("generado") or "")[:10]
    urls = [BASE, BASE + "historias.html", BASE + "u/"] + [f"{BASE}u/{slugs[x.pliego]}/" for x in sorted(unis, key=lambda z: z.pliego)]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sm.append(f"  <url><loc>{E(u)}</loc><lastmod>{lastmod}</lastmod></url>")
    sm.append("</urlset>\n")
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sm))
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"# Nota: en GitHub Pages de proyecto Google solo lee /robots.txt del dominio raíz;\n"
                f"# registrar el sitemap en Search Console.\nUser-agent: *\nAllow: /\n\nSitemap: {BASE}sitemap.xml\n")
    n_og = 0 if sin_og else render_og(jobs)
    print(f"OK {len(unis)} páginas en u/<slug>/ + u/index.html · tamaño máx {max(sizes) / 1024:.1f} KB, "
          f"medio {sum(sizes) / len(sizes) / 1024:.1f} KB · OG png: {n_og} · sitemap {len(urls)} URLs")


if __name__ == "__main__":
    main()
