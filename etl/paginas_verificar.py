#!/usr/bin/env python3
"""Verifica las páginas de u/: JSON-LD válido, enlaces internos existentes, GTM tras <meta charset>, tamaño < 60 KB,
title/description únicos, sitemap coherente. Uso: python3 etl/paginas_verificar.py  (exit 1 si hay errores)"""
import glob
import json
import os
import re
import sys
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://unimauro.github.io/presupuesto-universidades/"
errs, titles, descs = [], {}, {}
pages = sorted(glob.glob(os.path.join(ROOT, "u", "**", "index.html"), recursive=True))
for p in pages:
    rel = os.path.relpath(p, ROOT)
    s = open(p, encoding="utf-8").read()
    if len(s.encode()) > 60 * 1024:
        errs.append(f"{rel}: {len(s.encode()) / 1024:.1f} KB > 60 KB")
    if not re.search(r'<meta charset="utf-8">\s*<script async src="https://www\.googletagmanager\.com/gtm\.js\?id=GTM-K2PJ776Z">', s):
        errs.append(f"{rel}: GTM no está justo después de <meta charset>")
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            json.loads(b)
        except ValueError as e:
            errs.append(f"{rel}: JSON-LD inválido ({e})")
    t = re.search(r"<title>(.*?)</title>", s).group(1)
    d = re.search(r'<meta name="description" content="([^"]*)"', s).group(1)
    titles.setdefault(t, []).append(rel)
    descs.setdefault(d, []).append(rel)
    for href in re.findall(r'(?:href|src)="([^"]+)"', s):
        if href.startswith(("http://", "https://", "#", "mailto:")):
            if href.startswith(BASE):
                href_path = href[len(BASE):]
                tgt = os.path.join(ROOT, unquote(href_path.split("#")[0]))
                if tgt.endswith("/") or os.path.isdir(tgt):
                    tgt = os.path.join(tgt, "index.html")
                if not os.path.exists(tgt):
                    errs.append(f"{rel}: URL absoluta sin archivo local {href}")
            continue
        path = unquote(urlparse(href).path)
        tgt = os.path.normpath(os.path.join(os.path.dirname(p), path)) if path else os.path.dirname(p)
        if path == "" or path.endswith("/") or os.path.isdir(tgt):
            tgt = os.path.join(tgt, "index.html")
        if not os.path.exists(tgt):
            errs.append(f"{rel}: enlace roto {href}")
for k, v in list(titles.items()) + list(descs.items()):
    if len(v) > 1:
        errs.append(f"duplicado en {v}: {k[:80]}")
sm = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
for loc in re.findall(r"<loc>(.*?)</loc>", sm):
    tgt = os.path.join(ROOT, loc[len(BASE):])
    if tgt.endswith("/"):
        tgt += "index.html"
    if not os.path.exists(tgt):
        errs.append(f"sitemap: {loc} no existe localmente")
print(f"{len(pages)} páginas revisadas, {len(errs)} problemas")
for e in errs[:50]:
    print("  -", e)
sys.exit(1 if errs else 0)
