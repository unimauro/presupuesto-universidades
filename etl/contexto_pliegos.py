#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente CONTEXTO — padrón de pliegos universitarios (MEF, Consulta Amigable).

Para cada año pedido baja la lista de pliegos del Sector 10 EDUCACIÓN (Gobierno Nacional, modo
Actividades/Proyectos) y se queda con los que son universidades. Son ~4 requests por año.

Ruta: TOTAL -> BtnTipoGobierno -> E: GOBIERNO NACIONAL -> BtnSector -> 10: EDUCACION -> BtnPliego

Salida: etl/cache/contexto/mef/pliegos_{año}.json  ->  [{"pliego":"514","nombre":"U.N. DE INGENIERIA", "pim":n}]
Uso:    ~/.venvs/pu-contexto/bin/python etl/contexto_pliegos.py [--years 2016,2025,2026]
"""
import argparse, json, os, random, re, time
import requests
from bs4 import BeautifulSoup

BASE = "https://apps5.mineco.gob.pe/transparencia/Navegador/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "contexto", "mef")
UNIV_RE = re.compile(r"(^|\s)U\.?\s*N\.|UNIVERSIDAD", re.I)


def form_fields(soup):
    d = {}
    for inp in soup.select("input"):
        n = inp.get("name"); t = (inp.get("type") or "text").lower()
        if n and t not in ("submit", "button", "image", "reset", "radio", "checkbox"):
            d[n] = inp.get("value", "")
    for sel in soup.select("select"):
        o = sel.select_one("option[selected]") or sel.select_one("option")
        if sel.get("name"):
            d[sel.get("name")] = o.get("value", "") if o else ""
    return d


def rows(html):
    out = []
    for tr in BeautifulSoup(html, "lxml").find_all("tr"):
        r = tr.find("input", {"name": "grp1"})
        if r is not None:
            out.append((r.get("value"), [td.get_text(" ", strip=True) for td in tr.find_all("td")]))
    return out


def post(s, html, radio, btn, ref):
    soup = BeautifulSoup(html, "lxml")
    d = form_fields(soup); d["grp1"] = radio
    d[btn] = soup.find("input", {"name": btn}).get("value")
    time.sleep(1.8 + random.random())
    r = s.post(BASE + soup.find("form").get("action"), data=d, headers={"Referer": ref}, timeout=90)
    r.raise_for_status()
    return r.text


def pliegos(year):
    s = requests.Session(); s.headers["User-Agent"] = UA
    s.get(BASE + "default.aspx", timeout=40)
    s.get(f"{BASE}default.aspx?y={year}&ap=ActProy", timeout=40)
    ref = f"{BASE}Navegar.aspx?y={year}&ap=ActProy"
    html = s.get(ref, timeout=40).text
    html = post(s, html, rows(html)[0][0], "ctl00$CPH1$BtnTipoGobierno", ref)
    gn = [r for r in rows(html) if "E: GOBIERNO NACIONAL" in " ".join(r[1])]
    html = post(s, html, gn[0][0], "ctl00$CPH1$BtnSector", ref)
    ed = [r for r in rows(html) if re.search(r"\b10: EDUCACI", " ".join(r[1]))]
    html = post(s, html, ed[0][0], "ctl00$CPH1$BtnPliego", ref)
    out = []
    for val, cells in rows(html):
        name = next((c for c in cells if re.match(r"^\d{3}:", c)), "")
        if name and UNIV_RE.search(name.split(":", 1)[1]):
            nums = [c for c in cells if re.fullmatch(r"[\d,]+", c)]
            out.append({"pliego": name[:3], "nombre": name.split(":", 1)[1].strip(),
                        "pim": int(nums[1].replace(",", "")) if len(nums) > 1 else None})
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--years", default="2016,2020,2025,2026")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for y in [int(x) for x in a.years.split(",")]:
        fp = os.path.join(OUT, f"pliegos_{y}.json")
        if os.path.exists(fp):
            print(y, "ya en caché"); continue
        for i in range(4):
            try:
                lst = pliegos(y); break
            except Exception as e:
                print(y, "error", repr(e)[:120]); time.sleep(15 * (i + 1))
        else:
            continue
        json.dump(lst, open(fp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(y, len(lst), "pliegos universitarios")


if __name__ == "__main__":
    main()
