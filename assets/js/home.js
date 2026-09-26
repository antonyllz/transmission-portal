/* ═══════════════════════════════
   HOME — hero network, live stats, scroll reveal, card motion
   ═══════════════════════════════ */

var HOME_REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── HERO NETWORK ──
   The real DWDM topology (network-data.js + road geometry) drawn as faint fibers
   on the hero, with light pulses travelling along them. Runs only while visible. */
var heroNet = (function() {
  var cv, ctx, W = 0, H = 0, dpr = 1, paths = [], nodes = [], pulses = [];
  var raf = 0, running = false, visible = true, mx = 0, my = 0, px = 0, py = 0, last = 0;

  /* The Nordeste and Sudeste networks are ~1500 km apart, so instead of one sparse map
     they're drawn as two insets side by side (each to scale), like a network diagram. */
  var REGIONS = [
    { name: 'Nordeste', test: function(s) { return s.lat > -14; }, h: .84 },
    { name: 'Sudeste',  test: function(s) { return s.lat <= -14; }, h: .60 }
  ];
  var labels = [];

  function project() {
    if (typeof NET_SITES === 'undefined') return;
    var wide = W > 760, right = wide ? W - Math.max(40, (W - 960) / 2) : W - 20, gap = wide ? 56 : 24;
    var proj = {};
    labels = [];
    REGIONS.forEach(function(rg) {
      var ss = NET_SITES.filter(rg.test);
      var la0 = Math.min.apply(null, ss.map(function(s) { return s.lat; })), la1 = Math.max.apply(null, ss.map(function(s) { return s.lat; }));
      var ln0 = Math.min.apply(null, ss.map(function(s) { return s.lng; })), ln1 = Math.max.apply(null, ss.map(function(s) { return s.lng; }));
      var k = Math.cos((la0 + la1) / 2 * Math.PI / 180);   /* keep the geography's proportions */
      var bh = H * rg.h * (wide ? 1 : .7), bw = bh * (ln1 - ln0) * k / (la1 - la0);
      rg.box = { w: bw, h: bh };
      rg.P = function(lat, lng) { return [rg.box.x + (lng - ln0) / (ln1 - ln0) * bw, rg.box.y + (la1 - lat) / (la1 - la0) * bh]; };
      ss.forEach(function(s) { proj[s.id] = rg; });
    });
    /* right to left: Nordeste at the edge, Sudeste beside it */
    var x = right;
    REGIONS.forEach(function(rg) {
      x -= rg.box.w;
      rg.box.x = x; rg.box.y = (H - rg.box.h) / 2 - 8;
      if (wide) labels.push({ text: rg.name.toUpperCase(), x: x + rg.box.w / 2, y: rg.box.y + rg.box.h + 22 });
      x -= gap;
    });

    var R = typeof NET_ROUTES !== 'undefined' ? NET_ROUTES : {};
    paths = NET_LINKS.map(function(l) {
      var a = NET_SITES.find(function(s) { return s.id === l.a; }), b = NET_SITES.find(function(s) { return s.id === l.b; });
      if (a.id > b.id) { var t = a; a = b; b = t; }
      var P = proj[a.id].P;
      var road = R['link:' + l.id] || R[a.id + '|' + b.id];
      var ll = road ? [[a.lat, a.lng]].concat(road.pts, [[b.lat, b.lng]]) : [[a.lat, a.lng], [b.lat, b.lng]];
      var pts = ll.map(function(p) { return P(p[0], p[1]); });
      var d = [0];
      for (var i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts: pts, d: d, len: d[d.length - 1] || 1 };
    });
    nodes = NET_SITES.map(function(s) {
      var p = proj[s.id].P(s.lat, s.lng);
      return { x: p[0], y: p[1], big: s.role !== 'ola', ph: Math.random() * Math.PI * 2 };
    });
  }

  function at(path, dist) {
    var d = path.d, i = 1;
    while (i < d.length - 1 && d[i] < dist) i++;
    var k = (dist - d[i - 1]) / ((d[i] - d[i - 1]) || 1), a = path.pts[i - 1], b = path.pts[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  function spawn() {
    var p = paths[Math.floor(Math.random() * paths.length)];
    if (!p) return;
    var fwd = Math.random() < .5;
    pulses.push({ p: p, s: fwd ? 0 : p.len, v: (fwd ? 1 : -1) * (26 + Math.random() * 34), tail: 16 + Math.random() * 14 });
  }

  function resize() {
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    project();
    draw(0);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    px += (mx - px) * .06; py += (my - py) * .06;   /* eased parallax */
    ctx.save();
    ctx.translate(px * 10, py * 8);

    ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    paths.forEach(function(p) {
      ctx.beginPath(); ctx.moveTo(p.pts[0][0], p.pts[0][1]);
      for (var i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
      ctx.stroke();
    });

    /* light pulses with a fading tail */
    pulses.forEach(function(q) {
      q.s += q.v * dt;
      var head = at(q.p, Math.max(0, Math.min(q.p.len, q.s)));
      var tailS = q.s - Math.sign(q.v) * q.tail, tail = at(q.p, Math.max(0, Math.min(q.p.len, tailS)));
      var g = ctx.createLinearGradient(tail[0], tail[1], head[0], head[1]);
      g.addColorStop(0, 'rgba(158,192,255,0)'); g.addColorStop(1, 'rgba(225,236,255,.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(head[0], head[1]); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(head[0], head[1], 1.6, 0, Math.PI * 2); ctx.fill();
    });
    pulses = pulses.filter(function(q) { return q.v > 0 ? q.s - q.tail < q.p.len : q.s + q.tail > 0; });

    /* sites: terminals/ROADMs slightly bigger, all breathing gently */
    var t = performance.now() / 1000;
    nodes.forEach(function(n) {
      var a = .35 + .25 * Math.sin(t * 1.4 + n.ph);
      ctx.fillStyle = 'rgba(255,255,255,' + (n.big ? a + .2 : a * .7) + ')';
      ctx.beginPath(); ctx.arc(n.x, n.y, n.big ? 2.1 : 1.3, 0, Math.PI * 2); ctx.fill();
    });
    /* region captions */
    ctx.font = '600 9.5px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.38)';
    labels.forEach(function(l) {
      if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '2px';
      ctx.fillText(l.text, l.x, l.y);
    });
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function loop(now) {
    if (!running) return;
    var dt = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    if (pulses.length < 26 && Math.random() < .35) spawn();
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || HOME_REDUCED || !visible || !cv || !W) return;
    running = true; last = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function init() {
    cv = document.getElementById('hero-net');
    if (!cv) return;
    ctx = cv.getContext('2d');
    var hero = cv.parentNode;
    hero.addEventListener('mousemove', function(e) {
      var r = hero.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - .5; my = (e.clientY - r.top) / r.height - .5;
    });
    hero.addEventListener('mouseleave', function() { mx = my = 0; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function(es) {
        visible = es[0].isIntersecting;
        if (visible) start(); else stop();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', function() { if (document.hidden) stop(); else start(); });
    window.addEventListener('resize', resize);
    resize();
    start();
  }

  return { init: init, resize: resize, start: start, stop: stop };
})();

/* ── LIVE STATS (count up to the real numbers) ── */
function homeStatValues() {
  var lm = typeof lmbGetAll === 'function' ? lmbGetAll().filter(function(c) { return c.status !== 'inativo'; }).length : 0;
  return {
    'hs-ch':    lm,
    'hs-sites': typeof NET_SITES !== 'undefined' ? NET_SITES.length : 0,
    'hs-rma':   typeof rmaGetAll === 'function' ? rmaGetAll().filter(function(r) { return r.status !== 'finalizado'; }).length : 0,
    'hs-dmd':   typeof dmdGetAll === 'function' ? dmdGetAll().length : 0
  };
}

function homeCountUp(animate) {
  var vals = homeStatValues();
  Object.keys(vals).forEach(function(id, i) {
    var el = document.getElementById(id);
    if (!el) return;
    var to = vals[id], from = animate ? 0 : (parseInt(el.textContent, 10) || 0);
    if (HOME_REDUCED || from === to) { el.textContent = to; return; }
    var t0 = performance.now() + (animate ? 350 + i * 90 : 0), dur = 1100;
    (function tick(now) {
      var k = Math.max(0, Math.min(1, (now - t0) / dur));
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(tick);
    })(performance.now());
  });
}

/* ── SCROLL REVEAL ── */
var homeRevealObs = null;
function homeReveal() {
  var els = document.querySelectorAll('#pg-home [data-reveal]');
  els.forEach(function(el) { el.classList.remove('in'); });
  if (HOME_REDUCED || !('IntersectionObserver' in window)) {
    els.forEach(function(el) { el.classList.add('in'); });
    return;
  }
  if (homeRevealObs) homeRevealObs.disconnect();
  homeRevealObs = new IntersectionObserver(function(es) {
    es.forEach(function(e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      homeRevealObs.unobserve(e.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  requestAnimationFrame(function() { els.forEach(function(el) { homeRevealObs.observe(el); }); });
}

/* ── CARD MOTION: cursor spotlight on tools, gentle 3D tilt on clients ── */
function homeBindCards() {
  if (HOME_REDUCED) return;
  document.querySelectorAll('#pg-home .act-card').forEach(function(c) {
    c.addEventListener('mousemove', function(e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
  document.querySelectorAll('#pg-home .client-card:not(.ph)').forEach(function(c) {
    c.addEventListener('mousemove', function(e) {
      var r = c.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.transform = 'perspective(900px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 6).toFixed(2) + 'deg) translateY(-3px)';
    });
    c.addEventListener('mouseleave', function() { c.style.transform = ''; });
  });
}

/* ── TOPBAR: lifts off the page once you scroll ── */
function homeBindTopbar() {
  var tb = document.querySelector('.topbar');
  if (!tb) return;
  var on = function() { tb.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', on, { passive: true });
  on();
}

function homeInit() {
  heroNet.init();
  homeBindCards();
  homeBindTopbar();
  homeReveal();
}

/* called whenever the home page is shown (see navigation.js) */
function homeEnter() {
  heroNet.resize();
  heroNet.start();
  homeCountUp(true);
  homeReveal();
}
