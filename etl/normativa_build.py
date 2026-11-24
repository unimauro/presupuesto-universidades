"""Construye data/normativa/normativa.json a partir de la caché de normativa.

Entradas (generadas por los otros scripts etl/normativa_*.py):
  etl/cache/normativa/relevantes.json   normas candidatas (gob.pe) + PDFs en pdf/<id>/
  etl/cache/normativa/pdf/<id>/*.txt    texto de cada PDF (normativa_texto.py)
  etl/cache/normativa/leyes.json        PIA por pliego del Anexo 4 de cada Ley (normativa_leyes.py)
  etl/cache/normativa/canon.json        canon/regalías a universidades (normativa_canon.py)

Reglas anti-overclaiming:
  * monto_total sale del texto del DS ("hasta por la suma de S/ ..." o "TOTAL EGRESOS").
  * por_pliego solo si el PDF (anexo o cuerpo) trae filas con código de pliego 5xx; si no, {}.
  * se compara suma(por_pliego) vs monto_total y se marca "cuadra" (true/false/null).

Uso: ~/.venvs/pu-normativa/bin/python -I etl/normativa_build.py
"""
import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "etl" / "cache" / "normativa"
OUT = ROOT / "data" / "normativa" / "normativa.json"

# ---------------------------------------------------------------- montos
PATS = [
    re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d{2})?(?![\d,])"),   # 1,234,567.00 | 357,624
    re.compile(r"\d{1,3}(?: \d{3})+[.,]\d{2}(?!\d)"),         # 1 234 567,00 | 1 234 567.00
    re.compile(r"\d{1,3}(?:\.\d{3})+,\d{2}(?!\d)"),           # 1.234.567,00
    re.compile(r"(?<![\d,. ])\d{1,6}[.,]\d{2}(?!\d)"),        # 234567.00 | 3603,00
]


def to_num(s):
    s = s.strip()
    m = re.match(r"^(.*?)[.,](\d{2})$", s)
    if m and not re.search(r"[.,]\d{3}$", s):
        ent, dec = m.group(1), m.group(2)
    else:
        ent, dec = s, "00"
    ent = re.sub(r"\D", "", ent)
    return int(ent) + int(dec) / 100 if ent else None


def ultimo_monto(linea):
    """Último monto de la línea (columna TOTAL)."""
    best = None
    for p in PATS:
        for m in p.finditer(linea):
            if best is None or m.end() > best[0] or (m.end() == best[0] and m.start() < best[1]):
                best = (m.end(), m.start(), m.group(0))
    if best:
        return to_num(best[2])
    m = re.search(r"(?<![\d.,])(\d{4,})(?![\d.,])\s*$", linea)  # entero sin separadores al final
    return float(m.group(1)) if m else None


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", s)


# ---------------------------------------------------------------- filas de pliego
FILA = re.compile(r"^\s*(?:\d{1,3}\s+)?(5\d{2})(?!\d)\s*[.:\-]?\s*(?P<nombre>[A-ZÁÉÍÓÚÑa-z].*)$")
ES_UNI = re.compile(r"U\.?\s?N\.|UNIVERSIDAD|UNIV\.|^UN[A-Z]", re.I)


def filas_pliego(texto):
    """[(pliego, nombre, monto)] por cada línea que empieza con código 5xx de universidad."""
    out = []
    for ln in texto.splitlines():
        m = FILA.match(ln)
        if not m:
            continue
        nombre = m.group("nombre")
        if not ES_UNI.search(nombre.replace(" ", "")) and not ES_UNI.search(nombre):
            continue
        monto = ultimo_monto(ln)
        if monto is None:
            continue
        nom = re.split(r"\s+[\d\-]", nombre)[0].strip()
        out.append((m.group(1), nom, monto))
    return out


# ---------------------------------------------------------------- texto del DS
def bloque_norma(texto, numero):
    """Recorta el texto de El Peruano al bloque del DS (el PDF trae otras normas)."""
    n, anio = numero
    rx = re.compile(r"DECRETO\s*SUPREMO\s*N[°ºo\.]*\s*0*%s\s*-\s*%s\s*-\s*EF" % (int(n), anio), re.I)
    m = rx.search(texto)
    if not m:
        return texto
    fin = re.search(r"\n\s*\d{6,7}-\d\s*\n", texto[m.end():])  # código de publicación El Peruano
    return texto[max(0, m.start() - 6000): m.end() + (fin.end() if fin else 30000)]


def monto_total(texto):
    m = re.search(r"hasta\s+por\s+la\s+suma\s+de\s+S/\.?\s*([\d .,]+\d)", texto, re.I)
    if m:
        v = ultimo_monto(m.group(1))
        if v:
            return v, "art1"
    vals = [ultimo_monto(x) for x in re.findall(r"TOTAL\s*EGRESOS\s*([\d .,]+\d)", texto, re.I)]
    vals = [v for v in vals if v]
    if vals:
        return max(vals), "total_egresos"
    return None, None


def finalidad(texto_ds, texto_anexos, desc):
    m = re.search(r"Se\s+autoriza\s+una?\s+(?:Transferencia\s+de\s+Partidas|Cr[ée]dito\s+Suplementario).{0,600}?"
                  r"(para\s+(?:financiar|el\s+financiamiento|la\s+implementaci|cubrir|atender).{10,400}?)"
                  r"(?:,\s*conforme|,\s*de\s+acuerdo|,\s*en\s+el\s+marco|;|\.\s|, seg[uú]n)", texto_ds, re.I | re.S)
    if m:
        return re.sub(r"\s+", " ", m.group(1)).strip()
    m = re.search(r"ANEXO[^\n]*\n(.{20,600}?)\n\s*(?:En\s*Soles|EnSoles|\(En Soles\)|Fuente)", texto_anexos, re.S | re.I)
    if m:
        t = re.sub(r"\s+", " ", m.group(1)).strip()
        if len(t.replace(" ", "")) > 20:
            return t
    return desc


# ---------------------------------------------------------------- principal
def tipo_doc(titulo):
    t = titulo.lower()
    if t.startswith("ley") or "proyecto de ley" in t:
        return "ley"
    if t.startswith("decreto supremo"):
        return "ds"
    if t.startswith("decreto de urgencia"):
        return "du"
    if "resolución ministerial" in t or "resolución viceministerial" in t:
        return "rm"
    return "otro"


def numero_ds(titulo):
    m = re.search(r"N\.?°?\s*(\d+)-(\d{4})-EF", titulo)
    return (m.group(1), m.group(2)) if m else None


def es_transferencia(c):
    txt = (c["titulo"] + " " + (c.get("desc_full") or c["desc"])).lower()
    if "topes máximos" in txt or "normas reglamentarias" in txt or "lineamientos" in txt:
        return False
    return bool(re.search(r"transferencia de partidas|cr[ée]dito suplementario|transferencia financiera", txt))


def textos(c):
    d = CACHE / "pdf" / c["id"]
    cuerpo, anexos = "", ""
    if not d.exists():
        return cuerpo, anexos, []
    files = sorted(d.glob("*.txt"))
    for f in files:
        t = f.read_text(errors="ignore")
        if re.search(r"anexo", f.name, re.I):
            anexos += "\n" + t
        else:
            cuerpo += "\n" + t
    return cuerpo, anexos, files


def main():
    rel = json.loads((CACHE / "relevantes.json").read_text())
    notas = []
    documentos, transferencias = [], []
    vistos = set()
    nombres_ref = {}
    for c in sorted(rel, key=lambda c: c["fecha"]):
        clave = (c["titulo"], c["fecha"])
        if clave in vistos:
            continue
        vistos.add(clave)
        tipo = tipo_doc(c["titulo"])
        desc = c.get("desc_full") or c["desc"]
        documentos.append({"titulo": f"{c['titulo']} — {desc[:220]}", "url": c["url"],
                           "pdfs": [u for u in c["pdfs"] if "/preview_" not in u],
                           "anio": int(c["fecha"][:4]), "fecha": c["fecha"], "tipo": tipo})
        if tipo not in ("ds", "du") or not es_transferencia(c):
            continue
        cuerpo, anexos, files = textos(c)
        num = numero_ds(c["titulo"])
        cuerpo_ds = bloque_norma(cuerpo, num) if (num and cuerpo) else cuerpo
        total, via_total = monto_total(cuerpo_ds)
        filas = filas_pliego(anexos) or filas_pliego(cuerpo_ds)
        por = {}
        for p, nom, v in filas:
            por[p] = por.get(p, 0) + v
            nombres_ref.setdefault(p, nom)
        suma = round(sum(por.values()), 2)
        dup = False
        if total and suma and abs(suma - 2 * total) < 1 and len(filas) > 1:
            # el anexo repite cada pliego (p. ej. cuadro detalle + resumen): se toma una vez
            por = {p: round(v / 2, 2) for p, v in por.items()}
            suma = round(sum(por.values()), 2)
            dup = True
        cuadra = None
        if total and por:
            cuadra = abs(suma - total) <= max(1.0, total * 0.001)
        if not files:
            nota_t = "PDF no descargable desde gob.pe; solo metadatos."
        elif not por:
            nota_t = "El PDF no desagrega montos por universidad (o no se pudo leer la tabla); no se imputa."
        elif cuadra is False and total and suma < total:
            nota_t = ("Suma de universidades < monto total: el DS también transfiere a otros pliegos "
                      "(p. ej. MINEDU, SUNEDU, gobiernos regionales) o parte del anexo no se pudo leer.")
        elif cuadra is False:
            nota_t = "Suma por pliego no cuadra con el monto total extraído; revisar PDF."
        else:
            nota_t = None
        transferencias.append({
            "norma": re.sub(r"Decreto Supremo N\.° ", "DS N° ", c["titulo"]).replace("Decreto de Urgencia N.° ", "DU N° "),
            "fecha": c["fecha"], "anio": int(c["fecha"][:4]), "url": c["url"],
            "pdfs": [u for u in c["pdfs"] if "/preview_" not in u],
            "finalidad": finalidad(cuerpo_ds, anexos, desc),
            "descripcion": desc,
            "monto_total": total, "monto_total_fuente": via_total,
            "monto_universidades": suma if por else None,
            "n_universidades": len(por),
            "cuadra": cuadra, "anexo_duplicado_corregido": dup or None,
            "por_pliego": {k: round(v, 2) for k, v in sorted(por.items())},
            "nota": nota_t,
        })

    # leyes
    leyes = []
    lf = CACHE / "leyes.json"
    if lf.exists():
        for L in json.loads(lf.read_text()):
            leyes.append({k: L.get(k) for k in ("anio", "norma", "url", "via", "ficha", "pia_por_pliego", "nota")
                          if L.get(k) is not None or k in ("pia_por_pliego", "url")})
            for p, n in (L.get("nombres") or {}).items():
                nombres_ref[p] = n
            if L.get("url"):
                documentos.append({"titulo": f"{L['norma']} — Anexo 4: Distribución del gasto por niveles de gobierno, "
                                             f"pliegos y fuentes de financiamiento (AF {L['anio']})",
                                   "url": L["url"], "anio": L["anio"] - 1 if L["anio"] > 2016 else L["anio"],
                                   "tipo": "ley"})
    # canon
    canon, canon_det = {}, []
    cf = CACHE / "canon.json"
    if cf.exists():
        cj = json.loads(cf.read_text())
        canon = cj["por_pliego"]
        agg = {}
        for d in cj["detalle"]:
            k = (d["pliego"], d["anio"], d["recurso"].split(":", 1)[-1].strip(), d.get("tipo_operacion"))
            agg[k] = agg.get(k, 0) + d["acreditado"]
            nombres_ref.setdefault(d["pliego"], d["nombre"])
        canon_det = [{"pliego": p, "anio": a, "recurso": r, "tipo_operacion": t, "monto": round(v, 2)}
                     for (p, a, r, t), v in sorted(agg.items())]

    notas += [
        "Fuente de normas: buscador de normas legales de gob.pe (MEF y MINEDU) + PDFs oficiales (El Peruano/anexos).",
        "PIA por pliego: Anexo 4 de cada Ley de Presupuesto (copias de mef.gob.pe vía gob.pe o Internet Archive; "
        "mef.gob.pe bloquea la descarga automatizada). 2016 (Ley 30372) y Proyecto 2027 no ubicados.",
        "transferencias: solo DS/DU de transferencia de partidas o crédito suplementario que mencionan universidades en "
        "gob.pe; la cobertura NO es exhaustiva (hay DS que transfieren a 'diversos pliegos' sin mencionar universidades en el sumario).",
        "por_pliego vacío = el PDF no desagrega por universidad o no se pudo leer; no se imputa.",
        "monto_universidades puede ser menor que monto_total cuando el DS también beneficia a otros pliegos.",
        "Las Resoluciones Ministeriales de MINEDU (desagregación de recursos) se listan en documentos pero no se suman, "
        "para no duplicar montos ya transferidos por DS.",
        "canon: MEF 'Consulta de Transferencias' (Gobierno Nacional), monto acreditado en soles, recursos de "
        "canon/sobrecanon/regalías/FOCAM, tipos de operación 'Recursos autorizados' y 'Transferencia a universidades'.",
    ]
    tr_ok = [t for t in transferencias if t["por_pliego"]]
    out = {
        "generado": datetime.now().isoformat(timespec="seconds"),
        "notas": notas,
        "resumen": {
            "documentos": len(documentos),
            "transferencias": len(transferencias),
            "transferencias_con_desglose": len(tr_ok),
            "transferencias_que_cuadran": sum(1 for t in transferencias if t["cuadra"]),
            "leyes_con_pia": [L["anio"] for L in leyes if L.get("pia_por_pliego")],
        },
        "leyes": leyes,
        "transferencias": transferencias,
        "canon": canon,
        "canon_detalle": canon_det,
        "pliegos": dict(sorted(nombres_ref.items())),
        "documentos": sorted(documentos, key=lambda d: (d["anio"], d.get("fecha", ""))),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps(out["resumen"], ensure_ascii=False))
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
