#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Valida data/ingresos/ingresos.json contra la Consulta Amigable de INGRESOS del MEF
(https://apps5.mineco.gob.pe/TransparenciaIngresos/Navegador/ — ASP.NET WebForms + Incapsula;
pasa con cookie jar). Drill: Año → Nivel de Gobierno (E) → Sector (10) → Pliego.
Compara PIA/PIM/Recaudado por pliego. Escribe data/ingresos/validacion_ca.json.

Uso: ~/.venvs/pu-ingresos/bin/python etl/ingresos_validar_ca.py [AÑO ...]   (por defecto 2012 2016 2020 2024 2026)
Pausas ≥1.6 s entre postbacks (otros scrapers usan el mismo portal). Caché HTML en etl/cache/ingresos/ca/.
"""
import json, os, re, sys, time
import requests
from bs4 import BeautifulSoup

B = "https://apps5.mineco.gob.pe/TransparenciaIngresos/Navegador/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "ingresos", "ca")
DATA = os.path.join(HERE, "..", "data", "ingresos", "ingresos.json")
OUT = os.path.join(HERE, "..", "data", "ingresos", "validacion_ca.json")


def fields(soup, click):
    d = {}
    for inp in soup.select("input"):
        n = inp.get("name"); t = (inp.get("type") or "text").lower()
        if not n or t in ("submit", "button", "image", "reset"):
            continue
        if t in ("radio", "checkbox"):
            if inp.has_attr("checked"):
                d[n] = inp.get("value", "on")
        else:
            d[n] = inp.get("value", "")
    for sel in soup.select("select"):
        n = sel.get("name")
        if n:
            o = sel.select_one("option[selected]") or sel.select_one("option")
            d[n] = o.get("value", "") if o else ""
    d[click[0]] = click[1]
    return d


def rows(soup):
    """Filas con radio grp1; su value = 'COD/PIA/PIM/RECAUDADO'."""
    out = {}
    for tr in soup.find_all("tr"):
        r = tr.select_one("input[type=radio]")
        tds = [t.get_text(" ", strip=True) for t in tr.find_all("td")]
        if not r or len(tds) < 4:
            continue
        m = re.match(r"^(\w+):\s*(.+)$", tds[1])
        parts = r.get("value", "").split("/")
        if m and len(parts) == 4:
            out[m.group(1)] = {"radio": (r.get("name"), r.get("value")), "nombre": m.group(2),
                               "pia": float(parts[1]), "pim": float(parts[2]), "recaudado": float(parts[3])}
    return out


class CA:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA
        self.s.get(B + "default.aspx", timeout=40)

    def post(self, soup, click, radio):
        d = fields(soup, click)
        d[radio[0]] = radio[1]
        time.sleep(1.6)
        for i in range(4):
            try:
                r = self.s.post(B + soup.find("form").get("action"), data=d,
                                headers={"Referer": B + "Navegar.aspx"}, timeout=60)
                r.raise_for_status()
                return BeautifulSoup(r.text, "lxml")
            except Exception as e:
                print(f"   reintento {i}: {e!r:.80}", flush=True)
                time.sleep(5 * (i + 1))
        raise RuntimeError("postback falló")

    def pliegos(self, year):
        os.makedirs(CACHE, exist_ok=True)
        cp = os.path.join(CACHE, f"pliegos_{year}.json")
        if os.path.exists(cp):
            return json.load(open(cp))
        self.s.get(f"{B}default.aspx?y={year}", timeout=40)
        soup = BeautifulSoup(self.s.get(f"{B}Navegar.aspx?y={year}", timeout=40).text, "lxml")
        sel = soup.select_one("select option[selected]")
        tot = list(rows(soup).values()) or [None]
        soup = self.post(soup, ("ctl00$CPH1$BtnTipoGobierno", "Nivel de Gobierno"),
                         ("grp1", soup.select_one("input[name=grp1]").get("value")))
        soup = self.post(soup, ("ctl00$CPH1$BtnSector", "Sector"), rows(soup)["E"]["radio"])
        soup = self.post(soup, ("ctl00$CPH1$BtnPliego", "Pliego"), rows(soup)["10"]["radio"])
        res = {k: {x: v[x] for x in ("nombre", "pia", "pim", "recaudado")} for k, v in rows(soup).items()}
        json.dump(res, open(cp, "w"), ensure_ascii=False)
        return res


def main():
    years = [a for a in sys.argv[1:]] or ["2012", "2016", "2020", "2024", "2026"]
    data = json.load(open(DATA))["universidades"]
    ca = CA()
    report = {"generado": time.strftime("%Y-%m-%d %H:%M"), "fuente": B, "anios": {}}
    for y in years:
        try:
            pl = ca.pliegos(y)
        except Exception as e:
            print(f"{y}: error {e!r:.100}"); ca = CA(); continue
        unis = {k: v for k, v in pl.items() if k.startswith("5")}
        difs, ok = [], 0
        for k, v in unis.items():
            mine = data.get(k, {}).get("anios", {}).get(y, {}).get("total")
            if not mine:
                difs.append({"pliego": k, "motivo": "falta en CSV", "ca": v}); continue
            d = {x: round(mine[x] - v[x], 2) for x in ("pia", "pim", "recaudado")}
            if all(abs(t) <= 1.0 for t in d.values()):
                ok += 1
            else:
                difs.append({"pliego": k, "nombre": v["nombre"], "dif_csv_menos_ca": d,
                             "ca": {x: v[x] for x in ("pia", "pim", "recaudado")}})
        extra = [k for k in data if y in data[k]["anios"] and k not in unis]
        report["anios"][y] = {"pliegos_ca": len(unis), "coinciden_±1sol": ok, "diferencias": difs,
                              "en_csv_no_en_ca": extra}
        print(f"{y}: {len(unis)} universidades en CA, {ok} coinciden (±S/1), {len(difs)} difieren, "
              f"{len(extra)} solo en CSV", flush=True)
    json.dump(report, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("escrito", OUT)


if __name__ == "__main__":
    main()
