"""
Proyectos/actividades del Anexo 5 (proyecto 2027) ubicados en pliegos que NO son universidades
(MINEDU, CONCYTEC, otros sectores del Gobierno Nacional) pero cuyo beneficiario es una universidad pública.

Criterios de asignación (campo "match"):
  - "nombre": el nombre menciona "UNIVERSIDAD NACIONAL <nombre del pliego>" / "U.N. <nombre>".
  - "sigla":  el nombre contiene la sigla de la universidad como palabra (UNMSM, UNSAAC, UNALM...).
  - "cui":    el CUI aparece en el historial SIAF de un pliego universitario (data/u/{pliego}.json).
  - "dudoso": menciona universidad(es) pero no se pudo asignar a un único pliego.
Limitación: el Anexo 5 solo cubre el Gobierno Nacional; los proyectos para universidades financiados por
gobiernos regionales (Anexo 6) o locales no están incluidos.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SIGLAS = {
    "UNMSM": "510", "UNSAAC": "511", "UNSA": "513", "UNI": "514", "UNICA": "515", "UNSLG": "515",
    "UNSCH": "516", "UNCP": "517", "UNALM": "518", "UNAP": None,  # ambigua: Amazonía Peruana / Altiplano
    "UNA PUNO": "520", "UNPRG": "523", "UNFV": "524", "UNHEVAL": "525", "UNAS": "526", "UNDAC": "527",
    "UNE": "528", "UNAC": "529", "UNJFSC": "530", "UNJBG": "531", "UNASAM": "532", "UNSM": "533",
    "UNTRM": "541", "UNIA": "542", "UNTELS": "543", "UNAJMA": "544", "UNAMAD": "538", "UNAMBA": "539",
    "UNFS": None, "UNDC": "547", "UNISCJSA": "551", "UNAAT": "553", "UNAH": "554", "UNIFSLB": "555",
    "UNIQ": "556", "UNAAA": "557", "UNAT": "558", "UNCA": "559",
}
# alias de nombre (forma en que aparece en los proyectos) -> pliego
ALIAS = {
    "UNIVERSIDAD NACIONAL DE SAN AGUSTIN": "513",
    "UNIVERSIDAD NACIONAL DE LA AMAZONIA PERUANA": "519",
    "UNIVERSIDAD NACIONAL DEL ALTIPLANO": "520",
    "UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD": "511",
    "UNIVERSIDAD NACIONAL SAN ANTONIO ABAD": "511",
    "UNIVERSIDAD NACIONAL DE EDUCACION": "528",
    "UNIVERSIDAD NACIONAL TORIBIO RODRIGUEZ DE MENDOZA": "541",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.upper()).strip()


def matchers(universidades):
    """[(patrón normalizado, pliego)] ordenados de más largo a más corto."""
    pats = []
    for cod, nombre in universidades.items():
        core = norm(nombre)
        core = re.sub(r"^(U\.N\.|UNIVERSIDAD NACIONAL)\s*", "", core)
        if not core:
            continue
        pats.append(("UNIVERSIDAD NACIONAL " + core, cod))
        pats.append(("U.N. " + core, cod))
        # sin "DE"/"DEL" inicial (p. ej. "UNIVERSIDAD NACIONAL INGENIERIA")
        core2 = re.sub(r"^(DE LA|DEL|DE)\s+", "", core)
        if core2 != core:
            pats.append(("UNIVERSIDAD NACIONAL " + core2, cod))
    for a, cod in ALIAS.items():
        pats.append((norm(a), cod))
    return sorted(set(pats), key=lambda x: -len(x[0]))


def cuis_siaf():
    """CUI -> set(pliegos universitarios) según data/u/{pliego}.json (todos los años)."""
    res = {}
    for f in (ROOT / "data" / "u").glob("*.json"):
        d = json.loads(f.read_text())
        for y, v in (d.get("anios") or {}).items():
            for p in v.get("proyectos") or []:
                res.setdefault(str(p.get("codigo")), set()).add(d.get("pliego") or f.stem)
    return res


def asignar(nombre, cui, pats, cuimap):
    n = norm(nombre)
    for pat, cod in pats:
        if pat in n:
            return cod, "nombre"
    for sig, cod in SIGLAS.items():
        if re.search(r"(?<![A-Z])" + re.escape(sig) + r"(?![A-Z])", n):
            if cod:
                return cod, "sigla"
            return None, "dudoso"
    if cui in cuimap and len(cuimap[cui]) == 1:
        return next(iter(cuimap[cui])), "cui"
    if re.search(r"UNIVERSID|UNIVERSITARI", n):
        return None, "dudoso"
    return None, None


def buscar(a5_todos, universidades):
    """a5_todos: salida de parse_anexo5() para todos los pliegos. universidades: {pliego: nombre}."""
    pats = matchers(universidades)
    cuimap = cuis_siaf()
    out = []
    for pcod, d in a5_todos.items():
        if pcod in universidades:
            continue
        for tipo in ("proyectos", "actividades", "productos"):
            for code, it in d.get(tipo, {}).items():
                ben, how = asignar(it["nombre"], code, pats, cuimap)
                if not how:
                    continue
                # actividades genéricas (p. ej. "...UNIVERSITARIA") sin beneficiario claro se omiten
                if how == "dudoso" and tipo != "proyectos":
                    continue
                out.append({
                    "pliego_ejecutor": pcod, "pliego_ejecutor_nombre": d.get("nombre"),
                    "beneficiario": ben,
                    "beneficiario_nombre": universidades.get(ben) if ben else None,
                    "codigo": code, "nombre": it["nombre"], "monto": it["monto"],
                    "tipo": tipo[:-1], "categoria": it.get("categoria"), "match": how,
                    "cui_en_siaf_de": sorted(cuimap.get(code, [])),
                })
    out.sort(key=lambda x: -x["monto"])
    return out
