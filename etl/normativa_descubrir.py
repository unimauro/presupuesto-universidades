"""Descubre normas (MEF / MINEDU) relacionadas con universidades públicas en gob.pe.

Busca en el buscador de normas-legales de gob.pe (mef, minedu) con varios términos,
pagina y guarda las tarjetas (id, título, descripción, fecha, PDF) en
etl/cache/normativa/descubiertas.json. Luego visita la ficha de cada candidata
(DS de transferencia / leyes de presupuesto) para obtener la descripción completa
y TODOS los PDFs adjuntos (anexos).

Uso:  ~/.venvs/pu-normativa/bin/python etl/normativa_descubrir.py
Rate-limit: 1 req / 1.2 s. Cachea HTML en etl/cache/normativa/html/.
"""
import hashlib
import html as htmlmod
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "etl" / "cache" / "normativa"
HTMLC = CACHE / "html"
HTMLC.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
S = requests.Session()
S.headers["User-Agent"] = UA

TERMS = {
    "mef": [
        "universidades",
        "universidad nacional",
        "diversas universidades públicas",
        "universidades públicas",
        "Ley Universitaria",
        "docentes universitarios",
        "Ley de Presupuesto del Sector Público",
        "SUNEDU",
    ],
    "minedu": [
        "transferencia universidades públicas",
        "universidades públicas",
        "compromisos de gestión universidades",
    ],
}
MAX_SHEETS = 12


def get(url, params=None, force=False):
    key = hashlib.md5((url + json.dumps(params or {}, sort_keys=True)).encode()).hexdigest()
    f = HTMLC / f"{key}.html"
    if f.exists() and not force:
        return f.read_text()
    for intento in range(3):
        try:
            r = S.get(url, params=params, timeout=60)
            if r.status_code == 200:
                f.write_text(r.text)
                time.sleep(1.2)
                return r.text
            print("  HTTP", r.status_code, url, file=sys.stderr)
        except requests.RequestException as e:
            print("  ERR", e, file=sys.stderr)
        time.sleep(3 * (intento + 1))
    return ""


def clean(s):
    return re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def parse_cards(t):
    out = []
    for blk in re.split(r'<li class="hover:bg-gray-70 relative"', t)[1:]:
        blk = blk.split("</li>")[0]
        m = re.search(r'href="/institucion/([a-z0-9-]+)/normas-legales/((\d+)-[^"?]*)"[^>]*>(.*?)</a>', blk, re.S)
        if not m:
            continue
        inst, slug, nid, titulo = m.groups()
        d = re.search(r'<p class="relative font-bold[^"]*">(.*?)</p>', blk, re.S) or re.search(
            r'id="p-filter-item-\d+"[^>]*>(.*?)</div>', blk, re.S)
        f = re.search(r'datetime="([0-9-]+)', blk)
        pdfs = re.findall(r'href="(https://cdn\.www\.gob\.pe/uploads/document/file/[^"]+)"', blk)
        out.append({
            "inst": inst, "id": nid, "slug": slug, "titulo": clean(titulo),
            "desc": clean(d.group(1)) if d else "", "fecha": f.group(1) if f else "",
            "pdfs": sorted(set(pdfs)),
            "url": f"https://www.gob.pe/institucion/{inst}/normas-legales/{slug}",
        })
    return out


def buscar():
    todas = {}
    for inst, terms in TERMS.items():
        for term in terms:
            for sheet in range(1, MAX_SHEETS + 1):
                t = get(
                    f"https://www.gob.pe/institucion/{inst}/normas-legales",
                    {"filter[terms]": term, "filter[per_page]": "50", "sheet": str(sheet)},
                )
                cards = parse_cards(t)
                nuevos = [c for c in cards if c["id"] not in todas]
                for c in cards:
                    todas.setdefault(c["id"], c)
                print(f"{inst} | {term} | hoja {sheet}: {len(cards)} tarjetas, {len(nuevos)} nuevas, total {len(todas)}")
                if len(cards) < 50:
                    break
    return todas


def ficha(c):
    """Visita la ficha de la norma: descripción completa + todos los PDFs."""
    t = get(c["url"])
    m = re.search(r'<meta name="description" content="([^"]*)"', t)
    desc_full = htmlmod.unescape(m.group(1)) if m else ""
    # cuerpo principal (descripción larga)
    m2 = re.search(r'<div class="[^"]*description[^"]*"[^>]*>(.*?)</div>', t, re.S)
    if m2 and len(clean(m2.group(1))) > len(desc_full):
        desc_full = clean(m2.group(1))
    pdfs = sorted(set(re.findall(r'(https://cdn\.www\.gob\.pe/uploads/document/file/[^"?]+\.pdf)', t)))
    c["desc_full"] = desc_full or c["desc"]
    c["pdfs"] = pdfs or c["pdfs"]
    return c


UNI_RX = re.compile(r"universidad", re.I)


def es_candidata(c):
    txt = (c["titulo"] + " " + c["desc"]).lower()
    if c["inst"] == "mef":
        if "ley de presupuesto del sector público para el año fiscal" in txt:
            return True
        if c["titulo"].lower().startswith("decreto supremo") and UNI_RX.search(txt):
            return True
        if c["titulo"].lower().startswith("decreto de urgencia") and UNI_RX.search(txt):
            return True
        return False
    # minedu: resoluciones con transferencias/asignaciones a universidades
    return bool(UNI_RX.search(txt)) and re.search(r"transferen|asign|compromiso|financ|modificaci", txt) is not None


def main():
    todas = buscar()
    (CACHE / "descubiertas_todas.json").write_text(json.dumps(todas, ensure_ascii=False, indent=1))
    # DS/DU/RM sin descripción en el listado: mirar la ficha antes de decidir
    for c in todas.values():
        if not c["desc"] and re.match(r"(Decreto|Resoluci)", c["titulo"]):
            ficha(c)
            c["desc"] = c.get("desc_full", "")
    cands = [c for c in todas.values() if es_candidata(c)]
    print(f"candidatas: {len(cands)} de {len(todas)}")
    for i, c in enumerate(cands):
        ficha(c)
        if i % 20 == 0:
            print(f"  ficha {i}/{len(cands)}")
    cands.sort(key=lambda c: c["fecha"])
    (CACHE / "descubiertas.json").write_text(json.dumps(cands, ensure_ascii=False, indent=1))
    print("OK ->", CACHE / "descubiertas.json")


if __name__ == "__main__":
    main()
