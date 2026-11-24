/* Historias v2 — Radiografía Presupuestal de las Universidades Públicas del Perú.
 * Todas las cifras se calculan en vivo desde data/resumen.json + data/anio/{año}.json
 * (respaldo: data/observatorio.json; último recurso: data/sample/observatorio.json con aviso).
 * Ningún número está escrito a mano en este archivo. Gráficos en SVG propio (sin librerías). */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => { try { const x = new URL(String(u), location.href); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const nf0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const SD = 's/d';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Formato adaptativo: ≥1,000 M → "S/ 7.7 mil M"; ≥1 M → "S/ 53.4 M"; <1 M → "S/ 850 mil" / "S/ 19.7 mil"; <1,000 → "S/ 40".
  const trim0 = (t) => t.replace(/\.0$/, '');
  function solesN(v) { // sin el prefijo "S/ "
    const a = Math.abs(v), sg = v < 0 ? '−' : '';
    if (a >= 1e9) return sg + nf1.format(a / 1e9) + '\u00a0mil\u00a0M';
    if (a >= 1e6) return sg + nf1.format(a / 1e6) + '\u00a0M';
    if (a >= 1e5) return sg + nf0.format(a / 1e3) + '\u00a0mil';
    if (a >= 1e3) return sg + trim0(nf1.format(a / 1e3)) + '\u00a0mil';
    return sg + nf0.format(a);
  }
  const soles = (v) => (isNum(v) ? 'S/\u00a0' + solesN(v) : SD);
  // Fino: para comparar montos cercanos (PIA vs devengado) en millones con un decimal: "S/ 6,954.6 M".
  const solesF = (v) => (!isNum(v) ? SD : Math.abs(v) >= 1e9 ? 'S/\u00a0' + nf1.format(v / 1e6) + '\u00a0M' : soles(v));
  // Cifra héroe: [número, unidad]
  function heroParts(v) {
    if (!isNum(v)) return [SD, ''];
    if (Math.abs(v) >= 1e9) return ['S/ ' + nf1.format(v / 1e9), 'mil millones'];
    if (Math.abs(v) >= 1e6) return ['S/ ' + nf1.format(v / 1e6), 'millones'];
    return ['S/ ' + nf0.format(v / 1e3), 'mil'];
  }
  function solesAxis(v) {
    if (!isNum(v)) return '';
    const a = Math.abs(v);
    if (a >= 1e9) return nf1.format(v / 1e9).replace(/[.,]0$/, '') + ' mil M';
    if (a >= 1e6) return nf0.format(v / 1e6) + ' M';
    if (a >= 1e3) return nf0.format(v / 1e3) + ' mil';
    return nf0.format(v);
  }
  // Porcentajes: ≥1000 % → "×11.5 veces" (en variaciones); ≥100 % sin decimales.
  const pct = (v, d = 0) => (isNum(v) ? new Intl.NumberFormat('es-PE', { maximumFractionDigits: Math.abs(v) >= 1 ? 0 : d, minimumFractionDigits: Math.abs(v) >= 1 ? 0 : d }).format(v * 100) + '%' : SD);
  const pctSigned = (v, d = 0) => {
    if (!isNum(v)) return SD;
    if (v >= 10) return '×' + trim0(nf1.format(1 + v)) + ' veces';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + pct(Math.abs(v), d);
  };
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
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Accesores al esquema
  const generica = (a, code) => pick(a && a.generica, (k) => k.trim().startsWith(code + ' ') || k.trim().startsWith(code + ':') || k.trim() === code);
  const programa = (a, code) => pick(a && a.programa, (k) => k.trim().startsWith(code));
  const fuenteRDR = (a) => pick(a && a.fuente, (k) => /DIRECTAMENTE\s+RECAUDADOS/i.test(k));
  const label = (u) => String(u.corto || u.nombre || u.pliego);
  const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
  function titleCase(t) {
    return t.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  }
  // Etiqueta corta para ejes: la sigla; si "corto" es un nombre largo, se abrevia. El nombre completo va en el tooltip.
  function axisLabel(u, max = 16) {
    const c = String(u.corto || '').trim();
    if (c && c.length <= 12) return c;
    let t = (c || String(u.nombre || u.pliego)).trim();
    const pref = /^(U\.\s?N\.|UNIVERSIDAD\b|UN\s)/i.test(t);
    t = t.replace(/^(U\.\s?N\.|UNIVERSIDAD\s+NACIONAL|UN)\s+/i, '').replace(/^UNIVERSIDAD\s+/i, '')
      .replace(/^AUT[OÓ]NOMA\s+/i, '').replace(/^(DE\s+|DEL\s+)/i, '');
    if (t === t.toUpperCase()) t = titleCase(t);
    if (pref) t = 'UN ' + t;
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
  }
  const sentence = (t) => { const s = String(t || '').trim().toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  const fullName = (u) => titleCase(String(u.nombre || u.pliego));

  // ---------- estado ----------
  const S = { d: null, isSample: false, Y: null, hl: '', closed: [], partial: [], mounts: [], slugs: null };

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      ink: v('--color-tinta'), ink2: v('--color-tinta-2'), line: v('--color-linea'), paper: v('--color-papel'), paper2: v('--color-papel-2'),
      pia: v('--color-pia'), pim: v('--color-pim'), dev: v('--color-dev'), tu: v('--color-tu'), tuB: v('--color-tu-borde'),
      personal: v('--color-personal'), pensiones: v('--color-pensiones'), bys: v('--color-bys'), inversion: v('--color-inversion'), otros: v('--color-otros'),
      ro: v('--color-ro'), rdr: v('--color-rdr'), canon: v('--color-canon'), dyt: v('--color-dyt'),
    };
  }

  // ---------- carga por capas ----------
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
  const WIN = 6;
  const winYears = (Y) => S.closed.filter((y) => y <= Y).slice(-WIN);
  function loadA27() { if (!S.a27P) S.a27P = getJSON('data/analisis2027.json').then((j) => { S.a27 = j; }).catch(() => { S.a27 = null; }); return S.a27P; }
  async function prepStory(st, Y) {
    if (st.need === 'a27') { await loadA27(); return; }
    if (st.need === 'p2027') { if (S.p27 === undefined) S.p27 = await getJSON('data/p2027.json').catch(() => null); return; }
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
  // Soles reales (base del IPC: 2025) — real = nominal × 100 / índice[año]
  const ipcIdx = (y) => { const i = S.d && S.d.ipc && S.d.ipc.indice; return i && isNum(i[y]) && i[y] > 0 ? i[y] : null; };
  const real = (v, y) => (isNum(v) && ipcIdx(y) ? (v * 100) / ipcIdx(y) : null);
  const ipcBase = () => (S.d && S.d.ipc && S.d.ipc.base) || 2025;

  // ---------- universidad elegida ----------
  function hlUni() { return S.hl ? S.d.universidades.find((u) => String(u.pliego) === S.hl) : null; }
  const EnLa = (u) => `En la <mark>${esc(label(u))}</mark>`;
  function fichaHref(u) {
    const slug = S.slugs && S.slugs[String(u.pliego)];
    return slug && /^[a-z0-9-]+$/.test(slug) ? `u/${slug}/` : `index.html#u=${encodeURIComponent(u.pliego)}`;
  }
  const tuInvita = () => '<p class="tu-vacio">¿Y la tuya? <a href="#picker">Elige tu universidad arriba</a> y esta historia se personaliza.</p>';

  // ---------- SVG ----------
  const svgOpen = (W, H, aria) => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">`;
  const cw = (t, px = 7.2) => String(t).length * px; // ancho aproximado del texto (13 px Archivo)
  function placeLabel(x, w, W) { // devuelve [x, anchor]
    if (x - w / 2 < 2) return [2, 'start'];
    if (x + w / 2 > W - 2) return [W - 2, 'end'];
    return [x, 'middle'];
  }
  function tuTag(x, y, text, W) {
    const w = cw(text, 7.9) + 12;
    const [tx, anchor] = placeLabel(x, w, W);
    const rx = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
    return `<rect class="tu-bg" x="${rx.toFixed(1)}" y="${y - 15}" width="${w.toFixed(1)}" height="21" rx="2"/><text class="t-tu" x="${(rx + w / 2).toFixed(1)}" y="${y}" text-anchor="middle">${esc(text)}</text>`;
  }
  const tableHTML = (head, rows, tuKey) => `<details class="datos"><summary>Ver los datos en tabla</summary><div class="tabla"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr${r.key && r.key === tuKey ? ' class="es-tu"' : ''}>${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;

  /** Enjambre (beeswarm): una bolita por universidad; la tuya en ají. */
  function swarm(box, o) {
    const W = Math.max(280, Math.round(box.clientWidth || 340));
    const small = W < 520;
    const tf = o.log ? Math.log10 : (x) => x;
    const items = o.items.filter((i) => isNum(i.v) && (!o.log || i.v > 0));
    if (!items.length) { box.innerHTML = '<p class="empty">Sin datos suficientes.</p>'; return; }
    const vs = items.map((i) => i.v);
    const d0 = o.domain ? o.domain[0] : Math.min(...vs), d1 = o.domain ? o.domain[1] : Math.max(...vs);
    const mL = 10, mR = 10;
    const x = (v) => mL + ((tf(Math.min(Math.max(v, d0), d1)) - tf(d0)) / ((tf(d1) - tf(d0)) || 1)) * (W - mL - mR);
    const ws = items.map((i) => i.w).filter(isNum);
    const wmax = ws.length ? Math.max(...ws) : 0;
    const rFix = small ? 5.4 : 7;
    const rOf = (i) => (o.size && wmax > 0 && isNum(i.w) ? (small ? 3 : 4) + (small ? 8 : 12) * Math.sqrt(i.w / wmax) : rFix);
    const pts = items.map((i) => ({ i, x: x(i.v), r: rOf(i), y: 0 })).sort((a, b) => a.x - b.x);
    const placed = [];
    pts.forEach((p) => {
      for (let k = 0; k < 400; k++) {
        const off = Math.ceil(k / 2) * 1.5 * (k % 2 ? 1 : -1);
        const ok = placed.every((q) => { const dx = q.x - p.x, dy = q.y - off, rr = q.r + p.r + 0.8; return Math.abs(dx) >= rr || dx * dx + dy * dy >= rr * rr; });
        if (ok) { p.y = off; break; }
      }
      placed.push(p);
    });
    const ext = Math.max(...pts.map((p) => Math.abs(p.y) + p.r));
    const labH = 52, cy = labH + ext + 8, axY = cy + ext + 10, H = axY + (o.refs && o.refs.length ? 46 : 26);
    const C = colors();
    let g = '';
    (o.ticks || []).forEach((t) => {
      const tx = x(t);
      g += `<line class="grid" x1="${tx}" x2="${tx}" y1="${labH - 4}" y2="${axY}"/>`;
      const [lx, an] = placeLabel(tx, cw(o.tickFmt(t)), W);
      g += `<text x="${lx}" y="${axY + 17}" text-anchor="${an}">${esc(o.tickFmt(t))}</text>`;
    });
    g += `<line class="axis" x1="${mL}" x2="${W - mR}" y1="${axY}" y2="${axY}"/>`;
    (o.refs || []).forEach((r) => {
      if (!isNum(r.v)) return;
      const rx = x(r.v);
      g += `<line x1="${rx}" x2="${rx}" y1="${labH - 4}" y2="${axY + 22}" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      const [lx, an] = placeLabel(rx, cw(r.label, 7.6), W);
      g += `<text class="t-ink" x="${lx}" y="${axY + 38}" text-anchor="${an}">${esc(r.label)}</text>`;
    });
    const tuP = pts.find((p) => p.i.key === S.hl);
    const ends = [pts[0], pts[pts.length - 1]];
    ends.forEach((p, k) => {
      if (!p || p === tuP || (k === 1 && p === ends[0])) return;
      const t = `${p.i.ax} ${o.fmt(p.i.v)}`;
      const anchor = k === 0 ? 'start' : 'end';
      const lx = anchor === 'start' ? Math.max(2, p.x - 4) : Math.min(W - 2, p.x + 4);
      g += `<line x1="${p.x}" x2="${p.x}" y1="20" y2="${cy + p.y - p.r - 1}" stroke="${C.ink2}" stroke-width="1"/>`;
      g += `<text x="${lx}" y="15" text-anchor="${anchor}">${esc(t)}</text>`;
    });
    const n = pts.length;
    pts.forEach((p, k) => {
      if (p === tuP) return;
      g += `<circle class="drop" style="--d:${(k / n * 0.7).toFixed(2)}s" cx="${p.x.toFixed(1)}" cy="${(cy + p.y).toFixed(1)}" r="${p.r.toFixed(1)}" fill="${o.color}" fill-opacity="${o.size ? 0.82 : 0.9}" stroke="${C.paper}" stroke-width="1" data-tip="${esc(p.i.full + ': ' + o.fmt(p.i.v) + (p.i.extra ? ' (' + p.i.extra + ')' : ''))}"/>`;
    });
    if (tuP) {
      g += `<line x1="${tuP.x}" x2="${tuP.x}" y1="44" y2="${cy + tuP.y - tuP.r}" stroke="${C.ink}" stroke-width="1.5"/>`;
      g += `<circle cx="${tuP.x.toFixed(1)}" cy="${(cy + tuP.y).toFixed(1)}" r="${(tuP.r + 2).toFixed(1)}" fill="${C.tu}" stroke="${C.tuB}" stroke-width="2.5" data-tip="${esc(tuP.i.full + ': ' + o.fmt(tuP.i.v))}"/>`;
      g += tuTag(tuP.x, 42, `${tuP.i.ax} ${o.fmt(tuP.i.v)}`, W);
    }
    box.innerHTML = svgOpen(W, H, o.aria) + g + '</svg>';
  }

  /** Skyline: columnas ordenadas de mayor a menor, la tuya en ají. */
  function skyline(box, o) {
    const W = Math.max(280, Math.round(box.clientWidth || 340));
    const items = o.items;
    const n = items.length; if (!n) { box.innerHTML = '<p class="empty">Sin datos suficientes.</p>'; return; }
    const C = colors();
    const labH = 50, plotH = W < 520 ? 190 : 260, base = labH + plotH, H = base + 30;
    const max = Math.max(...items.map((i) => i.v));
    const bw = W / n, gap = bw > 6 ? 2 : 1;
    let g = '';
    [0.25, 0.5, 0.75, 1].forEach((f) => { const yv = base - f * plotH; g += `<line class="grid" x1="0" x2="${W}" y1="${yv}" y2="${yv}"/>`; });
    let tuI = -1;
    items.forEach((it, k) => {
      const h = Math.max(1.5, (it.v / max) * plotH), bx = k * bw;
      const isTu = it.key === S.hl; if (isTu) tuI = k;
      g += `<rect class="growy" style="--d:${(k / n * 0.6).toFixed(2)}s" x="${(bx + gap / 2).toFixed(2)}" y="${(base - h).toFixed(1)}" width="${Math.max(1, bw - gap).toFixed(2)}" height="${h.toFixed(1)}" fill="${isTu ? C.tu : o.color}"${isTu ? ` stroke="${C.tuB}" stroke-width="2"` : ''}/>`;
      g += `<rect x="${bx.toFixed(2)}" y="${labH}" width="${bw.toFixed(2)}" height="${plotH}" fill="transparent" data-tip="${esc(it.full + ': ' + o.fmt(it.v))}"/>`;
    });
    if (isNum(o.median)) {
      const my = base - (o.median / max) * plotH;
      const t = `Mediana ${o.fmt(o.median)}`;
      g += `<line x1="0" x2="${W}" y1="${my}" y2="${my}" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      g += `<rect x="${W - cw(t, 7.6) - 10}" y="${my - 21}" width="${cw(t, 7.6) + 10}" height="18" fill="${C.paper}"/><text class="t-ink" x="${W - 2}" y="${my - 7}" text-anchor="end">${esc(t)}</text>`;
    }
    g += `<line class="axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/>`;
    const first = items[0], last = items[n - 1];
    if (tuI !== 0) g += `<text x="0" y="16">${esc(`${first.ax} ${o.fmt(first.v)}`)}</text>`;
    if (tuI !== n - 1) g += `<text x="${W}" y="${base + 20}" text-anchor="end">${esc(`${last.ax} ${o.fmt(last.v)}`)}</text>`;
    if (tuI >= 0) {
      const it = items[tuI], tx = tuI * bw + bw / 2, h = (it.v / max) * plotH;
      g += `<line x1="${tx}" x2="${tx}" y1="40" y2="${base - h - 2}" stroke="${C.ink}" stroke-width="1.5"/>`;
      g += tuTag(tx, 38, `${it.ax} ${o.fmt(it.v)}`, W);
    }
    box.innerHTML = svgOpen(W, H, o.aria) + g + '</svg>';
  }

  /** Barras horizontales con etiqueta directa (admite negativos). rows: [{key,ax,full,v}|{sep:true}] */
  function hbars(box, o) {
    const W = Math.max(280, Math.round(box.clientWidth || 340));
    const rows = o.rows; const C = colors();
    const data = rows.filter((r) => !r.sep);
    if (!data.length) { box.innerHTML = '<p class="empty">Sin datos suficientes.</p>'; return; }
    const rowH = 32, labW = o.labW || (W < 520 ? 108 : 180), vW = o.vW || 56;
    const vmin = Math.min(0, ...data.map((r) => r.v)), vmax = Math.max(0, ...data.map((r) => r.v));
    const pL = labW + (vmin < 0 ? vW : 6), pR = W - (vmax > 0 ? vW : 6);
    const x = (v) => pL + ((v - vmin) / ((vmax - vmin) || 1)) * (pR - pL);
    const x0 = x(0), H = rows.length * rowH + 8;
    let g = '';
    rows.forEach((r, k) => {
      const y = k * rowH + 4;
      if (r.sep) { g += `<line class="grid" x1="${labW}" x2="${W}" y1="${y + rowH / 2}" y2="${y + rowH / 2}" stroke-dasharray="2 4"/><text x="0" y="${y + 21}">⋯</text>`; return; }
      const isTu = !!S.hl && r.key === S.hl, xv = x(r.v), bx = Math.min(x0, xv), bwid = Math.max(1, Math.abs(xv - x0));
      if (isTu) g += `<rect class="tu-bg" x="0" y="${y + 4}" width="${Math.min(labW - 6, cw(r.ax, 7.9) + 10)}" height="${rowH - 8}" rx="2"/>`;
      g += `<text ${isTu ? 'class="t-tu" ' : r.key && r.key === o.hiKey ? 'class="t-ink" ' : ''}x="${isTu ? 5 : 0}" y="${y + 21}">${esc(r.ax)}</text>`;
      g += `<rect class="growx" style="--d:${(k * 0.04).toFixed(2)}s;${r.v < 0 ? 'transform-origin:right center' : ''}" x="${bx.toFixed(1)}" y="${y + 6}" width="${bwid.toFixed(1)}" height="${rowH - 12}" fill="${isTu ? C.tu : r.color ? r.color : r.key && r.key === o.hiKey ? o.hiColor : (r.v < 0 ? o.colorNeg || o.color : o.color)}"${isTu ? ` stroke="${C.tuB}" stroke-width="2"` : ''} data-tip="${esc(r.full + ': ' + o.fmt(r.v))}"/>`;
      g += r.v < 0 ? `<text class="t-ink" x="${xv - 5}" y="${y + 21}" text-anchor="end">${esc(o.fmt(r.v))}</text>` : `<text class="t-ink" x="${xv + 5}" y="${y + 21}">${esc(o.fmt(r.v))}</text>`;
    });
    g += `<line class="axis" x1="${x0}" x2="${x0}" y1="0" y2="${H}"/>`;
    box.innerHTML = svgOpen(W, H, o.aria) + g + '</svg>';
  }

  /** Línea por años (serie principal + serie fantasma) con anotaciones de inicio y fin. */
  function lines(box, o) {
    const W = Math.max(280, Math.round(box.clientWidth || 340));
    const C = colors();
    const small = W < 520;
    const H = small ? 280 : 340, mT = 48, mB = 48, mL = 6, mR = 8;
    const yrs = o.years; const all = o.series.flatMap((s) => s.vals).filter(isNum);
    const ymax = Math.max(...all) * 1.08;
    const x = (i) => mL + (i / ((yrs.length - 1) || 1)) * (W - mL - mR);
    const y = (v) => mT + (1 - v / ymax) * (H - mT - mB);
    let g = '';
    const step = ymax > 6e9 ? 2e9 : ymax > 3e9 ? 1e9 : 5e8;
    for (let v = step; v < ymax; v += step) g += `<line class="grid" x1="${mL}" x2="${W - mR}" y1="${y(v)}" y2="${y(v)}"/><text x="${mL}" y="${y(v) - 5}">${esc('S/ ' + solesAxis(v))}</text>`;
    g += `<line class="axis" x1="${mL}" x2="${W - mR}" y1="${y(0)}" y2="${y(0)}"/>`;
    const every = small ? 3 : 2;
    yrs.forEach((yr, i) => {
      const last = i === yrs.length - 1;
      if (last || i === o.markA || ((yrs.length - 1 - i) % every === 0 && Math.abs(i - o.markA) > 1)) {
        const an = last ? 'end' : i === 0 ? 'start' : 'middle';
        g += `<text x="${x(i)}" y="${y(0) + 18}" text-anchor="${an}"${i === o.markA || last ? ' class="t-ink"' : ''}>${esc(yr)}</text>`;
      }
    });
    o.series.slice().reverse().forEach((s) => {
      const d = s.vals.map((v, i) => (isNum(v) ? `${i && isNum(s.vals[i - 1]) ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}` : '')).join('');
      g += `<path ${s.dash ? 'class="pop"' : 'class="draw" style="--len:1800"'} d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 3}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="6 5"' : ''}/>`;
    });
    const main = o.series[0];
    [o.markA, yrs.length - 1].forEach((i, k) => {
      const v = main.vals[i]; if (!isNum(v)) return;
      const px = x(i), py = y(v);
      g += `<circle cx="${px}" cy="${py}" r="6" fill="${main.color}" stroke="${C.paper}" stroke-width="2"/>`;
      const an = k === 0 ? (px < W * 0.35 ? 'start' : 'middle') : 'end';
      g += `<text class="t-big" x="${k === 0 ? Math.max(px - 6, 4) : px + 4}" y="${py - 16}" text-anchor="${an}">${esc(soles(v))}</text>`;
      if (o.notes && o.notes[k]) g += `<text x="${k === 0 ? Math.max(px - 6, 4) : px + 4}" y="${y(0) + 36}" text-anchor="${k === 0 ? 'start' : 'end'}">${esc(o.notes[k])}</text>`;
    });
    const bw = (W - mL - mR) / yrs.length;
    yrs.forEach((yr, i) => {
      const tip = o.series.map((s) => `${s.name}: ${soles(s.vals[i])}`).join(' / ');
      g += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${mT}" width="${bw.toFixed(1)}" height="${H - mT - mB}" fill="transparent" data-tip="${esc(yr + ': ' + tip)}"/>`;
    });
    box.innerHTML = svgOpen(W, H, o.aria) + g + '</svg>';
  }

  /** Histograma de pocas cajas; marca la caja de tu universidad. */
  function histo(box, o) {
    const W = Math.max(280, Math.round(box.clientWidth || 340));
    const C = colors();
    const n = o.bins.length, gapX = 8, labH = 34, plotH = W < 520 ? 150 : 190, base = labH + plotH, H = base + (o.bins.some((b) => b.tu) ? 52 : 28);
    const bw = (W - gapX * (n - 1)) / n;
    const max = Math.max(...o.bins.map((b) => b.count), 1);
    let g = '';
    o.bins.forEach((b, k) => {
      const bx = k * (bw + gapX), h = (b.count / max) * plotH, top = base - h;
      g += `<rect class="growy" style="--d:${(k * 0.08).toFixed(2)}s" x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${b.neg ? o.colorNeg : o.color}"${b.tu ? ` stroke="${C.tuB}" stroke-width="3"` : ''} data-tip="${esc(b.label + ': ' + b.count + ' universidades')}"/>`;
      g += `<text class="t-big" x="${bx + bw / 2}" y="${top - 8}" text-anchor="middle">${b.count}</text>`;
      g += `<text x="${bx + bw / 2}" y="${base + 18}" text-anchor="middle" class="t-ink">${esc(b.label)}</text>`;
      if (b.tu) g += tuTag(bx + bw / 2, base + 44, b.tu, W);
    });
    g += `<line class="axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/>`;
    box.innerHTML = svgOpen(W, H, o.aria) + g + '</svg>';
  }

  // ---------- piezas HTML ----------
  function stepsHTML(t, title) {
    const { pia, pim, dev } = t;
    const mx = Math.max(pia || 0, pim || 0, dev || 0) || 1;
    const w = (v) => (isNum(v) ? Math.max(0, (v / mx) * 100).toFixed(2) : 0);
    const extra = isNum(pim) && isNum(pia) ? pim - pia : null;
    const sin = isNum(pim) && isNum(dev) ? pim - dev : null;
    return `${title ? `<p class="fig-t">${title}</p>` : ''}<div class="steps">
      <div class="step"><div class="step-l"><span>Arrancaron con (PIA)</span><b>${esc(solesF(pia))}</b></div>
        <div class="step-bar"><i class="grow" style="width:${w(pia)}%;background:var(--color-pia)"></i></div></div>
      <div class="step"><div class="step-l"><span>Terminaron teniendo (PIM)</span><b>${esc(solesF(pim))}</b></div>
        <div class="step-bar"><i class="grow" style="--d:.25s;width:${w(pim)}%;background:var(--color-pim)"></i></div>
        ${isNum(extra) ? `<span class="step-note">${extra >= 0 ? `+${esc(solesF(extra))} que llegaron durante el año` : `${esc(solesF(-extra))} menos que al inicio`}</span>` : ''}</div>
      <div class="step"><div class="step-l"><span>Gastaron de verdad (devengado)</span><b>${esc(solesF(dev))}</b></div>
        <div class="step-bar"><i class="gap" style="width:${w(pim)}%"></i><i class="grow" style="--d:.5s;width:${w(dev)}%;background:var(--color-dev)"></i></div>
        ${isNum(sin) ? `<span class="step-note">${esc(solesF(sin))} sin gastar (rayado): el ${esc(pct(div(sin, pim)))} de lo que tenían</span>` : ''}</div>
    </div>`;
  }
  const CATS = [
    { k: 'p', name: 'Sueldos del personal (2.1)', c: '--color-personal' },
    { k: 'pe', name: 'Pensiones de cesantes (2.2)', c: '--color-pensiones' },
    { k: 'b', name: 'Bienes y servicios, incluye CAS (2.3)', c: '--color-bys' },
    { k: 'ac', name: 'Obras y equipos (2.6)', c: '--color-inversion' },
    { k: 'o', name: 'Otros', c: '--color-otros' },
  ];
  function cents(shares) { // resto mayor → suma 100
    const raw = shares.map((s) => (isNum(s) ? Math.max(0, s) * 100 : 0));
    const fl = raw.map(Math.floor); let rest = 100 - sum(fl);
    raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { fl[i] += 1; rest -= 1; } });
    return fl;
  }
  function waffleHTML(cs, title, plain) {
    let cells = '', k = 0;
    cs.forEach((n, ci) => { for (let j = 0; j < n; j++) { cells += `<i class="pop" style="--d:${(k * 0.007).toFixed(3)}s;background:var(${CATS[ci].c})"></i>`; k++; } });
    return `<div><p class="waffle-t">${title}</p><div class="waffle" role="img" aria-label="${esc(plain + ': ' + CATS.map((c, i) => `${c.name} ${cs[i]} céntimos`).join(', '))}">${cells}</div></div>`;
  }

  // ---------- plantillas ----------
  const SRC_MEF = 'Fuente: MEF, Consulta Amigable / SIAF (gasto por pliego).';
  const isPartial = () => S.partial.includes(S.Y);
  const src = (extra) => `<p class="src">${esc(SRC_MEF)}${extra ? ' ' + esc(extra) : ''} Año ${esc(S.Y)}${isPartial() ? ' (parcial)' : ''}.</p>`;
  const FUENTE_RX = {
    estudiantes: /matr[ií]cul|estudiant|alumn|SUNEDU|SIBE|INEI|MINEDU/i,
    pubs: /publicaci|OpenAlex|Scopus|Web of Science|WoS|ORCID|CTI Vitae|RENACYT|bibliom/i,
  };
  const linkTo = (url, text) => { const u = safeUrl(url); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text || u)}</a>` : esc(text); };
  function fuenteCtx(tema) {
    const fs = (S.d && Array.isArray(S.d.fuentes)) ? S.d.fuentes : [];
    const hit = fs.filter((f) => f && (f.tema === tema || (!f.tema && FUENTE_RX[tema].test(String(f.nombre || '')))));
    return hit.length ? hit.map((f) => linkTo(f.url, f.nombre || f.url)).join('; ') : null;
  }
  const srcCtx = (tema, etiqueta) => `<p class="src">${esc(SRC_MEF)} ${esc(etiqueta)}: ${fuenteCtx(tema) || 'ver metodología del observatorio'}. Año ${esc(S.Y)}${isPartial() ? ' (parcial)' : ''}.</p>`;
  const caveat = (items) => `<details class="nodice"><summary>Qué no dice este dato</summary><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  function unisY(Y) { return S.d.universidades.filter((u) => u.anios && u.anios[Y] && u.anios[Y].total); }
  const item = (u, v, extra) => ({ key: String(u.pliego), ax: axisLabel(u), full: label(u) + (u.corto && u.corto.length <= 12 ? ', ' + fullName(u) : ''), v, extra });
  const tuNo = (h, txt) => `<p class="tu">La <mark>${esc(label(h))}</mark> ${txt}</p>`;

  // Color de cada capítulo (portada a sangre) y color del texto encima.
  const PAL = {
    anil: ['var(--color-anil)', 'var(--on-dark)'], maiz: ['var(--color-maiz)', 'var(--on-dark)'], chicha: ['var(--color-chicha)', 'var(--on-white)'],
    rocoto: ['var(--color-rocoto)', 'var(--on-white)'], selva: ['var(--color-selva)', 'var(--on-dark)'], titicaca: ['var(--color-titicaca)', 'var(--on-dark)'],
    aji: ['var(--color-aji)', 'var(--on-aji)'], cobre: ['var(--color-cobre)', 'var(--on-dark)'], cochinilla: ['var(--color-cochinilla)', 'var(--on-white)'],
  };

  // ---------- historias ----------
  const STORIES = [
    // 1. PIA → PIM → devengado
    {
      id: 'salto', need: 'base', col: 'anil', sec: 'variacion', toc: 'Arrancan, terminan, gastan', sk: 'más plata de la que tenían al empezar el año',
      build(Y) {
        const U = unisY(Y);
        const T = { pia: sum(U.map((u) => val(u.anios[Y].total, 'pia'))), pim: sum(U.map((u) => val(u.anios[Y].total, 'pim'))), dev: sum(U.map((u) => val(u.anios[Y].total, 'dev'))) };
        const g = div(T.pim, T.pia);
        const h = hlUni(); const ht = h && h.anios && h.anios[Y] && h.anios[Y].total;
        let tu = tuInvita(), tuFig = '';
        if (h && ht) {
          const hg = div(val(ht, 'pim'), val(ht, 'pia'));
          tu = `<p class="tu">${EnLa(h)} arrancaron con ${esc(solesF(val(ht, 'pia')))} y terminaron con ${esc(solesF(val(ht, 'pim')))} (${esc(pctSigned(isNum(hg) ? hg - 1 : null))}). Gastaron el ${esc(pct(div(val(ht, 'dev'), val(ht, 'pim'))))} de lo que tenían.</p>`;
          tuFig = `<div class="steps-tu">${stepsHTML({ pia: val(ht, 'pia'), pim: val(ht, 'pim'), dev: val(ht, 'dev') }, `Solo la <mark>${esc(label(h))}</mark>`)}</div>`;
        } else if (h) tu = tuNo(h, `no tiene datos de gasto en ${esc(Y)}.`);
        return {
          cifra: esc(pctSigned(isNum(g) ? g - 1 : null)),
          titulo: `más plata tuvieron al final de ${esc(Y)} que al empezar. Al cierre, ${esc(solesF(T.pim - T.dev))} quedaron sin gastar.`,
          html: `<p class="lead">Piensa en tu propina del ciclo: arrancas con un monto, a mitad de camino te cae plata extra (o te recortan) y al final está lo que de verdad gastaste. Con las universidades públicas pasa igual, pero en millones.</p>
            <p>En ${esc(Y)}, las ${esc(U.length)} universidades con datos arrancaron con ${esc(solesF(T.pia))}, terminaron teniendo ${esc(solesF(T.pim))} y gastaron ${esc(solesF(T.dev))}: el ${esc(pct(div(T.dev, T.pim)))} de lo que tenían.</p>
            ${tu}
            <figure class="fig anim">${stepsHTML(T, `Las ${esc(U.length)} universidades juntas, ${esc(Y)}`)}${tuFig}</figure>
            ${caveat([
              'El presupuesto crece durante el año por transferencias de otras entidades, créditos suplementarios y saldos del año anterior. Un salto grande no es, por sí mismo, una irregularidad.',
              'Parte de lo no gastado puede ser plata que llegó tarde en el año o de obras que duran varios años.',
              'Montos en soles corrientes, sin ajuste por inflación.',
            ])}${src()}`,
        };
      },
    },

    // 2. De cada sol
    {
      id: 'sol', need: 'year', col: 'maiz', sec: 'gasto', toc: 'De cada sol', sk: 'céntimos de cada sol se van en sueldos',
      build(Y) {
        const U = unisY(Y);
        const parts = (a) => {
          const tot = val(a.total, 'dev');
          const p = val(generica(a, '2.1'), 'dev'), pe = val(generica(a, '2.2'), 'dev'), b = val(generica(a, '2.3'), 'dev'), ac = val(generica(a, '2.6'), 'dev');
          const o = isNum(tot) ? tot - sum([p, pe, b, ac]) : null;
          return { tot, p, pe, b, ac, o: isNum(o) && o > 0 ? o : 0 };
        };
        const all = U.map((u) => ({ u, x: parts(u.anios[Y]) })).filter((r) => isNum(r.x.tot) && r.x.tot > 0 && isNum(r.x.p));
        if (!all.length) return { cifra: SD, titulo: 'céntimos de cada sol se van en sueldos', html: `<p class="empty">No hay detalle por genérica para ${esc(Y)}.</p>${src()}` };
        const T = sum(all.map((r) => r.x.tot));
        const cN = cents(CATS.map((c) => div(sum(all.map((r) => r.x[c.k])), T)));
        const h = hlUni(); const hr = h && all.find((r) => r.u === h);
        const cT = hr ? cents(CATS.map((c) => div(hr.x[c.k], hr.x.tot))) : null;
        const byP = all.map((r) => ({ r, s: div(r.x.p, r.x.tot) })).sort((a, b) => b.s - a.s);
        const hi = byP[0], lo = byP[byP.length - 1];
        return {
          cifra: esc(cN[0]),
          titulo: `céntimos de cada sol que gastaron las universidades en ${esc(Y)} se fueron en sueldos del personal`,
          html: `<p class="lead">Imagina cada sol como una moneda partida en 100 pedacitos. Cada cuadradito de abajo es un céntimo de lo que gastaron las universidades públicas en ${esc(Y)}.</p>
            <p>Si a los sueldos les sumas las pensiones de los cesantes, llegas a ${esc(cN[0] + cN[1])} céntimos. Para obras y equipos quedaron ${esc(cN[3])}. Entre universidades cambia bastante: los sueldos van de ${esc(pct(lo.s))} (${esc(axisLabel(lo.r.u))}) a ${esc(pct(hi.s))} (${esc(axisLabel(hi.r.u))}) del gasto.</p>
            ${hr ? `<p class="tu">${EnLa(h)}, de cada sol, ${esc(cT[0])} céntimos fueron a sueldos, ${esc(cT[2])} a bienes y servicios y ${esc(cT[3])} a obras y equipos.</p>` : (h ? tuNo(h, `no tiene detalle por genérica en ${esc(Y)}.`) : tuInvita())}
            <figure class="fig anim"><div class="waffles${cT ? ' dos' : ''}">${waffleHTML(cN, 'Todas las universidades', 'Todas las universidades')}${cT ? waffleHTML(cT, `<mark>${esc(label(h))}</mark>`, label(h)) : ''}</div>
              <ul class="wlegend"><li class="h"><span></span><span>Céntimos de cada sol</span><span>Todas</span>${cT ? `<span>${esc(axisLabel(h, 10))}</span>` : '<span></span>'}</li>
              ${CATS.map((c, i) => `<li><i style="background:var(${c.c})"></i><span>${esc(c.name)}</span><b>${esc(cN[i])}</b>${cT ? `<em>${esc(cT[i])}</em>` : '<span></span>'}</li>`).join('')}</ul></figure>
            ${caveat([
              'Los contratos CAS se registran en bienes y servicios (2.3), no en sueldos (2.1). Lo que se gasta en personas es más de lo que muestra el primer color.',
              'Que la mayor parte se vaya en sueldos es normal en una universidad: el servicio principal lo dan personas (docentes, administrativos).',
              'Un año con una obra grande baja la proporción de sueldos aunque estos no cambien.',
            ])}${src()}`,
        };
      },
    },

    // 3. Por estudiante
    {
      id: 'estudiante', need: 'base', col: 'chicha', sec: 'ranking', toc: 'Por estudiante', sk: 'al año por cada estudiante',
      build(Y) {
        const U = unisY(Y);
        const rows = U.map((u) => { const a = u.anios[Y]; const e = isNum(a.estudiantes) && a.estudiantes > 0 ? a.estudiantes : null; return { u, e, v: e ? div(val(a.total, 'dev'), e) : null }; }).filter((r) => isNum(r.v));
        if (!rows.length) return { cifra: SD, titulo: 'por cada estudiante', html: `<p class="empty">No hay datos de matrícula para ${esc(Y)}.</p>${src()}` };
        const items = rows.map((r) => Object.assign(item(r.u, r.v), { e: r.e })).sort((a, b) => b.v - a.v);
        const med = median(items.map((i) => i.v));
        const eYears = [...new Set(rows.map((r) => r.u.anios[Y].estudiantes_anio).filter((x) => x != null && String(x) !== String(Y)).map(String))].sort();
        const h = hlUni(); const k = h ? items.findIndex((i) => i.key === String(h.pliego)) : -1;
        const hi = items[0], lo = items[items.length - 1];
        return {
          cifra: esc(soles(med)),
          titulo: `gasta al año la universidad típica por cada estudiante (${esc(Y)})`,
          html: `<p class="lead">Es todo lo que gastó la universidad en el año dividido entre sus estudiantes. No es lo que cuesta tu clase: incluye investigación, obras, pensiones de cesantes y más. Pero sirve para comparar.</p>
            <p>La que más gasta por estudiante gasta ${esc(nf0.format(hi.v / lo.v))} veces lo que la que menos: de ${esc(soles(lo.v))} (${esc(lo.ax)}) a ${esc(soles(hi.v))} (${esc(hi.ax)}). Cada barra es una universidad, ordenadas de mayor a menor.${U.length > rows.length ? ` ${esc(U.length - rows.length)} universidades no tienen dato de matrícula.` : ''}${eYears.length ? ` La matrícula es del último dato publicado (${esc(eYears.join(', '))}).` : ''}</p>
            ${k >= 0 ? `<p class="tu">${EnLa(h)} se gastaron ${esc(soles(items[k].v))} por estudiante (${esc(nf0.format(items[k].e))} estudiantes). Es el puesto ${esc(k + 1)} de ${esc(items.length)}.</p>` : (h ? tuNo(h, `no tiene dato de matrícula para ${esc(Y)}.`) : tuInvita())}
            <figure class="fig anim"><p class="fig-t">Gasto por estudiante, ${esc(Y)}</p><div data-fig="sky"></div>
              ${tableHTML(['Universidad', 'Por estudiante', 'Estudiantes'], items.map((i) => ({ key: i.key, cells: [i.ax, soles(i.v), nf0.format(i.e)] })), S.hl)}</figure>
            ${caveat([
              'El gasto total incluye investigación, pensiones de cesantes, obras y servicios a la comunidad; no es solo el costo de enseñar.',
              'Las universidades nuevas o pequeñas, o con carreras de laboratorio (ingeniería, medicina, agronomía), suelen tener un costo por estudiante mayor.',
              'La matrícula puede referirse solo a pregrado; revisa la fuente indicada abajo.',
            ])}${srcCtx('estudiantes', 'Estudiantes')}`,
          mount(el) { const C = colors(); return [[$('[data-fig="sky"]', el), (b, C = colors()) => skyline(b, { items, median: med, color: C.dev, fmt: soles, aria: 'Gasto devengado por estudiante, una barra por universidad' })]]; },
        };
      },
    },

    // 4. Quién pone la plata
    {
      id: 'quien-paga', need: 'year', col: 'rocoto', sec: 'fuentes', toc: '¿Quién pone la plata?', sk: 'del gasto sale de lo que cobra la propia universidad',
      build(Y) {
        const U = unisY(Y);
        const FU = [
          { name: 'Tesoro público (RO)', c: '--color-ro', rx: /ORDINARIOS/i },
          { name: 'Lo que cobra la universidad (RDR)', c: '--color-rdr', rx: /DIRECTAMENTE\s+RECAUDADOS/i },
          { name: 'Canon y regalías (RD)', c: '--color-canon', rx: /DETERMINADOS/i },
          { name: 'Donaciones y transferencias', c: '--color-dyt', rx: /DONACIONES/i },
        ];
        const fsum = (a, f) => sum(Object.keys(a.fuente || {}).filter((k) => f.rx.test(k)).map((k) => val(a.fuente[k], 'dev')));
        const rows = U.map((u) => { const a = u.anios[Y]; return { u, r: val(fuenteRDR(a), 'dev'), t: val(a.total, 'dev') }; }).filter((x) => isNum(x.t) && x.t > 0 && isNum(x.r));
        if (!rows.length) return { cifra: SD, titulo: 'del gasto sale de lo que cobra la universidad', html: `<p class="empty">Sin datos por fuente de financiamiento para ${esc(Y)}.</p>${src()}` };
        const TT = sum(U.map((u) => val(u.anios[Y].total, 'dev')));
        const shares = FU.map((f) => div(sum(U.map((u) => fsum(u.anios[Y], f))), TT));
        const share = div(sum(rows.map((x) => x.r)), sum(rows.map((x) => x.t)));
        const items = rows.map((x) => item(x.u, x.r / x.t)).sort((a, b) => b.v - a.v);
        const hi = items[0], lo = items[items.length - 1];
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        const stack = shares.map((s, i) => (isNum(s) && s > 0 ? `<i class="pop" style="--d:${i * 0.12}s;width:${(s * 100).toFixed(2)}%;background:var(${FU[i].c})"></i>` : '')).join('');
        const dmax = Math.min(1, Math.max(0.5, Math.ceil(hi.v * 4) / 4));
        return {
          cifra: esc(pct(share)),
          titulo: `de lo que gastaron las universidades en ${esc(Y)} salió de lo que ellas mismas cobran`,
          html: `<p class="lead">Es el cachuelo de la universidad: admisión, CEPRE, posgrado, carnés, constancias y servicios. En el MEF se llama RDR, recursos directamente recaudados. El resto llega sobre todo del Tesoro público y, en algunas regiones, del canon minero o gasífero.</p>
            <p>Va de ${esc(pct(lo.v))} en ${esc(lo.ax)} a ${esc(pct(hi.v))} en ${esc(hi.ax)}. La mitad de las universidades paga con su propia plata menos del ${esc(pct(median(items.map((i) => i.v))))} de lo que gasta.</p>
            ${hr ? `<p class="tu">${EnLa(h)}, el ${esc(pct(hr.v))} del gasto se pagó con lo que cobra la propia universidad.</p>` : (h ? tuNo(h, `no tiene datos por fuente en ${esc(Y)}.`) : '')}
            <figure class="fig anim"><p class="fig-t">De dónde sale cada sol, todas las universidades</p>
              <div class="stack" role="img" aria-label="${esc(FU.map((f, i) => f.name + ' ' + pct(shares[i])).join(', '))}">${stack}</div>
              <ul class="stack-l">${FU.map((f, i) => `<li><i class="sw" style="background:var(${f.c})"></i><b>${esc(pct(shares[i]))}</b>${esc(f.name)}</li>`).join('')}</ul>
            </figure>
            <figure class="fig anim"><p class="fig-t">¿Cuánto pone cada universidad de su bolsillo?</p><p class="fig-s">Cada bolita es una universidad: qué parte de su gasto pagó con lo que cobra (RDR).</p><div data-fig="sw"></div>
              ${tableHTML(['Universidad', '% con RDR'], items.map((i) => ({ key: i.key, cells: [i.ax, pct(i.v)] })), S.hl)}</figure>
            ${caveat([
              'Cobrar más no es gestionar mejor: depende de la oferta de posgrado, la demanda de la zona, la ubicación y el tamaño.',
              'Buena parte del RDR viene de pagos de estudiantes y postulantes; que crezca también puede significar mayores cobros.',
              'Lo que se cobra en un año puede gastarse al siguiente (saldo de balance).',
            ])}${src('Fuente de financiamiento del gasto devengado.')}`,
          mount(el) { const C = colors(); return [[$('[data-fig="sw"]', el), (b, C = colors()) => swarm(b, { items, color: C.rdr, domain: [0, dmax], ticks: [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= dmax + 1e-9), tickFmt: (t) => pct(t), fmt: (v) => pct(v), refs: [{ v: share, label: `Todas juntas: ${pct(share)}` }], aria: 'Porcentaje del gasto financiado con recursos directamente recaudados por universidad' })]]; },
        };
      },
    },

    // 5. Investigación PP 0137
    {
      id: 'investigacion', need: 'year', col: 'selva', sec: 'idi', toc: 'La plata para investigar', sk: 'de cada S/ 100 para investigar se gastaron',
      build(Y) {
        const U = unisY(Y);
        const rows = U.map((u) => ({ u, p: programa(u.anios[Y], '0137') })).filter((r) => r.p && isNum(val(r.p, 'pim')) && val(r.p, 'pim') > 0);
        if (!rows.length) return { cifra: SD, titulo: 'la plata para investigar', html: `<p class="empty">No hay datos del programa 0137 para ${esc(Y)}.</p>${src()}` };
        const pim = sum(rows.map((r) => val(r.p, 'pim'))), dev = sum(rows.map((r) => val(r.p, 'dev')));
        const items = rows.map((r) => Object.assign(item(r.u, div(val(r.p, 'dev') || 0, val(r.p, 'pim')), `tenía ${soles(val(r.p, 'pim'))}`), { w: val(r.p, 'pim'), pim: val(r.p, 'pim'), dev: val(r.p, 'dev') })).sort((a, b) => b.v - a.v);
        const low = items.filter((i) => i.v < 0.5).length;
        const ej = div(dev, pim);
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        return {
          cifra: `${esc(isNum(ej) ? nf0.format(ej * 100) : SD)}<small>soles</small>`,
          titulo: `de cada S/ 100 que tenían las universidades para investigar en ${esc(Y)} se llegaron a gastar`,
          html: `<p class="lead">El presupuesto tiene un programa solo para ciencia y tecnología, el 0137. En ${esc(Y)}, ${esc(rows.length)} universidades tenían ahí ${esc(soles(pim))} y gastaron ${esc(soles(dev))}. Quedaron ${esc(soles(pim - dev))} sin usar.</p>
            <p>${low > 0 ? `En ${esc(low)} de ellas se gastó menos de la mitad.` : 'Ninguna gastó menos de la mitad.'} El tamaño de cada bolita es cuánta plata tenía para investigar.</p>
            ${hr ? `<p class="tu">${EnLa(h)} tenían ${esc(soles(hr.pim))} para investigar y gastaron ${esc(soles(hr.dev))}: ${esc(nf0.format(hr.v * 100))} de cada S/ 100.</p>` : (h ? tuNo(h, `no registra presupuesto en el programa 0137 en ${esc(Y)}.`) : '')}
            <figure class="fig anim"><p class="fig-t">¿Cuánto de su plata para investigar gastó cada una?</p><p class="fig-s">Gasto devengado entre presupuesto final (PIM) del programa 0137, ${esc(Y)}.</p><div data-fig="sw"></div>
              ${tableHTML(['Universidad', 'Tenía (PIM)', 'Gastó', '%'], items.map((i) => ({ key: i.key, cells: [i.ax, soles(i.pim), soles(i.dev), pct(i.v)] })), S.hl)}</figure>
            ${caveat([
              'El programa 0137 no recoge toda la investigación: hay gasto en investigación en otros programas, en proyectos de inversión y en fondos concursables que no pasan por la universidad.',
              'Lo que no se gasta no se «pierde» siempre: la plata de canon y de otras fuentes puede pasar al año siguiente como saldo.',
              'Gastar la plata no mide la calidad ni el resultado de la investigación.',
            ])}${src('Programa presupuestal 0137.')}`,
          mount(el) { const C = colors(); return [[$('[data-fig="sw"]', el), (b, C = colors()) => swarm(b, { items, size: true, color: C.dev, domain: [0, Math.max(1, ...items.map((i) => i.v))], ticks: [0, 0.25, 0.5, 0.75, 1], tickFmt: (t) => pct(t), fmt: (v) => pct(v), refs: [{ v: ej, label: `Todas juntas: ${pct(ej)}` }], aria: 'Porcentaje del presupuesto de investigación gastado por universidad' })]]; },
        };
      },
    },

    // 6. Costo por publicación
    {
      id: 'publicaciones', need: 'year', col: 'titicaca', sec: 'idi', toc: 'Cuánto cuesta un paper', sk: 'de gasto en investigación por publicación',
      build(Y) {
        const MINP = 10;
        const U = unisY(Y);
        const rows = U.map((u) => { const a = u.anios[Y]; return { u, idi: val(programa(a, '0137'), 'dev'), pubs: isNum(a.pubs) ? a.pubs : null }; });
        const ok = rows.filter((r) => isNum(r.idi) && r.idi > 0 && isNum(r.pubs) && r.pubs >= MINP);
        if (!ok.length) return { cifra: SD, titulo: 'por publicación', html: `<p class="empty">No hay datos suficientes de publicaciones y gasto en investigación para ${esc(Y)}.</p>${src()}` };
        const items = ok.map((r) => Object.assign(item(r.u, r.idi / r.pubs, `${nf0.format(r.pubs)} publicaciones`), { pubs: r.pubs })).sort((a, b) => b.v - a.v);
        const med = median(items.map((i) => i.v));
        const pooled = div(sum(ok.map((r) => r.idi)), sum(ok.map((r) => r.pubs)));
        const excl = rows.length - ok.length;
        const h = hlUni(); const hr = h && items.find((i) => i.key === String(h.pliego));
        const lo = items[items.length - 1].v, hi = items[0].v;
        const ticks = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) ticks.push(Math.pow(10, e));
        return {
          cifra: esc(soles(med)),
          titulo: `de gasto en investigación por cada publicación científica, en la universidad típica (${esc(Y)})`,
          html: `<p class="lead">Dividimos lo que se gastó en el programa de investigación (0137) entre los artículos publicados por cada universidad. Es una cuenta gruesa, de orden de magnitud: no usamos todo el presupuesto porque la mayor parte paga la enseñanza.</p>
            <p>Ojo con la regla: cada salto vale diez veces más que el anterior. Para todas juntas sale ${esc(soles(pooled))} por publicación.${excl > 0 ? ` Quedan fuera ${esc(excl)} universidades sin gasto en investigación registrado o con menos de ${esc(MINP)} publicaciones, porque ahí la división se vuelve muy inestable.` : ''}</p>
            ${hr ? `<p class="tu">${EnLa(h)}: ${esc(soles(hr.v))} por publicación (${esc(nf0.format(hr.pubs))} publicaciones).</p>` : (h ? tuNo(h, `no entra en esta cuenta en ${esc(Y)} (sin dato o con menos de ${esc(MINP)} publicaciones).`) : '')}
            <figure class="fig anim"><p class="fig-t">Soles del programa 0137 por publicación</p><p class="fig-s">Escala logarítmica. Cada bolita es una universidad.</p><div data-fig="sw"></div>
              ${tableHTML(['Universidad', 'S/ por publicación', 'Publicaciones'], items.map((i) => ({ key: i.key, cells: [i.ax, soles(i.v), nf0.format(i.pubs)] })), S.hl)}</figure>
            ${caveat([
              'Hay desfase: lo que se gasta un año suele convertirse en publicaciones uno o más años después.',
              'Las publicaciones incluyen coautorías con otras instituciones y trabajos pagados con fondos externos al programa 0137; eso abarata la cuenta.',
              'Al revés, parte del gasto en investigación está fuera del programa 0137 (obras, otros programas), lo que la encarece.',
              'No mide productividad ni calidad científica. Qué cuenta como «publicación» depende de la fuente bibliográfica indicada abajo.',
            ])}${srcCtx('pubs', 'Publicaciones')}`,
          mount(el) { const C = colors(); return [[$('[data-fig="sw"]', el), (b, C = colors()) => swarm(b, { items, log: true, color: C.pim, domain: [ticks[0], ticks[ticks.length - 1]], ticks, tickFmt: (t) => 'S/ ' + solesAxis(t), fmt: soles, refs: [{ v: med, label: `Mediana: ${soles(med)}` }], aria: 'Gasto en investigación por publicación, por universidad, escala logarítmica' })]]; },
        };
      },
    },

    // 7. Obras
    {
      id: 'obras', need: 'years', col: 'aji', sec: 'infra', toc: 'Obras a medio camino', sk: 'obras grandes gastaron menos de la mitad',
      build(Y) {
        const U = unisY(Y);
        const all = [];
        U.forEach((u) => (u.anios[Y].proyectos || []).forEach((p) => { if (p && isNum(p.pim) && p.pim > 0) all.push({ u, p }); }));
        if (!all.length) return { cifra: SD, titulo: 'obras a medio camino', html: `<p class="empty">No hay detalle de proyectos de inversión para ${esc(Y)}.</p>${src()}` };
        const thr = Math.max(1e6, quantile(all.map((r) => r.p.pim), 0.75) || 0);
        const big = all.filter((r) => r.p.pim >= thr);
        const slow = big.map((r) => ({ ...r, ej: isNum(r.p.dev) ? r.p.dev / r.p.pim : 0 })).filter((r) => r.ej < 0.5)
          .sort((a, b) => (b.p.pim - (b.p.dev || 0)) - (a.p.pim - (a.p.dev || 0)));
        const gap = sum(slow.map((r) => r.p.pim - (r.p.dev || 0)));
        const W = winYears(Y);
        const yearsWith = (u, code) => W.filter((y) => u.anios && u.anios[y] && (u.anios[y].proyectos || []).some((q) => String(q.codigo) === String(code) && isNum(q.pim) && q.pim > 0)).length;
        const h = hlUni();
        const tuBig = h ? big.filter((r) => r.u === h) : [], tuSlow = h ? slow.filter((r) => r.u === h) : [];
        const ordered = h ? [...tuSlow, ...slow.filter((r) => r.u !== h)] : slow;
        const card = (r) => {
          const ej = Math.max(0, Math.min(1, r.ej)); const n = r.p.codigo != null ? yearsWith(r.u, r.p.codigo) : null;
          const isTu = r.u === h;
          return `<li class="obra${isTu ? ' es-tu' : ''}"><div class="u">${isTu ? `<mark>${esc(label(r.u))}</mark>` : esc(label(r.u))}${r.p.codigo != null ? ' / CUI ' + esc(r.p.codigo) : ''}</div>
            <div class="n">${esc(sentence(r.p.nombre) || SD)}</div>
            <div class="bar" role="img" aria-label="Gastó ${esc(pct(ej))} de su presupuesto del año"><i class="grow" style="width:${(ej * 100).toFixed(1)}%"></i></div>
            <div class="f"><span>Gastó <strong>${esc(pct(r.ej))}</strong> de ${esc(soles(r.p.pim))}</span>${n ? `<span>Con presupuesto en ${esc(n)} de los últimos ${esc(W.length)} años</span>` : ''}</div></li>`;
        };
        const LIM = 6;
        let tu = '';
        if (h) {
          if (!tuBig.length) tu = tuNo(h, `no tuvo obras de ese tamaño en ${esc(Y)}.`);
          else if (!tuSlow.length) tu = `<p class="tu">${EnLa(h)} hubo ${esc(tuBig.length)} obra${tuBig.length > 1 ? 's' : ''} grande${tuBig.length > 1 ? 's' : ''} y ninguna gastó menos de la mitad.</p>`;
          else tu = `<p class="tu">${EnLa(h)} hubo ${esc(tuBig.length)} obra${tuBig.length > 1 ? 's' : ''} grande${tuBig.length > 1 ? 's' : ''}; ${esc(tuSlow.length)} ${tuSlow.length > 1 ? 'gastaron' : 'gastó'} menos de la mitad y ${tuSlow.length > 1 ? 'van' : 'va'} primero en la lista.</p>`;
        }
        return {
          cifra: `${esc(slow.length)}<small>de ${esc(big.length)}</small>`,
          titulo: `obras grandes de las universidades gastaron menos de la mitad de su presupuesto en ${esc(Y)}`,
          html: `<p class="lead">Una obra grande (un pabellón, un laboratorio, una biblioteca) recibe presupuesto cada año. Aquí van las que gastaron menos de la mitad de lo que tenían en ${esc(Y)}: juntas dejaron ${esc(soles(gap))} sin gastar ese año.</p>
            <p>Llamamos «grande» a todo proyecto con presupuesto de al menos ${esc(soles(thr))} en el año: el cuarto más caro de todos los proyectos universitarios.</p>
            ${tu}
            <figure class="fig anim">${ordered.length ? `<ul class="obras" data-list>${ordered.slice(0, LIM).map(card).join('')}</ul>${ordered.length > LIM ? `<button type="button" class="more" data-more aria-expanded="false">Ver las ${esc(ordered.length)}</button>` : ''}` : '<p class="empty">Ninguna obra grande quedó por debajo de la mitad.</p>'}</figure>
            ${caveat([
              'Lo gastado sobre lo presupuestado es avance financiero, no avance físico. Una obra puede estar en expediente técnico, en licitación, en controversia o paralizada por causas ajenas a la universidad.',
              'Muchas obras duran varios años: un año de poco gasto puede ser normal al inicio.',
              'Para ver el estado real de cada obra, busca su código CUI en el Banco de Inversiones del MEF o en INFObras (Contraloría).',
            ])}${src('Proyectos de inversión por pliego.')}`,
          mount(el) {
            const btn = $('[data-more]', el); if (!btn) return null;
            let open = false;
            btn.addEventListener('click', () => {
              open = !open;
              $('[data-list]', el).innerHTML = (open ? ordered : ordered.slice(0, LIM)).map(card).join('');
              btn.textContent = open ? `Ver solo ${LIM}` : `Ver las ${ordered.length}`;
              btn.setAttribute('aria-expanded', String(open));
            });
            return null;
          },
        };
      },
    },

    // 8. ¿Subió o bajó? En soles reales
    {
      id: 'real', need: 'base', col: 'cobre', sec: 'trayectoria', toc: '¿Subió o bajó?', sk: 'creció el gasto descontando la inflación',
      build() {
        const N = S.d.nacional || {};
        const yrs = S.closed.filter((y) => N[y] && isNum(N[y].dev));
        if (yrs.length < 2 || !ipcIdx(yrs[yrs.length - 1])) return { cifra: SD, titulo: 'en soles de hoy', html: '<p class="empty">Faltan datos de inflación o de años anteriores.</p>' };
        const yB = String(ipcBase());
        const yA = yrs.includes('2016') ? '2016' : yrs[0], yZ = yrs[yrs.length - 1];
        const iA = yrs.indexOf(yA);
        const nom = yrs.map((y) => N[y].dev), rea = yrs.map((y) => real(N[y].dev, y));
        const gR = div(real(N[yZ].dev, yZ), real(N[yA].dev, yA));
        const gN = div(N[yZ].dev, N[yA].dev);
        const same = S.d.universidades.filter((u) => u.anios && u.anios[yA] && u.anios[yZ] && isNum(val(u.anios[yA].total, 'dev')) && isNum(val(u.anios[yZ].total, 'dev')));
        const gS = div(sum(same.map((u) => real(u.anios[yZ].total.dev, yZ))), sum(same.map((u) => real(u.anios[yA].total.dev, yA))));
        const h = hlUni();
        const hA = h && h.anios && h.anios[yA] && val(h.anios[yA].total, 'dev'), hZ = h && h.anios && h.anios[yZ] && val(h.anios[yZ].total, 'dev');
        const hg = isNum(hA) && isNum(hZ) ? div(real(hZ, yZ), real(hA, yA)) : null;
        const nA = N[yA].n_unis, nZ = N[yZ].n_unis;
        return {
          cifra: esc(pctSigned(isNum(gR) ? gR - 1 : null)),
          titulo: `creció el gasto de las universidades entre ${esc(yA)} y ${esc(yZ)}, ya descontada la inflación`,
          html: `<p class="lead">Un sol de ${esc(yA)} no compra lo mismo que uno de ${esc(yZ)}. Para comparar de verdad, pasamos todo a «soles de ${esc(yB)}» con el índice de precios del BCRP. Sin ese ajuste, el crecimiento parece de ${esc(pctSigned(isNum(gN) ? gN - 1 : null))}.</p>
            <p>Un detalle importante: en ${esc(yA)} había ${esc(nA)} universidades con presupuesto propio y en ${esc(yZ)}, ${esc(nZ)}. Si solo miras las ${esc(same.length)} que existían en ambos años, el crecimiento real es ${esc(pctSigned(isNum(gS) ? gS - 1 : null))}.</p>
            ${h ? (isNum(hg) ? `<p class="tu">${EnLa(h)}: ${esc(pctSigned(hg - 1))} en soles de ${esc(yB)}, de ${esc(soles(real(hA, yA)))} a ${esc(soles(real(hZ, yZ)))}.</p>` : tuNo(h, `no tiene datos en ${esc(yA)} y ${esc(yZ)} para comparar.`)) : ''}
            <figure class="fig anim"><p class="fig-t">Gasto devengado de todas las universidades, por año</p><div data-fig="line"></div>
              <ul class="legend"><li><i style="background:var(--color-dev)"></i>En soles de ${esc(yB)} (real)</li><li><i style="background:var(--color-pia)"></i>En soles de cada año (nominal)</li></ul></figure>
            ${caveat([
              'El ajuste usa el IPC de Lima (promedio anual). Los precios que paga una universidad (sueldos, obras, equipos) pueden subir a otro ritmo.',
              'Parte del crecimiento viene de universidades nuevas, no de más plata para las que ya existían.',
              'Crecer no es mejor ni peor por sí mismo: puede reflejar más estudiantes, nuevas sedes, canon u obras puntuales.',
            ])}<p class="src">${esc(SRC_MEF)} Inflación: ${S.d.ipc && S.d.ipc.url ? linkTo(S.d.ipc.url, 'BCRP') : 'BCRP'}${S.d.ipc && S.d.ipc.fuente ? ', ' + esc(S.d.ipc.fuente) : ''}. Años cerrados ${esc(yrs[0])}–${esc(yZ)}.</p>`,
          mount(el) { const C = colors(); return [[$('[data-fig="line"]', el), (b, C = colors()) => lines(b, { years: yrs, markA: iA, notes: [`${nA} universidades`, `${nZ} universidades`], series: [{ name: `Soles de ${yB}`, vals: rea, color: C.dev, width: 4 }, { name: 'Nominal', vals: nom, color: C.pia, dash: true, width: 2.5 }], aria: `Gasto devengado total por año en soles reales y nominales, ${yrs[0]} a ${yZ}` })]]; },
        };
      },
    },

    // 9. Línea base: ¿crecieron más que el resto del Estado?
    {
      id: 'vs-estado', need: 'base', col: 'titicaca', sec: 'trayectoria', toc: '¿Más que el resto del Estado?', sk: 'de cada S/ 100 del Estado van a universidades',
      build() {
        const B = S.d.baseline && S.d.baseline.anios, N = S.d.nacional || {};
        if (!B) return { cifra: SD, titulo: 'de cada S/ 100 del Estado van a universidades públicas', html: '<p class="empty">Aún no hay datos del resto del Estado para comparar.</p>' };
        const ok = (y) => B[y] && N[y] && B[y].total && isNum(N[y].pim);
        const yrs = S.closed.filter(ok);
        if (yrs.length < 2) return { cifra: SD, titulo: 'de cada S/ 100 del Estado van a universidades públicas', html: '<p class="empty">Faltan años para comparar.</p>' };
        const y0 = yrs[0], yZ = yrs[yrs.length - 1], yA = yrs.includes('2016') ? '2016' : y0;
        const sh = div(N[yZ].pim, val(B[yZ].total, 'pim'));
        const shares = yrs.map((y) => div(N[y].pim, val(B[y].total, 'pim'))).filter(isNum);
        const pbiSh = yrs.map((y) => (isNum(B[y].pbi_nominal) && B[y].pbi_nominal > 0 ? div(N[y].dev, B[y].pbi_nominal) : null)).filter(isNum);
        // A) devengado real yA→yZ
        const gReal = (a, b) => (isNum(a) && isNum(b) ? div(real(b, yZ), real(a, yA)) - 1 : null);
        const rowsA = [
          { key: 'u', ax: 'Universidades', full: 'Universidades públicas', v: gReal(N[yA].dev, N[yZ].dev) },
          { key: 'e', ax: 'Función Educación', full: 'Función Educación (los 3 niveles de gobierno)', v: gReal(val(B[yA].funcion_educacion, 'dev'), val(B[yZ].funcion_educacion, 'dev')) },
          { key: 't', ax: 'Todo el Estado', full: 'Presupuesto público total', v: gReal(val(B[yA].total, 'dev'), val(B[yZ].total, 'dev')) },
        ].filter((r) => isNum(r.v));
        // B) PIM nominal y0→yZ, en veces (y PBI)
        const veces = (a, b) => (isNum(a) && isNum(b) && a > 0 ? b / a : null);
        const yPbi = [...yrs].reverse().find((y) => isNum(B[y].pbi_nominal));
        const rowsB = [
          { key: 'u', ax: 'Universidades', full: 'Universidades públicas (PIM)', v: veces(N[y0].pim, N[yZ].pim) },
          { key: 'e', ax: 'Función Educación', full: 'Función Educación (PIM)', v: veces(val(B[y0].funcion_educacion, 'pim'), val(B[yZ].funcion_educacion, 'pim')) },
          { key: 'p', ax: `PBI${yPbi !== yZ ? ' (' + yPbi + ')' : ''}`, full: 'PBI nominal (BCRP)', v: yPbi ? veces(B[y0].pbi_nominal, B[yPbi].pbi_nominal) : null },
          { key: 't', ax: 'Todo el Estado', full: 'Presupuesto público total (PIM)', v: veces(val(B[y0].total, 'pim'), val(B[yZ].total, 'pim')) },
        ].filter((r) => isNum(r.v)).sort((a, b) => b.v - a.v);
        const vx = (v) => '×' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
        const uA = rowsA.find((r) => r.key === 'u'), tA = rowsA.find((r) => r.key === 't'), eA = rowsA.find((r) => r.key === 'e');
        const uB = rowsB.find((r) => r.key === 'u'), lessB = rowsB.filter((r) => r.key !== 'u' && r.v > (uB ? uB.v : Infinity));
        const nNew = isNum(N[yZ].n_unis) && isNum(N[y0].n_unis) ? N[yZ].n_unis - N[y0].n_unis : null;
        const rng = (a) => (a.length ? `entre ${pct(Math.min(...a), 1)} y ${pct(Math.max(...a), 1)}` : SD);
        const cents = (v) => (isNum(v) ? nf1.format(v * 100) : SD);
        return {
          cifra: `S/ ${esc(cents(sh))}`,
          titulo: `de cada S/ 100 del presupuesto del Estado fueron a universidades públicas en ${esc(yZ)}. ¿Crecieron más que el resto?`,
          html: `<p class="lead">Depende de cómo lo mires, y aquí van las dos formas, sin trampa.</p>
            <p><strong>Mirando lo gastado y descontando la inflación</strong> (${esc(yA)} a ${esc(yZ)}), las universidades crecieron ${esc(pctSigned(uA && uA.v))}: más que todo el Estado (${esc(pctSigned(tA && tA.v))}) y casi igual que toda la función Educación (${esc(pctSigned(eA && eA.v))}).</p>
            <p><strong>Mirando el presupuesto final en soles de cada año</strong> (${esc(y0)} a ${esc(yZ)}), el de las universidades se multiplicó ${esc(uB ? vx(uB.v) : SD)}${lessB.length ? `, menos que ${esc(lessB.map((r) => r.ax.toLowerCase().replace('todo el estado', 'todo el Estado').replace('función educación', 'la función Educación').replace(/^pbi/, 'el PBI') + ' (' + vx(r.v) + ')').join(', '))}` : ''}.${isNum(nNew) && nNew > 0 ? ` Y eso que en el periodo se sumaron ${esc(nNew)} universidades nuevas.` : ''}</p>
            <p>En resumen, su peso casi no se mueve: ${esc(rng(shares))} del presupuesto público cada año y ${esc(rng(pbiSh))} del PBI.</p>
            <figure class="fig anim"><p class="fig-t">Lo gastado, en soles de ${esc(ipcBase())}: ${esc(yA)} a ${esc(yZ)}</p><div data-fig="a"></div></figure>
            <figure class="fig anim"><p class="fig-t">El presupuesto final, en soles de cada año: ¿cuántas veces se multiplicó de ${esc(y0)} a ${esc(yZ)}?</p><div data-fig="b"></div></figure>
            ${caveat([
              'Los años de inicio cambian la foto: ' + y0 + ' y ' + yA + ' dan resultados distintos. Por eso mostramos las dos comparaciones.',
              'El presupuesto total suma los tres niveles de gobierno y tiene doble conteo por transferencias entre niveles; sirve para comparar tendencias, no para sumar.',
              'La función Educación incluye colegios, institutos y universidades de los tres niveles de gobierno.',
              'Que las universidades pesen poco o mucho no dice si el monto es suficiente: eso depende de cuántos estudiantes atienden y de qué calidad se espera.',
            ])}<p class="src">${esc(SRC_MEF)} Resto del Estado y PBI: ${esc(S.d.baseline.fuente || 'MEF y BCRP')}. Inflación: BCRP.</p>`,
          mount(el) {
            return [
              [$('[data-fig="a"]', el), (b, C = colors()) => hbars(b, { rows: rowsA, labW: 132, color: C.pia, hiKey: 'u', hiColor: C.dev, fmt: (v) => pctSigned(v), aria: `Crecimiento real del gasto devengado ${yA}-${yZ}: universidades, función Educación y todo el Estado` })],
              [$('[data-fig="b"]', el), (b, C = colors()) => hbars(b, { rows: rowsB, labW: 132, vW: 64, color: C.pia, hiKey: 'u', hiColor: C.pim, fmt: vx, aria: `Veces que se multiplicó el presupuesto final ${y0}-${yZ}: universidades, función Educación, PBI y todo el Estado` })],
            ];
          },
        };
      },
    },

    // 10. Las que más crecieron (año anterior → año elegido, en soles reales)
    {
      id: 'crecieron', need: 'base', col: 'cochinilla', sec: 'trayectoria', toc: 'Las que más crecieron', sk: 'cambió el gasto de la universidad típica en un año',
      build(Y) {
        const Y0 = [...S.closed, ...S.partial].filter((y) => y < Y).pop();
        if (!Y0) return { cifra: SD, titulo: 'las que más crecieron', html: `<p class="empty">Se necesita un año anterior a ${esc(Y)}.</p>` };
        const useReal = !!(ipcIdx(Y) && ipcIdx(Y0));
        const adj = (v, y) => (useReal ? real(v, y) : v);
        const rows = S.d.universidades.map((u) => ({ u, a: val(u.anios && u.anios[Y0] && u.anios[Y0].total, 'dev'), b: val(u.anios && u.anios[Y] && u.anios[Y].total, 'dev') }))
          .filter((r) => isNum(r.a) && r.a > 0 && isNum(r.b));
        if (!rows.length) return { cifra: SD, titulo: 'las que más crecieron', html: `<p class="empty">Sin datos para comparar ${esc(Y0)} y ${esc(Y)}.</p>` };
        const items = rows.map((r) => Object.assign(item(r.u, adj(r.b, Y) / adj(r.a, Y0) - 1), { a: r.a, b: r.b })).sort((a, b) => b.v - a.v);
        const med = median(items.map((i) => i.v));
        const up = items.filter((i) => i.v > 0).length;
        const h = hlUni(); const k = h ? items.findIndex((i) => i.key === String(h.pliego)) : -1;
        const TOP = 6, BOT = 4;
        const show = items.length <= TOP + BOT + 1 ? items.slice() : [...items.slice(0, TOP), { sep: true }, ...items.slice(-BOT)];
        if (k >= TOP && k < items.length - BOT) { const j = show.findIndex((r) => r.sep); show.splice(j + 1, 0, items[k], { sep: true }); }
        return {
          cifra: esc(pctSigned(med)),
          titulo: `cambió el gasto de la universidad típica de ${esc(Y0)} a ${esc(Y)}${useReal ? `, en soles de ${esc(ipcBase())}` : ''}`,
          html: `<p class="lead">De un año a otro, unas universidades pisan el acelerador y otras frenan. ${esc(up)} de ${esc(items.length)} gastaron más que el año anterior${useReal ? ', ya descontada la inflación' : ''}. Aquí las que más subieron y las que más bajaron.</p>
            ${k >= 0 ? `<p class="tu">${EnLa(h)}: ${esc(pctSigned(items[k].v))}, puesto ${esc(k + 1)} de ${esc(items.length)}.</p>` : (h ? tuNo(h, `no tiene datos en ${esc(Y0)} y ${esc(Y)}.`) : '')}
            <figure class="fig anim"><p class="fig-t">Variación del gasto devengado, ${esc(Y0)} a ${esc(Y)}</p><div data-fig="bars"></div>
              ${tableHTML(['Universidad', `Devengado ${Y0}`, `Devengado ${Y}`, 'Variación'], items.map((i) => ({ key: i.key, cells: [i.ax, soles(i.a), soles(i.b), pctSigned(i.v)] })), S.hl)}</figure>
            ${caveat([
              'Un año con una obra grande puede inflar el crecimiento, y el año siguiente parecer una caída.',
              'Crecer más no es mejor ni peor: puede reflejar más estudiantes, nuevas sedes, canon o transferencias puntuales.',
              useReal ? 'Ajustado con el IPC de Lima del BCRP; los precios de una universidad pueden moverse a otro ritmo. La tabla muestra montos nominales.' : 'Variación nominal: no descuenta la inflación.',
            ])}${src()}`,
          mount(el) { const C = colors(); return [[$('[data-fig="bars"]', el), (b, C = colors()) => hbars(b, { rows: show, color: C.ink, colorNeg: C.ink2, fmt: (v) => pctSigned(v), aria: `Universidades que más y menos cambiaron su gasto entre ${Y0} y ${Y}` })]]; },
        };
      },
    },

    // 11. Lo que viene en 2027
    {
      id: 'en-2027', need: 'p2027', col: 'maiz', sec: 'ley2027', toc: 'Lo que viene en 2027', sk: 'propone el presupuesto 2027',
      build() {
        const E = S.d.expectativa_2027;
        if (!E || !E.total_universidades) return { cifra: SD, titulo: 'lo que viene en 2027', html: '<p class="empty">Aún no hay datos del presupuesto 2027.</p>' };
        const T = E.total_universidades;
        const vp = isNum(T.var_pct) ? T.var_pct / 100 : null;
        const items = S.d.universidades.filter((u) => u.expectativa_2027 && isNum(u.expectativa_2027.var_pct)).map((u) => Object.assign(item(u, u.expectativa_2027.var_pct / 100), { e: u.expectativa_2027 }));
        const B = [
          { label: 'Baja', test: (v) => v < 0, neg: true }, { label: '0 a 10%', test: (v) => v >= 0 && v < 0.1 },
          { label: '10 a 25%', test: (v) => v >= 0.1 && v < 0.25 }, { label: '25 a 50%', test: (v) => v >= 0.25 && v < 0.5 }, { label: '+50%', test: (v) => v >= 0.5 },
        ];
        const h = hlUni(); const he = h && h.expectativa_2027;
        const bins = B.map((b) => ({ label: b.label, neg: b.neg, count: items.filter((i) => b.test(i.v)).length, tu: h && he && isNum(he.var_pct) && b.test(he.var_pct / 100) ? label(h) : '' }));
        const ET = E.estado_tramite || {};
        const steps = [['proyecto', 'Proyecto del Ejecutivo'], ['dictamen', 'Dictamen de la Comisión de Presupuesto'], ['autografa', 'Aprobado por el Pleno (autógrafa)'], ['ley_publicada', 'Publicación de la ley']]
          .filter(([k]) => ET[k]).map(([k, n]) => {
            const s = ET[k]; const f = s.fecha ? new Date(s.fecha + 'T12:00:00') : null;
            const fd = f && !isNaN(f) ? f.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Pendiente';
            return `<li class="${s.fecha ? '' : 'pend'}"><b>${esc(n)}</b><span>${esc(fd)}${s.url && safeUrl(s.url) ? ' / ' + linkTo(s.url, 'ver documento') : ''}</span></li>`;
          }).join('');
        const docs = (E.documentos || []).filter((d) => /proyecto|anexo/.test(d.tipo || '')).slice(0, 3).map((d) => linkTo(d.url, d.titulo)).join('; ');
        // Obras propuestas para 2027 (data/p2027.json): cuánto es de proyectos nuevos.
        const obras27 = () => {
          const P = S.p27; if (!P || !P.resumen || !Array.isArray(P.proyectos)) return '';
          const R = P.resumen, tot = R.monto_proyectos, nue = R.monto_nuevos;
          const yrsCon = (pr) => Object.values(pr.historia || {}).filter((x) => x && isNum(x.pim) && x.pim > 0).length;
          const desde = (pr) => Object.keys(pr.historia || {}).filter((y) => isNum(pr.historia[y].pim) && pr.historia[y].pim > 0).sort()[0];
          const mine = h ? P.proyectos.filter((pr) => String(pr.pliego) === String(h.pliego)) : [];
          const top = (mine.length ? mine : P.proyectos).slice().sort((a, b) => b.monto_2027 - a.monto_2027).slice(0, mine.length ? 50 : 4);
          const w = isNum(tot) && tot > 0 ? Math.max(0.4, (nue / tot) * 100) : 0;
          const card = (pr) => { const n = yrsCon(pr), d0 = desde(pr);
            return `<li class="obra${h && String(pr.pliego) === String(h.pliego) ? ' es-tu' : ''}"><div class="u">${esc(pr.uni)}${pr.codigo ? ' / CUI ' + esc(pr.codigo) : ''}</div><div class="n">${esc(sentence(pr.nombre))}</div>
              <div class="f"><span>Propuesto 2027: <strong>${esc(soles(pr.monto_2027))}</strong></span><span>${pr.nuevo ? 'Proyecto nuevo' : `Con presupuesto en ${esc(n)} año${n === 1 ? '' : 's'} desde ${esc(d0 || '')}; gastado hasta hoy ${esc(soles(pr.dev_acumulado))}`}</span></div></li>`; };
          const mineN = mine.filter((pr) => pr.nuevo);
          return `<figure class="fig anim"><p class="fig-t">De ${esc(solesF(tot))} en obras propuestas para 2027, solo ${esc(R.n_nuevos)} proyectos (${esc(soles(nue))}) son nuevos; el resto ya venía</p>
            <p class="fig-s">${esc(R.n_nuevos)} de ${esc(R.n_proyectos)} proyectos de inversión son nuevos; el resto ya venía con presupuesto en años anteriores.</p>
            <div class="stack" role="img" aria-label="${esc(`Obras propuestas 2027: ${soles(nue)} nuevas y ${solesF(tot - nue)} que ya venían`)}"><i class="pop" style="width:${w.toFixed(2)}%;background:var(--color-dev)"></i><i class="pop" style="--d:.15s;width:${(100 - w).toFixed(2)}%;background:var(--color-pim)"></i></div>
            <ul class="stack-l"><li><i class="sw" style="background:var(--color-dev)"></i><b>${esc(soles(nue))}</b>nuevas (${esc(R.n_nuevos)})</li><li><i class="sw" style="background:var(--color-pim)"></i><b>${esc(solesF(tot - nue))}</b>ya venían (${esc(R.n_proyectos - R.n_nuevos)})</li></ul>
            ${h ? (mine.length ? `<p class="tu">Para la <mark>${esc(label(h))}</mark> se proponen ${esc(mine.length)} obra${mine.length > 1 ? 's' : ''} por ${esc(soles(sum(mine.map((pr) => pr.monto_2027))))}; ${mineN.length ? `${esc(mineN.length)} nueva${mineN.length > 1 ? 's' : ''}` : 'ninguna es nueva'}. Esta es la lista completa, de mayor a menor:</p>` : tuNo(h, 'no tiene obras en el proyecto 2027.')) : '<p class="fig-s">Las obras con más plata propuesta:</p>'}
            ${top.length ? `<ul class="obras" data-l27>${top.map((pr, k) => card(pr).replace('<li ', k >= 4 ? '<li hidden ' : '<li ')).join('')}</ul>${top.length > 4 ? `<button type="button" class="more" data-m27 aria-expanded="false">Ver las ${esc(top.length)} obras</button>` : ''}` : ''}</figure>`;
        };
        const vpTxt = (v) => (isNum(v) ? pctSigned(v / 100, Math.abs(v) >= 100 ? 0 : 1) : SD);
        return {
          cifra: esc(isNum(vp) ? vpTxt(T.var_pct) : SD),
          titulo: 'más plata para las universidades públicas propone el presupuesto 2027, frente al de apertura de 2026',
          html: `<p class="lead">Ojo: es una propuesta. El Congreso aprobó la ley de presupuesto 2027 el 20 de noviembre, pero el detalle por universidad de esa versión final aún no se publica. Estas cifras salen de los anexos del proyecto que mandó el Ejecutivo, y pueden cambiar.</p>
            <p>El proyecto asigna ${esc(soles(T.pia_2027))} a ${esc(T.n_pliegos_2027)} universidades, frente a ${esc(soles(T.pia_2026))} con que arrancaron 2026.${isNum(T.var_pct_mismos_pliegos) ? ` Si solo cuentas las que ya tenían presupuesto en 2026, la subida es ${esc(vpTxt(T.var_pct_mismos_pliegos))}.` : ''} Pero no a todas les toca igual:</p>
            ${he && isNum(he.pia_2027) ? `<div class="tu-card"><p>Para la <mark>${esc(label(h))}</mark>, el proyecto propone</p><p class="big">${esc(soles(he.pia_2027))}</p><p>frente a ${esc(soles(he.pia_2026))} con que arrancó 2026 (${esc(vpTxt(he.var_pct))}).</p></div>` : (h ? tuNo(h, 'no tiene un monto propio en el proyecto 2027; las universidades nuevas se financian desde la reserva de contingencia durante el año.') : '')}
            <figure class="fig anim"><p class="fig-t">¿Cuántas universidades suben o bajan en 2027?</p><p class="fig-s">Presupuesto de apertura 2027 propuesto frente al de 2026, ${esc(items.length)} universidades.</p><div data-fig="hist"></div>
              ${tableHTML(['Universidad', 'PIA 2026', 'PIA 2027 propuesto', 'Variación'], items.slice().sort((a, b) => b.v - a.v).map((i) => ({ key: i.key, cells: [i.ax, soles(i.e.pia_2026), soles(i.e.pia_2027), vpTxt(i.e.var_pct)] })), S.hl)}</figure>
            ${obras27()}
            <figure class="fig"><p class="fig-t">En qué va el trámite</p><ol class="tramite">${steps}</ol></figure>
            ${caveat([
              'Es el presupuesto de apertura (PIA) propuesto. Durante 2027 cambiará con transferencias y saldos, como cada año (capítulo 1).',
              'Las subidas muy grandes suelen ser de universidades nuevas o con una obra puntual; no implican más plata para el funcionamiento diario.',
              'La versión aprobada por el Pleno mantiene el total del sector público pero movió plata del Gobierno Nacional a regiones y municipios; el monto final de cada universidad puede diferir.',
              'Una obra «nueva» es la que no registra ejecución en el SIAF entre 2021 y 2026; que una obra ya venga de antes no es malo por sí mismo: muchas duran varios años.',
            ])}<p class="src">Fuente: ${docs || esc(E.norma || 'Proyecto de Ley de Presupuesto 2027')}. Comparación con el PIA 2026 del MEF.</p>`,
          mount(el) {
            const mb = $('[data-m27]', el);
            if (mb) mb.addEventListener('click', () => {
              const open = mb.getAttribute('aria-expanded') !== 'true';
              [...$('[data-l27]', el).children].forEach((li, k) => { if (k >= 4) li.hidden = !open; });
              mb.setAttribute('aria-expanded', String(open));
              mb.textContent = open ? 'Ver solo 4' : `Ver las ${$('[data-l27]', el).children.length} obras`;
            });
            const C = colors(); return [[$('[data-fig="hist"]', el), (b, C = colors()) => histo(b, { bins, color: C.pia, colorNeg: C.ink2, aria: 'Número de universidades por rango de variación del presupuesto 2027 propuesto' })]]; },
        };
      },
    },
    // 12. ¿A quién le dieron más? (data/analisis2027.json)
    {
      id: 'a-quien', need: 'a27', col: 'chicha', sec: 'ley2027', toc: '¿A quién le dieron más?', sk: 'del aumento de 2027 se lo llevan 5 universidades',
      build() {
        const A = S.a27;
        if (!A || !A.total || !Array.isArray(A.universidades)) return { cifra: SD, titulo: '¿a quién le dieron más en 2027?', html: '<p class="empty">Aún no hay análisis del presupuesto 2027 por universidad.</p>' };
        const T = A.total, G = A.por_generica || {}, F = A.por_fuente || {};
        const us = A.universidades.filter((u) => isNum(u.delta));
        const byP = new Map(S.d.universidades.map((u) => [String(u.pliego), u]));
        const nm = (x) => { const u = byP.get(String(x.pliego)); return u ? axisLabel(u) : String(x.uni || x.pliego); };
        const nmP = (x) => { const u = byP.get(String(x.pliego)); return u ? label(u) : String(x.uni || x.pliego); };
        const fullOf = (x) => { const u = byP.get(String(x.pliego)); return u ? label(u) + ', ' + fullName(u) : String(x.nombre || x.uni); };
        const sorted = us.slice().sort((a, b) => b.delta - a.delta);
        const top5 = sorted.slice(0, 5);
        const h = hlUni(); const hx = h && us.find((x) => String(x.pliego) === String(h.pliego));
        const TOP = 8, BOT = 5;
        const row = (x) => ({ key: String(x.pliego), ax: nm(x), full: fullOf(x), v: x.delta });
        let rows = [...sorted.slice(0, TOP).map(row), { sep: true }, ...sorted.slice(-BOT).map(row)];
        const k = hx ? sorted.indexOf(hx) : -1;
        if (k >= TOP && k < sorted.length - BOT) rows.splice(TOP + 1, 0, row(hx), { sep: true });
        const sF = (v) => (v >= 0 ? '+' : '−') + solesF(Math.abs(v)).replace('S/ ', 'S/ ');
        const share = (v) => (isNum(v) && T.delta ? v / T.delta : null);
        const GN = [['inversion', 'Obras y equipos', '--color-inversion'], ['personal', 'Sueldos', '--color-personal'], ['bys', 'Bienes y servicios', '--color-bys'], ['otros', 'Otros', '--color-otros'], ['pensiones', 'Pensiones', '--color-pensiones']]
          .filter(([key]) => isNum(G[key])).map(([key, n, c]) => ({ key, ax: n, full: n, v: G[key], c }));
        const FN = [['rdr', 'Lo que cobra (RDR)', '--color-rdr'], ['rd', 'Canon y regalías (RD)', '--color-canon'], ['ro', 'Tesoro público (RO)', '--color-ro'], ['dyt', 'Donaciones y transf.', '--color-dyt']]
          .filter(([key]) => isNum(F[key])).map(([key, n, c]) => ({ key, ax: n, full: n, v: F[key], c }));
        const dep = (A.por_departamento || []).filter((d) => isNum(d.delta)).sort((a, b) => a.delta - b.delta)[0];
        const depUnis = dep ? us.filter((x) => x.departamento === dep.departamento && x.delta < 0).map(nmP) : [];
        const rdTop = div(sum(top5.map((x) => x.f_rd)), sum(top5.map((x) => x.delta)));
        const lista = (arr) => (arr.length > 1 ? arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1] : arr.join(''));
        const rho = A.rho_ejecucion_vs_aumento;
        // Explicación para tu universidad: genérica y fuente que más pesan en su cambio.
        let tu = '';
        if (h) {
          if (hx) {
            const gk = [['d_inversion', 'inversión'], ['d_personal', 'sueldos'], ['d_bys', 'bienes y servicios'], ['d_pensiones', 'pensiones'], ['d_otros', 'otros gastos']].filter(([f]) => isNum(hx[f])).sort((a, b) => (Math.sign(hx.delta) * hx[b[0]]) - (Math.sign(hx.delta) * hx[a[0]]))[0];
            const fk = [['f_rd', 'canon y regalías'], ['f_rdr', 'lo que cobra la universidad'], ['f_ro', 'el Tesoro público'], ['f_dyt', 'transferencias']].filter(([f]) => isNum(hx[f])).sort((a, b) => (Math.sign(hx.delta) * hx[b[0]]) - (Math.sign(hx.delta) * hx[a[0]]))[0];
            const mm = hx.delta >= 0 ? 'más' : 'menos';
            tu = `<p class="tu">A la <mark>${esc(label(h))}</mark> le asignan ${esc(sF(hx.delta))} en 2027 (${esc(pctSigned(hx.var_pct, 1))})${gk && fk ? `, sobre todo por ${mm} ${esc(gk[1])} pagad${gk[1] === 'inversión' ? 'a' : 'os'} con ${esc(fk[1])}` : ''}. Es el puesto ${esc(sorted.indexOf(hx) + 1)} de ${esc(sorted.length)} en aumento.</p>`;
          } else tu = tuNo(h, 'no tiene un monto propio en el proyecto 2027.');
        }
        return {
          cifra: esc(pct(T.top5_pct_del_aumento)),
          titulo: `de los ${esc(solesF(T.delta))} extra que propone el presupuesto 2027 se lo llevan solo 5 universidades`,
          html: `<p class="lead">El aumento para 2027 no se reparte parejo. ${esc(T.n_suben)} universidades suben y ${esc(T.n_bajan)} bajan, pero cinco concentran más de la mitad de la plata nueva: ${esc(lista(top5.map((x) => `${nmP(x)} (${sF(x.delta)})`)))}.</p>
            <p>¿Por qué ellas? ${isNum(rdTop) && rdTop >= 0.5 ? `En esas cinco, el ${esc(pct(rdTop))} del aumento viene del canon y las regalías: la plata que llega a algunas regiones por la minería y el gas. Depende de cuánto se extrae y a qué precio, no de un premio a la universidad.` : 'Por obras puntuales y por la fuente de financiamiento de cada una (ver abajo).'} En el total, en cambio, el aumento se reparte entre lo que cobran las universidades, el canon y el Tesoro.${dep && dep.delta < 0 ? ` ${esc(titleCase(dep.departamento))} es el departamento que más pierde (${esc(sF(dep.delta))}${depUnis.length ? `: ${esc(lista(depUnis))}` : ''}).` : ''}</p>
            ${isNum(rho) ? `<p>¿Reciben más las que mejor gastan lo que tienen? No se ve esa relación: la correlación entre ejecución 2025 y aumento 2027 es prácticamente cero (ρ = ${esc(new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rho).replace('-', '−'))}${Math.abs(rho) < 0.05 ? ', o sea, ninguna' : ''}).</p>` : ''}
            ${tu}
            <figure class="fig anim"><p class="fig-t">Cuánto sube o baja cada universidad, PIA 2027 propuesto frente a PIA 2026</p><p class="fig-s">Las 8 que más suben y las 5 que más bajan.</p><div data-fig="d"></div>
              ${tableHTML(['Universidad', 'PIA 2026', 'PIA 2027', 'Cambio'], sorted.map((x) => ({ key: String(x.pliego), cells: [nm(x), soles(x.pia_2026), soles(x.pia_2027), sF(x.delta)] })), S.hl)}</figure>
            <figure class="fig anim"><p class="fig-t">¿En qué se va el aumento? ${esc(pct(share(G.inversion)))} es para obras y equipos</p><div data-fig="g"></div></figure>
            <figure class="fig anim"><p class="fig-t">¿Con qué plata?</p><div data-fig="f"></div></figure>
            ${caveat([
              'Es el proyecto de presupuesto: el detalle por universidad de la ley aprobada aún no se publica y los montos pueden cambiar.',
              'El canon depende de la producción y los precios de la minería y el gas en cada región; no es un premio ni un castigo a la universidad.',
              'La correlación describe asociación, no causa. Se calculó con universidades de PIA 2026 de S/ 10 M o más.',
              'Montos nominales: compara el presupuesto con el que arranca cada año (PIA), no lo que se termina gastando.',
            ])}<p class="src">Fuente: ${esc(A.fuente || 'Proyecto de Presupuesto 2027 y SIAF')}.</p>`,
          mount(el) {
            return [
              [$('[data-fig="d"]', el), (b, C = colors()) => hbars(b, { rows, color: C.ink, colorNeg: C.dev, vW: 84, fmt: sF, aria: 'Cambio del presupuesto de apertura 2027 frente a 2026 por universidad' })],
              [$('[data-fig="g"]', el), (b) => hbars(b, { rows: GN.map((r) => ({ ...r, color: getComputedStyle(document.documentElement).getPropertyValue(r.c).trim() })), labW: 140, vW: 84, color: '#888', fmt: sF, aria: 'Aumento 2027 por tipo de gasto' })],
              [$('[data-fig="f"]', el), (b) => hbars(b, { rows: FN.map((r) => ({ ...r, color: getComputedStyle(document.documentElement).getPropertyValue(r.c).trim() })), labW: 160, vW: 84, color: '#888', fmt: sF, aria: 'Aumento 2027 por fuente de financiamiento' })],
            ];
          },
        };
      },
    },
  ];

  // ---------- render ----------
  let io = null, animIO = null, gen = 0;
  const portada = (i, inner) => `<header class="portada"><div class="portada-in"><p class="cap-n">Capítulo ${i + 1}</p>${inner}</div></header>`;
  function render() {
    gen += 1;
    const myGen = gen;
    S.mounts = [];
    const host = $('#capitulos');
    const prevH = {};
    host.querySelectorAll('.cap').forEach((sec) => { prevH[sec.id] = sec.offsetHeight; });
    host.innerHTML = '';
    if (io) io.disconnect();
    STORIES.forEach((st, i) => {
      const [c, on] = PAL[st.col];
      const sec = document.createElement('section');
      sec.className = 'cap is-loading';
      sec.id = st.id;
      sec.dataset.i = String(i);
      sec.style.setProperty('--c', c); sec.style.setProperty('--on', on);
      sec.setAttribute('aria-busy', 'true');
      sec.setAttribute('aria-labelledby', 'h-' + st.id);
      if (prevH[st.id]) sec.style.minHeight = prevH[st.id] + 'px';
      sec.innerHTML = portada(i, `<h2 id="h-${esc(st.id)}"><span class="cifra">…</span><span class="cap-t">${esc(st.sk)}</span></h2>`) +
        '<div class="cuerpo"><div class="skel" role="status" aria-label="Cargando"></div></div>';
      host.appendChild(sec);
    });
    $('#toc').innerHTML = STORIES.map((st, i) => { const [c, on] = PAL[st.col]; return `<li><a href="#${esc(st.id)}" style="--c:${c};--on:${on}"><b>${i + 1}</b><span>${esc(st.toc)}</span></a></li>`; }).join('');
    syncURL();
    heroText();
    shareLinks();
    const go = (sec) => {
      const i = Number(sec.dataset.i), st = STORIES[i];
      prepStory(st, S.Y).then(() => { if (myGen === gen) fillStory(sec, st, i); });
    };
    const secs = [...host.querySelectorAll('.cap')];
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((ents) => ents.forEach((e) => {
        if (e.isIntersecting) { io.unobserve(e.target); go(e.target); }
      }), { rootMargin: '800px 0px' });
      secs.forEach((sec) => io.observe(sec));
    } else secs.forEach(go);
  }

  function fillStory(sec, st, i) {
    const Y = S.Y;
    let out;
    try { out = st.build(Y); } catch (e) { console.error(e); out = { cifra: '?', titulo: esc(st.sk), html: '<p class="empty">No se pudo calcular esta historia con los datos disponibles.</p>' }; }
    const partialNote = isPartial() && !['real', 'vs-estado', 'en-2027'].includes(st.id)
      ? `<p class="parcial">${esc(Y)} es un año en curso (${esc((S.d.parcial || {})[Y] || 'parcial')}): lo gastado aún es parcial y no se compara con años cerrados.</p>` : '';
    sec.innerHTML = portada(i, `<h2 id="h-${esc(st.id)}"><span class="cifra">${out.cifra}</span><span class="cap-t">${out.titulo}</span></h2>`) +
      `<div class="cuerpo">${partialNote}${out.html}${st.sec ? `<p class="ver"><a href="index.html#${esc(st.sec)}">Verlo a fondo en el observatorio</a></p>` : ''}</div>`;
    sec.classList.remove('is-loading');
    sec.removeAttribute('aria-busy');
    sec.style.minHeight = '';
    if (out.mount) {
      try {
        const m = out.mount(sec) || [];
        m.forEach(([box, fn]) => { if (box) { fn(box); S.mounts.push({ box, fn }); } });
      } catch (e) { console.error(e); }
    }
    sec.querySelectorAll('.anim').forEach((f) => { if (reduced || !animIO) f.classList.add('in'); else animIO.observe(f); });
  }

  // ---------- hero, buscador y compartir ----------
  function heroText() {
    const Y = S.Y, h = hlUni();
    const U = unisY(Y);
    const tot = sum(U.map((u) => val(u.anios[Y].total, 'dev')));
    const ht = h && h.anios && h.anios[Y] && h.anios[Y].total;
    const par = isPartial() ? ' (hasta ahora)' : '';
    if (h && ht && isNum(ht.dev)) {
      { const [c, u] = heroParts(ht.dev); $('#hero-cifra').textContent = c; $('#hero-unidad').textContent = u; }
      $('#hero-dek').innerHTML = `gastó la <mark>${esc(label(h))}</mark> en ${esc(Y)}${par}. Baja y mira a dónde se fue cada sol.`;
    } else {
      { const [c, u] = heroParts(tot); $('#hero-cifra').textContent = c; $('#hero-unidad').textContent = u; }
      $('#hero-dek').innerHTML = `gastaron en ${esc(Y)}${par} las ${esc(U.length)} universidades públicas del Perú.${h ? ` La <mark>${esc(label(h))}</mark> no tiene datos ese año.` : ' Elige la tuya y mira a dónde se fue cada sol.'}`;
    }
    tresNumeros(Y, h, U);
    flash27(h);
    $('#uni-hint').innerHTML = h ? `Mostrando <strong>${esc(fullName(h))}</strong>. <a href="${esc(fichaHref(h))}">Ver su ficha completa</a>` : 'Las doce historias se personalizan con la tuya.';
    $('#year-note').textContent = isPartial() ? `${Y} está en curso: cifras parciales.` : `Último año cerrado: ${S.closed[S.closed.length - 1]}.`;
  }

  // Franja 2027 en el hero (resumen.expectativa_2027, calculado en vivo).
  function flash27(h) {
    const el = $('#flash27'), E = S.d && S.d.expectativa_2027;
    if (!el || !E || !E.total_universidades) return;
    const T = E.total_universidades;
    const arrow = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '=');
    const he = h && h.expectativa_2027;
    if (he && isNum(he.var_pct) && isNum(he.pia_2027) && isNum(he.pia_2026)) {
      const d = he.pia_2027 - he.pia_2026;
      el.innerHTML = `<span>2027 para la <mark>${esc(label(h))}</mark>:</span><b class="${d < 0 ? 'baja' : ''}">${arrow(d)} ${esc(pctSigned(he.var_pct / 100, Math.abs(he.var_pct) >= 100 ? 0 : 1))} (${d >= 0 ? '+' : '−'}${esc(solesF(Math.abs(d)))})</b><span>en el proyecto de presupuesto</span><span class="ir">Ver capítulo 11</span>`;
    } else {
      const its = S.d.universidades.map((u) => u.expectativa_2027).filter((e) => e && isNum(e.var_pct));
      const A = S.a27 && S.a27.total;
      const up = A && isNum(A.n_suben) ? A.n_suben : its.filter((e) => e.var_pct > 0).length, down = A && isNum(A.n_bajan) ? A.n_bajan : its.filter((e) => e.var_pct < 0).length;
      const d = isNum(T.pia_2027) && isNum(T.pia_2026) ? T.pia_2027 - T.pia_2026 : null;
      el.innerHTML = `<span>2027:</span><b class="${d < 0 ? 'baja' : ''}">${arrow(d)} ${esc(pctSigned(T.var_pct / 100, 1))} (${d >= 0 ? '+' : '−'}${esc(solesF(Math.abs(d)))})</b><span>para las universidades públicas. ${esc(up)} suben, ${esc(down)} bajan.${h ? ` La ${esc(label(h))} no tiene monto propio.` : ''}</span><span class="ir">Ver capítulo 11</span>`;
    }
    el.setAttribute('aria-label', el.textContent.replace(/[▲▼]/g, (m) => (m === '▲' ? 'sube' : 'baja')));
    el.hidden = false;
  }

  // "Tu universidad en 3 números" (o las universidades juntas): ejecución, gasto por estudiante y % pagado con lo que cobra.
  function tresNumeros(Y, h, U) {
    const box = $('#tres'); if (!box) return;
    const ht = h && h.anios && h.anios[Y];
    let titulo, rows;
    if (ht && ht.total) {
      const k = ht.kpi || {};
      const ej = isNum(k.ejec) ? k.ejec : div(val(ht.total, 'dev'), val(ht.total, 'pim'));
      const pe = isNum(k.gasto_por_estudiante) ? k.gasto_por_estudiante : (isNum(ht.estudiantes) && ht.estudiantes > 0 ? div(val(ht.total, 'dev'), ht.estudiantes) : null);
      titulo = `La <mark>${esc(label(h))}</mark> en 3 números`;
      rows = [[pct(ej), 'de lo que tenía se gastó (devengado / PIM)'], [soles(pe), 'gastó por estudiante en el año'], [pct(k.pct_rdr), 'de su gasto lo pagó con lo que cobra (RDR)']];
    } else {
      const dev = sum(U.map((u) => val(u.anios[Y].total, 'dev'))), pim = sum(U.map((u) => val(u.anios[Y].total, 'pim')));
      const pes = U.map((u) => { const a = u.anios[Y]; return isNum(a.estudiantes) && a.estudiantes > 0 ? div(val(a.total, 'dev'), a.estudiantes) : null; });
      const rd = U.filter((u) => u.anios[Y].kpi && isNum(u.anios[Y].kpi.pct_rdr));
      const rdr = div(sum(rd.map((u) => u.anios[Y].kpi.pct_rdr * (val(u.anios[Y].total, 'dev') || 0))), sum(rd.map((u) => val(u.anios[Y].total, 'dev'))));
      titulo = 'Las universidades públicas en 3 números';
      rows = [[pct(div(dev, pim)), 'de lo que tenían se gastó (devengado / PIM)'], [soles(median(pes)), 'gasta por estudiante la universidad típica'], [pct(rdr), 'del gasto se pagó con lo que cobran (RDR)']];
    }
    box.innerHTML = `<h2>${titulo}</h2><dl>${rows.map(([n, t]) => `<div><dt>${esc(n)}</dt><dd>${esc(t)}</dd></div>`).join('')}</dl><p class="s">Año ${esc(Y)}${isPartial() ? ' (en curso, parcial)' : ''}. Fuente: MEF.</p>`;
    box.hidden = false;
  }

  function shareURL() {
    const base = 'https://unimauro.github.io/presupuesto-universidades/historias.html';
    const p = new URLSearchParams();
    if (S.hl) p.set('u', S.hl);
    if (S.Y !== S.closed[S.closed.length - 1]) p.set('y', S.Y);
    const q = p.toString();
    return base + (q ? '?' + q : '');
  }
  function shareText() {
    const h = hlUni(), Y = S.Y;
    const ht = h && h.anios && h.anios[Y] && h.anios[Y].total;
    if (h && ht && isNum(ht.dev)) return `La ${label(h)} gastó ${soles(ht.dev)} en ${Y}. ¿A dónde se fue la plata? Míralo aquí:`;
    const tot = sum(unisY(Y).map((u) => val(u.anios[Y].total, 'dev')));
    return `Las universidades públicas del Perú gastaron ${soles(tot)} en ${Y}. ¿A dónde se va la plata de la tuya?`;
  }
  function shareLinks() {
    const url = shareURL(), txt = shareText();
    $('#sh-wa').href = 'https://wa.me/?text=' + encodeURIComponent(txt + ' ' + url);
    $('#sh-x').href = 'https://x.com/intent/post?text=' + encodeURIComponent(txt) + '&url=' + encodeURIComponent(url);
    const h = hlUni();
    $('#share-dek').innerHTML = h ? `Que tu promo de la <mark>${esc(label(h))}</mark> sepa a dónde se va la plata. El link abre con tu universidad ya elegida.` : 'Que tu promo sepa a dónde se va la plata de su universidad.';
    $('#explore-uni').innerHTML = h ? `<a href="${esc(fichaHref(h))}">Explora la ficha completa de la ${esc(label(h))}</a>` : '<a href="u/">Explora tu universidad en el observatorio</a>';
    $('#sh-ok').textContent = '';
  }
  function setupShare() {
    const ok = $('#sh-ok');
    $('#sh-copy').addEventListener('click', async () => {
      const url = shareURL();
      try { await navigator.clipboard.writeText(url); ok.textContent = 'Link copiado. Pégalo en tu grupo.'; } catch (e) { ok.textContent = url; }
    });
    const nb = $('#sh-native');
    if (navigator.share) {
      nb.hidden = false;
      nb.addEventListener('click', () => { navigator.share({ title: document.title, text: shareText(), url: shareURL() }).catch(() => {}); });
    }
  }

  function selectUni(p) {
    S.hl = p ? String(p) : '';
    const u = hlUni();
    $('#uni-q').value = u ? label(u) : '';
    $('#uni-clear').hidden = !u;
    render();
  }
  function setupPicker() {
    const inp = $('#uni-q'), list = $('#uni-list'), clr = $('#uni-clear');
    const unis = [...S.d.universidades].sort((a, b) => label(a).localeCompare(label(b), 'es'));
    const idx = unis.map((u) => ({ u, s: norm([u.corto, u.nombre, u.ciudad, u.departamento].join(' ')) }));
    let cur = -1, res = [];
    const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); cur = -1; };
    // Resalta (sin importar tildes ni mayúsculas) cada término buscado dentro del texto, ya escapado.
    let terms = [];
    const hl = (text) => {
      const t = String(text || ''), n = norm(t);
      if (!terms.length || n.length !== t.length) return esc(t);
      const on = new Array(t.length).fill(false);
      terms.forEach((q) => { let i = n.indexOf(q); while (q && i >= 0) { for (let k = i; k < i + q.length; k++) on[k] = true; i = n.indexOf(q, i + q.length); } });
      let out = '', open = false;
      for (let k = 0; k < t.length; k++) { if (on[k] !== open) { out += on[k] ? '<mark>' : '</mark>'; open = on[k]; } out += esc(t[k]); }
      return out + (open ? '</mark>' : '');
    };
    const status = $('#uni-status');
    const paint = () => {
      list.innerHTML = res.length ? res.map((u, k) => `<li id="opt-${esc(u.pliego)}" role="option" data-p="${esc(u.pliego)}" aria-selected="${k === cur}"><span class="op-t"><b>${hl(label(u))}</b><span class="op-dep">${hl(titleCase(String(u.departamento || u.ciudad || '')))}</span></span><span class="op-n">${hl(fullName(u))}</span></li>`).join('')
        : '<li class="vacio" role="option" aria-disabled="true">No encontramos esa universidad. Prueba con la sigla, el nombre o la ciudad.</li>';
      list.hidden = false; inp.setAttribute('aria-expanded', 'true');
      if (cur >= 0 && res[cur]) { inp.setAttribute('aria-activedescendant', 'opt-' + res[cur].pliego); const li = document.getElementById('opt-' + res[cur].pliego); if (li) li.scrollIntoView({ block: 'nearest' }); }
      if (status) status.textContent = res.length ? `${res.length} universidad${res.length > 1 ? 'es' : ''}. Usa las flechas y Enter para elegir.` : 'Sin resultados.';
    };
    const search = () => {
      const q = norm(inp.value.trim());
      const cur0 = hlUni();
      if (!q || (cur0 && q === norm(label(cur0)))) { terms = []; res = unis.slice(); }
      else {
        terms = q.split(/\s+/).filter(Boolean);
        // Orden: sigla que empieza igual, luego nombre que contiene la búsqueda, luego las más grandes (gasto del año).
        const score = (r) => (norm(r.u.corto).startsWith(q) ? 2e12 : 0) + (norm(r.u.nombre).includes(q) ? 1e12 : 0) + (val(r.u.anios && r.u.anios[S.Y] && r.u.anios[S.Y].total, 'dev') || 0);
        res = idx.filter((r) => terms.every((t) => r.s.includes(t))).sort((a, b) => score(b) - score(a)).slice(0, 12).map((r) => r.u);
      }
      cur = res.length ? 0 : -1; paint();
    };
    inp.addEventListener('input', search);
    inp.addEventListener('focus', () => { inp.select(); search(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) search(); else { cur = Math.min(res.length - 1, cur + 1); paint(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); paint(); }
      else if (e.key === 'Enter') { if (!list.hidden && res[cur]) { e.preventDefault(); selectUni(res[cur].pliego); close(); inp.blur(); } }
      else if (e.key === 'Escape') { if (list.hidden) { const u = hlUni(); inp.value = u ? label(u) : ''; } close(); }
      else if (e.key === 'Tab') close();
    });
    list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li[data-p]'); if (!li) return; e.preventDefault(); selectUni(li.dataset.p); close(); inp.blur(); });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#picker')) close(); });
    inp.addEventListener('blur', () => setTimeout(() => { close(); const u = hlUni(); inp.value = u ? label(u) : ''; }, 150));
    clr.addEventListener('click', () => { selectUni(''); inp.focus(); });
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
    ys.innerHTML = [...S.closed].reverse().map((y) => `<option value="${esc(y)}">${esc(y)}</option>`)
      .concat([...S.partial].reverse().map((y) => `<option value="${esc(y)}">${esc(y)} (en curso)</option>`)).join('');
    const wantY = p.get('y');
    S.Y = (wantY && (S.closed.includes(wantY) || S.partial.includes(wantY))) ? wantY : (S.closed[S.closed.length - 1] || S.partial[0]);
    ys.value = S.Y;
    ys.addEventListener('change', () => { S.Y = ys.value; render(); });
    const wantU = p.get('u');
    if (wantU && S.d.universidades.some((u) => String(u.pliego) === wantU)) { S.hl = wantU; $('#uni-q').value = label(hlUni()); $('#uni-clear').hidden = false; }
  }

  function setupMeta() {
    const d = S.d;
    if (S.isSample) {
      const b = $('#sample-banner');
      b.hidden = false;
      b.innerHTML = '<strong>Datos de ejemplo.</strong> Esta página muestra un archivo de muestra con cifras ficticias. No uses estas cifras para conclusiones.';
    }
    const fs = Array.isArray(d.fuentes) ? d.fuentes : [];
    $('#sources').innerHTML = fs.length ? 'Fuentes de los datos:<ul class="fuentes">' + fs.filter(Boolean).map((f) => `<li>${linkTo(f.url, f.nombre || f.url)}</li>`).join('') + '</ul>' : esc(SRC_MEF);
    if (d.generado) $('#generated').textContent = `Datos generados: ${d.generado}`;
  }

  // ---------- tooltip táctil ----------
  function setupTip() {
    const tip = $('#tip'); let on = null;
    const show = (el, x, y) => {
      on = el; tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
      const r = tip.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2));
      let top = y - r.height - 14; if (top < 8) top = y + 18;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    };
    const hide = () => { on = null; tip.hidden = true; };
    const at = (e) => e.target && e.target.closest && e.target.closest('[data-tip]');
    document.addEventListener('pointerover', (e) => { const t = at(e); if (t && e.pointerType === 'mouse') show(t, e.clientX, e.clientY); });
    document.addEventListener('pointerout', (e) => { const t = at(e); if (t && t === on && e.pointerType === 'mouse') hide(); });
    document.addEventListener('pointerdown', (e) => { const t = at(e); if (t) show(t, e.clientX, e.clientY); else hide(); });
    window.addEventListener('scroll', () => { if (on) hide(); }, { passive: true });
  }

  function progress() {
    const bar = $('#progress');
    let raf = 0;
    const on = () => {
      raf = 0;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0) + '%';
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(on); }, { passive: true });
    on();
  }

  function redrawAll() {
    S.mounts = S.mounts.filter((m) => m.box.isConnected);
    S.mounts.forEach((m) => { try { m.fn(m.box); } catch (e) { console.error(e); } });
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
      if (S.d) redrawAll();
    });
    return sync;
  }

  async function init() {
    const syncTheme = setupTheme();
    progress();
    setupTip();
    if ('IntersectionObserver' in window && !reduced) {
      animIO = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); animIO.unobserve(e.target); } }), { threshold: 0.2 });
    }
    try {
      const { d, isSample, full } = await load();
      S.d = d; S.isSample = isSample; L.full = full;
    } catch (e) {
      $('#hero-cifra').textContent = '—';
      $('#hero-dek').textContent = 'No se pudieron cargar los datos. Revisa tu conexión y recarga la página.';
      return;
    }
    loadA27().then(() => { if (S.d) flash27(hlUni()); });
    getJSON('u/slugs.json').then((j) => { S.slugs = (j && j.slugs) || null; if (S.hl) { heroText(); shareLinks(); } }).catch(() => {});
    setupYears(S.d);
    setupControls();
    setupPicker();
    setupShare();
    setupMeta();
    render();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawAll);
    let lastW = window.innerWidth, t = 0;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth; clearTimeout(t);
      t = setTimeout(() => { redrawAll(); document.querySelectorAll('.anim').forEach((f) => f.classList.add('in')); }, 180);
    });
    if (location.hash) { const tg = document.getElementById(location.hash.slice(1)); if (tg) tg.scrollIntoView(); }
    window.addEventListener('storage', (e) => {
      if (e.key !== 'rp-theme' || (e.newValue !== 'dark' && e.newValue !== 'light')) return;
      document.documentElement.setAttribute('data-theme', e.newValue); syncTheme(); redrawAll();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
