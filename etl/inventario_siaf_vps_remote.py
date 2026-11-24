#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Se ejecuta EN EL VPS vía stdin (solo lectura): lee /opt/qhaway-api/raw/{anio}-Gasto.csv.gz
(detalle SIAF completo descargado por qhaway) y emite por stdout, en JSON, el agregado de los pliegos
universitarios (SECTOR=10 y PLIEGO_NOMBRE con 'UNIVERSIDAD' o que empieza con 'U.N.').
No escribe nada en disco. Lo invoca etl/inventario_siaf_vps.py.
"""
import csv, gzip, io, json, sys
from collections import defaultdict

anio = sys.argv[1]
path = f"/opt/qhaway-api/raw/{anio}-Gasto.csv.gz"
M = ["MONTO_PIA", "MONTO_PIM", "MONTO_CERTIFICADO", "MONTO_COMPROMETIDO_ANUAL", "MONTO_DEVENGADO", "MONTO_GIRADO"]
K = ["pia", "pim", "cert", "comp", "dev", "gir"]


def f(x):
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


cubo = defaultdict(lambda: [0.0] * 6)
proy = defaultdict(lambda: [0.0] * 6)
nombres, ejec, meses = {}, {}, set()
with gzip.open(path, "rt", encoding="utf-8", errors="ignore", newline="") as fh:
    for r in csv.DictReader(fh):
        if r["SECTOR"] != "10":
            continue
        pn = r["PLIEGO_NOMBRE"].strip().upper()
        if "UNIVERSIDAD" not in pn and not pn.startswith("U.N."):
            continue
        p = r["PLIEGO"].strip().zfill(3)
        nombres[p] = pn
        ejec[r["SEC_EJEC"]] = (p, r["EJECUTORA_NOMBRE"].strip())
        meses.add(r["MES_EJE"])
        v = [f(r[m]) for m in M]
        k = (p, r["SEC_EJEC"], r["TIPO_ACT_PROY_NOMBRE"], r["PROGRAMA_PPTO"] + ": " + r["PROGRAMA_PPTO_NOMBRE"],
             r["FUNCION"] + ": " + r["FUNCION_NOMBRE"], r["FUENTE_FINANCIAMIENTO"] + ": " + r["FUENTE_FINANCIAMIENTO_NOMBRE"],
             r["RUBRO"] + ": " + r["RUBRO_NOMBRE"], r["CATEGORIA_GASTO"] + ": " + r["CATEGORIA_GASTO_NOMBRE"],
             r["TIPO_TRANSACCION"] + "." + r["GENERICA"] + ": " + r["GENERICA_NOMBRE"])
        a = cubo[k]
        for i in range(6):
            a[i] += v[i]
        if r["TIPO_ACT_PROY"] == "2":  # proyectos de inversión
            kp = (p, r["PRODUCTO_PROYECTO"], r["PRODUCTO_PROYECTO_NOMBRE"].strip(),
                  r["FUENTE_FINANCIAMIENTO"] + ": " + r["FUENTE_FINANCIAMIENTO_NOMBRE"])
            b = proy[kp]
            for i in range(6):
                b[i] += v[i]

cols = ["pliego", "sec_ejec", "tipo_act_proy", "programa_ppto", "funcion", "fuente", "rubro",
        "categoria_gasto", "generica"] + K
json.dump({"anio": int(anio), "meses_en_archivo": sorted(meses, key=int), "pliegos": nombres,
           "ejecutoras": ejec,
           "cubo": {"cols": cols, "rows": [list(k) + [round(x, 2) for x in v] for k, v in cubo.items()]},
           "proyectos": {"cols": ["pliego", "cui", "proyecto", "fuente"] + K,
                         "rows": [list(k) + [round(x, 2) for x in v] for k, v in proy.items()]}},
          sys.stdout, ensure_ascii=False, separators=(",", ":"))
