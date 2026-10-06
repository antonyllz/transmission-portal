/* ═══════════════════════════════
   AMAZON LEO — client network status page
   Data: GET /api/leo/status (sanitized server side: circuits, event type,
   start / end only). Refreshes every 15 s. Times are shown in UTC.
   ═══════════════════════════════ */
(function() {
  'use strict';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SITES = {
    SLZ501: { name: 'SLZ501', place: 'Ocara, CE',   lat: -4.428036, lng: -38.401117 },
    CPV501: { name: 'CPV501', place: 'Sanharó, PE', lat: -8.369604, lng: -36.592515 }
  };
  var POPS = {
    RJ2: { name: 'Equinix RJ2', place: 'Rio de Janeiro, RJ', lat: -22.8733, lng: -43.2754, side: 'right' },
    SP4: { name: 'Equinix SP4', place: 'Barueri, SP',        lat: -23.4967, lng: -46.8299, side: 'left' }
  };
  var CIRCUITS = [
    { id: 'RJOOCR964161',    site: 'SLZ501', pop: 'RJ2', bend: .1 },
    { id: 'SPOOCR964174',    site: 'SLZ501', pop: 'RJ2', bend: .2 },
    { id: '21-90090-252671', site: 'CPV501', pop: 'SP4', bend: -.16 },
    { id: '21-90090-252668', site: 'CPV501', pop: 'RJ2', bend: -.04 }
  ];
  var ST = {
    up:     { label: 'Operational', color: '#0ca30c', glow: 'rgba(12,163,12,.55)' },
    warn:   { label: 'Degraded',    color: '#fab219', glow: 'rgba(250,178,25,.55)' },
    down:   { label: 'Outage',      color: '#d03b3b', glow: 'rgba(208,59,59,.6)' },
    nodata: { label: 'Awaiting data', color: '#6b7a99', glow: 'rgba(107,122,153,.4)' }
  };
  var ICON = {
    up:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    nodata: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  var data = { events: [], monitoringSince: null }, loaded = false, siteFilter = '';
  var $ = function(id) { return document.getElementById(id); };
  var esc = function(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ── time helpers (UTC) ── */
  function pad(n) { return String(n).padStart(2, '0'); }
  function utc(iso, withDate) {
    var d = new Date(iso);
    var t = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
    if (!withDate) return t;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) + ' ' + t;
  }
  function dur(a, b) {
    var s = Math.max(0, ((b ? new Date(b) : new Date()) - new Date(a)) / 1000);
    if (s < 60) return Math.round(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + pad(Math.floor(s % 60)) + 's';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + pad(Math.floor(s / 60) % 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.floor(s / 3600) % 24 + 'h';
  }

  /* ── state ── */
  function circuitState(c) {
    if (!data.monitoringSince) return { st: 'nodata', active: null };
    var act = data.events.filter(function(e) { return e.circuit === c.id && e.status === 'ongoing'; })
      .sort(function(a, b) { return (a.type === 'outage' ? 0 : 1) - (b.type === 'outage' ? 0 : 1); })[0];
    return { st: !act ? 'up' : act.type === 'outage' ? 'down' : 'warn', active: act || null };
  }
  function siteState(sid) {
    var cs = CIRCUITS.filter(function(c) { return c.site === sid; }).map(circuitState);
    if (!data.monitoringSince) return 'nodata';
    var down = cs.filter(function(s) { return s.st === 'down'; }).length;
    if (down === cs.length) return 'down';
    if (down || cs.some(function(s) { return s.st === 'warn'; })) return 'warn';
    return 'up';
  }

  /* availability over the last 30 days, counted only since monitoring started */
  function availability(cid, days) {
    var end = Date.now(), start = end - days * 86400000;
    var from = Math.max(start, data.monitoringSince ? new Date(data.monitoringSince).getTime() : end);
    if (from >= end) return null;
    var ivs = data.events.filter(function(e) { return e.circuit === cid && e.type === 'outage'; }).map(function(e) {
      return [Math.max(from, new Date(e.start).getTime()), Math.min(end, e.end ? new Date(e.end).getTime() : end)];
    }).filter(function(iv) { return iv[1] > iv[0]; }).sort(function(a, b) { return a[0] - b[0]; });
    var down = 0, cur = null;
    ivs.forEach(function(iv) {
      if (!cur || iv[0] > cur[1]) { if (cur) down += cur[1] - cur[0]; cur = iv.slice(); }
      else cur[1] = Math.max(cur[1], iv[1]);
    });
    if (cur) down += cur[1] - cur[0];
    return 1 - down / (end - from);
  }

  /* per-day cells for the availability strip */
  function dayCells(cid, days) {
    var out = [], since = data.monitoringSince ? new Date(data.monitoringSince).getTime() : Infinity;
    var today = new Date(); today.setUTCHours(0, 0, 0, 0);
    for (var i = days - 1; i >= 0; i--) {
      var d0 = today.getTime() - i * 86400000, d1 = d0 + 86400000;
      if (d1 <= since) { out.push({ d: d0, st: 'none' }); continue; }
      var outMin = 0, degr = 0;
      data.events.forEach(function(e) {
        if (e.circuit !== cid) return;
        var s = Math.max(d0, new Date(e.start).getTime()), en = Math.min(d1, e.end ? new Date(e.end).getTime() : Date.now());
        if (en <= s) return;
        if (e.type === 'outage') outMin += (en - s) / 60000; else degr++;
      });
      out.push({ d: d0, st: outMin >= 30 ? 'down' : outMin > 0 ? 'minor' : degr ? 'warn' : 'up', min: Math.round(outMin), degr: degr });
    }
    return out;
  }

  /* ── render ── */
  function render() {
    var sids = Object.keys(SITES).filter(function(s) { return !siteFilter || s === siteFilter; });
    var cs = CIRCUITS.filter(function(c) { return sids.indexOf(c.site) >= 0; });
    var states = cs.map(circuitState);

    /* overall */
    var sitesDownN = sids.filter(function(s) { return siteState(s) === 'down'; }).length;
    var worst = !data.monitoringSince ? 'nodata' : sitesDownN ? 'down' : states.some(function(s) { return s.st !== 'up'; }) ? 'warn' : 'up';
    var nUp = states.filter(function(s) { return s.st === 'up'; }).length;
    var title = {
      nodata: 'Awaiting monitoring data',
      up: siteFilter ? 'Site fully operational' : 'All systems operational',
      warn: states.some(function(s) { return s.st === 'down'; }) ? 'Running on redundancy' : 'Degraded performance',
      down: sitesDownN === sids.length ? 'Service outage' : 'Partial outage'
    }[worst];
    var sub = {
      nodata: 'The live feed will appear as soon as the first monitoring event arrives',
      up: cs.length + ' of ' + cs.length + ' circuits up · monitored 24/7',
      warn: (states.some(function(s) { return s.st === 'down'; }) ? 'Service maintained through the redundant circuit · ' : '') + nUp + ' of ' + cs.length + ' circuits fully operational',
      down: nUp + ' of ' + cs.length + ' circuits up · our NOC is working on it'
    }[worst];
    var ov = $('overall');
    ov.className = 'overall ' + worst;
    ov.querySelector('.ov-ring span').innerHTML = ICON[worst];
    $('ov-title').textContent = title;
    $('ov-sub').textContent = sub;

    /* KPIs */
    var av = cs.map(function(c) { return availability(c.id, 30); }).filter(function(x) { return x != null; });
    var avg = av.length ? av.reduce(function(s, x) { return s + x; }, 0) / av.length : null;
    var active = data.events.filter(function(e) { return e.status === 'ongoing' && sids.indexOf(e.site) >= 0; }).length;
    var last = data.events.filter(function(e) { return sids.indexOf(e.site) >= 0; }).sort(function(a, b) { return String(b.start).localeCompare(String(a.start)); })[0];
    $('kpis').innerHTML =
        kpi(data.monitoringSince ? nUp + '<small>/' + cs.length + '</small>' : '—', 'Circuits operational')
      + kpi(avg == null ? '—' : fmtPct(avg), 'Availability · 30 days')
      + kpi(String(active), active === 1 ? 'Active event' : 'Active events')
      + kpi(last ? '<span data-ago="' + (last.end || last.start) + '">' + ago(last.end || last.start) + '</span>' : '—', 'Last event');

    /* sites */
    $('sites').className = 'sites' + (sids.length === 1 ? ' one' : '');
    $('sites').innerHTML = sids.map(function(sid) {
      var s = SITES[sid], st = siteState(sid);
      var msg = { nodata: 'Awaiting data', up: 'All circuits operational', warn: 'Running on redundancy', down: 'Site outage' }[st];
      if (st === 'warn' && !CIRCUITS.some(function(c) { return c.site === sid && circuitState(c).st === 'down'; })) msg = 'Degraded performance';
      return '<article class="site ' + st + '">'
        + '<header><div><div class="site-id">' + sid + '</div><div class="site-place">' + esc(s.place) + ' · ' + s.lat.toFixed(4) + ', ' + s.lng.toFixed(4) + '</div></div>'
        +   '<span class="pill ' + st + '">' + ICON[st] + msg + '</span></header>'
        + '<div class="circuits">' + CIRCUITS.filter(function(c) { return c.site === sid; }).map(circuitCard).join('') + '</div>'
        + '</article>';
    }).join('');
    $('sites-note').textContent = data.monitoringSince ? 'Monitoring since ' + utc(data.monitoringSince, true) + ' UTC' : '';

    renderEvents(sids);
    $('updated').textContent = loaded ? 'Updated ' + utc(new Date().toISOString()) + ' UTC · refreshes every 15 s' : '—';
  }

  function kpi(v, l) { return '<div class="kpi"><b>' + v + '</b><span>' + l + '</span></div>'; }
  function fmtPct(x) { return (Math.floor(x * 10000) / 100).toFixed(2) + '%'; }
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  function circuitCard(c) {
    var s = circuitState(c), p = POPS[c.pop], av = availability(c.id, 30);
    var cells = dayCells(c.id, 30);
    var state = s.active
      ? '<div class="c-active">' + (s.active.type === 'outage' ? 'Outage' : 'Degradation') + ' since ' + utc(s.active.start, true) + ' UTC · <b data-dur="' + s.active.start + '">' + dur(s.active.start) + '</b></div>'
      : '';
    return '<div class="circuit ' + s.st + '">'
      + '<div class="c-top"><span class="beacon"><i></i></span><span class="c-st">' + ICON[s.st] + ST[s.st].label + '</span>'
      +   '<span class="c-av">' + (av == null ? '' : fmtPct(av) + '<em>30d</em>') + '</span></div>'
      + '<div class="c-id">' + esc(c.id) + '</div>'
      + '<div class="c-path"><span>' + c.site + '</span><span class="c-line"><i></i></span><span>' + p.name + '</span></div>'
      + '<div class="c-pop">' + esc(p.place) + '</div>'
      + state
      + '<div class="strip" aria-label="Daily availability, last 30 days">' + cells.map(function(x) {
          return '<i class="' + x.st + '" data-tip="' + esc(stripTip(x)) + '"></i>';
        }).join('') + '</div>'
      + '<div class="strip-axis"><span>30 days ago</span><span>Today</span></div>'
      + '</div>';
  }
  function stripTip(x) {
    var d = new Date(x.d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    if (x.st === 'none') return d + ' — not monitored yet';
    if (x.st === 'up') return d + ' — no incidents';
    if (x.st === 'warn') return d + ' — ' + x.degr + ' degradation event' + (x.degr > 1 ? 's' : '');
    return d + ' — ' + x.min + ' min of outage';
  }

  function renderEvents(sids) {
    var list = data.events.filter(function(e) { return sids.indexOf(e.site) >= 0; })
      .sort(function(a, b) { return (a.status === 'ongoing' ? 0 : 1) - (b.status === 'ongoing' ? 0 : 1) || String(b.start).localeCompare(String(a.start)); });
    if (!list.length) {
      $('events').innerHTML = '<div class="empty"><div class="empty-ic">' + ICON.up + '</div><b>No events recorded</b><span>'
        + (data.monitoringSince ? 'Every circuit has been running without interruptions.' : 'Events will be listed here as soon as monitoring data arrives.') + '</span></div>';
      return;
    }
    $('events').innerHTML = list.slice(0, 100).map(function(e) {
      var c = CIRCUITS.filter(function(x) { return x.id === e.circuit; })[0], p = c ? POPS[c.pop] : { name: '' };
      var on = e.status === 'ongoing', kind = e.type === 'outage' ? 'down' : 'warn';
      return '<div class="ev ' + (on ? 'on ' : '') + kind + '">'
        + '<span class="ev-dot"></span>'
        + '<div class="ev-main"><div class="ev-title">' + (e.type === 'outage' ? 'Service interruption' : 'Performance degradation')
        +   '<span class="ev-tag ' + (on ? 'ongoing' : 'resolved') + '">' + (on ? 'Ongoing' : 'Resolved') + '</span></div>'
        +   '<div class="ev-meta"><b>' + esc(e.circuit) + '</b> · ' + esc(e.site) + ' → ' + esc(p.name) + '</div></div>'
        + '<div class="ev-time"><span>' + utc(e.start, true) + ' UTC</span>'
        +   '<em>' + (on ? 'for <b data-dur="' + e.start + '">' + dur(e.start) + '</b>' : 'lasted ' + dur(e.start, e.end)) + '</em></div>'
        + '</div>';
    }).join('');
  }

  /* ── MAP: dot-matrix land, glowing arcs per circuit, light running along them ── */
  var cv = $('map'), ctx = cv.getContext('2d'), W = 0, H = 0, dpr = 1, proj = null, t0 = performance.now(), hoverC = null;
  var B = window.LEO_BOUNDS || { w: -50.5, e: -33.2, s: -25.6, n: -1.6 };
  var DOTS = window.LEO_DOTS || [], DOTC = [];

  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var k = Math.cos(((B.n + B.s) / 2) * Math.PI / 180);
    var gw = (B.e - B.w) * k, gh = B.n - B.s, sc = Math.min(W / gw, H / gh) * .96;
    var ox = (W - gw * sc) / 2, oy = (H - gh * sc) / 2;
    proj = function(lng, lat) { return [ox + (lng - B.w) * k * sc, oy + (B.n - lat) * sc]; };
    /* dot cache: screen position + base brightness (Brazil brighter, glow near sites and PoPs) */
    var near = Object.keys(SITES).map(function(n) { return proj(SITES[n].lng, SITES[n].lat); })
      .concat(Object.keys(POPS).map(function(n) { return proj(POPS[n].lng, POPS[n].lat); }));
    DOTC = DOTS.map(function(d) {
      var p = proj(d[0], d[1]), m = 1e9;
      near.forEach(function(q) { m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); });
      return [p[0], p[1], (d[2] ? .26 : .1) + Math.max(0, .35 - m / 220), d[2]];
    });
  }

  function arcPts(c) {
    var s = SITES[c.site], p = POPS[c.pop], a = proj(s.lng, s.lat), b = proj(p.lng, p.lat);
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    var cx = mx + dy * c.bend, cy = my - dx * c.bend, pts = [];
    for (var i = 0; i <= 60; i++) { var t = i / 60, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]); }
    return pts;
  }

  function draw(now) {
    var t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    if (!proj) return;
    var focus = siteFilter ? SITES[siteFilter] : null, fp = focus ? proj(focus.lng, focus.lat) : null;

    /* land dots — brighter near the sites, a slow scan line sweeping south */
    var scan = (t * 60) % (H + 200) - 100;
    for (var i = 0; i < DOTC.length; i++) {
      var d = DOTC[i], a = d[2];
      if (!REDUCED) a += Math.max(0, .25 - Math.abs(d[1] - scan) / 60) * (d[3] ? 1 : .4);
      ctx.fillStyle = 'rgba(120,170,255,' + Math.min(.8, a).toFixed(3) + ')';
      ctx.fillRect(d[0] - .9, d[1] - .9, 1.8, 1.8);
    }

    /* circuits */
    CIRCUITS.forEach(function(c) {
      var s = circuitState(c), col = ST[s.st], pts = arcPts(c);
      var dim = siteFilter && c.site !== siteFilter ? .18 : 1;
      var hl = hoverC === c.id ? 1.6 : 1;
      ctx.save();
      ctx.globalAlpha = dim;
      ctx.lineCap = 'round';
      /* glow + core */
      ctx.shadowColor = col.glow; ctx.shadowBlur = 14 * hl;
      ctx.strokeStyle = col.color; ctx.lineWidth = 1.6 * hl;
      if (s.st === 'down') ctx.setLineDash([6, 6]);
      if (s.st === 'down' && !REDUCED) ctx.globalAlpha = dim * (.55 + .45 * Math.abs(Math.sin(t * 3)));
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i2 = 1; i2 < pts.length; i2++) ctx.lineTo(pts[i2][0], pts[i2][1]);
      ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur = 0;
      /* light packets travelling site → PoP (operational / degraded only) */
      if (s.st !== 'down' && s.st !== 'nodata' && !REDUCED) {
        var speed = s.st === 'warn' ? .12 : .32, n = 3;
        for (var k = 0; k < n; k++) {
          var ph = ((t * speed + k / n + c.bend) % 1), idx = ph * (pts.length - 1), i0 = Math.floor(idx);
          for (var tl = 0; tl < 10; tl++) {
            var q = pts[Math.max(0, i0 - tl)];
            ctx.globalAlpha = dim * (1 - tl / 10) * .9;
            ctx.fillStyle = tl === 0 ? '#ffffff' : col.color;
            ctx.beginPath(); ctx.arc(q[0], q[1], (tl === 0 ? 2.2 : 1.6 - tl * .1) * hl, 0, 6.283); ctx.fill();
          }
        }
      }
      ctx.restore();
    });

    /* PoPs */
    Object.keys(POPS).forEach(function(k) {
      var p = POPS[k], q = proj(p.lng, p.lat);
      ctx.save();
      ctx.fillStyle = 'rgba(160,190,255,.9)'; ctx.strokeStyle = 'rgba(160,190,255,.35)'; ctx.lineWidth = 1;
      ctx.fillRect(q[0] - 3.5, q[1] - 3.5, 7, 7);
      ctx.strokeRect(q[0] - 7.5, q[1] - 7.5, 15, 15);
      if (p.side === 'left') label(p.name, p.place, q[0] - 13, q[1] + 4, 'right', .85); else label(p.name, p.place, q[0] + 13, q[1] + 4, 'left', .85);
      ctx.restore();
    });

    /* sites: pulsing beacons */
    Object.keys(SITES).forEach(function(k) {
      var s = SITES[k], q = proj(s.lng, s.lat), st = ST[siteState(k)];
      var dim = siteFilter && k !== siteFilter ? .3 : 1;
      ctx.save(); ctx.globalAlpha = dim;
      for (var r = 0; r < 2; r++) {
        var ph = REDUCED ? .5 : ((t * .6 + r * .5) % 1);
        ctx.strokeStyle = st.color; ctx.globalAlpha = dim * (1 - ph) * .7; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q[0], q[1], 6 + ph * 22, 0, 6.283); ctx.stroke();
      }
      ctx.globalAlpha = dim;
      ctx.shadowColor = st.glow; ctx.shadowBlur = 16;
      ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(q[0], q[1], 5.5, 0, 6.283); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 6.283); ctx.fill();
      label(k, s.place, q[0] + 14, q[1] - 6, 'left', 1);
      ctx.restore();
    });

    if (fp && !REDUCED) {   /* crosshair on the selected site */
      ctx.save(); ctx.strokeStyle = 'rgba(120,200,255,.35)'; ctx.setLineDash([2, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, fp[1]); ctx.lineTo(W, fp[1]); ctx.moveTo(fp[0], 0); ctx.lineTo(fp[0], H); ctx.stroke(); ctx.restore();
    }
    if (!REDUCED) requestAnimationFrame(draw);
  }

  function label(t1, t2, x, y, align, a) {
    ctx.textAlign = align;
    ctx.font = '600 12px "Space Grotesk", Inter, sans-serif';
    ctx.fillStyle = 'rgba(235,242,255,' + a + ')'; ctx.fillText(t1, x, y);
    ctx.font = '500 10.5px Inter, sans-serif';
    ctx.fillStyle = 'rgba(150,170,210,' + (a * .9) + ')'; ctx.fillText(t2, x, y + 14);
  }

  /* hover on a circuit arc */
  cv.addEventListener('mousemove', function(e) {
    if (!proj) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 14;
    CIRCUITS.forEach(function(c) {
      arcPts(c).forEach(function(p) { var d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = c; } });
    });
    hoverC = best ? best.id : null;
    var tip = $('map-tip');
    if (best) {
      var s = circuitState(best);
      tip.innerHTML = '<b>' + best.id + '</b><span>' + best.site + ' → ' + POPS[best.pop].name + '</span><em class="' + s.st + '">' + ST[s.st].label + '</em>';
      tip.style.left = Math.min(x + 14, W - 220) + 'px'; tip.style.top = (y + 14) + 'px'; tip.classList.add('on');
    } else tip.classList.remove('on');
    if (REDUCED) draw(performance.now());
  });
  cv.addEventListener('mouseleave', function() { hoverC = null; $('map-tip').classList.remove('on'); });

  /* tooltips for the availability strips */
  document.addEventListener('mouseover', function(e) {
    var el = e.target.closest && e.target.closest('[data-tip]'), tip = $('tip');
    if (!el) { tip.classList.remove('on'); return; }
    var r = el.getBoundingClientRect();
    tip.textContent = el.dataset.tip;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - 240, r.left + r.width / 2 - 110)) + 'px';
    tip.style.top = (r.top + window.scrollY - 40) + 'px';
    tip.classList.add('on');
  });

  /* ── filter, clock, data ── */
  $('site-filter').addEventListener('click', function(e) {
    var b = e.target.closest('button');
    if (!b) return;
    siteFilter = b.dataset.site;
    document.querySelectorAll('#site-filter button').forEach(function(x) { x.classList.toggle('sel', x === b); });
    render();
    if (REDUCED) draw(performance.now());
  });

  function tick() {
    var d = new Date();
    $('clock').textContent = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + ' UTC';
    document.querySelectorAll('[data-dur]').forEach(function(el) { el.textContent = dur(el.dataset.dur); });
    document.querySelectorAll('[data-ago]').forEach(function(el) { el.textContent = ago(el.dataset.ago); });
  }

  function load() {
    fetch('../api/leo/status', { cache: 'no-store' }).then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(j) { data = j; loaded = true; render(); if (REDUCED) draw(performance.now()); })
      .catch(function() { if (!loaded) { $('ov-title').textContent = 'Status temporarily unavailable'; $('ov-sub').textContent = 'Retrying automatically…'; } });
  }

  window.addEventListener('resize', function() { resize(); if (REDUCED) draw(performance.now()); });
  resize(); render(); load(); tick();
  setInterval(load, 15000); setInterval(tick, 1000);
  requestAnimationFrame(draw);
})();
