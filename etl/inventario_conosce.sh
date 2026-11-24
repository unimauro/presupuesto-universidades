#!/usr/bin/env bash
# SELECT de solo lectura sobre la BD gopues (licitaperu-alertas) en el VPS: adjudicaciones CONOSCE
# de entidades "UNIVERSIDAD" agregadas por año x RUC x objeto x moneda. Luego: python3 etl/inventario_consolidar.py
set -euo pipefail
cd "$(dirname "$0")/.."
ssh -o BatchMode=yes "${VPS_HOST:?export VPS_HOST=usuario@host}" 'bash -s' > data/existente/conosce_raw.csv <<'REMOTE'
G="docker exec licitaperu-alertas-db-1 psql -U $(docker exec licitaperu-alertas-db-1 printenv POSTGRES_USER) -d gopues"
$G -c "\copy (select a.anio, a.entidad_ruc, max(a.entidad) entidad, max(e.codigo_siaf) codigo_siaf, a.objeto, a.moneda, count(distinct a.codigo_convocatoria) procesos, count(*) items, sum(a.monto_referencial_item) monto_referencial, sum(a.monto_adjudicado_item) monto_adjudicado from conosce_adjudicaciones a left join conosce_entidades e on e.ruc=a.entidad_ruc where a.entidad ilike '%UNIVERSIDAD%' group by 1,2,5,6 order by 1,2) to stdout with csv header"
REMOTE
wc -l data/existente/conosce_raw.csv
