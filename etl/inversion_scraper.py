#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente INVERSIÓN — scraper de la Consulta Amigable del MEF para universidades públicas.

Ruta de drill-down (por año, modo Actividades/Proyectos):
  TOTAL -> BtnTipoGobierno -> E: GOBIERNO NACIONAL -> BtnSector -> 10: EDUCACION -> BtnPliego
  -> (lista de pliegos; se filtran universidades por nombre)
  -> por cada pliego universitario: BtnProgramaPpto | BtnProdProy | BtnFuncion

Truco: la página con la lista de pliegos (con su __VIEWSTATE) se reutiliza para todos los pliegos
del año (el estado viaja en el viewstate, no en la sesión), así que solo hay 1 POST por pliego×dimensión.

Caché HTML en etl/cache/inversion/{año}_{pliego}_{dim}.html → reanudable; si existe no se re-pide.
Educado con el portal: pausa >= 1.5 s entre POST, reintentos con backoff, sesión nueva tras error.

Uso:
  ~/.venvs/pu-inversion/bin/python etl/inversion_scraper.py            # scrapea todo lo faltante
  ~/.venvs/pu-inversion/bin/python etl/inversion_scraper.py --pass programa --years 2016-2026
  ~/.venvs/pu-inversion/bin/python etl/inversion_build.py              # arma data/inversion/inversion.json
"""
import argparse, os, re, sys, time, random
import requests
from bs4 import BeautifulSoup

BASE = "https://apps5.mineco.gob.pe/transparencia/Navegador/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "inversion")
PAUSE = 1.8

DIMS = {  # nombre corto -> botón
    "programa": "ctl00$CPH1$BtnProgramaPpto",
    "proyecto": "ctl00$CPH1$BtnProdProy",
    "funcion": "ctl00$CPH1$BtnFuncion",
}
UNIV_RE = re.compile(r"(^|\s)U\.?\s*N\.|UNIVERSIDAD", re.I)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def new_session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    s.get(BASE + "default.aspx", timeout=40)
    return s


def form_fields(soup):
    d = {}
    for inp in soup.select("input"):
        n = inp.get("name"); t = (inp.get("type") or "text").lower()
        if not n or t in ("submit", "button", "image", "reset", "radio", "checkbox"):
            continue
        d[n] = inp.get("value", "")
    for sel in soup.select("select"):
        o = sel.select_one("option[selected]") or sel.select_one("option")
        if sel.get("name"):
            d[sel.get("name")] = o.get("value", "") if o else ""
    return d


def radio_rows(html):
    """[(valor_radio, [celdas])] de la tabla de resultados."""
    out = []
    for tr in BeautifulSoup(html, "lxml").find_all("tr"):
        r = tr.find("input", {"name": "grp1"})
        if r is None:
            continue
        out.append((r.get("value"), [td.get_text(" ", strip=True) for td in tr.find_all("td")]))
    return out


class Nav:
    def __init__(self):
        self.s = new_session()

    def post(self, html, radio, btn, referer):
        soup = BeautifulSoup(html, "lxml")
        d = form_fields(soup)
        d["grp1"] = radio
        b = soup.find("input", {"name": btn})
        if b is None:
            raise RuntimeError(f"botón {btn} no presente")
        d[btn] = b.get("value")
        action = soup.find("form").get("action")
        time.sleep(PAUSE + random.random() * 0.7)
        r = self.s.post(BASE + action, data=d, headers={"Referer": referer}, timeout=90)
        r.raise_for_status()
        if "ctl00_CPH1" not in r.text:
            raise RuntimeError("respuesta sin formulario (¿WAF?)")
        return r.text

    def pliegos_page(self, year):
        """Devuelve (html_lista_pliegos, referer)."""
        self.s.get(f"{BASE}default.aspx?y={year}&ap=ActProy", timeout=40)
        ref = f"{BASE}Navegar.aspx?y={year}&ap=ActProy"
        html = self.s.get(ref, timeout=40).text
        soup = BeautifulSoup(html, "lxml")
        sel = soup.select_one("#ctl00_CPH1_DrpYear option[selected]")
        if not sel or sel.get_text(strip=True) != str(year):
            raise RuntimeError(f"año no fijado ({sel.get_text(strip=True) if sel else '?'})")
        rs = radio_rows(html)
        html = self.post(html, rs[0][0], "ctl00$CPH1$BtnTipoGobierno", ref)
        gn = [r for r in radio_rows(html) if re.search(r"^E:", " ".join(r[1]).strip()) or "E: GOBIERNO NACIONAL" in " ".join(r[1])]
        html = self.post(html, gn[0][0], "ctl00$CPH1$BtnSector", ref)
        ed = [r for r in radio_rows(html) if re.search(r"\b10: EDUCACI", " ".join(r[1]))]
        html = self.post(html, ed[0][0], "ctl00$CPH1$BtnPliego", ref)
        return html, ref


def cpath(year, pliego, dim):
    return os.path.join(CACHE, f"{year}_{pliego}_{dim}.html")


def univ_pliegos(html):
    out = []
    for val, cells in radio_rows(html):
        name = next((c for c in cells if re.match(r"^\d{3}:", c)), "")
        if name and UNIV_RE.search(name.split(":", 1)[1]):
            out.append((name[:3], val, name))
    return out


def run_year(year, dims, nav):
    lst = os.path.join(CACHE, f"{year}_pliegos.html")
    pending = None
    if os.path.exists(lst):
        univs = univ_pliegos(open(lst, encoding="utf-8").read())
        pending = [(p, d) for p, _, _ in univs for d in dims if not os.path.exists(cpath(year, p, d))]
        if not pending:
            log(f"{year}: nada pendiente ({len(univs)} univ)")
            return 0
    html, ref = nav.pliegos_page(year)
    open(lst, "w", encoding="utf-8").write(html)
    univs = univ_pliegos(html)
    log(f"{year}: {len(univs)} universidades en la lista de pliegos")
    n = 0
    for p, val, name in univs:
        for dim in dims:
            fp = cpath(year, p, dim)
            if os.path.exists(fp):
                continue
            out = nav.post(html, val, DIMS[dim], ref)
            rows = radio_rows(out)
            if not rows and "No se encontraron" not in out:
                # tabla vacía sospechosa: guardar igual (puede ser legítimo, p.ej. sin proyectos)
                log(f"  {year} {p} {dim}: 0 filas")
            open(fp, "w", encoding="utf-8").write(out)
            n += 1
        log(f"  {year} {p} ok ({name[:50]})")
    return n


def parse_years(s):
    if "-" in s:
        a, b = s.split("-"); return list(range(int(a), int(b) + 1))
    return [int(x) for x in s.split(",")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pass", dest="passes", action="append",
                    help="programa|proyecto|funcion (repetible). Por defecto: los 3 en orden de prioridad")
    ap.add_argument("--years", default=None)
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True)
    plan = []
    if a.passes:
        yrs = parse_years(a.years) if a.years else list(range(2016, 2027))
        plan = [(p, yrs) for p in a.passes]
    else:  # prioridad: programa 2019-26, proyectos 2023-26, 2019-22, programa 2016-18, función, proyectos 2016-18
        plan = [("programa", list(range(2026, 2018, -1))),
                ("proyecto", list(range(2026, 2022, -1))),
                ("proyecto", list(range(2022, 2018, -1))),
                ("programa", [2018, 2017, 2016]),
                ("funcion", list(range(2026, 2015, -1))),
                ("proyecto", [2018, 2017, 2016])]
    tasks = [(dim, y) for dim, yrs in plan for y in yrs]
    import threading, queue
    sys.path.insert(0, HERE)
    import inversion_build
    q = queue.Queue()
    for t in tasks:
        q.put(t)
    lock = threading.Lock()

    def worker(wid):
        nav = None
        while True:
            try:
                dim, y = q.get_nowait()
            except queue.Empty:
                return
            for attempt in range(5):
                try:
                    if nav is None:
                        nav = Nav()
                    run_year(y, [dim], nav)
                    break
                except Exception as e:
                    wait = 10 * (2 ** attempt)
                    log(f"  [w{wid}] {y} {dim}: error {repr(e)[:120]} -> reintento en {wait}s")
                    time.sleep(wait)
                    nav = None
            else:
                log(f"  [w{wid}] {y} {dim}: ABANDONADO tras 5 intentos")
            with lock:  # volcado incremental tras cada año
                try:
                    inversion_build.main()
                    log(f"  [w{wid}] json actualizado tras {dim} {y}")
                except Exception as e:
                    log(f"  build error {e!r}")

    ths = [threading.Thread(target=worker, args=(i,)) for i in range(a.workers)]
    for t in ths:
        t.start(); time.sleep(5)
    for t in ths:
        t.join()
    log("LISTO")


if __name__ == "__main__":
    main()
