#!/usr/bin/env bash
# Extrae (SOLO LECTURA) el agregado universitario del detalle SIAF que qhaway ya descargó en el VPS
# (/opt/qhaway-api/raw/{2024,2025}-Gasto.csv.gz). El script remoto solo lee el .gz y escribe a stdout.
# ~10-20 min por año en el VPS (nice/ionice). Luego: python3 etl/inventario_consolidar.py
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/existente/siaf_vps
for y in ${@:-2024 2025}; do
  ssh -o BatchMode=yes "${VPS_HOST:?export VPS_HOST=usuario@host}" "nice -n 19 ionice -c3 python3 - $y" \
    < etl/inventario_siaf_vps_remote.py > data/existente/siaf_vps/raw_$y.json
  echo "$y: $(wc -c < data/existente/siaf_vps/raw_$y.json) bytes"
done
