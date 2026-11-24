#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Línea base: presupuesto público total vs universidades.

Para 2012-2026 (2026 parcial) obtiene PIA/PIM/Certificación/Compromiso/Devengado/Girado de:
  total (3 niveles), Gobierno Nacional, Sector 10 Educación (GN), Función 22 Educación
  (3 niveles), Gobiernos Regionales, Gobiernos Locales  — Consulta Amigable del MEF
  (reusa la navegación y caché de etl/gasto_consulta_amigable.py, etl/cache/gasto/).
+ PBI nominal anual del BCRP (serie PM04946AA, millones S/ → se guarda en soles).

Uso: ~/.venvs/pu-gasto/bin/python etl/baseline_consulta_amigable.py
Salida: data/baseline/baseline.json
"""
import datetime as dt
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gasto_consulta_amigable as g  # noqa: E402

OUT = os.path.join(g.ROOT, "data", "baseline", "baseline.json")
BCRP_PBI = "PM04946AA"  # Producto bruto interno por tipo de gasto (millones S/) - PBI
YEARS = list(range(2012, 2027))


def total_row(soup):
    """Fila TOTAL (primer radio, código vacío): /PIA/PIM/Comp/Aten/Dev/Gir/Cert."""
    v = soup.select_one("input[name=grp1]").get("value", "").split("/")[-7:]
    pia, pim, comp, _a, dev, gir, cert = [float(x) if x.strip() else 0.0 for x in v]
    return {"pia": pia, "pim": pim, "cert": cert, "comp": comp, "dev": dev, "gir": gir}


def year_data(y):
    k0 = f"{y}_ActProy_root"
    R = g.root(y, "ActProy")
    k1, T = g.step(k0, R, y, None, "tipo")
    tipos = g.rows(T)
    k2, S = g.step(k1, T, y, "E", "sector")
    kf, F = g.step(k0, R, y, None, "funcion")
    fun = g.rows(F)
    if "22" not in fun or "EDUCACION" not in fun["22"]["nombre"].upper():
        raise RuntimeError(f"{y}: función 22 no es EDUCACION: {list(fun.items())[:3]}")
    return {
        "total": g.m6(total_row(R)),
        "gob_nacional": g.m6(tipos["E"]),
        "sector_educacion": g.m6(g.rows(S)["10"]),
        "funcion_educacion": g.m6(fun["22"]),
        "gob_regionales": g.m6(tipos["R"]),
        "gob_locales": g.m6(tipos["M"]),
    }


def pbi():
    url = f"https://estadisticas.bcrp.gob.pe/estadisticas/series/api/{BCRP_PBI}/json/{YEARS[0]}/{YEARS[-1]}"
    j = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=60).json()
    name = j["config"]["series"][0]["name"]
    assert "millones S/" in name and name.endswith("PBI"), name
    return {int(p["name"]): float(p["values"][0]) * 1e6 for p in j["periods"]
            if p["values"] and p["values"][0] not in ("n.d.", "")}


def main():
    g.BTN["funcion"] = "ctl00$CPH1$BtnFuncion"
    p = pbi()
    anios, notas = {}, []
    for y in YEARS:
        d = year_data(y)
        s = sum(d[k]["pim"] for k in ("gob_nacional", "gob_regionales", "gob_locales"))
        if abs(s - d["total"]["pim"]) > 1:
            notas.append(f"{y}: GN+GR+GL PIM ({s:.0f}) ≠ total ({d['total']['pim']:.0f})")
        d["pbi_nominal"] = round(p[y], 2) if y in p else None
        anios[str(y)] = d
        print(y, f"PIM total {d['total']['pim'] / 1e9:.1f} mil M | sector10 {d['sector_educacion']['pim'] / 1e9:.2f}"
                 f" | f22 {d['funcion_educacion']['pim'] / 1e9:.2f} | PBI {(p.get(y) or 0) / 1e12:.3f} bill.", flush=True)
    corte = g.fecha_corte(g.ANIO_PARCIAL)
    out = {
        "generado": dt.datetime.now().isoformat(timespec="seconds"),
        "fuente": "MEF — Consulta Amigable (gasto, https://apps5.mineco.gob.pe/transparencia/Navegador/); "
                  f"PBI: BCRPData serie {BCRP_PBI} (PBI por tipo de gasto, millones S/ corrientes)",
        "notas": [
            "Montos en soles corrientes (nominales).",
            "total = los 3 niveles de gobierno (fila TOTAL de la Consulta Amigable); gob_nacional/gob_regionales/"
            "gob_locales = Nivel de Gobierno E/R/M.",
            "sector_educacion = Sector 10 Educación del Gobierno Nacional (MINEDU, universidades, SUNEDU, IPD, etc.).",
            "funcion_educacion = Función 22 Educación en los 3 niveles (incluye gobiernos regionales y locales).",
            "Las cifras de presupuesto incluyen todas las fuentes de financiamiento y transferencias entre "
            "niveles (hay doble conteo entre niveles en PIM por transferencias; el total es el de la Consulta Amigable).",
            "pbi_nominal en soles (BCRP publica en millones; se multiplicó por 1e6). 2026 = null (aún sin dato anual).",
            f"2026 parcial: ejecución a {corte or 'fecha de consulta'}; el PIM aún puede cambiar.",
        ] + notas,
        "parcial": {"2026": f"a {corte}"} if corte else {},
        "anios": anios,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("escrito", OUT, "| notas:", notas or "sin descuadres GN+GR+GL")


if __name__ == "__main__":
    main()
