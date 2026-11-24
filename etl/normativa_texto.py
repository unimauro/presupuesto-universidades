"""Extrae texto de cada PDF descargado (pdfplumber) a <pdf>.txt, con separador de página.

Uso: ~/.venvs/pu-normativa/bin/python -W ignore etl/normativa_texto.py
Solo procesa PDFs sin .txt previo. PDFs > 60 páginas: se procesan solo páginas que
contienen 'UNIVERSIDAD' o 'U.N.' (vía pypdf, más rápido) para no tardar horas.
"""
import logging
import sys
from pathlib import Path

import pdfplumber
import pypdf

logging.disable(logging.CRITICAL)
ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "etl" / "cache" / "normativa" / "pdf"


def texto(f: Path) -> str:
    try:
        n = len(pypdf.PdfReader(str(f)).pages)
    except Exception:
        n = 0
    paginas = None
    if n > 60:
        r = pypdf.PdfReader(str(f))
        paginas = [i for i, p in enumerate(r.pages)
                   if any(k in (p.extract_text() or "").upper() for k in ("UNIVERSIDAD", "U.N.", "UNIV."))]
    out = []
    with pdfplumber.open(str(f)) as pdf:
        idx = paginas if paginas is not None else range(len(pdf.pages))
        for i in idx:
            out.append(f"\n<<<PAGINA {i + 1}>>>\n" + (pdf.pages[i].extract_text() or ""))
    return "".join(out)


def main():
    fs = sorted(PDF.rglob("*.pdf"))
    for k, f in enumerate(fs):
        t = f.with_suffix(f.suffix + ".txt")
        if t.exists():
            continue
        try:
            t.write_text(texto(f))
        except Exception as e:
            print("ERR", f, e, file=sys.stderr)
            t.write_text("")
        if k % 25 == 0:
            print(f"{k}/{len(fs)}", flush=True)


if __name__ == "__main__":
    main()
