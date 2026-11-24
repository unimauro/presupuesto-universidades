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

  // ---- Formateador adaptativo de montos (único para todo el sitio)
  //  ≥ 1 000 M → "S/ 7.7 mil M" · ≥ 1 M → "S/ 53.4 M" (sin decimal si ≥ 100 M) · ≥ 1 000 → "S/ 850 mil" · menor → "S/ 850"
  const nf = (x, d) => x.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
  function soles(v) {
    if (num(v) === null) return SD;
    const a = Math.abs(v), sg = v < 0 ? '−' : '';
    if (a >= 1e9) return `${sg}S/ ${nf(a / 1e9, a >= 1e11 ? 0 : 1)} mil M`;
    if (a >= 1e6) return `${sg}S/ ${nf(a / 1e6, a >= 1e8 ? 0 : 1)} M`;
    if (a >= 1e3) return `${sg}S/ ${nf(a / 1e3, a >= 1e5 ? 0 : 1)} mil`;
    return `${sg}S/ ${nf(a, 0)}`;
  }
  const fmtM = soles;
  const fmtS = soles; // costos unitarios: "S/ 20.4 mil"
  const BASE_CHICA = 10e6; // base < S/ 10 M → "base pequeña"
  const fmtN = v => num(v) === null ? SD : Math.round(v).toLocaleString(LOC);
  // Porcentajes: ≥ 100 % sin decimales; < 100 % con d decimales (1 por defecto)
  const fmtP = (v, d = 1) => { if (num(v) === null) return SD; const x = v * 100; return nf(x, Math.abs(x) >= 100 ? 0 : d) + ' %'; };
  // Variaciones: ≥ +1 000 % se expresa en veces ("×11.5"); ≥ 100 % sin decimales; < 100 % un decimal
  const fmtChg = v => {
    if (num(v) === null) return SD;
    if (v >= 10) return '×' + nf(1 + v, (1 + v) >= 100 ? 0 : 1);
    const x = v * 100, sg = x > 0 ? '+' : x < 0 ? '−' : '';
    return sg + nf(Math.abs(x), Math.abs(x) >= 100 ? 0 : 1) + ' %';
  };
  const fmtSigned = v => num(v) === null ? SD : (v >= 0 ? '+' : '−') + fmtM(Math.abs(v));
  const baseChip = '<span class="tag chica" title="Base menor a S/ 10 M en el año inicial: los porcentajes exageran">base pequeña</span>';
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
    { frag: '2.1', lbl: 'Personal y obligaciones sociales', c: '--g1' },
    { frag: '2.2', lbl: 'Pensiones y prestaciones', c: '--g2' },
    { frag: '2.3', lbl: 'Bienes y servicios', c: '--g3' },
    { frag: '2.4', lbl: 'Donaciones y transferencias', c: '--g6' },
    { frag: '2.5', lbl: 'Otros gastos', c: '--g4' },
    { frag: '2.6', lbl: 'Activos no financieros (inversión)', c: '--g5' },
    { frag: '2.8', lbl: 'Servicio de la deuda', c: '--g7' },
  ];
  const FUENTES = [
    { frag: 'ORDINARIOS', lbl: 'Recursos ordinarios (RO)', c: '--f1' },
    { frag: 'DIRECTAMENTE', lbl: 'Recursos directamente recaudados (RDR)', c: '--f2' },
    { frag: 'DETERMINADOS', lbl: 'Recursos determinados (canon, regalías)', c: '--f3' },
    { frag: 'DONACIONES', lbl: 'Donaciones y transferencias', c: '--f4' },
    { frag: 'OPERACIONES OFICIALES', lbl: 'Operaciones oficiales de crédito', c: '--f5' },
  ];

  // ------------------------------------------------------------------ estado
  const S = {
    data: null, sample: false, unis: [], years: [], partial: {}, lastClosed: null, year: null,
    rendered: new Set(), charts: new Map(),
    rank: { q: '', dep: '', sort: 'pim', dir: -1, all: false, mcol: 'pim' },
    top: 15,
    tray: { uni: null, order: 'pim', n: 15, hl: '' },
    gasto: { metric: 'dev', uni: '' },
    fuentes: { metric: 'pim', uni: '' },
    ficha: { uni: null, cmp: [] },
    exp: { sort: 'var', dir: -1, q: '' },
    vr: { a: null, b: null, m: 'dev', real: true, sort: 'dv', dir: -1, q: '', comp: 'generica', order: 'pct' },
    map: null, mapLayer: null, tiles: null,
  };
  const kpiCache = new Map();

  const isPartial = y => Object.prototype.hasOwnProperty.call(S.partial, String(y));
  const yearLbl = y => { y = String(y).replace(/\D/g, ''); return isPartial(y) ? `${y} (parcial, ${S.partial[String(y)]})` : y; };
  // Etiqueta de eje con * para el año parcial, y color atenuado para sus barras
  const yTick = y => String(y) + (isPartial(y) ? '*' : '');
  const fadeFor = (yrs, color) => yrs.map(y => isPartial(y) ? color + '73' : color);
  const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s(“"'.-])([a-záéíóúñü])/g, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|E|En|Para|Por)\b/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase());
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
    const p0137 = idiOf(a);
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
  // I+D: PP 0137 si existe en "programa"; si no, kpi.idi_pim / kpi.idi_dev
  function idiOf(a) {
    const p = pick(a && a.programa, '0137');
    if (p) return p;
    const k = (a && a.kpi) || {};
    return { pim: num(k.idi_pim), dev: num(k.idi_dev) };
  }
  const GEN_KPI = { '2.1': 'pct_personal', '2.2': 'pct_pensiones', '2.3': 'pct_bys', '2.6': 'pct_inversion' };
  function genDev(u, y, frag) {
    const a = A(u, y); if (!a) return null;
    const g = pick(a.generica, frag);
    if (g && num(g.dev) !== null) return g.dev;
    if (a.generica) return null;
    const k = (a.kpi || {})[GEN_KPI[frag]]; const d = num((a.total || {}).dev);
    return (num(k) !== null && d !== null) ? k * d : null;
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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    C.defaults.font.family = cssVar('--font-cifras') || cssVar('--font') || 'system-ui';
    C.defaults.font.size = 12;
    C.defaults.color = cssVar('--muted');
    C.defaults.borderColor = cssVar('--line');
    // Leyendas como chips
    Object.assign(C.defaults.plugins.legend.labels, { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 14, font: { weight: 600, size: 12 } });
    C.defaults.plugins.legend.position = 'bottom';
    // Tooltips claros y táctiles
    Object.assign(C.defaults.plugins.tooltip, {
      backgroundColor: cssVar('--surface'), titleColor: cssVar('--ink'), bodyColor: cssVar('--ink'), footerColor: cssVar('--muted'),
      borderColor: cssVar('--line-strong'), borderWidth: 1, padding: 12, cornerRadius: 12, boxPadding: 5, usePointStyle: true,
      titleFont: { weight: 700, size: 13 }, bodyFont: { size: 12.5 }, caretSize: 6,
    });
    // Rejilla sutil, sin bordes de eje; sin rejilla en el eje de categorías
    C.defaults.scale.grid.color = cssVar('--line');
    C.defaults.scale.grid.drawTicks = false;
    C.defaults.scale.border = Object.assign(C.defaults.scale.border || {}, { display: false });
    C.defaults.scale.ticks.padding = 8;
    if (C.defaults.scales && C.defaults.scales.category) C.defaults.scales.category.grid = Object.assign(C.defaults.scales.category.grid || {}, { display: false });
    // Barras redondeadas, líneas suaves
    C.defaults.elements.bar.borderRadius = 6;
    C.defaults.elements.bar.borderSkipped = 'start';
    C.defaults.datasets.bar.maxBarThickness = 26;
    C.defaults.elements.line.tension = 0.35;
    C.defaults.elements.line.borderWidth = 2.5;
    C.defaults.elements.point.radius = 0;
    C.defaults.elements.point.hoverRadius = 5;
    C.defaults.elements.point.hitRadius = 14;
    C.defaults.animation = reduce ? false : { duration: 700, easing: 'easeOutQuart' };
    // Los degradados (CanvasGradient) no se pueden interpolar como color
    if (C.defaults.animations) C.defaults.animations.colors = false;
    C.defaults.maintainAspectRatio = false;
    if (!C.registry.plugins.get('valueLabel')) C.register(valueLabelPlugin);
    C.defaults.responsive = true;
  }
  // Degradado vertical bajo una línea (áreas suaves)
  // Área plana translúcida bajo una línea (el sistema visual no usa degradados)
  const areaFill = (cssName, alpha = 0.14) => cssVar(cssName) + Math.round(alpha * 255).toString(16).padStart(2, '0');
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
    const ds = (cfg.data && cfg.data.datasets) || [];
    const hasData = ds.some(d => (d.data || []).some(v => num(v) !== null));
    if (!hasData) {
      cv.parentElement.style.height = 'auto';
      cv.parentElement.innerHTML = `<p class="empty" id="${esc(id)}">Aún no hay datos para este gráfico.</p>`;
      return null;
    }
    const ch = new window.Chart(cv, cfg);
    S.charts.set(id, ch);
    return ch;
  }
  const tickM = v => soles(Number(v) * 1e6);
  const tickP = v => v + ' %';
  const ttM = ctx => `${ctx.dataset.label}: ${fmtM(num(ctx.raw) === null ? null : ctx.raw * 1e6)}`;
  const ttP = ctx => `${ctx.dataset.label}: ${num(ctx.raw) === null ? SD : fmtP(ctx.raw / 100)}`;
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
      `<option value="${esc(u.pliego)}"${String(u.pliego) === String(sel) ? ' selected' : ''}>${esc(uName(u))} · ${esc(titleCase(u.nombre || ''))}</option>`).join('');
  const kpiBox = (lbl, val, note, cls = '') => `<div class="kpi ${cls}"><span class="k-lbl">${esc(lbl)}</span><span class="k-val">${esc(val)}</span>${note ? `<span class="k-note">${esc(note)}</span>` : ''}</div>`;
  const partialNote = y => isPartial(y) ? `<p class="note warn"><strong>${esc(y)} es un año en curso</strong> (${esc(S.partial[String(y)])}): el devengado y la ejecución son parciales y no comparables con años cerrados.</p>` : '';
  const seg = (name, opts, cur) => `<div class="seg" role="group" aria-label="${esc(name)}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join('')}</div>`;
  const legendHtml = items => `<ul class="legend">${items.map(i => `<li><i style="background:${cssVar(i.c)}"></i>${esc(i.lbl)}</li>`).join('')}</ul>`;
  const uniLink = u => `<a class="uni-link" title="${esc(u.nombre || '')}" href="#u=${encodeURIComponent(u.pliego)}">${esc(uName(u))}</a><span class="uni-sub">${esc(u.nombre || '')}${u.departamento ? ' · ' + esc(u.departamento) : ''}</span>`;

  // Control "Top 15 / Todas" compartido por los gráficos por universidad
  const lim = arr => (S.top > 0 ? arr.slice(0, S.top) : arr.slice());
  const topSeg = n => n > 15 ? `<div class="seg" data-top role="group" aria-label="Cantidad de universidades">${[['15', 'Top 15'], ['0', `Todas (${n})`]].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(S.top) === v}">${esc(l)}</button>`).join('')}</div>` : '';
  const limNote = (shown, n) => shown < n ? `Mostrando ${shown} de ${n} (las de mayor PIM).` : '';
  document.addEventListener('click', e => {
    const b = e.target.closest('.seg[data-top] button[data-v]'); if (!b) return;
    S.top = +b.dataset.v;
    ['trayectoria', 'gasto', 'fuentes', 'infra', 'idi'].forEach(id => { if (S.rendered.has(id)) safeRender(id); });
  });
  function bindSeg(root, cb) {
    $$('.seg:not([data-top])', root).forEach(g => g.addEventListener('click', e => {
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
    const idiDev = sum(S.unis.map(u => idiOf(A(u, y)).dev));
    const inv = sum(S.unis.map(u => genDev(u, y, '2.6')));
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
        ${div(idiDev, n.dev) !== null && idiDev > 0
          ? kpiBox('% a I+D (PP 0137)', fmtP(div(idiDev, n.dev), 2), 'inversión: ' + fmtP(div(inv, n.dev)))
          : kpiBox('% a personal', fmtP(div(sum(S.unis.map(u => genDev(u, y, '2.1'))), n.dev)), 'inversión: ' + fmtP(div(inv, n.dev)))}
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
        labels: yrs.map(yTick),
        datasets: [
          { label: 'PIA', data: ser('pia'), borderColor: cssVar('--c-pia'), backgroundColor: cssVar('--c-pia'), borderWidth: 2, borderDash: [5, 4], segment: dashPartial },
          { label: 'PIM', data: ser('pim'), borderColor: cssVar('--c-pim'), backgroundColor: areaFill('--c-pim', 0.18), pointBackgroundColor: cssVar('--c-pim'), fill: 'origin', borderWidth: 3, segment: dashPartial },
          { label: 'Devengado', data: ser('dev'), borderColor: cssVar('--c-dev'), backgroundColor: areaFill('--c-dev', 0.28), pointBackgroundColor: cssVar('--c-dev'), fill: 'origin', borderWidth: 3, segment: dashPartial },
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
        labels: yrs.map(yTick),
        datasets: [{ label: 'Ejecución', data: ej, borderRadius: 6, valueLabel: v => isMobile() ? '' : Math.round(v) + '%',
          backgroundColor: yrs.map((yy, i) => isPartial(yy) ? cssVar('--line-strong') : cssVar('--' + ({ good: 'sem-good', warn: 'sem-warn', bad: 'sem-bad', na: 'line' })[semaforo(ej[i] / 100)])) }],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttP, title: it => yearLbl(it[0].label) } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: tickP } } },
      },
    }, 'Porcentaje de ejecución anual del conjunto de universidades');
  }


  // ================================================================== uniPicker: combobox con autocompletado
  // uniPicker(host, {id, label, value, values, multiple, max, placeholder, allLabel, onSelect})
  //  - single: onSelect(pliego | '' (si allLabel) | null)  · multiple: onSelect([pliegos])
  const RECENT_KEY = 'rp-recientes';
  const getRecent = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter(p => uniBy(p)).slice(0, 5) : []; } catch (e) { return []; } };
  const pushRecent = p => { try { const a = [String(p)].concat(getRecent().filter(x => x !== String(p))).slice(0, 5); localStorage.setItem(RECENT_KEY, JSON.stringify(a)); } catch (e) { /* sin storage */ } };
  // Resalta (con <mark>) los fragmentos que coinciden ignorando tildes; todo escapado
  function hlText(text, toks) {
    text = String(text ?? '');
    if (!toks.length) return esc(text);
    let norm = '', map = [];
    for (let i = 0; i < text.length; i++) {
      const n = text[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (let k = 0; k < n.length; k++) { norm += n[k]; map.push(i); }
    }
    const marks = new Array(text.length).fill(false);
    toks.forEach(t => { let from = 0, j; while (t && (j = norm.indexOf(t, from)) >= 0) { for (let k = j; k < j + t.length; k++) marks[map[k]] = true; from = j + t.length; } });
    let out = '', open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }
  let pickerSeq = 0;
  function uniPicker(host, o) {
    const id = o.id || ('up' + (++pickerSeq)); const listId = id + '-list';
    let values = o.multiple ? (o.values || []).filter(p => uniBy(p)).map(String) : [];
    let value = o.multiple ? null : (o.value == null ? null : String(o.value));
    let items = [], active = -1;
    const labelOf = p => { if (p === '' && o.allLabel) return o.allLabel; const u = uniBy(p); return u ? `${uName(u)} — ${titleCase(u.nombre || '')}` : ''; };
    host.innerHTML = `
      <div class="up${o.multiple ? ' up-multi' : ''}">
        ${o.label ? `<label class="up-lbl" for="${esc(id)}">${esc(o.label)}</label>` : ''}
        ${o.multiple ? `<div class="up-chips" aria-live="polite"></div>` : ''}
        <div class="up-box">
          <svg class="up-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
          <input id="${esc(id)}" type="text" role="combobox" aria-expanded="false" aria-controls="${esc(listId)}" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false"
            placeholder="${esc(o.placeholder || 'Escribe sigla, nombre o ciudad')}" value="${esc(o.multiple ? '' : labelOf(value))}">
          <button type="button" class="up-x" aria-label="Limpiar"${(o.multiple || !value) ? ' hidden' : ''}>×</button>
        </div>
        <ul class="up-list" id="${esc(listId)}" role="listbox" hidden${o.label ? ` aria-label="${esc(o.label)}"` : ''}></ul>
      </div>`;
    const root = $('.up', host), inp = $('input', root), list = $('.up-list', root), xb = $('.up-x', root), chips = $('.up-chips', root);
    const drawChips = () => {
      if (!chips) return;
      chips.innerHTML = values.map(p => `<span class="up-chip"><b>${esc(uName(uniBy(p)))}</b><button type="button" data-rm="${esc(p)}" aria-label="Quitar ${esc(uName(uniBy(p)))}">×</button></span>`).join('');
      inp.disabled = !!(o.max && values.length >= o.max);
      inp.placeholder = inp.disabled ? `Máximo ${o.max}. Quita una para cambiar.` : (o.placeholder || 'Añade una universidad');
    };
    const haystack = u => normTxt([u.corto, u.nombre, u.ciudad, u.departamento, u.pliego].join(' '));
    const optHtml = (u, i, toks) => `<li role="option" id="${esc(id)}-o${i}" data-p="${esc(u.pliego)}" aria-selected="${i === active}" class="up-opt${i === active ? ' is-active' : ''}">
        <span class="up-sig">${hlText(uName(u), toks)}</span>
        <span class="up-nom">${hlText(titleCase(u.nombre || ''), toks)}</span>
        ${u.departamento ? `<span class="up-dep">${hlText(titleCase(u.ciudad && normTxt(u.ciudad) !== normTxt(u.departamento) ? `${u.ciudad}, ${u.departamento}` : u.departamento), toks)}</span>` : ''}
      </li>`;
    function build(q) {
      const toks = normTxt(q).split(/\s+/).filter(Boolean);
      const pool = S.unis.filter(u => !values.includes(u.pliego));
      let html = '';
      items = [];
      if (!toks.length) {
        const rec = getRecent().map(uniBy).filter(u => u && pool.includes(u));
        const big = unisByPim(S.lastClosed).filter(u => pool.includes(u) && !rec.includes(u)).slice(0, 8);
        if (o.allLabel) { items.push({ all: true }); html += `<li role="option" id="${esc(id)}-o0" data-p="" class="up-opt up-all${active === 0 ? ' is-active' : ''}" aria-selected="${active === 0}"><span class="up-sig">${esc(o.allLabel)}</span></li>`; }
        if (rec.length) { html += '<li class="up-grp" role="presentation">Recientes</li>'; rec.forEach(u => { html += optHtml(u, items.length, []); items.push(u); }); }
        html += '<li class="up-grp" role="presentation">Más grandes (PIM)</li>'; big.forEach(u => { html += optHtml(u, items.length, []); items.push(u); });
      } else {
        const found = pool.filter(u => { const h = haystack(u); return toks.every(t => h.includes(t)); })
          .sort((a, b) => {
            const sa = normTxt(uName(a)).startsWith(toks[0]) ? 0 : 1, sb = normTxt(uName(b)).startsWith(toks[0]) ? 0 : 1;
            return sa - sb || (tot(b, S.lastClosed, 'pim') || 0) - (tot(a, S.lastClosed, 'pim') || 0);
          }).slice(0, 30);
        found.forEach(u => { html += optHtml(u, items.length, toks); items.push(u); });
        if (!found.length) html = `<li class="up-empty" role="presentation">Sin coincidencias para “${esc(q)}”. Prueba con la sigla o la ciudad.</li>`;
      }
      list.innerHTML = html;
    }
    const open = () => { build(inp.value === labelOf(value) ? '' : inp.value); list.hidden = false; inp.setAttribute('aria-expanded', 'true'); };
    const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); active = -1; };
    const setActive = i => {
      const opts = $$('.up-opt', list); if (!opts.length) return;
      active = (i + opts.length) % opts.length;
      opts.forEach((li, k) => { li.classList.toggle('is-active', k === active); li.setAttribute('aria-selected', String(k === active)); });
      inp.setAttribute('aria-activedescendant', opts[active].id);
      opts[active].scrollIntoView({ block: 'nearest' });
    };
    const choose = p => {
      if (o.multiple) {
        if (!p || values.includes(p)) return;
        values = values.concat([p]); pushRecent(p); inp.value = ''; drawChips(); close();
        o.onSelect && o.onSelect(values.slice());
        return;
      }
      value = p; inp.value = labelOf(p); xb.hidden = !p; close();
      if (p) pushRecent(p);
      o.onSelect && o.onSelect(p);
    };
    inp.addEventListener('focus', () => {
      inp.select(); open();
      if (isMobile()) setTimeout(() => root.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
    });
    inp.addEventListener('input', () => { active = -1; open(); if (!o.multiple) xb.hidden = !inp.value; });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) open(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        const opts = $$('.up-opt', list);
        const li = opts[active >= 0 ? active : (inp.value.trim() ? 0 : -1)];
        if (li && !list.hidden) { e.preventDefault(); choose(li.dataset.p); }
      } else if (e.key === 'Escape') { if (!o.multiple) inp.value = labelOf(value); close(); }
    });
    list.addEventListener('mousedown', e => e.preventDefault());
    list.addEventListener('click', e => { const li = e.target.closest('.up-opt'); if (li) choose(li.dataset.p); });
    inp.addEventListener('blur', () => setTimeout(() => { if (!root.contains(document.activeElement)) { if (!o.multiple) inp.value = labelOf(value); close(); } }, 120));
    if (xb) xb.addEventListener('click', () => { inp.value = ''; xb.hidden = true; if (o.allLabel) choose(''); else { value = null; o.onSelect && o.onSelect(null); } inp.focus(); });
    if (chips) chips.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; values = values.filter(p => p !== b.dataset.rm); drawChips(); o.onSelect && o.onSelect(values.slice()); });
    drawChips();
    return { set: p => { value = p; inp.value = labelOf(p); xb.hidden = !p; } };
  }

  // ================================================================== Tabla reutilizable
  // makeTable(host, {id, caption, rows, cols, search, filters, sort, limit, mobilePick, mdef, rank})
  //  cols: [{k, lbl, get(r), html?(r) (ya escapado), fmt?(v), txt?, sticky?, nosort?, m? (siempre visible en móvil)}]
  //  filters: [{k, lbl, opts: [[valor, etiqueta]], test(r, v)}]  — valor '' = todos
  const TBL = new Map();
  const normTxt = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function depFilter(getU, rows) {
    const deps = [...new Set(rows.map(r => (getU(r) || {}).departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, LOC));
    return { k: 'dep', lbl: 'Departamento', opts: [['', 'Todos']].concat(deps.map(d => [d, titleCase(d)])), test: (r, v) => (getU(r) || {}).departamento === v };
  }
  function makeTable(host, o) {
    const st = TBL.get(o.id) || { q: '', f: {}, sort: (o.sort || {}).k, dir: (o.sort || {}).dir ?? -1, all: false, mcol: o.mdef };
    TBL.set(o.id, st);
    const id = o.id; const filters = o.filters || [];
    const pickCols = o.mobilePick ? o.cols.filter(c => o.mobilePick.includes(c.k)) : [];
    host.innerHTML = `
      <div class="controls">
        ${o.search !== false ? `<label class="grow">Buscar<input type="search" id="${id}-q" placeholder="${esc((o.search && o.search.ph) || 'Nombre, sigla o departamento')}" autocomplete="off" value="${esc(st.q)}"></label>` : ''}
        ${filters.map(f => `<label>${esc(f.lbl)}<select data-f="${esc(f.k)}">${f.opts.map(([v, l]) => `<option value="${esc(v)}"${String(st.f[f.k] ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}
      </div>
      ${pickCols.length ? `<div class="controls rk-mobile"><label class="grow">Columna a mostrar en el celular<select id="${id}-m">${pickCols.map(c => `<option value="${esc(c.k)}"${c.k === st.mcol ? ' selected' : ''}>${esc(String(c.lbl).replace('*', ''))}</option>`).join('')}</select></label></div>` : ''}
      <div class="table-wrap tall"><table class="mt" id="${id}-t">${o.caption ? `<caption>${esc(o.caption)}</caption>` : ''}<thead></thead><tbody></tbody></table></div>
      <p class="count mt-count"><span id="${id}-c" aria-live="polite"></span><button type="button" class="btn" id="${id}-more" hidden></button></p>`;
    const searchText = (o.search && o.search.text) || (r => r.u ? [r.u.nombre, r.u.corto, r.u.pliego, r.u.departamento].join(' ') : '');
    const hideM = c => (o.mobilePick && !c.m && c.k !== st.mcol) ? ' rk-hide-m' : '';
    const draw = () => {
      const q = normTxt(st.q.trim());
      const col = o.cols.find(c => c.k === st.sort);
      let list = o.rows.filter(r => !q || normTxt(searchText(r)).includes(q))
        .filter(r => filters.every(f => { const v = st.f[f.k]; return v === undefined || v === '' || f.test(r, v); }));
      if (col) list.sort((x, y) => {
        const va = col.get(x), vb = col.get(y);
        if (typeof va === 'string' || typeof vb === 'string') return st.dir * String(va ?? '').localeCompare(String(vb ?? ''), LOC);
        if (num(va) === null && num(vb) === null) return 0; if (num(va) === null) return 1; if (num(vb) === null) return -1;
        return st.dir * (va - vb);
      });
      const total = list.length;
      const lim = o.limit && !st.all ? o.limit : Infinity;
      const shown = list.slice(0, lim);
      $(`#${id}-t thead`, host).innerHTML = '<tr>' + o.cols.map(c => {
        const so = st.sort === c.k ? (st.dir > 0 ? 'ascending' : 'descending') : 'none';
        const cls = [(c.txt || c.sticky) ? 'txt' : '', c.sticky ? 'sticky-col' : ''].join(' ').trim() + hideM(c);
        return `<th scope="col" class="${cls}"${c.nosort ? '' : ` aria-sort="${so}"`}>${c.nosort ? esc(c.lbl) : `<button type="button" class="sort" data-k="${esc(c.k)}">${esc(c.lbl)}</button>`}</th>`;
      }).join('') + '</tr>';
      $(`#${id}-t tbody`, host).innerHTML = shown.length ? shown.map((r, i) => `<tr${o.rowClass && o.rowClass(r) ? ` class="${esc(o.rowClass(r))}"` : ''}>` + o.cols.map(c => {
        const cls = [(c.txt || c.sticky) ? 'txt' : '', c.sticky ? 'sticky-col' : '', c.wrap ? 'wrap' : ''].join(' ').trim() + hideM(c);
        const inner = c.html ? c.html(r) : esc(c.fmt ? c.fmt(c.get(r)) : c.get(r));
        return `<td class="${cls}">${c.sticky && o.rank ? `<span class="rk-n">${i + 1}</span>` : ''}${inner}</td>`;
      }).join('') + '</tr>').join('') : `<tr><td colspan="${o.cols.length}" class="txt"><span class="muted">Sin resultados para ese filtro.</span></td></tr>`;
      $(`#${id}-c`, host).textContent = `Mostrando ${shown.length} de ${o.rows.length}${total !== o.rows.length ? ` (${total} cumplen el filtro)` : ''}.`;
      const more = $(`#${id}-more`, host);
      more.hidden = !o.limit || total <= o.limit;
      more.textContent = st.all ? `Mostrar solo ${o.limit}` : `Ver las ${total}`;
      if (o.onDraw) o.onDraw(list);
    };
    const qi = $(`#${id}-q`, host);
    if (qi) qi.addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }));
    $$('select[data-f]', host).forEach(s => s.addEventListener('change', e => { st.f[e.target.dataset.f] = e.target.value; draw(); }));
    const ms = $(`#${id}-m`, host);
    if (ms) ms.addEventListener('change', e => { st.mcol = e.target.value; st.sort = e.target.value; st.dir = -1; draw(); });
    $(`#${id}-more`, host).addEventListener('click', () => { st.all = !st.all; draw(); });
    $(`#${id}-t thead`, host).addEventListener('click', e => {
      const b = e.target.closest('button.sort'); if (!b) return;
      const c = o.cols.find(x => x.k === b.dataset.k);
      if (st.sort === b.dataset.k) st.dir *= -1; else { st.sort = b.dataset.k; st.dir = (c && (c.txt || c.sticky)) ? 1 : -1; }
      draw();
    });
    draw();
    return { st, draw };
  }
  // Celda de universidad (sigla + nombre); escapada
  const uniCell = (u, extra = '') => `<a class="uni-link" title="${esc(u.nombre || '')}" href="#u=${encodeURIComponent(u.pliego)}" data-pf="${esc(u.pliego)}">${esc(uName(u))}</a>${extra}<span class="uni-sub">${esc(titleCase(u.nombre || ''))}${u.departamento ? ' · ' + esc(titleCase(u.departamento)) : ''}</span>`;
  const firstYearOf = u => S.years.find(y => num(tot(u, y, 'pim')) !== null) || null;
  const isNueva = u => { const c = parseInt(u.creacion, 10); if (c) return c >= 2000; const f = firstYearOf(u); return f ? +f > +S.years[0] + 2 : false; };

  // Plugin: etiqueta de valor al final de cada barra (dataset.valueLabel = fn(v, i) → texto)
  const valueLabelPlugin = {
    id: 'valueLabel',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, di) => {
        if (!ds.valueLabel) return;
        const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
        ctx.save();
        ctx.font = `700 12px ${cssVar('--font-cifras') || 'sans-serif'}`;
        ctx.fillStyle = cssVar('--ink');
        meta.data.forEach((el, i) => {
          const v = ds.data[i]; if (num(v) === null) return;
          const txt = ds.valueLabel(v, i); if (!txt) return;
          const horiz = chart.options.indexAxis === 'y';
          if (horiz) {
            const neg = v < 0;
            ctx.textAlign = neg ? 'right' : 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, el.x + (neg ? -5 : 5), el.y);
          } else {
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(txt, el.x, el.y - 4);
          }
        });
        ctx.restore();
      });
    },
  };

  // ================================================================== ¿SUBIÓ O BAJÓ?
  const ipcIdx = y => { const i = S.data && S.data.ipc && S.data.ipc.indice; return i ? num(i[String(y)]) : null; };
  const hasIpc = () => S.years.some(y => ipcIdx(y) !== null);
  const toReal = (v, y) => { const i = ipcIdx(y); return (num(v) === null || !i) ? null : v * 100 / i; };
  const ipcBase = () => (S.data && S.data.ipc && S.data.ipc.base) || '2025';
  const METRIC_LBL = { pia: 'PIA', pim: 'PIM', dev: 'Devengado' };
  const COMP_GEN = [
    { lbl: 'Personal y obligaciones sociales', frags: ['2.1'], c: '--g1' },
    { lbl: 'Pensiones', frags: ['2.2'], c: '--g2' },
    { lbl: 'Bienes y servicios', frags: ['2.3'], c: '--g3' },
    { lbl: 'Infraestructura y equipos (2.6)', frags: ['2.6'], c: '--g5' },
    { lbl: 'Otros (2.4, 2.5, 2.8)', frags: ['2.4', '2.5', '2.7', '2.8'], c: '--g4' },
  ];
  const COMP_FUE = [
    { lbl: 'Recursos ordinarios (RO)', frags: ['ORDINARIOS'], c: '--f1' },
    { lbl: 'Recursos directamente recaudados (RDR)', frags: ['DIRECTAMENTE'], c: '--f2' },
    { lbl: 'Recursos determinados (canon)', frags: ['DETERMINADOS'], c: '--f3' },
    { lbl: 'Donaciones, transferencias y crédito', frags: ['DONACIONES', 'OPERACIONES OFICIALES'], c: '--f4' },
  ];
  function vrDefaults() {
    const closed = S.years.filter(y => !isPartial(y) && S.unis.some(u => A(u, y)));
    const cnt = y => S.unis.filter(u => num(tot(u, y, 'dev')) !== null).length;
    const maxC = Math.max(0, ...closed.map(cnt));
    let a = closed.includes('2016') ? '2016' : (closed.find(y => cnt(y) >= 0.7 * maxC) || closed[0]);
    const b = S.lastClosed;
    if (a === b) a = closed[0];
    return { a, b };
  }
  function readVrParams() {
    const p = new URLSearchParams(location.search);
    const ys = S.years.map(String);
    if (ys.includes(p.get('a'))) S.vr.a = p.get('a');
    if (ys.includes(p.get('b'))) S.vr.b = p.get('b');
    if (['pia', 'pim', 'dev'].includes(p.get('m'))) S.vr.m = p.get('m');
    if (p.get('r') === '0' || p.get('r') === '1') S.vr.real = p.get('r') === '1';
    return p.has('a') || p.has('b');
  }
  function writeVrParams() {
    try {
      const p = new URLSearchParams(location.search);
      p.set('a', S.vr.a); p.set('b', S.vr.b); p.set('m', S.vr.m); p.set('r', S.vr.real ? '1' : '0');
      history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
    } catch (e) { /* sin history */ }
  }
  // Valor de una universidad en un año, según métrica y modo
  const vrVal = (u, y, real) => { const v = tot(u, y, S.vr.m); return real ? toReal(v, y) : v; };
  const compVal = (u, y, field, comp, real) => {
    const o = (A(u, y) || {})[field];
    const v = sum(comp.frags.map(f => (pick(o, f) || {})[S.vr.m]));
    return real ? toReal(v, y) : v;
  };
  const pctChg = (a, b) => (num(a) !== null && num(b) !== null && a !== 0) ? (b - a) / Math.abs(a) : null;
  const arrow = v => num(v) === null ? '' : v > 0.0005 ? '▲' : v < -0.0005 ? '▼' : '＝';
  function renderVariacion() {
    const el = $('#body-variacion');
    if (!S.vr.a || !S.vr.b) Object.assign(S.vr, vrDefaults(), S.vr.a ? { a: S.vr.a } : {}, S.vr.b ? { b: S.vr.b } : {});
    if (!hasIpc()) S.vr.real = false;
    const { a, b, m } = S.vr; const real = S.vr.real;
    const modeLbl = real ? `soles reales de ${ipcBase()}` : 'soles corrientes';
    const unisA = S.unis.filter(u => num(tot(u, a, m)) !== null);
    const unisB = S.unis.filter(u => num(tot(u, b, m)) !== null);
    const both = unisB.filter(u => num(tot(u, a, m)) !== null);
    const nuevas = unisB.filter(u => num(tot(u, a, m)) === null);
    const TA = sum(unisA.map(u => vrVal(u, a, real))), TB = sum(unisB.map(u => vrVal(u, b, real)));
    const CA = sum(both.map(u => vrVal(u, a, real))), CB = sum(both.map(u => vrVal(u, b, real)));
    const dT = pctChg(TA, TB), dC = pctChg(CA, CB);
    const verbo = v => v === null ? 'varió' : v > 0.0005 ? 'subió' : v < -0.0005 ? 'bajó' : 'se mantuvo';
    const what = { pia: 'el presupuesto de apertura (PIA)', pim: 'el presupuesto modificado (PIM)', dev: 'el gasto ejecutado (devengado)' }[m];
    const frase = dT === null ? 'No hay datos suficientes para comparar esos años.'
      : `${real ? 'En términos reales' : 'En soles corrientes'}, ${what} de las universidades públicas ${verbo(dT)}${Math.abs(dT) > 0.0005 ? ' ' + (dT >= 10 ? fmtChg(dT).replace('×', '') + ' veces' : fmtP(Math.abs(dT))) : ''} entre ${a} y ${b}.`;
    const yOpts = sel => S.years.map(y => `<option value="${esc(y)}"${String(y) === String(sel) ? ' selected' : ''}>${esc(yearLbl(y))}</option>`).join('');
    const compCats = S.vr.comp === 'fuente' ? COMP_FUE : COMP_GEN;
    const field = S.vr.comp === 'fuente' ? 'fuente' : 'generica';
    const compRows = compCats.map(c => {
      const va = sum(unisA.map(u => compVal(u, a, field, c, real))), vb = sum(unisB.map(u => compVal(u, b, field, c, real)));
      return Object.assign({}, c, { va, vb, d: pctChg(va, vb) });
    }).filter(c => c.va !== null || c.vb !== null);
    // por universidad
    const rows = unisB.map(u => {
      const va = vrVal(u, a, real), vb = vrVal(u, b, real);
      const ra = toReal(tot(u, a, m), a), rb = toReal(tot(u, b, m), b);
      const ea = num((A(u, a) || {}).estudiantes), eb = num((A(u, b) || {}).estudiantes);
      const pa = div(va, ea), pb = div(vb, eb);
      return { u, va, vb, dabs: (va !== null && vb !== null) ? vb - va : null, dv: pctChg(va, vb), dr: pctChg(ra, rb), pa, pb, dp: pctChg(pa, pb), nueva: va === null };
    });
    // Para el gráfico solo bases comparables: en A al menos S/ 10 M (evita +1000 % por bases mínimas)
    const MINBASE = 10e6;
    const byAbs = S.vr.order === 'abs';
    const key = r => byAbs ? r.dabs : r.dv;
    const ranked = rows.filter(r => num(key(r)) !== null && !r.nueva && (byAbs || r.va >= MINBASE)).sort((x, y) => key(y) - key(x));
    const excl = byAbs ? 0 : rows.filter(r => r.dv !== null && !(r.va >= MINBASE)).length;
    const N = isMobile() ? 8 : 10;
    const ups = ranked.filter(r => key(r) > 0).slice(0, N);
    const downsAll = ranked.filter(r => key(r) < 0).reverse();
    const downs = downsAll.slice(0, N);
    const noneDown = downsAll.length === 0;
    const lows = noneDown ? ranked.slice(-N).reverse() : downs;
    const upTitle = ups.length ? (ups.length < N ? `Solo ${ups.length} subieron` : `Las ${ups.length} que más suben`) : `Ninguna universidad subió entre ${a} y ${b}`;
    const lowTitle = noneDown ? `Ninguna universidad bajó entre ${a} y ${b}: estas son las que menos crecieron` : (downsAll.length < N ? `Solo ${downsAll.length} ${downsAll.length === 1 ? 'bajó' : 'bajaron'} entre ${a} y ${b}` : `Las ${downs.length} que más bajan`);
    const partialWarn = [a, b].filter(isPartial);
    el.innerHTML = `
      <div class="controls">
        <label>Año A<select id="vr-a">${yOpts(a)}</select></label>
        <label>Año B<select id="vr-b">${yOpts(b)}</select></label>
        ${seg('Métrica', [['dev', 'Devengado'], ['pim', 'PIM'], ['pia', 'PIA']], m)}
        ${hasIpc() ? `<div class="seg" data-real role="group" aria-label="Moneda"><button type="button" data-v="1" aria-pressed="${real}">Real</button><button type="button" data-v="0" aria-pressed="${!real}">Nominal</button></div>` : ''}
      </div>
      <p class="note">${hasIpc() ? (real ? `<strong>Real</strong>: soles de ${esc(ipcBase())}, descontando la inflación (IPC Lima, BCRP).` : '<strong>Nominal</strong>: soles de cada año, sin ajustar por inflación.') : 'No hay índice de precios en los datos: solo se puede comparar en soles corrientes.'}</p>
      ${partialWarn.length ? `<p class="note warn"><strong>${esc(partialWarn.join(' y '))}</strong> es un año en curso: su ${m === 'dev' ? 'devengado es parcial y la comparación exagera la caída' : 'presupuesto aún puede modificarse'}.</p>` : ''}
      ${a === b ? '<p class="note warn">Elige dos años distintos.</p>' : ''}
      <div class="card">
        <div class="big-var ${dT > 0.0005 ? 'up' : dT < -0.0005 ? 'down' : ''}">
          <div class="bv-row"><span class="bv-arrow" aria-hidden="true">${arrow(dT)}</span><div><div class="bv-pct">${esc(fmtChg(dT))}</div><div class="bv-abs">${esc(fmtDelta(TB, TA))} · ${esc(METRIC_LBL[m])}, ${esc(modeLbl)}</div></div></div>
          <div>
            <p class="bv-ab">${esc(a)}: <b>${esc(fmtM(TA))}</b> (${unisA.length} univ.) → ${esc(b)}: <b>${esc(fmtM(TB))}</b> (${unisB.length} univ.)</p>
            <p class="sentence">${esc(frase)}</p>
            ${nuevas.length ? `<p class="note">${esc(b)} incluye ${nuevas.length} universidades sin datos en ${esc(a)} (nuevas o sin presupuesto propio). Solo con las ${both.length} presentes en ambos años, la variación es <strong>${esc(fmtChg(dC))}</strong>.</p>` : ''}
          </div>
        </div>
      </div>
      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <div class="controls" style="margin-bottom:4px">${seg('Componente', [['generica', 'En qué gastan'], ['fuente', 'De dónde viene']], S.vr.comp)}</div>
          <h3>Por componente: ${esc(a)} vs ${esc(b)}</h3>
          <p class="sub">${esc(METRIC_LBL[m])} en millones de ${esc(modeLbl)}.</p>
          <div class="chart"><canvas id="ch-vr-comp"></canvas></div>
          <ul class="comp-list">${compRows.map(c => `<li><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${cssVar(c.c)};margin-right:6px"></i>${esc(c.lbl)}</span><span>${fmtVar(c.d)}</span></li>`).join('')}</ul>
        </div>
        <div class="card">
          <div class="controls" style="margin-bottom:4px"><label>Ordenar por<select id="vr-order"><option value="pct"${byAbs ? '' : ' selected'}>Δ %</option><option value="abs"${byAbs ? ' selected' : ''}>Δ S/ (millones)</option></select></label></div>
          <h3>¿Qué universidades se movieron más?</h3>
          <p class="sub">${byAbs ? 'Variación en millones' : 'Variación %'} del ${esc(METRIC_LBL[m])} entre ${esc(a)} y ${esc(b)} (${esc(modeLbl)}). Las nuevas no se incluyen${excl ? ` ni ${excl} con menos de S/ 10 M en ${esc(a)} (base muy pequeña; ver tabla)` : ''}.${byAbs ? '' : ' Δ S/ muestra mejor dónde se movió más dinero.'}</p>
          <div class="split-chart">
            <h4 class="up">${esc(upTitle)}</h4>
            ${ups.length ? '<div class="chart"><canvas id="ch-vr-up"></canvas></div>' : ''}
            <h4 class="${noneDown ? '' : 'down'}">${esc(lowTitle)}</h4>
            ${lows.length ? '<div class="chart"><canvas id="ch-vr-down"></canvas></div>' : ''}
          </div>
        </div>
      </div>
      <h3 style="margin:20px 0 8px">Todas las universidades</h3>
      <div id="vr-host"></div>
      <p class="count"><button type="button" class="btn" id="vr-share">Copiar enlace a esta comparación</button></p>`;

    const hasPer = rows.some(r => r.pb !== null);
    makeTable($('#vr-host', el), {
      rowClass: r => (!r.nueva && num(r.va) !== null && r.va < BASE_CHICA) ? 'row-dim' : '',
      id: 'vrt', caption: `${METRIC_LBL[m]} ${a} vs ${b}, ${modeLbl}.`, rows, sort: { k: 'dv', dir: -1 }, limit: 25,
      mobilePick: ['va', 'vb', 'dabs', 'dv'].concat(real ? [] : ['dr']).concat(hasPer ? ['pb', 'dp'] : []), mdef: 'dabs',
      filters: [depFilter(r => r.u, rows),
        { k: 'sent', lbl: 'Dirección', opts: [['', 'Todas'], ['up', 'Solo las que suben'], ['down', 'Solo las que bajan'], ['nueva', 'Solo nuevas']], test: (r, v) => v === 'nueva' ? r.nueva : v === 'up' ? r.dv > 0 : r.dv < 0 }],
      cols: [
        { k: 'nombre', lbl: 'Universidad', sticky: true, m: true, get: r => uName(r.u), html: r => uniCell(r.u, r.nueva ? '<span class="tag new">nueva</span>' : (num(r.va) !== null && r.va < BASE_CHICA ? baseChip : '')) },
        { k: 'va', lbl: String(a), get: r => r.va, fmt: fmtM },
        { k: 'vb', lbl: String(b), get: r => r.vb, fmt: fmtM },
        { k: 'dabs', lbl: 'Δ S/', get: r => r.dabs, fmt: v => num(v) === null ? SD : fmtSigned(v) },
        { k: 'dv', lbl: real ? 'Δ % (real)' : 'Δ % (nominal)', m: true, get: r => r.dv, html: r => fmtVar(r.dv) },
      ].concat(real ? [] : [{ k: 'dr', lbl: 'Δ real %', get: r => r.dr, html: r => fmtVar(r.dr) }])
        .concat(hasPer ? [{ k: 'pb', lbl: `S/ por estudiante ${b}`, get: r => r.pb, fmt: fmtS }, { k: 'dp', lbl: 'Δ % por estudiante', get: r => r.dp, html: r => fmtVar(r.dp) }] : []),
    });

    const rerun = () => { writeVrParams(); safeRender('variacion'); if (S.rendered.has('ficha')) safeRender('ficha'); };
    $('#vr-a', el).addEventListener('change', e => { S.vr.a = e.target.value; rerun(); });
    $('#vr-b', el).addEventListener('change', e => { S.vr.b = e.target.value; rerun(); });
    bindSeg(el, (v, g) => {
      const lbl = g.getAttribute('aria-label');
      if (lbl === 'Métrica') S.vr.m = v;
      else if (lbl === 'Moneda') S.vr.real = v === '1';
      else if (lbl === 'Componente') S.vr.comp = v;
      rerun();
    });
    $('#vr-share', el).addEventListener('click', async e => {
      writeVrParams();
      const url = location.href.split('#')[0] + '#variacion';
      try { await navigator.clipboard.writeText(url); e.target.textContent = 'Enlace copiado'; }
      catch (err) { e.target.textContent = 'Copia la URL de la barra del navegador'; }
      setTimeout(() => { e.target.textContent = 'Copiar enlace a esta comparación'; }, 2200);
    });

    mkChart('ch-vr-comp', {
      type: 'bar',
      data: { labels: compRows.map(c => c.lbl), datasets: [
        { label: String(a), data: compRows.map(c => mill(c.va)), backgroundColor: cssVar('--c-pia'), borderRadius: 3 },
        { label: String(b), data: compRows.map(c => mill(c.vb)), backgroundColor: compRows.map(c => cssVar(c.c)), borderRadius: 3 },
      ] },
      options: {
        indexAxis: 'y', interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttM, afterBody: it => { const c = compRows[it[0].dataIndex]; return c && c.d !== null ? `Variación: ${c.d > 0 ? '+' : ''}${fmtP(c.d)}` : ''; } } } },
        scales: { x: { beginAtZero: true, ticks: { callback: tickM, maxTicksLimit: isMobile() ? 4 : 7 } }, y: { ticks: { autoSkip: false, callback: function (v) { const l = this.getLabelForValue(v); return isMobile() && l.length > 18 ? l.slice(0, 17) + '…' : l; } } } },
      },
    }, `Comparación por componente entre ${a} y ${b}`);
    $('#vr-order', el).addEventListener('change', e => { S.vr.order = e.target.value; renderVariacion(); });
    const moverChart = (cid, list, color) => {
      if (!list.length) return;
      // Se dibuja la magnitud (barras hacia la derecha) y la etiqueta conserva el signo real
      const raw = list.map(r => byAbs ? +(r.dabs / 1e6).toFixed(1) : +(r.dv * 100).toFixed(1));
      const vals = raw.map(Math.abs);
      const lbl = (v, i) => { const x = raw[i]; return byAbs ? (x > 0 ? '+' : x < 0 ? '−' : '') + soles(Math.abs(x) * 1e6) : fmtChg(x / 100); };
      const maxAbs = Math.max(...vals.map(Math.abs), 1);
      sizeFor(cid, list.length, isMobile() ? 30 : 26, 140);
      mkChart(cid, {
        type: 'bar',
        data: { labels: list.map(r => uName(r.u)), datasets: [{ label: 'Variación', data: vals, borderRadius: 6, borderSkipped: false, maxBarThickness: 22,
          backgroundColor: raw.map(v => cssVar(v >= 0 ? color : '--sem-bad')), valueLabel: (v, i) => lbl(v, i) }] },
        options: {
          indexAxis: 'y', layout: { padding: { right: 72 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            title: it => (list[it[0].dataIndex] || {}).u.nombre || it[0].label,
            label: ctx => { const r = list[ctx.dataIndex]; return [`Variación: ${fmtVarTxt(r.dv)}`, `${a}: ${fmtM(r.va)}`, `${b}: ${fmtM(r.vb)}`, `Δ S/: ${num(r.dabs) === null ? SD : fmtSigned(r.dabs)}`]; },
          } } },
          scales: { x: { display: false, min: Math.min(0, -maxAbs * (vals.some(v => v < 0) ? 1 : 0)), max: vals.some(v => v > 0) ? maxAbs : 0 }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { weight: 600 } } } },
        },
      }, cid === 'ch-vr-up' ? upTitle : lowTitle);
    };
    moverChart('ch-vr-up', ups, '--sem-good');
    moverChart('ch-vr-down', lows, noneDown ? '--c-pia' : '--sem-bad');
  }
  // Mini bloque en la ficha: serie nominal vs real
  function fichaVrHtml(u) {
    if (!hasIpc()) return '';
    if (!S.vr.a || !S.vr.b) Object.assign(S.vr, vrDefaults());
    const m = S.vr.m, a = S.vr.a, b = S.vr.b;
    const na = tot(u, a, m), nb = tot(u, b, m);
    const dn = pctChg(na, nb), dr = pctChg(toReal(na, a), toReal(nb, b));
    return `<div class="card" style="margin-top:12px"><h3>¿Subió o bajó? ${esc(uName(u))}</h3>
      <p class="sub">${esc(METRIC_LBL[m])} ${esc(a)} → ${esc(b)}: nominal ${fmtVar(dn)} · real ${fmtVar(dr)} (soles de ${esc(ipcBase())}). <a href="#variacion">Cambiar años o métrica</a>.</p>
      <div class="chart"><canvas id="ch-fi-vr"></canvas></div></div>`;
  }
  function fichaVrChart(u) {
    if (!hasIpc() || !document.getElementById('ch-fi-vr')) return;
    const m = S.vr.m, yrs = S.years;
    mkChart('ch-fi-vr', {
      type: 'line',
      data: { labels: yrs.map(String), datasets: [
        { label: 'Nominal', data: yrs.map(y => mill(tot(u, y, m))), borderColor: cssVar('--c-pia'), backgroundColor: cssVar('--c-pia'), borderDash: [4, 3], tension: .25, pointRadius: 2 },
        { label: `Real (soles de ${ipcBase()})`, data: yrs.map(y => mill(toReal(tot(u, y, m), y))), borderColor: cssVar('--c-pim'), backgroundColor: cssVar('--c-pim'), borderWidth: 2.5, tension: .25, pointRadius: 2 },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttM, title: it => yearLbl(it[0].label) } } }, scales: { y: { beginAtZero: true, ticks: { callback: tickM } } } },
    }, `${METRIC_LBL[m]} de ${uName(u)} en soles nominales y reales`);
  }

  // ================================================================== LÍNEA BASE (vs resto del Estado)
  // Etiqueta al final de cada línea: dataset.endLabel = texto corto
  const endLabelPlugin = {
    id: 'endLabel',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const items = [];
      chart.data.datasets.forEach((ds, di) => {
        if (!ds.endLabel) return;
        const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
        let i = ds.data.length - 1; while (i >= 0 && num(ds.data[i]) === null) i--;
        if (i < 0) return;
        const pt = meta.data[i];
        items.push({ x: pt.x + 8, y: pt.y, txt: `${ds.endLabel} ${Math.round(ds.data[i])}`, col: ds.borderColor });
      });
      // evita superposición: separa verticalmente
      items.sort((a, b) => a.y - b.y);
      for (let k = 1; k < items.length; k++) if (items[k].y - items[k - 1].y < 15) items[k].y = items[k - 1].y + 15;
      ctx.save();
      ctx.font = `800 12px ${cssVar('--font-cifras') || 'sans-serif'}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      items.forEach(it => { ctx.fillStyle = it.col; ctx.fillText(it.txt, it.x, it.y); });
      ctx.restore();
    },
  };
  S.lb = { base: null, m: 'dev', real: true };
  const BL_SERIES = [
    { k: 'uni', lbl: 'Universidades', short: 'Univ.', c: '--c-dev', w: 4 },
    { k: 'total', lbl: 'Total Estado', short: 'Estado', c: '--f1', w: 2.5 },
    { k: 'edu', lbl: 'Educación', short: 'Educ.', c: '--g5', w: 2.5 },
    { k: 'pbi', lbl: 'PBI', short: 'PBI', c: '--g1', w: 2.5, dash: [6, 4] },
    { k: 'ipc', lbl: 'Precios (IPC)', short: 'IPC', c: '--c-pia', w: 2, dash: [3, 3], nominalOnly: true },
  ];
  function blVal(k, y, m, real) {
    const b = ((S.data.baseline || {}).anios || {})[String(y)] || {};
    let v = null;
    if (k === 'uni') v = nacional(y)[m];
    else if (k === 'total') v = num((b.total || {})[m]);
    else if (k === 'edu') v = num((b.funcion_educacion || {})[m]) ?? num((b.sector_educacion || {})[m]);
    else if (k === 'pbi') v = num(b.pbi_nominal);
    else if (k === 'ipc') return ipcIdx(y);
    return real ? toReal(v, y) : v;
  }
  function renderLineabase() {
    const el = $('#body-lineabase'); const bl = S.data.baseline;
    if (!bl || !bl.anios) return;
    const yrs = S.years.filter(y => bl.anios[String(y)]);
    if (!S.lb.base || !yrs.includes(String(S.lb.base))) S.lb.base = yrs.includes('2016') ? '2016' : yrs[0];
    if (!hasIpc()) S.lb.real = false;
    const { base, m } = S.lb; const real = S.lb.real;
    const yEnd = yrs.filter(y => !isPartial(y)).slice(-1)[0] || yrs[yrs.length - 1];
    const idx = (k, y) => { const b0 = blVal(k, base, m, real), v = blVal(k, y, m, real); return (num(b0) && num(v) !== null) ? +(v / b0 * 100).toFixed(1) : null; };
    const series = BL_SERIES.filter(sr => !(real && sr.nominalOnly)).filter(sr => yrs.some(y => num(blVal(sr.k, y, m, real)) !== null));
    const chg = k => { const a0 = blVal(k, base, m, real), a1 = blVal(k, yEnd, m, real); return pctChg(a0, a1); };
    if (S.lb.m === 'pia') S.lb.m = 'dev';
    const cu = chg('uni'), ct = chg('total'), ce = chg('edu');
    const nBase = S.unis.filter(u => num(tot(u, base, m)) !== null).length, nEnd = S.unis.filter(u => num(tot(u, yEnd, m)) !== null).length;
    const pctOrX = v => v === null ? SD : fmtChg(v).replace(/^\+/, '').replace(/^×(.*)$/, '$1 veces');
    const modo = real ? 'en términos reales' : 'en soles corrientes';
    const frase = (cu === null || ct === null) ? '' :
      `Entre ${base} y ${yEnd}, con el ${METRIC_LBL[m].toLowerCase()} ${modo}, el presupuesto de las universidades ${cu >= 0 ? 'creció' : 'cayó'} ${pctOrX(Math.abs(cu))}; el presupuesto público total, ${pctOrX(Math.abs(ct))}${ct < 0 ? ' (caída)' : ''}${ce !== null ? `, y la función Educación, ${pctOrX(Math.abs(ce))}${ce < 0 ? ' (caída)' : ''}` : ''}. ` +
      (Math.abs(cu - ct) < 0.02 ? 'Crecieron a un ritmo similar.' : cu > ct ? 'Las universidades crecieron más que el conjunto del Estado.' : 'Las universidades crecieron menos que el conjunto del Estado.');
    const share = yrs.map(y => div(blVal('uni', y, m, false), blVal('total', y, m, false)));
    const shPbi = yrs.map(y => div(blVal('uni', y, m, false), blVal('pbi', y, m, false)));
    const iEnd = yrs.indexOf(yEnd);
    const yOpts = yrs.filter(y => !isPartial(y)).map(y => `<option value="${esc(y)}"${String(y) === String(base) ? ' selected' : ''}>${esc(y)}</option>`).join('');
    el.innerHTML = `
      <div class="controls">
        <label>Año base (= 100)<select id="lb-base">${yOpts}</select></label>
        ${seg('Métrica', [['dev', 'Devengado'], ['pim', 'PIM']], m)}
        ${hasIpc() ? `<div class="seg" role="group" aria-label="Moneda"><button type="button" data-v="1" aria-pressed="${real}">Real</button><button type="button" data-v="0" aria-pressed="${!real}">Nominal</button></div>` : ''}
      </div>
      <p class="note">${real ? `<strong>Real</strong>: descontando la inflación (soles de ${esc(ipcBase())}).` : '<strong>Nominal</strong>: soles de cada año; la línea de precios (IPC) muestra cuánto subió el costo de vida.'}</p>
      ${frase ? `<p class="sentence">${esc(frase)}</p>` : ''}
      <div class="card" style="margin-top:12px">
        <h3>Índice ${esc(base)} = 100</h3>
        <p class="sub">${esc(METRIC_LBL[m])} ${esc(modo)}. Más de 100 = creció desde ${esc(base)}.</p>
        <div class="chart tall"><canvas id="ch-lb"></canvas></div>
      </div>
      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <h3>Universidades como % del presupuesto público</h3>
          <p class="big-fig">${esc(fmtP(share[iEnd], 2))}<span> en ${esc(yEnd)}</span></p>
          <div class="chart"><canvas id="ch-lb-sh"></canvas></div>
        </div>
        <div class="card">
          <h3>Universidades como % del PBI</h3>
          <p class="big-fig">${esc(fmtP(shPbi[iEnd], 2))}<span> en ${esc(yEnd)}</span></p>
          <div class="chart"><canvas id="ch-lb-pbi"></canvas></div>
        </div>
      </div>
      <ul class="note lb-notas">
        ${nEnd !== nBase ? `<li>Entre ${esc(base)} y ${esc(yEnd)} ${nEnd > nBase ? 'se sumaron' : 'salieron'} ${esc(Math.abs(nEnd - nBase))} universidades con presupuesto propio (${esc(nBase)} → ${esc(nEnd)}): parte del crecimiento se explica por universidades nuevas.</li>` : ''}
        <li>El presupuesto público total suma todos los niveles de gobierno y puede contar dos veces las transferencias entre niveles.</li>
        <li>El resultado depende del año base y de la métrica: prueba otros años y PIM / devengado.</li>
        ${(Array.isArray(bl.notas) ? bl.notas : []).map(n => `<li>${esc(n)}</li>`).join('')}
        ${bl.fuente ? `<li>Fuente: ${esc(bl.fuente)}</li>` : ''}
      </ul>`;
    $('#lb-base', el).addEventListener('change', e => { S.lb.base = e.target.value; renderLineabase(); });
    bindSeg(el, (v, g) => { const l = g.getAttribute('aria-label'); if (l === 'Métrica') S.lb.m = v; else if (l === 'Moneda') S.lb.real = v === '1'; renderLineabase(); });
    // El devengado del año en curso es parcial: la línea termina en el último año cerrado
    const yrsI = m === 'dev' ? yrs.filter(y => !isPartial(y)) : yrs;
    mkChart('ch-lb', {
      type: 'line',
      data: { labels: yrsI.map(yTick), datasets: series.map(sr => ({ label: sr.lbl, endLabel: isMobile() ? sr.short : sr.lbl, data: yrsI.map(y => idx(sr.k, y)),
        borderColor: cssVar(sr.c), backgroundColor: cssVar(sr.c), borderWidth: sr.w, borderDash: sr.dash, tension: 0, cubicInterpolationMode: 'monotone', pointRadius: yrsI.map(y => String(y) === String(base) ? 4 : 0) })) },
      options: {
        layout: { padding: { right: isMobile() ? 78 : 140 } },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => yearLbl(it[0].label), label: ctx => `${ctx.dataset.label}: ${num(ctx.raw) === null ? SD : nf(ctx.raw, 0)}` } } },
        scales: { y: { ticks: { callback: v => nf(v, 0) } } },
      },
      plugins: [endLabelPlugin],
    }, `Índice ${base} = 100 del presupuesto de universidades frente al Estado`);
    const barOpts = d => ({
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => yearLbl(it[0].label), label: ctx => fmtP(ctx.raw / 100, d) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => nf(v, d) + ' %' } } },
    });
    mkChart('ch-lb-sh', { type: 'bar', data: { labels: yrs.map(yTick), datasets: [{ label: '% del presupuesto público', data: share.map(v => v === null ? null : +(v * 100).toFixed(2)), backgroundColor: fadeFor(yrs, cssVar('--c-dev')) }] }, options: barOpts(1) }, 'Universidades como porcentaje del presupuesto público total');
    mkChart('ch-lb-pbi', { type: 'bar', data: { labels: yrs.map(yTick), datasets: [{ label: '% del PBI', data: shPbi.map(v => v === null ? null : +(v * 100).toFixed(3)), backgroundColor: fadeFor(yrs, cssVar('--g1')) }] }, options: barOpts(2) }, 'Universidades como porcentaje del PBI');
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
    const el = $('#body-ranking'); const y = S.year;
    el.innerHTML = `
      <div class="controls">
        <label>Año<select id="rk-year">${yearOptions(y)}</select></label>
        <button type="button" class="btn" id="rk-csv">Descargar CSV</button>
      </div>
      ${partialNote(y)}
      <div id="rk-host"></div>
      <p class="note">* Índice de gestión presupuestal: referencial, NO oficial (ver Metodología). Semáforo de ejecución: ≥ 90 % verde, 75–90 % ámbar, &lt; 75 % rojo.</p>`;
    $('#rk-year', el).addEventListener('change', e => setYear(e.target.value));
    $('#rk-csv', el).addEventListener('click', downloadCsv);
    const rows = S.unis.filter(u => A(u, y)).map(u => ({ u }));
    makeTable($('#rk-host', el), {
      id: 'rk', caption: `Universidades públicas, año ${yearLbl(y)}. Montos en soles.`, rows, rank: true,
      sort: { k: 'pim', dir: -1 }, limit: 20,
      mobilePick: RANK_COLS.filter(c => !['nombre', 'ejec'].includes(c.k)).map(c => c.k), mdef: 'pim',
      filters: [depFilter(r => r.u, rows),
        { k: 'ej', lbl: '% de ejecución', opts: [['', 'Todas'], ['bad', 'Menos de 75 %'], ['warn', '75 % a 90 %'], ['good', 'Más de 90 %']], test: (r, v) => semaforo(kpi(r.u, y).ejec) === v }],
      cols: RANK_COLS.map(c => c.k === 'nombre'
        ? { k: 'nombre', lbl: 'Universidad', sticky: true, m: true, get: r => uName(r.u), html: r => uniCell(r.u) }
        : { k: c.k, lbl: c.lbl, m: c.k === 'ejec', get: r => c.get(r.u, y), html: c.html ? (r => c.html(c.get(r.u, y))) : undefined, fmt: c.f || undefined }),
      onDraw: list => { S.rank.list = list.map(r => r.u); },
    });
  }
  function rankRows() { return S.rank.list || S.unis.filter(u => A(u, S.year)); }
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
    const tUni = uniBy(S.tray.uni);
    const ORD = { pim: ['PIM', u => tot(u, y, 'pim')], pia: ['PIA', u => tot(u, y, 'pia')], dev: ['Devengado', u => tot(u, y, 'dev')],
      d: ['Δ PIM − PIA', u => (num(tot(u, y, 'pim')) !== null && num(tot(u, y, 'pia')) !== null) ? tot(u, y, 'pim') - tot(u, y, 'pia') : null],
      ej: ['% ejecución', u => kpi(u, y).ejec], nombre: ['Nombre', u => uName(u)] };
    el.innerHTML = `
      ${partialNote(y)}
      <div class="controls"><label>Año<select id="tr-year">${yearOptions(y)}</select></label></div>
      <div class="card">
        <h3>PIA → PIM → devengado, ${esc(yearLbl(y))}</h3>
        <div class="controls" style="margin:8px 0">
          <div class="grow up-host" id="tr-hl"></div>
          <label>Ordenar por<select id="tr-ord">${Object.entries(ORD).map(([k, [l]]) => `<option value="${k}"${S.tray.order === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label>Cantidad<select id="tr-n">${[[15, 'Top 15'], [30, 'Top 30'], [0, `Todas (${all.length})`]].map(([v, l]) => `<option value="${v}"${+S.tray.n === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        </div>
        <p class="sub" id="tr-sub"></p>
        <div class="chart"><canvas id="ch-tray"></canvas></div>
      </div>
      <h3 style="margin:20px 0 8px">Variación del presupuesto durante ${esc(yearLbl(y))}</h3>
      <div id="tr-table"></div>
      <div class="grid two" style="margin-top:12px">
        <div class="card">
          <div class="controls" style="margin-bottom:6px"><div class="grow up-host" id="tr-uni"></div></div>
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
    uniPicker($('#tr-uni', el), { id: 'tr-uni-in', label: 'Universidad', value: S.tray.uni, onSelect: p => { if (p) { S.tray.uni = p; renderTrayectoria(); } } });
    const trRows = all.map(u => {
      const a = A(u, y) || {}; const pia = tot(u, y, 'pia'), pim = tot(u, y, 'pim');
      const tr = Array.isArray(a.transferencias) ? a.transferencias : [];
      const d = (num(pim) !== null && num(pia) !== null) ? pim - pia : null;
      return { u, pia, pim, d, dp: div(d, pia), dev: tot(u, y, 'dev'), ej: kpi(u, y).ejec, ntr: tr.length, mtr: sum(tr.map(t => num(t.monto))), nueva: isNueva(u) };
    });
    makeTable($('#tr-table', el), {
      rowClass: r => (num(r.pia) !== null && r.pia < BASE_CHICA) ? 'row-dim' : '',
      id: 'trt', caption: `Universidades públicas, ${yearLbl(y)}. Montos en soles.`, rows: trRows,
      sort: { k: 'pim', dir: -1 }, limit: 25, mobilePick: ['pia', 'pim', 'd', 'dp', 'dev', 'ntr'], mdef: 'd',
      filters: [
        depFilter(r => r.u, trRows),
        { k: 'ej', lbl: '% de ejecución', opts: [['', 'Todas'], ['bad', 'Menos de 75 %'], ['warn', '75 % a 90 %'], ['good', 'Más de 90 %']], test: (r, v) => semaforo(r.ej) === v },
        { k: 'tr', lbl: 'Transferencias', opts: [['', 'Todas'], ['si', 'Solo con transferencias'], ['no', 'Sin transferencias']], test: (r, v) => (v === 'si') === (r.ntr > 0) },
        { k: 'nv', lbl: 'Antigüedad', opts: [['', 'Todas'], ['nueva', 'Solo nuevas (desde 2000)'], ['antigua', 'Solo antiguas']], test: (r, v) => (v === 'nueva') === r.nueva },
      ],
      cols: [
        { k: 'nombre', lbl: 'Universidad', sticky: true, m: true, get: r => uName(r.u), html: r => uniCell(r.u, (r.nueva ? '<span class="tag new">nueva</span>' : '') + (num(r.pia) !== null && r.pia < BASE_CHICA ? baseChip : '')) },
        { k: 'pia', lbl: 'PIA', get: r => r.pia, fmt: fmtM },
        { k: 'pim', lbl: 'PIM', get: r => r.pim, fmt: fmtM },
        { k: 'd', lbl: 'Δ PIM − PIA', get: r => r.d, fmt: v => num(v) === null ? SD : fmtSigned(v) },
        { k: 'dp', lbl: 'Δ %', get: r => r.dp, html: r => fmtVar(r.dp) },
        { k: 'dev', lbl: 'Devengado', get: r => r.dev, fmt: fmtM },
        { k: 'ej', lbl: '% Ejec.', m: true, get: r => r.ej, html: r => pill(r.ej) },
        { k: 'ntr', lbl: 'Transf. con norma', get: r => r.ntr, html: r => r.ntr ? esc(r.ntr + ' · ' + fmtM(r.mtr)) : '<span class="muted">—</span>' },
      ],
    });

    const findU = p => (p ? uniBy(p) : null);
    const drawTray = () => {
      const [ordLbl, f] = ORD[S.tray.order] || ORD.pim;
      const sorted = all.slice().sort((p, q) => {
        const a = f(p), b = f(q);
        if (typeof a === 'string') return a.localeCompare(b, LOC);
        if (num(a) === null) return 1; if (num(b) === null) return -1; return b - a;
      });
      const n = +S.tray.n;
      let list = n > 0 ? sorted.slice(0, n) : sorted;
      const hl = findU(S.tray.hl);
      let extra = false;
      if (hl && !list.includes(hl)) { list = list.concat([hl]); extra = true; }
      $('#tr-sub', el).textContent = `Millones de soles. Ordenado por ${ordLbl}. Mostrando ${list.length - (extra ? 1 : 0)} de ${all.length}${extra ? ` + ${uName(hl)} (resaltada)` : ''}.${hl ? '' : S.tray.hl.trim() ? ' No encontramos esa universidad.' : ''}`;
      const col = (v, u) => (hl && u !== hl) ? cssVar(v) + '59' : cssVar(v);
      const hlBorder = { borderColor: list.map(u => u === hl ? cssVar('--tu-borde') : 'transparent'), borderWidth: list.map(u => u === hl ? 2 : 0) };
      sizeFor('ch-tray', list.length, isMobile() ? 34 : 28);
      mkChart('ch-tray', {
        type: 'bar',
        data: {
          labels: list.map(u => uName(u) + (u === hl ? ' ◀' : '')),
          datasets: [
            Object.assign({ label: 'PIA', data: list.map(u => mill(tot(u, y, 'pia'))), backgroundColor: list.map(u => col('--c-pia', u)) }, hlBorder),
            Object.assign({ label: 'PIM', data: list.map(u => mill(tot(u, y, 'pim'))), backgroundColor: list.map(u => col('--c-pim', u)) }, hlBorder),
            Object.assign({ label: 'Devengado', data: list.map(u => mill(tot(u, y, 'dev'))), backgroundColor: list.map(u => col('--c-dev', u)) }, hlBorder),
          ],
        },
        options: {
          indexAxis: 'y', interaction: { mode: 'index', intersect: false },
          plugins: { tooltip: { callbacks: { label: ttM, title: it => (list[it[0].dataIndex] || {}).nombre || it[0].label,
            afterBody: it => { const u = list[it[0].dataIndex]; const k = kpi(u, y); return [`Ejecución: ${fmtP(k.ejec)}`, `PIM − PIA: ${fmtDelta(tot(u, y, 'pim'), tot(u, y, 'pia'))}`]; } } } },
          scales: { x: { position: 'top', ticks: { callback: tickM, maxTicksLimit: isMobile() ? 4 : 8 } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: ctx => ({ weight: list[ctx.index] === hl ? 800 : 500 }) } } },
          onClick: (e, els) => { if (els.length) { S.tray.uni = list[els[0].index].pliego; renderTrayectoria(); } },
        },
      }, `PIA, PIM y devengado por universidad en ${y}`);
    };
    drawTray();
    uniPicker($('#tr-hl', el), { id: 'tr-hl-in', label: 'Resaltar universidad', value: S.tray.hl || null, placeholder: 'Escribe para resaltar una', onSelect: p => { S.tray.hl = p || ''; drawTray(); } });
    $('#tr-ord', el).addEventListener('change', e => { S.tray.order = e.target.value; drawTray(); });
    $('#tr-n', el).addEventListener('change', e => { S.tray.n = +e.target.value; drawTray(); });

    const yrs = S.years;
    mkChart('ch-tray-uni', {
      type: 'bar',
      data: {
        labels: yrs.map(yTick),
        datasets: [
          { type: 'line', label: 'PIA', data: yrs.map(yy => mill(tot(tUni, yy, 'pia'))), borderColor: cssVar('--c-pia'), backgroundColor: cssVar('--c-pia'), borderDash: [4, 3], pointRadius: 2, tension: .2, order: 0 },
          { label: 'PIM', data: yrs.map(yy => mill(tot(tUni, yy, 'pim'))), backgroundColor: fadeFor(yrs, cssVar('--c-pim')), borderRadius: 3, order: 2 },
          { label: 'Devengado', data: yrs.map(yy => mill(tot(tUni, yy, 'dev'))), backgroundColor: fadeFor(yrs, cssVar('--c-dev')), borderRadius: 3, order: 1 },
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
    const all = lim(unisByPim(y));
    const presentCats = cats.filter(c => S.unis.some(u => S.years.some(yy => pick((A(u, yy) || {})[field], c.frag))));
    const share = (u, c) => { const a = A(u, y) || {}; const t = sum(presentCats.map(cc => (pick(a[field], cc.frag) || {})[st.metric])); const v = (pick(a[field], c.frag) || {})[st.metric]; const d = div(v, t); return d === null ? null : +(d * 100).toFixed(2); };
    sizeFor(cfg.key + '-pct', all.length, isMobile() ? 28 : 24);
    mkChart(cfg.key + '-pct', {
      type: 'bar',
      data: { labels: all.map(uName), datasets: presentCats.map(c => ({ label: c.lbl, data: all.map(u => share(u, c)), backgroundColor: cssVar(c.c), borderWidth: 0, borderRadius: 2 })) },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttP, title: it => (all[it[0].dataIndex] || {}).nombre || it[0].label } } },
        scales: { x: { stacked: true, min: 0, max: 100, ticks: { callback: tickP } }, y: { stacked: true, ticks: { autoSkip: false } } },
      },
    }, cfg.title);

    const yrs = S.years; const u = st.uni ? uniBy(st.uni) : null; const pool = u ? [u] : S.unis;
    mkChart(cfg.key + '-evo', {
      type: 'bar',
      data: { labels: yrs.map(yTick), datasets: presentCats.map(c => ({ label: c.lbl, data: yrs.map(yy => mill(sum(pool.map(x => (pick((A(x, yy) || {})[field], c.frag) || {})[st.metric])))), backgroundColor: fadeFor(yrs, cssVar(c.c)), borderRadius: 2 })) },
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
        ${topSeg(unisByPim(y).length)}
      </div>
      <div class="grid two">
        <div class="card">
          <h3>Composición por universidad, ${esc(yearLbl(y))}</h3>
          <p class="sub">Porcentaje del ${st.metric === 'pim' ? 'PIM' : st.metric === 'pia' ? 'PIA' : 'devengado'} de cada universidad. ${limNote(lim(unisByPim(y)).length, unisByPim(y).length)}</p>
          <div class="chart"><canvas id="${key}-pct"></canvas></div>
          ${legendHtml(cats)}
        </div>
        <div class="card">
          <div class="controls" style="margin-bottom:6px"><div class="grow up-host c-uni"></div></div>
          <h3>Evolución ${st.uni ? esc(uName(uniBy(st.uni))) : 'del conjunto'}</h3>
          <p class="sub">Millones de soles por año (${st.metric === 'pim' ? 'PIM' : st.metric === 'pia' ? 'PIA' : 'devengado'}).</p>
          <div class="chart"><canvas id="${key}-evo"></canvas></div>
          ${legendHtml(cats)}
        </div>
      </div>${extra}`;
  }
  function bindComp(el, st, rerender) {
    $('.c-year', el).addEventListener('change', e => setYear(e.target.value));
    uniPicker($('.c-uni', el), { label: 'Ver evolución de', value: st.uni || '', allLabel: 'Todas las universidades (suma)', onSelect: p => { st.uni = p || ''; rerender(); } });
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
    const all = lim(unisByPim(y));
    // RDR comparable: sin saldos de balance (caja acumulada de años previos) cuando el dato existe
    const ing = u => (A(u, y) || {}).ingresos || {};
    const rdrFull = u => pick(ing(u).fuente, 'DIRECTAMENTE') || {};
    const rdr = u => ing(u).rdr_sin_saldos || rdrFull(u);
    const sinSaldos = all.some(u => ing(u).rdr_sin_saldos);
    const hasRdr = all.some(u => num(rdr(u).recaudado) !== null || num(rdr(u).pim) !== null);
    // Composición del RDR recaudado por categoría (sin saldos de balance)
    const catTot = {};
    all.forEach(u => Object.entries(ing(u).rdr_categoria || {}).forEach(([k, v]) => {
      if (/saldos de balance/i.test(k)) return;
      catTot[k] = (catTot[k] || 0) + (num(v && v.recaudado) || 0);
    }));
    const topCats = Object.keys(catTot).sort((a, b) => catTot[b] - catTot[a]).slice(0, 6);
    const RCOL = ['--f2', '--g1', '--g3', '--g5', '--g2', '--g7', '--g4'];
    const rcats = topCats.map((k, i) => ({ k, lbl: k, c: RCOL[i] }));
    if (Object.keys(catTot).length > topCats.length) rcats.push({ k: '__otros', lbl: 'Otros conceptos', c: RCOL[6] });
    const catShare = (u, c) => {
      const e = Object.entries(ing(u).rdr_categoria || {}).filter(([k]) => !/saldos de balance/i.test(k));
      const t = sum(e.map(([, v]) => num(v && v.recaudado)));
      const v = c.k === '__otros' ? sum(e.filter(([k]) => !topCats.includes(k)).map(([, v]) => num(v && v.recaudado))) : num(((ing(u).rdr_categoria || {})[c.k] || {}).recaudado);
      const d = div(v, t); return d === null ? null : +(d * 100).toFixed(2);
    };
    const extra = `
      <div class="card" style="margin-top:12px">
        <h3>Ingresos propios (RDR): presupuestado vs recaudado, ${esc(yearLbl(y))}</h3>${cats.length ? '' : topSeg(unisByPim(y).length)}
        <p class="sub">PIM de ingresos RDR frente a lo efectivamente recaudado${sinSaldos ? ', <strong>sin saldos de balance</strong> (la caja acumulada de años anteriores infla el “recaudado” y no es comparable)' : ''}. Si se recauda menos de lo presupuestado, parte del gasto previsto no tiene financiamiento.</p>
        ${hasRdr ? '<div class="chart"><canvas id="ch-rdr"></canvas></div>' : '<p class="empty">Aún no hay datos de ingresos recaudados.</p>'}
      </div>
      ${rcats.length ? `<div class="card" style="margin-top:12px">
        <h3>¿De qué se compone el RDR? ${esc(yearLbl(y))}</h3>
        <p class="sub">Porcentaje de lo recaudado por concepto (admisión, CEPRE, servicios académicos, etc.), sin saldos de balance.</p>
        <div class="chart"><canvas id="ch-rdr-cat"></canvas></div>
        ${legendHtml(rcats)}
      </div>` : ''}
      ${hasRdr ? `<h3 style="margin:20px 0 8px">Recaudación de ingresos propios (RDR), ${esc(yearLbl(y))}</h3><div id="rdr-host"></div>` : ''}`;
    if (!cats.length) { el.innerHTML = '<p class="empty">Aún no hay datos por fuente de financiamiento.</p>' + extra; }
    else {
      el.innerHTML = compShell('ch-fue', cats, st, [['pim', 'PIM'], ['dev', 'Devengado'], ['pia', 'PIA']], extra);
      bindComp(el, st, renderFuentes);
      compBlock({ key: 'ch-fue', el, cats, field: 'fuente', st, title: 'Composición del presupuesto por fuente de financiamiento', evoTitle: 'Evolución por fuente de financiamiento' });
    }
    if (hasRdr) {
      const rdrRows = unisByPim(y).map(u => { const r = rdr(u); return { u, pia: num(r.pia), pim: num(r.pim), rec: num(r.recaudado), ratio: div(r.recaudado, r.pim) ?? kpi(u, y).rdr_recaudado_vs_pim, full: num(rdrFull(u).recaudado), pct: kpi(u, y).pct_rdr }; });
      makeTable($('#rdr-host', el), {
        id: 'rdrt', caption: `Ingresos RDR ${yearLbl(y)}${sinSaldos ? ', sin saldos de balance' : ''}. Montos en soles.`, rows: rdrRows, sort: { k: 'rec', dir: -1 }, limit: 20,
        mobilePick: ['pia', 'pim', 'rec', 'full', 'pct'], mdef: 'rec',
        filters: [depFilter(r => r.u, rdrRows), { k: 'cum', lbl: 'Recaudación', opts: [['', 'Todas'], ['bajo', 'Recaudó menos de lo presupuestado'], ['alto', 'Recaudó igual o más']], test: (r, v) => num(r.ratio) !== null && ((v === 'bajo') === (r.ratio < 1)) }],
        cols: [
          { k: 'nombre', lbl: 'Universidad', sticky: true, m: true, get: r => uName(r.u), html: r => uniCell(r.u) },
          { k: 'pia', lbl: 'PIA ingresos RDR', get: r => r.pia, fmt: fmtM },
          { k: 'pim', lbl: 'PIM ingresos RDR', get: r => r.pim, fmt: fmtM },
          { k: 'rec', lbl: sinSaldos ? 'Recaudado (sin saldos)' : 'Recaudado', get: r => r.rec, fmt: fmtM },
          { k: 'ratio', lbl: 'Recaudado / PIM', m: true, get: r => r.ratio, html: r => pill(r.ratio) },
        ].concat(sinSaldos ? [{ k: 'full', lbl: 'Recaudado incl. saldos', get: r => r.full, fmt: fmtM }] : [])
          .concat([{ k: 'pct', lbl: '% RDR en PIM de gasto', get: r => r.pct, fmt: fmtP }]),
      });
      sizeFor('ch-rdr', all.length, isMobile() ? 30 : 26);
      mkChart('ch-rdr', {
        type: 'bar',
        data: { labels: all.map(uName), datasets: [
          { label: 'PIM ingresos RDR', data: all.map(u => mill(num(rdr(u).pim))), backgroundColor: cssVar('--c-pia'), borderRadius: 3 },
          { label: 'Recaudado', data: all.map(u => mill(num(rdr(u).recaudado))), backgroundColor: cssVar('--f2'), borderRadius: 3 },
        ] },
        options: {
          indexAxis: 'y', interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttM, title: it => (all[it[0].dataIndex] || {}).nombre || it[0].label } } },
          scales: { x: { ticks: { callback: tickM, maxTicksLimit: isMobile() ? 4 : 8 } }, y: { ticks: { autoSkip: false } } },
        },
      }, 'Ingresos RDR presupuestados frente a recaudados por universidad');
    }
    if (rcats.length) {
      sizeFor('ch-rdr-cat', all.length, isMobile() ? 28 : 24);
      mkChart('ch-rdr-cat', {
        type: 'bar',
        data: { labels: all.map(uName), datasets: rcats.map(c => ({ label: c.lbl, data: all.map(u => catShare(u, c)), backgroundColor: cssVar(c.c), borderWidth: 0, borderRadius: 2 })) },
        options: {
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ttP, title: it => (all[it[0].dataIndex] || {}).nombre || it[0].label } } },
          scales: { x: { stacked: true, min: 0, max: 100, ticks: { callback: tickP } }, y: { stacked: true, ticks: { autoSkip: false } } },
        },
      }, 'Composición de los ingresos RDR recaudados por concepto');
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
    const top = proys.filter(p => num(p.pim) !== null && p.pim > 0);
    const hayProy = all.some(u => Array.isArray((A(u, y) || {}).proyectos));
    const bajo = proys.filter(p => num(p.av) !== null && p.av < 0.3 && (num(p.pim) || 0) > 0).length;
    const ordered = lim(all).sort((a, b) => (kpi(b, y).ejec_inversion ?? -1) - (kpi(a, y).ejec_inversion ?? -1));
    el.innerHTML = `
      ${partialNote(y)}
      <div class="controls"><label>Año<select id="in-year">${yearOptions(y)}</select></label>${topSeg(all.length)}</div>
      <div class="kpis">
        ${kpiBox('PIM en activos (2.6)', fmtM(pimInv), 'todas las universidades', 'accent')}
        ${kpiBox('Devengado en activos', fmtM(devInv), 'ejecución ' + fmtP(div(devInv, pimInv)), 'ochre')}
        ${kpiBox('Saldo sin ejecutar', fmtM(num(pimInv) !== null && num(devInv) !== null ? pimInv - devInv : null), 'PIM − devengado')}
        ${kpiBox('Proyectos con presupuesto', fmtN(hayProy ? proys.length : null), y + '')}
        ${kpiBox('Proyectos con avance < 30 %', fmtN(hayProy ? bajo : null), 'avance financiero')}
        ${kpiBox('Peso de la inversión', fmtP(div(devInv, nacional(y).dev)), 'del devengado total')}
      </div>
      <div class="card">
        <h3>Ejecución de la inversión por universidad, ${esc(yearLbl(y))}</h3>
        <p class="sub">Devengado / PIM de la genérica 2.6 (adquisición de activos no financieros). ${limNote(ordered.length, all.length)}</p>
        <div class="chart"><canvas id="ch-inv"></canvas></div>
      </div>
      <h3 style="margin:20px 0 8px">Proyectos de inversión, ${esc(yearLbl(y))}</h3>
      ${top.length ? '<p class="sub">Ordenados por saldo sin ejecutar (PIM − devengado). Avance financiero, no físico.</p><div id="pr-host"></div>' : hayProy ? '<p class="empty">El MEF no registra proyectos con saldo para este año.</p>' : '<p class="empty">Aún no tenemos el detalle de proyectos de inversión; la inversión total (genérica 2.6) sí se muestra arriba.</p>'}`;
    $('#in-year', el).addEventListener('change', e => setYear(e.target.value));
    if (top.length) makeTable($('#pr-host', el), {
      id: 'prt', caption: `Proyectos de inversión con presupuesto en ${yearLbl(y)}. Montos en soles.`, rows: top, sort: { k: 'saldo', dir: -1 }, limit: 20,
      search: { ph: 'Proyecto, código o universidad', text: p => [p.nombre, p.codigo, p.u.nombre, p.u.corto, p.u.departamento].join(' ') },
      mobilePick: ['pim', 'dev', 'saldo', 'av'], mdef: 'saldo',
      filters: [depFilter(p => p.u, top), { k: 'av', lbl: 'Avance', opts: [['', 'Todos'], ['0', 'Sin avance (0 %)'], ['30', 'Menos de 30 %'], ['90', '90 % o más']], test: (p, v) => num(p.av) !== null && (v === '0' ? p.av === 0 : v === '30' ? p.av < 0.3 : p.av >= 0.9) }],
      cols: [
        { k: 'proy', lbl: 'Proyecto', sticky: true, m: true, get: p => p.nombre || '', html: p => `<span class="proy-n">${esc(p.nombre || SD)}</span><span class="uni-sub">${esc(p.codigo || '')} · <a href="#u=${encodeURIComponent(p.u.pliego)}">${esc(uName(p.u))}</a></span>` },
        { k: 'pim', lbl: 'PIM', get: p => num(p.pim), fmt: fmtM },
        { k: 'dev', lbl: 'Devengado', get: p => num(p.dev), fmt: fmtM },
        { k: 'saldo', lbl: 'Saldo', m: true, get: p => p.saldo, html: p => `<strong>${esc(fmtM(p.saldo))}</strong>` },
        { k: 'av', lbl: 'Avance', get: p => p.av, html: p => `<span class="score"><b>${esc(fmtP(p.av, 0))}</b><span class="bar"><span style="width:${Math.max(0, Math.min(100, (p.av || 0) * 100))}%"></span></span></span>` },
      ],
    });
    const vals = ordered.map(u => { const v = kpi(u, y).ejec_inversion; return v === null || v === undefined ? null : +(v * 100).toFixed(1); });
    sizeFor('ch-inv', ordered.length, isMobile() ? 26 : 22);
    mkChart('ch-inv', {
      type: 'bar',
      data: { labels: ordered.map(uName), datasets: [{ label: 'Ejecución de inversión', data: vals, borderRadius: 6, valueLabel: v => Math.round(v) + ' %',
        backgroundColor: vals.map(v => cssVar('--' + ({ good: 'sem-good', warn: 'sem-warn', bad: 'sem-bad', na: 'line-strong' })[semaforo(v === null ? null : v / 100)])) }] },
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
    const pp = (u, yy = y) => idiOf(A(u, yy));
    const pimT = sum(all.map(u => pp(u).pim)), devT = sum(all.map(u => pp(u).dev));
    const pubsT = sum(all.map(u => (A(u, y) || {}).pubs));
    const devConPubs = sum(all.filter(u => num((A(u, y) || {}).pubs)).map(u => pp(u).dev));
    const ordered = all.slice().sort((a, b) => (num(pp(b).pim) || 0) - (num(pp(a).pim) || 0) || (tot(b, y, 'pim') || 0) - (tot(a, y, 'pim') || 0)).slice(0, S.top > 0 ? S.top : undefined);
    el.innerHTML = `
      ${partialNote(y)}
      <div class="controls"><label>Año<select id="id-year">${yearOptions(y)}</select></label>${topSeg(all.length)}</div>
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
          <p class="sub">Millones de soles por universidad. ${limNote(ordered.length, all.length)}</p>
          <div class="chart"><canvas id="ch-idi"></canvas></div>
        </div>
        <div class="card">
          <h3>Evolución del PP 0137 (todas)</h3>
          <p class="sub">PIM y devengado del programa de ciencia, tecnología e innovación.</p>
          <div class="chart"><canvas id="ch-idi-evo"></canvas></div>
        </div>
      </div>
      <h3 style="margin:20px 0 8px">Investigación por universidad, ${esc(yearLbl(y))}</h3><div id="idi-host"></div>
      <p class="note">El costo por publicación es una aproximación: el PP 0137 financia también equipamiento, tesis y proyectos cuyos resultados se publican en años posteriores, y no todo el gasto en investigación se registra en el PP 0137 (también hay canon y fondos concursables externos).</p>`;
    $('#id-year', el).addEventListener('change', e => setYear(e.target.value));
    const idiRows = all.map(u => { const k = kpi(u, y); return { u, pim: num(pp(u).pim), dev: num(pp(u).dev), ej: k.ejec_idi, pct: k.pct_idi, pubs: num((A(u, y) || {}).pubs), cpp: k.idi_por_pub }; });
    makeTable($('#idi-host', el), {
      id: 'idt', caption: `PP 0137 y publicaciones, ${yearLbl(y)}.`, rows: idiRows, sort: { k: 'pim', dir: -1 }, limit: 20,
      mobilePick: ['pim', 'dev', 'pct', 'pubs', 'cpp'], mdef: 'dev',
      filters: [depFilter(r => r.u, idiRows), { k: 'con', lbl: 'Dato I+D', opts: [['', 'Todas'], ['si', 'Con presupuesto I+D'], ['no', 'Sin presupuesto I+D']], test: (r, v) => (v === 'si') === ((r.pim || 0) > 0) }],
      cols: [
        { k: 'nombre', lbl: 'Universidad', sticky: true, m: true, get: r => uName(r.u), html: r => uniCell(r.u) },
        { k: 'pim', lbl: 'PIM 0137', get: r => r.pim, fmt: fmtM },
        { k: 'dev', lbl: 'Devengado 0137', get: r => r.dev, fmt: fmtM },
        { k: 'ej', lbl: 'Ejec. I+D', m: true, get: r => r.ej, html: r => pill(r.ej) },
        { k: 'pct', lbl: '% I+D del gasto', get: r => r.pct, fmt: v => fmtP(v, 2) },
        { k: 'pubs', lbl: 'Publicaciones', get: r => r.pubs, fmt: fmtN },
        { k: 'cpp', lbl: 'S/ por publicación', get: r => r.cpp, fmt: fmtS },
      ],
    });
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

  // ================================================================== EXPECTATIVA 2027
  const EXP_VERSION = {
    proyecto: ['Proyecto de ley', 'Es la propuesta del Poder Ejecutivo: puede cambiar durante el debate en el Congreso.'],
    dictamen: ['Dictamen', 'Aprobado por la Comisión de Presupuesto del Congreso; aún debe votarse en el Pleno y puede cambiar.'],
    autografa: ['Autógrafa', 'Aprobada por el Pleno del Congreso; pendiente de promulgación y publicación.'],
    ley: ['Ley publicada', 'Ley de Presupuesto aprobada y publicada. Son los montos de apertura oficiales de 2027.'],
  };
  const expOf = u => (u && u.expectativa_2027 && typeof u.expectativa_2027 === 'object') ? u.expectativa_2027 : null;
  // Variación como fracción: se calcula con los montos; si faltan, var_pct (acepta % o fracción)
  function expVar(e) {
    if (!e) return null;
    const v = div(num(e.pia_2027) !== null && num(e.pia_2026) !== null ? e.pia_2027 - e.pia_2026 : null, e.pia_2026);
    if (v !== null) return v;
    const p = num(e.var_pct);
    return p === null ? null : (Math.abs(p) > 1.5 ? p / 100 : p);
  }
  const fmtVar = v => num(v) === null ? SD : `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${esc(fmtChg(v))}</span>`;
  const fmtVarTxt = fmtChg;
  const fmtDelta = (a, b) => (num(a) === null || num(b) === null) ? SD : fmtSigned(a - b);
  const linkOrText = (url, txt) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(txt)}</a>` : esc(txt); };
  function versionBox(x) {
    const v = String(x.version || '').toLowerCase();
    const [badge, text] = EXP_VERSION[v] || [x.version || 'Documento', 'Versión del documento no identificada: trata las cifras como referenciales.'];
    return `<div class="version${v === 'ley' ? ' v-ley' : ''}" role="note"><span class="v-badge">${esc(badge)}</span><div><p><strong>${linkOrText(x.url, x.norma || 'Presupuesto del Sector Público 2027')}</strong>${x.fecha ? ` · ${esc(x.fecha)}` : ''}</p><p class="v-sub">${esc(text)}</p></div></div>`;
  }
  function renderExpectativa() {
    const el = $('#body-expectativa'); const x = S.data.expectativa_2027;
    if (!x) return;
    const rows = S.unis.filter(u => expOf(u) && (num(expOf(u).pia_2027) !== null || num(expOf(u).pia_2026) !== null));
    const t = x.total_universidades || {};
    const p27 = num(t.pia_2027) ?? sum(rows.map(u => expOf(u).pia_2027));
    const p26 = num(t.pia_2026) ?? sum(rows.map(u => expOf(u).pia_2026));
    const vT = expVar({ pia_2027: p27, pia_2026: p26, var_pct: t.var_pct });
    const withVar = rows.filter(u => expVar(expOf(u)) !== null);
    const nUp = withVar.filter(u => expVar(expOf(u)) > 0).length, nDown = withVar.filter(u => expVar(expOf(u)) < 0).length;
    const sorted = withVar.slice().sort((a, b) => expVar(expOf(b)) - expVar(expOf(a)));
    const N = isMobile() ? 8 : 10;
    const chartList = sorted.length > 2 * N ? sorted.slice(0, N).concat(sorted.slice(-N)) : sorted;
    const disp = Array.isArray(x.disposiciones) ? x.disposiciones : [];
    const docs = Array.isArray(x.documentos) ? x.documentos : [];
    const notas = Array.isArray(x.notas) ? x.notas : [];
    el.innerHTML = `
      ${versionBox(x)}
      <div class="kpis">
        ${kpiBox('PIA 2027 (universidades)', fmtM(p27), rows.length + ' universidades', 'accent')}
        ${kpiBox('PIA 2026', fmtM(p26), 'apertura del año en curso')}
        ${kpiBox('Variación', fmtChg(vT), fmtDelta(p27, p26), 'ochre')}
        ${kpiBox('Suben', fmtN(withVar.length ? nUp : null), 'universidades con más PIA')}
        ${kpiBox('Bajan', fmtN(withVar.length ? nDown : null), 'universidades con menos PIA')}
        ${kpiBox('Sin PIA 2027', fmtN(S.unis.filter(u => num((expOf(u) || {}).pia_2027) === null).length), 'de ' + S.unis.length + ' universidades')}
      </div>
      <div class="card">
        <h3>Mayores subidas y bajadas del PIA 2027 frente al PIA 2026</h3>
        <p class="sub">Variación porcentual. ${chartList.length < sorted.length ? `Las ${N} que más suben y las ${N} que más bajan.` : ''} Una subida grande en una universidad pequeña puede ser poco dinero: revisa los montos en la tabla.</p>
        <div class="chart"><canvas id="ch-exp"></canvas></div>
      </div>
      <h3 style="margin:20px 0 8px">Todas las universidades</h3>
      <div id="ex-host"></div>
      <div class="card" style="margin-top:12px" id="ex-ley">
        <h3>¿Qué dice la ley sobre el gasto de las universidades?</h3>
        ${disp.length ? `<p class="sub">${disp.length} disposiciones${x.version && String(x.version).toLowerCase() !== 'ley' ? ' (pueden cambiar en el Congreso)' : ''}. Filtra por tema.</p>
          <div class="chips" role="group" aria-label="Filtrar por tema" id="ex-temas"></div>
          <div class="disp-grid" id="ex-disp" aria-live="polite"></div>` : '<p class="empty">Aún no se han extraído disposiciones del documento.</p>'}
      </div>
      <div class="grid two" style="margin-top:12px">
        <div class="card"><h3>Documentos</h3>
          ${docs.length ? '<ul class="tlist">' + docs.map(d => `<li><span class="t-top"><strong>${linkOrText(d.url, d.titulo || 'Documento')}</strong>${d.tipo ? `<span class="pill na">${esc(d.tipo)}</span>` : ''}</span></li>`).join('') + '</ul>' : '<p class="empty">Sin documentos enlazados.</p>'}
          ${notas.length ? '<ul class="note" style="padding-left:18px">' + notas.map(n => `<li>${esc(n)}</li>`).join('') + '</ul>' : ''}
        </div>
      </div>`;
    if (disp.length) {
      const temaDe = d => String(d.tema || 'Otras').trim() || 'Otras';
      const temas = [...new Set(disp.map(temaDe))].sort((a, b) => a.localeCompare(b, LOC));
      S.exp.tema = temas.includes(S.exp.tema) ? S.exp.tema : '';
      const drawDisp = () => {
        $('#ex-temas', el).innerHTML = [['', `Todos (${disp.length})`]].concat(temas.map(t => [t, `${t} (${disp.filter(d => temaDe(d) === t).length})`]))
          .map(([v, l]) => `<button type="button" class="chip" data-t="${esc(v)}" aria-pressed="${S.exp.tema === v}">${esc(l)}</button>`).join('');
        const list = disp.filter(d => !S.exp.tema || temaDe(d) === S.exp.tema);
        const groups = S.exp.tema ? [S.exp.tema] : temas;
        $('#ex-disp', el).innerHTML = groups.map(t => {
          const items = list.filter(d => temaDe(d) === t); if (!items.length) return '';
          return `<h4 class="disp-tema">${esc(t)}</h4>` + items.map(d => `<article class="disp">
            <header><strong>${linkOrText(d.url, d.articulo || 'Disposición')}</strong>${num(d.monto) !== null ? `<span class="disp-monto">${esc(soles(d.monto))}</span>` : ''}</header>
            ${d.resumen ? `<p>${esc(d.resumen)}</p>` : ''}
            ${d.cita ? `<blockquote>${esc(d.cita)}</blockquote>` : ''}
          </article>`).join('');
        }).join('');
      };
      drawDisp();
      $('#ex-temas', el).addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (!b) return; S.exp.tema = b.dataset.t; drawDisp(); });
    }
    const exRows = rows.map(u => { const e = expOf(u); return { u, p26: num(e.pia_2026), p27: num(e.pia_2027), d: (num(e.pia_2027) !== null && num(e.pia_2026) !== null) ? e.pia_2027 - e.pia_2026 : null, v: expVar(e) }; });
    makeTable($('#ex-host', el), {
      rowClass: r => (num(r.p26) !== null && r.p26 < BASE_CHICA) ? 'row-dim' : '',
      id: 'ext', caption: 'PIA 2027 vs PIA 2026 por universidad. Montos en soles.', rows: exRows, sort: { k: 'v', dir: -1 }, limit: 25,
      mobilePick: ['p26', 'p27', 'd'], mdef: 'p27',
      filters: [depFilter(r => r.u, exRows), { k: 'dir', lbl: 'Dirección', opts: [['', 'Todas'], ['up', 'Suben'], ['down', 'Bajan']], test: (r, v) => num(r.v) !== null && ((v === 'up') === (r.v > 0)) }],
      cols: [
        { k: 'nombre', lbl: 'Universidad', sticky: true, m: true, get: r => uName(r.u), html: r => uniCell(r.u, num(r.p26) !== null && r.p26 < BASE_CHICA ? baseChip : '') },
        { k: 'p26', lbl: 'PIA 2026', get: r => r.p26, fmt: fmtM },
        { k: 'p27', lbl: 'PIA 2027', get: r => r.p27, html: r => `<strong>${esc(fmtM(r.p27))}</strong>` },
        { k: 'd', lbl: 'Δ S/', get: r => r.d, fmt: v => num(v) === null ? SD : fmtSigned(v) },
        { k: 'v', lbl: 'Δ %', m: true, get: r => r.v, html: r => fmtVar(r.v) },
      ],
    });
    const vals = chartList.map(u => +(expVar(expOf(u)) * 100).toFixed(1));
    sizeFor('ch-exp', chartList.length, isMobile() ? 26 : 22);
    mkChart('ch-exp', {
      type: 'bar',
      data: { labels: chartList.map(uName), datasets: [{ label: 'Variación PIA 2027 vs 2026', data: vals, borderRadius: 6, valueLabel: v => fmtChg(v / 100), backgroundColor: vals.map(v => cssVar(v >= 0 ? '--good' : '--bad')) }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: it => (chartList[it[0].dataIndex] || {}).nombre || it[0].label,
          label: ctx => { const e = expOf(chartList[ctx.dataIndex]); return [`Variación: ${fmtChg(ctx.raw / 100)}`, `PIA 2026: ${fmtM(num(e.pia_2026))}`, `PIA 2027: ${fmtM(num(e.pia_2027))}`]; },
        } } },
        scales: { x: { ticks: { callback: tickP } }, y: { ticks: { autoSkip: false } } },
      },
    }, 'Universidades con mayor subida y bajada del PIA 2027 frente al PIA 2026');
  }
  // Bloque "2027 esperado" dentro de la ficha
  function fichaExpHtml(u) {
    const x = S.data.expectativa_2027; const e = expOf(u);
    if (!x || !e) return '';
    const v = String(x.version || '').toLowerCase();
    const a26 = A(u, 2026) || {};
    const tbl = (obj, base, title) => {
      const ent = obj && typeof obj === 'object' ? Object.entries(obj).filter(([, n]) => num(n) !== null) : [];
      if (!ent.length) return '';
      return `<div class="table-wrap" style="margin-top:10px"><table><caption>${esc(title)}</caption><thead><tr><th class="txt" scope="col">Concepto</th><th scope="col">PIA 2026</th><th scope="col">PIA 2027</th><th scope="col">Δ %</th></tr></thead><tbody>${ent.sort((p, q) => q[1] - p[1]).map(([k, n]) => {
        const b = num((pick(base, k.slice(0, 12)) || {}).pia);
        return `<tr><td class="txt wrap">${esc(k)}</td><td>${esc(fmtM(b))}</td><td>${esc(fmtM(n))}</td><td>${fmtVar(div(b !== null ? n - b : null, b))}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    };
    return `<div class="card" style="margin-top:12px" id="ficha-2027">
      <h3>2027 esperado</h3>
      <p class="sub">${esc((EXP_VERSION[v] || [x.version || 'Documento'])[0])}${v !== 'ley' ? ' — cifras sujetas a cambio' : ''}. <a href="#expectativa">Ver la sección completa</a>.</p>
      <div class="kpis">
        ${kpiBox('PIA 2026', fmtM(num(e.pia_2026)), '', 'accent')}
        ${kpiBox('PIA 2027', fmtM(num(e.pia_2027)), x.norma || '', 'ochre')}
        <div class="kpi"><span class="k-lbl">Variación</span><span class="k-val">${fmtVar(expVar(e))}</span><span class="k-note">${esc(fmtDelta(e.pia_2027, e.pia_2026))}</span></div>
      </div>
      <div class="grid two">${tbl(e.generica, a26.generica, 'Por genérica de gasto')}${tbl(e.fuente, a26.fuente, 'Por fuente de financiamiento')}</div>
    </div>`;
  }

  // ================================================================== 8. FICHA + COMPARADOR
  const IDX_LBL = { ejecucion: 'Ejecución', inversion: 'Inversión', investigacion: 'Investigación', prioridad_idi: 'Prioridad I+D', autonomia_rdr: 'Autonomía (RDR)', eficiencia: 'Eficiencia I+D' };
  const idxComp = () => {
    const m = S.data && S.data.indice_metodo;
    const keys = m && typeof m === 'object' && Object.keys(m).length ? Object.keys(m)
      : [...new Set(S.unis.flatMap(u => Object.keys((u.indice && u.indice.componentes) || {})))];
    return (keys.length ? keys : Object.keys(IDX_LBL)).map(k => [k, IDX_LBL[k] || k.replace(/_/g, ' ')]);
  };
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
        <div class="grow up-host" id="fi-uni"></div>
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
        <p class="share"><a href="${esc(link)}" id="fi-link">Enlace directo a esta ficha</a> <button type="button" class="btn" id="fi-copy">Copiar enlace</button> <span id="fi-seo"></span></p>
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
        ${kpiBox('Índice (referencial)', fmtScore(num(idx.score)), num(idx.rank) ? `puesto ${idx.rank} de ${S.unis.filter(x => num(x.indice && x.indice.score) !== null).length} con índice` : '', 'ochre')}
      </div>
      <div class="grid two">
        <div class="card"><h3>PIA, PIM y devengado</h3><p class="sub">Millones de soles por año.</p><div class="chart"><canvas id="ch-fi-ser"></canvas></div></div>
        <div class="card"><h3>Ejecución anual</h3><p class="sub">Total, inversión e I+D (devengado / PIM).</p><div class="chart"><canvas id="ch-fi-ejec"></canvas></div></div>
        <div class="card"><h3>Gasto por genérica</h3><p class="sub">Devengado, millones de soles.</p><div class="chart"><canvas id="ch-fi-gen"></canvas></div>${legendHtml(GENERICAS)}</div>
        <div class="card"><h3>Fuentes de financiamiento</h3><p class="sub">PIM, millones de soles.</p><div class="chart"><canvas id="ch-fi-fue"></canvas></div>${legendHtml(FUENTES.filter(c => S.years.some(yy => pick((A(u, yy) || {}).fuente, c.frag))))}</div>
      </div>
      <div class="grid two" style="margin-top:12px">
        <div class="card"><h3>Programas presupuestales, ${esc(y)}</h3>
          ${a.programa === undefined || a.programa === null ? '<p class="empty">Aún no tenemos el detalle por programa presupuestal para esta universidad.</p>' : progs.length ? `<div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Programa</th><th scope="col">PIM</th><th scope="col">Devengado</th><th scope="col">Ejec.</th></tr></thead><tbody>${progs.map(([n, v]) => `<tr><td class="wrap">${esc(n)}</td><td>${esc(fmtM(num(v && v.pim)))}</td><td>${esc(fmtM(num(v && v.dev)))}</td><td>${pill(div(v && v.dev, v && v.pim))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sin datos por programa.</p>'}
        </div>
        <div class="card"><h3>Transferencias y normas, ${esc(y)}</h3>${transfersHtml(a.transferencias)}</div>
      </div>
      <div class="card" style="margin-top:12px"><h3>Proyectos de inversión, ${esc(y)}</h3>
        ${!Array.isArray(a.proyectos) ? `<p class="empty">Aún no tenemos el detalle de proyectos de esta universidad. La inversión total (genérica 2.6) sí está: PIM ${esc(fmtM(num((pick(a.generica, '2.6') || {}).pim)))}, devengado ${esc(fmtM(num((pick(a.generica, '2.6') || {}).dev)))}.</p>` : proys.length ? `<div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Código</th><th class="txt" scope="col">Proyecto</th><th scope="col">PIA</th><th scope="col">PIM</th><th scope="col">Devengado</th><th scope="col">Avance</th></tr></thead><tbody>${proys.slice().sort((p, q) => (num(q.pim) || 0) - (num(p.pim) || 0)).map(p => `<tr><td class="txt">${esc(p.codigo || SD)}</td><td class="wrap">${esc(p.nombre || SD)}</td><td>${esc(fmtM(num(p.pia)))}</td><td>${esc(fmtM(num(p.pim)))}</td><td>${esc(fmtM(num(p.dev)))}</td><td>${pill(div(p.dev, p.pim))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Sin proyectos de inversión registrados este año.</p>'}
      </div>

      ${fichaVrHtml(u)}
      ${fichaExpHtml(u)}

      <h3 style="margin:24px 0 8px">Comparador</h3>
      <div class="controls">
        <p class="cmp-a">Comparando <span class="up-chip is-a"><b>${esc(uName(u))}</b></span> con:</p>
        <div class="grow up-host" id="fi-cmp"></div>
      </div>
      <div class="grid two">
        <div class="card"><h3>Componentes del índice (0–100)</h3><p class="sub">Referencial, no oficial. Más alto = mejor posición relativa. Componentes sin dato no se dibujan.${Array.isArray(idx.ventana) && idx.ventana.length ? ` Ventana: ${esc(idx.ventana.join(', '))}.` : ''}${num(idx.cobertura_pesos) !== null ? ` Cobertura de pesos (${esc(uName(u))}): ${esc(fmtP(idx.cobertura_pesos, 0))}.` : ''}</p><div class="chart sq"><canvas id="ch-radar"></canvas></div></div>
        <div class="card"><h3>Indicadores ${esc(yearLbl(y))}</h3>
          <div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Indicador</th>${cmpList.map(x => `<th scope="col">${esc(uName(x))}</th>`).join('')}</tr></thead><tbody>
          ${[['PIM', x => fmtM(tot(x, y, 'pim'))], ['Devengado', x => fmtM(tot(x, y, 'dev'))], ['% Ejecución', x => fmtP(kpi(x, y).ejec)], ['% Personal', x => fmtP(kpi(x, y).pct_personal)], ['% Inversión', x => fmtP(kpi(x, y).pct_inversion)], ['Ejec. inversión', x => fmtP(kpi(x, y).ejec_inversion)], ['% I+D', x => fmtP(kpi(x, y).pct_idi, 2)], ['% RDR', x => fmtP(kpi(x, y).pct_rdr)], ['S/ por estudiante', x => fmtS(kpi(x, y).gasto_por_estudiante)], ['S/ por publicación', x => fmtS(kpi(x, y).idi_por_pub)], ['Índice', x => fmtScore(num(x.indice && x.indice.score))]]
            .map(([l, f]) => `<tr><td class="txt">${esc(l)}</td>${cmpList.map(x => `<td>${esc(f(x))}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>`;

    uniPicker($('#fi-uni', el), { id: 'fi-uni-in', label: 'Universidad', value: u.pliego, onSelect: p => { if (p) selectUni(p, false); } });
    // Enlace a la página estática de la universidad (u/<slug>/), si existe el mapa de slugs
    loadSlugs().then(m => {
      const sl = m && m[u.pliego]; const box = $('#fi-seo', el);
      if (sl && box && S.ficha.uni === u.pliego) box.innerHTML = `<a href="u/${encodeURIComponent(sl)}/">${esc('Página de esta universidad')}</a>`;
    });
    $('#fi-year', el).addEventListener('change', e => setYear(e.target.value));
    uniPicker($('#fi-cmp', el), { id: 'fi-cmp-in', label: 'Universidades a comparar (hasta 2)', multiple: true, max: 2, values: S.ficha.cmp.filter(p => p !== u.pliego), placeholder: 'Añade una universidad',
      onSelect: vs => { S.ficha.cmpTouched = true; S.ficha.cmp = vs; renderFicha(); } });
    $('#fi-copy', el).addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copiado'; }
      catch (err) { e.target.textContent = 'Copia el enlace de la izquierda'; }
      setTimeout(() => { e.target.textContent = 'Copiar enlace'; }, 2200);
    });

    const yrs = S.years;
    const tt = { callbacks: { label: ttM, title: it => yearLbl(it[0].label) } };
    mkChart('ch-fi-ser', {
      type: 'line',
      data: { labels: yrs.map(yTick), datasets: [
        { label: 'PIA', data: yrs.map(yy => mill(tot(u, yy, 'pia'))), borderColor: cssVar('--c-pia'), backgroundColor: cssVar('--c-pia'), borderWidth: 2, borderDash: [5, 4] },
        { label: 'PIM', data: yrs.map(yy => mill(tot(u, yy, 'pim'))), borderColor: cssVar('--c-pim'), backgroundColor: areaFill('--c-pim', 0.18), pointBackgroundColor: cssVar('--c-pim'), fill: 'origin', borderWidth: 3 },
        { label: 'Devengado', data: yrs.map(yy => mill(tot(u, yy, 'dev'))), borderColor: cssVar('--c-dev'), backgroundColor: areaFill('--c-dev', 0.28), pointBackgroundColor: cssVar('--c-dev'), fill: 'origin', borderWidth: 3, segment: { borderDash: ctx => (isPartial(yrs[ctx.p1DataIndex]) ? [5, 4] : undefined) } },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: tt }, scales: { y: { beginAtZero: true, ticks: { callback: tickM } } } },
    }, `Serie de PIA, PIM y devengado de ${uName(u)}`);
    const pctSer = f => yrs.map(yy => { const v = kpi(u, yy)[f]; return num(v) === null ? null : +(v * 100).toFixed(1); });
    mkChart('ch-fi-ejec', {
      type: 'line',
      data: { labels: yrs.map(String), datasets: [
        { label: 'Total', data: pctSer('ejec'), borderColor: cssVar('--c-pim'), backgroundColor: cssVar('--c-pim'), borderWidth: 2.5, tension: .25, pointRadius: 2 },
        { label: 'Inversión', data: pctSer('ejec_inversion'), borderColor: cssVar('--g5'), backgroundColor: cssVar('--g5'), tension: .25, pointRadius: 2 },
        { label: 'I+D (0137)', data: pctSer('ejec_idi'), borderColor: cssVar('--c-dev'), backgroundColor: cssVar('--c-dev'), tension: .25, pointRadius: 2 },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ttP, title: it => yearLbl(it[0].label) } } }, scales: { y: { min: 0, max: 100, ticks: { callback: tickP } } } },
    }, `Ejecución anual de ${uName(u)}`);
    const stackSer = (field, cats, m) => cats.map(c => ({ label: c.lbl, borderRadius: 2, backgroundColor: fadeFor(yrs, cssVar(c.c)), data: yrs.map(yy => mill(num((pick((A(u, yy) || {})[field], c.frag) || {})[m]))) }));
    const stackOpts = { interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: tt }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: tickM } } } };
    mkChart('ch-fi-gen', { type: 'bar', data: { labels: yrs.map(yTick), datasets: stackSer('generica', GENERICAS, 'dev') }, options: stackOpts }, `Gasto por genérica de ${uName(u)}`);
    mkChart('ch-fi-fue', { type: 'bar', data: { labels: yrs.map(yTick), datasets: stackSer('fuente', FUENTES.filter(c => yrs.some(yy => pick((A(u, yy) || {}).fuente, c.frag))), 'pim') }, options: stackOpts }, `Fuentes de financiamiento de ${uName(u)}`);

    fichaVrChart(u);
    const pal = ['--c-pim', '--c-dev', '--g3'];
    mkChart('ch-radar', {
      type: 'radar',
      data: { labels: idxComp().map(c => c[1]), datasets: cmpList.map((x, i) => {
        const col = cssVar(pal[i]);
        return { label: uName(x), data: idxComp().map(c => num(((x.indice || {}).componentes || {})[c[0]])), borderColor: col, backgroundColor: col + '33', pointBackgroundColor: col, borderWidth: 2, spanGaps: true };
      }) },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${num(ctx.raw) === null ? SD : fmtScore(ctx.raw)}` } } },
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent' }, grid: { color: cssVar('--line') }, angleLines: { color: cssVar('--line') }, pointLabels: { font: { size: isMobile() ? 10 : 12 } } } },
      },
    }, 'Comparación de componentes del índice entre universidades');
  }
  let slugsP = null;
  const loadSlugs = () => slugsP || (slugsP = fetch('u/slugs.json').then(r => r.ok ? r.json() : null).then(j => (j && j.slugs) || null).catch(() => null));
  function selectUni(p, scroll) {
    if (!uniBy(p)) return;
    S.ficha.uni = String(p);
    S.ficha.cmp = S.ficha.cmp.filter(x => x !== String(p));
    const h = '#u=' + encodeURIComponent(p);
    if (location.hash !== h) history.replaceState(null, '', h);
    if (S.rendered.has('ficha')) safeRender('ficha');
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
        <div class="map-wrap"><div id="map" role="region" aria-label="Mapa de universidades públicas"></div>
          <button type="button" class="btn map-activate" id="mp-act" hidden>Mover el mapa</button></div>
        <ul class="legend" id="mp-legend"></ul>
        <p class="note map-note" id="mp-hint">Las universidades sin coordenadas no aparecen en el mapa. Toca un círculo para ver el detalle.</p>
        <details class="deps" id="mp-deps"><summary>Universidades por departamento (lista)</summary><div class="deps-grid" id="mp-deps-grid"></div></details>`;
      $('#mp-year', el).addEventListener('change', e => setYear(e.target.value));
    } else {
      $('#mp-year', el).innerHTML = yearOptions(y);
    }
    $('#mp-partial', el).innerHTML = partialNote(y);
    const byDep = {};
    S.unis.filter(u => A(u, y)).forEach(u => { (byDep[u.departamento || 'Sin departamento'] = byDep[u.departamento || 'Sin departamento'] || []).push(u); });
    $('#mp-deps-grid', el).innerHTML = Object.keys(byDep).sort((p, q) => byDep[q].length - byDep[p].length || p.localeCompare(q, LOC))
      .map(dpt => `<div><h4>${esc(titleCase(dpt))} (${byDep[dpt].length})</h4>${byDep[dpt].sort((p, q) => (tot(q, y, 'pim') || 0) - (tot(p, y, 'pim') || 0)).map(u => `<a href="#u=${encodeURIComponent(u.pliego)}" title="${esc(u.nombre || '')}">${esc(uName(u))}</a>`).join('')}</div>`).join('');
    $('#mp-legend', el).innerHTML = [['sem-good', 'Ejecución ≥ 90 %'], ['sem-warn', '75–90 %'], ['sem-bad', '< 75 %'], ['line-strong', 's/d']]
      .map(([c, l]) => `<li><i style="background:${cssVar('--' + c)};border-radius:50%"></i>${esc(l)}</li>`).join('') + '<li>Tamaño = PIM</li>';
    loadLeaflet().then(drawMap).catch(() => { $('#map', el).innerHTML = '<p class="empty">No se pudo cargar el mapa. Revisa tu conexión.</p>'; });
  }
  function drawMap() {
    const L = window.L; const y = S.year;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (!S.map) {
      const touch = window.matchMedia('(pointer: coarse)').matches;
      S.map = L.map('map', { scrollWheelZoom: false, zoomControl: true, dragging: !touch, tap: false }).setView([-9.3, -75.0], isMobile() ? 4 : 5);
      if (touch) {
        const act = $('#mp-act'); act.hidden = false;
        $('#mp-hint').textContent = 'El mapa no se mueve con un dedo para que puedas seguir bajando la página. Usa “Mover el mapa” o pellizca para acercar. Lima concentra muchas universidades: mira también la lista por departamento.';
        act.addEventListener('click', () => {
          const on = !S.map.dragging.enabled();
          if (on) S.map.dragging.enable(); else S.map.dragging.disable();
          act.textContent = on ? 'Fijar el mapa' : 'Mover el mapa';
          act.setAttribute('aria-pressed', String(on));
        });
      }
    }
    if (!S.tiles) {
      S.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(S.map);
    }
    document.getElementById('map').classList.toggle('map-dark', dark);
    if (S.mapLayer) S.map.removeLayer(S.mapLayer);
    S.mapLayer = L.layerGroup().addTo(S.map);
    const pts = S.unis.filter(u => num(u.lat) !== null && num(u.lng) !== null && A(u, y));
    const maxPim = Math.max(1, ...pts.map(u => tot(u, y, 'pim') || 0));
    pts.sort((a, b) => (tot(b, y, 'pim') || 0) - (tot(a, y, 'pim') || 0)).forEach(u => {
      const k = kpi(u, y);
      const col = cssVar('--' + ({ good: 'sem-good', warn: 'sem-warn', bad: 'sem-bad', na: 'line-strong' })[semaforo(k.ejec)]);
      const r = 5 + 28 * Math.sqrt((tot(u, y, 'pim') || 0) / maxPim);
      L.circleMarker([u.lat, u.lng], { radius: r, color: col, weight: 1.5, fillColor: col, fillOpacity: .45 })
        .bindPopup(`<strong>${esc(u.nombre || uName(u))}</strong><br>${esc(u.departamento || '')}<br>PIM ${esc(y)}: <b>${esc(fmtM(tot(u, y, 'pim')))}</b><br>Devengado: ${esc(fmtM(tot(u, y, 'dev')))}<br>Ejecución: <b>${esc(fmtP(k.ejec))}</b><br><a href="#u=${encodeURIComponent(u.pliego)}">Ver ficha →</a>`)
        .bindTooltip(esc(uName(u)))
        .addTo(S.mapLayer);
    });
    setTimeout(() => {
      S.map.invalidateSize();
      if (!S.mapFitted && pts.length > 1) { S.map.fitBounds(L.latLngBounds(pts.map(u => [u.lat, u.lng])), { padding: [24, 24] }); S.mapFitted = true; }
    }, 50);
  }

  // ================================================================== 10. METODOLOGÍA
  function renderMetodologia() {
    const d = S.data;
    const fu = Array.isArray(d.fuentes) && d.fuentes.length ? d.fuentes : [
      { nombre: 'MEF — Consulta Amigable (Transparencia Económica)', url: 'https://apps5.mineco.gob.pe/transparencia/Navegador/default.aspx' },
      { nombre: 'MEF — Plataforma de Datos Abiertos', url: 'https://datosabiertos.mef.gob.pe/' },
    ];
    $('#met-fuentes').innerHTML = fu.map(f => { const u = safeUrl(f.url); return `<li>${f.tema ? `<span class="pill na">${esc(f.tema)}</span> ` : ''}${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(f.nombre || u)}</a>` : esc(f.nombre)}${f.nota ? ` — <span class="muted">${esc(f.nota)}</span>` : ''}</li>`; }).join('');
    const im = d.indice_metodo;
    if (im && typeof im === 'object' && Object.keys(im).length) {
      $('#met-indice').innerHTML = `<div class="table-wrap"><table><caption>Componentes y pesos del índice referencial</caption><thead><tr><th class="txt" scope="col">Componente</th><th class="txt" scope="col">Indicador base</th><th scope="col">Peso</th></tr></thead><tbody>${Object.entries(im).map(([k, v]) => `<tr><td class="txt">${esc(IDX_LBL[k] || k)}</td><td class="txt"><code>${esc((v && v.kpi) || '')}</code></td><td>${esc(fmtP(num(v && v.peso), 0))}</td></tr>`).join('')}</tbody></table></div><p class="note">Cada componente se expresa en escala 0–100 según la posición relativa entre universidades. Si un componente no tiene dato, el puntaje se calcula con los pesos disponibles (ver “cobertura” en la ficha).</p>`;
    }
    if (Array.isArray(d.notas) && d.notas.length) {
      $('#met-notas').insertAdjacentHTML('afterend', `<details class="notas"><summary>Notas técnicas de los datos (${d.notas.length})</summary><ul>${d.notas.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>`);
    }
    // Normativa: data.normativa + transferencias con norma
    const norm = [].concat(Array.isArray(d.leyes) ? d.leyes : [], Array.isArray(d.normativa) ? d.normativa : [], Array.isArray(d.documentos) ? d.documentos : [])
      .filter(n => n && typeof n === 'object')
      .map(n => Object.assign({}, n, { norma: n.norma || n.nombre || n.numero, titulo: n.titulo || n.sumilla, resumen: n.resumen || n.descripcion || n.nota }));
    const tr = [];
    S.unis.forEach(u => S.years.forEach(y => ((A(u, y) || {}).transferencias || []).forEach(t => tr.push(Object.assign({ u, y }, t)))));
    tr.sort((a, b) => String(b.fecha || b.y).localeCompare(String(a.fecha || a.y)));
    const normHtml = norm.length ? '<ul class="tlist">' + norm.map(n => {
      const u = safeUrl(n.url);
      const title = u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n.norma || n.titulo || 'Documento')}</a>` : esc(n.norma || n.titulo || 'Documento');
      return `<li><span class="t-top"><span><strong>${title}</strong>${n.tipo ? ` <span class="pill na">${esc(n.tipo)}</span>` : ''}</span><span class="muted small">${esc(n.fecha || '')}</span></span>${n.titulo && n.norma ? `<span class="t-fin">${esc(n.titulo)}</span>` : ''}${n.resumen ? `<span class="t-fin">${esc(n.resumen)}</span>` : ''}</li>`;
    }).join('') + '</ul>' : '<p class="empty">El listado de leyes y normas se completará con la integración de datos.</p>';
    const allLoaded = !layered() || S.years.every(y => yearDone.has(String(y)));
    const trHtml = !allLoaded ? `
      <h3>Transferencias y modificaciones registradas</h3>
      <p class="note">Para no hacer pesada la página, el detalle de transferencias de todos los años se descarga solo si lo pides.</p>
      <button type="button" class="btn" id="met-load">Cargar transferencias de todos los años</button>` : tr.length ? `
      <h3>Transferencias y modificaciones registradas (${tr.length})</h3>
      <div class="controls"><label class="grow">Filtrar<input type="search" id="met-q" placeholder="Norma, universidad o finalidad" autocomplete="off"></label></div>
      <div class="table-wrap"><table><thead><tr><th class="txt" scope="col">Fecha</th><th class="txt" scope="col">Norma</th><th class="txt" scope="col">Universidad</th><th scope="col">Monto</th><th class="txt" scope="col">Finalidad</th></tr></thead><tbody id="met-tr"></tbody></table></div>` : '';
    $('#met-normativa').innerHTML = normHtml + trHtml;
    const drawTr = q => {
      const qq = (q || '').toLowerCase();
      const rows = tr.filter(t => !qq || [t.norma, t.finalidad, t.u.nombre, t.u.corto].join(' ').toLowerCase().includes(qq)).slice(0, 300);
      $('#met-tr').innerHTML = rows.map(t => { const u = safeUrl(t.url); return `<tr><td class="txt">${esc(t.fecha || t.y)}</td><td class="txt">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t.norma || 'Norma')}</a>` : esc(t.norma || SD)}</td><td class="txt"><a class="uni-link" href="#u=${encodeURIComponent(t.u.pliego)}">${esc(uName(t.u))}</a></td><td>${esc(fmtM(num(t.monto)))}</td><td class="wrap">${esc(t.finalidad || '')}</td></tr>`; }).join('') || `<tr><td colspan="5" class="txt muted">Sin resultados.</td></tr>`;
    };
    if (allLoaded && tr.length) { drawTr(''); $('#met-q').addEventListener('input', debounce(e => drawTr(e.target.value))); }
    const ml = $('#met-load');
    if (ml) ml.addEventListener('click', () => {
      ml.disabled = true; ml.innerHTML = '<span class="spinner" aria-hidden="true"></span> Cargando…';
      Promise.all(S.years.map(ensureYear)).then(() => { $$('details.notas').forEach(x => x.remove()); renderMetodologia(); });
    });
    $('#met-generado').textContent = `Datos generados: ${d.generado || SD}. Años cubiertos: ${S.years[0]}–${S.years[S.years.length - 1]}.`;
  }

  // ================================================================== capas de datos (lazy)
  // resumen.json (totales + kpi) al inicio; anio/{y}.json y u/{pliego}.json bajo demanda.
  const yearP = new Map(), uniP = new Map(), yearDone = new Set(), uniDone = new Set();
  let pending = 0;
  const layered = () => !!(S.capas && !S.full);
  function mergeInto(u, y, obj) { if (!u || !obj) return; u.anios[y] = Object.assign(u.anios[y] || {}, obj); }
  function ensureYear(y) {
    y = String(y || '');
    if (!layered() || !y || yearDone.has(y)) return Promise.resolve();
    if (!yearP.has(y)) {
      pending++;
      yearP.set(y, fetchJson(S.capas.anio.replace('{anio}', y))
        .then(j => { Object.entries((j && j.universidades) || {}).forEach(([pl, obj]) => mergeInto(uniBy(pl), y, obj)); })
        .catch(err => console.warn('capa año', y, err))
        .finally(() => { pending--; yearDone.add(y); kpiCache.clear(); }));
    }
    return yearP.get(y);
  }
  function ensureUni(pl) {
    pl = String(pl || '');
    if (!layered() || !pl || uniDone.has(pl) || !uniBy(pl)) return Promise.resolve();
    if (!uniP.has(pl)) {
      pending++;
      uniP.set(pl, fetchJson(S.capas.u.replace('{pliego}', pl))
        .then(j => {
          const u = uniBy(pl); if (!u || !j) return;
          Object.entries(j.anios || {}).forEach(([y, obj]) => mergeInto(u, y, obj));
          Object.keys(j).forEach(k => { if (k !== 'anios' && u[k] === undefined) u[k] = j[k]; });
        })
        .catch(err => console.warn('capa universidad', pl, err))
        .finally(() => { pending--; uniDone.add(pl); kpiCache.clear(); }));
    }
    return uniP.get(pl);
  }
  // Qué capas necesita cada sección; soft = se pinta ya y se repinta al llegar
  const NEEDS = {
    resumen: () => ({ years: [S.lastClosed], soft: true }),
    variacion: () => ({ years: [S.vr.a || vrDefaults().a, S.vr.b || vrDefaults().b], soft: true }),
    trayectoria: () => ({ years: [S.year], soft: true }),
    gasto: () => ({ years: [S.year].concat(S.years), soft: true }),
    fuentes: () => ({ years: [S.year].concat(S.years), soft: true }),
    infra: () => ({ years: [S.year] }),
    idi: () => ({ years: [S.year], soft: true }),
    ficha: () => ({ unis: [S.ficha.uni || (unisByPim(S.lastClosed)[0] || {}).pliego], soft: false }),
  };
  function setSecLoading(id, on) {
    const sec = document.getElementById(id); if (sec) sec.classList.toggle('is-loading', !!on);
  }
  // Prefetch de la ficha al pasar el dedo o el mouse por un nombre
  ['mouseover', 'touchstart', 'focusin'].forEach(ev => document.addEventListener(ev, e => {
    const a = e.target.closest && e.target.closest('[data-pf]'); if (a) ensureUni(a.dataset.pf);
  }, { passive: true }));

  // ================================================================== registro / lazy render
  const SECTIONS = {
    resumen: renderResumen, variacion: renderVariacion, lineabase: renderLineabase, ranking: renderRanking, trayectoria: renderTrayectoria, expectativa: renderExpectativa, gasto: renderGasto,
    fuentes: renderFuentes, infra: renderInfra, idi: renderIdi, ficha: renderFicha, mapa: renderMapa,
    metodologia: renderMetodologia,
  };
  const YEAR_DEPENDENT = ['ranking', 'trayectoria', 'gasto', 'fuentes', 'infra', 'idi', 'ficha', 'mapa'];

  function safeRender(id) {
    const n = layered() && NEEDS[id] ? NEEDS[id]() : {};
    const ys = [...new Set((n.years || []).filter(Boolean).map(String))].filter(y => !yearDone.has(y));
    const us = (n.unis || []).filter(Boolean).filter(pl => !uniDone.has(String(pl)));
    if (ys.length || us.length) {
      const first = !document.getElementById('body-' + id) || $('.skeleton', document.getElementById('body-' + id));
      if (n.soft) drawSection(id);
      setSecLoading(id, true);
      // el año seleccionado primero; el resto (series) después
      const urgent = ys.slice(0, 2).map(ensureYear).concat(us.map(ensureUni));
      Promise.all(urgent).then(() => Promise.all(ys.slice(2).map(ensureYear))).then(() => { setSecLoading(id, false); drawSection(id); });
      void first;
      return;
    }
    drawSection(id);
  }
  function drawSection(id) {
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
    updateHero();
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
      const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', dark ? '#16101D' : '#2B3FA8');
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
    if (!m) {
      const id = location.hash.slice(1);
      if (id && SECTIONS[id] && document.getElementById(id)) { if (!S.rendered.has(id)) renderSection(id); pinTo(id); }
      return;
    }
    const p = decodeURIComponent(m[1]);
    if (!uniBy(p)) return;
    S.ficha.uni = p;
    if (!S.rendered.has('ficha')) renderSection('ficha'); else safeRender('ficha');
    pinTo('ficha');
  }
  // Mantiene una sección en pantalla mientras las de arriba se dibujan (lazy render cambia alturas)
  let unpin = null;
  function pinTo(id) {
    const sec = document.getElementById(id); if (!sec) return;
    if (unpin) unpin();
    const pin = () => sec.scrollIntoView({ behavior: 'instant', block: 'start' });
    pin(); requestAnimationFrame(pin);
    const ro = new ResizeObserver(pin);
    ro.observe($('#main'));
    const stop = () => { ro.disconnect(); ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => window.removeEventListener(ev, stop, true)); clearTimeout(t); unpin = null; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, stop, { capture: true, passive: true }));
    const t = setTimeout(stop, 3000);
    unpin = stop;
  }
  // Hero: hallazgo con cifras del año seleccionado (último cerrado por defecto)
  function updateHero() {
    const y = isPartial(S.year) ? S.lastClosed : S.year;
    const n = nacional(y);
    const per = div(sum(S.unis.map(u => genDev(u, y, '2.1'))), n.dev);
    const ej = div(n.dev, n.pim);
    const nU = S.unis.filter(u => num(tot(u, y, 'pim')) !== null).length;
    if (num(n.pim) === null) return;
    $('#hero-finding').innerHTML = `En ${esc(y)}, las ${esc(nU)} universidades públicas con presupuesto propio tuvieron <strong>${esc(fmtM(n.pim))}</strong> (PIM); gastaron el <strong>${esc(fmtP(ej))}</strong>${per !== null ? `, y <strong>${esc(Math.round(per * 100))} céntimos</strong> de cada sol gastado fueron a planilla de personal` : ''}.`;
  }
  function setupHeroSearch() {
    const f = $('#hero-search');
    let chosen = null;
    const go = p => {
      const u = uniBy(p || chosen); if (!u) { $('#hs-msg').textContent = 'Elige una universidad de la lista.'; return; }
      $('#hs-msg').textContent = '';
      const h = '#u=' + encodeURIComponent(u.pliego);
      if (location.hash === h) handleHash(); else location.hash = h;
    };
    uniPicker($('#hs-picker'), { id: 'hs-input', label: 'Busca tu universidad', placeholder: 'Sigla, nombre o ciudad, p. ej. UNSAAC', onSelect: p => { chosen = p; if (p) go(p); } });
    f.addEventListener('submit', e => { e.preventDefault(); go(); });
  }

  // ------------------------------------------------------------------ carga de datos
  async function fetchJson(url) {
    const r = await fetch(url);
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

  // Numeración de secciones y nav según las visibles (sin huecos ni repetidos)
  function renumber() {
    $$('section[data-sec]').filter(sec => !sec.hidden).forEach((sec, i) => {
      const n = $('.sec-n', sec); if (n) n.textContent = String(i + 1).padStart(2, '0');
      const a = $(`#nav a[href="#${sec.id}"] .n`); if (a) a.textContent = String(i + 1);
    });
  }
  async function init() {
    renumber();
    setupTheme();
    let d = null;
    try { d = await fetchJson('data/resumen.json'); S.capas = (d && d.capas && d.capas.anio && d.capas.u) ? d.capas : null; S.full = !S.capas; }
    catch (e0) {
      try { d = await fetchJson('data/observatorio.json'); S.full = true; }
      catch (e) {
        try { d = await fetchJson('data/sample/observatorio.json'); S.sample = true; S.full = true; }
      catch (e2) {
        showBanner('<strong>No se pudieron cargar los datos.</strong> Si abriste el archivo directamente, sírvelo con un servidor local (por ejemplo <code>python3 -m http.server</code>).', 'error');
        $$('.sec-body .skeleton').forEach(s => s.remove());
        return;
      }
      }
    }
    try { normalize(d); }
    catch (e) {
      showBanner('<strong>Los datos tienen un formato inesperado.</strong> ' + esc(e.message), 'error');
      return;
    }
    // Detalle del último año cerrado en paralelo (para KPIs y la primera pantalla)
    ensureYear(S.lastClosed).then(() => { updateHero(); if (S.rendered.has('resumen')) drawSection('resumen'); });
    if (S.sample || d.ejemplo) {
      showBanner('<strong>Datos de ejemplo.</strong> Estás viendo cifras ficticias para probar la página; aún no se publican los datos reales del MEF. No las uses para sacar conclusiones.');
    }
    chartTheme();
    const ysel = $('#year-global');
    ysel.innerHTML = yearOptions(S.year);
    ysel.disabled = false;
    const bn = $('#data-banner');
    if (bn.classList.contains('loading')) { bn.hidden = true; bn.classList.remove('loading'); }
    ysel.addEventListener('change', e => setYear(e.target.value));
    const nLast = S.unis.filter(u => num(tot(u, S.lastClosed, 'pim')) !== null).length;
    $('#hero-meta').textContent = `${nLast} universidades con presupuesto en ${S.lastClosed} (${S.unis.length} en el padrón ${S.years[0]}–${S.years[S.years.length - 1]}) · último año cerrado: ${S.lastClosed}${d.generado ? ' · actualizado: ' + String(d.generado).slice(0, 10) : ''}`;
    updateHero();
    setupHeroSearch();

    // Re-dibujo en cambios de ancho que alteran alturas (móvil ↔ escritorio)
    let wasMobile = isMobile();
    window.addEventListener('resize', debounce(() => {
      if (isMobile() !== wasMobile) { wasMobile = isMobile(); rerenderAll(); }
    }, 250));
    window.addEventListener('hashchange', handleHash);
    const vrLinked = readVrParams();

    // Expectativa 2027: solo si viene en los datos
    if (d.baseline && d.baseline.anios && Object.keys(d.baseline.anios).length) {
      $('#lineabase').hidden = false; $('#nav-lineabase').hidden = false;
    } else {
      $('#lineabase').remove(); $('#nav-lineabase').remove(); delete SECTIONS.lineabase;
    }
    if (d.expectativa_2027 && typeof d.expectativa_2027 === 'object') {
      $('#expectativa').hidden = false; $('#nav-expectativa').hidden = false;
    } else {
      $('#expectativa').remove(); $('#nav-expectativa').remove(); delete SECTIONS.expectativa;
    }
    renumber();
    setupLazy();
    setupScrollspy();
    // Impresión o ?completo: dibujar todas las secciones de una vez
    const renderAll = () => Object.keys(SECTIONS).forEach(id => { if (!S.rendered.has(id)) renderSection(id); });
    window.addEventListener('beforeprint', renderAll);
    if (/[?&]completo\b/.test(location.search)) renderAll();
    if (vrLinked && !location.hash) { renderSection('variacion'); pinTo('variacion'); }
    handleHash();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
