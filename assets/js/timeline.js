/* ═══════════════════════════════
   CASE TIMELINE
   ═══════════════════════════════ */

var CIRCUITS = {
  SLZ501: [
    { id: 'RJOOCR964161',   label: 'RJOOCR964161 \u2014 Equinix RJ2 x Ocara' },
    { id: 'SPOOCR964174',   label: 'SPOOCR964174 \u2014 Equinix SP4 x Ocara' }
  ],
  CPV501: [
    { id: '21-90090-252671', label: '21-90090-252671 \u2014 Equinix SP4 x Sanhar\u00f3' },
    { id: '21-90090-252668', label: '21-90090-252668 \u2014 Equinix RJ2 x Sanhar\u00f3' }
  ]
};

var CAUSE_STYLE = {
  'Indisponibilidade':              { bg: '#fdecea', color: '#c0392b', dot: '#ef5350' },
  'Flaps':                          { bg: '#fff3e0', color: '#e65100', dot: '#ff9800' },
  'Falha El\u00e9trica':           { bg: '#fffde7', color: '#f57f17', dot: '#f59e0b' },
  'Solicita\u00e7\u00e3o de RFO':  { bg: '#e8f0ff', color: '#0649fc', dot: '#0649fc' }
};

var activeId = null;

/* ── TICKET LIST ── */
function renderList() {
  var cases = dbGetAll();
  var el    = document.getElementById('tickets-container');
  if (!cases.length) {
    el.innerHTML = '<div class="empty-state">'
      + '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity:.3">'
      + '<rect x="3" y="4" width="18" height="18" rx="2"/>'
      + '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
      + '</svg>'
      + '<p style="margin-top:14px;font-size:15px;">No cases yet. Click <strong>New Case</strong> to get started.</p>'
      + '</div>';
    return;
  }
  var h = '<div class="tickets-grid">';
  cases.forEach(function(cas) {
    var cc = CAUSE_STYLE[cas.cause] || { bg: '#f5f5f7', color: '#3a3a3c', dot: '#aeaeb2' };
    var cl = cas.circuit;
    (CIRCUITS[cas.site] || []).forEach(function(x) { if (x.id === cas.circuit) cl = x.label; });
    var ev = (cas.events || []).length;
    h += '<div class="ticket-card" data-id="' + esc(cas.ticketId) + '" onclick="openDetail(this.dataset.id)">'
       + '<div><span class="badge" style="background:' + cc.bg + ';color:' + cc.color + '">'
       +   '<span style="width:6px;height:6px;border-radius:50%;background:' + cc.dot + ';display:inline-block;"></span> '
       +   esc(cas.cause) + '</span></div>'
       + '<div class="tc-meta">'
       +   '<div class="tc-id">#' + esc(cas.ticketId) + '</div>'
       +   '<div class="tc-site">' + esc(cas.site) + '</div>'
       +   '<div class="tc-circuit">' + esc(cl) + '</div>'
       + '</div>'
       + '<div class="tc-right">'
       +   '<span class="tc-events">' + ev + ' event' + (ev !== 1 ? 's' : '') + '</span>'
       +   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d0d0d5" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
       + '</div>'
       + '</div>';
  });
  h += '</div>';
  el.innerHTML = h;
}

/* ── SITE / CIRCUIT SELECTOR ── */
function newSiteChange() {
  var s   = document.getElementById('new-site').value;
  var sel = document.getElementById('new-circuit');
  sel.innerHTML = '';
  if (!s) {
    sel.innerHTML = '<option value="">Select site first</option>';
    sel.disabled  = true;
    return;
  }
  sel.disabled = false;
  var b = document.createElement('option');
  b.value = ''; b.textContent = 'Select circuit';
  sel.appendChild(b);
  (CIRCUITS[s] || []).forEach(function(c) {
    var o = document.createElement('option');
    o.value = c.id; o.textContent = c.label;
    sel.appendChild(o);
  });
}

function pickCause(el) {
  document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('sel'); });
  el.classList.add('sel');
}

/* ── CREATE CASE ── */
function createCase() {
  var t  = document.getElementById('new-ticket').value.trim();
  var s  = document.getElementById('new-site').value;
  var ci = document.getElementById('new-circuit').value;
  var p  = document.querySelector('.pill.sel');
  if (!t || !s || !ci || !p) { alert('Please fill in all fields and select a cause.'); return; }
  if (dbGetCase(t)) { alert('Case #' + t + ' already exists. Opening it.'); openDetail(t); return; }
  dbUpsert({
    ticketId:  t, site: s, circuit: ci,
    cause:     p.dataset.cause,
    createdAt: new Date().toISOString(),
    events:    []
  });
  document.getElementById('new-ticket').value = '';
  document.getElementById('new-site').value   = '';
  document.getElementById('new-circuit').innerHTML = '<option value="">Select site first</option>';
  document.getElementById('new-circuit').disabled  = true;
  document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('sel'); });
  openDetail(t);
}

/* ── CASE DETAIL ── */
function openDetail(id) {
  var c = dbGetCase(id);
  if (!c) { alert('Case not found.'); return; }
  activeId = id;
  document.getElementById('detail-crumb').textContent = '#' + id;

  var cc = CAUSE_STYLE[c.cause] || { bg: '#f5f5f7', color: '#3a3a3c', dot: '#aeaeb2' };
  var cl = c.circuit;
  (CIRCUITS[c.site] || []).forEach(function(x) { if (x.id === c.circuit) cl = x.label; });

  document.getElementById('detail-hdr').innerHTML =
      '<div style="flex:1;min-width:110px;"><div class="chk">Ticket ID</div><div class="chv">#' + esc(c.ticketId) + '</div></div>'
    + '<div style="flex:1;min-width:90px;"><div class="chk">Site</div><div class="chv">' + esc(c.site) + '</div></div>'
    + '<div style="flex:2;min-width:160px;"><div class="chk">Circuit</div><div class="chvs">' + esc(cl) + '</div></div>'
    + '<div><span class="badge" style="background:' + cc.bg + ';color:' + cc.color + '">'
    +   '<span style="width:7px;height:7px;border-radius:50%;background:' + cc.dot + ';display:inline-block;"></span> '
    +   esc(c.cause) + '</span></div>';

  var n = new Date();
  document.getElementById('ev-time').value =
    pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds());

  renderEvents(c.events || []);
  showPage('pg-tl-detail');
}

function renderEvents(evs) {
  var el = document.getElementById('detail-entries');
  if (!evs.length) {
    el.innerHTML = '<p style="color:#aeaeb2;font-size:14px;text-align:center;padding:32px 0;">No events yet. Add the first event above.</p>';
    return;
  }
  var h = '';
  evs.forEach(function(ev) {
    h += '<div class="tl-item"><div class="tl-dot"></div><div class="tl-card">'
       + '<div class="tl-meta">'
       +   '<span class="tl-time">' + esc(ev.time) + '</span>'
       +   '<span style="color:#aeaeb2;font-size:11px;">&bull;</span>'
       +   '<span class="tl-type">' + esc(ev.type) + '</span>'
       + '</div>'
       + (ev.desc ? '<div class="tl-desc">' + esc(ev.desc) + '</div>' : '')
       + '</div></div>';
  });
  el.innerHTML = h;
}

function addEvent() {
  var t  = document.getElementById('ev-time').value;
  var tp = document.getElementById('ev-type').value;
  var d  = document.getElementById('ev-desc').value.trim();
  if (!t || !tp) { alert('Please fill in time and event type.'); return; }
  var c = dbGetCase(activeId);
  if (!c) return;
  c.events.push({ time: t, type: tp, desc: d });
  dbUpsert(c);
  renderEvents(c.events);
  document.getElementById('ev-desc').value = '';
  var p = t.split(':');
  var h2 = parseInt(p[0]), m = parseInt(p[1] || 0), s = parseInt(p[2] || 0);
  m += 1;
  if (m >= 60) { m = 0; h2 = (h2 + 1) % 24; }
  document.getElementById('ev-time').value = pad(h2) + ':' + pad(m) + ':' + pad(s);
}

function deleteCase() {
  if (!confirm('Delete case #' + activeId + '? This cannot be undone.')) return;
  dbDelete(activeId);
  activeId = null;
  openTLList();
}
