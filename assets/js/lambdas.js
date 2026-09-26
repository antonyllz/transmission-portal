/* ═══════════════════════════════
   LAMBDAS — DWDM network map & channels
   Topology lives in network-data.js; channels (lmbGetAll) and
   site position overrides (netposGetAll) are shared via the API.
   ═══════════════════════════════ */

var LMB_STATUS = {
  ativo:     { label: 'Ativo',     color: '#16a34a', bg: '#e7f7ed' },
  reservado: { label: 'Reservado', color: '#d97706', bg: '#fff7ed' },
  inativo:   { label: 'Inativo',   color: '#8e8e93', bg: '#f2f2f7' }
};
var LMB_GRIDS = {
  '75':    { label: '75 GHz',    width: 0.075 },
  '100':   { label: '100 GHz',   width: 0.1 },
  '112.5': { label: '112,5 GHz', width: 0.1125 },
  '150':   { label: '150 GHz',   width: 0.15 }
};
function lmbGridWidth(g) { return (LMB_GRIDS[g] || LMB_GRIDS['75']).width; }
var LMB_ROLES = {
  roadm:    { label: 'ROADM',    long: 'ROADM' },
  terminal: { label: 'Terminal', long: 'Terminal' },
  ola:      { label: 'OLA',      long: 'OLA (amplificação)' }
};
var LMB_BAND ={ lo: 191.3, hi: 196.2 };   /* C-band window drawn in the spectrum bar */

var lmbMap        = null;
var lmbLinkLayers = {};    /* link id -> { line, hit } */
var lmbSiteLayers = {};    /* site id -> marker */
var lmbHidden     = {};    /* vendor -> true when toggled off */
var lmbSel        = { type: null, id: null };   /* 'link' | 'site' | 'channel' */
var lmbEdit       = null;  /* { id, vendor, route[] } while the channel form is open */
var lmbPosMode    = false;
var lmbQuery      = '';

/* ── LOOKUPS ── */
/* site overrides saved from the map (netposGetAll): { id, lat?, lng?, role? } */
function lmbSite(id) {
  var s = NET_SITES.find(function(x) { return x.id === id; });
  if (!s) return null;
  var o = netposGetAll().find(function(p) { return p.id === id; });
  if (!o) return s;
  var r = Object.assign({}, s);
  if (o.lat != null) { r.lat = o.lat; r.lng = o.lng; r.moved = true; }
  if (o.role) r.role = LMB_ROLE_ALIAS[o.role] || o.role;
  return r;
}
var LMB_ROLE_ALIAS = { addrop: 'roadm', amp: 'ola' };
function lmbIsOla(siteId) { var s = lmbSite(siteId); return !!s && s.role === 'ola'; }

/* A section runs between two non-OLA sites: from a span, keep walking through OLA
   sites (amplification only) until a Terminal/ROADM or a branch is reached. */
function lmbSection(linkId) {
  var l0 = lmbLink(linkId);
  var walk = function(site, fromLink, prevSite) {
    var links = [], sites = [], guard = 0;
    while (lmbIsOla(site) && guard++ < 60) {
      var next = NET_LINKS.filter(function(l) {
        if (l.vendor !== l0.vendor || l.id === fromLink) return false;
        var other = l.a === site ? l.b : (l.b === site ? l.a : null);
        return other && other !== prevSite;
      });
      var other = next.length ? (next[0].a === site ? next[0].b : next[0].a) : null;
      /* parallel fibers to the same neighbor (e.g. Algar + Claro) still count as one path — take the first */
      if (!next.length || next.some(function(l) { return l.a !== other && l.b !== other; })) break;
      links.push(next[0].id); sites.push(other);
      prevSite = site; fromLink = next[0].id; site = other;
    }
    return { links: links, sites: sites };
  };
  var fwd = walk(l0.b, l0.id, l0.a), back = walk(l0.a, l0.id, l0.b);
  var sites = back.sites.slice().reverse().concat([l0.a, l0.b], fwd.sites);
  var links = back.links.slice().reverse().concat([l0.id], fwd.links);
  return { vendor: l0.vendor, links: links, sites: sites, a: sites[0], z: sites[sites.length - 1] };
}
function lmbSectionName(sec) { return lmbShort(sec.a) + ' \u2194 ' + lmbShort(sec.z); }

/* ordered list of sites a route visits starting at `start`; null if the spans aren't contiguous */
function lmbRouteOrder(route, start) {
  var left = (route || []).slice(), cur = start, sites = [start], links = [];
  while (left.length) {
    var i = left.findIndex(function(id) { var l = lmbLink(id); return l && (l.a === cur || l.b === cur); });
    if (i < 0) return null;
    var l = lmbLink(left.splice(i, 1)[0]);
    cur = l.a === cur ? l.b : l.a;
    sites.push(cur);
    links.push(l.id);
  }
  return { sites: sites, links: links };
}
function lmbRouteSites(route, start) {
  var o = lmbRouteOrder(route, start);
  return o ? o.sites : null;
}
function lmbSiteOverride(id, patch) {
  var all = netposGetAll().slice();
  var i = all.findIndex(function(p) { return p.id === id; });
  var o = Object.assign({ id: id }, i >= 0 ? all[i] : {}, patch);
  Object.keys(o).forEach(function(k) { if (o[k] == null) delete o[k]; });
  if (i >= 0) all.splice(i, 1);
  if (Object.keys(o).length > 1) all.push(o);
  netposSave(all);
}
function lmbLink(id) { return NET_LINKS.find(function(l) { return l.id === id; }) || null; }
function lmbShort(siteId) { return siteId.replace(/^[A-Z]{2}-/, ''); }
function lmbLinkName(l) { return lmbShort(l.a) + ' ↔ ' + lmbShort(l.b); }
function lmbLinkSub(l) {
  var p = [NET_VENDORS[l.vendor].label];
  if (l.provider) p.push(l.provider);
  if (l.circuit)  p.push(l.circuit);
  if (l.label)    p.push(l.label);
  if (l.km)       p.push(String(l.km).replace('.', ',') + ' km');
  return p.join(' · ');
}
function lmbSiteVendors(id) {
  var v = {};
  NET_LINKS.forEach(function(l) { if (l.a === id || l.b === id) v[l.vendor] = true; });
  return Object.keys(v);
}
/* 1+1 protection: parallel fibers of the same vendor between the same two sites
   carry the same channels, so a route through one counts for all of them */
function lmbProtGroup(linkId) {
  var l = lmbLink(linkId);
  if (!l) return [linkId];
  var k = [l.a, l.b].sort().join('|');
  return NET_LINKS.filter(function(x) { return x.vendor === l.vendor && [x.a, x.b].sort().join('|') === k; })
    .map(function(x) { return x.id; });
}
function lmbExpandProt(route) {
  var out = [];
  (route || []).forEach(function(id) {
    lmbProtGroup(id).forEach(function(x) { if (out.indexOf(x) < 0) out.push(x); });
  });
  return out;
}

function lmbOnLink(linkId) {
  return lmbGetAll().filter(function(c) { return lmbExpandProt(c.route).indexOf(linkId) >= 0; })
    .sort(function(a, b) { return (parseFloat(a.freq) || 0) - (parseFloat(b.freq) || 0); });
}
function lmbActiveCount(list) {
  return list.filter(function(c) { return c.status !== 'inativo'; }).length;
}
function lmbFmtFreq(f) {
  f = parseFloat(f);
  if (isNaN(f)) return '—';
  var t = f.toFixed(6).replace(/0+$/, '');
  if (t.split('.')[1].length < 3) t = f.toFixed(3);
  return t + ' THz';
}

function lmbRouteVendors(c) {
  var v = {};
  (c.route || []).forEach(function(id) { var l = lmbLink(id); if (l) v[l.vendor] = true; });
  if (!Object.keys(v).length && c.vendor) v[c.vendor] = true;
  return Object.keys(v);
}

/* ── OPEN PAGE ── */
function openLambdas() {
  showPage('pg-lambdas');
  if (!lmbMap) lmbInitMap();
  setTimeout(function() { if (lmbMap) lmbMap.invalidateSize(); }, 350);
  lmbRenderPanel();
}

/* ── MAP ── */
function lmbInitMap() {
  if (typeof L === 'undefined') {
    document.getElementById('lmb-map').innerHTML =
      '<div class="empty-state">Não foi possível carregar o mapa (sem acesso à internet?)</div>';
    return;
  }
  lmbMap = L.map('lmb-map', { zoomControl: true, attributionControl: true, minZoom: 4 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 18, className: 'lmb-tiles'
  }).addTo(lmbMap);

  var regions = L.control({ position: 'topright' });
  regions.onAdd = function() {
    var d = L.DomUtil.create('div', 'lmb-regions');
    d.innerHTML = Object.keys(LMB_REGIONS).map(function(k) {
      return '<button onclick="lmbFitRegion(\'' + k + '\')">' + LMB_REGIONS[k].label + '</button>';
    }).join('');
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
  regions.addTo(lmbMap);

  lmbFitRegion('all');
  lmbMap.on('zoomend', lmbZoomClass);
  lmbMap.on('zoomend', lmbFlowUpdate);
  lmbMap.on('click', function() {
    if (lmbEdit || lmbPosMode) return;
    lmbSel = { type: null, id: null };
    lmbRestyle();
    lmbRenderPanel();
  });
  lmbDrawAll();
  lmbZoomClass();
}

/* quick views — the network spans NE and SE Brazil, too far apart to read at one zoom */
var LMB_REGIONS = {
  ne:  { label: 'Nordeste', test: function(s) { return s.lat > -14; } },
  se:  { label: 'Sudeste',  test: function(s) { return s.lat < -18; } },
  all: { label: 'Tudo',     test: function() { return true; } }
};
function lmbFitRegion(k) {
  var pts = NET_SITES.map(function(s) { return lmbSite(s.id); }).filter(LMB_REGIONS[k].test)
    .map(function(s) { return [s.lat, s.lng]; });
  lmbMap.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
}

function lmbZoomClass() {
  var el = document.getElementById('lmb-map');
  el.classList.toggle('lmb-far', lmbMap.getZoom() < 7);
}

/* parallel spans between the same pair of sites are drawn as arcs so they don't overlap */
function lmbCurve(a, b, bend) {
  if (!bend) return [[a.lat, a.lng], [b.lat, b.lng]];
  var dx = b.lng - a.lng, dy = b.lat - a.lat;
  var cx = (a.lng + b.lng) / 2 - dy * bend, cy = (a.lat + b.lat) / 2 + dx * bend;
  var pts = [];
  for (var i = 0; i <= 20; i++) {
    var t = i / 20, u = 1 - t;
    pts.push([u * u * a.lat + 2 * u * t * cy + t * t * b.lat,
              u * u * a.lng + 2 * u * t * cx + t * t * b.lng]);
  }
  return pts;
}

function lmbDrawAll() {
  lmbFlowClear();
  Object.keys(lmbLinkLayers).forEach(function(id) {
    lmbMap.removeLayer(lmbLinkLayers[id].line);
    lmbMap.removeLayer(lmbLinkLayers[id].hit);
  });
  Object.keys(lmbSiteLayers).forEach(function(id) { lmbMap.removeLayer(lmbSiteLayers[id]); });
  lmbLinkLayers = {};
  lmbSiteLayers = {};

  var groups = {};
  NET_LINKS.forEach(function(l) {
    var k = [l.a, l.b].sort().join('|');
    (groups[k] = groups[k] || []).push(l);
  });

  NET_LINKS.forEach(function(l) {
    var g    = groups[[l.a, l.b].sort().join('|')];
    var n    = g.length, i = g.indexOf(l);
    var a    = lmbSite(l.a), b = lmbSite(l.b);
    if (l.a > l.b) { var t = a; a = b; b = t; }   /* same orientation for every link in the group */
    /* protected spans: extra fibers have their own diverse road drawing ("link:<id>") */
    var R       = typeof NET_ROUTES !== 'undefined' ? NET_ROUTES : {};
    var diverse = n > 1 && g.slice(1).every(function(x) { return R['link:' + x.id]; });
    var road    = R['link:' + l.id] || R[a.id + '|' + b.id];
    var off     = n > 1 && !diverse && LMB_HAS_OFFSET ? (i - (n - 1) / 2) * 7 : 0;
    var pts  = road
      ? [[a.lat, a.lng]].concat(road.pts, [[b.lat, b.lng]])
      : lmbCurve(a, b, n > 1 && !LMB_HAS_OFFSET ? (i - (n - 1) / 2) * 0.35 : 0);
    var line = L.polyline(pts, { color: NET_VENDORS[l.vendor].color, weight: 4, opacity: .85, interactive: false,
                                 lineCap: 'round', lineJoin: 'round', offset: off, smoothFactor: 1.5 });
    var hit  = L.polyline(pts, { color: '#000', weight: 18, opacity: 0, bubblingMouseEvents: false, offset: off });
    hit.on('click', function() { lmbLinkClicked(l.id); });
    hit.on('mouseover', function() { line.setStyle({ weight: line.options.weight + 3 }); });
    hit.on('mouseout',  function() { lmbRestyle(); });
    hit.bindTooltip('', { sticky: true, direction: 'top', className: 'lmb-tip' });
    hit.on('tooltipopen', function(e) {
      var n   = lmbActiveCount(lmbOnLink(l.id));
      var sec = lmbSection(l.id);
      var via = sec.sites.slice(1, -1).map(lmbShort);
      var prot = g.length > 1 ? '<br>Protegido: ' + g.map(function(x) { return esc(x.provider || x.label || '?'); }).join(' / ') : '';
      e.tooltip.setContent('<b>' + lmbSectionName(sec) + '</b>' + (via.length ? '<br>via ' + via.join(', ') : '')
        + '<br>' + esc(lmbLinkSub(l)) + prot + '<br>' + n + (n === 1 ? ' canal' : ' canais'));
    });
    lmbLinkLayers[l.id] = { line: line, hit: hit, pts: pts, start: a.id, offset: off, roadKm: road ? road.km : null };
  });

  NET_SITES.forEach(function(s0) {
    var s  = lmbSite(s0.id);
    var vs = lmbSiteVendors(s.id);
    var c  = vs.length === 1 ? NET_VENDORS[vs[0]].color : '#1d1d1f';
    var m  = L.marker([s.lat, s.lng], {
      draggable: lmbPosMode,
      icon: L.divIcon({
        className: 'lmb-node-wrap',
        html: '<div class="lmb-node' + (s.approx && !s.moved ? ' approx' : '') + (s.role ? ' role-' + s.role : '') + '" style="--c:' + c + '">'
          + '<span class="lmb-dot"></span><span class="lmb-lbl">' + lmbShort(s.id) + '</span></div>',
        iconSize: [14, 14], iconAnchor: [7, 7]
      })
    });
    m.on('click', function() { if (!lmbPosMode) lmbSelect('site', s.id); });
    m.on('dragend', function() { lmbSitePosSave(s.id, m.getLatLng()); });
    lmbSiteLayers[s.id] = m;
  });

  lmbRestyle();
}

function lmbRestyle() {
  if (!lmbMap) return;
  var hl = null;
  if (lmbEdit) hl = lmbEdit.route;
  else if (lmbSel.type === 'channel') {
    var ch = lmbGetAll().find(function(c) { return c.id === lmbSel.id; });
    hl = ch ? lmbExpandProt(ch.route) : null;
  }
  var selSec = lmbSel.type === 'link' && lmbLink(lmbSel.id) ? lmbExpandProt(lmbSection(lmbSel.id).links) : [];

  NET_LINKS.forEach(function(l) {
    var lay = lmbLinkLayers[l.id];
    if (!lay) return;
    var hidden = lmbHidden[l.vendor] && !(hl && hl.indexOf(l.id) >= 0);
    [lay.line, lay.hit].forEach(function(x) {
      if (hidden && lmbMap.hasLayer(x)) lmbMap.removeLayer(x);
      if (!hidden && !lmbMap.hasLayer(x)) x.addTo(lmbMap);
    });
    if (hidden) return;

    var color = NET_VENDORS[l.vendor].color;
    var n     = lmbActiveCount(lmbOnLink(l.id));
    var w     = 3 + Math.min(n, 8) * 0.5;
    var st    = { color: color, weight: w, opacity: .85, dashArray: null };

    if (hl) {
      var on = hl.indexOf(l.id) >= 0;
      if (lmbEdit) {
        if (on) st = { color: '#f59e0b', weight: 8, opacity: 1, dashArray: null };
        else    st.opacity = l.vendor === lmbEdit.vendor ? .55 : .3;
      } else {
        if (on) { st.weight = 8; st.opacity = 1; }
        else    st.opacity = .15;
      }
    } else if (lmbSel.type === 'link') {
      if (l.id === lmbSel.id) { st.weight = 9; st.opacity = 1; }
      else if (selSec.indexOf(l.id) >= 0) { st.weight = 7; st.opacity = 1; }
      else st.opacity = .4;
    } else if (lmbSel.type === 'site') {
      var touch = l.a === lmbSel.id || l.b === lmbSel.id;
      st.opacity = touch ? 1 : .35;
      if (touch) st.weight = w + 2;
    }
    lay.line.setStyle(st);
  });

  NET_SITES.forEach(function(s) {
    var m = lmbSiteLayers[s.id];
    if (!m) return;
    var vs = lmbSiteVendors(s.id);
    var hidden = vs.length && vs.every(function(v) { return lmbHidden[v]; });
    if (hidden && lmbMap.hasLayer(m)) lmbMap.removeLayer(m);
    if (!hidden && !lmbMap.hasLayer(m)) m.addTo(lmbMap);
    var el = m.getElement && m.getElement();
    if (el) el.classList.toggle('sel', lmbSel.type === 'site' && lmbSel.id === s.id);
  });

  lmbFlowUpdate();
}

/* ── CHANNEL FLOW ──
   The selected section (or channel) gets light pulses running along it from end A to Z,
   one color per lambda — hue follows the wavelength (red = low THz … violet = high THz).
   With no channels registered yet, a faint full-spectrum flow shows the section is empty. */
var LMB_HAS_OFFSET = typeof L !== 'undefined' && !!L.Polyline.prototype.setOffset;
var LMB_FLOW_IDLE  = [191.8, 192.8, 193.8, 194.8, 195.8];
var lmbFlowLayers  = [];
var lmbFlowKey     = '';

/* channel colors: low → high frequency across a palette built around the Tely blue
   (teal → sky → Tely blue → indigo → violet); alpha optional */
var LMB_SPECTRUM = [[20, 184, 166], [14, 165, 233], [6, 73, 252], [79, 70, 229], [124, 58, 237]];
function lmbFreqRgb(f) {
  var t = Math.max(0, Math.min(1, (parseFloat(f) - LMB_BAND.lo) / (LMB_BAND.hi - LMB_BAND.lo)));
  var x = t * (LMB_SPECTRUM.length - 1), i = Math.min(Math.floor(x), LMB_SPECTRUM.length - 2), k = x - i;
  var a = LMB_SPECTRUM[i], b = LMB_SPECTRUM[i + 1];
  return [0, 1, 2].map(function(n) { return Math.round(a[n] + (b[n] - a[n]) * k); });
}
function lmbFreqColor(f, alpha) {
  var c = lmbFreqRgb(f);
  return alpha == null ? 'rgb(' + c.join(',') + ')' : 'rgba(' + c.join(',') + ',' + alpha + ')';
}

function lmbFlowClear() {
  lmbFlowLayers.forEach(function(x) { if (lmbMap) lmbMap.removeLayer(x); });
  lmbFlowLayers = [];
  lmbFlowKey = '';
}

function lmbFlowTarget() {
  if (lmbEdit || lmbPosMode) return null;
  var freqsOf = function(list) {
    var u = {};
    list.forEach(function(c) { var f = parseFloat(c.freq); if (c.status !== 'inativo' && f) u[f] = true; });
    return Object.keys(u).map(Number).sort(function(a, b) { return a - b; });
  };
  if (lmbSel.type === 'link' && lmbLink(lmbSel.id)) {
    var sec = lmbSection(lmbSel.id), seen = {}, list = [];
    sec.links.forEach(function(lid) {
      lmbOnLink(lid).forEach(function(c) { if (!seen[c.id]) { seen[c.id] = true; list.push(c); } });
    });
    return { vendor: sec.vendor, links: sec.links, sites: sec.sites, freqs: freqsOf(list) };
  }
  if (lmbSel.type === 'channel') {
    var c = lmbGetAll().find(function(x) { return x.id === lmbSel.id; });
    if (!c || !(c.route || []).length) return null;
    var o = lmbRouteOrder(c.route, c.a) || { links: c.route, sites: [] };
    return { vendor: c.vendor, links: o.links, sites: o.sites, freqs: freqsOf([c]) };
  }
  return null;
}

/* DWDM ribbon: two thin lambdas running side by side in the fiber, converging at the
   sites (mux/demux) and carrying a light streak from A to Z — drawn in tones of each
   span's vendor color (Ciena red, Padtec orange, Infinera blue). */

/* vendor color lightened (k > 0, towards white) or darkened (k < 0, towards black) */
function lmbTone(hex, k) {
  var c = [1, 3, 5].map(function(i) { return parseInt(hex.substr(i, 2), 16); });
  return 'rgb(' + c.map(function(v) { return Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)); }).join(',') + ')';
}
var LMB_RIBBON_TONES = [-0.18, 0.32];   /* the two lambdas: a deeper and a lighter shade */

/* shift a lat/lng path sideways by offPx pixels at the current zoom, tapering to 0 near both ends */
function lmbRibbonPath(pts, offPx, taperPx) {
  if (!offPx) return pts;
  var P = pts.map(function(p) { return lmbMap.latLngToLayerPoint(p); });
  var d = [0];
  for (var i = 1; i < P.length; i++) d.push(d[i - 1] + P[i].distanceTo(P[i - 1]));
  var total = d[d.length - 1] || 1, taper = Math.min(taperPx, total / 3);
  return P.map(function(p, i) {
    var a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var k = Math.min(1, d[i] / taper, (total - d[i]) / taper);
    k = k * k * (3 - 2 * k);   /* smoothstep, so the lambdas fan out gently */
    return lmbMap.layerPointToLatLng(L.point(p.x - dy / len * offPx * k, p.y + dx / len * offPx * k));
  });
}

function lmbFlowUpdate() {
  if (!lmbMap) return;
  var t = lmbFlowTarget();
  var key = t ? t.links.join(',') + '|' + t.sites.join(',') + '|' + t.freqs.join(',') + '|' + lmbMap.getZoom() : '';
  if (key === lmbFlowKey) return;
  lmbFlowClear();
  lmbFlowKey = key;
  if (!t) return;

  var idle  = !t.freqs.length;
  var n = LMB_RIBBON_TONES.length, sp = 2.6, width = sp * (n - 1);
  var streak = 34, period = 260;

  t.links.forEach(function(lid0, i) {
   lmbProtGroup(lid0).forEach(function(lid) {
    var lay = lmbLinkLayers[lid];
    if (!lay) return;
    var pts = lay.pts, off = lay.offset;
    if (t.sites[i] && t.sites[i] !== lay.start) { pts = pts.slice().reverse(); off = -off; }
    var base = off ? lmbRibbonPath(pts, off, 0.0001) : pts;   /* protected fibers keep their side */

    lmbFlowLayers.push(L.polyline(base, {
      color: NET_VENDORS[lmbLink(lid).vendor].color, weight: width + 12, opacity: .16, interactive: false,
      lineCap: 'round', lineJoin: 'round', className: 'lmb-halo'
    }).addTo(lmbMap));

    var vcol = NET_VENDORS[lmbLink(lid).vendor].color;
    LMB_RIBBON_TONES.forEach(function(tone, j) {
      var path = lmbRibbonPath(base, (j - (n - 1) / 2) * sp, 46);
      /* the lambda itself */
      lmbFlowLayers.push(L.polyline(path, {
        color: lmbTone(vcol, tone), weight: 1.7, opacity: idle ? .45 : .9, interactive: false,
        lineCap: 'round', lineJoin: 'round'
      }).addTo(lmbMap));
      /* light travelling on it — phases cascade across the ribbon like a wavefront */
      var p = L.polyline(path, {
        color: lmbTone(vcol, .72), weight: 2.8, opacity: idle ? .5 : 1, interactive: false,
        lineCap: 'round', lineJoin: 'round', dashArray: streak + ' ' + (period - streak), className: 'lmb-flow'
      }).addTo(lmbMap);
      var el = p.getElement();
      if (el) {
        el.style.setProperty('--o', (-(j * 9 + i * 23) % period) + 'px');
        el.style.setProperty('--p', period + 'px');
        el.style.animationDuration = (period / 95).toFixed(2) + 's';
      }
      lmbFlowLayers.push(p);
    });
   });
  });

  /* mux / demux pulse at the ends that add/drop the lambdas */
  [t.sites[0], t.sites[t.sites.length - 1]].forEach(function(sid) {
    var st = sid && lmbSite(sid);
    if (!st || st.role === 'ola') return;
    lmbFlowLayers.push(L.marker([st.lat, st.lng], {
      interactive: false, keyboard: false, zIndexOffset: -1000,
      icon: L.divIcon({ className: 'lmb-mux-wrap', iconSize: [0, 0],
                        html: '<span class="lmb-mux"></span><span class="lmb-mux lmb-mux-2"></span>' })
    }).addTo(lmbMap));
  });
}

function lmbFitRoute(route) {
  if (!lmbMap || !route || !route.length) return;
  var pts = [];
  route.forEach(function(id) {
    var l = lmbLink(id);
    if (!l) return;
    pts.push([lmbSite(l.a).lat, lmbSite(l.a).lng], [lmbSite(l.b).lat, lmbSite(l.b).lng]);
  });
  if (pts.length) lmbMap.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 12 });
}

/* ── SELECTION ── */
function lmbSelect(type, id) {
  lmbSel = { type: type, id: id };
  /* shareable address for what's selected, without piling up history entries */
  if (!routeSilent) routeReplace(type ? 'lambdas/' + type + '/' + encodeURIComponent(id) : 'lambdas');
  lmbRestyle();
  lmbRenderPanel();
  if (type === 'channel') {
    var ch = lmbGetAll().find(function(c) { return c.id === id; });
    if (ch) lmbFitRoute(ch.route);
  }
  if (type === 'link' && lmbMap) {
    var sec = lmbSection(id);
    var ab = L.latLngBounds(sec.sites.map(function(x) { return [lmbSite(x).lat, lmbSite(x).lng]; }));
    if (routeSilent || !lmbMap.getBounds().contains(ab)) lmbFitRoute(lmbExpandProt(sec.links));
  }
  if (type === 'site' && lmbMap && routeSilent) {
    var st = lmbSite(id);
    if (st) lmbMap.setView([st.lat, st.lng], 9);
  }
  var p = document.getElementById('lmb-panel');
  if (p) p.scrollTop = 0;
}

function lmbLinkClicked(id) {
  if (lmbEdit) { lmbRouteToggle(id); return; }
  if (lmbPosMode) return;
  lmbSelect('link', id);
}

/* ── SITE POSITIONS ── */
function lmbTogglePosMode() {
  lmbPosMode = !lmbPosMode;
  lmbSel = { type: null, id: null };
  document.getElementById('lmb-map').classList.toggle('lmb-posmode', lmbPosMode);
  lmbDrawAll();
  lmbRenderPanel();
}

function lmbSitePosSave(id, ll) {
  lmbSiteOverride(id, { lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) });
  lmbDrawAll();
}

function lmbSitePosReset(id) {
  lmbSiteOverride(id, { lat: null, lng: null });
  lmbDrawAll();
  lmbRenderPanel();
}

function lmbSetRole(id, role) {
  lmbSiteOverride(id, { role: role || null });
  lmbDrawAll();
  lmbRenderPanel();
}

/* ── ROUTING ── */
/* fewest-hops path between two sites: first over one vendor's spans, else across vendors
   (a lambda handed over between two DWDM systems at a shared site) */
function lmbAutoRoute(vendor, from, to) {
  return lmbBfsRoute(vendor, from, to) || lmbBfsRoute(null, from, to) || [];
}
function lmbBfsRoute(vendor, from, to) {
  if (!from || !to || from === to) return [];
  var prev = {}, seen = {}, q = [from];
  seen[from] = true;
  while (q.length) {
    var cur = q.shift();
    if (cur === to) break;
    NET_LINKS.forEach(function(l) {
      if (vendor && l.vendor !== vendor) return;
      var nxt = l.a === cur ? l.b : (l.b === cur ? l.a : null);
      if (!nxt || seen[nxt]) return;
      seen[nxt] = true;
      prev[nxt] = { site: cur, link: l.id };
      q.push(nxt);
    });
  }
  if (!seen[to]) return null;
  var route = [], s = to;
  while (s !== from) { route.unshift(prev[s].link); s = prev[s].site; }
  return route;
}

function lmbRouteToggle(linkId) {
  var l = lmbLink(linkId);
  if (!l || !lmbEdit) return;
  var i = lmbEdit.route.indexOf(linkId);
  if (i >= 0) lmbEdit.route.splice(i, 1); else lmbEdit.route.push(linkId);
  lmbRestyle();
  lmbRenderRouteList();
}

/* ── PANEL ── */
function lmbRenderPanel() {
  var p = document.getElementById('lmb-panel');
  if (!p) return;
  if (lmbEdit)                      p.innerHTML = lmbFormHtml();
  else if (lmbSel.type === 'link')    p.innerHTML = lmbLinkHtml(lmbSel.id);
  else if (lmbSel.type === 'site')    p.innerHTML = lmbSiteHtml(lmbSel.id);
  else if (lmbSel.type === 'channel') p.innerHTML = lmbChannelHtml(lmbSel.id);
  else                              p.innerHTML = lmbOverviewHtml();
  if (lmbEdit) lmbRenderRouteList();
  if (!lmbEdit && lmbSel.type === 'link') lmbOsaMount(); else lmbOsaPending = null;
  updateLmbToolCount();
}

var LMB_BACK = '<button class="lmb-back" onclick="lmbSelect(null, null)">'
  + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M5 12l7-7M5 12l7 7"/></svg>Visão geral</button>';

function lmbVendorChip(v) {
  return '<span class="lmb-vchip" style="--c:' + NET_VENDORS[v].color + '">' + NET_VENDORS[v].label + '</span>';
}
function lmbStatusChip(s) {
  var st = LMB_STATUS[s] || LMB_STATUS.ativo;
  return '<span class="lmb-schip" style="color:' + st.color + ';background:' + st.bg + '">' + st.label + '</span>';
}

function lmbChannelRow(c) {
  var vs = lmbRouteVendors(c);
  var v = vs.length > 1
    ? { color: 'linear-gradient(180deg,' + vs.map(function(x) { return NET_VENDORS[x].color; }).join(',') + ')' }
    : NET_VENDORS[vs[0] || c.vendor] || { color: '#8e8e93' };
  return '<div class="lmb-ch' + (c.status === 'inativo' ? ' off' : '') + '" data-id="' + esc(c.id) + '" onclick="lmbSelect(\'channel\', this.dataset.id)">'
    + '<span class="lmb-ch-bar" style="background:' + v.color + '"></span>'
    + '<div class="lmb-ch-main">'
    +   '<div class="lmb-ch-top"><span class="lmb-ch-freq">' + lmbFmtFreq(c.freq) + '</span>'
    +     (c.grid ? '<span class="lmb-ch-nm">' + (LMB_GRIDS[c.grid] || { label: esc(c.grid) }).label + '</span>' : '')
    +   '</div>'
    +   '<div class="lmb-ch-name">' + esc(c.name || '(sem nome)') + (c.client && (c.name || '').indexOf(c.client) !== 0 ? ' <span>· ' + esc(c.client) + '</span>' : '') + '</div>'
    +   '<div class="lmb-ch-ends">' + lmbShort(c.a || '?') + ' → ' + lmbShort(c.z || '?')
    +     (c.status && c.status !== 'ativo' ? ' · ' + LMB_STATUS[c.status].label : '') + '</div>'
    + '</div></div>';
}

function lmbOverviewHtml() {
  var all = lmbGetAll();
  /* header: totals + color key for the vendors (no vendor filter) */
  var h = '<div class="lmb-phdr"><div><div class="lmb-eyebrow">Rede DWDM</div><h3>Lambdas em uso</h3>'
    + '<div class="lmb-sub">' + NET_SITES.length + ' sites · ' + NET_LINKS.length + ' trechos · '
    + lmbActiveCount(all) + ' canais ativos</div>'
    + '<div class="lmb-sub">' + Object.keys(NET_VENDORS).map(lmbVendorChip).join(' ') + '</div></div>'
    + '<button class="btn-blue lmb-new" onclick="lmbFormOpen()">'
    + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Novo canal</button></div>';

  var roleCount = { roadm: 0, terminal: 0, ola: 0, '': 0 };
  NET_SITES.forEach(function(s) { roleCount[lmbSite(s.id).role || '']++; });
  h += '<div class="lmb-sec">Função dos sites</div><div class="lmb-legend">'
    + Object.keys(LMB_ROLES).map(function(k) {
        return '<div><span class="lmb-lg role-' + k + '"></span>' + LMB_ROLES[k].long + '<b>' + roleCount[k] + '</b></div>';
      }).join('')
    + (roleCount[''] ? '<div><span class="lmb-lg"></span>Não definido<b>' + roleCount[''] + '</b></div>' : '') + '</div>';
  if (roleCount['']) {
    h += '<div class="lmb-hint">' + roleCount[''] + ' sites ainda sem função definida — clique no site no mapa para indicar se é ROADM, Terminal ou OLA.</div>';
  }

  h += '<div class="lmb-hint">Clique em um trecho do mapa para ver os canais que passam por ele, ou em um site para ver o que termina ali.</div>';

  h += '<div class="lmb-sec">Canais cadastrados</div>'
    + '<div class="rma-search lmb-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    + '<input type="text" id="lmb-q" placeholder="Buscar cliente, serviço, frequência, site..." value="' + esc(lmbQuery) + '" oninput="lmbSearch(this.value)"/></div>'
    + '<div id="lmb-results">' + lmbResultsHtml() + '</div>';

  h += '<div class="lmb-sec">Mapa</div>'
    + '<button class="btn-sm lmb-posbtn' + (lmbPosMode ? ' on' : '') + '" onclick="lmbTogglePosMode()">'
    + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>'
    + (lmbPosMode ? 'Concluir ajuste de posições' : 'Ajustar posições dos sites') + '</button>'
    + (lmbPosMode ? '<div class="lmb-hint">Arraste os sites no mapa. Sites com borda tracejada têm localização estimada pelo código.</div>' : '');
  return h;
}

function lmbSearch(v) {
  lmbQuery = v;
  var r = document.getElementById('lmb-results');
  if (r) r.innerHTML = lmbResultsHtml();
}

function lmbResultsHtml() {
  var q = lmbQuery.trim().toLowerCase();
  var list = lmbGetAll().filter(function(c) {
    if (lmbHidden[c.vendor]) return false;
    if (!q) return true;
    return [c.name, c.client, c.freq, c.channel, c.a, c.z, c.notes,
            (NET_VENDORS[c.vendor] || {}).label].join(' ').toLowerCase().indexOf(q) >= 0;
  }).sort(function(a, b) {
    return (a.vendor || '').localeCompare(b.vendor || '') || (parseFloat(a.freq) || 0) - (parseFloat(b.freq) || 0);
  });
  if (!list.length) {
    return '<div class="lmb-empty">' + (q ? 'Nenhum canal encontrado' : 'Nenhum canal cadastrado ainda — clique em um trecho ou em “Novo canal”') + '</div>';
  }
  return list.map(lmbChannelRow).join('');
}

/* share of the C band taken by active/reserved carriers */
function lmbOccupancy(list) {
  var used = 0;
  list.forEach(function(c) { if (c.status !== 'inativo' && !isNaN(parseFloat(c.freq))) used += lmbGridWidth(c.grid); });
  return Math.round(used / (LMB_BAND.hi - LMB_BAND.lo) * 100);
}

/* OSA screen for a section; the canvas is brought to life by lmbOsaMount after the panel renders */
var lmbOsaPending = null, lmbOsaInst = null, lmbOsaBig = null;

function lmbOsaHtml(list, title) {
  lmbOsaPending = { list: list, title: title };
  return '<div class="lmb-osa-wrap">'
    + '<canvas class="lmb-osa" id="lmb-osa"></canvas>'
    + '<button class="lmb-osa-expand" onclick="lmbOsaExpand(\'osa\')" aria-label="Ampliar espectro">' + LMB_EXPAND_ICON + '</button></div>'
    + '<div class="lmb-osa-meta"><span>Banda C · <b>' + lmbOccupancy(list) + '%</b> ocupada</span>'
    + '<span>' + list.length + (list.length === 1 ? ' canal' : ' canais') + '</span>'
    + '<span class="lmb-osa-note">potências ilustrativas</span></div>';
}

function lmbOsaMount() {
  if (lmbOsaInst) { lmbOsaInst.destroy(); lmbOsaInst = null; }
  var cv = document.getElementById('lmb-osa');
  if (!cv || !lmbOsaPending || typeof OsaView === 'undefined') return;
  lmbOsaInst = OsaView(cv, lmbOsaPending.list);
}

var LMB_EXPAND_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

/* opens the segment's channels in a read-only window over the map — view: 'osa' | 'list'
   (editing happens only from "Canais neste segmento" in the side panel) */
function lmbOsaExpand(view) {
  if (!lmbOsaPending) return;
  lmbOsaClose();
  var d = lmbOsaPending;
  var m = document.createElement('div');
  m.className = 'lmb-osa-modal';
  m.innerHTML = '<div class="lmb-osa-box">'
    + '<div class="lmb-osa-hdr"><div><div class="lmb-eyebrow">Segmento \u00b7 Banda C</div><h3>' + esc(d.title) + '</h3>'
    + '<div class="lmb-sub">' + d.list.length + (d.list.length === 1 ? ' canal' : ' canais') + ' \u00b7 ' + lmbOccupancy(d.list) + '% ocupada \u00b7 pot\u00eancias ilustrativas</div></div>'
    + '<div class="lmb-osa-tools">'
    +   '<div class="lmb-osa-tabs"><button data-v="osa">OSA</button><button data-v="list">Lista</button></div>'
    +   '<button class="modal-close" onclick="lmbOsaClose()" aria-label="Fechar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
    + '</div></div>'
    + '<div class="lmb-osa-view" data-v="osa"><canvas class="lmb-osa lmb-osa-lg"></canvas></div>'
    + '<div class="lmb-osa-view" data-v="list">' + lmbSegTableHtml(d.list) + '</div>'
    + '</div>';
  m.addEventListener('click', function(e) { if (e.target === m) lmbOsaClose(); });
  m.querySelectorAll('.lmb-osa-tabs button').forEach(function(bt) {
    bt.addEventListener('click', function() { lmbSegView(m, bt.dataset.v); });
  });
  document.body.appendChild(m);
  requestAnimationFrame(function() {
    m.classList.add('open');
    lmbSegView(m, view === 'list' ? 'list' : 'osa');
  });
}

function lmbSegView(m, v) {
  m.querySelectorAll('.lmb-osa-tabs button').forEach(function(bt) { bt.classList.toggle('sel', bt.dataset.v === v); });
  m.querySelectorAll('.lmb-osa-view').forEach(function(el) { el.classList.toggle('on', el.dataset.v === v); });
  if (lmbOsaBig) { lmbOsaBig.destroy(); lmbOsaBig = null; }
  if (v === 'osa') {   /* fresh sweep every time the OSA view is shown */
    lmbOsaBig = OsaView(m.querySelector('.lmb-osa-lg'), lmbOsaPending.list, { labels: true });
  }
}

function lmbSegTableHtml(list) {
  if (!list.length) return '<div class="lmb-seg-empty">Nenhum canal cadastrado neste segmento</div>';
  return '<div class="lmb-seg-table"><div class="lmb-seg-head">'
    + '<span>Frequ\u00eancia</span><span>Grid</span><span>Cliente</span><span>Servi\u00e7o</span><span>Pontas</span><span>Status</span></div>'
    + list.map(function(c) {
        return '<div class="lmb-seg-row">'
          + '<span class="lmb-seg-f"><i style="background:' + lmbFreqColor(c.freq) + '"></i>' + lmbFmtFreq(c.freq) + '</span>'
          + '<span>' + ((LMB_GRIDS[c.grid] || {}).label || esc(c.grid || '\u2014')) + '</span>'
          + '<span class="lmb-seg-c">' + esc(c.client || '\u2014') + '</span>'
          + '<span>' + esc(c.name || '') + '</span>'
          + '<span>' + lmbShort(c.a || '?') + ' \u2192 ' + lmbShort(c.z || '?') + '</span>'
          + '<span>' + lmbStatusChip(c.status) + '</span>'
          + '</div>';
      }).join('')
    + '</div>';
}

function lmbOsaClose() {
  if (lmbOsaBig) { lmbOsaBig.destroy(); lmbOsaBig = null; }
  document.querySelectorAll('.lmb-osa-modal').forEach(function(m) { m.remove(); });
}
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') lmbOsaClose(); });

function lmbRoleIcon(siteId) {
  var r = lmbSite(siteId).role;
  return '<span class="lmb-lg' + (r ? ' role-' + r : '') + '"></span>';
}
function lmbRoleLabel(siteId) {
  var r = lmbSite(siteId).role;
  return r ? LMB_ROLES[r].label : 'não definido';
}

/* clicking a span opens its whole section: Terminal → OLAs → Terminal */
function lmbLinkHtml(id) {
  var l = lmbLink(id);
  if (!l) return lmbOverviewHtml();
  var sec  = lmbSection(id);
  var seen = {}, list = [];
  sec.links.forEach(function(lid) {
    lmbOnLink(lid).forEach(function(c) { if (!seen[c.id]) { seen[c.id] = true; list.push(c); } });
  });
  list.sort(function(a, b) { return (parseFloat(a.freq) || 0) - (parseFloat(b.freq) || 0); });
  var km = sec.links.reduce(function(t, lid) { var x = lmbLink(lid); return t == null || !x.km ? null : t + x.km; }, 0);
  var nOla = sec.sites.filter(lmbIsOla).length;

  var path = '<div class="lmb-path">';
  sec.sites.forEach(function(sid, i) {
    var ola = lmbIsOla(sid);
    path += '<button class="lmb-pnode' + (ola ? ' ola' : '') + '" onclick="lmbSelect(\'site\', \'' + sid + '\')">'
      + lmbRoleIcon(sid) + '<b>' + sid + '</b><span>' + esc(lmbSite(sid).city) + '</span><em>' + lmbRoleLabel(sid) + '</em></button>';
    if (i < sec.links.length) {
      var sl = lmbLink(sec.links[i]);
      var rk   = lmbLinkLayers[sl.id] && lmbLinkLayers[sl.id].roadKm;
      var meta = [sl.provider, sl.circuit, sl.label,
                  sl.km ? String(sl.km).replace('.', ',') + ' km' : (rk ? '~' + Math.round(rk) + ' km por rodovia' : '')]
                 .filter(Boolean).join(' · ');
      var sib  = NET_LINKS.filter(function(x) { return x.id !== sl.id && [x.a, x.b].sort().join('|') === [sl.a, sl.b].sort().join('|'); });
      if (sib.length) meta += ' · proteção: ' + sib.map(function(x) { return x.provider || x.label || 'outra rota'; }).join(', ');
      var vc = NET_VENDORS[sl.vendor].color;
      path += '<button class="lmb-pspan' + (sl.id === id ? ' cur' : '') + '" style="--c:' + vc
        + ';--ribbon:linear-gradient(90deg,' + lmbTone(vc, LMB_RIBBON_TONES[0]) + ' 0 50%,' + lmbTone(vc, LMB_RIBBON_TONES[1]) + ' 50% 100%)" '
        + 'onclick="lmbSelect(\'link\', \'' + sl.id + '\')"><span>' + esc(meta || 'trecho') + '</span></button>';
    }
  });
  path += '</div>';

  var h = LMB_BACK
    + '<div class="lmb-phdr"><div><div class="lmb-eyebrow">' + (sec.links.length > 1 ? 'Seção' : 'Trecho') + '</div><h3>' + lmbSectionName(sec) + '</h3>'
    + '<div class="lmb-sub">' + lmbVendorChip(sec.vendor) + ' '
    + sec.links.length + (sec.links.length === 1 ? ' trecho' : ' trechos')
    + (nOla ? ' · ' + nOla + ' OLA' : '') + (km ? ' · ' + (Math.round(km * 10) / 10).toString().replace('.', ',') + ' km' : '')
    + '</div></div></div>';
  if (lmbIsOla(sec.a) || lmbIsOla(sec.z)) {
    h += '<div class="lmb-warn">A seção termina em um OLA — a continuação da rota não está no mapa (print cortada?).</div>';
  }
  var provs = {};
  sec.links.forEach(function(lid) { var p = lmbLink(lid).provider; if (p && typeof NET_PROVIDERS !== 'undefined' && NET_PROVIDERS[p]) provs[p] = NET_PROVIDERS[p]; });
  Object.keys(provs).forEach(function(p) {
    h += '<div class="lmb-noc"><b>Acionamento \u2014 ' + esc(p) + '</b>' + esc(provs[p].note)
      + (provs[p].email ? '<a href="mailto:' + esc(provs[p].email) + '">' + esc(provs[p].email) + '</a>' : '') + '</div>';
  });
  h += '<div class="lmb-sec">Rota</div>' + path
    + '<div class="lmb-sec">Espectro</div>' + lmbOsaHtml(list, lmbSectionName(sec))
    + '<div class="lmb-sec">Canais neste segmento <span class="lmb-cnt">' + list.length + '</span>'
    +   (list.length ? '<button class="lmb-sec-expand" onclick="lmbOsaExpand(\'list\')" aria-label="Ampliar lista">' + LMB_EXPAND_ICON + 'Ampliar</button>' : '')
    + '</div>'
    + (list.length ? list.map(lmbChannelRow).join('') : '<div class="lmb-empty">Nenhum canal cadastrado passando por aqui</div>')
    + '<button class="btn-blue lmb-wide" onclick="lmbFormOpen(null, \'' + id + '\')">'
    + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
    + 'Novo canal ' + lmbShort(sec.a) + ' ↔ ' + lmbShort(sec.z) + '</button>';
  return h;
}

function lmbSiteHtml(id) {
  var s = lmbSite(id);
  if (!s) return lmbOverviewHtml();
  var links = NET_LINKS.filter(function(l) { return l.a === id || l.b === id; });
  var linkIds = links.map(function(l) { return l.id; });
  var term = lmbGetAll().filter(function(c) { return c.a === id || c.z === id; });
  var pass = lmbGetAll().filter(function(c) {
    return c.a !== id && c.z !== id && (c.route || []).some(function(r) { return linkIds.indexOf(r) >= 0; });
  });

  var h = LMB_BACK
    + '<div class="lmb-phdr"><div><div class="lmb-eyebrow">Site</div><h3>' + s.id + '</h3>'
    + '<div class="lmb-sub">' + esc(s.city) + ' / ' + s.uf + ' ' + lmbSiteVendors(id).map(lmbVendorChip).join(' ') + '</div></div></div>';
  if (s.approx && !s.moved) {
    h += '<div class="lmb-warn">Localização estimada pelo código do site. Use “Ajustar posições” na visão geral para arrastar para o lugar certo.</div>';
  }
  if (s.moved) {
    h += '<div class="lmb-hint">Posição ajustada manualmente. <a href="#" onclick="lmbSitePosReset(\'' + id + '\');return false;">Restaurar original</a></div>';
  }
  if (s.addr) h += '<div class="lmb-addr">' + esc(s.addr) + '</div>';

  h += '<div class="lmb-sec">Função do site</div><div class="rma-seg lmb-roleseg">'
    + Object.keys(LMB_ROLES).map(function(k) {
        return '<button class="' + (s.role === k ? 'sel' : '') + '" onclick="lmbSetRole(\'' + id + '\', \'' + k + '\')">'
          + '<span class="lmb-lg role-' + k + '"></span>' + LMB_ROLES[k].label + '</button>';
      }).join('')
    + '<button class="' + (!s.role ? 'sel' : '') + '" onclick="lmbSetRole(\'' + id + '\', null)">Não definido</button></div>';
  if (s.role === 'ola' && term.length) {
    h += '<div class="lmb-warn" style="margin-top:10px;">Este site está marcado como OLA (amplificação), mas ' + term.length
      + (term.length === 1 ? ' canal termina' : ' canais terminam') + ' aqui. Confira a ponta A/Z desses canais.</div>';
  }

  h += '<div class="lmb-sec">Trechos</div><div class="lmb-links">';
  links.forEach(function(l) {
    var other = l.a === id ? l.b : l.a;
    var n = lmbActiveCount(lmbOnLink(l.id));
    h += '<button class="lmb-lrow" onclick="lmbSelect(\'link\', \'' + l.id + '\')">'
      + '<span class="lmb-vsw" style="background:' + NET_VENDORS[l.vendor].color + '"></span>'
      + '<span class="lmb-lname">→ ' + other + (l.provider ? ' <em>' + esc(l.provider) + '</em>' : '') + (l.circuit ? ' <em>' + esc(l.circuit) + '</em>' : '') + (l.label ? ' <em>' + esc(l.label) + '</em>' : '') + '</span>'
      + '<span class="lmb-vmeta">' + n + (n === 1 ? ' canal' : ' canais') + '</span></button>';
  });
  h += '</div>';
  h += '<div class="lmb-sec">Terminam aqui <span class="lmb-cnt">' + term.length + '</span></div>'
    + (term.length ? term.map(lmbChannelRow).join('') : '<div class="lmb-empty">Nenhum canal com ponta neste site</div>');
  h += '<div class="lmb-sec">Passam por aqui <span class="lmb-cnt">' + pass.length + '</span></div>'
    + (pass.length ? pass.map(lmbChannelRow).join('') : '<div class="lmb-empty">Nenhum canal em trânsito</div>');
  return h;
}

function lmbChannelHtml(id) {
  var c = lmbGetAll().find(function(x) { return x.id === id; });
  if (!c) return lmbOverviewHtml();
  var f = function(k, v) { return '<div class="lmb-kv"><span>' + k + '</span><b>' + v + '</b></div>'; };
  var h = LMB_BACK
    + '<div class="lmb-phdr"><div><div class="lmb-eyebrow">Canal</div><h3>' + esc(c.name || '(sem nome)') + '</h3>'
    + '<div class="lmb-sub">' + lmbRouteVendors(c).map(lmbVendorChip).join(' ') + ' ' + lmbStatusChip(c.status) + '</div></div></div>'
    + '<div class="lmb-kvs">'
    + f('Cliente / quem usa', esc(c.client || '—'))
    + f('Frequência', lmbFmtFreq(c.freq))
    + f('Grid', (LMB_GRIDS[c.grid] || { label: esc(c.grid || '—') }).label)
    + f('Canal', esc(c.channel || '—'))
    + f('Ponta A', '<a href="#" onclick="lmbSelect(\'site\', \'' + esc(c.a) + '\');return false;">' + esc(c.a || '—') + '</a>')
    + f('Ponta Z', '<a href="#" onclick="lmbSelect(\'site\', \'' + esc(c.z) + '\');return false;">' + esc(c.z || '—') + '</a>')
    + '</div>';
  if (c.notes) h += '<div class="lmb-sec">Observações</div><div class="lmb-notes">' + esc(c.notes) + '</div>';
  var hops = lmbRouteSites(c.route, c.a);
  if (hops && hops.length > 1) {
    h += '<div class="lmb-sec">Caminho</div><div class="lmb-hops">' + hops.map(function(sid) {
      return '<span class="' + (lmbIsOla(sid) ? 'ola' : '') + '">' + lmbRoleIcon(sid) + lmbShort(sid) + '</span>';
    }).join('<i>\u203a</i>') + '</div>';
  } else if ((c.route || []).length) {
    h += '<div class="lmb-warn" style="margin-top:14px;">A rota cadastrada não forma um caminho contínuo a partir da ponta A. Edite o canal para corrigir.</div>';
  }
  h += '<div class="lmb-sec">Trechos <span class="lmb-cnt">' + (c.route || []).length + '</span></div><div class="lmb-links">';
  (c.route || []).forEach(function(rid) {
    var l = lmbLink(rid);
    if (!l) return;
    h += '<button class="lmb-lrow" onclick="lmbSelect(\'link\', \'' + l.id + '\')">'
      + '<span class="lmb-vsw" style="background:' + NET_VENDORS[l.vendor].color + '"></span>'
      + '<span class="lmb-lname">' + lmbLinkName(l) + (l.provider ? ' <em>' + esc(l.provider) + '</em>' : '')
      + lmbProtGroup(l.id).filter(function(x) { return x !== l.id; }).map(function(x) {
          var p = lmbLink(x); return ' <em>+ ' + esc(p.provider || p.label || 'proteção') + ' (proteção)</em>';
        }).join('') + '</span></button>';
  });
  h += '</div><div class="lmb-actions">'
    + '<button class="note-act rma-act-edit" data-id="' + esc(c.id) + '" onclick="lmbFormOpen(this.dataset.id)">Editar</button>'
    + '<button class="note-act note-act-del" data-id="' + esc(c.id) + '" onclick="lmbDelete(this.dataset.id)">Excluir</button>'
    + '</div>';
  if (c.updatedAt) h += '<div class="lmb-hint">Atualizado em ' + new Date(c.updatedAt).toLocaleString('pt-BR') + '</div>';
  return h;
}

/* ── CHANNEL FORM ── */
function lmbFormOpen(id, fromLink) {
  var c = id ? lmbGetAll().find(function(x) { return x.id === id; }) : null;
  var sec = fromLink && lmbLink(fromLink) ? lmbSection(fromLink) : null;
  var vendor = c ? c.vendor : (sec ? sec.vendor : Object.keys(NET_VENDORS)[0]);
  lmbEdit = {
    id: c ? c.id : null,
    vendor: vendor,
    route: c ? (c.route || []).slice() : (sec ? sec.links.slice() : []),
    data: c || { status: 'ativo', grid: '75',
                 a: sec && !lmbIsOla(sec.a) ? sec.a : '', z: sec && !lmbIsOla(sec.z) ? sec.z : '' }
  };
  if (lmbPosMode) { lmbPosMode = false; document.getElementById('lmb-map').classList.remove('lmb-posmode'); lmbDrawAll(); }
  lmbRestyle();
  lmbRenderPanel();
  lmbFitRoute(lmbEdit.route);
  var p = document.getElementById('lmb-panel');
  if (p) p.scrollTop = 0;
}

function lmbFormCancel() {
  var back = lmbEdit && lmbEdit.id ? { type: 'channel', id: lmbEdit.id } : lmbSel;
  lmbEdit = null;
  lmbSel = back;
  lmbRestyle();
  lmbRenderPanel();
}

/* channel ends: only Terminal / ROADM sites — OLAs only amplify (a saved end is kept so edits don't lose it) */
function lmbSiteOptions(vendor, sel) {
  var sites = NET_SITES.filter(function(s) { return lmbSiteVendors(s.id).indexOf(vendor) >= 0; })
    .map(function(s) { return lmbSite(s.id); })
    .sort(function(a, b) { return a.id.localeCompare(b.id); });
  var group = function(label, list, disabled) {
    if (!list.length) return '';
    return '<optgroup label="' + label + '">' + list.map(function(s) {
      return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + (disabled && s.id !== sel ? ' disabled' : '') + '>'
        + s.id + ' — ' + esc(s.city) + '</option>';
    }).join('') + '</optgroup>';
  };
  return '<option value="">Selecione</option>'
    + group('Terminal', sites.filter(function(s) { return s.role === 'terminal'; }))
    + group('ROADM', sites.filter(function(s) { return s.role === 'roadm'; }))
    + group('Ponta atual (n\u00e3o \u00e9 Terminal/ROADM)', sites.filter(function(s) {
        return s.id === sel && s.role !== 'terminal' && s.role !== 'roadm';
      }))
    + group('Outros fabricantes (rota entre redes)', NET_SITES.map(function(s) { return lmbSite(s.id); }).filter(function(s) {
        return (s.role === 'terminal' || s.role === 'roadm') && lmbSiteVendors(s.id).indexOf(vendor) < 0;
      }).sort(function(a, b) { return a.id.localeCompare(b.id); }));
}

function lmbFormHtml() {
  var d = lmbEdit.data;
  var opt = function(obj, sel) {
    return Object.keys(obj).map(function(k) {
      return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + (obj[k].label || k) + '</option>';
    }).join('');
  };
  var f = parseFloat(d.freq);
  return '<div class="lmb-phdr"><div><div class="lmb-eyebrow">' + (lmbEdit.id ? 'Editar canal' : 'Novo canal') + '</div><h3>' + (lmbEdit.id ? esc(d.name || 'Canal') : 'Cadastrar lambda') + '</h3></div>'
    + '<button class="modal-close" onclick="lmbFormCancel()" aria-label="Fechar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
    + '<div class="lmb-form">'
    + '<div class="field"><label>Serviço / identificação <span class="req">*</span></label><input type="text" id="lf-name" value="' + esc(d.name || '') + '" placeholder="ex: 100G Amazon Leo SLZ x CPV"/></div>'
    + '<div class="field"><label>Cliente / quem usa</label><input type="text" id="lf-client" value="' + esc(d.client || '') + '" placeholder="ex: Amazon Leo"/></div>'
    + '<div class="g2">'
    +   '<div class="field"><label>Fabricante</label><select id="lf-vendor" onchange="lmbFormVendor(this.value)">' + opt(NET_VENDORS, lmbEdit.vendor) + '</select></div>'
    +   '<div class="field"><label>Status</label><select id="lf-status">' + opt(LMB_STATUS, d.status || 'ativo') + '</select></div>'
    +   '<div class="field"><label>Frequência (THz) <span class="req">*</span></label><input type="text" inputmode="decimal" id="lf-freq" value="' + (isNaN(f) ? '' : f) + '" placeholder="193.100" oninput="lmbFreqInput()"/></div>'
    +   '<div class="field"><label>Grid</label><select id="lf-grid" onchange="lmbAutoChannel()">' + opt(LMB_GRIDS, LMB_GRIDS[d.grid] ? d.grid : '75') + '</select></div>'
    +   '<div class="field gcol2"><label>Canal</label><input type="text" id="lf-channel" value="' + esc(d.channel || '') + '" placeholder="opcional \u2014 ex: C31 ou n\u00ba do canal no NMS" oninput="this.dataset.manual=1"' + (d.channel ? ' data-manual="1"' : '') + '/></div>'
    +   '<div class="field"><label>Ponta A <span class="req">*</span></label><select id="lf-a" onchange="lmbFormEnds()">' + lmbSiteOptions(lmbEdit.vendor, d.a) + '</select></div>'
    +   '<div class="field"><label>Ponta Z <span class="req">*</span></label><select id="lf-z" onchange="lmbFormEnds()">' + lmbSiteOptions(lmbEdit.vendor, d.z) + '</select></div>'
    + '</div>'
    + '<div class="field"><label>Rota</label>'
    +   '<div class="lmb-route" id="lf-route"></div>'
    +   '<div class="lmb-hint" style="margin-top:6px;">Clique nos trechos do mapa para adicionar ou remover da rota. <a href="#" onclick="lmbFormEnds(true);return false;">Recalcular rota automática</a></div>'
    + '</div>'
    + '<div class="field"><label>Observações</label><textarea id="lf-notes" rows="2" placeholder="Transponder / porta, OCh, circuito do cliente...">' + esc(d.notes || '') + '</textarea></div>'
    + '<div class="lmb-form-actions"><button class="btn-sm" onclick="lmbFormCancel()">Cancelar</button><button class="btn-blue" onclick="lmbFormSave()">Salvar canal</button></div>'
    + '</div>';
}

function lmbRenderRouteList() {
  var el = document.getElementById('lf-route');
  if (!el || !lmbEdit) return;
  if (!lmbEdit.route.length) {
    el.innerHTML = '<div class="lmb-empty">Selecione as pontas A e Z ou clique nos trechos no mapa</div>';
    return;
  }
  el.innerHTML = lmbEdit.route.map(function(id) {
    var l = lmbLink(id);
    if (!l) return '';
    return '<span class="lmb-rchip">' + lmbLinkName(l) + (l.provider ? ' <em>' + esc(l.provider) + '</em>' : '')
      + '<button onclick="lmbRouteToggle(\'' + id + '\')" aria-label="Remover">×</button></span>';
  }).join('');
}

/* snapshot the form so re-rendering (vendor change) keeps what was typed */
function lmbFormRead() {
  var g = function(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
  return {
    name: g('lf-name'), client: g('lf-client'), status: g('lf-status'),
    freq: g('lf-freq').replace(',', '.'), grid: g('lf-grid'), channel: g('lf-channel'),
    a: g('lf-a'), z: g('lf-z'), notes: g('lf-notes')
  };
}

function lmbFormVendor(v) {
  var d = lmbFormRead();
  d.a = ''; d.z = '';
  lmbEdit.vendor = v;
  lmbEdit.route = [];
  lmbEdit.data = Object.assign({}, lmbEdit.data, d);
  lmbRestyle();
  lmbRenderPanel();
}

function lmbFormEnds(force) {
  var a = document.getElementById('lf-a').value, z = document.getElementById('lf-z').value;
  if (!a || !z) return;
  var r = lmbAutoRoute(lmbEdit.vendor, a, z);
  if (!r.length && a !== z) {
    alert('Não há caminho entre ' + a + ' e ' + z + ' na rede. Monte a rota clicando nos trechos.');
    return;
  }
  lmbEdit.route = r;
  lmbRestyle();
  lmbRenderRouteList();
  if (force !== false) lmbFitRoute(r);
}

function lmbFreqInput() { lmbAutoChannel(); }
/* ITU-T G.694.1 channel number, only meaningful on the fixed 100 GHz grid: 193.1 THz = C31 */
function lmbAutoChannel() {
  var el = document.getElementById('lf-channel');
  if (!el || el.dataset.manual) return;
  var f = parseFloat(document.getElementById('lf-freq').value.replace(',', '.'));
  var g = document.getElementById('lf-grid').value;
  if (!(f > 0) || g !== '100') { el.value = ''; return; }
  el.value = 'C' + Math.round((f - 190) * 10);
}

function lmbShake(id) {
  var el = document.getElementById(id);
  el.classList.add('shake');
  el.style.borderColor = '#dc2626';
  setTimeout(function() { el.classList.remove('shake'); el.style.borderColor = ''; }, 500);
  el.focus();
}

function lmbFormSave() {
  var d = lmbFormRead();
  var f = parseFloat(d.freq);
  if (!d.name) { lmbShake('lf-name'); return; }
  if (!(f > 180 && f < 200)) { lmbShake('lf-freq'); return; }
  if (!d.a) { lmbShake('lf-a'); return; }
  if (!d.z) { lmbShake('lf-z'); return; }
  if (!lmbEdit.route.length && !confirm('O canal está sem rota (nenhum trecho selecionado). Salvar assim mesmo?')) return;

  /* same frequency already lit on any span of this route? */
  var w = lmbGridWidth(d.grid);
  var clash = lmbGetAll().filter(function(c) {
    if (c.id === lmbEdit.id || c.status === 'inativo' || d.status === 'inativo') return false;
    var cw = lmbGridWidth(c.grid);
    if (Math.abs(parseFloat(c.freq) - f) >= (w + cw) / 2 - 1e-6) return false;
    var mine = lmbExpandProt(lmbEdit.route);
    return lmbExpandProt(c.route).some(function(r) { return mine.indexOf(r) >= 0; });
  });
  if (clash.length && !confirm('Conflito de espectro: ' + clash.map(function(c) {
      return (c.name || '?') + ' (' + lmbFmtFreq(c.freq) + ')';
    }).join(', ') + ' já usa essa frequência em trecho(s) da rota.\n\nSalvar mesmo assim?')) return;

  var now = new Date().toISOString();
  var rec = Object.assign({}, d, {
    freq: f.toFixed(6).replace(/0+$/, '').replace(/\.$/, ''),
    vendor: lmbEdit.vendor,
    route: lmbEdit.route.slice(),
    updatedAt: now
  });
  var all = lmbGetAll().slice();
  if (lmbEdit.id) {
    var i = all.findIndex(function(c) { return c.id === lmbEdit.id; });
    rec.id = lmbEdit.id;
    rec.createdAt = all[i] ? all[i].createdAt : now;
    if (i >= 0) all[i] = rec; else all.unshift(rec);
  } else {
    rec.id = String(Date.now());
    rec.createdAt = now;
    all.unshift(rec);
  }
  lmbSave(all);
  lmbEdit = null;
  lmbSelect('channel', rec.id);
}

function lmbDelete(id) {
  var c = lmbGetAll().find(function(x) { return x.id === id; });
  if (!c) return;
  if (!confirm('Excluir o canal “' + (c.name || '') + '” (' + lmbFmtFreq(c.freq) + ')?')) return;
  lmbSave(lmbGetAll().filter(function(x) { return x.id !== id; }));
  lmbSelect(null, null);
}

/* ── HOME COUNTER + POLLING REFRESH ── */
function updateLmbToolCount() {
  var el = document.getElementById('lmb-tool-count');
  if (!el) return;
  var n = lmbActiveCount(lmbGetAll());
  el.textContent = n + (n === 1 ? ' canal' : ' canais');
  el.classList.toggle('visible', n > 0);
}

function lmbExternalRefresh() {
  updateLmbToolCount();
  var pg = document.getElementById('pg-lambdas');
  if (!pg || !pg.classList.contains('active') || !lmbMap) return;
  lmbDrawAll();
  if (lmbEdit) return;   /* don't wipe a form being filled */
  var a = document.activeElement;
  if (a && a.id === 'lmb-q') { lmbSearch(a.value); return; }
  lmbRenderPanel();
}
