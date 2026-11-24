#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agrega etl/cache/ingresos/{AÑO}.csv (filtrados por ingresos_descarga.py) y escribe
data/ingresos/ingresos.json con el contrato:

universidades[pliego].anios[año] = {
  total:{pia,pim,recaudado},
  fuente:{NOMBRE FUENTE:{pia,pim,recaudado}},
  generica:{"1.3 NOMBRE":{pia,pim,recaudado}},
  rdr_detalle:{"1.3.2.3.1.2 NOMBRE ESPECIFICA DETALLE":{pia,pim,recaudado}},   # solo fuente RDR
  rdr_categoria:{"Admisión":{pia,pim,recaudado}, ...},                         # agrupación propia de rdr_detalle
  rdr_sin_saldos:{pia,pim,recaudado}                                            # RDR excluyendo 1.9 Saldos de balance
}
Montos en soles, redondeados a 2 decimales. Se omiten partidas con pia=pim=recaudado=0.

Uso: ~/.venvs/pu-ingresos/bin/python etl/ingresos_build.py
"""
import csv, glob, json, os, re
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "ingresos")
OUT = os.path.join(HERE, "..", "data", "ingresos", "ingresos.json")
KEYS = ("pia", "pim", "recaudado")


def z():
    return {"pia": 0.0, "pim": 0.0, "recaudado": 0.0}


def add(d, v):
    for k in KEYS:
        d[k] += v[k]


def f(x):
    try:
        return float(x or 0)
    except ValueError:
        return 0.0


def nombre_largo(n):
    n = re.sub(r"\s+", " ", n.strip())
    return re.sub(r"^U\.\s*N\.\s*", "UNIVERSIDAD NACIONAL ", n)


def categoria_rdr(r):
    """Agrupa el clasificador de ingresos (específica detalle) en categorías legibles."""
    g, sg, sgd = r["GENERICA"], r["SUBGENERICA"], r["SUBGENERICA_DET"]
    n = r["ESPECIFICA_DET_NOMBRE"].upper()
    if g == "9":
        return "Saldos de balance"
    if "ADMISION" in n:
        return "Admisión (examen e inscripción)"
    if "PREUNIVERSITARIO" in n:
        return "Centro preuniversitario (CEPRE)"
    if "PENSION DE ENSE" in n:
        return "Pensiones de enseñanza (posgrado, 2ª especialidad, etc.)"
    if "MATRICULA" in n:
        return "Matrícula"
    if any(t in n for t in ("GRADOS", "TITULOS", "CONSTANCIAS", "CERTIFICADOS", "CARNETS",
                             "TRASLADOS", "CONVALIDACIONES", "DERECHOS UNIVERSITARIOS", "INSCRIPCION")):
        return "Grados, títulos, certificados y otros trámites"
    if "SERVICIOS ACADEMICOS" in n:
        return "Servicios académicos"
    if "CAPACITACION" in n:
        return "Capacitación y extensión"
    if g == "3" and sg == "2":
        return "Otros derechos administrativos y tasas"
    if g == "3" and sg == "1":
        return "Venta de bienes (producción agrícola, pecuaria, publicaciones…)"
    if g == "3" and sg == "3" and sgd == "5":
        return "Alquileres"
    if g == "3" and sg == "3":
        return "Otros servicios (salud, laboratorio, consultoría, comedor…)"
    if g == "5" and sg == "1":
        return "Rentas de la propiedad (intereses)"
    if g == "5":
        return "Multas, sanciones e ingresos diversos"
    if g == "4":
        return "Donaciones y transferencias"
    return "Otros"


def rnd(d):
    return {k: round(v, 2) for k, v in d.items()}


def limpio(m):
    return {k: rnd(v) for k, v in sorted(m.items()) if any(abs(v[x]) >= 0.005 for x in KEYS)}


def main():
    unis = {}
    nombres = {}
    for path in sorted(glob.glob(os.path.join(CACHE, "*.csv"))):
        year = os.path.basename(path)[:4]
        acc = defaultdict(lambda: {"total": z(), "fuente": defaultdict(z), "generica": defaultdict(z),
                                   "rdr_detalle": defaultdict(z), "rdr_categoria": defaultdict(z),
                                   "rdr_sin_saldos": z()})
        with open(path, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                pl = r["PLIEGO"].strip().zfill(3)
                nombres[pl] = (year, nombre_largo(r["PLIEGO_NOMBRE"]))  # año más reciente gana (orden)
                v = {"pia": f(r["MONTO_PIA"]), "pim": f(r["MONTO_PIM"]), "recaudado": f(r["MONTO_RECAUDADO"])}
                a = acc[pl]
                add(a["total"], v)
                add(a["fuente"][r["FUENTE_FINANCIAMIENTO_NOMBRE"].strip()], v)
                add(a["generica"][f"1.{r['GENERICA']} {r['GENERICA_NOMBRE'].strip()}"], v)
                if r["FUENTE_FINANCIAMIENTO"].strip() == "2":
                    code = ".".join(["1", r["GENERICA"], r["SUBGENERICA"], r["SUBGENERICA_DET"],
                                     r["ESPECIFICA"], r["ESPECIFICA_DET"]])
                    add(a["rdr_detalle"][f"{code} {r['ESPECIFICA_DET_NOMBRE'].strip()}"], v)
                    add(a["rdr_categoria"][categoria_rdr(r)], v)
                    if r["GENERICA"] != "9":
                        add(a["rdr_sin_saldos"], v)
        for pl, a in acc.items():
            u = unis.setdefault(pl, {"nombre": "", "anios": {}})
            u["anios"][year] = {"total": rnd(a["total"]), "fuente": limpio(a["fuente"]),
                                "generica": limpio(a["generica"]), "rdr_detalle": limpio(a["rdr_detalle"]),
                                "rdr_categoria": limpio(a["rdr_categoria"]),
                                "rdr_sin_saldos": rnd(a["rdr_sin_saldos"])}
        print(f"{year}: {len(acc)} universidades", flush=True)
    for pl, u in unis.items():
        u["nombre"] = nombres[pl][1]
        u["anios"] = dict(sorted(u["anios"].items()))
    years = sorted({y for u in unis.values() for y in u["anios"]})
    out = {
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": ("MEF – Datos Abiertos, 'Presupuesto y Ejecución de Ingreso' "
                   "(fs.datosabiertos.mef.gob.pe/datastorefiles/{AÑO}-Ingreso.csv; 2025-2026: {AÑO}-Ingreso-Diario.csv). "
                   "Validado contra la Consulta Amigable de Ingresos (apps5.mineco.gob.pe/TransparenciaIngresos/Navegador)."),
        "anios": years,
        "notas": [
            "Universo: pliegos del Sector 10 Educación con código 5xx y nombre de universidad nacional.",
            "Montos en soles nominales (sin deflactar). PIA = presupuesto inicial de ingresos; PIM = modificado; "
            "recaudado = ingreso efectivamente captado/recibido en el año.",
            "El presupuesto de INGRESOS no incluye Recursos Ordinarios (RO): el Tesoro los asigna en el lado del gasto, "
            "no los 'recauda' la universidad. Para la dependencia de RO usar data/gasto.",
            "Recaudado puede superar al PIM: típico en Recursos Determinados (canon/sobrecanon transferido por el MEF "
            "sin incorporarse al PIM en el año) y en Saldos de balance.",
            "'1.9 SALDOS DE BALANCE' no es ingreso nuevo: es caja no gastada de años anteriores que se reincorpora. "
            "rdr_sin_saldos = RDR excluyendo saldos de balance (mejor medida de la recaudación propia del año).",
            "rdr_detalle usa el clasificador de ingresos a nivel específica-detalle (código 1.G.SG.SGD.E.ED); "
            "rdr_categoria es una agrupación propia (no oficial) de ese detalle.",
            f"El año {years[-1]} es parcial (archivo diario del MEF al día de generación).",
        ],
        "universidades": dict(sorted(unis.items())),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"escrito {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB), {len(unis)} universidades, años {years[0]}-{years[-1]}")


if __name__ == "__main__":
    main()
