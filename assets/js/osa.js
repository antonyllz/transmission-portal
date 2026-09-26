/* ═══════════════════════════════
   OSA VIEW — optical spectrum analyzer style drawing of the channels
   on a section. Canvas based: a sweep runs across the C band and each
   channel rises out of the ASE noise floor as the sweep passes it.
   Powers are illustrative (the portal has no real OSA readings).
   View only: hovering shows a readout, nothing is clickable.
   ═══════════════════════════════ */

function OsaView(canvas, channels, opts) {
  opts = opts || {};
  var ctx    = canvas.getContext('2d');
  var lo     = LMB_BAND.lo, hi = LMB_BAND.hi;
  var big    = !!opts.labels;
  var pad    = big ? { l: 16, r: 16, t: 58, b: 34 } : { l: 10, r: 10, t: 14, b: 24 };
  var TOP    = 4, BOTTOM = -44, FLOOR = -35;
  var SWEEP  = big ? 1800 : 1400, RISE = 480;
  var dpr    = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, N = 0, alive = true, raf = 0, timer = 0, hover = null, start = performance.now();

  /* stable per-channel "power" so the picture doesn't change between renders */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }
  var chans = channels.map(function(c) {
    var f = parseFloat(c.freq);
    return {
      c: c, f: f, w: lmbGridWidth(c.grid), color: lmbFreqColor(f), st: c.status || 'ativo',
      tint: function(a) { return lmbFreqColor(f, a); },
      p: -3 - hash(String(c.id)) * 4 - (c.status === 'reservado' ? 7 : 0) - (c.status === 'inativo' ? 22 : 0)
    };
  }).filter(function(x) { return !isNaN(x.f); }).sort(function(a, b) { return a.f - b.f; });

  function resize() {
    var r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    N = Math.max(240, Math.round((W - pad.l - pad.r) * 1.5));
  }
  function X(f)  { return pad.l + (f - lo) / (hi - lo) * (W - pad.l - pad.r); }
  function F(x)  { return lo + (x - pad.l) / (W - pad.l - pad.r) * (hi - lo); }
  function Y(db) { return pad.t + (TOP - db) / (TOP - BOTTOM) * (H - pad.t - pad.b); }
  function lin(db) { return Math.pow(10, db / 10); }
  function ease(k) { return 1 - Math.pow(1 - k, 3); }

  /* ASE floor: gentle gain ripple + a little live jitter */
  function floorDb(f) {
    return FLOOR + 1.4 * Math.sin((f - lo) * 2.2) + 0.7 * Math.sin((f - lo) * 7.1 + 1.3) + (Math.random() - 0.5) * 0.8;
  }
  /* 0..1 — how far the channel has risen, driven by the sweep */
  function amp(ch, t) {
    var ts = (ch.f - lo) / (hi - lo) * SWEEP;
    return ease(Math.max(0, Math.min(1, (t - ts) / RISE)));
  }
  /* flat-top (super-gaussian) carrier, FWHM ≈ 85% of the slot */
  function shape(df, w) {
    var u = df / (w * 0.425);
    return Math.exp(-0.69 * u * u * u * u);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* colors follow the portal theme (light by default, [data-theme="dark"] otherwise) */
  function theme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark ? {
      bg0: '#1c1c1e', bg1: '#161618', grid: 'rgba(255,255,255,.06)', trace: '#7aa2ff', glow: 'rgba(90,130,255,.55)',
      axis: '#8e8e93', label: '#c7c7cc', sweep: '90,130,255', tipBg: 'rgba(44,44,46,.97)', tipText: '#f0f0f2', tipSub: '#aeaeb2',
      cursor: 'rgba(255,255,255,.35)'
    } : {
      bg0: '#ffffff', bg1: '#f7f9ff', grid: 'rgba(6,73,252,.07)', trace: '#0649fc', glow: 'rgba(6,73,252,.35)',
      axis: '#aeaeb2', label: '#6e6e73', sweep: '6,73,252', tipBg: 'rgba(255,255,255,.98)', tipText: '#1d1d1f', tipSub: '#6e6e73',
      cursor: 'rgba(29,29,31,.28)'
    };
  }

  function draw(now) {
    var t = now - start, th = theme();
    if (!W) resize();

    /* screen */
    ctx.clearRect(0, 0, W, H);
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, th.bg0); bg.addColorStop(1, th.bg1);
    roundRect(0, 0, W, H, 12); ctx.fillStyle = bg; ctx.fill();
    ctx.save(); roundRect(0, 0, W, H, 12); ctx.clip();

    /* graticule: 10 x 8 divisions like an OSA */
    ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
    for (var gx = 0; gx <= 10; gx++) {
      var xx = Math.round(pad.l + gx * (W - pad.l - pad.r) / 10) + .5;
      ctx.beginPath(); ctx.moveTo(xx, pad.t); ctx.lineTo(xx, H - pad.b); ctx.stroke();
    }
    for (var gy = 0; gy <= 8; gy++) {
      var yy = Math.round(pad.t + gy * (H - pad.t - pad.b) / 8) + .5;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(W - pad.r, yy); ctx.stroke();
    }

    /* trace */
    var pts = new Array(N);
    for (var i = 0; i < N; i++) {
      var f = lo + (hi - lo) * i / (N - 1), v = lin(floorDb(f));
      for (var k = 0; k < chans.length; k++) {
        var ch = chans[k], df = f - ch.f;
        if (df > ch.w || df < -ch.w) continue;
        var a = amp(ch, t);
        if (a > 0) v += a * lin(ch.p) * shape(df, ch.w);
      }
      pts[i] = [X(f), Y(10 * Math.log10(v))];
    }

    /* colored glow under each carrier */
    chans.forEach(function(ch) {
      var a = amp(ch, t);
      if (a <= 0.01) return;
      var i0 = Math.max(0, Math.floor((ch.f - ch.w * 0.62 - lo) / (hi - lo) * (N - 1)));
      var i1 = Math.min(N - 1, Math.ceil((ch.f + ch.w * 0.62 - lo) / (hi - lo) * (N - 1)));
      var grad = ctx.createLinearGradient(0, Y(ch.p), 0, Y(FLOOR));
      var on = hover === ch;
      grad.addColorStop(0, ch.tint(on ? .55 : .32));
      grad.addColorStop(1, ch.tint(0));
      ctx.beginPath();
      ctx.moveTo(pts[i0][0], Y(BOTTOM));
      for (var j = i0; j <= i1; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.lineTo(pts[i1][0], Y(BOTTOM)); ctx.closePath();
      ctx.globalAlpha = ch.st === 'inativo' ? .25 : 1;
      ctx.fillStyle = grad; ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* the trace itself, with a soft glow */
    ctx.save();
    ctx.shadowColor = th.glow; ctx.shadowBlur = big ? 8 : 6;
    ctx.strokeStyle = th.trace; ctx.lineWidth = big ? 1.6 : 1.3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var p = 1; p < N; p++) ctx.lineTo(pts[p][0], pts[p][1]);
    ctx.stroke();
    ctx.restore();

    /* reserved carriers: dashed outline on top */
    chans.forEach(function(ch) {
      if (ch.st !== 'reservado' || amp(ch, t) < .5) return;
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = ch.color; ctx.lineWidth = 1.2;
      ctx.strokeRect(X(ch.f - ch.w / 2), Y(ch.p) - 2, X(ch.f + ch.w / 2) - X(ch.f - ch.w / 2), Y(FLOOR) - Y(ch.p) + 2);
      ctx.restore();
    });

    /* peak markers (+ client labels on the big screen) */
    chans.forEach(function(ch, idx) {
      var a = amp(ch, t);
      if (a < .92) return;
      var px = X(ch.f), py = Y(ch.p) - 6;
      ctx.fillStyle = ch.color;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 3.5, py - 6); ctx.lineTo(px + 3.5, py - 6); ctx.closePath(); ctx.fill();
      if (big) {
        ctx.save();
        ctx.translate(px + 3, py - 10); ctx.rotate(-Math.PI / 2.6);
        ctx.font = '600 10.5px Inter, system-ui, sans-serif'; ctx.fillStyle = th.label;
        ctx.fillText((ch.c.client || ch.c.name || '').slice(0, 18), 0, 0);
        ctx.restore();
      }
    });

    /* sweep line */
    if (t < SWEEP + 150) {
      var sx = X(lo + (hi - lo) * Math.min(1, t / SWEEP));
      var sg = ctx.createLinearGradient(sx - 40, 0, sx, 0);
      sg.addColorStop(0, 'rgba(' + th.sweep + ',0)'); sg.addColorStop(1, 'rgba(' + th.sweep + ',.16)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 40, pad.t, 40, H - pad.t - pad.b);
      ctx.fillStyle = 'rgba(' + th.sweep + ',.85)'; ctx.fillRect(sx - 1, pad.t, 2, H - pad.t - pad.b);
    }

    /* hover cursor + readout */
    if (hover && amp(hover, t) > .9) {
      var hx = X(hover.f);
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = th.cursor;
      ctx.beginPath(); ctx.moveTo(hx + .5, pad.t); ctx.lineTo(hx + .5, H - pad.b); ctx.stroke(); ctx.restore();
      var lines = [lmbFmtFreq(hover.f), hover.c.client || '', (LMB_GRIDS[hover.c.grid] || { label: '' }).label
        + (hover.st !== 'ativo' ? ' · ' + LMB_STATUS[hover.st].label : '')].filter(Boolean);
      ctx.font = '600 11.5px Inter, system-ui, sans-serif';
      var bw = Math.max.apply(null, lines.map(function(s) { return ctx.measureText(s).width; })) + 20, bh = lines.length * 16 + 12;
      var bx = hx + 10 + bw > W - 4 ? hx - bw - 10 : hx + 10, by = pad.t + 4;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
      roundRect(bx, by, bw, bh, 10); ctx.fillStyle = th.tipBg; ctx.fill();
      ctx.restore();
      ctx.fillStyle = hover.color; ctx.fillRect(bx, by + 8, 3, bh - 16);
      lines.forEach(function(s, n) {
        ctx.fillStyle = n === 0 ? th.tipText : th.tipSub;
        ctx.font = (n === 0 ? '700 ' : '500 ') + '11.5px Inter, system-ui, sans-serif';
        ctx.fillText(s, bx + 10, by + 20 + n * 16);
      });
    }

    /* frequency axis */
    ctx.font = '500 ' + (big ? 11 : 9.5) + 'px Inter, system-ui, sans-serif';
    ctx.fillStyle = th.axis; ctx.textAlign = 'center';
    for (var fx = Math.ceil(lo); fx <= hi; fx += big ? 0.5 : 1) {
      ctx.fillText(big ? fx.toFixed(1) : String(fx), X(fx), H - pad.b + (big ? 18 : 15));
    }
    ctx.textAlign = 'left';
    if (big) {
      ctx.fillStyle = th.axis; ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillText('THz', W - pad.r - 22, H - 8);
    }
    ctx.restore();
    return t;
  }

  function frame(now) {
    if (!alive) return;
    if (!canvas.isConnected) { alive = false; return; }
    var t = draw(now);
    /* full speed while animating, then a calm ~15 fps shimmer */
    if (t < SWEEP + RISE + 100 || hover) raf = requestAnimationFrame(frame);
    else timer = setTimeout(function() { raf = requestAnimationFrame(frame); }, 66);
  }

  function pick(e) {
    var r = canvas.getBoundingClientRect(), f = F(e.clientX - r.left), best = null, bd = 1e9;
    chans.forEach(function(ch) {
      var d = Math.abs(ch.f - f);
      if (d < Math.max(ch.w * 0.7, (hi - lo) * 0.012) && d < bd) { bd = d; best = ch; }
    });
    return best;
  }
  function onMove(e) { hover = pick(e); }
  function onLeave() { hover = null; }
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  /* resizing clears the canvas — redraw right away instead of waiting for the next frame */
  function onResize() { resize(); if (alive && canvas.isConnected) draw(performance.now()); }
  window.addEventListener('resize', onResize);

  resize();
  raf = requestAnimationFrame(frame);
  return {
    destroy: function() {
      alive = false; cancelAnimationFrame(raf); clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    }
  };
}
