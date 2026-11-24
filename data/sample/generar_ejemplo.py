#!/usr/bin/env python3
"""Genera data/sample/observatorio.json con DATOS FICTICIOS DE EJEMPLO.

Sirve solo para desarrollar y probar el frontend mientras el integrador
produce data/observatorio.json con datos reales del MEF. Mismo esquema.
Uso:  python3 data/sample/generar_ejemplo.py
"""
import json
import random
from pathlib import Path

random.seed(20261123)
ANIOS = list(range(2016, 2027))
PARCIAL = 2026

# pliego, nombre, corto, depto, lat, lng, creacion, licencia, base_pia, canon, pubs0, est0
UNIS = [
    ("510", "Universidad Nacional Mayor de San Marcos", "UNMSM", "LIMA", -12.0560, -77.0844, 1551, "Licenciada (2018)", 620e6, 0.00, 900, 33000),
    ("514", "Universidad Nacional de Ingeniería", "UNI", "LIMA", -12.0236, -77.0483, 1876, "Licenciada (2017)", 260e6, 0.00, 420, 13500),
    ("513", "Universidad Nacional de San Agustín de Arequipa", "UNSA", "AREQUIPA", -16.4040, -71.5246, 1828, "Licenciada (2018)", 300e6, 0.30, 380, 26000),
    ("512", "Universidad Nacional de San Antonio Abad del Cusco", "UNSAAC", "CUSCO", -13.5226, -71.9573, 1692, "Licenciada (2019)", 270e6, 0.32, 210, 21000),
    ("515", "Universidad Nacional de Trujillo", "UNT", "LA LIBERTAD", -8.1116, -79.0288, 1824, "Licenciada (2018)", 190e6, 0.05, 260, 17000),
    ("520", "Universidad Nacional Agraria La Molina", "UNALM", "LIMA", -12.0823, -76.9476, 1902, "Licenciada (2017)", 120e6, 0.00, 310, 6500),
    ("523", "Universidad Nacional de la Amazonía Peruana", "UNAP", "LORETO", -3.7491, -73.2538, 1961, "Licenciada (2019)", 140e6, 0.18, 70, 11000),
    ("541", "Universidad Nacional de Juliaca", "UNAJ", "PUNO", -15.4997, -70.1333, 2007, "Licenciada (2019)", 28e6, 0.08, 12, 2800),
]

GEN = ["2.1 PERSONAL Y OBLIGACIONES SOCIALES", "2.2 PENSIONES Y OTRAS PRESTACIONES SOCIALES",
       "2.3 BIENES Y SERVICIOS", "2.5 OTROS GASTOS", "2.6 ADQUISICION DE ACTIVOS NO FINANCIEROS"]
GEN_EJEC = [0.975, 0.985, 0.86, 0.8, 0.5]
FUE = ["RECURSOS ORDINARIOS", "RECURSOS DIRECTAMENTE RECAUDADOS", "RECURSOS DETERMINADOS", "DONACIONES Y TRANSFERENCIAS"]
FUE_EJEC = [0.93, 0.8, 0.55, 0.6]
PROG = ["0066: FORMACION UNIVERSITARIA DE PREGRADO",
        "0137: DESARROLLO DE LA CIENCIA, TECNOLOGIA E INNOVACION TECNOLOGICA",
        "9001: ACCIONES CENTRALES", "9002: ASIGNACIONES PRESUPUESTARIAS QUE NO RESULTAN EN PRODUCTOS"]
PROG_EJEC = [0.86, 0.55, 0.93, 0.88]
PROY_TPL = ["MEJORAMIENTO DEL SERVICIO DE FORMACION PROFESIONAL DE LA FACULTAD DE {f}",
            "CREACION DEL PABELLON DE LABORATORIOS DE {f}",
            "MEJORAMIENTO DE LA CAPACIDAD RESOLUTIVA DEL CENTRO DE INVESTIGACION EN {f}",
            "AMPLIACION DE LA BIBLIOTECA CENTRAL Y SERVICIOS DIGITALES",
            "MEJORAMIENTO DE LA INFRAESTRUCTURA DEPORTIVA DEL CAMPUS UNIVERSITARIO",
            "INSTALACION DEL SISTEMA DE TELECOMUNICACIONES Y RED DE DATOS DEL CAMPUS"]
FACS = ["INGENIERIA CIVIL", "CIENCIAS", "MEDICINA HUMANA", "AGRONOMIA", "EDUCACION", "INGENIERIA ELECTRICA", "QUIMICA"]


def r(a, b):
    return random.uniform(a, b)


def split(total, shares):
    s = sum(shares)
    return [total * x / s for x in shares]


def trio(pia, pim, dev):
    return {"pia": round(pia), "pim": round(pim), "dev": round(dev)}


def build_year(u, y, base, canon, idx):
    k = y - ANIOS[0]
    pia = base * (1.045 ** k) * r(0.96, 1.04)
    if y == 2020:
        pia *= 0.97
    pim = pia * r(1.12, 1.35) + pia * canon * r(0.6, 1.4)
    partial = 0.78 if y == PARCIAL else 1.0

    # genéricas (PIM shares, PIA shares)
    g_pim = split(pim, [r(46, 58), r(3, 9), r(20, 28), r(1, 3), r(10, 22) + canon * 40])
    g_pia = split(pia, [r(55, 64), r(4, 9), r(18, 24), r(1, 2), r(3, 8)])
    g_dev = [g_pim[i] * min(GEN_EJEC[i] * r(0.9, 1.04), 0.999) * partial for i in range(5)]
    dev = sum(g_dev)
    generica = {GEN[i]: trio(g_pia[i], g_pim[i], g_dev[i]) for i in range(5)}

    # fuentes
    rdr_sh = r(10, 22)
    f_pim = split(pim, [r(55, 70), rdr_sh, canon * 100 * r(0.8, 1.1) + 0.5, r(1, 4)])
    f_pia = split(pia, [r(70, 82), rdr_sh, canon * 40 + 0.2, r(0, 1)])
    f_dev_raw = [f_pim[i] * FUE_EJEC[i] * r(0.9, 1.08) for i in range(4)]
    f_dev = split(dev, f_dev_raw)
    fuente = {FUE[i]: trio(f_pia[i], f_pim[i], f_dev[i]) for i in range(4)}

    # categoría
    act = GEN[4]
    proy_pim = g_pim[4] * r(0.8, 0.9)
    proy_dev = g_dev[4] * r(0.75, 0.9)
    proy_pia = g_pia[4] * 0.7
    categoria = {
        "ACTIVIDADES": trio(pia - proy_pia, pim - proy_pim, dev - proy_dev),
        "PROYECTOS": trio(proy_pia, proy_pim, proy_dev),
    }

    # programas
    p_pim = split(pim, [r(50, 60), r(2, 6) + canon * 10, r(22, 28), r(10, 16)])
    p_pia = split(pia, [r(55, 62), r(1.5, 4), r(22, 28), r(10, 14)])
    p_dev = split(dev, [p_pim[i] * PROG_EJEC[i] * r(0.9, 1.1) for i in range(4)])
    programa = {PROG[i]: trio(p_pia[i], p_pim[i], p_dev[i]) for i in range(4)}

    # proyectos
    n = random.randint(3, 6)
    shares = [r(1, 10) for _ in range(n)]
    pp = split(proy_pim, shares)
    pd_raw = [x * r(0.0, 1.0) ** 0.7 for x in pp]
    pdv = split(proy_dev, pd_raw) if sum(pd_raw) else [0] * n
    pdv = [min(a, b) for a, b in zip(pdv, pp)]
    proyectos = []
    for i in range(n):
        tpl = PROY_TPL[(idx + i) % len(PROY_TPL)]
        proyectos.append({
            "codigo": str(2300000 + idx * 1000 + i * 37 + (y % 10)),
            "nombre": tpl.format(f=FACS[(idx + i) % len(FACS)]) + " - " + u[2],
            "pia": round(pp[i] * r(0, 0.6)), "pim": round(pp[i]), "dev": round(pdv[i])})

    # ingresos
    rdr_pim = f_pim[1]
    rec = rdr_pim * r(0.78, 1.08) * partial
    ingresos = {
        "total": {"pia": round(sum(f_pia)), "pim": round(pim), "recaudado": round(pim * r(0.88, 1.02) * partial)},
        "fuente": {"RECURSOS DIRECTAMENTE RECAUDADOS": {"pia": round(f_pia[1]), "pim": round(rdr_pim), "recaudado": round(rec)}},
    }

    est = round(u[11] * (1.02 ** k) * r(0.98, 1.02))
    doc = round(est / r(14, 22))
    pubs = round(u[10] * (1.11 ** k) * r(0.9, 1.1)) if y < PARCIAL else None
    if y == 2016 and idx % 3 == 0:
        est = None

    transfer = []
    for t in range(random.randint(0, 3)):
        mes = random.randint(3, 11)
        transfer.append({
            "norma": f"[Ejemplo] D.S. N° {random.randint(50, 380):03d}-{y}-EF",
            "fecha": f"{y}-{mes:02d}-{random.randint(1, 28):02d}",
            "monto": round((pim - pia) * r(0.05, 0.3)),
            "finalidad": random.choice([
                "Transferencia de partidas para el pago de la homologación docente",
                "Financiamiento de proyectos de inversión en infraestructura",
                "Crédito suplementario por saldos de balance",
                "Pago de bonificaciones y obligaciones sociales del personal",
                "Financiamiento de actividades de investigación (PP 0137)"]),
            "url": None})

    idi_dev = p_dev[1]
    tot = {"pia": round(pia), "pim": round(pim), "cert": round(min(pim, dev * 1.06)),
           "comp": round(dev * 1.02), "dev": round(dev), "gir": round(dev * 0.985)}
    kpi = {
        "ejec": dev / pim, "pim_vs_pia": pim / pia,
        "pct_personal": g_dev[0] / dev, "pct_bys": g_dev[2] / dev, "pct_inversion": g_dev[4] / dev,
        "pct_idi": idi_dev / dev, "ejec_inversion": g_dev[4] / g_pim[4], "ejec_idi": p_dev[1] / p_pim[1],
        "pct_rdr": f_pim[1] / pim, "rdr_recaudado_vs_pim": rec / rdr_pim,
        "gasto_por_estudiante": (dev / est) if est else None,
        "idi_por_pub": (idi_dev / pubs) if pubs else None,
    }
    return {"total": tot, "generica": generica, "fuente": fuente, "categoria": categoria,
            "programa": programa, "proyectos": proyectos, "ingresos": ingresos,
            "estudiantes": est, "docentes": doc, "pubs": pubs, "transferencias": transfer, "kpi": kpi}


def pct_rank(vals, v):
    xs = sorted(x for x in vals if x is not None)
    if v is None or not xs:
        return None
    return 100 * sum(1 for x in xs if x <= v) / len(xs)


def main():
    unis = []
    for idx, u in enumerate(UNIS):
        anios = {str(y): build_year(u, y, u[8], u[9], idx) for y in ANIOS}
        unis.append({"pliego": u[0], "nombre": u[1], "corto": u[2], "departamento": u[3],
                     "lat": u[4], "lng": u[5], "creacion": u[6], "licencia": u[7], "anios": anios})

    # índice referencial sobre el último año cerrado
    yc = str(PARCIAL - 1)
    comp_keys = {"ejecucion": "ejec", "inversion": "ejec_inversion", "investigacion": "pct_idi",
                 "autonomia_rdr": "pct_rdr", "eficiencia": "idi_por_pub"}
    for key, kk in comp_keys.items():
        vals = [x["anios"][yc]["kpi"][kk] for x in unis]
        for x in unis:
            v = pct_rank(vals, x["anios"][yc]["kpi"][kk])
            if key == "eficiencia" and v is not None:
                v = 100 - v + 100 / len(vals)  # menor costo por publicación = mejor
            x.setdefault("indice", {"componentes": {}})["componentes"][key] = round(v, 1)
    for x in unis:
        c = x["indice"]["componentes"]
        x["indice"]["score"] = round(sum(c.values()) / len(c), 1)
    for i, x in enumerate(sorted(unis, key=lambda z: -z["indice"]["score"])):
        x["indice"]["rank"] = i + 1
    # quita un componente a una para probar tolerancia a nulls
    unis[-1]["indice"]["componentes"]["eficiencia"] = None

    # Expectativa 2027 (ficticia): PIA 2027 vs PIA 2026
    t26 = t27 = 0
    for i, x in enumerate(unis):
        a = x["anios"][str(PARCIAL)]
        p26 = a["total"]["pia"]
        p27 = round(p26 * r(0.9, 1.16))
        t26 += p26
        t27 += p27
        f = p27 / p26
        exp = {"pia_2027": p27, "pia_2026": p26, "var_pct": round((p27 / p26 - 1) * 100, 2),
               "generica": {k: round(v["pia"] * f * r(0.95, 1.05)) for k, v in a["generica"].items()},
               "fuente": {k: round(v["pia"] * f * r(0.95, 1.05)) for k, v in a["fuente"].items()}}
        if i == len(unis) - 1:
            exp = {"pia_2027": None, "pia_2026": p26, "var_pct": None}  # prueba de nulls
        x["expectativa_2027"] = exp
    expectativa = {
        "version": "proyecto",
        "norma": "[Ejemplo] Proyecto de Ley de Presupuesto del Sector Público para el Año Fiscal 2027",
        "fecha": "2026-08-30", "url": None,
        "documentos": [{"titulo": "[Ejemplo] Exposición de motivos", "url": None, "tipo": "PDF"}],
        "notas": ["Cifras ficticias de ejemplo para probar la sección."],
        "total_universidades": {"pia_2027": t27, "pia_2026": t26, "var_pct": round((t27 / t26 - 1) * 100, 2)},
        "disposiciones": [
            {"articulo": "[Ejemplo] Art. 25", "resumen": "Autoriza modificaciones presupuestales para el pago de la homologación docente.", "url": None},
            {"articulo": "[Ejemplo] 45.ª Disposición Complementaria Final", "resumen": "Recursos para mantenimiento de infraestructura universitaria.", "url": None},
        ],
    }

    nacional = {}
    for y in ANIOS:
        ys = str(y)
        nacional[ys] = {k: sum(x["anios"][ys]["total"][k] for x in unis) for k in ("pia", "pim", "dev")}
        nacional[ys]["n_unis"] = len(unis)

    out = {
        "generado": "2026-11-23T00:00:00-05:00 (EJEMPLO)",
        "ejemplo": True,
        "anios": ANIOS,
        "parcial": {str(PARCIAL): "a nov-2026"},
        "notas": [
            "DATOS FICTICIOS DE EJEMPLO: no usar para conclusiones. Los códigos de pliego son referenciales.",
            "2026 es un año en curso: el devengado es parcial (corte a noviembre).",
        ],
        "fuentes": [
            {"nombre": "MEF — Consulta Amigable (Transparencia Económica)", "url": "https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx"},
            {"nombre": "MEF — Plataforma de Datos Abiertos", "url": "https://datosabiertos.mef.gob.pe/"},
        ],
        "normativa": [
            {"norma": "Ley N° 30220", "titulo": "Ley Universitaria", "fecha": "2014-07-09", "tipo": "Ley", "url": None},
            {"norma": "[Ejemplo] Ley de Presupuesto del Sector Público 2025", "titulo": "Asigna el PIA a los pliegos universitarios", "fecha": "2024-12-05", "tipo": "Ley", "url": None},
        ],
        "expectativa_2027": expectativa,
        "nacional": nacional,
        "universidades": unis,
    }
    dst = Path(__file__).with_name("observatorio.json")
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("ok", dst, dst.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
