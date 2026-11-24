"""Canon, sobrecanon, regalías y FOCAM transferidos a universidades públicas, por año.

Fuente: MEF — "Consulta de Transferencias a los Gobiernos Nacional, Regional, Local y EPS"
https://apps5.mineco.gob.pe/transferencias/gn/default.aspx  (pestaña Gobierno Nacional)
Navegación (igual que un usuario): Año → Tipo de operación TODOS → agrupar por "Recursos"
→ por cada recurso de canon/sobrecanon/regalía/FOCAM → agrupar por "Pliegos" → se guardan
solo los pliegos universitarios (5xx). Monto = "Monto Acreditado" (soles).

Salida: etl/cache/normativa/canon.json  {"por_pliego": {"514": {"2024": n}}, "detalle": [...]}
Uso: ~/.venvs/pu-normativa/bin/python -I etl/normativa_canon.py [2016 2026]
"""
import html
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "etl" / "cache" / "normativa"
B = "https://apps5.mineco.gob.pe/transferencias/gn/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
RECURSO_RX = re.compile(r"CANON|REGAL|FOCAM|SOBRECANON", re.I)


def form(t):
    d = {}
    for m in re.finditer(r"<input[^>]*name=\"([^\"]+)\"[^>]*>", t):
        tag = m.group(0)
        if 'type="radio"' in tag:
            continue
        v = re.search(r"value=['\"]([^'\"]*)['\"]", tag)
        d[m.group(1)] = html.unescape(v.group(1)) if v else ""
    return d


def rows(t):
    out = []
    for m in re.finditer(r'<tr id="tr(\d+)".*?</tr>', t, re.S):
        r = m.group(0)
        v = re.search(r"name=\"grp1\" value='([^']*)'", r)
        tds = [re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", "", x))).strip()
               for x in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
        out.append((v.group(1) if v else None, tds[1:]))
    return out


def num(s):
    return float(s.replace(",", "") or 0)


class Nav:
    def __init__(self, anio, to="0"):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        self.anio, self.to = str(anio), to
        self.t = self._get(f"wfResultados.aspx?a={self.anio}")

    def _get(self, path):
        time.sleep(1.0)
        return self.s.get(B + path, timeout=120).text

    def drill(self, grp_value, agrupacion):
        f = form(self.t)
        f.update({"DdlTipoOperacion": self.to, "drpAno": self.anio, "grp1": grp_value,
                  "hAgrupacion": str(agrupacion), "hPostedBy": "1"})
        act = html.unescape(re.search(r'<form name="frm1" method="post" action="([^"]+)"', self.t).group(1))
        time.sleep(1.0)
        self.t = self.s.post(B + act, data=f, timeout=180).text
        return rows(self.t)


def anio_canon(anio):
    det = []
    nav = Nav(anio)
    raiz = rows(nav.t)
    if not raiz:
        return det
    recursos = nav.drill(raiz[0][0], 9)
    for val, tds in recursos:
        if not tds or not RECURSO_RX.search(tds[0]):
            continue
        n2 = Nav(anio)  # navegación nueva por recurso (estado ASP.NET lineal)
        r0 = rows(n2.t)
        n2.drill(r0[0][0], 9)
        pl = n2.drill(val, 10)
        for _, t2 in pl:
            m = re.match(r"(\d{3})\s*:\s*(.*)", t2[0])
            if not m or not m.group(1).startswith("5"):
                continue
            if not re.search(r"\bU\.?\s?N\.|UNIVERSIDAD", m.group(2).upper()):
                continue
            det.append({"anio": anio, "recurso": tds[0], "pliego": m.group(1), "nombre": m.group(2),
                        "autorizado": num(t2[1]), "acreditado": num(t2[2])})
        print(f"  {anio} {tds[0]}: {sum(1 for d in det if d['recurso'] == tds[0])} universidades")
    return det


def main():
    a0, a1 = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (2016, 2026)
    f = CACHE / "canon.json"
    prev = json.loads(f.read_text()) if f.exists() else {"detalle": []}
    det = [d for d in prev["detalle"] if not (a0 <= d["anio"] <= a1)]
    for anio in range(a0, a1 + 1):
        try:
            det += anio_canon(anio)
        except Exception as e:  # noqa
            print("ERR", anio, e)
    por = {}
    for d in det:
        por.setdefault(d["pliego"], {}).setdefault(str(d["anio"]), 0.0)
        por[d["pliego"]][str(d["anio"])] += d["acreditado"]
    por = {p: {a: round(v, 2) for a, v in sorted(x.items())} for p, x in sorted(por.items())}
    f.write_text(json.dumps({"fuente": B + "default.aspx", "por_pliego": por, "detalle": det},
                            ensure_ascii=False, indent=1))
    print("OK", f, len(det), "filas")


if __name__ == "__main__":
    main()
