/* ═══════════════════════════════
   AMAZON LEO — DWDM dashboard (portal page #/amazon-leo/dashboard)
   Same structure as the Grafana board the team uses: per circuit an SLA
   panel, Rx signal, incident table and a big status panel. Data comes from
   GET /api/leo/status (Zabbix events + Rx metrics). English: shown to the client.
   ═══════════════════════════════ */

var LDB_SITES = {
  SLZ501: { name: 'SLZ501', place: 'Ocara, CE' },
  CPV501: { name: 'CPV501', place: 'Sanharó, PE' }
};
var LDB_CIRCUITS = [
  /* order shown on the dashboard: SP4 first, then RJ2, in every site */
  { id: 'SPOOCR964174',    site: 'SLZ501', pop: 'Equinix SP4' },
  { id: 'RJOOCR964161',    site: 'SLZ501', pop: 'Equinix RJ2' },
  { id: '21-90090-252671', site: 'CPV501', pop: 'Equinix SP4' },
  { id: '21-90090-252668', site: 'CPV501', pop: 'Equinix RJ2' }
];
var LDB_RANGES = { '1': 'Last 24 hours', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' };

var ldb = { data: null, site: 'SLZ501', range: 30, tz: 'UTC', timer: 0, tick: 0 };

function openLeoDash() {
  ldb.range = 30; ldb.tz = 'UTC';   /* defaults every time the dashboard is opened */
  showPage('pg-leo-dash');
  ldbIf.hours = 24; ldbIf.sig = '';
  ldbRender();
  ldbLoad();
  ldbIfLoad();
  clearInterval(ldb.timer); clearInterval(ldb.tick);
  ldb.timer = setInterval(function() {
    var pg = document.getElementById('pg-leo-dash');
    if (!pg || !pg.classList.contains('active')) { clearInterval(ldb.timer); clearInterval(ldb.tick); return; }
    ldbLoad();
    ldbIfLoad();
  }, 10000);
  ldb.tick = setInterval(ldbTick, 1000);
}

function ldbLoad() {
  _apiGet('/leo/status').then(function(d) {
    var changed = JSON.stringify(d.events) + JSON.stringify(d.metrics) + d.monitoringSince !== (ldb.data ? JSON.stringify(ldb.data.events) + JSON.stringify(ldb.data.metrics) + ldb.data.monitoringSince : '');
    ldb.data = d;
    if (changed) ldbRender(); else ldbStamp();
    if (changed && ldbRx.id) ldbRxLoad();
  }).catch(function() {
    var el = document.getElementById('ldb-updated');
    if (el) el.textContent = 'Connection lost — retrying';
  });
}

/* ── time ── */
function ldbPad(n) { return String(n).padStart(2, '0'); }
function ldbFmt(iso) {
  var d = new Date(iso), utc = ldb.tz === 'UTC';
  if (!utc) d = new Date(d.getTime() - 3 * 3600000);   /* BRT = UTC-3 (no DST) */
  return ldbPad(d.getUTCDate()) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' '
    + ldbPad(d.getUTCHours()) + ':' + ldbPad(d.getUTCMinutes()) + ':' + ldbPad(d.getUTCSeconds());
}
function ldbDur(a, b) {
  var s = Math.max(0, ((b ? new Date(b) : new Date()) - new Date(a)) / 1000);
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + ldbPad(Math.floor(s % 60)) + 's';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + ldbPad(Math.floor(s / 60) % 60) + 'm';
  return Math.floor(s / 86400) + 'd ' + Math.floor(s / 3600) % 24 + 'h';
}

/* ── per-circuit data ── */
function ldbEvents(c) {   /* circuit events + site-level events of its site */
  var ev = (ldb.data && ldb.data.events) || [];
  return ev.filter(function(e) { return e.circuit === c.id || (!e.circuit && e.site === c.site); });
}
function ldbState(c) {
  if (!ldb.data || !ldb.data.monitoringSince) return { st: 'nodata' };
  var act = ldbEvents(c).filter(function(e) { return e.status === 'ongoing'; })
    .sort(function(a, b) { return (a.type === 'outage' ? 0 : 1) - (b.type === 'outage' ? 0 : 1); })[0];
  if (act) return { st: act.type === 'outage' ? 'down' : 'warn', since: act.start, ev: act };
  var last = ldbEvents(c).filter(function(e) { return e.end; }).sort(function(a, b) { return String(b.end).localeCompare(String(a.end)); })[0];
  return { st: 'up', since: last ? last.end : ldb.data.monitoringSince };
}
/* outage intervals inside the window, merged */
function ldbOutages(c, from, to) {
  var iv = ldbEvents(c).filter(function(e) { return e.type === 'outage'; }).map(function(e) {
    return [Math.max(from, new Date(e.start).getTime()), Math.min(to, e.end ? new Date(e.end).getTime() : to)];
  }).filter(function(x) { return x[1] > x[0]; }).sort(function(a, b) { return a[0] - b[0]; });
  var out = [];
  iv.forEach(function(x) { var l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x.slice()); });
  return out;
}
function ldbSla(c) {
  var to = Date.now(), from = to - ldb.range * 86400000;
  var mon = ldb.data && ldb.data.monitoringSince ? new Date(ldb.data.monitoringSince).getTime() : to;
  var start = Math.max(from, mon);
  if (start >= to) return null;
  var down = ldbOutages(c, start, to).reduce(function(s, x) { return s + x[1] - x[0]; }, 0);
  return { pct: 1 - down / (to - start), downMin: Math.round(down / 60000), partial: start > from, start: start };
}

/* ── render ── */
function ldbRender() {
  document.querySelectorAll('#ldb-site button').forEach(function(b) { b.classList.toggle('sel', b.dataset.v === ldb.site); });
  document.querySelectorAll('#ldb-range button').forEach(function(b) { b.classList.toggle('sel', +b.dataset.v === ldb.range); });
  document.querySelectorAll('#ldb-tz button').forEach(function(b) { b.classList.toggle('sel', b.dataset.v === ldb.tz); });
  var sites = Object.keys(LDB_SITES).filter(function(s) { return ldb.site === 'ALL' || s === ldb.site; });
  document.getElementById('ldb-body').innerHTML = sites.map(function(sid) {
    var cs = LDB_CIRCUITS.filter(function(c) { return c.site === sid; }), states = cs.map(ldbState);
    var down = states.filter(function(s) { return s.st === 'down'; }).length;
    var summary = !ldb.data || !ldb.data.monitoringSince ? 'Awaiting monitoring data'
      : down === cs.length ? 'Site down — all circuits affected'
      : down ? 'Operating on redundancy — 1 of ' + cs.length + ' circuits down'
      : states.some(function(s) { return s.st === 'warn'; }) ? 'Performance degradation on 1 circuit'
      : 'All circuits operational';
    var sCls = !ldb.data || !ldb.data.monitoringSince ? 'nodata' : down === cs.length ? 'down' : down || states.some(function(s) { return s.st === 'warn'; }) ? 'warn' : 'up';
    return '<section class="ldb-site">'
      + '<div class="ldb-site-head"><h3>' + sid + ' <span>— ' + LDB_SITES[sid].place + '</span></h3>'
      +   '<span class="ldb-site-sum ' + sCls + '"><i></i>' + summary + '</span></div>'
      + cs.map(function(c, i) { return ldbCircuit(c, states[i]); }).join('')
      + '<div class="ldb-path-slot" data-site="' + sid + '"></div>'
      + '</section>';
  }).join('');
  ldbPathRender();      /* cross-connect monitoring of the site, if any */
  ldbStamp();
}

var LDB_LABEL = { up: 'Circuit operational', warn: 'Degraded performance', down: 'Circuit down', nodata: 'Awaiting data' };
var LDB_ICON = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  nodata: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
};

function ldbCircuit(c, s) {
  var to = Date.now(), from = to - ldb.range * 86400000, sla = ldbSla(c);
  var evs = ldbEvents(c).filter(function(e) { return e.status === 'ongoing' || new Date(e.end || e.start).getTime() >= from; })
    .sort(function(a, b) { return (a.status === 'ongoing' ? 0 : 1) - (b.status === 'ongoing' ? 0 : 1) || String(b.start).localeCompare(String(a.start)); });
  var m = ((ldb.data && ldb.data.metrics) || []).filter(function(x) { return x.circuit === c.id; })[0];

  /* availability timeline: outage segments across the window */
  var mon = ldb.data && ldb.data.monitoringSince ? new Date(ldb.data.monitoringSince).getTime() : to;
  var pre = Math.max(0, Math.min(1, (mon - from) / (to - from)));
  var segs = ldbOutages(c, from, to).map(function(x) {
    return '<i style="left:' + ((x[0] - from) / (to - from) * 100).toFixed(3) + '%;width:' + Math.max(.25, (x[1] - x[0]) / (to - from) * 100).toFixed(3) + '%"></i>';
  }).join('');

  var slaHtml = sla
    ? '<div class="ldb-sla-v">' + (Math.floor(sla.pct * 10000) / 100).toFixed(2) + '<small>%</small></div>'
      + '<div class="ldb-sla-l">' + LDB_RANGES[ldb.range] + (sla.partial ? ' · since ' + ldbFmt(new Date(sla.start).toISOString()).slice(0, 6) : '') + '</div>'
      + '<div class="ldb-sla-d">Downtime <b>' + (sla.downMin < 60 ? sla.downMin + ' min' : Math.floor(sla.downMin / 60) + 'h ' + sla.downMin % 60 + 'm') + '</b></div>'
    : '<div class="ldb-sla-v none">—</div><div class="ldb-sla-l">' + LDB_RANGES[ldb.range] + '</div>';

  var rxHtml = m ? '<div class="ldb-rx' + (m.loss ? ' loss' : '') + '" title="Optical input power (Pin) on the transponder client port facing Amazon Leo"><span>Rx power</span>'
      + (m.loss ? '<b class="ldb-loss">' + LDB_ICON.down + 'Loss</b>' : '<b>' + m.rx.toFixed(2) + '<small> dBm</small></b>')
      + '<button class="ldb-rx-btn" onclick="ldbRxOpen(\'' + c.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>History</button></div>' : '';

  var rows = evs.length ? evs.slice(0, 200).map(function(e) {
    var on = e.status === 'ongoing';
    return '<tr class="' + (on ? 'on' : '') + '">'
      + '<td><span class="ldb-tag ' + (on ? (e.type === 'outage' ? 'down' : 'warn') : 'ok') + '">' + (on ? (e.type === 'outage' ? 'ONGOING' : 'DEGRADED') : 'RESOLVED') + '</span></td>'
      + '<td class="ldb-prob">' + esc(e.problem || (e.type === 'outage' ? 'Service interruption' : 'Performance degradation')) + '</td>'
      + '<td class="ldb-num">' + ldbFmt(e.start) + '</td>'
      + '<td class="ldb-num">' + (on ? '<b data-ldur="' + e.start + '">' + ldbDur(e.start) + '</b>' : ldbDur(e.start, e.end)) + '</td>'
      + '</tr>';
  }).join('') : '<tr><td colspan="4" class="ldb-none">No incidents in this period</td></tr>';

  return '<article class="ldb-c ' + s.st + '">'
    + '<header class="ldb-c-head">'
    +   '<div><div class="ldb-c-kicker">Circuit</div><div class="ldb-c-title">' + c.site + ' — ' + LDB_SITES[c.site].place + ' <span>↔</span> ' + c.pop + '<code>' + c.id + '</code></div></div>'
    + '</header>'
    + '<div class="ldb-tl" title="Outages in the selected period"><span class="pre" style="width:' + (pre * 100).toFixed(2) + '%"></span>' + segs + '</div>'
    + '<div class="ldb-tl-axis"><span>' + LDB_RANGES[ldb.range].replace('Last ', '') + ' ago</span><span>Now</span></div>'
    + '<div class="ldb-c-body">'
    +   '<div class="ldb-left"><div class="ldb-sla"><div class="ldb-sla-k">SLA</div>' + slaHtml + '</div>' + rxHtml + '</div>'
    +   '<div class="ldb-table"><table><thead><tr><th>Status</th><th>Problem</th><th>Start (' + ldb.tz + ')</th><th>Duration</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    +   '<div class="ldb-status ' + s.st + '"><span class="ldb-st-ic">' + LDB_ICON[s.st] + '</span><b>' + LDB_LABEL[s.st] + '</b>'
    +     (s.since ? '<em>' + (s.st === 'up' ? 'Up for ' : 'For ') + '<span data-ldur="' + s.since + '">' + ldbDur(s.since) + '</span></em>' : '') + '</div>'
    + '</div>'
    + '</article>';
}


function ldbStamp() {
  var el = document.getElementById('ldb-updated');
  if (el && ldb.data) el.textContent = 'Updated ' + ldbFmt(ldb.data.generatedAt).slice(7) + ' ' + ldb.tz + ' · auto-refresh 10 s';
}
function ldbTick() {
  document.querySelectorAll('#pg-leo-dash [data-ldur]').forEach(function(e) { e.textContent = ldbDur(e.dataset.ldur); });
}

function ldbSet(k, v) { ldb[k] = k === 'range' ? +v : v; ldbRender(); }

/* ═══════════════════════════════
   Rx power history window (GET /api/leo/rx): line chart in dBm,
   Loss periods as red bands, crosshair + tooltip, table view.
   ═══════════════════════════════ */
var ldbRx = { id: null, days: 1, data: null, view: 'chart' };

function ldbRxOpen(id) {
  ldbRx.id = id; ldbRx.days = 1; ldbRx.view = 'chart'; ldbRx.data = null;
  var c = LDB_CIRCUITS.filter(function(x) { return x.id === id; })[0];
  var ov = document.createElement('div');
  ov.className = 'ldb-rxm-ov'; ov.id = 'ldb-rxm';
  ov.innerHTML = '<div class="ldb-rxm" role="dialog" aria-modal="true" aria-label="Rx power history">'
    + '<header><div><div class="ldb-c-kicker">Rx power history</div><div class="ldb-c-title">' + c.site + ' — ' + LDB_SITES[c.site].place + ' <span>↔</span> ' + c.pop + '<code>' + c.id + '</code></div></div>'
    + '<button class="ldb-rxm-x" onclick="ldbRxClose()" aria-label="Close">×</button></header>'
    + '<div class="ldb-rxm-bar"><div class="ldb-seg" id="ldb-rxm-rng"></div><div class="ldb-seg" id="ldb-rxm-view"></div></div>'
    + '<div class="ldb-rxm-stats" id="ldb-rxm-stats"></div>'
    + '<div class="ldb-rxm-body" id="ldb-rxm-body"><div class="ldb-rxm-empty">Loading…</div></div>'
    + '<div class="ldb-rxm-foot">Optical input power (Pin) on the transponder client port facing Amazon Leo · times in ' + ldb.tz + '</div>'
    + '</div>';
  ov.addEventListener('click', function(e) { if (e.target === ov) ldbRxClose(); });
  document.body.appendChild(ov);
  document.addEventListener('keydown', ldbRxKey);
  window.addEventListener('resize', ldbRxDraw);
  ldbRxBar();
  ldbRxLoad();
}
function ldbRxKey(e) { if (e.key === 'Escape') ldbRxClose(); }
function ldbRxClose() {
  var ov = document.getElementById('ldb-rxm'); if (ov) ov.remove();
  ldbRx.id = null;
  document.removeEventListener('keydown', ldbRxKey);
  window.removeEventListener('resize', ldbRxDraw);
}
function ldbRxBar() {
  var r = document.getElementById('ldb-rxm-rng'), v = document.getElementById('ldb-rxm-view');
  if (!r) return;
  r.innerHTML = [[1, '24h'], [7, '7d'], [30, '30d']].map(function(o) {
    return '<button class="' + (ldbRx.days === o[0] ? 'sel' : '') + '" onclick="ldbRx.days=' + o[0] + ';ldbRxBar();ldbRxLoad()">' + o[1] + '</button>';
  }).join('');
  v.innerHTML = [['chart', 'Chart'], ['table', 'Table']].map(function(o) {
    return '<button class="' + (ldbRx.view === o[0] ? 'sel' : '') + '" onclick="ldbRx.view=\'' + o[0] + '\';ldbRxBar();ldbRxDraw()">' + o[1] + '</button>';
  }).join('');
}
function ldbRxLoad() {
  var id = ldbRx.id, days = ldbRx.days;
  _apiGet('/leo/rx?circuit=' + encodeURIComponent(id) + '&days=' + days).then(function(d) {
    if (ldbRx.id !== id || ldbRx.days !== days) return;
    ldbRx.data = d; ldbRxDraw();
  }).catch(function() {
    var b = document.getElementById('ldb-rxm-body'); if (b) b.innerHTML = '<div class="ldb-rxm-empty">Could not load the history — try again</div>';
  });
}

/* loss intervals: from a null sample until the next valid one (or now) */
function ldbRxLossSpans(pts, to) {
  var out = [], s = null;
  pts.forEach(function(p) {
    var t = new Date(p[0]).getTime();
    if (p[1] === null && s === null) s = t;
    else if (p[1] !== null && s !== null) { out.push([s, t]); s = null; }
  });
  if (s !== null) out.push([s, to]);
  return out;
}

function ldbRxDraw() {
  var body = document.getElementById('ldb-rxm-body'), st = document.getElementById('ldb-rxm-stats');
  if (!body || !ldbRx.data) return;
  var d = ldbRx.data, pts = d.points || [], to = Date.now(), from = to - d.days * 86400000;
  var vals = pts.filter(function(p) { return p[1] !== null; }).map(function(p) { return p[1]; });
  var spans = ldbRxLossSpans(pts, to), lossMin = Math.round(spans.reduce(function(a, x) { return a + (x[1] - x[0]); }, 0) / 60000);
  var dbm = function(v) { return v.toFixed(2) + '<small> dBm</small>'; };

  st.innerHTML = [
    ['Current', d.loss ? '<span class="ldb-loss">' + LDB_ICON.down + 'Loss</span>' : (d.rx === null ? '—' : dbm(d.rx))],
    ['Min', vals.length ? dbm(Math.min.apply(null, vals)) : '—'],
    ['Max', vals.length ? dbm(Math.max.apply(null, vals)) : '—'],
    ['Average', vals.length ? dbm(vals.reduce(function(a, b) { return a + b; }, 0) / vals.length) : '—'],
    ['Loss time', lossMin ? (lossMin < 60 ? lossMin + ' min' : Math.floor(lossMin / 60) + 'h ' + lossMin % 60 + 'm') : 'None']
  ].map(function(x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('');

  if (!pts.length) { body.innerHTML = '<div class="ldb-rxm-empty">No samples in this period yet — the portal reads the NMS every 2 minutes</div>'; return; }

  if (ldbRx.view === 'table') {
    body.innerHTML = '<div class="ldb-table ldb-rxm-table"><table><thead><tr><th>Time (' + ldb.tz + ')</th><th>Rx power</th></tr></thead><tbody>'
      + pts.slice().reverse().map(function(p) {
          return '<tr><td class="ldb-num">' + ldbFmt(p[0]) + '</td><td class="ldb-num">' + (p[1] === null ? '<span class="ldb-tag down">LOSS</span>' : p[1].toFixed(2) + ' dBm') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    return;
  }

  /* ── chart ── */
  var W = Math.max(300, body.clientWidth), H = 300, L = 46, Rm = 12, T = 14, B = 28, pw = W - L - Rm, ph = H - T - B;
  var lo = vals.length ? Math.min.apply(null, vals) : -10, hi = vals.length ? Math.max.apply(null, vals) : 0;
  var pad = Math.max(.5, (hi - lo) * .15); lo = Math.floor((lo - pad) * 2) / 2; hi = Math.ceil((hi + pad) * 2) / 2;
  var X = function(t) { return L + (t - from) / (to - from) * pw; }, Y = function(v) { return T + (hi - v) / (hi - lo) * ph; };

  var stepY = [.5, 1, 2, 5, 10].filter(function(s) { return (hi - lo) / s <= 6; })[0] || 10, grid = '';
  for (var v = Math.ceil(lo / stepY) * stepY; v <= hi + 1e-9; v += stepY)
    grid += '<line class="g" x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="ya" x="' + (L - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '">' + (Math.round(v * 10) / 10) + '</text>';
  var nT = Math.max(2, Math.min(7, Math.floor(pw / 120))), xt = '';
  for (var i = 0; i <= nT; i++) {
    var t = from + (to - from) * i / nT, lab = ldbFmt(new Date(t).toISOString());
    xt += '<text class="xa" x="' + X(t).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === nT ? 'end' : 'middle') + '">' + (d.days === 1 ? lab.slice(7, 12) : lab.slice(0, 6)) + '</text>';
  }
  var bands = spans.map(function(x) {
    var a = Math.max(L, X(x[0])), b = Math.min(W - Rm, X(x[1]));
    return '<rect class="lossb" x="' + a.toFixed(1) + '" y="' + T + '" width="' + Math.max(2, b - a).toFixed(1) + '" height="' + ph + '"/>';
  }).join('');
  var path = '', pen = false;
  pts.forEach(function(p) {
    if (p[1] === null) { pen = false; return; }
    path += (pen ? 'L' : 'M') + X(new Date(p[0]).getTime()).toFixed(1) + ' ' + Y(p[1]).toFixed(1); pen = true;
  });

  body.innerHTML = '<div class="ldb-rxm-legend"><span><i class="ln"></i>Rx power (dBm)</span>' + (spans.length ? '<span><i class="ls"></i>Loss of signal</span>' : '') + '</div>'
    + '<div class="ldb-rxm-chart"><svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'
    + grid + bands + '<path class="ln" d="' + path + '"/>' + xt
    + '<line class="xh" id="ldb-rxm-xh" y1="' + T + '" y2="' + (T + ph) + '" style="display:none"/><circle class="dot" id="ldb-rxm-dot" r="4.5" style="display:none"/>'
    + '<rect class="hit" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '"/></svg>'
    + '<div class="ldb-rxm-tip" id="ldb-rxm-tip"></div></div>';

  var svg = body.querySelector('svg'), hit = svg.querySelector('.hit'), xh = document.getElementById('ldb-rxm-xh'),
      dot = document.getElementById('ldb-rxm-dot'), tip = document.getElementById('ldb-rxm-tip');
  var ts = pts.map(function(p) { return new Date(p[0]).getTime(); });
  function move(e) {
    var r = svg.getBoundingClientRect(), mx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, t = from + (mx - L) / pw * (to - from);
    var k = 0, best = Infinity;
    for (var j = 0; j < ts.length; j++) { var dd = Math.abs(ts[j] - t); if (dd < best) { best = dd; k = j; } }
    var p = pts[k], x = X(ts[k]);
    xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.style.display = '';
    if (p[1] === null) dot.style.display = 'none';
    else { dot.setAttribute('cx', x); dot.setAttribute('cy', Y(p[1])); dot.style.display = ''; }
    tip.innerHTML = '<em>' + ldbFmt(p[0]) + ' ' + ldb.tz + '</em><b>' + (p[1] === null ? '<span class="ldb-loss">' + LDB_ICON.down + 'Loss</span>' : p[1].toFixed(2) + ' dBm') + '</b>';
    tip.style.display = 'block';
    tip.style.left = Math.min(Math.max(x - tip.offsetWidth / 2, 0), W - tip.offsetWidth) + 'px';
    tip.style.top = Math.max(0, (p[1] === null ? T + 10 : Y(p[1]) - tip.offsetHeight - 12)) + 'px';
  }
  function out() { xh.style.display = 'none'; dot.style.display = 'none'; tip.style.display = 'none'; }
  hit.addEventListener('mousemove', move); hit.addEventListener('touchmove', move, { passive: true });
  hit.addEventListener('mouseleave', out);
}

/* ═══════════════════════════════
   Cross-connect monitoring (GET /api/leo/ifmon — server/ifmon.js).
   A circuit that crosses one of our routers through a CCC is shown as a path:
     Equinix SP4 ─ Eletronet ─ [et-0/0/27] ═ router (CCC) ═ [et-0/0/28] ─ SLZ501
   Each side has its own state, flaps and downtime, so a flap can be pinned to
   the Eletronet side or to the Amazon Leo side. Rendered inside the site.
   ═══════════════════════════════ */
var ldbIf = { data: null, hours: 24, sig: '' };

function ldbIfLoad() {
  var h = ldbIf.hours;
  _apiGet('/leo/ifmon?hours=' + h).then(function(d) {
    if (ldbIf.hours !== h) return;
    var sig = h + JSON.stringify(d.paths.map(function(p) { return p.hops.map(function(hp) { return hp.ports.map(function(x) { return [x.polledAt, x.status, x.ok, x.events.length]; }); }); }));
    ldbIf.data = d;
    if (sig !== ldbIf.sig) { ldbIf.sig = sig; ldbPathRender(); }
  }).catch(function() { /* keeps the last data */ });
}
function ldbIfSet(h) { ldbIf.hours = h; ldbIf.sig = ''; ldbPathRender(); ldbIfLoad(); }

function ldbBps(v) {
  if (v === null || v === undefined) return '—';
  var u = [['Tbps', 1e12], ['Gbps', 1e9], ['Mbps', 1e6], ['kbps', 1e3]].filter(function(x) { return v >= x[1]; })[0];
  return u ? (v / u[1]).toFixed(v / u[1] >= 100 ? 0 : v / u[1] >= 10 ? 1 : 2) + '<small> ' + u[0] + '</small>' : Math.round(v) + '<small> bps</small>';
}
function ldbAxisBps(v) {
  if (!v) return '0';
  var u = [['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3]].filter(function(x) { return v >= x[1]; })[0] || ['', 1];
  return +(v / u[1]).toFixed(2) + ' ' + u[0] + 'bps';
}
function ldbMin(ms) { var m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + m % 60 + 'm'; }
function ldbRangeLabel() { return ldbIf.hours === 168 ? '7 days' : ldbIf.hours + 'h'; }

/* down intervals of a port in the window, from the 1-min samples (+ open one if down now) */
function ldbPortDown(pt, from, to) {
  var out = [], s = null;
  (pt.points || []).forEach(function(p) {
    var t = new Date(p[0]).getTime();
    if (p[3] === 0 && s === null) s = t;
    else if (p[3] === 1 && s !== null) { out.push([s, t]); s = null; }
  });
  if (s !== null) out.push([s, to]);
  return out.filter(function(x) { return x[1] > from; });
}
function ldbPortState(pt) { return !pt.status ? 'nodata' : pt.status === 'up' ? 'up' : 'down'; }

function ldbPathRender() {
  var d = ldbIf.data;
  document.querySelectorAll('#ldb-body .ldb-path-slot').forEach(function(slot) {
    var paths = d ? d.paths.filter(function(p) { return p.site === slot.dataset.site; }) : [];
    slot.innerHTML = paths.map(ldbPathCard).join('');
    paths.forEach(function(p) { ldbPathChart(p); });
  });
}

function ldbPathCard(p) {
  var to = Date.now(), from = to - ldbIf.hours * 3600000;
  var ports = [];
  p.hops.forEach(function(h) { h.ports.forEach(function(pt) { ports.push(pt); }); });
  var info = {};
  ports.forEach(function(pt) {
    var downs = ldbPortDown(pt, from, to);
    info[pt.key] = {
      pt: pt, st: ldbPortState(pt), downs: downs,
      flaps: pt.events.filter(function(e) { return e.type === 'flap'; }).length,
      drops: pt.events.filter(function(e) { return e.type === 'down'; }).length,
      downtime: downs.reduce(function(s, x) { return s + Math.min(x[1], to) - Math.max(x[0], from); }, 0)
    };
  });
  var all = ports.map(function(pt) { return info[pt.key]; });
  var downNow = all.filter(function(s) { return s.st === 'down'; });
  var trans = all.reduce(function(n, s) { return n + s.flaps + s.drops; }, 0);
  /* which segment is down: a side whose every port is down is the segment itself (e.g. Eletronet transport) */
  var downSides = [];
  downNow.forEach(function(s) { if (downSides.indexOf(s.pt.side) < 0) downSides.push(s.pt.side); });
  var worst = downNow.length ? 'down' : all.every(function(s) { return s.st === 'nodata'; }) ? 'nodata' : trans ? 'warn' : 'up';
  var summary = worst === 'down'
    ? downSides.map(function(side) {
        var ps = all.filter(function(s) { return s.pt.side === side; }), dn = ps.filter(function(s) { return s.st === 'down'; });
        return dn.length === ps.length && ps.length > 1 ? side + ' segment down (both ends)' : side + ' side down at ' + dn.map(function(s) { return s.pt.short; }).join(', ');
      }).join(' · ')
    : worst === 'warn' ? 'All ports up · ' + trans + ' transition(s) in ' + ldbRangeLabel()
    : worst === 'up' ? 'All ports up · no flaps in ' + ldbRangeLabel() : 'Awaiting data';
  var stale = p.hops.filter(function(h) { return !h.ok; });

  /* the drawing: left end ─ [port ═ router ═ port] ─ … ─ right end */
  function port(s) {
    return '<div class="ldb-pd-port ' + s.st + '">'
      + '<span class="ldb-pd-pill"><i></i>' + esc(s.pt.ifName) + '</span>'
      + '<span class="ldb-pd-side">' + esc(s.pt.side) + '</span>'
      + (s.pt.statusSince ? '<span class="ldb-pd-since">' + (s.st === 'up' ? 'up ' : s.st === 'down' ? 'down ' : '') + '<span data-ldur="' + s.pt.statusSince + '">' + ldbDur(s.pt.statusSince) + '</span></span>' : '')
      + '</div>';
  }
  /* a segment; its traffic is read on the port next to it (→ toward the right end) */
  function link(name, s, fwd, back) {
    return '<div class="ldb-pd-link ' + s.st + '"><span class="ldb-pd-rate fwd">→ ' + ldbBps(fwd) + '</span><span class="ldb-pd-line"></span>'
      + '<span class="ldb-pd-seg">' + esc(name) + '</span><span class="ldb-pd-rate back">← ' + ldbBps(back) + '</span></div>';
  }
  var cols = ['minmax(84px, auto)'], html = '<div class="ldb-pd-end"><b>' + esc(p.left.name) + '</b><span>' + esc(p.left.sub) + '</span></div>';
  p.hops.forEach(function(h, i) {
    var a = info[h.ports[0].key], prev = i ? info[p.hops[i - 1].ports[1].key] : null;
    html += i === 0 ? link(p.segments[0], a, a.pt.inBps, a.pt.outBps)
                    : link(p.segments[i], prev.st === 'down' ? prev : a, prev.pt.outBps, prev.pt.inBps);
    html += port(a)
      + '<div class="ldb-pd-router' + (h.ok ? '' : ' stale') + '"><b>CCC</b><span>' + esc(h.short) + '</span><span>' + esc(h.place) + '</span></div>'
      + port(info[h.ports[1].key]);
    cols.push('minmax(104px, 1fr)', 'auto', 'auto', 'auto');
  });
  var last = info[p.hops[p.hops.length - 1].ports[1].key];
  html += link(p.segments[p.hops.length], last, last.pt.outBps, last.pt.inBps)
    + '<div class="ldb-pd-end"><b>' + esc(p.right.name) + '</b><span>' + esc(p.right.sub) + '</span></div>';
  cols.push('minmax(104px, 1fr)', 'minmax(84px, auto)');
  var diagram = '<div class="ldb-pd" style="--pd-cols:' + cols.join(' ') + '">' + html + '</div>';

  /* per port: state, flaps, downtime */
  var sideCards = '<div class="ldb-pd-sides">' + all.map(function(s) {
    return '<div class="ldb-pd-sc ' + s.st + '"><div class="ldb-pd-sc-h"><span class="ldb-st-dot"></span><b>' + esc(s.pt.side) + '</b><span class="ldb-pd-at">at ' + esc(s.pt.short) + '</span>'
      + '<em>' + (s.st === 'up' ? 'UP' : s.st === 'down' ? 'DOWN' : '—') + '</em></div>'
      + '<code class="ldb-pd-if">' + esc(s.pt.ifName) + '</code>'
      + '<div class="ldb-pd-sc-g">'
      +   '<div><span>Flaps</span><b>' + s.flaps + '</b></div>'
      +   '<div><span>Down events</span><b>' + s.drops + '</b></div>'
      +   '<div><span>Downtime</span><b>' + (s.downtime ? ldbMin(s.downtime) : '0') + '</b></div>'
      +   '<div><span>Last change</span><b>' + (s.pt.lastChangeAt ? ldbFmt(s.pt.lastChangeAt).slice(0, 12) : '—') + '</b></div>'
      + '</div></div>';
  }).join('') + '</div>';

  /* timeline: one row per port, down periods + flap ticks */
  var X = function(t) { return ((t - from) / (to - from) * 100).toFixed(3); };
  var tl = '<div class="ldb-pd-tl">' + all.map(function(s) {
    return '<div class="ldb-pd-tl-row"><span class="ldb-pd-tl-l">' + esc(s.pt.side) + ' <small>' + esc(s.pt.short) + '</small></span><div class="ldb-pd-tl-bar' + (s.st === 'nodata' ? ' nodata' : '') + '">'
      + s.downs.map(function(x) { var l = Math.max(from, x[0]); return '<i class="dn" style="left:' + X(l) + '%;width:' + Math.max(.3, (Math.min(to, x[1]) - l) / (to - from) * 100).toFixed(3) + '%" title="Down ' + ldbFmt(new Date(l).toISOString()) + '"></i>'; }).join('')
      + s.pt.events.filter(function(e) { return e.type === 'flap'; }).map(function(e) { return '<i class="fl" style="left:' + X(new Date(e.at).getTime()) + '%" title="Flap ' + ldbFmt(e.at) + ' ' + ldb.tz + '"></i>'; }).join('')
      + '</div></div>';
  }).join('') + '<div class="ldb-tl-axis ldb-pd-axis"><span>' + ldbRangeLabel() + ' ago</span><span>Now</span></div></div>';

  /* event table, every port */
  var evs = [];
  all.forEach(function(s) { s.pt.events.forEach(function(e) { evs.push({ e: e, s: s }); }); });
  evs.sort(function(x, y) { return String(y.e.at).localeCompare(String(x.e.at)); });
  var rows = evs.length ? evs.slice(0, 100).map(function(x) {
    var e = x.e, tag = e.type === 'down' ? '<span class="ldb-tag down">DOWN</span>' : e.type === 'up' ? '<span class="ldb-tag ok">UP</span>' : '<span class="ldb-tag warn">FLAP</span>';
    return '<tr><td>' + tag + '</td><td>' + esc(x.s.pt.side) + ' <small class="ldb-pd-at">' + esc(x.s.pt.short) + '</small><br><code>' + esc(x.s.pt.ifName) + '</code></td><td class="ldb-num">' + ldbFmt(e.at) + '</td><td class="ldb-num">'
      + (e.type === 'up' && e.dur !== undefined ? 'was down ' + ldbDur(new Date(Date.now() - e.dur).toISOString()) : e.type === 'flap' ? '< 1 min' : '') + '</td></tr>';
  }).join('') : '<tr><td colspan="4" class="ldb-none">No flaps in this period</td></tr>';

  return '<article class="ldb-c ldb-path ' + (worst === 'warn' ? 'warn' : worst) + '">'
    + '<header class="ldb-c-head ldb-path-head"><div><div class="ldb-c-kicker">Cross-connect monitoring · SNMP every minute</div>'
    +   '<div class="ldb-c-title">' + esc(p.title) + '<code>' + esc(p.circuit) + '</code></div>'
    +   '<div class="ldb-path-sum ' + worst + '"><i></i>' + summary
    +     (stale.length ? ' · <b>no SNMP answer from ' + stale.map(function(h) { return esc(h.short); }).join(', ') + '</b>' : '') + '</div></div>'
    +   '<div class="ldb-seg">' + [[6, '6h'], [24, '24h'], [168, '7d']].map(function(o) {
          return '<button class="' + (ldbIf.hours === o[0] ? 'sel' : '') + '" onclick="ldbIfSet(' + o[0] + ')">' + o[1] + '</button>';
        }).join('') + '</div>'
    + '</header>'
    + '<div class="ldb-path-body">' + diagram + sideCards + tl
    +   '<div class="ldb-path-cols"><div class="ldb-path-chart" id="ldb-pc-' + p.id + '"></div>'
    +   '<div class="ldb-table"><table><thead><tr><th>Event</th><th>Port</th><th>Time (' + ldb.tz + ')</th><th>Duration</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
    + '</div></article>';
}

/* traffic of the circuit, read on the port facing the left end (the Leo site):
   in = toward the right end (SP4), out = toward the left end (SLZ501) */
function ldbPathChart(p) {
  var body = document.getElementById('ldb-pc-' + p.id);
  if (!body) return;
  var a = p.hops[0].ports[0], to = Date.now(), from = to - ldbIf.hours * 3600000;
  var series = [
    { name: 'Toward ' + p.right.name, cls: 'if-in', pts: (a.points || []).map(function(x) { return [x[0], x[1]]; }) },
    { name: 'Toward ' + p.left.name, cls: 'if-out', pts: (a.points || []).map(function(x) { return [x[0], x[2]]; }) }
  ];
  var allPorts = [];
  p.hops.forEach(function(h) { h.ports.forEach(function(x) { allPorts.push(x); }); });
  if (!series.some(function(s) { return s.pts.some(function(x) { return x[1] !== null; }); })) {
    body.innerHTML = '<div class="ldb-rxm-empty">' + ((a.points || []).length ? 'Collecting traffic — needs two readings' : 'No readings yet — the portal reads the router every minute') + '</div>';
    return;
  }
  var W = Math.max(260, body.clientWidth), H = 210, L = 66, Rm = 10, T = 10, B = 24, pw = W - L - Rm, ph = H - T - B;
  var hi = 0;
  series.forEach(function(s) { s.pts.forEach(function(x) { hi = Math.max(hi, x[1] || 0); }); });
  var nice = [1, 2, 2.5, 5, 10], mag = Math.pow(10, Math.floor(Math.log10(Math.max(hi, 1e3)))), top = 10 * mag;
  for (var k = 0; k < nice.length; k++) if (nice[k] * mag >= hi * 1.1) { top = nice[k] * mag; break; }
  var X = function(t) { return L + (t - from) / (to - from) * pw; }, Y = function(v) { return T + (1 - v / top) * ph; };
  var grid = '';
  for (var g = 0; g <= 4; g++) {
    var v = top * g / 4;
    grid += '<line class="g" x1="' + L + '" x2="' + (W - Rm) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="ya" x="' + (L - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '">' + ldbAxisBps(v) + '</text>';
  }
  var nT = Math.max(2, Math.min(6, Math.floor(pw / 110))), xt = '';
  for (var n = 0; n <= nT; n++) {
    var t = from + (to - from) * n / nT, lab = ldbFmt(new Date(t).toISOString());
    xt += '<text class="xa" x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (n === 0 ? 'start' : n === nT ? 'end' : 'middle') + '">' + (ldbIf.hours > 24 ? lab.slice(0, 6) : lab.slice(7, 12)) + '</text>';
  }
  var bands = [].concat.apply([], allPorts.map(function(x) { return ldbPortDown(x, from, to); })).map(function(x) {
    var l = Math.max(L, X(x[0])), r = Math.min(W - Rm, X(x[1]));
    return '<rect class="lossb" x="' + l.toFixed(1) + '" y="' + T + '" width="' + Math.max(2, r - l).toFixed(1) + '" height="' + ph + '"/>';
  }).join('');
  function line(pts) {
    var d = '', pen = false;
    pts.forEach(function(x) { if (x[1] === null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(new Date(x[0]).getTime()).toFixed(1) + ' ' + Y(x[1]).toFixed(1); pen = true; });
    return d;
  }
  var l0 = line(series[0].pts);
  var area = l0.split('M').filter(Boolean).map(function(seg) {
    var xs = seg.split('L'), f = xs[0].split(' ')[0], e = xs[xs.length - 1].split(' ')[0];
    return 'M' + f + ' ' + (T + ph) + 'L' + seg + 'L' + e + ' ' + (T + ph) + 'Z';
  }).join('');
  body.innerHTML = '<div class="ldb-rxm-legend">' + series.map(function(s) { return '<span><i class="' + (s.cls === 'if-in' ? 'in' : 'out') + '"></i>' + esc(s.name) + '</span>'; }).join('') + (bands ? '<span><i class="ls"></i>Port down</span>' : '') + '</div>'
    + '<div class="ldb-rxm-chart"><svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'
    + grid + bands + '<path class="if-area" d="' + area + '"/><path class="if-in" d="' + l0 + '"/><path class="if-out" d="' + line(series[1].pts) + '"/>' + xt
    + '<line class="xh" y1="' + T + '" y2="' + (T + ph) + '" style="display:none"/><rect class="hit" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '"/></svg>'
    + '<div class="ldb-rxm-tip"></div></div>';
  var svg = body.querySelector('svg'), hit = svg.querySelector('.hit'), xh = svg.querySelector('.xh'), tip = body.querySelector('.ldb-rxm-tip');
  function near(pts, t) { var k = -1, best = Infinity; for (var j = 0; j < pts.length; j++) { var dd = Math.abs(new Date(pts[j][0]).getTime() - t); if (dd < best) { best = dd; k = j; } } return k < 0 ? null : pts[k]; }
  function move(e) {
    var r = svg.getBoundingClientRect(), mx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, t = from + (mx - L) / pw * (to - from);
    var p0 = near(series[0].pts, t), p1 = near(series[1].pts, t); if (!p0) return;
    var x = X(new Date(p0[0]).getTime());
    xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.style.display = '';
    tip.innerHTML = '<em>' + ldbFmt(p0[0]) + ' ' + ldb.tz + '</em><b><i class="ldb-if-dot in"></i>' + ldbBps(p0[1]) + ' <small>→ ' + esc(p.right.name) + '</small></b>'
      + (p1 ? '<b><i class="ldb-if-dot out"></i>' + ldbBps(p1[1]) + ' <small>→ ' + esc(p.left.name) + '</small></b>' : '');
    tip.style.display = 'block';
    tip.style.left = Math.min(Math.max(x - tip.offsetWidth / 2, 0), W - tip.offsetWidth) + 'px';
    tip.style.top = '0px';
  }
  function out() { xh.style.display = 'none'; tip.style.display = 'none'; }
  hit.addEventListener('mousemove', move); hit.addEventListener('touchmove', move, { passive: true });
  hit.addEventListener('mouseleave', out);
}
window.addEventListener('resize', function() { if (ldbIf.data) ldbIf.data.paths.forEach(ldbPathChart); });
