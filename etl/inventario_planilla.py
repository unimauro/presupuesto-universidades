#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Planilla de las universidades públicas (pliegos del sector 10 "U.N. ..."/"UNIVERSIDAD ...")
desde el AIRHSP del MEF, SOLO AGREGADOS (el CSV fuente no trae nombres de personas).

Fuente local (ya descargada para peru-transparente / salariosperu):
  ~/salariosperu-data/mef_airhsp/PERSONALSP_{2017..2025}.csv  (~550 MB c/u)
Corte: el último mes disponible de cada año (dic; 2020 llega a nov).
Grupos (igual que peru-transparente/scripts/procesar_airhsp.py):
  activos    = Activos + CAS + Convenio de Administración, ESTADO_REGISTRO=OCUPADO
  pensiones  = Pensionistas, Sobrevivientes, CPMP, ... (OCUPADO)
  vacantes   = ESTADO_REGISTRO=VACANTE (fuera del headcount)
masa_mensual = ING_IMPONIBLE_PERM + ING_NO_IMPONIBLE_PERM + INCENTIVO_UNICO (mensual)
costo_anual  = COSTO_TOTAL_ANUAL (incluye aguinaldos, escolaridad y aportes)
Docentes = DESC_GRUPO_OCASIONAL "Docentes Universitarios".

Salida: data/existente/planilla.json  {pliego3: {anio: {...}}}
Uso: python3 etl/inventario_planilla.py [dir_airhsp]   (solo stdlib)
"""
import csv, json, os, re, sys
from collections import defaultdict

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/salariosperu-data/mef_airhsp")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "existente", "planilla.json")
ACT = {"Activos", "Contrato Administrativo de Servicios", "Convenio de Administración"}
PEN = {"Pensionistas", "Sobrevivientes", "CPMP", "Palmas Magisteriales", "Reconocimientos Estatales"}
UNIV = re.compile(r"^(U\.N\.|UNIVERSIDAD)", re.I)


def num(x):
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


def latest_month(path):
    with open(path, "rb") as fh:
        fh.seek(0, 2); size = fh.tell(); fh.seek(max(0, size - 200000))
        tail = fh.read().decode("utf-8", errors="ignore").splitlines()[1:]
    return max(r[2] for r in csv.reader(tail) if len(r) > 3 and r[2].isdigit())


def z():
    return {"n": 0.0, "masa_mensual": 0.0, "costo_anual": 0.0}


def add(d, n, masa, cta):
    d["n"] += n; d["masa_mensual"] += masa; d["costo_anual"] += cta


def rnd(d):
    return {k: round(v) for k, v in d.items()}


def process(path, anio):
    mes = latest_month(path)
    acc = defaultdict(lambda: {"nombre": "", "activos": z(), "docentes": z(), "no_docentes": z(),
                               "por_regimen": defaultdict(z), "por_grupo": defaultdict(z),
                               "docentes_por_condicion": defaultdict(z),
                               "pensiones": z(), "vacantes": z()})
    with open(path, encoding="utf-8-sig", errors="ignore") as fh:
        for row in csv.DictReader(fh):
            if row["MES"] != mes or row["CODIGO_SECTOR"] != "10":
                continue
            pli = (row["PLIEGO"] or "").strip()
            if not UNIV.match(pli):
                continue
            n = num(row["CANTIDAD"])
            if n <= 0:
                continue
            masa = num(row["ING_IMPONIBLE_PERM_MENSUAL"]) + num(row["ING_NO_IMPONIBLE_PERM_MENSUAL"]) \
                + num(row["INCENTIVO_UNICO_MENSUAL"])
            cta = num(row["COSTO_TOTAL_ANUAL"])
            a = acc[row["CODIGO_PLIEGO"].strip().zfill(3)[-3:]]
            a["nombre"] = pli
            tipo = row["DESC_TIPO_REGISTRO"].strip()
            if row["ESTADO_REGISTRO"].strip().upper() == "VACANTE":
                add(a["vacantes"], n, masa, cta); continue
            if tipo in ACT:
                grp = row["DESC_GRUPO_OCASIONAL"].strip()
                add(a["activos"], n, masa, cta)
                add(a["por_regimen"][row["DESC_REGIMEN_LABORAL"].strip()], n, masa, cta)
                add(a["por_grupo"][grp], n, masa, cta)
                if grp == "Docentes Universitarios":
                    add(a["docentes"], n, masa, cta)
                    add(a["docentes_por_condicion"][row["DESC_CONDICION_LABORAL"].strip()], n, masa, cta)
                else:
                    add(a["no_docentes"], n, masa, cta)
            elif tipo in PEN:
                add(a["pensiones"], n, masa, cta)
    out = {}
    for p, a in acc.items():
        out[p] = {"nombre": a["nombre"], "anio": anio, "mes": int(mes),
                  "servidores": round(a["activos"]["n"]),
                  "activos": rnd(a["activos"]), "docentes": rnd(a["docentes"]),
                  "no_docentes": rnd(a["no_docentes"]),
                  "por_regimen": {k: rnd(v) for k, v in sorted(a["por_regimen"].items(), key=lambda kv: -kv[1]["n"])},
                  "por_grupo_ocupacional": {k: rnd(v) for k, v in sorted(a["por_grupo"].items(), key=lambda kv: -kv[1]["n"])},
                  "docentes_por_condicion": {k: rnd(v) for k, v in sorted(a["docentes_por_condicion"].items(), key=lambda kv: -kv[1]["n"])},
                  "pensiones": rnd(a["pensiones"]), "vacantes": rnd(a["vacantes"])}
    return mes, out


def main():
    data = {}
    files = sorted(f for f in os.listdir(SRC_DIR) if re.match(r"PERSONALSP_\d{4}\.csv$", f))
    for f in files:
        anio = int(f[11:15])
        mes, out = process(os.path.join(SRC_DIR, f), anio)
        for p, rec in out.items():
            data.setdefault(p, {})[str(anio)] = rec
        print(f"{f}: mes {mes}, {len(out)} pliegos universitarios, activos {sum(r['servidores'] for r in out.values()):,}", flush=True)
    meta = {"fuente": "AIRHSP - MEF datos abiertos (PERSONALSP_AAAA.csv), copia local ~/salariosperu-data/mef_airhsp",
            "corte": "último mes disponible de cada año (dic; 2020 = nov)",
            "filtro": "CODIGO_SECTOR=10 y PLIEGO empieza con 'U.N.' o 'UNIVERSIDAD'",
            "definiciones": {"servidores": "activos OCUPADO (Activos+CAS+Convenio), suma de CANTIDAD",
                             "masa_mensual": "ingresos permanentes mensuales (imponible+no imponible+incentivo único), S/",
                             "costo_anual": "COSTO_TOTAL_ANUAL (incl. aguinaldos, escolaridad, aportes), S/",
                             "docentes": "grupo ocupacional 'Docentes Universitarios'",
                             "pensiones": "pensionistas+sobrevivientes a cargo del pliego (no son activos)"},
            "generado_por": "etl/inventario_planilla.py", "nota": "Solo agregados; sin datos personales."}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"_meta": meta, **{p: data[p] for p in sorted(data)}}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("escrito", OUT)


if __name__ == "__main__":
    main()
