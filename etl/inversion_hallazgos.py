#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente INVERSIÓN — validaciones y hallazgos sobre data/inversion/inversion.json.
Imprime a consola (no escribe archivos). Uso:
  ~/.venvs/pu-inversion/bin/python etl/inversion_hallazgos.py [ruta/universidades-peru/data/universidades.json]
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "..", "data", "inversion", "inversion.json"), encoding="utf-8"))
U = D["universidades"]
M = 1e6


def pp(a, code):
    for k, v in (a.get("programa") or {}).items():
        if k.startswith(code + ":"):
            return v
    return None


def main():
    ref_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        HERE, "..", "..", "universidades-peru", "data", "universidades.json")
    # 1) Validación vs universidades-peru (PP 0137, 2025, en millones)
    if os.path.exists(ref_path):
        R = json.load(open(ref_path, encoding="utf-8"))
        lst = next(v for v in R.values() if isinstance(v, list))
        ref = {u["pliego"]: (u.get("idi") or 0, u.get("idi_dev") or 0) for u in lst if u.get("pliego")}
        tp = td = rp = rd = 0; diffs = []
        for p, (pim, dev) in ref.items():
            v = pp(U.get(p, {}).get("anios", {}).get("2025", {}), "0137") or {"pim": 0, "dev": 0}
            tp += v["pim"]; td += v["dev"]; rp += pim; rd += dev
            if abs(v["pim"] / M - pim) > 0.02 or abs(v["dev"] / M - dev) > 0.02:
                diffs.append((p, pim, dev, round(v["pim"] / M, 2), round(v["dev"] / M, 2)))
        print(f"[validación 0137-2025 vs universidades-peru] {len(ref)} pliegos: ref PIM {rp:.1f} M / dev {rd:.1f} M; "
              f"aquí PIM {tp/M:.1f} M / dev {td/M:.1f} M; {len(diffs)} difieren (>20k)")
        for d in diffs[:10]:
            print("   ", d)
    # 1b) Validación cruzada vs cubo SIAF del VPS (data/existente/siaf_vps/raw_AAAA.json, agente inventario)
    for y in ("2024", "2025"):
        fp = os.path.join(HERE, "..", "data", "existente", "siaf_vps", f"raw_{y}.json")
        if not os.path.exists(fp):
            continue
        C = json.load(open(fp, encoding="utf-8"))["cubo"]
        ix = {c: i for i, c in enumerate(C["cols"])}
        agg = {}
        for r in C["rows"]:
            p = r[ix["pliego"]]
            k = (p, r[ix["programa_ppto"]][:4])
            agg[k] = agg.get(k, 0) + r[ix["pim"]]
            if r[ix["tipo_act_proy"]].upper().startswith("PROY"):
                agg[(p, "PROY")] = agg.get((p, "PROY"), 0) + r[ix["pim"]]
        n = bad = 0
        for (p, code), v in agg.items():
            a = U.get(p, {}).get("anios", {}).get(y, {})
            if code == "PROY":
                mine = (a.get("resumen_inversion") or {}).get("pim")
            else:
                mine = (pp(a, code) or {}).get("pim")
            if mine is None:
                continue
            n += 1
            if abs(mine - v) > 1:
                bad += 1
                if bad <= 5:
                    print(f"    dif {y} {p} {code}: CA {mine:,.0f} vs SIAF {v:,.0f}")
        print(f"[validación vs SIAF VPS {y}] {n} celdas pliego×programa/proyectos comparadas (PIM), {bad} difieren > S/1")
    # 2) Serie nacional I+D (0137) y pregrado (0066)
    years = sorted({y for u in U.values() for y in u["anios"]})
    print("\n[serie nacional] año | PIM total univ | 0137 PIM | 0137 dev | %ej 0137 | inversión(proy) PIM | dev | %ej")
    for y in years:
        tot = sum(u["anios"].get(y, {}).get("total", {}).get("pim", 0) for u in U.values())
        c = [pp(u["anios"].get(y, {}), "0137") for u in U.values()]
        cp = sum(x["pim"] for x in c if x); cd = sum(x["dev"] for x in c if x)
        ri = [u["anios"].get(y, {}).get("resumen_inversion") for u in U.values()]
        ip = sum(x["pim"] for x in ri if x); idv = sum(x["dev"] for x in ri if x)
        print(f"  {y} | {tot/M:8.1f} | {cp/M:6.1f} | {cd/M:6.1f} | {100*cd/cp if cp else 0:5.1f}% | "
              f"{ip/M:7.1f} | {idv/M:7.1f} | {100*idv/ip if ip else 0:5.1f}%  (univ con proy: {sum(1 for x in ri if x)})")
    # 3) I+D con ejecución < 20 % (PIM >= 0.5 M), años cerrados
    print("\n[I+D 0137 con ejecución < 20 % y PIM >= S/0.5 M]")
    for y in years[:-1]:
        low = []
        for p, u in U.items():
            v = pp(u["anios"].get(y, {}), "0137")
            if v and v["pim"] >= 0.5 * M and v["dev"] / v["pim"] < 0.2:
                low.append((p, u["nombre"][5:40], round(v["pim"] / M, 2), round(100 * v["dev"] / v["pim"], 1)))
        if low:
            print(f"  {y}: " + "; ".join(f"{a} {b} PIM {c} M ({d}%)" for a, b, c, d in sorted(low, key=lambda r: -r[2])))
    # 4) Proyectos PIM alto y avance ~0 (años cerrados)
    print("\n[proyectos con PIM >= S/5 M y devengado < 5 % — años cerrados]")
    rows = []
    for p, u in U.items():
        for y, a in u["anios"].items():
            if y == years[-1]:
                continue
            for r in a.get("proyectos", []):
                if r["pim"] >= 5 * M and r["dev"] < 0.05 * r["pim"]:
                    rows.append((r["pim"], y, p, u["nombre"][5:35], r["codigo"], r["nombre"][:80], r["dev"]))
    for r in sorted(rows, reverse=True)[:25]:
        print(f"  {r[1]} {r[2]} {r[3]:30s} {r[4]} PIM {r[0]/M:6.1f} M dev {r[6]/M:5.2f} M  {r[5]}")
    print(f"  (total {len(rows)} casos)")
    # 5) Capacidad de ejecutar inversión por universidad (2019-2025 acumulado)
    print("\n[ejecución de inversión acumulada 2019-2025: peor 12 con PIM >= S/30 M]")
    agg = []
    for p, u in U.items():
        ip = idv = 0
        for y in map(str, range(2019, 2026)):
            ri = u["anios"].get(y, {}).get("resumen_inversion")
            if ri:
                ip += ri["pim"]; idv += ri["dev"]
        if ip >= 30 * M:
            agg.append((idv / ip, p, u["nombre"][5:45], ip / M, idv / M))
    for r in sorted(agg)[:12]:
        print(f"  {r[1]} {r[2]:40s} PIM {r[3]:7.1f} M dev {r[4]:7.1f} M  {100*r[0]:5.1f}%")
    print("  mejores:", "; ".join(f"{r[1]} {r[2][:25]} {100*r[0]:.0f}%" for r in sorted(agg)[-5:]))


if __name__ == "__main__":
    main()
