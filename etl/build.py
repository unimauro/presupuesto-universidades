#!/usr/bin/env python3
"""Integrador: une los JSON de cada fuente en data/observatorio.json y calcula KPIs + índice.

Entradas (todas opcionales salvo gasto):
  data/gasto/gasto.json          total / genérica / fuente / categoría por pliego-año
  data/inversion/inversion.json  programa / función / proyectos
  data/ingresos/ingresos.json    ingresos (PIA, PIM, recaudado) por fuente / genérica
  data/contexto/contexto.json    identidad, estudiantes, docentes, pubs
  data/normativa/normativa.json  leyes, DS de transferencias, canon
Uso:  python3 etl/build.py
"""
import json, os, re, datetime, statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, "data", *p)


def load(*p):
    try:
        with open(D(*p), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"  (falta {'/'.join(p)})")
        return {}


def ratio(a, b):
    return round(a / b, 4) if a is not None and b else None


def find(d, pat):
    """Suma los rubros cuyo nombre calza con el regex pat."""
    rx = re.compile(pat, re.I)
    hits = [v for k, v in (d or {}).items() if rx.search(k)]
    if not hits:
        return None
    return {m: sum((h.get(m) or 0) for h in hits) for m in ("pia", "pim", "dev", "recaudado") if any(m in h for h in hits)}


RX = {
    "personal": r"^\s*2\.1\b|PERSONAL Y OBLIGACIONES",
    "pensiones": r"^\s*2\.2\b|PENSIONES",
    "bys": r"^\s*2\.3\b|BIENES Y SERVICIOS",
    "inversion": r"^\s*2\.6\b|ACTIVOS NO FINANCIEROS",
    "idi": r"^\s*0?137\b|CIENCIA,? TECNOLOG",
    "rdr": r"DIRECTAMENTE RECAUDADOS",
    "proyectos": r"PROYECTO",
}


def kpis(a):
    t = a.get("total") or {}
    pim, dev, pia = t.get("pim"), t.get("dev"), t.get("pia")
    base = dev if dev else pim
    k = {"ejec": ratio(dev, pim), "pim_vs_pia": ratio(pim, pia)}
    for key in ("personal", "pensiones", "bys", "inversion"):
        g = find(a.get("generica"), RX[key])
        k[f"pct_{key}"] = ratio(g and (g.get("dev") or g.get("pim")), base) if g else None
    g = find(a.get("generica"), RX["inversion"])
    k["ejec_inversion"] = ratio(g.get("dev"), g.get("pim")) if g else None
    p = find(a.get("categoria"), RX["proyectos"])
    k["ejec_proyectos"] = ratio(p.get("dev"), p.get("pim")) if p else None
    i = find(a.get("programa"), RX["idi"])
    k["idi_pim"] = i.get("pim") if i else None
    k["idi_dev"] = i.get("dev") if i else None
    k["pct_idi"] = ratio(i and i.get("pim"), pim) if i else (0.0 if a.get("programa") else None)
    k["ejec_idi"] = ratio(i.get("dev"), i.get("pim")) if i and i.get("pim") else None
    r = find(a.get("fuente"), RX["rdr"])
    k["pct_rdr"] = ratio(r and (r.get("dev") or r.get("pim")), base) if r else None
    # RDR sin saldos de balance: los saldos registran caja acumulada y distorsionan (p.ej. canon no gastado).
    ri = (a.get("ingresos") or {}).get("rdr_sin_saldos")
    if not ri:
        ri = find((a.get("ingresos") or {}).get("fuente") or {}, RX["rdr"])
    k["rdr_recaudado"] = ri.get("recaudado") if ri else None
    k["rdr_recaudado_vs_pim"] = ratio(ri.get("recaudado"), ri.get("pim")) if ri else None
    est = a.get("estudiantes")
    k["gasto_por_estudiante"] = round(dev / est) if dev and est else None
    pubs = a.get("pubs")
    k["idi_por_pub"] = round(k["idi_dev"] / pubs) if k["idi_dev"] and pubs else None
    return k


def pct_rank(vals, v, higher_better=True):
    xs = sorted(x for x in vals if x is not None)
    if v is None or not xs:
        return None
    below = sum(1 for x in xs if x < v) + 0.5 * sum(1 for x in xs if x == v)
    p = below / len(xs)
    return round(100 * (p if higher_better else 1 - p), 1)


# Índice referencial (NO oficial): percentil entre universidades, promedio de los años cerrados de la ventana.
COMPONENTES = {
    "ejecucion":     ("ejec", 0.30),             # capacidad de gasto global
    "inversion":     ("ejec_proyectos", 0.25),   # capacidad de ejecutar obras
    "investigacion": ("ejec_idi", 0.20),         # ejecuta lo asignado a I+D
    "prioridad_idi": ("pct_idi", 0.10),          # cuánto del presupuesto va a I+D
    "autonomia_rdr": ("pct_rdr", 0.15),          # capacidad de generar recursos propios
}
# Etiquetas cortas legibles (no siglas oficiales) para universidades sin sigla conocida
CORTOS = {"560": "UN Arte Diego Quispe Tito", "561": "UN Música", "564": "UNT San Juan de Lurigancho",
          "565": "UN Fronteriza Yunguyo", "566": "UN Sechura", "567": "UN VRAEM", "568": "UN Carabaya",
          "569": "UN Cutervo", "570": "UNA Chupaca", "571": "UN Folklore J.M. Arguedas",
          "572": "UNA Distrito San Marcos", "573": "UNT Chincha", "574": "UN Huancabamba",
          "575": "UN Desaguadero", "576": "UNI Aimara Ilave", "577": "UNA Bellas Artes",
          "578": "UNA Chiclayo", "579": "UNA Olmos", "582": "UNA Parinacochas", "583": "UNA Perla del Vilcanota"}
VENTANA = 3
EXCLUIR = {"540"}  # Asamblea Nacional de Rectores (2012-2016): pliego del sector, no es universidad


def main():
    gasto, inv, ing = load("gasto", "gasto.json"), load("inversion", "inversion.json"), load("ingresos", "ingresos.json")
    ctx, nor = load("contexto", "contexto.json"), load("normativa", "normativa.json")
    l27 = load("ley2027", "ley2027.json")
    if not gasto.get("universidades"):
        raise SystemExit("Sin data/gasto/gasto.json todavía: nada que integrar.")

    gu, iu, nu, cu = (x.get("universidades", {}) for x in (gasto, inv, ing, ctx))
    parcial = gasto.get("parcial", {})
    anios = sorted({int(y) for u in gu.values() for y in u.get("anios", {})})
    cerrados = [y for y in anios if str(y) not in parcial]

    # Transferencias por pliego-año
    trans = {}
    for t in nor.get("transferencias", []):
        y = (t.get("fecha") or "")[:4]
        for pl, m in (t.get("por_pliego") or {}).items():
            trans.setdefault(pl, {}).setdefault(y, []).append(
                {"norma": t.get("norma"), "fecha": t.get("fecha"), "monto": m, "finalidad": t.get("descripcion") or t.get("finalidad"), "url": t.get("url")})
    canon = nor.get("canon", {})
    ley_pia = {}
    for l in nor.get("leyes", []):
        for pl, m in (l.get("pia_por_pliego") or {}).items():
            ley_pia.setdefault(pl, {})[str(l.get("anio"))] = m

    unis = []
    for pl, g in sorted(gu.items()):
        if pl in EXCLUIR:
            continue
        c = cu.get(pl, {})
        out = {"pliego": pl, "nombre": c.get("nombre") or g.get("nombre"), "corto": CORTOS.get(pl) or c.get("corto") or c.get("sigla"),
               "departamento": c.get("departamento"), "ciudad": c.get("ciudad"), "lat": c.get("lat"), "lng": c.get("lng"),
               "creacion": c.get("creacion"), "licencia": c.get("licencia"), "tipo": c.get("tipo"), "anios": {}}
        for y, a in g.get("anios", {}).items():
            a = dict(a)
            for dim in ("generica", "fuente", "categoria"):  # en desgloses basta pia/pim/dev (total conserva los 6)
                if isinstance(a.get(dim), dict):
                    a[dim] = {k: {m: v.get(m) for m in ("pia", "pim", "dev") if m in v} for k, v in a[dim].items()}
            ia = iu.get(pl, {}).get("anios", {}).get(y, {})
            for k in ("programa", "funcion", "proyectos"):
                if ia.get(k):
                    a[k] = ia[k]
            na = nu.get(pl, {}).get("anios", {}).get(y)
            if na:
                # rdr_detalle (específica) pesa ~3 MB y la web no lo usa: queda solo en data/ingresos/ingresos.json
                a["ingresos"] = {k: v for k, v in na.items() if k != "rdr_detalle"}
            for k in ("estudiantes", "docentes", "pubs"):
                serie = c.get(k) or {}
                a[k] = serie.get(y)
                if a[k] is None and k != "pubs":
                    # matrícula/docentes (SIRIES) llegan hasta 2023: usar el último año ≤ y con rezago máx. 2
                    prev = [int(x) for x in serie if serie[x] is not None and int(y) - 2 <= int(x) < int(y)]
                    if prev:
                        a[k] = serie[str(max(prev))]
                        a[f"{k}_anio"] = max(prev)
            if trans.get(pl, {}).get(y):
                a["transferencias"] = trans[pl][y]
            if canon.get(pl, {}).get(y) is not None:
                a["canon"] = canon[pl][y]
            if ley_pia.get(pl, {}).get(y) is not None:
                a["pia_ley"] = ley_pia[pl][y]
            a["kpi"] = kpis(a)
            out["anios"][y] = a
        e = (l27.get("universidades") or {}).get(pl)
        if e:
            out["expectativa_2027"] = e
        unis.append(out)

    # Índice
    win = [str(y) for y in cerrados[-VENTANA:]]
    for comp, (kk, _) in COMPONENTES.items():
        for y in win:
            vals = [u["anios"].get(y, {}).get("kpi", {}).get(kk) for u in unis]
            for u in unis:
                v = u["anios"].get(y, {}).get("kpi", {}).get(kk)
                u.setdefault("_p", {}).setdefault(comp, []).append(pct_rank(vals, v))
    for u in unis:
        comps = {}
        for comp, ps in u.pop("_p", {}).items():
            ps = [p for p in ps if p is not None]
            comps[comp] = round(statistics.mean(ps), 1) if ps else None
        w = [(COMPONENTES[c][1], v) for c, v in comps.items() if v is not None]
        tw = sum(x for x, _ in w)
        u["indice"] = {"score": round(sum(x * v for x, v in w) / tw, 1) if tw >= 0.5 else None,
                       "componentes": comps, "cobertura_pesos": round(tw, 2), "ventana": win}
    ranked = sorted([u for u in unis if u["indice"]["score"] is not None], key=lambda u: -u["indice"]["score"])
    for i, u in enumerate(ranked, 1):
        u["indice"]["rank"] = i

    nacional = {}
    for y in anios:
        ys = str(y)
        ts = [u["anios"][ys]["total"] for u in unis if ys in u["anios"]]
        nacional[ys] = {m: sum((t.get(m) or 0) for t in ts) for m in ("pia", "pim", "cert", "comp", "dev", "gir")}
        nacional[ys]["n_unis"] = len(ts)
        idi = [u["anios"][ys]["kpi"] for u in unis if ys in u["anios"]]
        nacional[ys]["idi_pim"] = sum(k.get("idi_pim") or 0 for k in idi)
        nacional[ys]["idi_dev"] = sum(k.get("idi_dev") or 0 for k in idi)

    obs = {
        "generado": datetime.datetime.now().isoformat(timespec="seconds"),
        "anios": anios, "parcial": parcial, "nacional": nacional,
        "notas": (gasto.get("notas") or []) + (inv.get("notas") or []) + (ing.get("notas") or [])
                 + (ctx.get("notas") or []) + (nor.get("notas") or []) + [
            "Índice referencial, NO oficial: promedio ponderado de percentiles entre universidades públicas en los "
            f"últimos {VENTANA} años cerrados ({', '.join(win)}). Mide gestión presupuestal, no calidad académica.",
            "Costo por publicación = devengado del programa 0137 (I+D) / publicaciones; nunca presupuesto total / publicaciones."],
        "indice_metodo": {c: {"kpi": k, "peso": w} for c, (k, w) in COMPONENTES.items()},
        "fuentes": [
            {"nombre": "MEF – Consulta Amigable (SIAF)", "url": "https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx"},
            {"nombre": "MEF – Datos Abiertos, Presupuesto y ejecución de gasto", "url": "https://datosabiertos.mef.gob.pe/dataset/presupuesto-y-ejecucion-de-gasto"},
        ] + [{"nombre": v, "url": (re.search(r"https?://\S+", v) or [""])[0].rstrip(").,;"),
              "tema": {"matricula": "estudiantes", "estudiantes": "estudiantes", "pubs": "pubs",
                       "publicaciones": "pubs"}.get(k, k)}
             for k, v in (ctx.get("fuentes") or {}).items() if isinstance(v, str)],
        "documentos": nor.get("documentos", []),
        "leyes": [{k: l.get(k) for k in ("anio", "norma", "url")} for l in nor.get("leyes", [])],
        "universidades": unis,
    }
    ipc = load("ipc.json")
    if ipc:
        obs["ipc"] = {"base": 2025, "indice": ipc["indice_promedio_anual"], "fuente": ipc["fuente"], "url": ipc["url"],
                      "nota": "Soles reales de 2025 = nominal × 100 / índice del año. " + ipc.get("nota_2026", "")}
    if l27:
        obs["expectativa_2027"] = {k: l27.get(k) for k in
                                   ("version", "norma", "fecha", "url", "estado_tramite", "documentos", "notas",
                                    "total_universidades", "disposiciones")}
    bl = load("baseline", "baseline.json")
    if bl.get("anios"):
        # línea base: universidades vs presupuesto público total, Educación, PBI (participación precalculada)
        for y, b in bl["anios"].items():
            n = nacional.get(y)
            if n and (b.get("total") or {}).get("pim"):
                b["pct_unis_en_total_pim"] = ratio(n["pim"], b["total"]["pim"])
                b["pct_unis_en_total_dev"] = ratio(n["dev"], (b["total"] or {}).get("dev"))
            if n and b.get("pbi_nominal"):
                b["pct_unis_en_pbi_dev"] = ratio(n["dev"], b["pbi_nominal"])
        obs["baseline"] = {k: bl.get(k) for k in ("fuente", "notas", "anios")}
    def rnd(x):  # soles enteros: los céntimos no aportan y engordan el JSON
        if isinstance(x, float):
            return round(x) if abs(x) >= 100 else round(x, 4)
        if isinstance(x, dict):
            return {k: rnd(v) for k, v in x.items()}
        if isinstance(x, list):
            return [rnd(v) for v in x]
        return x
    obs = rnd(obs)
    with open(D("observatorio.json"), "w", encoding="utf-8") as f:
        json.dump(obs, f, ensure_ascii=False, separators=(",", ":"))
    partir(obs)
    print(f"OK data/observatorio.json: {len(unis)} universidades, años {anios[0]}–{anios[-1]}, "
          f"rankeadas {len(ranked)}, {os.path.getsize(D('observatorio.json'))/1e6:.1f} MB")


LIGERO = ("total", "kpi", "estudiantes", "docentes", "pubs", "estudiantes_anio", "docentes_anio", "pia_ley", "canon")


def partir(obs):
    """Carga por capas para la web:
    data/resumen.json      todo lo de la raíz + por universidad y año solo total/kpi/contexto (carga inicial)
    data/anio/{año}.json   desglose completo de ese año para todas las universidades (al elegir el año)
    data/u/{pliego}.json   la universidad completa, todos los años (al abrir su ficha)"""
    import shutil
    for sub in ("anio", "u"):
        shutil.rmtree(D(sub), ignore_errors=True)
        os.makedirs(D(sub))
    dump = lambda path, obj: json.dump(obj, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    res = {k: v for k, v in obs.items() if k != "universidades"}
    res["universidades"] = []
    for u in obs["universidades"]:
        lu = {k: v for k, v in u.items() if k != "anios"}
        if isinstance(lu.get("expectativa_2027"), dict):  # detalle (actividades/proyectos/productos) solo en u/{pliego}
            lu["expectativa_2027"] = {k: v for k, v in lu["expectativa_2027"].items()
                                      if k not in ("actividades", "proyectos", "productos", "categoria_presupuestal")}
        lu["anios"] = {}
        for y, a in u["anios"].items():
            la = {k: a[k] for k in LIGERO if k in a}
            ing = a.get("ingresos") or {}
            if ing:
                la["ingresos"] = {k: ing[k] for k in ("total", "total_sin_saldos", "rdr_sin_saldos") if k in ing}
            lu["anios"][y] = la
        res["universidades"].append(lu)
        dump(D("u", f"{u['pliego']}.json"), u)
    res["capas"] = {"anio": "data/anio/{anio}.json", "u": "data/u/{pliego}.json"}
    dump(D("resumen.json"), res)
    for y in obs["anios"]:
        ys = str(y)
        dump(D("anio", f"{ys}.json"), {"anio": y, "universidades": {u["pliego"]: u["anios"][ys]
                                                                     for u in obs["universidades"] if ys in u["anios"]}})
    tam = lambda f: os.path.getsize(f) / 1e3
    print(f"  capas: resumen {tam(D('resumen.json')):.0f} KB · anio/{obs['anios'][-2]} "
          f"{tam(D('anio', str(obs['anios'][-2]) + '.json')):.0f} KB · u/514 {tam(D('u', '514.json')) if os.path.exists(D('u', '514.json')) else 0:.0f} KB")


if __name__ == "__main__":
    main()
