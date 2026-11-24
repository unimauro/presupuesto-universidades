/* Historias — Radiografía Presupuestal de las Universidades Públicas del Perú.
 * Todas las cifras se calculan en vivo desde data/observatorio.json
 * (fallback: data/sample/observatorio.json, con aviso de datos de ejemplo).
 * Ningún número está horneado en este archivo. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const nf0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const SD = 's/d';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Mismo formato que index.html (fmtM): "S/ 6,954.6 M"; montos menores a 1 M en soles enteros.
  function soles(v) {
    if (!isNum(v)) return SD;
    if (Math.abs(v) >= 1e6) return 'S/ ' + nf1.format(v / 1e6) + ' M';
    return 'S/ ' + nf0.format(v);
  }
  function solesAxis(v) {
    if (!isNum(v)) return '';
    const a = Math.abs(v);
    if (a >= 1e9) return nf1.format(v / 1e9) + ' mil M';
    if (a >= 1e6) return nf0.format(v / 1e6) + ' M';
    if (a >= 1e3) return nf0.format(v / 1e3) + ' mil';
    return nf0.format(v);
  }
  const pct = (v, d = 0) => (isNum(v) ? new Intl.NumberFormat('es-PE', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v * 100) + '%' : SD);
  const pctSigned = (v) => (isNum(v) ? (v > 0 ? '+' : '') + pct(v) : SD);
  const div = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);
  const sum = (arr) => arr.reduce((s, x) => s + (isNum(x) ? x : 0), 0);
  function median(arr) {
    const v = arr.filter(isNum).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  function quantile(arr, q) {
    const v = arr.filter(isNum).sort((a, b) => a - b);
    if (!v.length) return null;
    const pos = (v.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  }
  const findKey = (obj, test) => (obj ? Object.keys(obj).find(test) : undefined);
  const pick = (obj, test) => { const k = findKey(obj, test); return k ? obj[k] : null; };
  const val = (o, f) => (o && isNum(o[f]) ? o[f] : null);

  // Accesores al esquema
  const generica = (a, code) => pick(a && a.generica, (k) => k.trim().startsWith(code + ' ') || k.trim().startsWith(code + ':') || k.trim() === code);
  const programa = (a, code) => pick(a && a.programa, (k) => k.trim().startsWith(code));
  const fuenteRDR = (a) => pick(a && a.fuente, (k) => /DIRECTAMENTE\s+RECAUDADOS/i.test(k));
  const ingresoRDR = (a) => pick(a && a.ingresos && a.ingresos.fuente, (k) => /DIRECTAMENTE\s+RECAUDADOS/i.test(k));
  const label = (u) => String(u.corto || u.nombre || u.pliego);
  // Etiqueta corta para ejes (P1-13): la sigla; si "corto" es un nombre largo ("U.N. DE SECHURA"),
  // se abrevia desde el inicio: "UN Sechura", "UN Tecnológica d…". El nombre completo va en el tooltip.
  const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
  function titleCase(t) {
    return t.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  function axisLabel(u) {
    const c = String(u.corto || '').trim();
    if (c && c.length <= 12) return c;
    let t = (c || String(u.nombre || u.pliego)).trim();
    t = t.replace(/^(U\.\s?N\.|UNIVERSIDAD\s+NACIONAL)\s+/i, '').replace(/^UNIVERSIDAD\s+/i, '')
      .replace(/^AUT[OÓ]NOMA\s+/i, '').replace(/^(DE\s+|DEL\s+)/i, '');
    t = 'UN ' + titleCase(t);
    return t.length > 16 ? t.slice(0, 15).trimEnd() + '…' : t;
  }

  // ---------- estado ----------
  const S = { d: null, isSample: false, Y: null, hl: '', closed: [], partial: [], charts: [] };

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      ink: v('--ink'), ink2: v('--ink-2'), line: v('--line'), card: v('--card'),
      pia: v('--c-pia'), pim: v('--c-pim'), dev: v('--c-dev'), hl: v('--c-hl'),
      accent: v('--accent'), amber: v('--amber'), k1: v('--k1'), k2: v('--k2'), k3: v('--k3'), k4: v('--k4'), k5: v('--k5'), k6: v('--k6'),
    };
  }

  // ---------- carga ----------
  // Carga por capas (rápida): data/resumen.json (totales/kpi por año) + data/anio/{año}.json bajo demanda.
  // Respaldo: data/observatorio.json completo y, al final, el sample.
  const L = { full: false, years: new Set(), inflight: {}, fullP: null };
  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }
  async function load() {
    try {
      const d = await getJSON('data/resumen.json');
      if (d && Array.isArray(d.universidades)) return { d, isSample: d.ejemplo === true, full: false };
    } catch (e) { /* siguiente */ }
    const tries = [['data/observatorio.json', false], ['data/sample/observatorio.json', true]];
    for (const [url, sample] of tries) {
      try {
        const d = await getJSON(url);
        if (!d || !Array.isArray(d.universidades)) continue;
        return { d, isSample: sample || d.ejemplo === true, full: true };
      } catch (e) { /* siguiente */ }
    }
    throw new Error('No se pudo cargar el archivo de datos.');
  }
  function mergeYear(y, j) {
    const map = (j && j.universidades) || {};
    S.d.universidades.forEach((u) => {
      const o = map[u.pliego] || map[String(u.pliego)];
      if (!o) return;
      u.anios = u.anios || {};
      u.anios[y] = Object.assign(u.anios[y] || {}, o);
    });
  }
  // Si falla una capa anual, se cae al archivo completo (una sola vez).
  function loadFull() {
    if (L.full) return Promise.resolve();
    if (!L.fullP) {
      L.fullP = getJSON('data/observatorio.json').then((d) => {
        const byP = new Map(d.universidades.map((u) => [String(u.pliego), u]));
        S.d.universidades.forEach((u) => { const f = byP.get(String(u.pliego)); if (f && f.anios) u.anios = f.anios; });
        L.full = true;
      }).catch((e) => { console.error(e); L.full = true; });
    }
    return L.fullP;
  }
  function ensureYear(y) {
    y = String(y);
    if (L.full || L.years.has(y)) return Promise.resolve();
    if (!L.inflight[y]) {
      L.inflight[y] = getJSON(`data/anio/${encodeURIComponent(y)}.json`)
        .then((j) => { mergeYear(y, j); L.years.add(y); })
        .catch(() => loadFull())
        .finally(() => { delete L.inflight[y]; });
    }
    return L.inflight[y];
  }
  // Ventana de años para contar en cuántos años tuvo PIM un proyecto (limita las descargas a 6 capas).
  const WIN = 6;
  const winYears = (Y) => S.closed.filter((y) => y <= Y).slice(-WIN);
  // Qué capas necesita cada historia antes de calcularse.
  async function prepStory(st, Y) {
    if (st.need === 'base') return;
    await ensureYear(Y);
    if (st.need === 'years') {
      const hay = S.d.universidades.some((u) => ((u.anios && u.anios[Y] && u.anios[Y].proyectos) || []).length);
      if (hay) await Promise.all(winYears(Y).map(ensureYear));
    }
  }

  function setupYears(d) {
    const partialKeys = Object.keys(d.parcial || {}).map(String);
    let years = Array.isArray(d.anios) ? d.anios.map(String) : [];
    if (!years.length) {
      const set = new Set();
      d.universidades.forEach((u) => Object.keys(u.anios || {}).forEach((y) => set.add(y)));
      years = [...set];
    }
    years.sort();
    S.closed = years.filter((y) => !partialKeys.includes(y));
    S.partial = years.filter((y) => partialKeys.includes(y));
  }

  // ---------- gráficos ----------
  function destroyCharts() { S.charts.forEach((c) => c.destroy()); S.charts = []; }
  const hasChart = () => typeof window.Chart === 'function';

  function legendHTML(series) {
    return '<ul class="legend">' + series.map((s) => `<li><i style="background:${esc(s.color)}"></i>${esc(s.name)}</li>`).join('') + '</ul>';
  }

  /** Barras horizontales con "mostrar todas". items ya ordenados: [{key,label,vals:[]}] */
  function hbar(el, { items, series, fmt, axis, stacked = false, limit = 12, max, aria }) {
    const C = colors();
    if (!items.length) { el.innerHTML = '<p class="empty">Sin datos suficientes para este año.</p>'; return; }
    if (!hasChart()) { el.innerHTML = fallbackTable(items, series, fmt); return; }
    el.innerHTML = `<div class="chart"><canvas role="img" aria-label="${esc(aria || '')}"></canvas></div>` +
      (series.length > 1 ? legendHTML(series) : '') +
      (items.length > limit ? `<button type="button" class="more" aria-expanded="false">Mostrar las ${items.length}</button>` : '');
    const wrap = $('.chart', el), canvas = $('canvas', el), btn = $('.more', el);
    let expanded = false, chart = null;
    const draw = () => {
      const shown = expanded ? items : items.filter((it, i) => i < limit || it.key === S.hl);
      const per = stacked || series.length === 1 ? 24 : 36;
      wrap.style.height = shown.length * per + 56 + 'px';
      if (chart) { chart.destroy(); S.charts = S.charts.filter((c) => c !== chart); }
      const isHl = (i) => shown[i] && shown[i].key === S.hl;
      chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: shown.map((i) => i.ax || i.label),
          datasets: series.map((s, si) => ({
            label: s.name,
            data: shown.map((i) => (isNum(i.vals[si]) ? i.vals[si] : null)),
            backgroundColor: series.length === 1 ? shown.map((i) => (i.key === S.hl ? C.hl : s.color)) : s.color,
            borderRadius: stacked ? 0 : 3, barPercentage: 0.86, categoryPercentage: 0.82,
          })),
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          animation: reduced ? false : { duration: 450 },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: (c) => (c[0] && shown[c[0].dataIndex] ? (shown[c[0].dataIndex].full || shown[c[0].dataIndex].label) : ''), label: (c) => `${c.dataset.label}: ${fmt(c.raw)}` } },
          },
          scales: {
            x: { stacked, max, beginAtZero: true, grid: { color: C.line }, ticks: { color: C.ink2, maxTicksLimit: 5, callback: (v) => axis(v) } },
            y: { stacked, grid: { display: false }, ticks: { autoSkip: false, color: (c) => (isHl(c.index) ? C.hl : C.ink2), font: (c) => ({ size: 12, weight: isHl(c.index) ? '700' : '400' }) } },
          },
        },
      });
      S.charts.push(chart);
    };
    draw();
    if (btn) btn.addEventListener('click', () => {
      expanded = !expanded;
      btn.setAttribute('aria-expanded', String(expanded));
      btn.textContent = expanded ? `Mostrar solo ${limit}` : `Mostrar las ${items.length}`;
      draw();
    });
  }

  function fallbackTable(items, series, fmt) {
    return '<p class="note">No se pudo cargar la librería de gráficos; se muestra la tabla.</p><div style="overflow-x:auto"><table class="figs" style="width:100%;font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left">Universidad</th>' +
      series.map((s) => `<th style="text-align:right">${esc(s.name)}</th>`).join('') + '</tr></thead><tbody>' +
      items.map((i) => `<tr><td>${esc(i.label)}</td>${i.vals.map((v) => `<td style="text-align:right">${esc(fmt(v))}</td>`).join('')}</tr>`).join('') +
      '</tbody></table></div>';
  }

  // ---------- plantillas ----------
  const stat = (v, l) => `<div class="stat"><span class="v">${esc(v)}</span><span class="l">${esc(l)}</span></div>`;
  const caveat = (items, open) => `<details class="caveat"${open ? ' open' : ''}><summary>Qué no dice este dato</summary><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  const SRC_MEF = 'Fuente: MEF — Consulta Amigable / SIAF (gasto por pliego).';
  const src = (extra) => `<p class="src">${esc(SRC_MEF)}${extra ? ' ' + esc(extra) : ''} Año ${esc(S.Y)}${S.partial.includes(S.Y) ? ' (parcial)' : ''}.</p>`;
  // Fuente de contexto (matrícula / publicaciones) leída en vivo de d.fuentes.
  // Usa f.tema si existe; si no, reconoce el nombre por palabras clave.
  const FUENTE_RX = {
    estudiantes: /matr[ií]cul|estudiant|alumn|SUNEDU|SIBE|INEI|MINEDU/i,
    pubs: /publicaci|OpenAlex|Scopus|Web of Science|WoS|ORCID|CTI Vitae|RENACYT|bibliom/i,
  };
  function fuenteCtx(tema) {
    const fs = (S.d && Array.isArray(S.d.fuentes)) ? S.d.fuentes : [];
    const hit = fs.filter((f) => f && (f.tema === tema || (!f.tema && FUENTE_RX[tema].test(String(f.nombre || '')))));
    if (!hit.length) return null;
    return hit.map((f) => (f.url && /^https?:\/\//.test(f.url)
      ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.nombre || f.url)}</a>` : esc(f.nombre))).join('; ');
  }
  // extraHTML ya escapado
  const srcCtx = (tema, etiqueta) => {
    const f = fuenteCtx(tema);
    return `<p class="src">${esc(SRC_MEF)} ${esc(etiqueta)}: ${f || 'ver metodología del observatorio'}. Año ${esc(S.Y)}${S.partial.includes(S.Y) ? ' (parcial)' : ''}.</p>`;
  };
  const hlNote = (text) => (text ? `<p class="note">${text}</p>` : '');
  function hlUni() { return S.hl ? S.d.universidades.find((u) => String(u.pliego) === S.hl) : null; }

  // ---------- historias ----------
  function unisY(Y) { return S.d.universidades.filter((u) => u.anios && u.anios[Y] && u.anios[Y].total); }

  const STORIES = [
    // 1. PIA → PIM
    {
      id: 'salto', need: 'base', sec: 'variacion', kicker: 'Empiezan y terminan', toc: 'El salto del PIA al PIM',
      build(Y) {
        const U = unisY(Y);
        const pia = sum(U.map((u) => val(u.anios[Y].total, 'pia')));
        const pim = sum(U.map((u) => val(u.anios[Y].total, 'pim')));
        const dev = sum(U.map((u) => val(u.anios[Y].total, 'dev')));
        const items = U.map((u) => {
          const t = u.anios[Y].total; const r = div(val(t, 'pim'), val(t, 'pia'));
          return { key: String(u.pliego), label: label(u), ax: axisLabel(u), full: u.nombre, vals: [isNum(r) ? r - 1 : null] };
        }).filter((i) => isNum(i.vals[0])).sort((a, b) => b.vals[0] - a.vals[0]);
        const h = hlUni(); let hl = '';
        if (h && h.anios[Y]) { const t = h.anios[Y].total; hl = `${esc(label(h))}: PIA ${esc(soles(val(t, 'pia')))} → PIM ${esc(soles(val(t, 'pim')))} (${esc(pctSigned(isNum(div(val(t, 'pim'), val(t, 'pia'))) ? div(val(t, 'pim'), val(t, 'pia')) - 1 : null))}); devengó ${esc(pct(div(val(t, 'dev'), val(t, 'pim'))))} del PIM.`; }
        return {
          h2: `Empiezan con <em>${esc(soles(pia))}</em> y terminan con <em>${esc(soles(pim))}</em>`,
          html: `<p>En ${esc(Y)}, las ${esc(U.length)} universidades públicas con datos arrancaron el año con un presupuesto de apertura (PIA) de ${esc(soles(pia))}. Durante el año ese presupuesto se amplió hasta un PIM de ${esc(soles(pim))}, ${esc(pctSigned(isNum(div(pim, pia)) ? div(pim, pia) - 1 : null))} respecto del inicio. Al cierre se devengó ${esc(soles(dev))}: el ${esc(pct(div(dev, pim)))} del PIM.</p>
            <div class="stats">${stat(soles(pia), 'PIA (inicio)')}${stat(soles(pim), 'PIM (cierre)')}${stat(soles(dev), 'Devengado')}${stat(soles(pim - dev), 'PIM no devengado')}${stat(pct(div(dev, pim)), 'Ejecución (dev./PIM)')}</div>
            ${hlNote(hl)}
            <div class="figure"><p class="cap">Conjunto de universidades por año (solo años cerrados)</p><div data-fig="serie"></div></div>
            <div class="figure"><p class="cap">Variación del PIM respecto del PIA, ${esc(Y)}</p><div data-fig="rank"></div></div>
            ${caveat([
              'El PIM crece por créditos suplementarios, transferencias de otras entidades y saldos de balance incorporados durante el año. Un salto alto no es, por sí mismo, una irregularidad.',
              'Parte del PIM no devengado puede corresponder a recursos que llegaron tarde en el año o a obras plurianuales.',
              'Montos nominales; no se ajustan por inflación.',
            ], true)}${src()}`,
          mount(el) {
            const C = colors();
            const yrs = S.closed.filter((y) => S.d.universidades.some((u) => u.anios && u.anios[y]));
            const agg = (y, f) => sum(S.d.universidades.map((u) => (u.anios && u.anios[y] ? val(u.anios[y].total, f) : null)));
            const box = $('[data-fig="serie"]', el);
            if (!hasChart()) box.innerHTML = fallbackTable(yrs.map((y) => ({ label: y, vals: [agg(y, 'pia'), agg(y, 'pim'), agg(y, 'dev')] })), [{ name: 'PIA' }, { name: 'PIM' }, { name: 'Devengado' }], soles);
            else {
              const series = [{ name: 'PIA', color: C.pia }, { name: 'PIM', color: C.pim }, { name: 'Devengado', color: C.dev }];
              box.innerHTML = `<div class="chart" style="height:280px"><canvas role="img" aria-label="PIA, PIM y devengado por año"></canvas></div>${legendHTML(series)}`;
              S.charts.push(new Chart($('canvas', box), {
                type: 'bar',
                data: { labels: yrs, datasets: [
                  { label: 'PIA', data: yrs.map((y) => agg(y, 'pia')), backgroundColor: C.pia, borderRadius: 2, order: 2 },
                  { label: 'PIM', data: yrs.map((y) => agg(y, 'pim')), backgroundColor: C.pim, borderRadius: 2, order: 2 },
                  { label: 'Devengado', type: 'line', data: yrs.map((y) => agg(y, 'dev')), borderColor: C.dev, backgroundColor: C.dev, pointRadius: 3, borderWidth: 2.5, tension: 0.2, order: 1 },
                ] },
                options: {
                  responsive: true, maintainAspectRatio: false, animation: reduced ? false : { duration: 450 },
                  plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { label: (c) => `${c.dataset.label}: ${soles(c.raw)}` } } },
                  scales: { x: { grid: { display: false }, ticks: { color: C.ink2 } }, y: { beginAtZero: true, grid: { color: C.line }, ticks: { color: C.ink2, maxTicksLimit: 5, callback: solesAxis } } },
                },
              }));
            }
            hbar($('[data-fig="rank"]', el), { items, series: [{ name: 'PIM vs PIA', color: C.pim }], fmt: pctSigned, axis: (v) => pct(v), aria: 'Variación del PIM respecto del PIA por universidad' });
          },
        };
      },
    },

    // 2. Planilla
    {
      id: 'planilla', need: 'year', sec: 'gasto', kicker: 'En qué se gasta', toc: '¿Cuánto de cada sol va a planilla?',
      build(Y) {
        const U = unisY(Y);
        const parts = (a) => {
          const tot = val(a.total, 'dev');
          const p = val(generica(a, '2.1'), 'dev'), pe = val(generica(a, '2.2'), 'dev'), b = val(generica(a, '2.3'), 'dev'), ac = val(generica(a, '2.6'), 'dev');
          const otros = isNum(tot) ? tot - sum([p, pe, b, ac]) : null;
          return { tot, p, pe, b, ac, otros: isNum(otros) && otros > 0 ? otros : 0 };
        };
        const all = U.map((u) => ({ u, x: parts(u.anios[Y]) })).filter((r) => isNum(r.x.tot) && r.x.tot > 0 && isNum(r.x.p));
        const T = sum(all.map((r) => r.x.tot));
        const sh = (f) => div(sum(all.map((r) => r.x[f])), T);
        const personal = sh('p'), pens = sh('pe');
        const items = all.map((r) => ({ key: String(r.u.pliego), label: label(r.u), ax: axisLabel(r.u), full: r.u.nombre, vals: [div(r.x.p, r.x.tot), div(r.x.pe, r.x.tot), div(r.x.b, r.x.tot), div(r.x.ac, r.x.tot), div(r.x.otros, r.x.tot)] }))
          .sort((a, b) => b.vals[0] - a.vals[0]);
        const cents = isNum(personal) ? Math.round(personal * 100) : null;
        const hi = items[0], lo = items[items.length - 1];
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        return {
          h2: isNum(cents) ? `De cada sol gastado, <em>${esc(cents)}</em> céntimos van a personal` : 'De cada sol gastado, ¿cuánto va a personal?',
          html: `<p>En ${esc(Y)}, la genérica 2.1 «Personal y obligaciones sociales» representó el ${esc(pct(personal))} del gasto devengado del conjunto de universidades. Si se suman las pensiones (genérica 2.2), la proporción llega a ${esc(pct(isNum(personal) && isNum(pens) ? personal + pens : null))}.${hi && lo && hi !== lo ? ` Entre universidades, la proporción en 2.1 va de ${esc(pct(lo.vals[0]))} (${esc(lo.label)}) a ${esc(pct(hi.vals[0]))} (${esc(hi.label)}).` : ''}</p>
            <div class="stats">${stat(pct(personal), 'Personal (2.1)')}${stat(pct(pens), 'Pensiones (2.2)')}${stat(pct(sh('b')), 'Bienes y servicios (2.3)')}${stat(pct(sh('ac')), 'Activos no financieros (2.6)')}</div>
            ${hlNote(hr ? `${esc(hr.label)}: ${esc(pct(hr.vals[0]))} en personal, ${esc(pct(hr.vals[1]))} en pensiones, ${esc(pct(hr.vals[3]))} en activos no financieros.` : '')}
            <div class="figure"><p class="cap">Composición del devengado por genérica, ${esc(Y)} (ordenado por % en personal)</p><div data-fig="mix"></div></div>
            ${caveat([
              'Los contratos CAS se registran en la genérica 2.3 (Bienes y servicios), no en 2.1. El gasto total en personas es, por lo tanto, mayor que lo que muestra la genérica 2.1.',
              'Una proporción alta en personal es habitual en instituciones educativas, cuyo servicio principal lo prestan personas. No indica por sí sola ineficiencia.',
              'La proporción cambia también cuando la inversión de un año es inusualmente alta o baja.',
            ])}${src()}`,
          mount(el) {
            const C = colors();
            hbar($('[data-fig="mix"]', el), {
              items, stacked: true, max: 1, fmt: (v) => pct(v), axis: (v) => pct(v),
              series: [{ name: 'Personal (2.1)', color: C.k1 }, { name: 'Pensiones (2.2)', color: C.k2 }, { name: 'Bienes y servicios (2.3)', color: C.k5 }, { name: 'Activos no fin. (2.6)', color: C.k6 }, { name: 'Otros', color: C.k4 }],
              aria: 'Composición del gasto devengado por genérica y universidad',
            });
          },
        };
      },
    },

    // 3. Investigación PP 0137
    {
      id: 'idi', need: 'year', sec: 'idi', kicker: 'Investigación', toc: 'La plata de investigación que no se gasta',
      build(Y) {
        const U = unisY(Y);
        const rows = U.map((u) => ({ u, p: programa(u.anios[Y], '0137') })).filter((r) => r.p && isNum(val(r.p, 'pim')) && val(r.p, 'pim') > 0);
        const pim = sum(rows.map((r) => val(r.p, 'pim'))), dev = sum(rows.map((r) => val(r.p, 'dev')));
        const items = rows.map((r) => ({ key: String(r.u.pliego), label: label(r.u), ax: axisLabel(r.u), full: r.u.nombre, vals: [val(r.p, 'pim'), val(r.p, 'dev')], ej: div(val(r.p, 'dev'), val(r.p, 'pim')) }))
          .sort((a, b) => b.vals[0] - a.vals[0]);
        const low = items.filter((i) => isNum(i.ej) && i.ej < 0.5).length;
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        if (!rows.length) return { h2: 'La plata de investigación', html: `<p class="empty">No hay datos del programa presupuestal 0137 para ${esc(Y)}.</p>${src()}` };
        return {
          h2: `Investigación: <em>${esc(soles(pim - dev))}</em> quedaron sin devengar en ${esc(Y)}`,
          html: `<p>El programa presupuestal 0137 «Desarrollo de la ciencia, tecnología e innovación tecnológica» tuvo en ${esc(Y)} un PIM de ${esc(soles(pim))} en ${esc(rows.length)} universidades. Se devengó ${esc(soles(dev))}, el ${esc(pct(div(dev, pim)))}. ${low > 0 ? `En ${esc(low)} de ellas la ejecución del programa fue menor al 50%.` : 'Ninguna tuvo una ejecución del programa menor al 50%.'}</p>
            <div class="stats">${stat(soles(pim), 'PIM PP 0137')}${stat(soles(dev), 'Devengado PP 0137')}${stat(pct(div(dev, pim)), 'Ejecución')}${stat(String(low), 'Universidades bajo 50%')}</div>
            ${hlNote(hr ? `${esc(hr.label)}: PIM ${esc(soles(hr.vals[0]))}, devengado ${esc(soles(hr.vals[1]))} (${esc(pct(hr.ej))}).` : '')}
            <div class="figure"><p class="cap">PP 0137: PIM vs devengado por universidad, ${esc(Y)}</p><div data-fig="idi"></div></div>
            ${caveat([
              'El PP 0137 no recoge toda la investigación universitaria: hay gasto en investigación registrado en otros programas, en proyectos de inversión y en fondos concursables que no pasan por el presupuesto de la universidad.',
              'Lo no devengado no se «pierde» necesariamente: los recursos de canon y de fuentes con saldo pueden incorporarse al año siguiente como saldo de balance.',
              'La ejecución financiera no mide la calidad ni el resultado de la investigación.',
            ])}${src()}`,
          mount(el) {
            const C = colors();
            hbar($('[data-fig="idi"]', el), { items, series: [{ name: 'PIM', color: C.pim }, { name: 'Devengado', color: C.dev }], fmt: soles, axis: solesAxis, aria: 'PIM y devengado del programa 0137 por universidad' });
          },
        };
      },
    },

    // 4. Obras
    {
      id: 'obras', need: 'years', sec: 'infra', kicker: 'Inversión', toc: 'Obras que no avanzan',
      build(Y) {
        const U = unisY(Y);
        const all = [];
        U.forEach((u) => (u.anios[Y].proyectos || []).forEach((p) => { if (p && isNum(p.pim) && p.pim > 0) all.push({ u, p }); }));
        if (!all.length) return { h2: 'Obras que no avanzan', html: `<p class="empty">No hay detalle de proyectos de inversión para ${esc(Y)}.</p>${src()}` };
        const thr = Math.max(1e6, quantile(all.map((r) => r.p.pim), 0.75) || 0);
        const big = all.filter((r) => r.p.pim >= thr);
        const slow = big.map((r) => ({ ...r, ej: isNum(r.p.dev) ? r.p.dev / r.p.pim : 0 })).filter((r) => r.ej < 0.5)
          .sort((a, b) => (b.p.pim - (b.p.dev || 0)) - (a.p.pim - (a.p.dev || 0)));
        const gap = sum(slow.map((r) => r.p.pim - (r.p.dev || 0)));
        const W = winYears(Y);
        const yearsWith = (u, code) => W.filter((y) => u.anios && u.anios[y] && (u.anios[y].proyectos || []).some((q) => String(q.codigo) === String(code) && isNum(q.pim) && q.pim > 0)).length;
        const card = (r) => {
          const ej = Math.max(0, Math.min(1, r.ej)); const n = r.p.codigo != null ? yearsWith(r.u, r.p.codigo) : null;
          return `<li class="proj${String(r.u.pliego) === S.hl ? ' hl' : ''}"><div class="u">${esc(label(r.u))}${r.p.codigo != null ? ' · CUI ' + esc(r.p.codigo) : ''}</div>
            <div class="n">${esc(r.p.nombre || SD)}</div>
            <div class="bar" role="img" aria-label="Devengado ${esc(pct(ej))} del PIM"><span style="width:${(ej * 100).toFixed(1)}%"></span></div>
            <div class="f"><span>PIM ${esc(soles(r.p.pim))}</span><span>Dev. ${esc(soles(r.p.dev))} (${esc(pct(r.ej))})</span>${n ? `<span>Con PIM en ${esc(n)} de los últimos ${esc(W.length)} años (${esc(W[0])}–${esc(Y)})</span>` : ''}</div></li>`;
        };
        const LIM = 8;
        return {
          h2: `<em>${esc(slow.length)}</em> de ${esc(big.length)} proyectos grandes devengaron menos de la mitad de su presupuesto`,
          html: `<p>Se consideran «grandes» los proyectos de inversión con PIM de al menos ${esc(soles(thr))} en ${esc(Y)} (el cuarto superior de todos los proyectos universitarios del año). De ellos, ${esc(slow.length)} devengaron menos del 50% de su PIM; en conjunto quedaron ${esc(soles(gap))} sin devengar.</p>
            <div class="stats">${stat(String(big.length), 'Proyectos grandes')}${stat(String(slow.length), 'Con ejecución < 50%')}${stat(soles(gap), 'PIM no devengado en ellos')}</div>
            ${slow.length ? `<ul class="projects" data-list>${slow.slice(0, LIM).map(card).join('')}</ul>${slow.length > LIM ? `<button type="button" class="more" data-more aria-expanded="false">Ver los ${esc(slow.length)}</button>` : ''}` : '<p class="empty">Ningún proyecto grande quedó bajo 50% de ejecución.</p>'}
            ${caveat([
              'Devengado / PIM es avance financiero, no avance físico de obra. Un proyecto puede estar en expediente técnico, licitación, controversia o paralizado por causas ajenas a la universidad.',
              'Muchas obras son plurianuales: un año de baja ejecución puede ser normal en su fase inicial.',
              'Para el estado real de cada obra, consulta su código CUI en el Banco de Inversiones del MEF o en INFObras (Contraloría).',
            ])}${src('Proyectos de inversión por pliego.')}`,
          mount(el) {
            const btn = $('[data-more]', el); if (!btn) return;
            let open = false;
            btn.addEventListener('click', () => {
              open = !open;
              $('[data-list]', el).innerHTML = (open ? slow : slow.slice(0, LIM)).map(card).join('');
              btn.textContent = open ? `Ver solo ${LIM}` : `Ver los ${slow.length}`;
              btn.setAttribute('aria-expanded', String(open));
            });
          },
        };
      },
    },

    // 5. RDR
    {
      id: 'rdr', need: 'year', sec: 'fuentes', kicker: 'De dónde sale la plata', toc: 'Quién vive de sus propios ingresos',
      build(Y) {
        const U = unisY(Y);
        const rows = U.map((u) => { const a = u.anios[Y]; return { u, r: val(fuenteRDR(a), 'dev'), t: val(a.total, 'dev'), ing: ingresoRDR(a) }; }).filter((x) => isNum(x.t) && x.t > 0 && isNum(x.r));
        const share = div(sum(rows.map((x) => x.r)), sum(rows.map((x) => x.t)));
        const items = rows.map((x) => ({ key: String(x.u.pliego), label: label(x.u), ax: axisLabel(x.u), full: x.u.nombre, vals: [x.r / x.t] })).sort((a, b) => b.vals[0] - a.vals[0]);
        const ingRows = rows.filter((x) => x.ing && isNum(val(x.ing, 'pim')) && isNum(val(x.ing, 'recaudado')));
        const recVsPim = div(sum(ingRows.map((x) => val(x.ing, 'recaudado'))), sum(ingRows.map((x) => val(x.ing, 'pim'))));
        const hi = items[0], lo = items[items.length - 1];
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        if (!items.length) return { h2: 'Quién vive de sus propios ingresos', html: `<p class="empty">Sin datos por fuente de financiamiento para ${esc(Y)}.</p>${src()}` };
        return {
          h2: `Ingresos propios: de <em>${esc(pct(lo.vals[0]))}</em> a <em>${esc(pct(hi.vals[0]))}</em> del gasto`,
          html: `<p>En ${esc(Y)}, los recursos directamente recaudados (RDR) —lo que la universidad cobra por posgrado, admisión, centros preuniversitarios, servicios y centros de producción— financiaron el ${esc(pct(share))} del gasto devengado del conjunto. La proporción va de ${esc(pct(lo.vals[0]))} en ${esc(lo.label)} a ${esc(pct(hi.vals[0]))} en ${esc(hi.label)}.${isNum(recVsPim) ? ` Lo efectivamente recaudado por RDR equivalió al ${esc(pct(recVsPim))} de lo previsto en el PIM de ingresos.` : ''}</p>
            <div class="stats">${stat(pct(share), 'Gasto financiado con RDR')}${stat(pct(median(items.map((i) => i.vals[0]))), 'Mediana por universidad')}${isNum(recVsPim) ? stat(pct(recVsPim), 'Recaudado / PIM de RDR') : ''}</div>
            ${hlNote(hr ? `${esc(hr.label)}: el ${esc(pct(hr.vals[0]))} de su gasto devengado se financió con RDR.` : '')}
            <div class="figure"><p class="cap">% del devengado financiado con RDR, ${esc(Y)}</p><div data-fig="rdr"></div></div>
            ${caveat([
              'Una proporción alta de RDR no implica mejor gestión: depende de la oferta de posgrado, la demanda local, la ubicación y el tamaño de la universidad.',
              'El RDR proviene en buena parte de pagos de estudiantes y postulantes; su crecimiento también puede reflejar mayores cobros.',
              'Lo recaudado en un año puede gastarse en el siguiente (saldo de balance).',
            ])}${src('Ingresos: MEF — Consulta Amigable (ingresos por pliego).')}`,
          mount(el) {
            const C = colors();
            hbar($('[data-fig="rdr"]', el), { items, series: [{ name: 'Financiado con RDR', color: C.k3 }], fmt: (v) => pct(v), axis: (v) => pct(v), aria: 'Porcentaje del gasto financiado con recursos directamente recaudados' });
          },
        };
      },
    },

    // 6. Costo por publicación
    {
      id: 'pubs', need: 'year', sec: 'idi', kicker: 'Investigación y resultados', toc: 'El costo de una publicación',
      build(Y) {
        const MINP = 10;
        const U = unisY(Y);
        const rows = U.map((u) => { const a = u.anios[Y]; return { u, idi: val(programa(a, '0137'), 'dev'), pubs: isNum(a.pubs) ? a.pubs : null }; });
        const ok = rows.filter((r) => isNum(r.idi) && r.idi > 0 && isNum(r.pubs) && r.pubs >= MINP);
        const excl = rows.length - ok.length;
        const items = ok.map((r) => ({ key: String(r.u.pliego), label: label(r.u), ax: axisLabel(r.u), full: r.u.nombre, vals: [r.idi / r.pubs], pubs: r.pubs })).sort((a, b) => b.vals[0] - a.vals[0]);
        const med = median(items.map((i) => i.vals[0]));
        const pooled = div(sum(ok.map((r) => r.idi)), sum(ok.map((r) => r.pubs)));
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        if (!items.length) return { h2: 'El costo de una publicación', html: `<p class="empty">No hay datos suficientes de publicaciones y gasto en I+D para ${esc(Y)}.</p>${src()}` };
        return {
          h2: `Mediana: <em>${esc(soles(med))}</em> de gasto en investigación por publicación`,
          html: `<p>Dividimos el gasto <strong>devengado en investigación</strong> (programa presupuestal 0137) entre las publicaciones registradas de cada universidad en ${esc(Y)}. No usamos el presupuesto total: la mayor parte del presupuesto universitario financia la enseñanza, no la investigación, y dividirlo entre artículos exageraría el costo.</p>
            <p>La mediana es ${esc(soles(med))} por publicación; para el conjunto, ${esc(soles(pooled))}. ${excl > 0 ? `Se excluyen ${esc(excl)} universidades sin dato de gasto en I+D o con menos de ${esc(MINP)} publicaciones, donde el cociente es muy inestable.` : `Todas las universidades con datos tienen al menos ${esc(MINP)} publicaciones y gasto en I+D registrado; por debajo de ese umbral se excluirían, porque el cociente es muy inestable.`}</p>
            <div class="stats">${stat(soles(med), 'Mediana por universidad')}${stat(soles(pooled), 'Conjunto (I+D total / pubs)')}${stat(String(items.length), 'Universidades incluidas')}</div>
            ${hlNote(hr ? `${esc(hr.label)}: ${esc(soles(hr.vals[0]))} por publicación (${esc(nf0.format(hr.pubs))} publicaciones).` : (h ? `${esc(label(h))} no entra en este cálculo para ${esc(Y)} (sin dato o menos de ${esc(MINP)} publicaciones).` : ''))}
            <div class="figure"><p class="cap">Devengado PP 0137 por publicación, ${esc(Y)}</p><div data-fig="pubs"></div></div>
            ${caveat([
              'Hay desfase: el gasto de un año suele traducirse en publicaciones uno o más años después.',
              'Las publicaciones incluyen coautorías con otras instituciones y trabajos financiados por fondos externos que no pasan por el PP 0137; ambas cosas abaratan el cociente.',
              'Al revés, parte del gasto en investigación está fuera del PP 0137 (proyectos de inversión, otros programas), lo que lo subestima.',
              'Es un indicador de orden de magnitud, no de productividad ni de calidad científica. La definición de «publicación» depende de la fuente bibliográfica indicada abajo.',
            ])}${srcCtx('pubs', 'Publicaciones')}`,
          mount(el) {
            const C = colors();
            hbar($('[data-fig="pubs"]', el), { items, series: [{ name: 'Soles por publicación', color: C.k1 }], fmt: soles, axis: solesAxis, aria: 'Gasto devengado en I+D por publicación' });
          },
        };
      },
    },

    // 7. Crecimiento
    {
      id: 'crecimiento', need: 'base', sec: 'trayectoria', kicker: 'Evolución', toc: 'Las que más crecieron',
      build(Y) {
        const Y0 = S.closed.find((y) => y < Y);
        if (!Y0) return { h2: 'Las que más crecieron', html: `<p class="empty">Se necesita al menos un año anterior a ${esc(Y)}.</p>` };
        const rows = S.d.universidades.map((u) => ({ u, a: val(u.anios && u.anios[Y0] && u.anios[Y0].total, 'dev'), b: val(u.anios && u.anios[Y] && u.anios[Y].total, 'dev') }))
          .filter((r) => isNum(r.a) && r.a > 0 && isNum(r.b));
        const A = sum(rows.map((r) => r.a)), B = sum(rows.map((r) => r.b));
        const items = rows.map((r) => ({ key: String(r.u.pliego), label: label(r.u), ax: axisLabel(r.u), full: r.u.nombre, vals: [r.b / r.a - 1] })).sort((a, b) => b.vals[0] - a.vals[0]);
        const missing = unisY(Y).length - rows.length;
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        return {
          h2: `Entre ${esc(Y0)} y ${esc(Y)}, el gasto devengado creció <em>${esc(pctSigned(isNum(div(B, A)) ? div(B, A) - 1 : null))}</em>`,
          html: `<p>Las ${esc(rows.length)} universidades con datos en ambos años pasaron de devengar ${esc(soles(A))} en ${esc(Y0)} a ${esc(soles(B))} en ${esc(Y)} (variación nominal). ${items.length ? `El mayor crecimiento fue el de ${esc(items[0].label)} (${esc(pctSigned(items[0].vals[0]))}); el menor, el de ${esc(items[items.length - 1].label)} (${esc(pctSigned(items[items.length - 1].vals[0]))}).` : ''}${missing > 0 ? ` ${esc(missing)} universidades no tienen datos en ${esc(Y0)} (p. ej., por creación posterior) y no se incluyen.` : ''}</p>
            <div class="stats">${stat(soles(A), `Devengado ${Y0}`)}${stat(soles(B), `Devengado ${Y}`)}${stat(pctSigned(median(items.map((i) => i.vals[0]))), 'Mediana de crecimiento')}</div>
            ${hlNote(hr ? `${esc(hr.label)}: ${esc(pctSigned(hr.vals[0]))} entre ${esc(Y0)} y ${esc(Y)}.` : '')}
            <div class="figure"><p class="cap">Variación del devengado ${esc(Y0)}→${esc(Y)} (nominal)</p><div data-fig="crec"></div></div>
            ${caveat([
              'Variación nominal: no descuenta la inflación del periodo, por lo que el crecimiento real es menor.',
              'Un año final con una obra grande puede inflar el crecimiento; compara también con años intermedios en el observatorio.',
              'Crecer más no es mejor ni peor por sí mismo: puede reflejar más estudiantes, nuevas sedes, canon o transferencias puntuales.',
            ])}${src()}`,
          mount(el) {
            const C = colors();
            hbar($('[data-fig="crec"]', el), { items, series: [{ name: 'Variación', color: C.dev }], fmt: pctSigned, axis: (v) => pct(v), aria: 'Crecimiento del gasto devengado por universidad' });
          },
        };
      },
    },

    // 8. Gasto por estudiante
    {
      id: 'estudiante', need: 'base', sec: 'ranking', kicker: 'Por estudiante', toc: 'Cuánto se gasta por estudiante',
      build(Y) {
        const U = unisY(Y);
        const rows = U.map((u) => { const a = u.anios[Y]; const e = isNum(a.estudiantes) && a.estudiantes > 0 ? a.estudiantes : null; return { u, e, v: e ? div(val(a.total, 'dev'), e) : null }; }).filter((r) => isNum(r.v));
        const eYears = [...new Set(rows.map((r) => r.u.anios[Y].estudiantes_anio).filter((x) => x != null && String(x) !== String(Y)).map(String))].sort();
        const eNote = eYears.length ? ` La matrícula disponible corresponde a ${eYears.length > 1 ? 'los años ' + eYears.join(', ') : 'el año ' + eYears[0]} (no a ${Y}): se usa el último dato publicado.` : '';
        const items = rows.map((r) => ({ key: String(r.u.pliego), label: label(r.u), ax: axisLabel(r.u), full: r.u.nombre, vals: [r.v], e: r.e })).sort((a, b) => b.vals[0] - a.vals[0]);
        const excl = U.length - rows.length;
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        if (!items.length) return { h2: 'Cuánto se gasta por estudiante', html: `<p class="empty">No hay datos de matrícula para ${esc(Y)}.</p>${src()}` };
        const hi = items[0], lo = items[items.length - 1];
        return {
          h2: `Por estudiante, el gasto anual va de <em>${esc(soles(lo.vals[0]))}</em> a <em>${esc(soles(hi.vals[0]))}</em>`,
          html: `<p>Dividimos el gasto devengado total de ${esc(Y)} entre el número de estudiantes reportado. La mediana es ${esc(soles(median(items.map((i) => i.vals[0]))))} por estudiante al año; el valor más alto corresponde a ${esc(hi.label)} y el más bajo a ${esc(lo.label)}.${excl > 0 ? ` ${esc(excl)} universidades no tienen dato de matrícula para ${esc(Y)}.` : ''}${esc(eNote)}</p>
            <div class="stats">${stat(soles(median(items.map((i) => i.vals[0]))), 'Mediana por estudiante')}${stat(soles(lo.vals[0]), `Mínimo (${lo.label})`)}${stat(soles(hi.vals[0]), `Máximo (${hi.label})`)}</div>
            ${hlNote(hr ? `${esc(hr.label)}: ${esc(soles(hr.vals[0]))} por estudiante (${esc(nf0.format(hr.e))} estudiantes).` : '')}
            <div class="figure"><p class="cap">Devengado total por estudiante, ${esc(Y)}</p><div data-fig="est"></div></div>
            ${caveat([
              'El gasto total incluye investigación, pensiones de cesantes, inversión en infraestructura y servicios a la comunidad; no es solo el costo de enseñar.',
              'Universidades pequeñas, nuevas o con carreras de laboratorio (ingeniería, ciencias, agronomía, medicina) tienden a tener un costo por estudiante mayor.',
              'La matrícula puede referirse solo a pregrado; revisa la fuente indicada abajo.',
            ])}${srcCtx('estudiantes', 'Estudiantes')}`,
          mount(el) {
            const C = colors();
            hbar($('[data-fig="est"]', el), { items, series: [{ name: 'Soles por estudiante', color: C.dev }], fmt: soles, axis: solesAxis, aria: 'Gasto devengado por estudiante' });
          },
        };
      },
    },
  ];

  // ---------- render ----------
  let io = null, gen = 0;
  function render() {
    destroyCharts();
    gen += 1;
    const myGen = gen;
    const host = $('#stories');
    const prevH = {};
    host.querySelectorAll('.story').forEach((sec) => { prevH[sec.id] = sec.offsetHeight; });
    host.innerHTML = '';
    if (io) io.disconnect();
    STORIES.forEach((st, i) => {
      const sec = document.createElement('section');
      sec.className = 'story is-loading';
      sec.id = st.id;
      sec.dataset.i = String(i);
      sec.setAttribute('aria-busy', 'true');
      if (prevH[st.id]) sec.style.minHeight = prevH[st.id] + 'px';
      sec.innerHTML = `<p class="kicker"><b>${String(i + 1).padStart(2, '0')}</b>${esc(st.kicker)}</p>
        <h2 class="sk-title">${esc(st.toc)}</h2>
        <div class="skeleton" role="status"><span>Cargando…</span><i></i><i></i><i></i></div>`;
      host.appendChild(sec);
    });
    const fl = $('#uni-ficha'), hu = hlUni();
    if (fl) {
      fl.hidden = !hu;
      fl.innerHTML = hu ? `<a href="index.html#u=${encodeURIComponent(hu.pliego)}">Ver ficha completa de ${esc(label(hu))} →</a>` : '';
    }
    $('#toc').innerHTML = STORIES.map((st) => `<li><a href="#${esc(st.id)}">${esc(st.toc)}</a></li>`).join('');
    syncURL();
    const go = (sec) => {
      const i = Number(sec.dataset.i), st = STORIES[i];
      prepStory(st, S.Y).then(() => { if (myGen === gen) fillStory(sec, st, i); });
    };
    const secs = [...host.querySelectorAll('.story')];
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((ents) => ents.forEach((e) => {
        if (e.isIntersecting) { io.unobserve(e.target); go(e.target); }
      }), { rootMargin: '600px 0px' });
      secs.forEach((sec) => io.observe(sec));
    } else secs.forEach(go);
  }

  function fillStory(sec, st, i) {
    const Y = S.Y;
    const partial = S.partial.includes(Y);
    let out;
    try { out = st.build(Y); } catch (e) { console.error(e); out = { h2: esc(st.toc), html: '<p class="empty">No se pudo calcular esta historia con los datos disponibles.</p>' }; }
    sec.innerHTML = `<p class="kicker"><b>${String(i + 1).padStart(2, '0')}</b>${esc(st.kicker)}</p><h2>${out.h2}</h2>` +
      (partial ? `<p class="note">${esc(Y)} es un año en curso (${esc((S.d.parcial || {})[Y] || 'parcial')}): el devengado es parcial y no es comparable con años cerrados.</p>` : '') + out.html +
      (st.sec ? `<p><a class="explore" href="index.html#${esc(st.sec)}">Explorar en el observatorio →</a></p>` : '');
    sec.classList.remove('is-loading');
    sec.removeAttribute('aria-busy');
    sec.style.minHeight = '';
    if (!reduced) sec.classList.add('enter');
    if (out.mount) { try { out.mount(sec); } catch (e) { console.error(e); } }
  }

  function syncURL() {
    try {
      const p = new URLSearchParams(location.search);
      p.set('y', S.Y); if (S.hl) p.set('u', S.hl); else p.delete('u');
      history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`);
    } catch (e) { /* ignore */ }
  }

  function setupControls() {
    const p = new URLSearchParams(location.search);
    const ys = $('#sel-year');
    const opts = [...S.closed].reverse().map((y) => `<option value="${esc(y)}">${esc(y)}</option>`)
      .concat([...S.partial].reverse().map((y) => `<option value="${esc(y)}">${esc(y)} (parcial)</option>`));
    ys.innerHTML = opts.join('');
    const wantY = p.get('y');
    S.Y = (wantY && (S.closed.includes(wantY) || S.partial.includes(wantY))) ? wantY : (S.closed[S.closed.length - 1] || S.partial[0]);
    ys.value = S.Y;
    ys.addEventListener('change', () => { S.Y = ys.value; render(); });

    const us = $('#sel-uni');
    const unis = [...S.d.universidades].sort((a, b) => label(a).localeCompare(label(b), 'es'));
    us.innerHTML = '<option value="">— ninguna —</option>' + unis.map((u) => `<option value="${esc(u.pliego)}">${esc(u.corto && u.corto.length <= 12 ? u.corto + ' — ' : '')}${esc(titleCase(String(u.nombre || u.pliego)))}</option>`).join('');
    const wantU = p.get('u');
    if (wantU && unis.some((u) => String(u.pliego) === wantU)) { S.hl = wantU; us.value = wantU; }
    us.addEventListener('change', () => { S.hl = us.value; render(); });
  }

  function setupMeta() {
    const d = S.d;
    const n = d.universidades.length;
    const first = S.closed[0], last = S.closed[S.closed.length - 1];
    $('#hero-lede').textContent = `Ocho historias calculadas en vivo con los datos presupuestales de ${n} universidades públicas (${first || SD}–${last || SD}). Por defecto se muestra ${last || SD}, el último año cerrado.`;
    if (S.isSample) {
      const b = $('#sample-banner');
      b.hidden = false;
      b.innerHTML = '<strong>Datos de ejemplo.</strong> Esta página está mostrando un archivo de muestra con cifras ficticias, mientras se integran los datos reales del MEF. No uses estas cifras para conclusiones.';
    }
    const fs = Array.isArray(d.fuentes) ? d.fuentes : [];
    $('#sources').innerHTML = fs.length ? 'Fuentes: ' + fs.map((f) => (f && f.url && /^https?:\/\//.test(f.url)
      ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.nombre || f.url)}</a>` : esc(f && f.nombre))).join(' · ') : esc(SRC_MEF);
    if (d.generado) $('#generated').textContent = `Datos generados: ${d.generado}`;
  }

  function progress() {
    const bar = $('#progress');
    const on = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0) + '%';
    };
    window.addEventListener('scroll', on, { passive: true });
    on();
  }

  function chartDefaults() {
    if (!hasChart()) return;
    Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = colors().ink2;
  }

  function setupTheme() {
    const btn = $('#theme-toggle');
    const sync = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (btn) { btn.setAttribute('aria-pressed', String(dark)); btn.setAttribute('aria-label', dark ? 'Activar tema claro' : 'Activar tema oscuro'); }
    };
    sync();
    if (btn) btn.addEventListener('click', () => {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('rp-theme', t); } catch (e) { /* sin almacenamiento */ }
      sync();
      if (S.d) { chartDefaults(); render(); }
    });
    return sync;
  }

  async function init() {
    const syncTheme = setupTheme();
    progress();
    try {
      const { d, isSample, full } = await load();
      S.d = d; S.isSample = isSample; L.full = full;
    } catch (e) {
      $('#hero-lede').textContent = 'No se pudieron cargar los datos. Intenta recargar la página.';
      return;
    }
    setupYears(S.d);
    chartDefaults();
    setupControls();
    setupMeta();
    render();
    // Los gráficos (canvas) se dibujan antes de que llegue la fuente web: se repintan al cargarla.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => S.charts.forEach((c) => { try { c.update('none'); } catch (e) { /* destruido */ } }));
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    window.addEventListener('storage', (e) => {
      if (e.key !== 'rp-theme' || (e.newValue !== 'dark' && e.newValue !== 'light')) return;
      document.documentElement.setAttribute('data-theme', e.newValue); syncTheme(); chartDefaults(); render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
