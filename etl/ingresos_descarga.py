#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Descarga (en streaming) los CSV anuales de INGRESOS del MEF (datosabiertos) y guarda
solo las filas de universidades públicas (Sector 10 Educación, pliego con "UNIVERSIDAD").

Fuente: https://fs.datosabiertos.mef.gob.pe/datastorefiles/{AÑO}-Ingreso.csv (2012-2024)
        y {AÑO}-Ingreso-Diario.csv (2025, 2026; actualizados a diario).
Los CSV pesan ~320-430 MB c/u; no se guardan completos: se filtra al vuelo y se escribe
etl/cache/ingresos/{AÑO}.csv (unos pocos MB). Reanudable: salta años ya en caché.

Uso:  ~/.venvs/pu-ingresos/bin/python etl/ingresos_descarga.py [AÑO ...] [--force]
"""
import csv, os, re, sys, time
import requests

BASE = "https://fs.datosabiertos.mef.gob.pe/datastorefiles/"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "ingresos")
YEARS = list(range(2012, 2027))
UA = "Mozilla/5.0 (compatible; presupuesto-universidades-etl)"


def url_for(year):
    # 2025+ solo existen como -Diario / -Mensual; Diario es el más reciente.
    return BASE + (f"{year}-Ingreso-Diario.csv" if year >= 2025 else f"{year}-Ingreso.csv")


UNI_RE = re.compile(r"^(UNIVERSIDAD|U\.\s*N\.|U\s*N\s)", re.I)


def es_universidad(row, idx):
    """Sector 10 + pliego 5xx con nombre de universidad nacional (en el CSV vienen
    abreviados: 'U.N. MAYOR DE SAN MARCOS', 'U. N. DE MÚSICA')."""
    if row[idx["SECTOR"]].strip() != "10":
        return False
    pl, nom = row[idx["PLIEGO"]].strip(), row[idx["PLIEGO_NOMBRE"]].strip().upper()
    return pl.startswith("5") and (bool(UNI_RE.match(nom)) or "UNIVERSIDAD" in nom)


def descargar(year, force=False):
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f"{year}.csv")
    if os.path.exists(out) and not force:
        print(f"{year}: en caché, salto", flush=True)
        return out
    url = url_for(year)
    t0 = time.time()
    for intento in range(4):
        try:
            r = requests.get(url, stream=True, timeout=120, headers={"User-Agent": UA})
            r.raise_for_status()
            lines = r.iter_lines(chunk_size=1 << 20)
            header_raw = next(lines)
            header = next(csv.reader([header_raw.decode("utf-8-sig")]))
            idx = {h: i for i, h in enumerate(header)}
            n_tot = n_ok = 0
            tmp = out + ".part"
            with open(tmp, "w", encoding="utf-8", newline="") as f:
                w = csv.writer(f)
                w.writerow(header)
                for raw in lines:
                    n_tot += 1
                    if b'","10","' not in raw:  # prefiltro barato: sector 10
                        continue
                    try:
                        line = raw.decode("utf-8")
                    except UnicodeDecodeError:
                        line = raw.decode("latin-1")
                    row = next(csv.reader([line]))
                    if len(row) != len(header):
                        continue
                    if es_universidad(row, idx):
                        w.writerow(row)
                        n_ok += 1
            os.replace(tmp, out)
            print(f"{year}: {n_tot:,} filas leídas, {n_ok:,} de universidades -> {out} "
                  f"({time.time()-t0:.0f}s)", flush=True)
            return out
        except Exception as e:  # red inestable: backoff
            print(f"{year}: error {e!r:.120} (intento {intento})", flush=True)
            time.sleep(10 * (intento + 1))
    raise RuntimeError(f"{year}: no se pudo descargar")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    years = [int(a) for a in args] or YEARS
    for y in years:
        descargar(y, force=force)
        time.sleep(2)


if __name__ == "__main__":
    main()
