/* ═══════════════════════════════
   HOME + CLIENT PAGES — hero network, scroll reveal, card motion
   ═══════════════════════════════ */

var HOME_REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── HERO NETWORK ──
   A generated optical mesh in two depth layers: gently curved fibers, light
   pulses that hop node to node along whole routes (tails follow the curves),
   nodes that flare as a pulse passes, and technical words typed into the scene.
   Runs only while the hero is on screen. One instance per hero canvas. */
function HeroNet(canvasId, opts) {
  opts = opts || {};
  var cv, ctx, W = 0, H = 0, dpr = 1, layers = [], pulses = [], words = [];
  var raf = 0, running = false, visible = true, mx = 0, my = 0, px = 0, py = 0, last = 0, clock = 0;

  var TINTS  = ['#ffffff', '#cfe0ff', '#a7f3e4', '#d6d0ff', '#b9e6ff'];
  var LEXICON = opts.lexicon || ['DWDM', 'TRANSMISSION', 'NETWORK', 'ROADM', 'C-BAND', 'OSNR', 'λ 1550 nm',
                 '193.1 THz', 'MUX / DEMUX', 'OTN', '400G', 'OPTICAL LAYER', 'WDM', 'FIBER', 'OLA', '1+1 PROTECTION'];

  /* seeded random: the mesh keeps its shape across resizes */
  function rng(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function curve(a, b, bend) {
    var mx2 = (a.x + b.x) / 2 - (b.y - a.y) * bend, my2 = (a.y + b.y) / 2 + (b.x - a.x) * bend, pts = [];
    for (var i = 0; i <= 18; i++) {
      var t = i / 18, u = 1 - t;
      pts.push([u * u * a.x + 2 * u * t * mx2 + t * t * b.x, u * u * a.y + 2 * u * t * my2 + t * t * b.y]);
    }
    var d = [0];
    for (var j = 1; j < pts.length; j++) d.push(d[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    return { pts: pts, d: d, len: d[d.length - 1] || 1 };
  }

  function build() {
    var wide = W > 760, rand = rng(1550);
    var x0 = wide ? W * 0.44 : 0, x1 = W + 20, y0 = -10, y1 = H + 10;
    layers = [
      { depth: .45, alpha: .55, count: wide ? 26 : 14, nodes: [], edges: [] },
      { depth: 1,   alpha: 1,   count: wide ? 30 : 16, nodes: [], edges: [] }
    ];
    layers.forEach(function(L) {
      var aw = x1 - x0, ah = y1 - y0, cols = Math.ceil(Math.sqrt(L.count * aw / ah)), rows = Math.ceil(L.count / cols);
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        L.nodes.push({
          x: x0 + (c + .15 + rand() * .7) * aw / cols, y: y0 + (r + .15 + rand() * .7) * ah / rows,
          adj: [], glow: 0, core: rand() < .3, ph: rand() * 6.28
        });
      }
      /* fibers: each node to its 2 nearest neighbours, plus a few longer links */
      var seen = {};
      L.nodes.forEach(function(n, i) {
        var near = L.nodes.map(function(m, j) { return { j: j, d: Math.hypot(m.x - n.x, m.y - n.y) }; })
          .filter(function(o) { return o.j !== i; }).sort(function(a, b) { return a.d - b.d; });
        var pick = near.slice(0, 2).concat(rand() < .25 ? [near[2 + Math.floor(rand() * 3)]] : []);
        pick.forEach(function(o) {
          if (!o) return;
          var k = Math.min(i, o.j) + '-' + Math.max(i, o.j);
          if (seen[k]) return;
          seen[k] = true;
          var e = { a: i, b: o.j, c: curve(n, L.nodes[o.j], (rand() - .5) * .35) };
          L.edges.push(e);
          n.adj.push(e); L.nodes[o.j].adj.push(e);
        });
      });
    });
  }

  function at(c, s) {
    var d = c.d, i = 1;
    while (i < d.length - 1 && d[i] < s) i++;
    var k = (s - d[i - 1]) / ((d[i] - d[i - 1]) || 1), a = c.pts[i - 1], b = c.pts[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  /* a pulse rides fiber after fiber, never turning straight back */
  function spawn() {
    var L = layers[Math.random() < .35 ? 0 : 1], e = L.edges[Math.floor(Math.random() * L.edges.length)];
    if (!e) return;
    var fwd = Math.random() < .5;
    pulses.push({
      L: L, e: e, from: fwd ? e.a : e.b, s: 0, v: 70 + Math.random() * 50,
      tint: TINTS[Math.floor(Math.random() * TINTS.length)], trail: [], hops: 0,
      maxHops: 3 + Math.floor(Math.random() * 5), fade: 1, dying: false
    });
  }

  function step(q, dt) {
    if (!q.dying) q.s += q.v * dt;
    while (q.s >= q.e.c.len && !q.dying) {
      var to = q.e.a === q.from ? q.e.b : q.e.a, node = q.L.nodes[to];
      node.glow = 1;
      q.hops++;
      var next = node.adj.filter(function(x) { return x !== q.e; });
      if (!next.length || q.hops >= q.maxHops) { q.dying = true; q.s = q.e.c.len; break; }
      q.s -= q.e.c.len;
      q.e = next[Math.floor(Math.random() * next.length)];
      q.from = to;
    }
    var s = q.e.a === q.from ? q.s : q.e.c.len - q.s;
    var p = at(q.e.c, Math.max(0, Math.min(q.e.c.len, s)));
    q.trail.push(p);
    if (q.trail.length > 26 || (q.dying && q.trail.length > 1)) q.trail.shift();
    if (q.dying) q.fade -= dt * 2.2;
  }

  /* ── typed words: little annotations that type themselves near a node ── */
  function spawnWord() {
    var L = layers[1], n = L.nodes[Math.floor(Math.random() * L.nodes.length)];
    if (!n || n.x < (W > 760 ? W * .5 : 0) || n.x > W - 150 || n.y < 34 || n.y > H - 18) return;
    var text = LEXICON[Math.floor(Math.random() * LEXICON.length)];
    if (words.some(function(w) { return w.text === text || Math.hypot(w.n.x - n.x, w.n.y - n.y) < 150; })) return;
    words.push({ n: n, text: text, shown: 0, phase: 'type', hold: 0, dx: 14 + Math.random() * 18, dy: -10 - Math.random() * 14 });
  }

  function drawWords(dt) {
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '2px';
    words.forEach(function(w) {
      if (w.phase === 'type') { w.shown += dt * 16; if (w.shown >= w.text.length) { w.shown = w.text.length; w.phase = 'hold'; } }
      else if (w.phase === 'hold') { w.hold += dt; if (w.hold > 2.4 && !HOME_REDUCED) w.phase = 'erase'; }
      else { w.shown -= dt * 30; if (w.shown <= 0) w.phase = 'done'; }
      var x = w.n.x, y = w.n.y, tx = x + w.dx, ty = y + w.dy;
      var str = w.text.slice(0, Math.max(0, Math.floor(w.shown)));
      var vis = Math.min(1, w.shown / 2);
      /* leader line from the node to the label */
      ctx.strokeStyle = 'rgba(255,255,255,' + (.28 * vis) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx - 4, ty + 3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(str, tx, ty);
      /* block caret while typing, blinking while holding */
      var cw = ctx.measureText(str).width;
      if (w.phase === 'type' || (w.phase === 'hold' && Math.floor(clock * 2.4) % 2 === 0)) {
        ctx.fillStyle = 'rgba(167,243,228,.85)';
        ctx.fillRect(tx + cw + 2, ty - 8, 5, 9);
      }
    });
    words = words.filter(function(w) { return w.phase !== 'done'; });
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  }

  function draw(dt) {
    clock += dt;
    ctx.clearRect(0, 0, W, H);
    px += (mx - px) * Math.min(1, dt * 4); py += (my - py) * Math.min(1, dt * 4);   /* eased parallax */
    var wide = W > 760;
    var fade = function(x) { return wide ? Math.min(1, Math.max(0, (x - W * .36) / (W * .22))) : .6; };   /* clear the text side */

    layers.forEach(function(L) {
      ctx.save(); ctx.translate(px * 22 * L.depth, py * 14 * L.depth);
      ctx.lineWidth = L.depth < 1 ? .8 : 1; ctx.lineCap = 'round';
      L.edges.forEach(function(e) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (.16 * L.alpha * fade(e.c.pts[9][0])) + ')';
        ctx.beginPath(); ctx.moveTo(e.c.pts[0][0], e.c.pts[0][1]);
        for (var i = 1; i < e.c.pts.length; i++) ctx.lineTo(e.c.pts[i][0], e.c.pts[i][1]);
        ctx.stroke();
      });
      L.nodes.forEach(function(n) {
        n.glow = Math.max(0, n.glow - dt * 1.6);
        var base = (n.core ? .55 : .32) + .12 * Math.sin(clock * 1.3 + n.ph);
        if (n.glow > .02) {
          var r = 12 * n.glow + 4, g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
          g.addColorStop(0, 'rgba(210,228,255,' + (.55 * n.glow * L.alpha) + ')'); g.addColorStop(1, 'rgba(210,228,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 6.29); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, (base + n.glow * .5) * L.alpha * fade(n.x)) + ')';
        ctx.beginPath(); ctx.arc(n.x, n.y, (n.core ? 2 : 1.3) * (L.depth < 1 ? .8 : 1), 0, 6.29); ctx.fill();
      });
      /* pulses: the tail follows the actual path and fades towards the back */
      pulses.forEach(function(q) {
        if (q.L !== L) return;
        step(q, dt);
        var t = q.trail, a = Math.max(0, q.fade) * L.alpha;
        for (var i = 1; i < t.length; i++) {
          var k = i / (t.length - 1);
          ctx.strokeStyle = q.tint; ctx.globalAlpha = a * k * k;
          ctx.lineWidth = (L.depth < 1 ? 1.2 : 2) * (.4 + .6 * k);
          ctx.beginPath(); ctx.moveTo(t[i - 1][0], t[i - 1][1]); ctx.lineTo(t[i][0], t[i][1]); ctx.stroke();
        }
        var h = t[t.length - 1];
        if (h) {
          ctx.globalAlpha = a;
          var hg = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], 6);
          hg.addColorStop(0, q.tint); hg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(h[0], h[1], 6, 0, 6.29); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
      if (L.depth === 1 && wide) drawWords(dt);
      ctx.restore();
    });
    pulses = pulses.filter(function(q) { return q.fade > 0; });
  }

  function loop(now) {
    if (!running) return;
    var dt = last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now;
    if (pulses.length < 22 && Math.random() < dt * 9) spawn();
    if (words.length < 3 && Math.random() < dt * .9) spawnWord();
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pulses = []; words = [];
    build();
    if (HOME_REDUCED) { for (var i = 0; i < 12 && words.length < 3; i++) spawnWord(); words.forEach(function(w) { w.shown = w.text.length; w.phase = 'hold'; }); }
    draw(0);
  }

  function start() {
    if (running || HOME_REDUCED || !visible || !cv || !W) return;
    running = true; last = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function init() {
    cv = document.getElementById(canvasId);
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
}

var heroNet = HeroNet('hero-net');

/* client heroes: same mesh, with words about each client */
var clientNets = {
  'pg-amazon-leo': HeroNet('cl-net-amazon-leo', { lexicon: ['AMAZON LEO', 'GATEWAY', 'SLZ501 \u00b7 OCARA', 'CPV501 \u00b7 SANHAR\u00d3',
    'RFO', 'CASE TIMELINE', 'LEO', 'DWDM', 'UPTIME', 'CIRCUIT', '100G', 'EQUINIX RJ2'] }),
  'pg-starlink':   HeroNet('cl-net-starlink', { lexicon: ['STARLINK', 'GATEWAY', 'LEO', 'BACKHAUL', 'DWDM', 'TRANSMISSION',
    'LOW LATENCY', 'NETWORK', '400G', 'OPTICAL LAYER'] })
};

/* ── SCROLL REVEAL (any page with [data-reveal] blocks) ── */
function fxReveal(page) {
  if (!page) return;
  var els = page.querySelectorAll('[data-reveal]');
  els.forEach(function(el) { el.classList.remove('in'); });
  if (HOME_REDUCED || !('IntersectionObserver' in window)) {
    els.forEach(function(el) { el.classList.add('in'); });
    return;
  }
  if (page._revealObs) page._revealObs.disconnect();
  var obs = page._revealObs = new IntersectionObserver(function(es) {
    es.forEach(function(e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      obs.unobserve(e.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  requestAnimationFrame(function() { els.forEach(function(el) { obs.observe(el); }); });
}
function homeReveal() { fxReveal(document.getElementById('pg-home')); }

/* ── CARD MOTION: cursor spotlight on tools, gentle 3D tilt on clients ──
   delegated from the grids, so it keeps working if the cards are re-rendered */
function homeBindCards() {
  if (HOME_REDUCED) return;
  document.querySelectorAll('.home-tools').forEach(function(tools) {
    tools.addEventListener('mousemove', function(e) {
      var c = e.target.closest('.act-card');
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
  var clients = document.querySelector('#pg-home .clients-grid');
  if (!clients) return;
  clients.addEventListener('mousemove', function(e) {
    var c = e.target.closest('.client-card:not(.ph)');
    if (!c || c.classList.contains('vanishIn')) return;
    var r = c.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.style.transform = 'perspective(900px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 6).toFixed(2) + 'deg) translateY(-3px)';
  });
  clients.addEventListener('mouseout', function(e) {
    var c = e.target.closest('.client-card');
    if (c && !c.contains(e.relatedTarget)) c.style.transform = '';
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
  Object.keys(clientNets).forEach(function(k) { clientNets[k].init(); });
  homeBindCards();
  homeBindTopbar();
  homeReveal();
}

/* called whenever the home page is shown (see animations.js / animateHero) */
function homeEnter() {
  heroNet.resize();
  heroNet.start();
  homeReveal();
}

/* called whenever a client page is shown (see navigation.js) */
function clientEnter(id) {
  var page = document.getElementById(id);
  if (!page) return;
  var hero = page.querySelector('.cl-hero');
  if (hero) { hero.classList.remove('hero-in'); void hero.offsetWidth; hero.classList.add('hero-in'); }
  if (clientNets[id]) { clientNets[id].resize(); clientNets[id].start(); }
  fxReveal(page);
}
