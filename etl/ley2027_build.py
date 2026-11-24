#!/usr/bin/env python3
"""
ETL LEY2027 — Expectativa presupuestal 2027 de las universidades públicas.

Fuente base: Proyecto de Ley de Presupuesto del Sector Público para el Año Fiscal 2027
(Proposición Legislativa 00002-2026-2031-CR, Oficio 242-2026-PR, 28-ago-2026), anexos 4, 5 y 8
publicados por el MEF. Disposiciones: texto sustitutorio del dictamen de la Comisión Bicameral de
Presupuesto (aprobado 5-nov-2026), que el Pleno aprobó con cambios el 20-nov-2026 (autógrafa aún
sin anexos públicos al 23-nov-2026).

Uso (venv fuera del repo):
    python3 -m venv ~/.venvs/pu-ley2027 && ~/.venvs/pu-ley2027/bin/pip install pdfplumber pypdf
    ~/.venvs/pu-ley2027/bin/python etl/ley2027_build.py            # descarga si falta + construye
    ~/.venvs/pu-ley2027/bin/python etl/ley2027_build.py --offline  # solo usa etl/cache/ley2027

Salida: data/ley2027/ley2027.json (montos en soles).
"""
import json
import re
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
import pypdf

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "etl" / "cache" / "ley2027"
OUT = ROOT / "data" / "ley2027" / "ley2027.json"
GASTO = ROOT / "data" / "gasto" / "gasto.json"

MEF = "https://www.mef.gob.pe/contenidos/presu_publ/sectr_publ/proy_2027"
DOCS = {
    "PL_Presupuesto_SP_2027.pdf": (f"{MEF}/PL_Presupuesto_SP_2027.pdf",
                                   "Proyecto de Ley de Presupuesto 2027 (texto)", "proyecto"),
    "EM_PL_Presupuesto_SP_2027.pdf": (f"{MEF}/EM_PL_Presupuesto_SP_2027.pdf",
                                      "Exposición de motivos del Proyecto de Ley 2027", "proyecto"),
    "Anexo_4.pdf": (f"{MEF}/Anexos/Anexo_4.pdf",
                    "Anexo 4: gasto por niveles de gobierno, pliegos y fuentes de financiamiento", "anexo"),
    "Anexo_5.pdf": (f"{MEF}/Anexos/Anexo_5.pdf",
                    "Anexo 5: gasto por pliegos del GN a nivel de productos, proyectos y actividades", "anexo"),
    "Anexo_8.pdf": (f"{MEF}/Anexos/Anexo_8.pdf",
                    "Anexo 8: gasto por programas presupuestales y pliegos", "anexo"),
    "Dictamen_PL00002_LP.pdf": (
        "https://img.lpderecho.pe/wp-content/uploads/2026/11/PL-00002-2026-2031-CR-LP-Derecho.pdf",
        "Dictamen de la Comisión Bicameral de Presupuesto (5-nov-2026) con texto sustitutorio "
        "(copia difundida por LP Derecho)", "dictamen"),
}
OTROS_DOCS = [
    {"titulo": "Nota de prensa del Congreso: Pleno aprueba la Ley de Presupuesto 2027 (20-nov-2026)",
     "url": "https://comunicaciones.congreso.gob.pe/noticias/pleno-del-congreso-aprueba-la-ley-de-presupuesto-del-sector-publico-para-el-ano-fiscal-2027/",
     "tipo": "nota_prensa"},
    {"titulo": "Guía de orientación al ciudadano del Proyecto de Presupuesto 2027 (MEF)",
     "url": "https://www.mef.gob.pe/pl-guia-presupuesto-publico-2027/Guia_Orientacion_Ciudadano_PL_2027.pdf",
     "tipo": "guia"},
]
UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36"

FUENTES = ["RECURSOS ORDINARIOS", "RECURSOS DIRECTAMENTE RECAUDADOS",
           "RECURSOS POR OPERACIONES OFICIALES DE CREDITO", "DONACIONES Y TRANSFERENCIAS",
           "RECURSOS DETERMINADOS", "TOTAL"]
# Bordes derechos (x1, puntos PDF) de las columnas del Anexo 4 (FPR40D13, 27/08/2026).
COL_EDGES = [450, 512, 565, 632, 695, 10_000]

PP_CODIGOS = {
    "FORMACION UNIVERSITARIA DE PREGRADO": "0066",
    "DESARROLLO DE LA CIENCIA, TECNOLOGIA E INNOVACION TECNOLOGICA": "0137",
    "REDUCCION DE VULNERABILIDAD Y ATENCION DE EMERGENCIAS POR DESASTRES": "0068",
}
GENERICAS = {
    "1": "2.1 PERSONAL Y OBLIGACIONES SOCIALES", "2": "2.2 PENSIONES Y OTRAS PRESTACIONES SOCIALES",
    "3": "2.3 BIENES Y SERVICIOS", "4": "2.4 DONACIONES Y TRANSFERENCIAS", "5": "2.5 OTROS GASTOS",
    "6": "2.6 ADQUISICION DE ACTIVOS NO FINANCIEROS", "7": "2.7 ADQUISICION DE ACTIVOS FINANCIEROS",
    "8": "2.8 SERVICIO DE LA DEUDA PUBLICA",
}
ES_UNIV = re.compile(r"^(U\.N\.|UNIVERSIDAD)")
AMT_TAIL = re.compile(r"^(.*?)\s+(\d{1,3}(?: \d{3})+|\d{1,3})\s*$")


def num(s):
    return int(s.replace(" ", ""))


def descargar(offline):
    CACHE.mkdir(parents=True, exist_ok=True)
    for f, (url, _, _) in DOCS.items():
        p = CACHE / f
        if p.exists() and p.stat().st_size > 1000 and p.read_bytes()[:4] == b"%PDF":
            continue
        if offline:
            sys.exit(f"Falta {p} (modo --offline)")
        print("descargando", url)
        subprocess.run(["curl", "-sL", "-A", UA, "-m", "600", "-o", str(p), url], check=True)
        if p.read_bytes()[:4] != b"%PDF":
            sys.exit(f"{url} no devolvió un PDF (¿Incapsula/404?)")


# ---------------------------------------------------------------- Anexo 4
def parse_anexo4():
    """Filas (en orden) de pliegos del Gobierno Nacional: [(codigo, nombre, fuente{}, total)], total GN."""
    filas, total_gn = [], None
    with pdfplumber.open(CACHE / "Anexo_4.pdf") as pdf:
        for page in pdf.pages:
            if total_gn is not None:
                break
            words = page.extract_words()
            for line in page.extract_text_lines():
                es_total = line["text"].startswith("TOTAL GOBIERNO NACIONAL")
                m = re.match(r"^(\d{3}) (\D.*?)\s+\d", line["text"])
                if not (m or es_total):
                    continue
                xmin = 300 if es_total else 380
                ws = sorted([w for w in words if abs(w["top"] - line["top"]) < 3 and w["x0"] > xmin],
                            key=lambda w: w["x0"])
                # agrupar dígitos contiguos en números
                nums, cur, last_x1 = [], [], None
                for w in ws:
                    if not re.fullmatch(r"\d{1,3}", w["text"]):
                        continue
                    if cur and (w["x0"] - last_x1) < 4 and len(w["text"]) == 3:
                        cur.append(w)
                    else:
                        if cur:
                            nums.append(cur)
                        cur = [w]
                    last_x1 = w["x1"]
                if cur:
                    nums.append(cur)
                vals = {}
                for g in nums:
                    v = int("".join(w["text"] for w in g))
                    x1 = g[-1]["x1"]
                    col = next(i for i, e in enumerate(COL_EDGES) if x1 <= e)
                    vals[FUENTES[col]] = vals.get(FUENTES[col], 0) + v
                tot = vals.pop("TOTAL", None)
                if tot is None or sum(vals.values()) != tot:
                    raise ValueError(f"Anexo 4: fila no cuadra: {line['text']} -> {vals} / {tot}")
                if es_total:
                    total_gn = tot
                    break
                filas.append((m.group(1), m.group(2).strip(), vals, tot))
    if sum(f[3] for f in filas) != total_gn:
        raise ValueError(f"Anexo 4: suma de pliegos GN {sum(f[3] for f in filas)} ≠ TOTAL GN {total_gn}")
    return filas, total_gn


# ---------------------------------------------------------------- Anexo 5
def texto_paginas(pdfname, filtro):
    out = []
    with pdfplumber.open(CACHE / pdfname) as pdf:
        reader = pypdf.PdfReader(CACHE / pdfname)
        for i, rp in enumerate(reader.pages):
            if filtro(rp.extract_text() or ""):
                out.append((i, pdf.pages[i].extract_text() or ""))
    return out


def parse_anexo5(codigos=None):
    """Por pliego (todos los del GN si codigos es None): categorías, productos/actividades, proyectos, genéricas."""
    res = {}
    pat = re.compile(r"Pliego : ?(\d{3}) ?(.*)")
    pages = texto_paginas("Anexo_5.pdf", lambda t: bool(re.search(r"Pliego : ?\d{3}", t)))
    for _, t in pages:
        m = pat.search(t)
        cod = m.group(1)
        if codigos is not None and cod not in codigos:
            continue
        d = res.setdefault(cod, {"nombre": m.group(2).strip(), "categorias": OrderedDict(), "productos": OrderedDict(),
                                 "actividades": OrderedDict(), "proyectos": OrderedDict(),
                                 "generica": OrderedDict(), "total": None})
        lines = t.splitlines()
        start = next(i for i, l in enumerate(lines) if l.startswith("ACTIVIDADES")) + 1
        cat = None
        last_proj = None
        for l in lines[start:]:
            mm = AMT_TAIL.match(l)
            if l.startswith("TOTAL PLIEGO"):
                d["total"] = num(l.split(":")[1])
                continue
            if re.fullmatch(r"\d{1,3}(?: \d{3})*", l.strip()):
                # monto huérfano (el PDF lo imprime al pie y el proyecto sigue en la página siguiente)
                v = num(l.strip())
                if d.get("_pend"):
                    tgt, code = d.pop("_pend")
                    d[tgt][code]["monto"] += v
                else:
                    d["_orphan"] = v
                continue
            if not mm or (re.match(r"^\d{7} ", l) and not re.search(r"\d$", l)):
                cm = re.match(r"^(\d{7}) (.*)$", l)
                if cm:  # proyecto/actividad cuyo monto está en otra línea
                    code, name = cm.group(1), cm.group(2).strip()
                    tgt = {"2": "proyectos", "3": "productos"}.get(code[0], "actividades")
                    d[tgt].setdefault(code, {"nombre": name, "monto": 0})
                    if tgt == "proyectos":
                        d[tgt][code].setdefault("categoria", cat)
                        last_proj = code
                    if "_orphan" in d:
                        d[tgt][code]["monto"] += d.pop("_orphan")
                    else:
                        d["_pend"] = (tgt, code)
                    continue
                if last_proj and not re.match(r"^\d", l):  # continuación de nombre de proyecto
                    d["proyectos"][last_proj]["nombre"] += " " + l.strip()
                continue
            label, v = mm.group(1).strip(), num(mm.group(2))
            last_proj = None
            if label in ("PROGRAMAS PRESUPUESTALES", "ACCIONES CENTRALES",
                         "ASIGNACIONES PRESUPUESTALES QUE NO RESULTAN EN PRODUCTOS"):
                cat = label
                d["categorias"][label] = v
            elif label in ("PRODUCTOS", "PROYECTOS"):
                d["categorias"].setdefault(f"{cat} / {label}" if cat else label, v)
            elif label in ("GASTOS CORRIENTES", "GASTOS DE CAPITAL", "SERVICIO DE LA DEUDA"):
                d["generica"].setdefault("_" + label, v)
            elif re.fullmatch(r"\d", label.split(" ")[0]) and label[0] in GENERICAS and not label[:7].isdigit():
                g = GENERICAS[label[0]]
                d["generica"][g] = d["generica"].get(g, 0) + v
            elif re.match(r"^\d{7} ", label):
                code, name = label[:7], label[8:]
                tgt = {"2": "proyectos", "3": "productos"}.get(code[0], "actividades")
                if code in d[tgt]:
                    d[tgt][code]["monto"] += v
                else:
                    d[tgt][code] = {"nombre": name, "monto": v}
                    if tgt == "proyectos":
                        d[tgt][code]["categoria"] = cat
                if tgt == "proyectos":
                    last_proj = code
    for cod, d in res.items():
        if d.pop("_orphan", None) is not None or d.pop("_pend", None) is not None:
            print(f"AVISO Anexo 5 {cod}: monto o proyecto sin emparejar")
        gen = {k: v for k, v in d["generica"].items() if not k.startswith("_")}
        d["generica"] = gen
        d["_check"] = {
            "generica_ok": sum(gen.values()) == d["total"],
            "proyectos_sum": sum(p["monto"] for p in d["proyectos"].values()),
        }
    return res


# ---------------------------------------------------------------- Anexo 8
def parse_anexo8(codigos):
    res = {}
    pages = texto_paginas("Anexo_8.pdf",
                          lambda t: bool(re.search(r"^5\d\d (U\.N\.|UNIVERSIDAD)", t, re.M)
                                         or re.search(r"^(U\.N\. |UNIVERSIDAD NACIONAL)", t, re.M)))
    for _, t in pages:
        lines = t.splitlines()
        try:
            pp = lines[next(i for i, l in enumerate(lines) if l.startswith("PRODUCTOS / PROYECTOS")) + 1]
        except StopIteration:
            continue
        ppname = AMT_TAIL.match(pp).group(1).strip()
        for l in lines:
            m = re.match(r"^(5\d\d) (.*?)\s+(\d{1,3}(?: \d{3})*)$", l)
            if m and m.group(1) in codigos and ES_UNIV.match(m.group(2)):
                key = f"{PP_CODIGOS.get(ppname, '?')} {ppname}"
                res.setdefault(m.group(1), {})[key] = num(m.group(3))
    return res


# ---------------------------------------------------------------- Disposiciones
def disposiciones():
    """Lista de disposiciones con validación de la cita textual contra el dictamen."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from ley2027_disposiciones import D, grupo
    raw = "\n".join((p.extract_text() or "") for p in pypdf.PdfReader(CACHE / "Dictamen_PL00002_LP.pdf").pages)
    norm = lambda x: re.sub(r"\s+", " ", x).strip()
    texto = norm(raw)
    url = DOCS["Dictamen_PL00002_LP.pdf"][0]
    out = []
    for art, tema, alcance, resumen, cita, monto in D:
        ok = norm(cita) in texto
        if not ok:
            print(f"AVISO: cita no encontrada literalmente ({art}): {cita[:60]}...")
        if len(cita.split()) > 40:
            print(f"AVISO: cita > 40 palabras ({art})")
        out.append(OrderedDict(articulo=art, grupo=grupo(tema), tema=tema, alcance=alcance, resumen=resumen, cita=cita,
                               cita_verificada=ok, monto=monto, url=url,
                               fuente_texto="texto sustitutorio del dictamen (5-nov-2026)"))
    return out


def main():
    offline = "--offline" in sys.argv
    descargar(offline)
    gasto = json.loads(GASTO.read_text())
    univ_gasto = gasto["universidades"]

    filas4, total_gn = parse_anexo4()
    univ_a4 = {c: {"nombre": n, "fuente": f, "total": t} for c, n, f, t in filas4
               if c.startswith("5") and ES_UNIV.match(n)}
    codigos = set(univ_a4) | set(univ_gasto)
    a5_todos = parse_anexo5()
    a5 = {c: v for c, v in a5_todos.items() if c in codigos}
    a8 = parse_anexo8(codigos)

    # Sector 10 (Educación) en el Anexo 4: bloque desde "010 M. DE EDUCACION" hasta "011 ..."
    i0 = next(i for i, f in enumerate(filas4) if f[0] == "010" and "EDUCACION" in f[1])
    i1 = next(i for i, f in enumerate(filas4) if i > i0 and f[0] == "011")
    sector10 = {f[0]: f[3] for f in filas4[i0:i1]}

    universidades = OrderedDict()
    tot27 = tot26 = tot26_comp = tot27_comp = 0
    for cod in sorted(codigos):
        g = univ_gasto.get(cod, {})
        anios = g.get("anios", {})
        y26, y25 = anios.get("2026", {}).get("total", {}), anios.get("2025", {}).get("total", {})
        a = univ_a4.get(cod)
        rec = OrderedDict(nombre=(a or {}).get("nombre") or g.get("nombre"))
        rec["pia_2027"] = a["total"] if a else None
        rec["pia_2026"] = int(y26["pia"]) if y26.get("pia") is not None else None
        rec["pim_2026"] = y26.get("pim")
        rec["dev_2026_parcial"] = y26.get("dev")
        rec["pim_2025"] = y25.get("pim")
        rec["dev_2025"] = y25.get("dev")
        rec["var_pct"] = (round(100 * (rec["pia_2027"] / rec["pia_2026"] - 1), 2)
                          if rec["pia_2027"] and rec["pia_2026"] else None)
        rec["var_abs"] = (rec["pia_2027"] - rec["pia_2026"]
                          if rec["pia_2027"] is not None and rec["pia_2026"] is not None else None)
        rec["var_pct_vs_pim_2026"] = (round(100 * (rec["pia_2027"] / rec["pim_2026"] - 1), 2)
                                      if rec["pia_2027"] and rec["pim_2026"] else None)
        if a:
            rec["fuente"] = {k: v for k, v in a["fuente"].items() if v}
        d5 = a5.get(cod)
        if d5:
            rec["generica"] = d5["generica"]
            rec["categoria_presupuestal"] = d5["categorias"]
            rec["productos"] = d5["productos"]
            rec["actividades"] = d5["actividades"]
            rec["proyectos"] = d5["proyectos"]
            rec["n_proyectos"] = len(d5["proyectos"])
        if cod in a8:
            rec["programas_presupuestales"] = a8[cod]
        rec["en_gasto_json"] = cod in univ_gasto
        universidades[cod] = rec
        if rec["pia_2027"]:
            tot27 += rec["pia_2027"]
        if rec["pia_2026"]:
            tot26 += rec["pia_2026"]
            if rec["pia_2027"]:
                tot26_comp += rec["pia_2026"]
                tot27_comp += rec["pia_2027"]

    # chequeos de consistencia
    checks = []
    for cod, d5 in a5.items():
        a = univ_a4.get(cod)
        if a and d5["total"] != a["total"]:
            checks.append(f"{cod}: total Anexo 5 ({d5['total']}) ≠ Anexo 4 ({a['total']})")
        if not d5["_check"]["generica_ok"]:
            checks.append(f"{cod}: genéricas Anexo 5 no suman el total del pliego")
        cp = d5["categorias"]
        proj_cat = sum(v for k, v in cp.items() if k.endswith("/ PROYECTOS"))
        if proj_cat != d5["_check"]["proyectos_sum"]:
            checks.append(f"{cod}: suma de proyectos ({d5['_check']['proyectos_sum']}) ≠ subtotal PROYECTOS ({proj_cat})")
    pp66 = sum(v.get("0066 FORMACION UNIVERSITARIA DE PREGRADO", 0) for v in a8.values())
    pp137 = sum(v.get("0137 DESARROLLO DE LA CIENCIA, TECNOLOGIA E INNOVACION TECNOLOGICA", 0) for v in a8.values())
    fuente_tot = {}
    gen_tot = {}
    for r in universidades.values():
        for k, v in (r.get("fuente") or {}).items():
            fuente_tot[k] = fuente_tot.get(k, 0) + v
        for k, v in (r.get("generica") or {}).items():
            gen_tot[k] = gen_tot.get(k, 0) + v

    TOTAL_SP_2027 = 266_506_316_735
    sin_2027 = [c for c, r in universidades.items() if not r["pia_2027"]]
    nuevas = [c for c, r in universidades.items() if r["pia_2027"] and not r["en_gasto_json"]]

    out = OrderedDict()
    out["generado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out["version"] = "dictamen"
    out["norma"] = "Dictamen de la Comisión Bicameral de Presupuesto recaído en la Proposición Legislativa N° 00002-2026-2031-CR (Ley de Presupuesto del Sector Público para el Año Fiscal 2027)"
    out["fecha"] = "2026-11-05"
    out["url"] = DOCS["Dictamen_PL00002_LP.pdf"][0]
    out["estado_tramite"] = OrderedDict([
        ("proyecto", {"fecha": "2026-08-28", "detalle": "Presentado por el Ejecutivo; anexos fechados 27/08/2026", "url": DOCS["Anexo_4.pdf"][0]}),
        ("dictamen", {"fecha": "2026-11-05", "detalle": "Comisión Bicameral de Presupuesto aprueba dictamen con texto sustitutorio (29 a favor, 1 en contra, 4 abstenciones); mantiene el total y la distribución por nivel de gobierno del proyecto (GN S/ 166 613 M).", "url": DOCS["Dictamen_PL00002_LP.pdf"][0]}),
        ("autografa", {"fecha": "2026-11-20", "detalle": "Pleno (Diputados 71-32-12; Senado 36-14-3) aprueba texto sustitutorio por S/ 266 506 316 735: GN S/ 165 604 542 258, GR S/ 58 832 594 934, GL S/ 42 069 179 543. Total igual, pero ~S/ 1 008 M pasan del GN a gobiernos subnacionales respecto del proyecto. Anexos finales por pliego no ubicados al 23-nov-2026.", "url": OTROS_DOCS[0]["url"]}),
        ("ley_publicada", {"fecha": None, "detalle": "Pendiente de promulgación/publicación en El Peruano al 23-nov-2026.", "url": None}),
    ])
    out["documentos"] = [{"titulo": t, "url": u, "tipo": k} for _, (u, t, k) in DOCS.items()] + OTROS_DOCS
    out["notas"] = [
        "version='dictamen': el art. 1 del texto sustitutorio del dictamen (5-nov-2026) fija exactamente la misma distribución que el proyecto (GN S/ 166 613 076 848; GR S/ 58 671 738 588; GL S/ 41 221 501 299) y remite a los anexos 1–8; por eso los montos por pliego se toman de los anexos del proyecto publicados por el MEF (no hay anexos propios del dictamen publicados).",
        "Búsqueda de la ley publicada (23-nov-2026): sin número de ley ni publicación en El Peruano; la autógrafa aprobada el 20-nov-2026 no tiene anexos por pliego públicos (congreso.gob.pe 404; MEF tras Incapsula).",
        "Montos por universidad = créditos del PROYECTO (Anexo 4, 5 y 8, MEF, 27/08/2026). La versión aprobada por el Pleno el 20-nov-2026 mantiene el total del sector público pero reasigna ~S/ 1 008 M del Gobierno Nacional a gobiernos regionales y locales; no se ha publicado aún el detalle por pliego de esa versión, por lo que el PIA 2027 final de cada universidad puede diferir.",
        "pia_2026, pim_2026, dev_2026_parcial, pim_2025 y dev_2025 provienen de data/gasto/gasto.json (Consulta Amigable MEF; 2026 parcial al 22-nov-2026). var_pct = PIA 2027 propuesto vs PIA 2026.",
        "fuente: Anexo 4 por fuente de financiamiento (RO, RDR, ROOC, D y T, RD). En el Anexo 4 'RECURSOS DETERMINADOS' agrupa canon, sobrecanon, regalías, renta de aduanas y participaciones; no se desagrega por rubro.",
        "generica, categoria_presupuestal, productos, actividades y proyectos: Anexo 5. programas_presupuestales: Anexo 8 (solo PP en que aparece la universidad).",
        "Las universidades creadas recientemente sin pliego propio en el proyecto no tienen PIA 2027; el art. 87 prevé financiarlas desde la Reserva de Contingencia durante el año (monto no especificado en la ley).",
        "Disposiciones: lista de las que afectan el gasto de las universidades (alcance='especifica' si las nombra; 'general' si rige para entidades del Gobierno nacional y alcanza a universidades por el art. 3). Numeración y citas del texto sustitutorio del dictamen (coincide con el proyecto en los artículos revisados); la autógrafa/ley final podría renumerar. El Anexo I (tope de CAS por pliego) no se pudo descargar.",
    ] + ([f"Universidades sin PIA 2027 en el Anexo 4: {', '.join(sin_2027)}"] if sin_2027 else []) \
      + ([f"Pliegos universitarios en el proyecto 2027 que no están en gasto.json: {', '.join(nuevas)}"] if nuevas else []) \
      + ([f"Chequeos con diferencias: {'; '.join(checks)}"] if checks else ["Chequeos OK: Anexo 4 (suma de fuentes = total por fila), Anexo 5 = Anexo 4 por pliego, genéricas y proyectos cuadran."])
    out["total_universidades"] = OrderedDict([
        ("n_pliegos_2027", sum(1 for r in universidades.values() if r["pia_2027"])),
        ("pia_2027", tot27),
        ("pia_2026", tot26),
        ("var_pct", round(100 * (tot27 / tot26 - 1), 2) if tot26 else None),
        ("pia_2027_mismos_pliegos", tot27_comp),
        ("pia_2026_mismos_pliegos", tot26_comp),
        ("var_pct_mismos_pliegos", round(100 * (tot27_comp / tot26_comp - 1), 2) if tot26_comp else None),
        ("nota_comparacion", "var_pct compara todo lo asignado en 2027 con todo el PIA 2026 de los 71 pliegos de gasto.json; var_pct_mismos_pliegos solo usa pliegos con PIA > 0 en ambos años (excluye universidades nuevas sin PIA 2026)."),
        ("fuente", fuente_tot),
        ("generica", gen_tot),
        ("pp_0066_universidades", pp66),
        ("pp_0137_universidades", pp137),
        ("peso_en_sector_educacion_pct", round(100 * tot27 / sum(sector10.values()), 2)),
        ("sector_educacion_2027", sum(sector10.values())),
        ("sector_educacion_nota", "Suma de pliegos del Sector 10 en el Anexo 4 (MINEDU, Huampaní, SINEACE, SUNEDU, IPD y universidades); no incluye educación de gobiernos regionales."),
        ("gobierno_nacional_2027", total_gn),
        ("peso_en_gobierno_nacional_pct", round(100 * tot27 / total_gn, 2)),
        ("total_sector_publico_2027", TOTAL_SP_2027),
        ("peso_en_total_pct", round(100 * tot27 / TOTAL_SP_2027, 3)),
        ("total_sector_publico_pia_2026_millones", 257_562),
        ("referencias_em", "Exposición de motivos: PP 0066 S/ 4 222 M en total (incluye MINEDU y 1 GR); S/ 3 511 M remuneraciones de 67 universidades; S/ 260 M pensiones de 54; S/ 1 201 M gastos operativos de 67; S/ 1 967 M inversiones y otros activos."),
    ])
    out["universidades"] = universidades
    out["disposiciones"] = disposiciones()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"OK {OUT} — {len(universidades)} universidades; total 2027 {tot27:,} vs 2026 {tot26:,}")
    for c in checks:
        print("CHECK:", c)


if __name__ == "__main__":
    main()
