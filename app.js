/* Radiografía Presupuestal de las Universidades Públicas del Perú
 * JS vanilla + Chart.js (CDN) + Leaflet (CDN, carga diferida). Sin build.
 * Carga data/observatorio.json; si no existe, data/sample/observatorio.json (ejemplo).
 */
'use strict';
(() => {
  // ------------------------------------------------------------------ utilidades
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => {
    if (!u) return null;
    try {
      const x = new URL(String(u), location.href);
      return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null;
    } catch (e) { return null; }
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const SD = 's/d';
  const LOC = 'es-PE';
  const div = (a, b) => (num(a) !== null && num(b)) ? a / b : null;
  const sum = arr => { let t = 0, ok = false; for (const v of arr) { if (num(v) !== null) { t += v; ok = true; } } return ok ? t : null; };

  const fmtM = v => num(v) === null ? SD : 'S/ ' + (v / 1e6).toLocaleString(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M';
  const fmtS = v => num(v) === null ? SD : 'S/ ' + Math.round(v).toLocaleString(LOC);
  const fmtN = v => num(v) === null ? SD : Math.round(v).toLocaleString(LOC);
  const fmtP = (v, d = 1) => num(v) === null ? SD : (v * 100).toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const fmtSigned = v => num(v) === null ? SD : (v >= 0 ? '+' : '−') + fmtM(Math.abs(v));
  const mill = v => num(v) === null ? null : v / 1e6;
  const fmtScore = v => num(v) === null ? SD : v.toLocaleString(LOC, { maximumFractionDigits: 1 });

  const semaforo = v => num(v) === null ? 'na' : v >= 0.9 ? 'good' : v >= 0.75 ? 'warn' : 'bad';
  const pill = v => `<span class="pill ${semaforo(v)}">${esc(fmtP(v))}</span>`;
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Busca la clave de un objeto por prefijo / fragmento (ej. "2.1", "0137", "DIRECTAMENTE")
  const pick = (obj, frag) => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj[frag]) return obj[frag];
    const k = Object.keys(obj).find(k => k.toUpperCase().startsWith(frag.toUpperCase()) || k.toUpperCase().includes(frag.toUpperCase()));
    return k ? obj[k] : null;
  };

  // ------------------------------------------------------------------ catálogos
  const GENERICAS = [
    { frag: '2.1', lbl: 'Personal y obligaciones sociales', c: '--k1' },
    { frag: '2.2', lbl: 'Pensiones y prestaciones', c: '--k2' },
    { frag: '2.3', lbl: 'Bienes y servicios', c: '--k3' },
    { frag: '2.5', lbl: 'Otros gastos', c: '--k4' },
    { frag: '2.6', lbl: 'Activos no financieros (inversión)', c: '--k5' },
  ];
  const FUENTES = [
    { frag: 'ORDINARIOS', lbl: 'Recursos ordinarios (RO)', c: '--k1' },
    { frag: 'DIRECTAMENTE', lbl: 'Recursos directamente recaudados (RDR)', c: '--k3' },
    { frag: 'DETERMINADOS', lbl: 'Recursos determinados (canon, regalías)', c: '--k5' },
    { frag: 'DONACIONES', lbl: 'Donaciones y transferencias', c: '--k6' },
    { frag: 'OPERACIONES OFICIALES', lbl: 'Operaciones oficiales de crédito', c: '--k2' },
  ];

  // ------------------------------------------------------------------ estado
  const S = {
    data: null, sample: false, unis: [], years: [], partial: {}, lastClosed: null, year: null,
    rendered: new Set(), charts: new Map(),
    rank: { q: '', dep: '', sort: 'pim', dir: -1 },
    tray: { top: 15, uni: null },
    gasto: { metric: 'dev', uni: '' },
    fuentes: { metric: 'pim', uni: '' },
    ficha: { uni: null, cmp: [] },
    map: null, mapLayer: null, tiles: null,
  };
  const kpiCache = new Map();

  const isPartial = y => Object.prototype.hasOwnProperty.call(S.partial, String(y));
  const yearLbl = y => isPartial(y) ? `${y} (parcial, ${S.partial[String(y)]})` : String(y);
  const A = (u, y) => (u && u.anios && u.anios[String(y)]) || null;
  const uniBy = p => S.unis.find(u => String(u.pliego) === String(p)) || null;
  const uName = u => u ? (u.corto || u.nombre || ('Pliego ' + u.pliego)) : SD;

  function kpi(u, y) {
    const key = u.pliego + '|' + y;
    if (kpiCache.has(key)) return kpiCache.get(key);
    const a = A(u, y);
    if (!a) { kpiCache.set(key, {}); return {}; }
    const t = a.total || {};
    const k = Object.assign({}, a.kpi || {});
    const g = f => pick(a.generica, f) || {};
    const p0137 = pick(a.programa, '0137') || {};
    const rdr = pick(a.fuente, 'DIRECTAMENTE') || {};
    const ingRdr = pick(a.ingresos && a.ingresos.fuente, 'DIRECTAMENTE') || {};
    const fill = (n, v) => { if (num(k[n]) === null) k[n] = num(v); };
    fill('ejec', div(t.dev, t.pim));
    fill('pim_vs_pia', div(t.pim, t.pia));
    fill('pct_personal', div(g('2.1').dev, t.dev));
    fill('pct_bys', div(g('2.3').dev, t.dev));
    fill('pct_inversion', div(g('2.6').dev, t.dev));
    fill('pct_idi', div(p0137.dev, t.dev));
    fill('ejec_inversion', div(g('2.6').dev, g('2.6').pim));
    fill('ejec_idi', div(p0137.dev, p0137.pim));
    fill('pct_rdr', div(rdr.pim, t.pim));
    fill('rdr_recaudado_vs_pim', div(ingRdr.recaudado, ingRdr.pim));
    fill('gasto_por_estudiante', div(t.dev, a.estudiantes));
    fill('idi_por_pub', div(p0137.dev, a.pubs));
    kpiCache.set(key, k);
    return k;
  }
  const tot = (u, y, f) => num(((A(u, y) || {}).total || {})[f]);

  function nacional(y) {
    const n = S.data.nacional && S.data.nacional[String(y)];
    const calc = {
      pia: sum(S.unis.map(u => tot(u, y, 'pia'))),
      pim: sum(S.unis.map(u => tot(u, y, 'pim'))),
      dev: sum(S.unis.map(u => tot(u, y, 'dev'))),
      n_unis: S.unis.filter(u => A(u, y)).length,
    };
    if (!n) return calc;
    return { pia: num(n.pia) ?? calc.pia, pim: num(n.pim) ?? calc.pim, dev: num(n.dev) ?? calc.dev, n_unis: num(n.n_unis) ?? calc.n_unis };
  }

  // ------------------------------------------------------------------ Chart.js
  const hasChart = () => typeof window.Chart === 'function';
  function chartTheme() {
    if (!hasChart()) return;
    const C = window.Chart;
    C.defaults.font.family = cssVar('--font') || 'system-ui';
    C.defaults.font.size = 12;
    C.defaults.color = cssVar('--muted');
    C.defaults.borderColor = cssVar('--line');
    C.defaults.plugins.legend.labels.boxWidth = 12;
    C.defaults.plugins.legend.labels.boxHeight = 12;
    C.defaults.plugins.tooltip.backgroundColor = cssVar('--ink');
    C.defaults.plugins.tooltip.titleColor = cssVar('--bg');
    C.defaults.plugins.tooltip.bodyColor = cssVar('--bg');
    C.defaults.animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 };
    C.defaults.maintainAspectRatio = false;
    C.defaults.responsive = true;
  }
  function mkChart(id, cfg, label) {
    const old = S.charts.get(id);
    if (old) { old.destroy(); S.charts.delete(id); }
    const cv = document.getElementById(id);
    if (!cv) return null;
    if (label) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', label); }
    if (!hasChart()) {
      cv.parentElement.innerHTML = '<p class="empty">No se pudo cargar la librería de gráficos. Revisa tu conexión.</p>';
      return null;
    }
    const ch = new window.Chart(cv, cfg);
    S.charts.set(id, ch);
    return ch;
  }
  const tickM = v => 'S/ ' + Number(v).toLocaleString(LOC) + ' M';
  const tickP = v => v + ' %';
  const ttM = ctx => `${ctx.dataset.label}: ${fmtM(num(ctx.raw) === null ? null : ctx.raw * 1e6)}`;
  const ttP = ctx => `${ctx.dataset.label}: ${num(ctx.raw) === null ? SD : ctx.raw.toLocaleString(LOC, { maximumFractionDigits: 1 }) + ' %'}`;
  const isMobile = () => window.matchMedia('(max-width: 559px)').matches;

  // Barras horizontales con alto según cantidad de categorías
  function sizeFor(id, n, per = 26, min = 240) {
    const cv = document.getElementById(id);
    if (cv && cv.parentElement) cv.parentElement.style.height = Math.max(min, n * per + 70) + 'px';
  }

  // ------------------------------------------------------------------ HTML helpers
  const yearOptions = sel => S.years.slice().reverse().map(y =>
    `<option value="${esc(y)}"${String(y) === String(sel) ? ' selected' : ''}>${esc(yearLbl(y))}</option>`).join('');
  const uniOptions = (sel, allLabel) => (allLabel ? `<option value="">${esc(allLabel)}</option>` : '') +
    S.unis.slice().sort((a, b) => uName(a).localeCompare(uName(b), LOC)).map(u =>
      `<option value="${esc(u.pliego)}"${String(u.pliego) === String(sel) ? ' selected' : ''}>${esc(uName(u))} — ${esc(u.nombre || '')}</option>`).join('');
  const kpiBox = (lbl, val, note, cls = '') => `<div class="kpi ${cls}"><span class="k-lbl">${esc(lbl)}</span><span class="k-val">${esc(val)}</span>${note ? `<span class="k-note">${esc(note)}</span>` : ''}</div>`;
  const partialNote = y => isPartial(y) ? `<p class="note warn"><strong>${esc(y)} es un año en curso</strong> (${esc(S.partial[String(y)])}): el devengado y la ejecución son parciales y no comparables con años cerrados.</p>` : '';
  const seg = (name, opts, cur) => `<div class="seg" role="group" aria-label="${esc(name)}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join('')}</div>`;
  const legendHtml = items => `<ul class="legend">${items.map(i => `<li><i style="background:${cssVar(i.c)}"></i>${esc(i.lbl)}</li>`).join('')}</ul>`;
  const uniLink = u => `<a class="uni-link" href="#u=${encodeURIComponent(u.pliego)}">${esc(uName(u))}</a><span class="uni-sub">${esc(u.nombre || '')}${u.departamento ? ' · ' + esc(u.departamento) : ''}</span>`;

  function bindSeg(root, cb) {
    $$('.seg', root).forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      $$('button', g).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      cb(b.dataset.v, g);
    }));
  }
  const unisByPim = y => S.unis.filter(u => A(u, y)).sort((a, b) => (tot(b, y, 'pim') || 0) - (tot(a, y, 'pim') || 0));

  // ================================================================== 1. RESUMEN
  function renderResumen() {
    const el = $('#body-resumen');
    const y = S.lastClosed;
    const n = nacional(y);
    const idiDev = sum(S.unis.map(u => (pick((A(u, y) || {}).programa, '0137') || {}).dev));
    const inv = sum(S.unis.map(u => (pick((A(u, y) || {}).generica, '2.6') || {}).dev));
    const yPrev = S.years[S.years.indexOf(y) - 1];
    const nPrev = yPrev ? nacional(yPrev) : null;
    const varPim = nPrev ? div(n.pim - nPrev.pim, nPrev.pim) : null;
    el.innerHTML = `
      <div class="kpis six">
        ${kpiBox('Universidades públicas', fmtN(n.n_unis), 'con presupuesto en ' + y, 'accent')}
        ${kpiBox('PIA ' + y, fmtM(n.pia), 'presupuesto de apertura')}
        ${kpiBox('PIM ' + y, fmtM(n.pim), varPim !== null ? (varPim >= 0 ? '+' : '') + fmtP(varPim) + ' vs ' + yPrev : 'presupuesto modificado', 'accent')}
        ${kpiBox('Devengado ' + y, fmtM(n.dev), 'gasto ejecutado', 'ochre')}
        ${kpiBox('% ejecución', fmtP(div(n.dev, n.pim)), 'devengado / PIM', 'ochre')}
        ${kpiBox('% a I+D (PP 0137)', fmtP(div(idiDev, n.dev), 2), 'inversión: ' + fmtP(div(inv, n.dev)))}
      </div>
      <div class="grid two">
        <div class="card">
          <h3>PIA, PIM y devengado del conjunto de universidades</h3>
          <p class="sub">Millones de soles corrientes, ${esc(S.years[0])}–${esc(S.years[S.years.length - 1])}.</p>
          <div class="chart"><canvas id="ch-nac"></canvas></div>
        </div>
        <div class="card">
          <h3>Ejecución anual (devengado / PIM)</h3>
          <p class="sub">Porcentaje del presupuesto modificado efectivamente gastado.</p>
          <div class="chart"><canvas id="ch-nac-ejec"></canvas></div>
        </div>
      </div>
      <p class="note">KPIs del último año cerrado (${esc(y)}). ${S.years.some(isPartial) ? 'Años parciales: ' + esc(S.years.filter(isPartial).map(yearLbl).join(', ')) + '.' : ''}</p>`;

    const yrs = S.years;
    const ser = f => yrs.map(yy => mill(nacional(yy)[f]));
    const dashPartial = { borderDash: ctx => (isPartial(yrs[ctx.p1DataIndex]) ? [5, 4] : undefined) };
    mkChart('ch-nac', {
      type: 'line',
      data: {
        labels: yrs.map(String),
        datasets: [
          { label: 'PIA', data: ser('pia'), borderColor: cssVar('--c-pia'), backgroundColor: cssVar('--c-pia'), tension: .25, pointRadius: 2, segment: dashPartial },
          { label: 'PIM', data: ser('pim'), borderColor: cssVar('--c-pim'), backgroundColor: cssVar('--c-pim'), borderWidth: 2.5, tension: .25, pointRadius: 2, segment: dashPartial },
          { label: 'Devengado', data: ser('dev'), borderColor: cssVar('--c-dev'), backgroundColor: cssVar('--c-dev'), borderWidth: 2.5, tension: .25, pointRadius: 2, segment: dashPartial },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: { label: ttM, title: it => yearLbl(it[0].label) } }, legend: { position: 'bottom' } },
        scales: { y: { ticks: { callback: tickM }, beginAtZero: true } },
      },
    }, 'Evolución de PIA, PIM y devengado del total de universidades públicas');

    const ej = yrs.map(yy => { const v = div(nacional(yy).dev, nacional(yy).pim); return v === null ? null : +(v * 100).toFixed(1); });
    mkChart('ch-nac-ejec', {
      type: 'bar',
      data: {
        labels: yrs.map(String),
        datasets: [{ label: 'Ejecución', data: ej, borderRadius: 4,
          backgroundColor: yrs.map((yy, i) => isPartial(yy) ? cssVar('--line-strong') : cssVar('--' + ({ good: 'good', warn: 'warn', bad: 'bad', na: 'line' })[semaforo(ej[i] / 100)])) }],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttP, title: it => yearLbl(it[0].label) } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: tickP } } },
      },
    }, 'Porcentaje de ejecución anual del conjunto de universidades');
  }

  // ================================================================== 2. RANKING
  const RANK_COLS = [
    { k: 'nombre', lbl: 'Universidad', txt: true, get: u => uName(u) },
    { k: 'pia', lbl: 'PIA', get: (u, y) => tot(u, y, 'pia'), f: fmtM },
    { k: 'pim', lbl: 'PIM', get: (u, y) => tot(u, y, 'pim'), f: fmtM },
    { k: 'dev', lbl: 'Devengado', get: (u, y) => tot(u, y, 'dev'), f: fmtM },
    { k: 'ejec', lbl: '% Ejec.', get: (u, y) => kpi(u, y).ejec, f: null, html: v => pill(v) },
    { k: 'pct_personal', lbl: '% Personal', get: (u, y) => kpi(u, y).pct_personal, f: fmtP },
    { k: 'pct_inversion', lbl: '% Inversión', get: (u, y) => kpi(u, y).pct_inversion, f: fmtP },
    { k: 'pct_idi', lbl: '% I+D', get: (u, y) => kpi(u, y).pct_idi, f: v => fmtP(v, 2) },
    { k: 'ejec_idi', lbl: 'Ejec. I+D', get: (u, y) => kpi(u, y).ejec_idi, f: null, html: v => pill(v) },
    { k: 'pct_rdr', lbl: '% RDR', get: (u, y) => kpi(u, y).pct_rdr, f: fmtP },
    { k: 'gpe', lbl: 'S/ por estudiante', get: (u, y) => kpi(u, y).gasto_por_estudiante, f: fmtS },
    { k: 'indice', lbl: 'Índice*', get: u => num(u.indice && u.indice.score), f: null,
      html: v => num(v) === null ? `<span class="muted">${SD}</span>` : `<span class="score"><b>${esc(fmtScore(v))}</b><span class="bar ochre"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></span></span>` },
  ];
  function renderRanking() {
    const el = $('#body-ranking');
    const deps = [...new Set(S.unis.map(u => u.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, LOC));
    if (!$('#rk-table', el)) {
      el.innerHTML = `
        <div class="controls">
          <label class="grow">Buscar<input type="search" id="rk-q" placeholder="Nombre, sigla o pliego" autocomplete="off" value="${esc(S.rank.q)}"></label>
          <label>Departamento<select id="rk-dep"><option value="">Todos</option>${deps.map(d => `<option${d === S.rank.dep ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
          <label>Año<select id="rk-year">${yearOptions(S.year)}</select></label>
          <button type="button" class="btn" id="rk-csv">Descargar CSV</button>
        </div>
        <div id="rk-partial"></div>
        <div class="table-wrap"><table id="rk-table"><caption id="rk-cap"></caption><thead></thead><tbody></tbody></table></div>
        <p class="count" id="rk-count"></p>
        <p class="note">* Índice de gestión presupuestal: referencial, NO oficial (ver Metodología). Semáforo de ejecución: ≥ 90 % verde, 75–90 % ámbar, &lt; 75 % rojo.</p>`;
      $('#rk-q', el).addEventListener('input', debounce(e => { S.rank.q = e.target.value; drawRankRows(); }));
      $('#rk-dep', el).addEventListener('change', e => { S.rank.dep = e.target.value; drawRankRows(); });
      $('#rk-year', el).addEventListener('change', e => setYear(e.target.value));
      $('#rk-csv', el).addEventListener('click', downloadCsv);
      $('#rk-table thead', el).addEventListener('click', e => {
        const b = e.target.closest('button.sort'); if (!b) return;
        const k = b.dataset.k;
        if (S.rank.sort === k) S.rank.dir *= -1; else { S.rank.sort = k; S.rank.dir = k === 'nombre' ? 1 : -1; }
        drawRankRows();
      });
    } else {
      $('#rk-year', el).innerHTML = yearOptions(S.year);
    }
    drawRankRows();
  }
  function rankRows() {
    const y = S.year;
    const q = S.rank.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const col = RANK_COLS.find(c => c.k === S.rank.sort) || RANK_COLS[2];
    const rows = S.unis.filter(u => A(u, y))
      .filter(u => !S.rank.dep || u.departamento === S.rank.dep)
      .filter(u => !q || [u.nombre, u.corto, u.pliego, u.departamento].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    rows.sort((a, b) => {
      const va = col.get(a, y), vb = col.get(b, y);
      if (typeof va === 'string' || typeof vb === 'string') return S.rank.dir * String(va ?? '').localeCompare(String(vb ?? ''), LOC);
      if (num(va) === null && num(vb) === null) return 0;
      if (num(va) === null) return 1;
      if (num(vb) === null) return -1;
      return S.rank.dir * (va - vb);
    });
    return rows;
  }
  function drawRankRows() {
    const el = $('#body-ranking'); const y = S.year;
    const rows = rankRows();
    $('#rk-partial', el).innerHTML = partialNote(y);
    $('#rk-cap', el).textContent = `Universidades públicas, año ${yearLbl(y)}. Montos en soles.`;
    $('#rk-table thead', el).innerHTML = '<tr><th scope="col" class="sticky-col">#</th>' + RANK_COLS.map((c, i) => {
      const sort = S.rank.sort === c.k ? (S.rank.dir > 0 ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" class="${c.txt ? 'txt' : ''}${i === 0 ? '' : ''}" aria-sort="${sort}"><button type="button" class="sort" data-k="${esc(c.k)}">${esc(c.lbl)}</button></th>`;
    }).join('') + '</tr>';
    $('#rk-table tbody', el).innerHTML = rows.length ? rows.map((u, i) => '<tr>' +
      `<td class="sticky-col">${i + 1}</td>` +
      RANK_COLS.map(c => {
        if (c.k === 'nombre') return `<td class="txt">${uniLink(u)}</td>`;
        const v = c.get(u, y);
        return `<td>${c.html ? c.html(v) : esc(c.f(v))}</td>`;
      }).join('') + '</tr>').join('')
      : `<tr><td colspan="${RANK_COLS.length + 1}" class="txt"><span class="muted">Sin resultados para ese filtro.</span></td></tr>`;
    $('#rk-count', el).textContent = `${rows.length} de ${S.unis.length} universidades.`;
  }
  function downloadCsv() {
    const y = S.year; const rows = rankRows();
    const head = ['pliego', 'universidad', 'sigla', 'departamento', 'anio', 'pia', 'pim', 'devengado', 'ejecucion', 'pct_personal', 'pct_inversion', 'pct_idi', 'ejec_idi', 'pct_rdr', 'soles_por_estudiante', 'indice'];
    const q = v => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const r4 = v => num(v) === null ? '' : +v.toFixed(4);
    const lines = [head.join(',')].concat(rows.map(u => { const k = kpi(u, y); return [u.pliego, u.nombre, u.corto, u.departamento, y, tot(u, y, 'pia'), tot(u, y, 'pim'), tot(u, y, 'dev'), r4(k.ejec), r4(k.pct_personal), r4(k.pct_inversion), r4(k.pct_idi), r4(k.ejec_idi), r4(k.pct_rdr), r4(k.gasto_por_estudiante), u.indice ? u.indice.score : ''].map(q).join(','); }));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `universidades-presupuesto-${y}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ================================================================== 3. TRAYECTORIA
  function transfersHtml(list) {
    if (!Array.isArray(list) || !list.length) return '<p class="empty">No hay transferencias registradas para este año en los datos.</p>';
    return '<ul class="tlist">' + list.slice().sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))).map(t => {
      const url = safeUrl(t.url);
      const norma = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(t.norma || 'Norma')}</a>` : esc(t.norma || 'Norma s/d');
      return `<li><span class="t-top"><span><strong>${norma}</strong> <span class="muted small">${esc(t.fecha || '')}</span></span><span class="t-amt">${esc(fmtM(num(t.monto)))}</span></span><span class="t-fin">${esc(t.finalidad || '')}</span></li>`;
    }).join('') + '</ul>';
  }
  function renderTrayectoria() {
    const el = $('#body-trayectoria'); const y = S.year;
    const all = unisByPim(y);
    if (!S.tray.uni || !uniBy(S.tray.uni)) S.tray.uni = all[0] ? all[0].pliego : null;
    const list = S.tray.top > 0 ? all.slice(0, S.tray.top) : all;
    const tUni = uniBy(S.tray.uni);
    el.innerHTML = `
      ${partialNote(y)}
      <div class="controls">
        <label>Año<select id="tr-year">${yearOptions(y)}</select></label>
        ${all.length > 15 ? seg('Cantidad', [['15', 'Top 15'], ['0', 'Todas']], S.tray.top) : ''}
      </div>
      <div class="card">
        <h3>PIA → PIM → devengado, ${esc(yearLbl(y))}</h3>
        <p class="sub">Millones de soles. Ordenado por PIM. ${list.length < all.length ? `Mostrando ${list.length} de ${all.length}.` : ''}</p>
        <div class="chart"><canvas id="ch-tray"></canvas></div>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table>
        <caption>Variación del presupuesto durante ${esc(yearLbl(y))}</caption>
        <thead><tr><th class="txt sticky-col" scope="col">Universidad</th><th scope="col">PIA</th><th scope="col">PIM</th><th scope="col">Δ PIM − PIA</th><th scope="col">Δ %</th><th scope="col">Devengado</th><th scope="col">% Ejec.</th><th scope="col">Transf. con norma</th></tr></thead>
        <tbody>${all.map(u => {
          const a = A(u, y) || {}; const pia = tot(u, y, 'pia'), pim = tot(u, y, 'pim');
          const tr = Array.isArray(a.transferencias) ? a.transferencias : [];
          return `<tr><td class="txt sticky-col">${uniLink(u)}</td><td>${esc(fmtM(pia))}</td><td>${esc(fmtM(pim))}</td><td>${esc(fmtSigned(num(pim) !== null && num(pia) !== null ? pim - pia : null))}</td><td>${esc(fmtP(div(num(pim) !== null && num(pia) !== null ? pim - pia : null, pia)))}</td><td>${esc(fmtM(tot(u, y, 'dev')))}</td><td>${pill(kpi(u, y).ejec)}</td><td>${tr.length ? esc(tr.length + ' · ' + fmtM(sum(tr.map(t => num(t.monto))))) : '<span class="muted">—</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>
      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <div class="controls" style="margin-bottom:6px"><label class="grow">Universidad<select id="tr-uni">${uniOptions(S.tray.uni)}</select></label></div>
          <h3>Trayectoria ${esc(uName(tUni))}</h3>
          <p class="sub">PIA, PIM y devengado por año (millones de soles).</p>
          <div class="chart"><canvas id="ch-tray-uni"></canvas></div>
        </div>
        <div class="card">
          <h3>¿Qué explica el aumento? ${esc(uName(tUni))}, ${esc(y)}</h3>
          <p class="sub">PIM − PIA: <strong>${esc(fmtSigned(num(tot(tUni, y, 'pim')) !== null && num(tot(tUni, y, 'pia')) !== null ? tot(tUni, y, 'pim') - tot(tUni, y, 'pia') : null))}</strong>. Normas (D.S. y otras) registradas:</p>
          ${transfersHtml((A(tUni, y) || {}).transferencias)}
          <p class="note">No todas las modificaciones requieren decreto supremo: también hay créditos por saldos de balance y modificaciones dentro del pliego.</p>
        </div>
      </div>`;
    $('#tr-year', el).addEventListener('change', e => setYear(e.target.value));
    $('#tr-uni', el).addEventListener('change', e => { S.tray.uni = e.target.value; renderTrayectoria(); });
    bindSeg(el, v => { S.tray.top = +v; renderTrayectoria(); });

    sizeFor('ch-tray', list.length, isMobile() ? 30 : 26);
    mkChart('ch-tray', {
      type: 'bar',
      data: {
        labels: list.map(uName),
        datasets: [
          { label: 'PIA', data: list.map(u => mill(tot(u, y, 'pia'))), backgroundColor: cssVar('--c-pia'), borderRadius: 3 },
          { label: 'PIM', data: list.map(u => mill(tot(u, y, 'pim'))), backgroundColor: cssVar('--c-pim'), borderRadius: 3 },
          { label: 'Devengado', data: list.map(u => mill(tot(u, y, 'dev'))), backgroundColor: cssVar('--c-dev'), borderRadius: 3 },
        ],
      },
      options: {
        indexAxis: 'y', interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttM, title: it => (list[it[0].dataIndex] || {}).nombre || it[0].label } } },
        scales: { x: { ticks: { callback: tickM, maxTicksLimit: isMobile() ? 4 : 8 } }, y: { ticks: { autoSkip: false } } },
        onClick: (e, els) => { if (els.length) { S.tray.uni = list[els[0].index].pliego; renderTrayectoria(); } },
      },
    }, `PIA, PIM y devengado por universidad en ${y}`);

    const yrs = S.years;
    mkChart('ch-tray-uni', {
      type: 'bar',
      data: {
        labels: yrs.map(String),
        datasets: [
          { type: 'line', label: 'PIA', data: yrs.map(yy => mill(tot(tUni, yy, 'pia'))), borderColor: cssVar('--c-pia'), backgroundColor: cssVar('--c-pia'), borderDash: [4, 3], pointRadius: 2, tension: .2, order: 0 },
          { label: 'PIM', data: yrs.map(yy => mill(tot(tUni, yy, 'pim'))), backgroundColor: cssVar('--c-pim'), borderRadius: 3, order: 2 },
          { label: 'Devengado', data: yrs.map(yy => mill(tot(tUni, yy, 'dev'))), backgroundColor: cssVar('--c-dev'), borderRadius: 3, order: 1 },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttM, title: it => yearLbl(it[0].label) } } },
        scales: { y: { ticks: { callback: tickM }, beginAtZero: true } },
      },
    }, `Trayectoria anual de ${uName(tUni)}`);
  }

  // ================================================================== 4/5. Composición (genéricas / fuentes)
  function compBlock(cfg) {
    // cfg: {key, el, cats, field ('generica'|'fuente'), state, title, evoTitle}
    const { el, cats, field, st } = cfg; const y = S.year;
    const all = unisByPim(y);
    const presentCats = cats.filter(c => S.unis.some(u => S.years.some(yy => pick((A(u, yy) || {})[field], c.frag))));
    const share = (u, c) => { const a = A(u, y) || {}; const t = sum(presentCats.map(cc => (pick(a[field], cc.frag) || {})[st.metric])); const v = (pick(a[field], c.frag) || {})[st.metric]; const d = div(v, t); return d === null ? null : +(d * 100).toFixed(2); };
    sizeFor(cfg.key + '-pct', all.length, isMobile() ? 28 : 24);
    mkChart(cfg.key + '-pct', {
      type: 'bar',
      data: { labels: all.map(uName), datasets: presentCats.map(c => ({ label: c.lbl, data: all.map(u => share(u, c)), backgroundColor: cssVar(c.c), borderWidth: 0 })) },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttP, title: it => (all[it[0].dataIndex] || {}).nombre || it[0].label } } },
        scales: { x: { stacked: true, min: 0, max: 100, ticks: { callback: tickP } }, y: { stacked: true, ticks: { autoSkip: false } } },
      },
    }, cfg.title);

    const yrs = S.years; const u = st.uni ? uniBy(st.uni) : null; const pool = u ? [u] : S.unis;
    mkChart(cfg.key + '-evo', {
      type: 'bar',
      data: { labels: yrs.map(String), datasets: presentCats.map(c => ({ label: c.lbl, data: yrs.map(yy => mill(sum(pool.map(x => (pick((A(x, yy) || {})[field], c.frag) || {})[st.metric])))), backgroundColor: cssVar(c.c) })) },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttM, title: it => yearLbl(it[0].label) } } },
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: tickM } } },
      },
    }, cfg.evoTitle);
    return presentCats;
  }
  function compShell(key, cats, st, metricOpts, extra = '') {
    const y = S.year;
    return `
      ${partialNote(y)}
      <div class="controls">
        <label>Año<select class="c-year">${yearOptions(y)}</select></label>
        ${seg('Métrica', metricOpts, st.metric)}
      </div>
      <div class="grid two">
        <div class="card">
          <h3>Composición por universidad, ${esc(yearLbl(y))}</h3>
          <p class="sub">Porcentaje del ${st.metric === 'pim' ? 'PIM' : st.metric === 'pia' ? 'PIA' : 'devengado'} de cada universidad.</p>
          <div class="chart"><canvas id="${key}-pct"></canvas></div>
          ${legendHtml(cats)}
        </div>
        <div class="card">
          <div class="controls" style="margin-bottom:6px"><label class="grow">Ver evolución de<select class="c-uni">${uniOptions(st.uni, 'Todas las universidades (suma)')}</select></label></div>
          <h3>Evolución ${st.uni ? esc(uName(uniBy(st.uni))) : 'del conjunto'}</h3>
          <p class="sub">Millones de soles por año (${st.metric === 'pim' ? 'PIM' : st.metric === 'pia' ? 'PIA' : 'devengado'}).</p>
          <div class="chart"><canvas id="${key}-evo"></canvas></div>
          ${legendHtml(cats)}
        </div>
      </div>${extra}`;
  }
  function bindComp(el, st, rerender) {
    $('.c-year', el).addEventListener('change', e => setYear(e.target.value));
    $('.c-uni', el).addEventListener('change', e => { st.uni = e.target.value; rerender(); });
    bindSeg(el, (v, g) => { if (g.closest('.controls') && v) { st.metric = v; rerender(); } });
  }

  function renderGasto() {
    const el = $('#body-gasto'); const st = S.gasto;
    const cats = GENERICAS.filter(c => S.unis.some(u => S.years.some(yy => pick((A(u, yy) || {}).generica, c.frag))));
    if (!cats.length) { el.innerHTML = '<p class="empty">Aún no hay datos por genérica de gasto.</p>'; return; }
    el.innerHTML = compShell('ch-gas', cats, st, [['dev', 'Devengado'], ['pim', 'PIM'], ['pia', 'PIA']],
      '<p class="note">Lectura: una universidad con más del 70 % en personal y pensiones tiene poco margen para mantenimiento, equipamiento e investigación.</p>');
    bindComp(el, st, renderGasto);
    compBlock({ key: 'ch-gas', el, cats, field: 'generica', st, title: 'Composición del gasto por genérica y universidad', evoTitle: 'Evolución del gasto por genérica' });
  }

  function renderFuentes() {
    const el = $('#body-fuentes'); const st = S.fuentes; const y = S.year;
    const cats = FUENTES.filter(c => S.unis.some(u => S.years.some(yy => pick((A(u, yy) || {}).fuente, c.frag))));
    const all = unisByPim(y);
    const rdr = u => pick(((A(u, y) || {}).ingresos || {}).fuente, 'DIRECTAMENTE') || {};
    const hasRdr = all.some(u => num(rdr(u).recaudado) !== null || num(rdr(u).pim) !== null);
    const extra = `
      <div class="card" style="margin-top:12px">
        <h3>Ingresos propios (RDR): presupuestado vs recaudado, ${esc(yearLbl(y))}</h3>
        <p class="sub">PIM de ingresos RDR frente a lo efectivamente recaudado. Si se recauda menos de lo presupuestado, parte del gasto previsto no tiene financiamiento.</p>
        ${hasRdr ? '<div class="chart"><canvas id="ch-rdr"></canvas></div>' : '<p class="empty">Aún no hay datos de ingresos recaudados.</p>'}
      </div>
      ${hasRdr ? `<div class="table-wrap" style="margin-top:12px"><table><caption>Recaudación RDR ${esc(yearLbl(y))}</caption>
        <thead><tr><th class="txt sticky-col" scope="col">Universidad</th><th scope="col">PIA ingresos RDR</th><th scope="col">PIM ingresos RDR</th><th scope="col">Recaudado</th><th scope="col">Recaudado / PIM</th><th scope="col">% RDR en PIM de gasto</th></tr></thead>
        <tbody>${all.map(u => { const r = rdr(u); return `<tr><td class="txt sticky-col">${uniLink(u)}</td><td>${esc(fmtM(num(r.pia)))}</td><td>${esc(fmtM(num(r.pim)))}</td><td>${esc(fmtM(num(r.recaudado)))}</td><td>${pill(kpi(u, y).rdr_recaudado_vs_pim)}</td><td>${esc(fmtP(kpi(u, y).pct_rdr))}</td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
    if (!cats.length) { el.innerHTML = '<p class="empty">Aún no hay datos por fuente de financiamiento.</p>' + extra; }
    else {
      el.innerHTML = compShell('ch-fue', cats, st, [['pim', 'PIM'], ['dev', 'Devengado'], ['pia', 'PIA']], extra);
      bindComp(el, st, renderFuentes);
      compBlock({ key: 'ch-fue', el, cats, field: 'fuente', st, title: 'Composición del presupuesto por fuente de financiamiento', evoTitle: 'Evolución por fuente de financiamiento' });
    }
    if (hasRdr) {
      sizeFor('ch-rdr', all.length, isMobile() ? 30 : 26);
      mkChart('ch-rdr', {
        type: 'bar',
        data: { labels: all.map(uName), datasets: [
          { label: 'PIM ingresos RDR', data: all.map(u => mill(num(rdr(u).pim))), backgroundColor: cssVar('--c-pia'), borderRadius: 3 },
          { label: 'Recaudado', data: all.map(u => mill(num(rdr(u).recaudado))), backgroundColor: cssVar('--k3'), borderRadius: 3 },
        ] },
        options: {
          indexAxis: 'y', interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttM, title: it => (all[it[0].dataIndex] || {}).nombre || it[0].label } } },
          scales: { x: { ticks: { callback: tickM, maxTicksLimit: isMobile() ? 4 : 8 } }, y: { ticks: { autoSkip: false } } },
        },
      }, 'Ingresos RDR presupuestados frente a recaudados por universidad');
    }
  }

  // ================================================================== 6. INFRAESTRUCTURA
  function renderInfra() {
    const el = $('#body-infra'); const y = S.year;
    const all = unisByPim(y);
    const g26 = u => pick((A(u, y) || {}).generica, '2.6') || {};
    const pimInv = sum(all.map(u => g26(u).pim)), devInv = sum(all.map(u => g26(u).dev));
    const proys = [];
    all.forEach(u => ((A(u, y) || {}).proyectos || []).forEach(p => proys.push(Object.assign({ u }, p))));
    proys.forEach(p => { p.saldo = num(p.pim) !== null ? p.pim - (num(p.dev) || 0) : null; p.av = div(p.dev, p.pim); });
    const top = proys.filter(p => num(p.saldo) !== null && p.saldo > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 20);
    const bajo = proys.filter(p => num(p.av) !== null && p.av < 0.3 && (num(p.pim) || 0) > 0).length;
    const ordered = all.slice().sort((a, b) => (kpi(b, y).ejec_inversion ?? -1) - (kpi(a, y).ejec_inversion ?? -1));
    el.innerHTML = `
      ${partialNote(y)}
      <div class="controls"><label>Año<select id="in-year">${yearOptions(y)}</select></label></div>
      <div class="kpis">
        ${kpiBox('PIM en activos (2.6)', fmtM(pimInv), 'todas las universidades', 'accent')}
        ${kpiBox('Devengado en activos', fmtM(devInv), 'ejecución ' + fmtP(div(devInv, pimInv)), 'ochre')}
        ${kpiBox('Saldo sin ejecutar', fmtM(num(pimInv) !== null && num(devInv) !== null ? pimInv - devInv : null), 'PIM − devengado')}
        ${kpiBox('Proyectos con presupuesto', fmtN(proys.length), y + '')}
        ${kpiBox('Proyectos con avance < 30 %', fmtN(proys.length ? bajo : null), 'avance financiero')}
        ${kpiBox('Peso de la inversión', fmtP(div(devInv, nacional(y).dev)), 'del devengado total')}
      </div>
      <div class="card">
        <h3>Ejecución de la inversión por universidad, ${esc(yearLbl(y))}</h3>
        <p class="sub">Devengado / PIM de la genérica 2.6 (adquisición de activos no financieros).</p>
        <div class="chart"><canvas id="ch-inv"></canvas></div>
      </div>
      <h3 style="margin:20px 0 8px">Top ${top.length || ''} proyectos con mayor saldo sin ejecutar</h3>
      ${top.length ? `<div class="table-wrap"><table><caption>Proyectos ordenados por saldo (PIM − devengado), ${esc(yearLbl(y))}</caption>
        <thead><tr><th class="txt" scope="col">Universidad</th><th class="txt" scope="col">Código</th><th class="txt" scope="col">Proyecto</th><th scope="col">PIM</th><th scope="col">Devengado</th><th scope="col">Saldo</th><th scope="col">Avance</th></tr></thead>
        <tbody>${top.map(p => `<tr><td class="txt"><a class="uni-link" href="#u=${encodeURIComponent(p.u.pliego)}">${esc(uName(p.u))}</a></td><td class="txt">${esc(p.codigo || SD)}</td><td class="wrap">${esc(p.nombre || SD)}</td><td>${esc(fmtM(num(p.pim)))}</td><td>${esc(fmtM(num(p.dev)))}</td><td><strong>${esc(fmtM(p.saldo))}</strong></td><td><span class="score"><b>${esc(fmtP(p.av, 0))}</b><span class="bar"><span style="width:${Math.max(0, Math.min(100, (p.av || 0) * 100))}%"></span></span></span></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="empty">Aún no hay datos de proyectos de inversión para este año.</p>'}`;
    $('#in-year', el).addEventListener('change', e => setYear(e.target.value));
    const vals = ordered.map(u => { const v = kpi(u, y).ejec_inversion; return v === null || v === undefined ? null : +(v * 100).toFixed(1); });
    sizeFor('ch-inv', ordered.length, isMobile() ? 26 : 22);
    mkChart('ch-inv', {
      type: 'bar',
      data: { labels: ordered.map(uName), datasets: [{ label: 'Ejecución de inversión', data: vals, borderRadius: 3,
        backgroundColor: vals.map(v => cssVar('--' + ({ good: 'good', warn: 'warn', bad: 'bad', na: 'line-strong' })[semaforo(v === null ? null : v / 100)])) }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttP, title: it => (ordered[it[0].dataIndex] || {}).nombre || it[0].label } } },
        scales: { x: { min: 0, max: 100, ticks: { callback: tickP } }, y: { ticks: { autoSkip: false } } },
      },
    }, 'Porcentaje de ejecución de la inversión por universidad');
  }

  // ================================================================== 7. INVESTIGACIÓN
  function renderIdi() {
    const el = $('#body-idi'); const y = S.year;
    const all = unisByPim(y);
    const pp = (u, yy = y) => pick((A(u, yy) || {}).programa, '0137') || {};
    const pimT = sum(all.map(u => pp(u).pim)), devT = sum(all.map(u => pp(u).dev));
    const pubsT = sum(all.map(u => (A(u, y) || {}).pubs));
    const devConPubs = sum(all.filter(u => num((A(u, y) || {}).pubs)).map(u => pp(u).dev));
    const ordered = all.slice().sort((a, b) => (num(pp(b).pim) || 0) - (num(pp(a).pim) || 0));
    el.innerHTML = `
      ${partialNote(y)}
      <div class="controls"><label>Año<select id="id-year">${yearOptions(y)}</select></label></div>
      <div class="kpis">
        ${kpiBox('PIM PP 0137', fmtM(pimT), 'asignado a CTI', 'accent')}
        ${kpiBox('Devengado PP 0137', fmtM(devT), 'ejecutado', 'ochre')}
        ${kpiBox('Ejecución I+D', fmtP(div(devT, pimT)), 'devengado / PIM')}
        ${kpiBox('% del gasto total', fmtP(div(devT, nacional(y).dev), 2), 'devengado I+D / devengado total')}
        ${kpiBox('Publicaciones', fmtN(pubsT), 'universidades con dato')}
        ${kpiBox('S/ por publicación', fmtS(div(devConPubs, pubsT)), 'devengado I+D / publicaciones')}
      </div>
      <div class="grid two">
        <div class="card">
          <h3>PP 0137: asignado vs ejecutado, ${esc(yearLbl(y))}</h3>
          <p class="sub">Millones de soles por universidad.</p>
          <div class="chart"><canvas id="ch-idi"></canvas></div>
        </div>
        <div class="card">
          <h3>Evolución del PP 0137 (todas)</h3>
          <p class="sub">PIM y devengado del programa de ciencia, tecnología e innovación.</p>
          <div class="chart"><canvas id="ch-idi-evo"></canvas></div>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table><caption>Investigación por universidad, ${esc(yearLbl(y))}</caption>
        <thead><tr><th class="txt sticky-col" scope="col">Universidad</th><th scope="col">PIM 0137</th><th scope="col">Devengado 0137</th><th scope="col">Ejec. I+D</th><th scope="col">% I+D del gasto</th><th scope="col">Publicaciones</th><th scope="col">S/ por publicación</th></tr></thead>
        <tbody>${ordered.map(u => { const k = kpi(u, y); return `<tr><td class="txt sticky-col">${uniLink(u)}</td><td>${esc(fmtM(num(pp(u).pim)))}</td><td>${esc(fmtM(num(pp(u).dev)))}</td><td>${pill(k.ejec_idi)}</td><td>${esc(fmtP(k.pct_idi, 2))}</td><td>${esc(fmtN((A(u, y) || {}).pubs))}</td><td>${esc(fmtS(k.idi_por_pub))}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="note">El costo por publicación es una aproximación: el PP 0137 financia también equipamiento, tesis y proyectos cuyos resultados se publican en años posteriores, y no todo el gasto en investigación se registra en el PP 0137 (también hay canon y fondos concursables externos).</p>`;
    $('#id-year', el).addEventListener('change', e => setYear(e.target.value));
    sizeFor('ch-idi', ordered.length, isMobile() ? 28 : 24);
    mkChart('ch-idi', {
      type: 'bar',
      data: { labels: ordered.map(uName), datasets: [
        { label: 'PIM 0137', data: ordered.map(u => mill(num(pp(u).pim))), backgroundColor: cssVar('--c-pim'), borderRadius: 3 },
        { label: 'Devengado 0137', data: ordered.map(u => mill(num(pp(u).dev))), backgroundColor: cssVar('--c-dev'), borderRadius: 3 },
      ] },
      options: {
        indexAxis: 'y', interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttM, title: it => (ordered[it[0].dataIndex] || {}).nombre || it[0].label } } },
        scales: { x: { ticks: { callback: tickM, maxTicksLimit: isMobile() ? 4 : 8 } }, y: { ticks: { autoSkip: false } } },
      },
    }, 'Presupuesto y ejecución del programa 0137 por universidad');
    const yrs = S.years;
    mkChart('ch-idi-evo', {
      type: 'line',
      data: { labels: yrs.map(String), datasets: [
        { label: 'PIM 0137', data: yrs.map(yy => mill(sum(S.unis.map(u => pp(u, yy).pim)))), borderColor: cssVar('--c-pim'), backgroundColor: cssVar('--c-pim'), tension: .25, pointRadius: 2 },
        { label: 'Devengado 0137', data: yrs.map(yy => mill(sum(S.unis.map(u => pp(u, yy).dev)))), borderColor: cssVar('--c-dev'), backgroundColor: cssVar('--c-dev'), tension: .25, pointRadius: 2,
          segment: { borderDash: ctx => (isPartial(yrs[ctx.p1DataIndex]) ? [5, 4] : undefined) } },
      ] },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttM, title: it => yearLbl(it[0].label) } } },
        scales: { y: { beginAtZero: true, ticks: { callback: tickM } } },
      },
    }, 'Evolución del programa 0137 del conjunto de universidades');
  }

  // ================================================================== 8. FICHA + COMPARADOR
  const IDX_COMP = [
    ['ejecucion', 'Ejecución'], ['inversion', 'Inversión'], ['investigacion', 'Investigación'],
    ['autonomia_rdr', 'Autonomía (RDR)'], ['eficiencia', 'Eficiencia I+D'],
  ];
  function renderFicha() {
    const el = $('#body-ficha'); const y = S.year;
    if (!S.ficha.uni || !uniBy(S.ficha.uni)) S.ficha.uni = (unisByPim(S.lastClosed)[0] || S.unis[0] || {}).pliego;
    const u = uniBy(S.ficha.uni);
    if (!u) { el.innerHTML = '<p class="empty">No hay universidades en los datos.</p>'; return; }
    const a = A(u, y) || {}; const k = kpi(u, y); const t = a.total || {};
    const idx = u.indice || {};
    if (!S.ficha.cmpInit && S.unis.length > 1) { S.ficha.cmpInit = true; }
    if (S.ficha.cmpInit === true && S.ficha.cmp.length === 0 && !S.ficha.cmpTouched) S.ficha.cmp = [unisByPim(S.lastClosed).find(x => x.pliego !== u.pliego)?.pliego].filter(Boolean);
    const cmpList = [u.pliego].concat(S.ficha.cmp.filter(p => p && p !== u.pliego && uniBy(p))).slice(0, 3).map(uniBy);
    const progs = a.programa ? Object.entries(a.programa) : [];
    const proys = Array.isArray(a.proyectos) ? a.proyectos : [];
    const link = location.href.split('#')[0] + '#u=' + encodeURIComponent(u.pliego);
    el.innerHTML = `
      <div class="controls">
        <label class="grow">Universidad<select id="fi-uni">${uniOptions(u.pliego)}</select></label>
        <label>Año<select id="fi-year">${yearOptions(y)}</select></label>
      </div>
      <div class="ficha-head">
        <div>
          <h3>${esc(u.nombre || uName(u))}</h3>
          <div class="tags">
            <span class="tag">${esc(uName(u))}</span>
            <span class="tag">Pliego ${esc(u.pliego)}</span>
            ${u.departamento ? `<span class="tag">${esc(u.departamento)}</span>` : ''}
            ${u.creacion ? `<span class="tag">Creación: ${esc(u.creacion)}</span>` : ''}
            ${u.licencia ? `<span class="tag">${esc(u.licencia)}</span>` : ''}
          </div>
        </div>
        <p class="share"><a href="${esc(link)}" id="fi-link">Enlace directo a esta ficha</a> <button type="button" class="btn" id="fi-copy">Copiar enlace</button></p>
      </div>
      ${partialNote(y)}
      <div class="kpis six">
        ${kpiBox('PIA ' + y, fmtM(num(t.pia)), '', 'accent')}
        ${kpiBox('PIM ' + y, fmtM(num(t.pim)), k.pim_vs_pia != null ? 'PIM/PIA ' + fmtP(k.pim_vs_pia, 0) : '', 'accent')}
        ${kpiBox('Devengado', fmtM(num(t.dev)), 'ejecución ' + fmtP(k.ejec), 'ochre')}
        ${kpiBox('Girado', fmtM(num(t.gir)), 'certificado ' + fmtM(num(t.cert)))}
        ${kpiBox('% Personal', fmtP(k.pct_personal), 'bienes y serv. ' + fmtP(k.pct_bys))}
        ${kpiBox('% Inversión', fmtP(k.pct_inversion), 'ejec. inversión ' + fmtP(k.ejec_inversion))}
        ${kpiBox('% I+D', fmtP(k.pct_idi, 2), 'ejec. I+D ' + fmtP(k.ejec_idi))}
        ${kpiBox('% RDR', fmtP(k.pct_rdr), 'recaudado/PIM ' + fmtP(k.rdr_recaudado_vs_pim))}
        ${kpiBox('S/ por estudiante', fmtS(k.gasto_por_estudiante), fmtN(a.estudiantes) + ' estudiantes')}
        ${kpiBox('Docentes', fmtN(a.docentes), num(a.estudiantes) && num(a.docentes) ? (a.estudiantes / a.docentes).toLocaleString(LOC, { maximumFractionDigits: 1 }) + ' est. por docente' : '')}
        ${kpiBox('Publicaciones', fmtN(a.pubs), 'S/ por pub. ' + fmtS(k.idi_por_pub))}
        ${kpiBox('Índice (referencial)', fmtScore(num(idx.score)), num(idx.rank) ? `puesto ${idx.rank} de ${S.unis.length}` : '', 'ochre')}
      </div>
      <div class="grid two">
        <div class="card"><h3>PIA, PIM y devengado</h3><p class="sub">Millones de soles por año.</p><div class="chart"><canvas id="ch-fi-ser"></canvas></div></div>
        <div class="card"><h3>Ejecución anual</h3><p class="sub">Total, inversión e I+D (devengado / PIM).</p><div class="chart"><canvas id="ch-fi-ejec"></canvas></div></div>
        <div class="card"><h3>Gasto por genérica</h3><p class="sub">Devengado, millones de soles.</p><div class="chart"><canvas id="ch-fi-gen"></canvas></div>${legendHtml(GENERICAS)}</div>
        <div class="card"><h3>Fuentes de financiamiento</h3><p class="sub">PIM, millones de soles.</p><div class="chart"><canvas id="ch-fi-fue"></canvas></div>${legendHtml(FUENTES.filter(c => S.years.some(yy => pick((A(u, yy) || {}).fuente, c.frag))))}</div>
      </div>
      <div class="grid two" style="margin-top:12px">
        <div class="card"><h3>Programas presupuestales, ${esc(y)}</h3>
          ${progs.length ? `<div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Programa</th><th scope="col">PIM</th><th scope="col">Devengado</th><th scope="col">Ejec.</th></tr></thead><tbody>${progs.map(([n, v]) => `<tr><td class="wrap">${esc(n)}</td><td>${esc(fmtM(num(v && v.pim)))}</td><td>${esc(fmtM(num(v && v.dev)))}</td><td>${pill(div(v && v.dev, v && v.pim))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sin datos por programa.</p>'}
        </div>
        <div class="card"><h3>Transferencias y normas, ${esc(y)}</h3>${transfersHtml(a.transferencias)}</div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Proyectos de inversión, ${esc(y)}</h3>
        ${proys.length ? `<div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Código</th><th class="txt" scope="col">Proyecto</th><th scope="col">PIA</th><th scope="col">PIM</th><th scope="col">Devengado</th><th scope="col">Avance</th></tr></thead><tbody>${proys.slice().sort((p, q) => (num(q.pim) || 0) - (num(p.pim) || 0)).map(p => `<tr><td class="txt">${esc(p.codigo || SD)}</td><td class="wrap">${esc(p.nombre || SD)}</td><td>${esc(fmtM(num(p.pia)))}</td><td>${esc(fmtM(num(p.pim)))}</td><td>${esc(fmtM(num(p.dev)))}</td><td>${pill(div(p.dev, p.pim))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sin proyectos de inversión registrados este año.</p>'}
      </div>

      <h3 style="margin:24px 0 8px">Comparador</h3>
      <div class="controls">
        <label>Universidad A<select disabled aria-readonly="true"><option>${esc(uName(u))}</option></select></label>
        <label>Universidad B<select id="fi-c1">${uniOptions(S.ficha.cmp[0] || '', '— ninguna —')}</select></label>
        <label>Universidad C<select id="fi-c2">${uniOptions(S.ficha.cmp[1] || '', '— ninguna —')}</select></label>
      </div>
      <div class="grid two">
        <div class="card"><h3>Componentes del índice (0–100)</h3><p class="sub">Referencial, no oficial. Más alto = mejor posición relativa.</p><div class="chart sq"><canvas id="ch-radar"></canvas></div></div>
        <div class="card"><h3>Indicadores ${esc(yearLbl(y))}</h3>
          <div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Indicador</th>${cmpList.map(x => `<th scope="col">${esc(uName(x))}</th>`).join('')}</tr></thead><tbody>
          ${[['PIM', x => fmtM(tot(x, y, 'pim'))], ['Devengado', x => fmtM(tot(x, y, 'dev'))], ['% Ejecución', x => fmtP(kpi(x, y).ejec)], ['% Personal', x => fmtP(kpi(x, y).pct_personal)], ['% Inversión', x => fmtP(kpi(x, y).pct_inversion)], ['Ejec. inversión', x => fmtP(kpi(x, y).ejec_inversion)], ['% I+D', x => fmtP(kpi(x, y).pct_idi, 2)], ['% RDR', x => fmtP(kpi(x, y).pct_rdr)], ['S/ por estudiante', x => fmtS(kpi(x, y).gasto_por_estudiante)], ['S/ por publicación', x => fmtS(kpi(x, y).idi_por_pub)], ['Índice', x => fmtScore(num(x.indice && x.indice.score))]]
            .map(([l, f]) => `<tr><td class="txt">${esc(l)}</td>${cmpList.map(x => `<td>${esc(f(x))}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;

    $('#fi-uni', el).addEventListener('change', e => selectUni(e.target.value, false));
    $('#fi-year', el).addEventListener('change', e => setYear(e.target.value));
    const onCmp = () => { S.ficha.cmpTouched = true; S.ficha.cmp = [$('#fi-c1', el).value, $('#fi-c2', el).value].filter(Boolean); renderFicha(); };
    $('#fi-c1', el).addEventListener('change', onCmp);
    $('#fi-c2', el).addEventListener('change', onCmp);
    $('#fi-copy', el).addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copiado'; }
      catch (err) { e.target.textContent = 'Copia el enlace de la izquierda'; }
      setTimeout(() => { e.target.textContent = 'Copiar enlace'; }, 2200);
    });

    const yrs = S.years;
    const tt = { callbacks: { label: ttM, title: it => yearLbl(it[0].label) } };
    mkChart('ch-fi-ser', {
      type: 'line',
      data: { labels: yrs.map(String), datasets: [
        { label: 'PIA', data: yrs.map(yy => mill(tot(u, yy, 'pia'))), borderColor: cssVar('--c-pia'), backgroundColor: cssVar('--c-pia'), tension: .25, pointRadius: 2 },
        { label: 'PIM', data: yrs.map(yy => mill(tot(u, yy, 'pim'))), borderColor: cssVar('--c-pim'), backgroundColor: cssVar('--c-pim'), borderWidth: 2.5, tension: .25, pointRadius: 2 },
        { label: 'Devengado', data: yrs.map(yy => mill(tot(u, yy, 'dev'))), borderColor: cssVar('--c-dev'), backgroundColor: cssVar('--c-dev'), borderWidth: 2.5, tension: .25, pointRadius: 2, segment: { borderDash: ctx => (isPartial(yrs[ctx.p1DataIndex]) ? [5, 4] : undefined) } },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: tt }, scales: { y: { beginAtZero: true, ticks: { callback: tickM } } } },
    }, `Serie de PIA, PIM y devengado de ${uName(u)}`);
    const pctSer = f => yrs.map(yy => { const v = kpi(u, yy)[f]; return num(v) === null ? null : +(v * 100).toFixed(1); });
    mkChart('ch-fi-ejec', {
      type: 'line',
      data: { labels: yrs.map(String), datasets: [
        { label: 'Total', data: pctSer('ejec'), borderColor: cssVar('--c-pim'), backgroundColor: cssVar('--c-pim'), borderWidth: 2.5, tension: .25, pointRadius: 2 },
        { label: 'Inversión', data: pctSer('ejec_inversion'), borderColor: cssVar('--k5'), backgroundColor: cssVar('--k5'), tension: .25, pointRadius: 2 },
        { label: 'I+D (0137)', data: pctSer('ejec_idi'), borderColor: cssVar('--c-dev'), backgroundColor: cssVar('--c-dev'), tension: .25, pointRadius: 2 },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttP, title: it => yearLbl(it[0].label) } } }, scales: { y: { min: 0, max: 100, ticks: { callback: tickP } } } },
    }, `Ejecución anual de ${uName(u)}`);
    const stackSer = (field, cats, m) => cats.map(c => ({ label: c.lbl, backgroundColor: cssVar(c.c), data: yrs.map(yy => mill(num((pick((A(u, yy) || {})[field], c.frag) || {})[m]))) }));
    const stackOpts = { interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: tt }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: tickM } } } };
    mkChart('ch-fi-gen', { type: 'bar', data: { labels: yrs.map(String), datasets: stackSer('generica', GENERICAS, 'dev') }, options: stackOpts }, `Gasto por genérica de ${uName(u)}`);
    mkChart('ch-fi-fue', { type: 'bar', data: { labels: yrs.map(String), datasets: stackSer('fuente', FUENTES.filter(c => yrs.some(yy => pick((A(u, yy) || {}).fuente, c.frag))), 'pim') }, options: stackOpts }, `Fuentes de financiamiento de ${uName(u)}`);

    const pal = ['--c-pim', '--c-dev', '--k5'];
    mkChart('ch-radar', {
      type: 'radar',
      data: { labels: IDX_COMP.map(c => c[1]), datasets: cmpList.map((x, i) => {
        const col = cssVar(pal[i]);
        return { label: uName(x), data: IDX_COMP.map(c => num(((x.indice || {}).componentes || {})[c[0]])), borderColor: col, backgroundColor: col + '33', pointBackgroundColor: col, borderWidth: 2, spanGaps: true };
      }) },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${num(ctx.raw) === null ? SD : fmtScore(ctx.raw)}` } } },
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' }, grid: { color: cssVar('--line') }, angleLines: { color: cssVar('--line') }, pointLabels: { font: { size: isMobile() ? 10 : 12 } } } },
      },
    }, 'Comparación de componentes del índice entre universidades');
  }
  function selectUni(p, scroll) {
    if (!uniBy(p)) return;
    S.ficha.uni = String(p);
    S.ficha.cmp = S.ficha.cmp.filter(x => x !== String(p));
    const h = '#u=' + encodeURIComponent(p);
    if (location.hash !== h) history.replaceState(null, '', h);
    if (S.rendered.has('ficha')) renderFicha();
    if (scroll) { const sec = $('#ficha'); if (sec) sec.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }

  // ================================================================== 9. MAPA
  let leafletLoading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((res, rej) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = () => res(); s.onerror = () => rej(new Error('leaflet'));
      document.head.appendChild(s);
    });
    return leafletLoading;
  }
  function renderMapa() {
    const el = $('#body-mapa'); const y = S.year;
    if (!$('#map', el)) {
      el.innerHTML = `
        <div class="controls"><label>Año<select id="mp-year">${yearOptions(y)}</select></label></div>
        <div id="mp-partial"></div>
        <div id="map" role="region" aria-label="Mapa de universidades públicas"></div>
        <ul class="legend" id="mp-legend"></ul>
        <p class="note">Las universidades sin coordenadas no aparecen en el mapa. Toca un círculo para ver el detalle.</p>`;
      $('#mp-year', el).addEventListener('change', e => setYear(e.target.value));
    } else {
      $('#mp-year', el).innerHTML = yearOptions(y);
    }
    $('#mp-partial', el).innerHTML = partialNote(y);
    $('#mp-legend', el).innerHTML = [['good', 'Ejecución ≥ 90 %'], ['warn', '75–90 %'], ['bad', '< 75 %'], ['line-strong', 's/d']]
      .map(([c, l]) => `<li><i style="background:${cssVar('--' + c)};border-radius:50%"></i>${esc(l)}</li>`).join('') + '<li>Tamaño = PIM</li>';
    loadLeaflet().then(drawMap).catch(() => { $('#map', el).innerHTML = '<p class="empty">No se pudo cargar el mapa. Revisa tu conexión.</p>'; });
  }
  function drawMap() {
    const L = window.L; const y = S.year;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!S.map) {
      S.map = L.map('map', { scrollWheelZoom: false, zoomControl: true }).setView([-9.3, -75.0], isMobile() ? 4 : 5);
    }
    const tileUrl = `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
    if (!S.tiles || S.tiles._url !== tileUrl) {
      if (S.tiles) S.map.removeLayer(S.tiles);
      S.tiles = L.tileLayer(tileUrl, { maxZoom: 18, subdomains: 'abcd', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' }).addTo(S.map);
    }
    if (S.mapLayer) S.map.removeLayer(S.mapLayer);
    S.mapLayer = L.layerGroup().addTo(S.map);
    const pts = S.unis.filter(u => num(u.lat) !== null && num(u.lng) !== null && A(u, y));
    const maxPim = Math.max(1, ...pts.map(u => tot(u, y, 'pim') || 0));
    pts.sort((a, b) => (tot(b, y, 'pim') || 0) - (tot(a, y, 'pim') || 0)).forEach(u => {
      const k = kpi(u, y);
      const col = cssVar('--' + ({ good: 'good', warn: 'warn', bad: 'bad', na: 'line-strong' })[semaforo(k.ejec)]);
      const r = 5 + 28 * Math.sqrt((tot(u, y, 'pim') || 0) / maxPim);
      L.circleMarker([u.lat, u.lng], { radius: r, color: col, weight: 1.5, fillColor: col, fillOpacity: .45 })
        .bindPopup(`<strong>${esc(u.nombre || uName(u))}</strong><br>${esc(u.departamento || '')}<br>PIM ${esc(y)}: <b>${esc(fmtM(tot(u, y, 'pim')))}</b><br>Devengado: ${esc(fmtM(tot(u, y, 'dev')))}<br>Ejecución: <b>${esc(fmtP(k.ejec))}</b><br><a href="#u=${encodeURIComponent(u.pliego)}">Ver ficha →</a>`)
        .bindTooltip(esc(uName(u)))
        .addTo(S.mapLayer);
    });
    setTimeout(() => S.map.invalidateSize(), 50);
  }

  // ================================================================== 10. METODOLOGÍA
  function renderMetodologia() {
    const d = S.data;
    const fu = Array.isArray(d.fuentes) && d.fuentes.length ? d.fuentes : [
      { nombre: 'MEF — Consulta Amigable (Transparencia Económica)', url: 'https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx' },
      { nombre: 'MEF — Plataforma de Datos Abiertos', url: 'https://datosabiertos.mef.gob.pe/' },
    ];
    $('#met-fuentes').innerHTML = fu.map(f => { const u = safeUrl(f.url); return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(f.nombre || u)}</a>` : esc(f.nombre)}${f.nota ? ` — <span class="muted">${esc(f.nota)}</span>` : ''}</li>`; }).join('');
    if (Array.isArray(d.notas) && d.notas.length) {
      $('#met-notas').insertAdjacentHTML('afterbegin', d.notas.map(n => `<li><strong>${esc(n)}</strong></li>`).join(''));
    }
    // Normativa: data.normativa + transferencias con norma
    const norm = Array.isArray(d.normativa) ? d.normativa.slice() : [];
    const tr = [];
    S.unis.forEach(u => S.years.forEach(y => ((A(u, y) || {}).transferencias || []).forEach(t => tr.push(Object.assign({ u, y }, t)))));
    tr.sort((a, b) => String(b.fecha || b.y).localeCompare(String(a.fecha || a.y)));
    const normHtml = norm.length ? '<ul class="tlist">' + norm.map(n => {
      const u = safeUrl(n.url);
      const title = u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n.norma || n.titulo || 'Documento')}</a>` : esc(n.norma || n.titulo || 'Documento');
      return `<li><span class="t-top"><span><strong>${title}</strong>${n.tipo ? ` <span class="pill na">${esc(n.tipo)}</span>` : ''}</span><span class="muted small">${esc(n.fecha || '')}</span></span>${n.titulo && n.norma ? `<span class="t-fin">${esc(n.titulo)}</span>` : ''}${n.resumen ? `<span class="t-fin">${esc(n.resumen)}</span>` : ''}</li>`;
    }).join('') + '</ul>' : '<p class="empty">El listado de leyes y normas se completará con la integración de datos.</p>';
    const trHtml = tr.length ? `
      <h3>Transferencias y modificaciones registradas (${tr.length})</h3>
      <div class="controls"><label class="grow">Filtrar<input type="search" id="met-q" placeholder="Norma, universidad o finalidad" autocomplete="off"></label></div>
      <div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Fecha</th><th class="txt" scope="col">Norma</th><th class="txt" scope="col">Universidad</th><th scope="col">Monto</th><th class="txt" scope="col">Finalidad</th></tr></thead><tbody id="met-tr"></tbody></table></div>` : '';
    $('#met-normativa').innerHTML = normHtml + trHtml;
    const drawTr = q => {
      const qq = (q || '').toLowerCase();
      const rows = tr.filter(t => !qq || [t.norma, t.finalidad, t.u.nombre, t.u.corto].join(' ').toLowerCase().includes(qq)).slice(0, 300);
      $('#met-tr').innerHTML = rows.map(t => { const u = safeUrl(t.url); return `<tr><td class="txt">${esc(t.fecha || t.y)}</td><td class="txt">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t.norma || 'Norma')}</a>` : esc(t.norma || SD)}</td><td class="txt"><a class="uni-link" href="#u=${encodeURIComponent(t.u.pliego)}">${esc(uName(t.u))}</a></td><td>${esc(fmtM(num(t.monto)))}</td><td class="wrap">${esc(t.finalidad || '')}</td></tr>`; }).join('') || `<tr><td colspan="5" class="txt muted">Sin resultados.</td></tr>`;
    };
    if (tr.length) { drawTr(''); $('#met-q').addEventListener('input', debounce(e => drawTr(e.target.value))); }
    $('#met-generado').textContent = `Datos generados: ${d.generado || SD}. Años cubiertos: ${S.years[0]}–${S.years[S.years.length - 1]}.`;
  }

  // ================================================================== registro / lazy render
  const SECTIONS = {
    resumen: renderResumen, ranking: renderRanking, trayectoria: renderTrayectoria, gasto: renderGasto,
    fuentes: renderFuentes, infra: renderInfra, idi: renderIdi, ficha: renderFicha, mapa: renderMapa,
    metodologia: renderMetodologia,
  };
  const YEAR_DEPENDENT = ['ranking', 'trayectoria', 'gasto', 'fuentes', 'infra', 'idi', 'ficha', 'mapa'];

  function safeRender(id) {
    try { SECTIONS[id](); }
    catch (err) {
      console.error('Error al dibujar', id, err);
      const b = document.getElementById('body-' + id);
      if (b) b.innerHTML = '<p class="empty">No se pudo dibujar esta sección con los datos disponibles.</p>';
    }
  }
  function renderSection(id) {
    if (!SECTIONS[id]) return;
    S.rendered.add(id);
    safeRender(id);
  }
  function setupLazy() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { const id = en.target.id; io.unobserve(en.target); if (!S.rendered.has(id)) renderSection(id); }
      });
    }, { rootMargin: '300px 0px' });
    $$('section[data-sec]').forEach(s => io.observe(s));
  }
  function setYear(y) {
    y = String(y);
    if (!S.years.map(String).includes(y)) return;
    S.year = y;
    $('#year-global').value = y;
    YEAR_DEPENDENT.forEach(id => { if (S.rendered.has(id)) safeRender(id); });
  }
  function rerenderAll() {
    chartTheme();
    S.rendered.forEach(id => { if (id !== 'metodologia') safeRender(id); });
  }

  // ------------------------------------------------------------------ scrollspy
  function setupScrollspy() {
    const links = new Map($$('#nav a').map(a => [a.getAttribute('href').slice(1), a]));
    const vis = new Map();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => vis.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null, br = 0;
      $$('section[data-sec]').forEach(s => { const r = vis.get(s.id) || 0; if (r > br) { br = r; best = s.id; } });
      if (!best) return;
      links.forEach((a, id) => { if (id === best) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      const a = links.get(best);
      const ol = a && a.closest('ol');
      if (ol && ol.scrollWidth > ol.clientWidth) {
        const left = a.offsetLeft - ol.clientWidth / 2 + a.clientWidth / 2;
        ol.scrollTo({ left, behavior: 'smooth' });
      }
    }, { rootMargin: '-110px 0px -45% 0px', threshold: [0, .05, .15, .3, .5] });
    $$('section[data-sec]').forEach(s => io.observe(s));
  }

  // ------------------------------------------------------------------ tema
  function setupTheme() {
    const btn = $('#theme-toggle');
    const sync = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'Activar tema claro' : 'Activar tema oscuro');
    };
    sync();
    btn.addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('rp-theme', dark ? 'dark' : 'light'); } catch (e) { /* sin storage */ }
      sync();
      if (S.data) rerenderAll();
    });
  }

  // ------------------------------------------------------------------ hash (#u=514)
  function handleHash() {
    const m = /^#u=([^&]+)/.exec(location.hash);
    if (!m) return;
    const p = decodeURIComponent(m[1]);
    if (!uniBy(p)) return;
    S.ficha.uni = p;
    if (!S.rendered.has('ficha')) renderSection('ficha'); else renderFicha();
    const sec = $('#ficha');
    if (sec) requestAnimationFrame(() => sec.scrollIntoView({ behavior: 'auto' }));
  }

  // ------------------------------------------------------------------ carga de datos
  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
    return r.json();
  }
  function normalize(d) {
    if (!d || !Array.isArray(d.universidades)) throw new Error('Formato inválido');
    S.data = d;
    S.unis = d.universidades.filter(u => u && u.pliego != null).map(u => Object.assign({}, u, { pliego: String(u.pliego), anios: u.anios || {} }));
    const ys = new Set((Array.isArray(d.anios) ? d.anios : []).map(Number).filter(Boolean));
    S.unis.forEach(u => Object.keys(u.anios).forEach(y => ys.add(Number(y))));
    S.years = [...ys].filter(y => y > 1990 && y < 2100).sort((a, b) => a - b).map(String);
    S.partial = d.parcial && typeof d.parcial === 'object' ? d.parcial : {};
    const withData = S.years.filter(y => S.unis.some(u => A(u, y)));
    const closed = withData.filter(y => !isPartial(y));
    S.lastClosed = closed[closed.length - 1] || withData[withData.length - 1] || S.years[S.years.length - 1];
    S.year = S.lastClosed;
  }
  function showBanner(html, cls) {
    const b = $('#data-banner');
    b.innerHTML = html; b.className = 'banner' + (cls ? ' ' + cls : ''); b.hidden = false;
  }

  async function init() {
    setupTheme();
    let d = null;
    try { d = await fetchJson('data/observatorio.json'); }
    catch (e) {
      try { d = await fetchJson('data/sample/observatorio.json'); S.sample = true; }
      catch (e2) {
        showBanner('<strong>No se pudieron cargar los datos.</strong> Si abriste el archivo directamente, sírvelo con un servidor local (por ejemplo <code>python3 -m http.server</code>).', 'error');
        $$('.sec-body .skeleton').forEach(s => s.remove());
        return;
      }
    }
    try { normalize(d); }
    catch (e) {
      showBanner('<strong>Los datos tienen un formato inesperado.</strong> ' + esc(e.message), 'error');
      return;
    }
    if (S.sample || d.ejemplo) {
      showBanner('<strong>Datos de ejemplo.</strong> Estás viendo cifras ficticias para probar la página; aún no se publican los datos reales del MEF. No las uses para sacar conclusiones.');
    }
    chartTheme();
    const ysel = $('#year-global');
    ysel.innerHTML = yearOptions(S.year);
    ysel.addEventListener('change', e => setYear(e.target.value));
    $('#hero-meta').textContent = `${S.unis.length} universidades · ${S.years[0]}–${S.years[S.years.length - 1]} · último año cerrado: ${S.lastClosed}${d.generado ? ' · actualizado: ' + String(d.generado).slice(0, 10) : ''}`;

    // Re-dibujo en cambios de ancho que alteran alturas (móvil ↔ escritorio)
    let wasMobile = isMobile();
    window.addEventListener('resize', debounce(() => {
      if (isMobile() !== wasMobile) { wasMobile = isMobile(); rerenderAll(); }
    }, 250));
    window.addEventListener('hashchange', handleHash);

    setupLazy();
    setupScrollspy();
    // Impresión o ?completo: dibujar todas las secciones de una vez
    const renderAll = () => Object.keys(SECTIONS).forEach(id => { if (!S.rendered.has(id)) renderSection(id); });
    window.addEventListener('beforeprint', renderAll);
    if (/[?&]completo\b/.test(location.search)) renderAll();
    handleHash();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
