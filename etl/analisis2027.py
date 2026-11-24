#!/usr/bin/env python3
"""¿A quién le dieron más en 2027? Reparto del aumento PIA 2026 → PIA 2027 (dictamen) entre universidades.
Lee data/observatorio.json + data/ley2027/ley2027.json; escribe data/analisis2027.json. Correr después de build.py."""
import json, os, statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
obs = json.load(open(os.path.join(ROOT, "data", "observatorio.json"), encoding="utf-8"))
l27 = json.load(open(os.path.join(ROOT, "data", "ley2027", "ley2027.json"), encoding="utf-8"))

GEN = {"personal": "2.1", "pensiones": "2.2", "bys": "2.3", "inversion": "2.6"}


def g(d, pref):
    return sum(v for k, v in (d or {}).items() if k.strip().startswith(pref))


def gen26(a, pref):
    return sum((v.get("pia") or 0) for k, v in (a.get("generica") or {}).items() if k.strip().startswith(pref))


def fu(d, pat):
    return sum((v if isinstance(v, (int, float)) else (v.get("pia") or 0)) for k, v in (d or {}).items() if pat in k.upper())


rows = []
for u in obs["universidades"]:
    pl = u["pliego"]
    e = l27["universidades"].get(pl)
    a26 = u["anios"].get("2026", {})
    a25 = u["anios"].get("2025", {})
    pia26 = (a26.get("total") or {}).get("pia") or 0
    if not e or not e.get("pia_2027"):
        rows.append({"pliego": pl, "uni": u.get("corto") or u["nombre"], "nombre": u["nombre"],
                     "departamento": u.get("departamento"), "pia_2026": pia26, "pia_2027": 0, "sin_2027": True})
        continue
    p27 = e["pia_2027"]
    est = None
    for y in ("2026", "2025", "2024", "2023"):
        est = (u["anios"].get(y) or {}).get("estudiantes")
        if est:
            break
    k25 = a25.get("kpi") or {}
    r = {"pliego": pl, "uni": u.get("corto") or u["nombre"], "nombre": u["nombre"],
         "departamento": u.get("departamento"), "creacion": u.get("creacion"),
         "pia_2026": pia26, "pim_2026": (a26.get("total") or {}).get("pim"), "pia_2027": p27,
         "delta": p27 - pia26, "var_pct": (p27 / pia26 - 1) if pia26 else None, "nueva": not pia26,
         "estudiantes": est, "ejec_2025": k25.get("ejec"), "ejec_proy_2025": k25.get("ejec_proyectos"),
         "dev_2025": (a25.get("total") or {}).get("dev"),
         "pia_2025": (a25.get("total") or {}).get("pia"), "pim_2025": (a25.get("total") or {}).get("pim")}
    r["var_vs_pim_2026"] = (p27 / r["pim_2026"] - 1) if r.get("pim_2026") else None
    r["var_pia_2026_vs_2025"] = (pia26 / r["pia_2025"] - 1) if r.get("pia_2025") and pia26 else None
    # descomposición del delta por genérica y por fuente
    for k, pref in GEN.items():
        r[f"d_{k}"] = g(e.get("generica"), pref) - gen26(a26, pref)
    r["d_otros"] = r["delta"] - sum(r[f"d_{k}"] for k in GEN)
    for k, pat in (("ro", "ORDINARIOS"), ("rdr", "DIRECTAMENTE"), ("rd", "DETERMINADOS"), ("dyt", "DONACIONES")):
        r[f"f_{k}"] = fu(e.get("fuente"), pat) - fu(a26.get("fuente"), pat)
    r["por_estudiante_2027"] = round(p27 / est) if est else None
    r["por_estudiante_2026"] = round(pia26 / est) if est and pia26 else None
    rows.append(r)

def clasificar(r):
    """Sube de verdad: PIA 2027 > PIA 2026 y > PIM 2026. Solo en papel: > PIA 2026 pero < PIM 2026. Baja: < PIA 2026."""
    if r.get("sin_2027"):
        return "sin_2027"
    if r.get("nueva"):
        return "nueva"
    if r["pia_2027"] < r["pia_2026"]:
        return "baja"
    if r.get("pim_2026") and r["pia_2027"] < r["pim_2026"]:
        return "sube_en_papel"
    return "sube"


for r in rows:
    r["categoria"] = clasificar(r)

con = [r for r in rows if not r.get("sin_2027")]
tot_d = sum(r["delta"] for r in con)
sube = sorted([r for r in con if r["delta"] > 0], key=lambda r: -r["delta"])
baja = sorted([r for r in con if r["delta"] < 0], key=lambda r: r["delta"])
top5 = sum(r["delta"] for r in sube[:5])
top10 = sum(r["delta"] for r in sube[:10])

comp = {k: sum(r[f"d_{k}"] for r in con) for k in list(GEN) + ["otros"]}
fuentes = {k: sum(r[f"f_{k}"] for r in con) for k in ("ro", "rdr", "rd", "dyt")}

dep = {}
for r in con:
    d = r.get("departamento") or "Sin dato"
    x = dep.setdefault(d, {"departamento": d, "pia_2026": 0, "pia_2027": 0, "n": 0})
    x["pia_2026"] += r["pia_2026"]; x["pia_2027"] += r["pia_2027"]; x["n"] += 1
for x in dep.values():
    x["delta"] = x["pia_2027"] - x["pia_2026"]
    x["var_pct"] = (x["pia_2027"] / x["pia_2026"] - 1) if x["pia_2026"] else None
deps = sorted(dep.values(), key=lambda x: -x["delta"])


# ¿Reciben más las que ejecutan mejor? (correlación de rangos simple entre ejecución 2025 y var % 2027)
def spearman(xs, ys):
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i]); r = [0] * len(v)
        for pos, i in enumerate(o):
            r[i] = pos
        return r
    rx, ry = rk(xs), rk(ys)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return round(num / den, 2) if den else None


par = [(r["ejec_2025"], r["var_pct"]) for r in con if r.get("ejec_2025") is not None and r.get("var_pct") is not None
       and r["pia_2026"] >= 10e6]
rho_ejec = spearman([a for a, _ in par], [b for _, b in par]) if len(par) > 5 else None
par2 = [(r["ejec_proy_2025"], r["d_inversion"]) for r in con if r.get("ejec_proy_2025") is not None]
rho_inv = spearman([a for a, _ in par2], [b for _, b in par2]) if len(par2) > 5 else None

# Las que bajan: ¿por qué? (qué genérica explica la caída)
for r in baja:
    caidas = {k: r[f"d_{k}"] for k in list(GEN) + ["otros"]}
    r["explica"] = min(caidas, key=caidas.get)

pe = [r for r in con if r.get("por_estudiante_2027") and r.get("por_estudiante_2026")]
out = {
    "fuente": "Dictamen Presupuesto 2027 (anexos 4 y 5 del proyecto) vs PIA 2026 (SIAF, Consulta Amigable MEF)",
    "notas": [
        "Montos nominales. PIA 2026 vs PIA 2027: compara el presupuesto con el que arranca cada año.",
        "Los anexos de la autógrafa aprobada el 20-nov-2026 no están publicados; los montos por universidad pueden variar.",
        "Descomposición por genérica: PIA 2027 (Anexo 5) menos PIA 2026 (SIAF) por genérica.",
        "Correlaciones de Spearman con universidades de PIA 2026 ≥ S/ 10 M; describen asociación, no causalidad.",
    ],
    "total": {"pia_2026": sum(r["pia_2026"] for r in con), "pia_2027": sum(r["pia_2027"] for r in con),
              "delta": tot_d, "n_suben": len(sube), "n_bajan": len(baja),
              "n_sin_2027": sum(1 for r in rows if r.get("sin_2027")),
              "top5_delta": top5, "top5_pct_del_aumento": top5 / tot_d if tot_d else None,
              "top10_pct_del_aumento": top10 / tot_d if tot_d else None,
              "suma_subidas": sum(r["delta"] for r in sube), "suma_bajadas": sum(r["delta"] for r in baja)},
    "categorias": {c: {"n": sum(1 for r in rows if r["categoria"] == c),
                       "delta_vs_pia": sum((r.get("delta") or 0) for r in rows if r["categoria"] == c)}
                   for c in ("sube", "sube_en_papel", "baja", "nueva", "sin_2027")},
    "por_generica": comp, "por_fuente": fuentes,
    "rho_ejecucion_vs_aumento": rho_ejec, "rho_ejec_proyectos_vs_aumento_inversion": rho_inv,
    "por_departamento": deps,
    "por_estudiante": {"mediana_2026": statistics.median([r["por_estudiante_2026"] for r in pe]) if pe else None,
                       "mediana_2027": statistics.median([r["por_estudiante_2027"] for r in pe]) if pe else None,
                       "n": len(pe)},
    "universidades": sorted(rows, key=lambda r: -(r.get("delta") or 0)),
}
json.dump(out, open(os.path.join(ROOT, "data", "analisis2027.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"), default=lambda x: round(x, 4) if isinstance(x, float) else x)

M = lambda x: f"S/ {x/1e6:,.1f} M"
t = out["total"]
print(f"Aumento total {M(t['delta'])}: {t['n_suben']} suben ({M(t['suma_subidas'])}), {t['n_bajan']} bajan ({M(t['suma_bajadas'])}), {t['n_sin_2027']} sin 2027")
print(f"Top 5 se llevan {t['top5_pct_del_aumento']:.0%} del aumento neto; top 10 {t['top10_pct_del_aumento']:.0%}")
for r in sube[:8]:
    print(f"  ▲ {r['uni']:<28} {M(r['delta']):>12} ({(r['var_pct'] or 0):+.0%})  inv {M(r['d_inversion'])}  canon/RD {M(r['f_rd'])}")
for r in baja[:6]:
    print(f"  ▼ {r['uni']:<28} {M(r['delta']):>12} ({(r['var_pct'] or 0):+.0%})  explica: {r['explica']}")
print("Por genérica:", {k: M(v) for k, v in comp.items()})
print("Por fuente:", {k: M(v) for k, v in fuentes.items()})
print("rho ejecución 2025 vs var% 2027:", rho_ejec, "| rho ejec proyectos vs Δ inversión:", rho_inv)
print("Departamentos top:", [(d["departamento"], M(d["delta"])) for d in deps[:5]])
print("Departamentos bajan:", [(d["departamento"], M(d["delta"])) for d in deps[-4:]])
print("Por estudiante mediana:", out["por_estudiante"])
