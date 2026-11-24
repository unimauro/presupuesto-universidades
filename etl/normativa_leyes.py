"""PIA por pliego universitario según el ANEXO 4 de cada Ley de Presupuesto
("Distribución del gasto del presupuesto del sector público por niveles de gobierno,
pliegos y fuentes de financiamiento").

mef.gob.pe está detrás de Incapsula (bloquea curl), así que se usa:
  1) gob.pe (cdn.www.gob.pe) cuando el anexo está publicado ahí;
  2) copia de Internet Archive (web.archive.org/web/<ts>id_/<url-mef>) de la URL oficial;
  NO se intenta evadir la protección anti-bot de mef.gob.pe: si no hay copia en gob.pe ni en
  Internet Archive (ni un PDF ya presente en la caché local), el año queda con nota.
La URL guardada en la salida es SIEMPRE la URL oficial del MEF/gob.pe (+ la de archivo usada).

Salida: etl/cache/normativa/leyes.json  (lo consume normativa_build.py)
Uso: ~/.venvs/pu-normativa/bin/python -W ignore etl/normativa_leyes.py
"""
import json
import logging
import re
import time
from pathlib import Path

import pdfplumber
import requests

logging.disable(logging.CRITICAL)
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "etl" / "cache" / "normativa"
DIR = CACHE / "leyes"
DIR.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"

MEF = "https://www.mef.gob.pe/contenidos/presu_publ/anexos/"
# anio: (norma, url_oficial, [(fuente_descarga)], url_ficha_norma)
LEYES = {
    2016: ("Ley N° 30372", None, [], None),
    2017: ("Ley N° 30518", MEF + "anexo4_ley30518.pdf", ["wb:20191205181604"], None),
    2018: ("Ley N° 30693", MEF + "anexo4_Ley30693.pdf", ["wb:20191217211916"], None),
    2019: ("Ley N° 30879", MEF + "anexo4_Ley3089.pdf",
           ["local:223307/anexo4_Ley3089.pdf", "wb:20191125211226"],
           "https://www.gob.pe/institucion/mef/normas-legales/223307-30879"),
    2020: ("Decreto de Urgencia N° 014-2019", MEF + "Anexo4_DU014_2019.pdf", ["wb:20191217220037"], None),
    2021: ("Ley N° 31084", MEF + "ppto2021/Anexo4.pdf", ["wb:20210303084003"],
           "https://www.gob.pe/institucion/mef/normas-legales/1377380-31084"),
    2022: ("Ley N° 31365", MEF + "ppto2022/Anexo_4.pdf", ["local:2493833/Anexo_4.pdf.pdf", "wb:20211216124904"],
           "https://www.gob.pe/institucion/mef/normas-legales/2493833-31365"),
    2023: ("Ley N° 31638", MEF + "ppto2023/Anexo_4.PDF", ["wb:20230125023600"],
           "https://www.gob.pe/institucion/mef/normas-legales/3715319-31638"),
    2024: ("Ley N° 31953", MEF + "ppto2024/Anexo_4_LeyPpto2024.PDF", ["wb:20240905173149"], None),
    2025: ("Ley N° 32185", MEF + "ppto2025/Anexo_4.PDF", ["wb:20250429160059"],
           "https://www.gob.pe/institucion/mef/normas-legales/6278077-32185"),
    2026: ("Ley N° 32513", MEF + "ppto2026/Anexo_4.PDF", ["mef"],
           "https://www.gob.pe/institucion/mef/normas-legales/7475743-32513"),
    2027: ("Proyecto de Ley de Presupuesto 2027", "https://www.mef.gob.pe/contenidos/presu_publ/sectr_publ/proy_2027/Anexos/Anexo_4.PDF",
           ["mef"], None),
}

S = requests.Session()
S.headers["User-Agent"] = UA


def bajar(anio, url, fuentes):
    f = DIR / f"anexo4_{anio}.pdf"
    if f.exists() and f.stat().st_size > 5000:
        return f, "cache"
    for src in fuentes:
        if src.startswith("local:"):
            p = CACHE / "pdf" / src[6:]
            if p.exists():
                f.write_bytes(p.read_bytes())
                return f, "gob.pe"
            continue
        if src.startswith("gob:"):
            u = src[4:]
        elif src.startswith("wb:"):
            u = f"https://web.archive.org/web/{src[3:]}id_/{url}"
        else:
            continue  # sin descarga directa desde mef.gob.pe
        try:
            r = S.get(u, timeout=180)
            time.sleep(2)
            if r.status_code == 200 and r.content[:4] == b"%PDF":
                f.write_bytes(r.content)
                return f, u
            print(f"  {anio}: {r.status_code} {len(r.content)}B {u}")
        except requests.RequestException as e:
            print(f"  {anio}: ERR {e} {u}")
    return None, None


NUM = re.compile(r"^\s*\d{1,3}(?: \d{3})*\s*$")


def parse_anexo4(f):
    """Devuelve {pliego: {"nombre":..., "total": n, "cols":[...]}} para pliegos de universidades."""
    out = {}
    with pdfplumber.open(str(f)) as pdf:
        for page in pdf.pages:
            words = page.extract_words(keep_blank_chars=True)
            # agrupar palabras en filas: misma línea si |top - top_fila| <= 3.5 pt
            filas = []
            for w in sorted(words, key=lambda w: w["top"]):
                if filas and abs(w["top"] - filas[-1][0]) <= 3.5:
                    filas[-1][1].append(w)
                else:
                    filas.append([w["top"], [w]])
            rows = {i: f[1] for i, f in enumerate(filas)}
            for key in sorted(rows):
                ws = sorted(rows[key], key=lambda w: w["x0"])
                if not ws:
                    continue
                first = ws[0]["text"].strip()
                m = re.match(r"^(\d{3})\b\s*(.*)$", first)
                if not m:
                    continue
                code = m.group(1)
                rest = [w for w in ws[1:]]
                nombre = (m.group(2) + " " + " ".join(w["text"].strip() for w in rest if not NUM.match(w["text"]) and w["text"].strip())).strip()
                if not re.search(r"\bU\.?\s?N\.|UNIVERSIDAD|UNIV\.", nombre.upper()):
                    continue
                nums = [(w["x1"], int(re.sub(r"\D", "", w["text"]))) for w in rest if NUM.match(w["text"]) and w["text"].strip()]
                if not nums:
                    # números en la fila siguiente (nombre partido en 2 líneas)
                    nxt = sorted(rows.get(key + 1, []) + rows.get(key + 2, []), key=lambda w: w["x0"])
                    nums = [(w["x1"], int(re.sub(r"\D", "", w["text"]))) for w in nxt if NUM.match(w["text"]) and w["text"].strip()]
                if not nums:
                    continue
                nums.sort()
                total = nums[-1][1]
                partes = [n for _, n in nums[:-1]]
                ok = (sum(partes) == total) if partes else True
                out[code] = {"nombre": nombre, "total": total, "cols": [n for _, n in nums], "suma_ok": ok}
    return out


def main():
    res = []
    for anio, (norma, url, fuentes, ficha) in LEYES.items():
        if not url:
            res.append({"anio": anio, "norma": norma, "url": None, "pia_por_pliego": {},
                        "nota": "Anexo 4 no ubicado en gob.pe ni en Internet Archive; mef.gob.pe bloquea descarga automatizada."})
            continue
        f, via = bajar(anio, url, fuentes)
        if not f:
            res.append({"anio": anio, "norma": norma, "url": url, "ficha": ficha, "pia_por_pliego": {},
                        "nota": "No se pudo descargar el Anexo 4 (mef.gob.pe bloquea descarga automatizada y no hay copia archivada)."})
            continue
        d = parse_anexo4(f)
        malos = [k for k, v in d.items() if not v["suma_ok"]]
        print(f"{anio} {norma}: {len(d)} universidades, total S/ {sum(v['total'] for v in d.values()):,}  (filas con suma≠total: {malos})")
        res.append({
            "anio": anio, "norma": norma, "url": url, "via": via, "ficha": ficha,
            "pia_por_pliego": {k: v["total"] for k, v in sorted(d.items())},
            "nombres": {k: v["nombre"] for k, v in sorted(d.items())},
            "filas_suma_no_cuadra": malos,
        })
    (CACHE / "leyes.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
