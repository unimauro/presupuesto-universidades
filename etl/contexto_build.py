#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente CONTEXTO — arma data/contexto/contexto.json (denominadores e identidad por pliego).

Entradas (todas en etl/cache/contexto/, ver contexto_descargar.sh / contexto_pliegos.py / contexto_openalex.py):
  mef/pliegos_{año}.json                  padrón de pliegos universitarios (Consulta Amigable MEF)
  sunedu/licenciamiento_institucional_18.csv  SUNEDU · datosabiertos.gob.pe (corte 28-ago-2024)
  minedu/t11629.xlsx (matriculados) t11625.xlsx (docentes) t11627.xlsx (ingresantes) t11630.xlsx (postulantes)
                                          MINEDU-DIGESU · SIRIES, 2018-2023, corte 23-dic-2024
  openalex/{id}.json, openalex/mapa_pliegos.json   OpenAlex + ROR
  wikipedia/anexo_universidades.json      siglas / año de fundación de respaldo
  ../../../universidades-peru/data/universidades.json   siglas (repo hermano, solo lectura)

Uso: ~/.venvs/pu-contexto/bin/python etl/contexto_build.py
"""
import datetime, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contexto_fuentes import CACHE, best, norm, pliegos, siries, sunedu_licencias, unis_peru

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "contexto", "contexto.json")
PUB_YEARS = [str(y) for y in range(2015, 2026)]  # 2026 incompleto: no se incluye

# Universidades creadas por ley sin sede en SUNEDU/OpenAlex: departamento tomado del topónimo de su nombre.
# Solo se ponen las inequívocas; el resto queda null.
DEPTO_TOPONIMO = {
    "560": ("CUSCO", "Cusco"), "561": ("LIMA", "Lima"), "562": ("HUÁNUCO", "Huánuco"),
    "563": ("CAJAMARCA", "San Ignacio"), "564": ("LIMA", "Lima"), "565": ("PUNO", "Yunguyo"),
    "566": ("PIURA", "Sechura"), "568": ("PUNO", "Carabaya"), "569": ("CAJAMARCA", "Cutervo"),
    "570": ("JUNÍN", "Chupaca"), "571": ("LIMA", "Lima"), "573": ("ICA", "Chincha"),
    "574": ("PIURA", "Huancabamba"), "575": ("PUNO", "Desaguadero"), "576": ("PUNO", "Ilave"),
    "577": ("LIMA", "Lima"), "578": ("LAMBAYEQUE", "Chiclayo"), "579": ("LAMBAYEQUE", "Olmos"),
    "582": ("AYACUCHO", "Parinacochas"),
}


# Siglas repetidas entre universidades distintas (Wikipedia/uso común): se desambiguan a mano.
SIGLA_FIX = {"520": "UNA-Puno", "535": "UNTumbes", "545": "UNAM"}


def titulo(s):
    small = {"de", "del", "la", "las", "los", "y", "el"}
    w = s.lower().split()
    return " ".join(x if (x in small and i) else x[:1].upper() + x[1:] for i, x in enumerate(w))


def tipo(nombre):
    n = norm(nombre)
    if re.search(r"\b(MUSICA|ARTE|ARTES|FOLKLORE)\b", n):
        return "arte"
    if "INTERCULTURAL" in n:
        return "intercultural"
    if "AUTONOMA" in n:
        return "autonoma"
    return "nacional"


def wiki_rows():
    fp = os.path.join(CACHE, "wikipedia", "anexo_universidades.json")
    if not os.path.exists(fp):
        return []
    t = json.load(open(fp, encoding="utf-8"))["parse"]["wikitext"]["*"]
    t = t[:t.find("=== Universidades privadas")]
    t = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    out = []
    for m in re.finditer(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\][^|\n]*\|\|\s*([^|\n]+?)\s*\|\|\s*(\d{4})", t):
        out.append({"nombre": m.group(2) or m.group(1), "sigla": m.group(3).strip(), "anio": int(m.group(4))})
    return out


def serie_ok(d):
    """Descarta años con 0 (SIRIES pone 0 si la uni aún no reportaba): null en vez de 0."""
    return {y: v for y, v in d.items() if v} or None


def main():
    P = pliegos()
    lic = sunedu_licencias()
    est, corte = siries("estudiantes")
    doc, _ = siries("docentes")
    ing, _ = siries("ingresantes")
    pos, _ = siries("postulantes")
    oamap = json.load(open(os.path.join(CACHE, "openalex", "mapa_pliegos.json"), encoding="utf-8"))
    up = {u["pliego"]: u for u in unis_peru() if u.get("pliego")}
    wk = wiki_rows()

    unis, usados_lic = {}, set()
    for p, d in sorted(P.items()):
        nm = d["nombre_mef"]
        u = {"nombre": None, "nombre_mef": nm, "corto": None, "sigla": None, "departamento": None,
             "provincia": None, "ciudad": None, "lat": None, "lng": None, "ubicacion_fuente": None,
             "creacion": None, "creacion_fuente": None,
             "licencia": None, "licencia_inicio": None, "licencia_fin": None, "licencia_anios": None,
             "tipo": tipo(nm), "openalex": None,
             "estudiantes": None, "estudiantes_fuente": None, "docentes": None, "docentes_fuente": None,
             "ingresantes": None, "postulantes": None,
             "pubs": None, "pubs_fuente": None, "investigadores": None, "investigadores_fuente": None,
             "mef_anios_pliego": d["anios"]}

        l, _ = best(nm, lic, key=lambda r: r["NOMBRE"])
        if l:
            usados_lic.add(l["CODIGO_ENTIDAD"])
            u["nombre"] = l["NOMBRE"]
            u["licencia"] = {"LICENCIA OTORGADA": "Licenciada", "LICENCIA DENEGADA": "Denegada",
                             "NO PRESENTADO": "No presentó solicitud"}.get(l["ESTADO_LICENCIAMIENTO"], l["ESTADO_LICENCIAMIENTO"])
            f = lambda s: f"{s[:4]}-{s[4:6]}-{s[6:]}" if s and len(s) == 8 else None
            u["licencia_inicio"], u["licencia_fin"] = f(l["FECHA_INICIO_LICENCIAMIENTO"]), f(l["FECHA_FIN_LICENCIAMIENTO"])
            u["licencia_anios"] = int(l["PERIODO_LICENCIAMIENTO"]) if l["PERIODO_LICENCIAMIENTO"].isdigit() and int(l["PERIODO_LICENCIAMIENTO"]) else None
            u["departamento"], u["provincia"], u["ciudad"] = l["DEPARTAMENTO"], l["PROVINCIA"], titulo(l["DISTRITO"])
            try:
                u["lat"], u["lng"] = float(l["LATITUD"]), float(l["LONGITUD"])
            except ValueError:
                pass
            u["ubicacion_fuente"] = "SUNEDU licenciamiento (sede principal)"

        for campo, src in (("estudiantes", est), ("docentes", doc), ("ingresantes", ing), ("postulantes", pos)):
            k, _ = best(nm, list(src))
            if k:
                u[campo] = serie_ok(src[k])
                if campo in ("estudiantes", "docentes"):
                    u[campo + "_fuente"] = f"MINEDU-DIGESU SIRIES ({'matriculados' if campo == 'estudiantes' else 'docentes'}, corte {corte})"
                if not u["nombre"]:
                    u["nombre"] = k

        oid = (oamap.get(p) or {}).get("openalex")
        if oid:
            u["openalex"] = oid
            o = json.load(open(os.path.join(CACHE, "openalex", f"{oid}.json"), encoding="utf-8"))
            u["pubs"] = {y: o["pubs"].get(y, 0) for y in PUB_YEARS}
            u["pubs_fuente"] = f"OpenAlex works por publication_year, institutions.id:{oid} (consulta {o['consultado']})"
            u["investigadores"] = o["autores_openalex"]
            u["investigadores_fuente"] = ("OpenAlex: autores con última afiliación conocida en la universidad y >4 trabajos "
                                          f"(consulta {o['consultado']}). NO es el padrón RENACYT.")
            if o.get("ror_established"):
                u["creacion"], u["creacion_fuente"] = o["ror_established"], "ROR (campo established = año de fundación)"
            if u["lat"] is None and (o["inst"].get("geo") or {}).get("latitude"):
                g = o["inst"]["geo"]
                u["lat"], u["lng"], u["ciudad"] = g["latitude"], g["longitude"], g.get("city")
                u["ubicacion_fuente"] = "OpenAlex/GeoNames (institución)"

        w, _ = best(nm, wk, key=lambda r: r["nombre"])
        if w:
            u["sigla"] = w["sigla"]
            if u["creacion"] is None:
                u["creacion"], u["creacion_fuente"] = w["anio"], "Wikipedia (Anexo:Universidades del Perú)"
        if not u["sigla"] and p in up and up[p].get("acron"):
            u["sigla"] = up[p]["acron"]
        u["sigla"] = SIGLA_FIX.get(p, u["sigla"])
        for campo in ("estudiantes", "docentes"):
            ys = sorted(u[campo] or {})
            u[campo + "_ultimo_anio"] = int(ys[-1]) if ys else None

        if u["departamento"] is None and p in DEPTO_TOPONIMO:
            u["departamento"], u["ciudad"] = DEPTO_TOPONIMO[p]
            u["ubicacion_fuente"] = "inferido del topónimo en el nombre legal (sin coordenadas)"
        elif u["departamento"] is None and u["ciudad"] and u["ubicacion_fuente"] and "OpenAlex" in u["ubicacion_fuente"]:
            pass  # ciudad/coords de OpenAlex; departamento queda null

        u["nombre"] = u["nombre"] or re.sub(r"^U\.\s*N\.\s*", "UNIVERSIDAD NACIONAL ", nm).upper()
        u["corto"] = u["sigla"] or re.sub(r"^UNIVERSIDAD NACIONAL", "U.N.", u["nombre"])
        if u["licencia"] is None:
            u["licencia"] = "No figura en el padrón SUNEDU (ago-2024)"
        unis[p] = u

    sin_pliego = [r["NOMBRE"] + " (SUNEDU; " + r["ESTADO_LICENCIAMIENTO"].lower() + ")"
                  for r in lic if r["CODIGO_ENTIDAD"] not in usados_lic]

    cov = lambda f: sum(1 for u in unis.values() if u[f])
    out = {
        "generado": datetime.datetime.now().isoformat(timespec="seconds"),
        "fuentes": {
            "pliegos": "MEF · Consulta Amigable (apps5.mineco.gob.pe/transparencia/Navegador), Gobierno Nacional > Sector 10 Educación > Pliego, años 2016, 2020, 2025, 2026",
            "matricula": f"MINEDU-DIGESU · SIRIES · 'Estadísticas a Nivel Nacional Tabla Matriculados' (hdl.handle.net/20.500.12799/11629), 2018-2023, corte {corte}",
            "docentes": f"MINEDU-DIGESU · SIRIES · 'Estadísticas a Nivel Nacional Tabla Docentes' (hdl.handle.net/20.500.12799/11625), 2018-2023, corte {corte}",
            "ingresantes": "MINEDU-DIGESU · SIRIES · Tabla Ingresantes (hdl.handle.net/20.500.12799/11627)",
            "postulantes": "MINEDU-DIGESU · SIRIES · Tabla Postulantes (hdl.handle.net/20.500.12799/11630)",
            "licenciamiento": "SUNEDU · Licenciamiento Institucional (datosabiertos.gob.pe/dataset/sunedu-licenciamiento-institucional), FECHA_CORTE 2024-08-28",
            "publicaciones": "OpenAlex API (CC0) · works?filter=institutions.id:I…&group_by=publication_year",
            "investigadores": "OpenAlex API · authors?filter=last_known_institutions.id:I…,works_count:>4 (NO es RENACYT)",
            "creacion": "ROR (established) y, en su defecto, Wikipedia 'Anexo:Universidades del Perú'",
        },
        "notas": [
            "Estudiantes = matriculados (pregrado y posgrado juntos, según la tabla SIRIES 'Universidades'); no es FTE. Un año con 0 en SIRIES se publica como ausente (la universidad aún no reportaba o no tenía alumnos).",
            "Docentes = conteo SIRIES por universidad (incluye ordinarios, contratados y extraordinarios, todos los regímenes de dedicación; la tabla por universidad no desagrega condición ni dedicación). No es equivalente a tiempo completo.",
            "SIRIES por universidad solo existe para 2018-2023 (corte 23-dic-2024). Para gasto por estudiante de 2024-2025 hay que usar el último año disponible (campo estudiantes_ultimo_anio) y decirlo.",
            "U.N. San Cristóbal de Huamanga (516): SIRIES marca 2023 como 'S.I.' (sin información; la UNSCH reemplazó su calendario 2024-I por 2023-1, Oficio 019-2024-UNSCH-VRAC); su último año es 2022.",
            "Publicaciones OpenAlex cuentan todo tipo de trabajo (artículos, tesis indexadas, capítulos, datasets) con al menos un autor afiliado; dependen de la calidad de afiliación en OpenAlex. Los últimos 12-18 meses suelen estar sub-registrados.",
            "'investigadores' son autores en OpenAlex con >4 trabajos y última afiliación en la universidad: aproximación bibliométrica, NO el registro RENACYT de CONCYTEC (no se encontró descarga abierta por institución).",
            "Licencia = estado en el dataset SUNEDU (corte 28-ago-2024). Varias licencias de 6 años ya vencieron en 2024-2025; el dataset no refleja renovaciones posteriores.",
            "Las universidades creadas por ley desde 2020 (pliegos 563 en adelante) aún no tienen matrícula, docentes ni publicaciones en las fuentes; sus campos quedan null, no 0.",
            "Las universidades 'arte' (Música, Arte Diego Quispe Tito, Folklore José María Arguedas, Bellas Artes, Daniel Alomía Robles) provienen de escuelas superiores reconvertidas; no figuran en SIRIES ni en el padrón SUNEDU.",
            "Año de creación: ROR 'established' o Wikipedia; puede ser el año de fundación histórica (p. ej. San Marcos 1551) y no el de la ley vigente. Hay discrepancias conocidas entre fuentes (p. ej. U.N. Intercultural de Quillabamba: ROR 2010, Wikipedia 2019).",
        ],
        "cobertura": {"pliegos": len(unis), "estudiantes": cov("estudiantes"), "docentes": cov("docentes"),
                      "ingresantes": cov("ingresantes"), "postulantes": cov("postulantes"), "pubs": cov("pubs"),
                      "investigadores": cov("investigadores"), "licencia_sunedu": sum(1 for u in unis.values() if u["licencia_inicio"] or u["licencia"] in ("Denegada", "No presentó solicitud")),
                      "lat_lng": cov("lat"), "creacion": cov("creacion")},
        "universidades": unis,
        "sin_pliego": sin_pliego,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(out["cobertura"], ensure_ascii=False))
    print("sin_pliego:", sin_pliego)


if __name__ == "__main__":
    main()
