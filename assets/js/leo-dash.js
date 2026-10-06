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
  { id: 'RJOOCR964161',    site: 'SLZ501', pop: 'Equinix RJ2' },
  { id: 'SPOOCR964174',    site: 'SLZ501', pop: 'Equinix SP4' },
  { id: '21-90090-252671', site: 'CPV501', pop: 'Equinix SP4' },
  { id: '21-90090-252668', site: 'CPV501', pop: 'Equinix RJ2' }
];
var LDB_RANGES = { '1': 'Last 24 hours', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' };

var ldb = { data: null, site: 'SLZ501', range: 30, tz: 'UTC', timer: 0, tick: 0 };

function openLeoDash() {
  showPage('pg-leo-dash');
  ldbRender();
  ldbLoad();
  clearInterval(ldb.timer); clearInterval(ldb.tick);
  ldb.timer = setInterval(function() {
    var pg = document.getElementById('pg-leo-dash');
    if (!pg || !pg.classList.contains('active')) { clearInterval(ldb.timer); clearInterval(ldb.tick); return; }
    ldbLoad();
  }, 10000);
  ldb.tick = setInterval(ldbTick, 1000);
}

function ldbLoad() {
  _apiGet('/leo/status').then(function(d) {
    var changed = JSON.stringify(d.events) + JSON.stringify(d.metrics) + d.monitoringSince !== (ldb.data ? JSON.stringify(ldb.data.events) + JSON.stringify(ldb.data.metrics) + ldb.data.monitoringSince : '');
    ldb.data = d;
    if (changed) ldbRender(); else ldbStamp();
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
      + '</section>';
  }).join('');
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

  var rxHtml = m ? '<div class="ldb-rx"><span>Rx signal</span><b>' + m.rx.toFixed(2) + '<small> dBm</small></b>' + ldbSpark(m.history) + '<em>' + ldbFmt(m.at) + '</em></div>' : '';

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

function ldbSpark(h) {
  if (!h || h.length < 2) return '';
  var v = h.map(function(x) { return x[1]; }), lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), rg = hi - lo || 1;
  var pts = v.map(function(y, i) { return (i / (v.length - 1) * 100).toFixed(1) + ',' + (22 - (y - lo) / rg * 20).toFixed(1); }).join(' ');
  return '<svg class="ldb-spark" viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="' + pts + '"/></svg>';
}

function ldbStamp() {
  var el = document.getElementById('ldb-updated');
  if (el && ldb.data) el.textContent = 'Updated ' + ldbFmt(ldb.data.generatedAt).slice(7) + ' ' + ldb.tz + ' · auto-refresh 10 s';
}
function ldbTick() {
  document.querySelectorAll('#pg-leo-dash [data-ldur]').forEach(function(e) { e.textContent = ldbDur(e.dataset.ldur); });
}

function ldbSet(k, v) { ldb[k] = k === 'range' ? +v : v; ldbRender(); }
