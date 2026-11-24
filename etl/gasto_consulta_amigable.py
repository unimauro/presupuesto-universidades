#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gasto de las universidades públicas (Sector 10, pliegos 5xx "U.N. ...") desde la
Consulta Amigable del MEF (apps5.mineco.gob.pe/transparencia/Navegador).

Adaptado de qhaway-dashboard/etl/scraper_consulta_amigable.py.

Mecánica (validada 23-nov-2026):
  - Sesión con cookie jar pasa el WAF (Incapsula).
  - GET default.aspx?y=AÑO&ap=AP + GET Navegar.aspx?y=AÑO&ap=AP carga el navegador.
    AP = ActProy (ambos) | Actividad | Proyecto.
  - Cada nivel es un POST del form (action Navegar_7.aspx...) con el botón del siguiente
    nivel + grp1 = value del radio de la fila seleccionada. El ViewState es autocontenido:
    se puede re-postear desde cualquier HTML guardado (incluso en otra sesión), así que
    cacheamos TODOS los nodos en etl/cache/gasto/ y el script es reanudable.
  - Value del radio: CODIGO/PIA/PIM/Compromiso/AtencionMensual/Devengado/Girado/Certificado.

Rutas por año (todo en Gobierno Nacional > Sector 10 Educación):
  total     : ActProy  > Pliego
  genérica  : ActProy  > Genérica > (cada genérica) > Pliego
  fuente    : ActProy  > Fuente   > (cada fuente)   > Pliego
  categoría : Actividad > Pliego ;  Proyecto > Pliego

Uso:
  ~/.venvs/pu-gasto/bin/python etl/gasto_consulta_amigable.py            # 2026..2012
  ~/.venvs/pu-gasto/bin/python etl/gasto_consulta_amigable.py 2019 2026  # rango
  GASTO_WORKERS=3 (hilos por año, default 3)
Salida: data/gasto/gasto.json (+ data/gasto/validacion.json)
"""
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import re
import sys
import threading
import time

import requests
from bs4 import BeautifulSoup

BASE = "https://apps5.mineco.gob.pe/transparencia/Navegador/"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE = os.path.join(ROOT, "etl", "cache", "gasto")
OUT = os.path.join(ROOT, "data", "gasto", "gasto.json")
VAL = os.path.join(ROOT, "data", "gasto", "validacion.json")
SECTOR = "10"
ANIO_PARCIAL = 2026
PAUSA = float(os.environ.get("GASTO_PAUSA", "1.0"))

BTN = {
    "tipo": "ctl00$CPH1$BtnTipoGobierno",
    "sector": "ctl00$CPH1$BtnSector",
    "pliego": "ctl00$CPH1$BtnPliego",
    "generica": "ctl00$CPH1$BtnGenerica",
    "fuente": "ctl00$CPH1$BtnFuenteAgregada",
}

_local = threading.local()


def session(refresh=False):
    if refresh or not getattr(_local, "s", None):
        s = requests.Session()
        s.headers.update({"User-Agent": UA})
        s.get(BASE + "default.aspx", timeout=40)
        _local.s = s
    return _local.s


def soupify(html):
    return BeautifulSoup(html, "lxml")


def fields(soup, btn, grp):
    d = {}
    for inp in soup.select("input"):
        n = inp.get("name")
        t = (inp.get("type") or "text").lower()
        if not n or t in ("submit", "button", "image", "reset", "radio", "checkbox"):
            continue
        d[n] = inp.get("value", "")
    for sel in soup.select("select"):
        o = sel.select_one("option[selected]") or sel.select_one("option")
        if sel.get("name"):
            d[sel.get("name")] = o.get("value", "") if o else ""
    d[btn] = "x"
    d["grp1"] = grp
    return d


def rows(soup):
    """{codigo_etiqueta: {radio, nombre, pia, pim, cert, comp, dev, gir}}"""
    out = {}
    for r in soup.select("input[name=grp1]"):
        tr = r.find_parent("tr")
        tds = [t.get_text(" ", strip=True) for t in tr.find_all("td")]
        lab = next((c for c in tds if re.match(r"^[^:]{1,12}:\s", c)), None)
        if lab is None:
            continue
        code, name = lab.split(":", 1)
        parts = r.get("value", "").split("/")
        if len(parts) < 8:
            continue
        try:
            pia, pim, comp, _aten, dev, gir, cert = [float(x) if x.strip() else 0.0 for x in parts[-7:]]
        except ValueError:
            raise RuntimeError(f"radio no numérico en {lab}: {r.get('value')}")
        # chequeo cruzado PIM radio vs celda (redondeada)
        i = tds.index(lab)
        cel = tds[i + 2].replace(",", "") if len(tds) > i + 2 else ""
        if re.match(r"^\d+(\.\d+)?$", cel) and abs(float(cel) - pim) > 1.0:
            raise RuntimeError(f"PIM radio/celda no cuadra en {lab}: {pim} vs {cel}")
        out[code.strip()] = {"radio": r.get("value"), "nombre": name.strip(),
                             "pia": pia, "pim": pim, "cert": cert, "comp": comp,
                             "dev": dev, "gir": gir}
    return out


def cache_path(key):
    h = hashlib.md5(key.encode()).hexdigest()[:10]
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", key)[:120]
    return os.path.join(CACHE, f"{safe}_{h}.html")


def ok_page(html, year):
    if "ctl00_CPH1_DrpYear" not in html:
        return False
    s = soupify(html)
    sel = s.select_one("#ctl00_CPH1_DrpYear option[selected]")
    return bool(sel and sel.get_text(strip=True) == str(year))


def fetch(key, year, fn):
    """Cachea HTML por llave; fn(session) -> html. Reintenta con sesión nueva."""
    p = cache_path(key)
    if os.path.exists(p):
        return soupify(open(p, encoding="utf-8").read())
    last = None
    for attempt in range(5):
        try:
            html = fn(session(refresh=attempt > 0))
            if ok_page(html, year):
                os.makedirs(CACHE, exist_ok=True)
                tmp = p + ".tmp"
                open(tmp, "w", encoding="utf-8").write(html)
                os.replace(tmp, p)
                time.sleep(PAUSA)
                return soupify(html)
            last = "página inesperada (WAF?)"
        except Exception as e:  # noqa
            last = repr(e)[:120]
        wait = 5 * (attempt + 1)
        print(f"    [{key}] reintento {attempt + 1}: {last}; espero {wait}s", flush=True)
        time.sleep(wait)
    raise RuntimeError(f"fallo {key}: {last}")


def root(year, ap):
    def fn(s):
        s.get(f"{BASE}default.aspx?y={year}&ap={ap}", timeout=40)
        return s.get(f"{BASE}Navegar.aspx?y={year}&ap={ap}", timeout=60).text
    return fetch(f"{year}_{ap}_root", year, fn)


def step(parent_key, parent_soup, year, sel_code, btn):
    """Selecciona la fila sel_code (None = TOTAL / primera) del padre y pulsa btn."""
    rs = rows(parent_soup)
    if sel_code is None:
        g = parent_soup.select_one("input[name=grp1]")
        grp = g.get("value") if g else ""
    else:
        if sel_code not in rs:
            raise KeyError(f"{sel_code} no está en {parent_key}: {list(rs)[:8]}")
        grp = rs[sel_code]["radio"]
    key = f"{parent_key}>{sel_code or 'T'}:{btn}"
    action = parent_soup.find("form").get("action")

    def fn(s):
        return s.post(BASE + action, data=fields(parent_soup, BTN[btn], grp),
                      headers={"Referer": BASE + action}, timeout=90).text
    return key, fetch(key, year, fn)


def sector_node(year, ap):
    r = root(year, ap)
    k0 = f"{year}_{ap}_root"
    k1, tipo = step(k0, r, year, None, "tipo")
    k2, sect = step(k1, tipo, year, "E", "sector")
    return k2, sect


def es_universidad(code, name):
    return code.isdigit() and 500 <= int(code) <= 599 and name.upper().lstrip().startswith("U")


def unis(rs):
    return {c: v for c, v in rs.items() if es_universidad(c, v["nombre"])}


M6 = ("pia", "pim", "cert", "comp", "dev", "gir")


def m6(v):
    return {k: round(v[k], 2) for k in M6}


def add(acc, v):
    for k in M6:
        acc[k] = round(acc.get(k, 0.0) + v[k], 2)


def gen_name(code, name):
    # "5-21" -> "2.1 PERSONAL Y OBLIGACIONES SOCIALES"
    m = re.match(r"^\d+-(\d)(\d)$", code)
    return f"{m.group(1)}.{m.group(2)} {name}" if m else f"{code} {name}"


def scrape_year(year):
    t0 = time.time()
    res = {}  # code -> {nombre, total, generica, fuente, categoria}
    # TOTAL
    ks, S = sector_node(year, "ActProy")
    kp, P = step(ks, S, year, SECTOR, "pliego")
    for c, v in unis(rows(P)).items():
        res[c] = {"nombre": v["nombre"], "total": m6(v), "generica": {}, "fuente": {}, "categoria": {}}
    # GENÉRICA
    kg, G = step(ks, S, year, SECTOR, "generica")
    for gc, gv in rows(G).items():
        _, GP = step(kg, G, year, gc, "pliego")
        gname = gen_name(gc, gv["nombre"])
        for c, v in unis(rows(GP)).items():
            if c in res:
                add(res[c]["generica"].setdefault(gname, {}), v)
    # FUENTE
    kf, F = step(ks, S, year, SECTOR, "fuente")
    for fc, fv in rows(F).items():
        _, FP = step(kf, F, year, fc, "pliego")
        for c, v in unis(rows(FP)).items():
            if c in res:
                add(res[c]["fuente"].setdefault(fv["nombre"], {}), v)
    # CATEGORÍA
    for ap, lab in (("Actividad", "ACTIVIDADES"), ("Proyecto", "PROYECTOS")):
        ks2, S2 = sector_node(year, ap)
        if SECTOR not in rows(S2):
            continue
        _, P2 = step(ks2, S2, year, SECTOR, "pliego")
        for c, v in unis(rows(P2)).items():
            if c in res:
                res[c]["categoria"][lab] = m6(v)
    print(f"  {year}: {len(res)} universidades ({time.time() - t0:.0f}s)", flush=True)
    return year, res


def validar(univ):
    problemas = []
    for c, u in univ.items():
        for y, a in u["anios"].items():
            for dim in ("generica", "fuente", "categoria"):
                if not a.get(dim):
                    if a["total"]["pim"] > 0 or a["total"]["pia"] > 0:
                        problemas.append({"pliego": c, "anio": y, "dim": dim, "error": "vacío"})
                    continue
                for k in M6:
                    s = sum(v.get(k, 0) for v in a[dim].values())
                    d = s - a["total"][k]
                    if abs(d) > 1.0:
                        problemas.append({"pliego": c, "anio": y, "dim": dim, "monto": k,
                                          "suma": round(s, 2), "total": a["total"][k], "dif": round(d, 2)})
    return problemas


def main():
    a = [int(x) for x in sys.argv[1:3]]
    y0, y1 = (a[0], a[1]) if len(a) == 2 else (2012, 2026)
    years = list(range(y1, y0 - 1, -1))
    data = {}
    if os.path.exists(OUT):
        prev = json.load(open(OUT, encoding="utf-8"))
        for c, u in prev.get("universidades", {}).items():
            for y, v in u["anios"].items():
                data.setdefault(int(y), {})[c] = dict(v, nombre=u["nombre"])
    workers = int(os.environ.get("GASTO_WORKERS", "3"))
    errores = {}
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(scrape_year, y): y for y in years}
        for f in cf.as_completed(futs):
            y = futs[f]
            try:
                _, res = f.result()
                data[y] = res
                write(data, errores)
            except Exception as e:  # noqa
                errores[y] = repr(e)[:300]
                print(f"  {y}: ERROR {errores[y]}", flush=True)
    write(data, errores)
    print("errores:", errores or "ninguno")


def fecha_corte(year):
    """'Última actualización: 22 de noviembre de 2026' del root cacheado -> '22-nov-2026'."""
    p = cache_path(f"{year}_ActProy_root")
    if not os.path.exists(p):
        return None
    m = re.search(r'LblLastUpdate">\s*(\d{1,2}) de (\w+) de (\d{4})', open(p, encoding="utf-8").read())
    if not m:
        return None
    return f"{int(m.group(1)):02d}-{m.group(2)[:3].lower()}-{m.group(3)}"


def write(data, errores):
    univ = {}
    for y in sorted(data):
        for c, v in data[y].items():
            u = univ.setdefault(c, {"nombre": v["nombre"], "anios": {}})
            u["nombre"] = v["nombre"]  # nombre del año más reciente
            u["anios"][str(y)] = {k: v[k] for k in ("total", "generica", "fuente", "categoria")}
    univ = dict(sorted(univ.items()))
    problemas = validar(univ)
    anios = sorted(data)
    hoy = dt.date.today()
    meses = "ene feb mar abr may jun jul ago sep oct nov dic".split()
    out = {
        "generado": dt.datetime.now().isoformat(timespec="seconds"),
        "fuente": "MEF — Consulta Amigable (Seguimiento de la Ejecución Presupuestal, gasto), "
                  "https://apps5.mineco.gob.pe/transparencia/Navegador/ — Gobierno Nacional > "
                  "Sector 10 Educación > Pliego (universidades públicas, códigos 5xx)",
        "notas": [
            "Montos en soles corrientes (nominales), con céntimos tal como los publica el MEF.",
            "cert = Certificación; comp = Compromiso anual; dev = Devengado; gir = Girado.",
            "Genérica: se agregan las categorías de gasto 5 (corriente) y 6 (capital) que comparten "
            "genérica, p.ej. 5-24 y 6-24 → '2.4 DONACIONES Y TRANSFERENCIAS'.",
            "Fuente: fuente de financiamiento agregada (RO, RDR, ROOC, Donaciones y Transferencias, "
            "Recursos Determinados — este último incluye canon, sobrecanon y regalías).",
            "Categoría: 'Sólo Actividades' vs 'Sólo Proyectos' de la Consulta Amigable.",
            "Universidades = pliegos del Sector 10 con código 500-599 cuyo nombre empieza con 'U' "
            "(U.N. ...). Universidades creadas recientemente aparecen solo desde su primer año con pliego.",
            f"{ANIO_PARCIAL} es parcial: ejecución acumulada a la fecha de consulta; PIM aún puede cambiar.",
        ] + ([f"Años con error de descarga (faltan): {sorted(errores)}"] if errores else []),
        "anios": anios,
        "parcial": {str(ANIO_PARCIAL): "a " + (fecha_corte(ANIO_PARCIAL)
                                                or f"{hoy.day:02d}-{meses[hoy.month - 1]}-{hoy.year}")}
        if ANIO_PARCIAL in data else {},
        "universidades": univ,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    json.dump({"generado": out["generado"], "descuadres": problemas, "errores": errores},
              open(VAL, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
