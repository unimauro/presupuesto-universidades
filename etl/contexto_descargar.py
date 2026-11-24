#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente CONTEXTO — descarga las fuentes estáticas a etl/cache/contexto/ (gitignored).

  sunedu/licenciamiento_institucional_18.csv   datosabiertos.gob.pe · SUNEDU Licenciamiento Institucional
  minedu/t116{25,27,29,30}.xlsx                repositorio.minedu.gob.pe · SIRIES docentes/ingresantes/matriculados/postulantes
  wikipedia/anexo_universidades.json           es.wikipedia · Anexo:Universidades del Perú (siglas/fundación de respaldo)

Uso (orden completo para re-correr todo):
  ~/.venvs/pu-contexto/bin/python etl/contexto_descargar.py [--force]
  ~/.venvs/pu-contexto/bin/python etl/contexto_pliegos.py
  ~/.venvs/pu-contexto/bin/python etl/contexto_openalex.py [--force]
  ~/.venvs/pu-contexto/bin/python etl/contexto_build.py
"""
import argparse, os, re, sys
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contexto_fuentes import CACHE

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
MINEDU = "https://repositorio.minedu.gob.pe"
SIRIES_HANDLES = {"t11625.xlsx": "11625", "t11627.xlsx": "11627", "t11629.xlsx": "11629", "t11630.xlsx": "11630"}
DIRECT = {
    "sunedu/licenciamiento_institucional_18.csv":
        "https://www.datosabiertos.gob.pe/sites/default/files/Licenciamiento%20Institucional_18.csv",
    "wikipedia/anexo_universidades.json":
        "https://es.wikipedia.org/w/api.php?action=parse&page=Anexo:Universidades_del_Per%C3%BA&prop=wikitext&format=json",
}


def save(rel, content):
    fp = os.path.join(CACHE, rel)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    open(fp, "wb").write(content)
    print("ok", rel, len(content), "bytes")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    s = requests.Session(); s.headers["User-Agent"] = UA
    for rel, url in DIRECT.items():
        if a.force or not os.path.exists(os.path.join(CACHE, rel)):
            r = s.get(url, timeout=180); r.raise_for_status(); save(rel, r.content)
    for f, h in SIRIES_HANDLES.items():
        rel = f"minedu/{f}"
        if not a.force and os.path.exists(os.path.join(CACHE, rel)):
            continue
        page = s.get(f"{MINEDU}/handle/20.500.12799/{h}", timeout=90).text
        m = re.search(r'/bitstream/handle/[^"]+\.xlsx[^"]*', page)
        if not m:
            print("sin enlace xlsx en handle", h); continue
        r = s.get(MINEDU + m.group(0).replace("&amp;", "&"), timeout=180); r.raise_for_status(); save(rel, r.content)


if __name__ == "__main__":
    main()
