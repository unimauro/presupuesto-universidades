#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente INVERSIÓN — arma data/inversion/inversion.json desde la caché HTML de
etl/inversion_scraper.py (no hace requests). Re-ejecutable en cualquier momento (parcial OK).

Columnas de la Consulta Amigable tras el nombre:
  PIA | PIM | Certificación | Compromiso anual | Atención compromiso mensual | Devengado | Girado | Avance %
"""
import glob, json, os, re, sys, datetime
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "inversion")
OUT = os.path.join(HERE, "..", "data", "inversion", "inversion.json")
UNIV_RE = re.compile(r"(^|\s)U\.?\s*N\.|UNIVERSIDAD", re.I)


def num(s):
    s = (s or "").replace(",", "").strip()
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def table_rows(html, code_re):
    """Filas 'CODIGO: NOMBRE' + montos. Devuelve [(codigo, nombre, pia, pim, dev)]."""
    pat = re.compile(r"^(%s):\s*(.+)$" % code_re)
    out = []
    for tr in BeautifulSoup(html, "lxml").find_all("tr"):
        if tr.find("input", {"name": "grp1"}) is None:
            continue
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        idx = next((i for i, c in enumerate(cells) if pat.match(c)), None)
        if idx is None:
            continue
        m = pat.match(cells[idx])
        nums = [num(c) for c in cells[idx + 1:]]
        nums = [n for n in nums if n is not None]
        if len(nums) < 7:
            continue
        out.append((m.group(1), m.group(2).strip(), nums[0], nums[1], nums[5]))
    return out


def r0(x):
    return int(round(x)) if abs(x - round(x)) < 0.005 else round(x, 2)


def main():
    data = {}
    totals = {}
    for lst in sorted(glob.glob(os.path.join(CACHE, "*_pliegos.html"))):
        y = os.path.basename(lst)[:4]
        for code, name, pia, pim, dev in table_rows(open(lst, encoding="utf-8").read(), r"\d{3}"):
            if UNIV_RE.search(name):
                u = data.setdefault(code, {"nombre": name, "anios": {}})
                u["nombre"] = name  # se queda con el nombre del año más reciente
                totals.setdefault(code, {})[y] = {"pia": r0(pia), "pim": r0(pim), "dev": r0(dev)}
    n_files = 0
    checks = []
    for fp in sorted(glob.glob(os.path.join(CACHE, "[0-9][0-9][0-9][0-9]_[0-9][0-9][0-9]_*.html"))):
        base = os.path.basename(fp)[:-5]
        y, p, dim = base.split("_", 2)
        if p not in data:
            continue
        html = open(fp, encoding="utf-8").read()
        n_files += 1
        a = data[p]["anios"].setdefault(y, {})
        if dim == "programa":
            rows = table_rows(html, r"\d{4}")
            a["programa"] = {f"{c}: {n}": {"pia": r0(pia), "pim": r0(pim), "dev": r0(dev)} for c, n, pia, pim, dev in rows}
            t = totals.get(p, {}).get(y)
            if t:
                s = sum(v["pim"] for v in a["programa"].values())
                checks.append((y, p, "programa", s, t["pim"]))
        elif dim == "funcion":
            rows = table_rows(html, r"\d{2}")
            a["funcion"] = {f"{c}: {n}": {"pia": r0(pia), "pim": r0(pim), "dev": r0(dev)} for c, n, pia, pim, dev in rows}
            t = totals.get(p, {}).get(y)
            if t:
                checks.append((y, p, "funcion", sum(v["pim"] for v in a["funcion"].values()), t["pim"]))
        elif dim == "proyecto":
            rows = table_rows(html, r"\d{7}")
            proys = [{"codigo": c, "nombre": n, "pia": r0(pia), "pim": r0(pim), "dev": r0(dev)}
                     for c, n, pia, pim, dev in rows if c.startswith("2") and (pia or pim or dev)]
            proys.sort(key=lambda r: -r["pim"])
            a["proyectos"] = proys
            prods = [(pia, pim, dev) for c, n, pia, pim, dev in rows if c.startswith("3")]
            a["resumen_inversion"] = {
                "n_proyectos": len(proys),
                "n_proyectos_con_pim": sum(1 for r in proys if r["pim"] > 0),
                "pia": r0(sum(r["pia"] for r in proys)),
                "pim": r0(sum(r["pim"] for r in proys)),
                "dev": r0(sum(r["dev"] for r in proys)),
            }
            t = totals.get(p, {}).get(y)
            if t:
                checks.append((y, p, "producto+proyecto",
                               sum(r[3] for r in rows), t["pim"]))
    for p, ys in totals.items():
        for y, t in ys.items():
            data[p]["anios"].setdefault(y, {})["total"] = t
    # validación: suma de categorías == total pliego (PIM)
    bad = [(y, p, d, s, t) for y, p, d, s, t in checks if abs(s - t) > 1]
    years = sorted({y for u in data.values() for y in u["anios"]})
    cov = {}
    for dim in ("programa", "funcion", "proyectos"):
        cov[dim] = {y: sum(1 for u in data.values() if dim in u["anios"].get(y, {})) for y in years}
    now = datetime.datetime.now()
    out = {
        "generado": now.strftime("%Y-%m-%dT%H:%M:%S"),
        "fuente": "MEF — Consulta Amigable de la Ejecución del Gasto (apps5.mineco.gob.pe/transparencia/Navegador), "
                  "modo Actividades/Proyectos: Gobierno Nacional > Sector 10 Educación > Pliego > "
                  "Categoría presupuestal | Función | Producto/Proyecto",
        "notas": [
            "Montos en soles corrientes. pia = Presupuesto Institucional de Apertura; pim = Presupuesto Institucional Modificado; dev = devengado (ejecución).",
            f"{now.year} es parcial: devengado acumulado a la fecha de consulta ({now.strftime('%d-%m-%Y')}).",
            "Universidades = pliegos del Sector 10 cuyo nombre contiene 'U.N.' o 'UNIVERSIDAD'. Una universidad aparece solo en los años en que existe como pliego.",
            "programa = Categoría presupuestal (Programa Presupuestal): 0066 Formación universitaria de pregrado; 0137 Desarrollo de la Ciencia, Tecnología e Innovación Tecnológica (proxy de I+D presupuestal; NO incluye investigación financiada dentro de 0066/9002 ni la de canon reportada en otras categorías); 9001 Acciones centrales; 9002 APNOP.",
            "proyectos = códigos de inversión (CUI, empiezan con '2') del drill Producto/Proyecto; se omiten filas con PIA=PIM=DEV=0. Incluye IOARR. resumen_inversion = suma de esos proyectos.",
            "total = fila del pliego en la lista del sector (todas las categorías y fuentes).",
            f"Validación: suma de categorías vs total del pliego (PIM): {len(checks)} comparaciones, {len(bad)} con diferencia > S/1.",
        ],
        "cobertura": cov,
        "universidades": dict(sorted(data.items())),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(data)} universidades, {n_files} archivos de caché, años {years}")
    for dim, c in cov.items():
        print(f"  {dim}: " + " ".join(f"{y}:{n}" for y, n in c.items()))
    print(f"validación: {len(checks)} comparaciones, {len(bad)} fuera de tolerancia")
    for b in bad[:15]:
        print("   ", b)
    print("->", os.path.relpath(OUT))


if __name__ == "__main__":
    main()
