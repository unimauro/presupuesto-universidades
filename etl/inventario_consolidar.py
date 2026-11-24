#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Consolida datos YA EXISTENTES (otros repos + VPS) en data/existente/, llave = pliego 3 díg, montos en S/.

Entradas (solo lectura):
  ~/Documents/Repos/observatorio-{uni,sanmarcos,unsaac,unsa,villarreal,unalm,cantuta}/data/presupuesto-*.json
  ~/Documents/Repos/universidades-peru/data/universidades.json   (PIM/dev 2025 + PP0137, en S/ millones)
  data/existente/siaf_vps/raw_{2024,2025}.json   (de etl/inventario_siaf_vps.sh: detalle SIAF del VPS)
  data/existente/conosce_raw.csv                 (de etl/inventario_conosce.sh: CONOSCE del VPS)
  data/existente/planilla.json                   (de etl/inventario_planilla.py, para nombres de pliego)
Salidas:
  data/existente/series_observatorios.json   {pliego:{anio:{pia,pim,cert,dev,gir,ejec_pct}}}
  data/existente/detalle_observatorios.json  {pliego:{anio, por_generica, por_fuente, ...}}
  data/existente/siaf_2024_2025.json         {pliego:{anio:{tot, por_generica, por_fuente, por_rubro,
                                                programa_ppto, por_tipo, por_funcion, por_ejecutora}}}
  data/existente/proyectos_2024_2025.json    {pliego:{anio:[{cui, proyecto, pim, dev, ...}]}}
  data/existente/conosce.json                {pliego:{anio:{objeto:{procesos, items, adjudicado}}}}
  data/existente/universidades_peru_2025.json {pliego:{pim, dev, pp0137_pim, pp0137_dev, openalex...}}
"""
import csv, json, os, re, unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPOS = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "..", "data", "existente")
OBS = ["uni", "sanmarcos", "unsaac", "unsa", "villarreal", "unalm", "cantuta"]
K = ["pia", "pim", "cert", "comp", "dev", "gir"]


def dump(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print("escrito", name)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\bU\.\s*N\.\s*", "UNIVERSIDAD NACIONAL ", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# ---------- 1) observatorios ----------
series, detalle = {}, {}
for o in OBS:
    d = os.path.join(REPOS, f"observatorio-{o}", "data")
    fn = next(f for f in os.listdir(d) if f.startswith("presupuesto-") and f.endswith(".json"))
    j = json.load(open(os.path.join(d, fn)))
    p = j["_meta"]["pliego"].split("·")[0].strip().zfill(3)
    series[p] = {"_fuente": f"observatorio-{o}/data/{fn}", "_meta": j["_meta"],
                 **{str(r["year"]): {k: r.get(k) for k in ("pia", "pim", "cert", "dev", "gir", "ejec_pct")}
                    for r in j["serie"]}}
    det = {}
    for key in ("detalle_ultimo_anio", "detalle_anio_en_curso"):
        x = j.get(key)
        if isinstance(x, dict) and x.get("anio"):
            det[str(x["anio"])] = {k: v for k, v in x.items() if k != "anio" and v not in ([], None)}
    if det:
        detalle[p] = {"_fuente": f"observatorio-{o}/data/{fn}", **det}
series_meta = {"_meta": {"descripcion": "Series PIA/PIM/cert/dev/gir por pliego desde los observatorios ya publicados",
                         "unidad": "S/ corrientes", "anio_parcial": 2026,
                         "nota": "2012-2024 Consulta Amigable; 2025-2026 SIAF/CA según repo (ver _meta de cada pliego). "
                                 "2026 = parcial al corte indicado en cada _meta.",
                         "generado_por": "etl/inventario_consolidar.py"}}
dump("series_observatorios.json", {**series_meta, **series})
dump("detalle_observatorios.json", {"_meta": {"descripcion": "Desgloses (genérica, fuente, función, programa, unidad) "
                                              "del último año / año en curso, tal como los publican los observatorios",
                                              "unidad": "S/", "generado_por": "etl/inventario_consolidar.py"}, **detalle})

# ---------- nombres de pliego (para cruces por nombre) ----------
pliego_nombre = {}
pl = os.path.join(OUT, "planilla.json")
if os.path.exists(pl):
    for p, yrs in json.load(open(pl)).items():
        if p != "_meta":
            pliego_nombre[p] = yrs[max(yrs)]["nombre"]

# ---------- 2) SIAF del VPS ----------
siaf, proys = {}, {}
for y in (2024, 2025):
    f = os.path.join(OUT, "siaf_vps", f"raw_{y}.json")
    if not os.path.exists(f) or os.path.getsize(f) < 100:
        continue
    raw = json.load(open(f))
    for p, n in raw["pliegos"].items():
        pliego_nombre.setdefault(p, n)
    cols = raw["cubo"]["cols"]
    ix = {c: i for i, c in enumerate(cols)}
    dims = {"por_generica": "generica", "por_fuente": "fuente", "por_rubro": "rubro",
            "por_programa_ppto": "programa_ppto", "por_tipo_act_proy": "tipo_act_proy",
            "por_funcion": "funcion", "por_categoria_gasto": "categoria_gasto", "por_ejecutora": "sec_ejec"}
    acc = defaultdict(lambda: {"tot": [0.0] * 6, **{d: defaultdict(lambda: [0.0] * 6) for d in dims}})
    for r in raw["cubo"]["rows"]:
        a = acc[r[ix["pliego"]]]
        v = r[len(cols) - 6:]
        for i in range(6):
            a["tot"][i] += v[i]
        for d, c in dims.items():
            key = r[ix[c]]
            if c == "sec_ejec":
                key = f"{key}: {raw['ejecutoras'].get(key, ['', ''])[1]}"
            for i in range(6):
                a[d][key][i] += v[i]
    for p, a in acc.items():
        rec = {"meses_en_archivo": raw["meses_en_archivo"], "nombre": raw["pliegos"][p],
               "tot": {k: round(x) for k, x in zip(K, a["tot"])}}
        for d in dims:
            rec[d] = {k: {kk: round(x) for kk, x in zip(K, v)}
                      for k, v in sorted(a[d].items(), key=lambda kv: -kv[1][1])}
        siaf.setdefault(p, {})[str(y)] = rec
    pc = raw["proyectos"]["cols"]
    byp = defaultdict(lambda: defaultdict(lambda: {"proyecto": "", "por_fuente": {}, **{k: 0.0 for k in K}}))
    for r in raw["proyectos"]["rows"]:
        p, cui, nom, fte = r[0], r[1], r[2], r[3]
        b = byp[p][cui]
        b["proyecto"] = nom
        v = r[4:]
        for k, x in zip(K, v):
            b[k] += x
        b["por_fuente"][fte] = {"pim": round(v[1]), "dev": round(v[4])}
    for p, cs in byp.items():
        proys.setdefault(p, {})[str(y)] = sorted(
            [{"cui": c, **{k: (round(v) if isinstance(v, float) else v) for k, v in b.items()}} for c, b in cs.items()],
            key=lambda x: -x["pim"])
if siaf:
    dump("siaf_2024_2025.json", {"_meta": {
        "fuente": "Detalle SIAF completo MEF (AAAA-Gasto.csv.gz) descargado por qhaway en el VPS: /opt/qhaway-api/raw/",
        "filtro": "SECTOR=10 y PLIEGO_NOMBRE contiene UNIVERSIDAD", "unidad": "S/",
        "montos": "pia, pim, cert (certificado), comp (compromiso anual), dev (devengado), gir (girado)",
        "corte": "2024 descargado 1-jul-2026 (año cerrado); 2025 descargado 25-jun-2026 (año cerrado)",
        "generica": "clave 'TIPO_TRANSACCION.GENERICA: NOMBRE' (2.x = gasto)",
        "generado_por": "etl/inventario_siaf_vps.sh + etl/inventario_consolidar.py"}, **dict(sorted(siaf.items()))})
    dump("proyectos_2024_2025.json", {"_meta": {
        "descripcion": "Proyectos de inversión (TIPO_ACT_PROY=2) por pliego universitario, desde el SIAF del VPS",
        "unidad": "S/", "generado_por": "etl/inventario_consolidar.py"}, **dict(sorted(proys.items()))})

# ---------- 3) universidades-peru (cruce 2025 + pliego<->OpenAlex) ----------
up = json.load(open(os.path.join(REPOS, "universidades-peru", "data", "universidades.json")))
upo = {}
for u in up["unis"]:
    if u.get("pliego"):
        upo[u["pliego"].zfill(3)] = {"k": u["k"], "nombre": u["name"], "acron": u["acron"], "ciudad": u["city"],
                                     "openalex": u["oa"], "ror": u["ror"],
                                     "pim_2025": round(u["pim"] * 1e6) if u.get("pim") is not None else None,
                                     "dev_2025": round(u["dev"] * 1e6) if u.get("dev") is not None else None,
                                     "pp0137_pim_2025": round(u["idi"] * 1e6) if u.get("idi") else 0,
                                     "pp0137_dev_2025": round(u["idi_dev"] * 1e6) if u.get("idi_dev") else 0,
                                     "works": u["works"], "h": u["h"], "w25": u.get("w25"), "inv": u.get("inv")}
dump("universidades_peru_2025.json", {"_meta": {
    "fuente": "universidades-peru/data/universidades.json (OpenAlex + MEF/SIAF 2025)",
    "nota": "Montos originales en S/ millones con 1 decimal -> convertidos a S/ (precisión ±50 mil). "
            "Útil como cruce y como mapeo pliego<->OpenAlex/ROR; no es fuente primaria.",
    "generado_por": "etl/inventario_consolidar.py"}, **dict(sorted(upo.items()))})

# ---------- 4) CONOSCE (VPS GoPues) ----------
cf = os.path.join(OUT, "conosce_raw.csv")
if os.path.exists(cf):
    STOP = {"UNIVERSIDAD", "NACIONAL", "DE", "DEL", "LA", "LAS", "LOS", "Y", "EL"}
    key = lambda s: " ".join(t for t in norm(s).split() if t not in STOP)
    idx = {key(n): p for p, n in pliego_nombre.items()}
    # alias revisados a mano (nombres CONOSCE que difieren del nombre de pliego)
    ALIAS = {"JOSE F SANCHEZ CARRION": "530", "DIEGO QUISPE TITO": "560", "FRONTERA SULLANA": "548",
             "SAN ANTONIO ABAD CUSCO UNSAAC": "511", "JORGE BASADRE GROHMANN TACNA": "531"}
    con, sin_match, mapeo = {}, set(), {}
    for r in csv.DictReader(open(cf, encoding="utf-8")):
        k = key(r["entidad"])
        p = idx.get(k) or ALIAS.get(k)
        if not p:
            sin_match.add(r["entidad"]); continue
        mapeo[r["entidad"]] = p
        o = con.setdefault(p, {"_entidades": {}}).setdefault(r["anio"], {}).setdefault(r["objeto"], {
            "procesos": 0, "items": 0, "monto_referencial": 0.0, "monto_adjudicado": 0.0})
        con[p]["_entidades"][r["entidad_ruc"]] = r["entidad"]
        if r["moneda"] != "Soles":
            o.setdefault("otras_monedas", []).append([r["moneda"], float(r["monto_adjudicado"] or 0)]); continue
        o["procesos"] += int(r["procesos"]); o["items"] += int(r["items"])
        o["monto_referencial"] += float(r["monto_referencial"] or 0)
        o["monto_adjudicado"] += float(r["monto_adjudicado"] or 0)
    for p in con.values():
        for y, objs in p.items():
            if y != "_entidades":
                for o in objs.values():
                    o["monto_referencial"] = round(o["monto_referencial"]); o["monto_adjudicado"] = round(o["monto_adjudicado"])
    dump("conosce.json", {"_meta": {
        "fuente": "CONOSCE/OECE (tabla conosce_adjudicaciones de GoPues/licitaperu en el VPS), agregada por entidad",
        "nota": "Montos adjudicados por ítem de procesos de selección (no incluye compras <8 UIT ni órdenes). "
                "Cruce entidad->pliego por nombre normalizado. Moneda distinta de soles se deja en otras_monedas.",
        "sin_match": sorted(sin_match), "mapeo_entidad_pliego": dict(sorted(mapeo.items())), "generado_por": "etl/inventario_conosce.sh + etl/inventario_consolidar.py"},
        **dict(sorted(con.items()))})
