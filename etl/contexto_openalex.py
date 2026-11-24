#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente CONTEXTO — OpenAlex (+ ROR) por universidad pública.

1. Resuelve pliego -> OpenAlex id:
   a) universidades-peru/data/universidades.json (campo pliego + oa), si existe;
   b) si no, emparejamiento por nombre contra las instituciones de Perú en OpenAlex
      (etl/cache/contexto/openalex/inst_pe_*.json; se bajan si faltan);
   c) OVERRIDES manuales verificados (abajo).
2. Por cada id baja (y cachea en etl/cache/contexto/openalex/{id}.json):
   - works agrupados por publication_year (todas las tipologías OpenAlex),
   - nº de autores con last_known_institution = la uni y works_count > 4 ("autores_openalex"),
   - ficha de la institución (ror, geo) y del ROR (established = año de fundación según ROR).

Uso: ~/.venvs/pu-contexto/bin/python etl/contexto_openalex.py [--force]
Salida: etl/cache/contexto/openalex/mapa_pliegos.json + un JSON por institución.
"""
import argparse, json, os, sys, time
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contexto_fuentes import CACHE, best, openalex_inst_pe, pliegos, unis_peru

OA = "https://api.openalex.org"
UA = "observatorio-presupuesto-universidades/1.0 (datos abiertos; mailto:datos@example.org)"
PARAMS = {"mailto": "datos@example.org"}  # genérico, no personal
DIR = os.path.join(CACHE, "openalex")
OVERRIDES = {  # pliego -> id OpenAlex, verificados a mano (el emparejamiento automático empata o no llega)
    "537": "I4210142113",  # U.N. de Huancavelica (dos variantes de nombre en OpenAlex empatan)
}

S = requests.Session(); S.headers["User-Agent"] = UA


def get(url, params=None):
    for i in range(5):
        try:
            r = S.get(url, params={**PARAMS, **(params or {})}, timeout=60)
            if r.status_code == 429:
                time.sleep(5 * (i + 1)); continue
            r.raise_for_status()
            time.sleep(0.15)
            return r.json()
        except requests.RequestException as e:
            print("  reintento", url, repr(e)[:80]); time.sleep(3 * (i + 1))
    raise RuntimeError(url)


def ensure_inst_pe():
    if openalex_inst_pe():
        return
    os.makedirs(DIR, exist_ok=True)
    for p in (1, 2, 3):
        d = get(f"{OA}/institutions", {"filter": "country_code:PE,type:education", "per-page": 200, "page": p,
                                       "select": "id,display_name,ror,works_count,display_name_alternatives,geo,ids"})
        json.dump(d, open(os.path.join(DIR, f"inst_pe_{p}.json"), "w"))


def resolve():
    ensure_inst_pe()
    up = {u["pliego"]: u["oa"].rsplit("/", 1)[-1] for u in unis_peru() if u.get("pliego") and u.get("oa")}
    inst = openalex_inst_pe()
    cand = [(x, nm) for x in inst for nm in [x["display_name"]] + (x.get("display_name_alternatives") or [])]
    out = {}
    for p, d in sorted(pliegos().items()):
        if p in OVERRIDES:
            out[p] = {"openalex": OVERRIDES[p], "via": "override manual"}
        elif p in up:
            out[p] = {"openalex": up[p], "via": "universidades-peru/data/universidades.json"}
        else:
            m, s = best(d["nombre_mef"], cand, key=lambda c: c[1])
            out[p] = {"openalex": m[0]["id"].rsplit("/", 1)[-1] if m else None,
                      "via": f"nombre ~ '{m[1]}' (score {s:.2f})" if m else "sin match en OpenAlex"}
    return out


def fetch(oid, force=False):
    fp = os.path.join(DIR, f"{oid}.json")
    if os.path.exists(fp) and not force:
        return json.load(open(fp))
    inst = get(f"{OA}/institutions/{oid}", {"select": "id,display_name,ror,geo,works_count"})
    yrs = get(f"{OA}/works", {"filter": f"institutions.id:{oid}", "group_by": "publication_year", "per-page": 200})
    aut = get(f"{OA}/authors", {"filter": f"last_known_institutions.id:{oid},works_count:>4", "per-page": 1})
    ror = None
    if inst.get("ror"):
        try:
            ror = requests.get("https://api.ror.org/v2/organizations/" + inst["ror"].rsplit("/", 1)[-1],
                               headers={"User-Agent": UA}, timeout=40).json()
        except Exception as e:
            print("  ROR falla", oid, repr(e)[:80])
    d = {"consultado": time.strftime("%Y-%m-%d"), "inst": inst,
         "pubs": {g["key"]: g["count"] for g in yrs.get("group_by", [])},
         "autores_openalex": aut["meta"]["count"],
         "ror_established": (ror or {}).get("established"),
         "ror_locations": (ror or {}).get("locations")}
    json.dump(d, open(fp, "w"), ensure_ascii=False)
    return d


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    os.makedirs(DIR, exist_ok=True)
    m = resolve()
    json.dump(m, open(os.path.join(DIR, "mapa_pliegos.json"), "w"), ensure_ascii=False, indent=1)
    for p, x in m.items():
        if x["openalex"]:
            d = fetch(x["openalex"], a.force)
            print(p, x["openalex"], "pubs2024:", d["pubs"].get("2024"), "autores:", d["autores_openalex"],
                  "ROR est.:", d["ror_established"])
        else:
            print(p, "sin OpenAlex")


if __name__ == "__main__":
    main()
