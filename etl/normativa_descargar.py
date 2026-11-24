"""Descarga los PDFs de las normas candidatas (DS de transferencia, RM MINEDU, leyes).

Lee etl/cache/normativa/descubiertas.json (de normativa_descubrir.py) y baja cada PDF
a etl/cache/normativa/pdf/<id>/<archivo>.pdf  (gitignored). Rate-limit 1 req/s.
Uso: ~/.venvs/pu-normativa/bin/python etl/normativa_descargar.py
"""
import json
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "etl" / "cache" / "normativa"
PDF = CACHE / "pdf"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"

REL = re.compile(
    r"transferencia de partidas|cr[ée]dito suplementario|desagregaci[óo]n de los recursos|"
    r"asignaci[óo]n de recursos|transferencia financiera|ley de presupuesto del sector p[úu]blico para el a[ñn]o fiscal",
    re.I,
)


def relevante(c):
    if c["fecha"] < "2016-01-01":
        return False
    if c["titulo"].startswith("Proyecto de Ley") and "2027" not in (c.get("desc_full") or c["desc"]):
        return False  # proyectos de años ya aprobados: no hace falta bajarlos
    txt = c["titulo"] + " " + (c.get("desc_full") or c["desc"])
    return bool(REL.search(txt))


def main():
    cands = json.loads((CACHE / "descubiertas.json").read_text())
    sel = [c for c in cands if relevante(c)]
    # dedup por id
    vistos, uniq = set(), []
    for c in sel:
        if c["id"] not in vistos:
            vistos.add(c["id"])
            uniq.append(c)
    print(f"{len(uniq)} normas relevantes")
    s = requests.Session()
    s.headers["User-Agent"] = UA
    n = 0
    for c in uniq:
        d = PDF / c["id"]
        d.mkdir(parents=True, exist_ok=True)
        for u in [x for x in c["pdfs"] if "/preview_" not in x]:
            name = re.sub(r"[^A-Za-z0-9._-]", "_", u.split("/")[-1].split("?")[0])[-120:]
            f = d / name
            if f.exists() and f.stat().st_size > 1000:
                continue
            try:
                r = s.get(u, timeout=120)
                if r.status_code == 200 and r.content[:4] == b"%PDF":
                    f.write_bytes(r.content)
                    n += 1
                else:
                    print("  fallo", r.status_code, u)
            except requests.RequestException as e:
                print("  ERR", e, u)
            time.sleep(1.0)
    (CACHE / "relevantes.json").write_text(json.dumps(uniq, ensure_ascii=False, indent=1))
    print(f"descargados {n} PDFs nuevos")


if __name__ == "__main__":
    main()
