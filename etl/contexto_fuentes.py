#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Agente CONTEXTO — lectores de fuentes locales (en etl/cache/contexto/) + emparejamiento por nombre.

No hace requests. Lo usan contexto_openalex.py y contexto_build.py.
"""
import csv, glob, io, json, os, re, unicodedata
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "contexto")
REPOS = os.path.dirname(os.path.dirname(HERE))  # ~/Documents/Repos
UNIS_PERU = os.path.join(REPOS, "universidades-peru", "data", "universidades.json")


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\bU\.\s*N\.", "UNIVERSIDAD NACIONAL ", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\b(DE|DEL|LA|LAS|LOS|Y|EL)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


GENERIC = {"UNIVERSIDAD", "NACIONAL", "UNIVERSITY", "NATIONAL", "OF", "THE"}
BLOCK = {"FOLKLORE", "MUSICA", "ARTE", "ARTES", "BELLAS", "TECNOLOGICA", "FRONTERA", "FRONTERIZA",
         "AUTONOMA", "INTERCULTURAL", "AGRARIA", "EDUCACION", "INGENIERIA", "AMAZONICA", "AMAZONIA"}


def toks(s):
    return set(norm(s).split()) - GENERIC


def sim(a, b):
    """Jaccard sobre tokens distintivos; 0 si difieren en un token 'bloqueante' (MÚSICA, AUTÓNOMA...)."""
    ta, tb = toks(a), toks(b)
    if (ta ^ tb) & BLOCK or not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def best(name, candidates, key=lambda c: c, thr=0.6):
    """Devuelve (candidato, score) o (None, score) si no supera el umbral o hay empate ambiguo."""
    sc = sorted(((sim(name, key(c)), i) for i, c in enumerate(candidates)), reverse=True)
    if not sc or sc[0][0] < thr:
        return None, (sc[0][0] if sc else 0)
    if len(sc) > 1 and sc[1][0] >= sc[0][0] - 0.01 and norm(key(candidates[sc[0][1]])) != norm(name):
        return None, sc[0][0]  # empate: no adivinar
    return candidates[sc[0][1]], sc[0][0]


# ---------------- MEF: padrón de pliegos ----------------
def pliegos():
    """{pliego: {"nombre_mef": último nombre, "anios": [años en que aparece]}}"""
    out = {}
    for fp in sorted(glob.glob(os.path.join(CACHE, "mef", "pliegos_*.json"))):
        y = int(re.search(r"(\d{4})", os.path.basename(fp)).group(1))
        for x in json.load(open(fp, encoding="utf-8")):
            d = out.setdefault(x["pliego"], {"anios": []})
            d["nombre_mef"] = x["nombre"]
            d["anios"].append(y)
    return out


# ---------------- SUNEDU: licenciamiento institucional ----------------
def sunedu_licencias():
    fp = os.path.join(CACHE, "sunedu", "licenciamiento_institucional_18.csv")
    txt = open(fp, encoding="latin-1").read()
    rows = list(csv.DictReader(io.StringIO(txt), delimiter="|"))
    return [r for r in rows if "BLICO" in r["TIPO_GESTION"]]


# ---------------- MINEDU SIRIES: hoja "Universidades" ----------------
SIRIES_FILES = {"estudiantes": ("t11629.xlsx", "Universidades"), "docentes": ("t11625.xlsx", "Universidad"),
                "ingresantes": ("t11627.xlsx", "Universidades"), "postulantes": ("t11630.xlsx", "Universidades")}


def siries(campo):
    """{nombre_univ: {año: n}} solo para la sección PÚBLICA* de la hoja; + fecha de corte."""
    import openpyxl
    f, sheet = SIRIES_FILES[campo]
    ws = openpyxl.load_workbook(os.path.join(CACHE, "minedu", f), read_only=True)[sheet]
    years, sec, out, corte = None, None, {}, None
    for r in ws.iter_rows(values_only=True):
        v = [c for c in r if c is not None]
        if not v:
            continue
        if v[0] == "CATEGORÍA":
            years = [int(x) for x in v[1:] if isinstance(x, int)]
            continue
        s0 = str(v[0]).strip()
        if s0.startswith("FECHA DE CORTE"):
            corte = s0.split(":", 1)[1].strip()
        if len(v) == 1 and re.match(r"^(PÚBLICA|PRIVADA)", s0):
            sec = s0
            continue
        if s0 == "TOTAL":
            sec = None
        if sec and sec.startswith("PÚBLICA") and years and len(v) >= 1 + 2 * len(years):
            abs_ = v[1::2][:len(years)]
            out[s0] = {str(y): (int(n) if isinstance(n, (int, float)) else None) for y, n in zip(years, abs_)}
    return out, corte


# ---------------- universidades-peru (repo hermano) ----------------
def unis_peru():
    d = json.load(open(UNIS_PERU, encoding="utf-8"))
    return d["unis"]


# ---------------- OpenAlex: instituciones de Perú (caché) ----------------
def openalex_inst_pe():
    r = []
    for fp in sorted(glob.glob(os.path.join(CACHE, "openalex", "inst_pe_*.json"))):
        r += json.load(open(fp, encoding="utf-8")).get("results", [])
    return r
