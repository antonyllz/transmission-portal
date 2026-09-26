/* Builds assets/js/network-routes.js: road geometry (OSRM / OpenStreetMap) for every
   pair of sites joined by a span. Re-run from the portal root after changing
   NET_SITES / NET_LINKS:  node tools/build-routes.js
   Needs internet access to router.project-osrm.org (works from the VPS).

   Protected spans (2+ fibers between the same sites) get physically diverse drawings:
   the first fiber uses the main road route (key "A|B"), each extra fiber uses the
   OSRM alternative that overlaps it the least (key "link:<id>"); if OSRM offers no
   diverse alternative, a detour through a lateral via-point is forced. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), https = require('https');

const dataFile = process.argv[2] || 'assets/js/network-data.js';
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(dataFile, 'utf8'), ctx);
const site = (id) => ctx.NET_SITES.find((s) => s.id === id);

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'tely-transmission-portal/1.0' } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('HTTP ' + res.statusCode + ' ' + b.slice(0, 120))); }
      });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function osrm(points, alternatives) {
  const url = 'https://router.project-osrm.org/route/v1/driving/'
    + points.map((p) => p.lng + ',' + p.lat).join(';')
    + '?overview=full&geometries=geojson' + (alternatives ? '&alternatives=3' : '');
  const r = await get(url);
  await sleep(1100);   /* public demo server: max ~1 request/s */
  if (r.code !== 'Ok') throw new Error(r.code);
  return r.routes.map((rt) => ({ km: rt.distance / 1000, pts: rt.geometry.coordinates.map(([x, y]) => [y, x]) }));
}

/* Douglas–Peucker on [lat,lng] */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, max = 0;
    const [ay, ax] = pts[a], [by, bx] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][1] - dx * pts[i][0] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const pack = (rt) => ({
  km: Math.round(rt.km * 10) / 10,
  pts: simplify(rt.pts, 0.0015).map(([y, x]) => [+y.toFixed(4), +x.toFixed(4)])
});

/* share of `pts` lying within ~400 m of `ref` (ignoring the first/last 10%, which always coincide near the sites) */
function overlap(pts, ref) {
  const tol = 0.004, a = Math.floor(pts.length * 0.1), b = Math.ceil(pts.length * 0.9);
  let near = 0, n = 0;
  for (let i = a; i < b; i++) {
    n++;
    for (const q of ref) {
      if (Math.abs(q[0] - pts[i][0]) < tol && Math.abs(q[1] - pts[i][1]) < tol) { near++; break; }
    }
  }
  return n ? near / n : 1;
}

async function diverseRoute(a, b, main, taken) {
  const refs = [main.pts].concat(taken.map((t) => t.pts));
  const score = (rt) => Math.max.apply(null, refs.map((r) => overlap(rt.pts, r)));
  let best = null;
  const consider = (rt) => {
    if (rt.km > main.km * 2.2 + 5) return;               /* no absurd detours */
    const sc = score(rt);
    if (!best || sc < best.sc) best = { rt, sc };
  };
  (await osrm([a, b], true)).slice(1).forEach(consider);
  if (!best || best.sc > 0.5) {
    /* force diversity: detour through points pushed sideways from the midpoint */
    const my = (a.lat + b.lat) / 2, mx = (a.lng + b.lng) / 2, dy = b.lat - a.lat, dx = b.lng - a.lng;
    for (const k of [0.25, -0.25, 0.4, -0.4]) {
      try { consider((await osrm([a, { lat: my + dx * k, lng: mx - dy * k }, b], false))[0]); } catch (e) { /* via unreachable */ }
      if (best && best.sc < 0.3) break;
    }
  }
  return best;
}

(async () => {
  const groups = {};
  ctx.NET_LINKS.forEach((l) => { const k = [l.a, l.b].sort().join('|'); (groups[k] = groups[k] || []).push(l); });
  const out = {}, failed = [];
  for (const key of Object.keys(groups)) {
    const [a, b] = key.split('|').map(site);
    try {
      const main = (await osrm([a, b], false))[0];
      out[key] = pack(main);
      console.error(key, out[key].km + ' km');
      const taken = [];
      for (const l of groups[key].slice(1)) {
        const alt = await diverseRoute(a, b, main, taken);
        if (!alt) { console.error('  ', l.id, 'no diverse route found'); continue; }
        taken.push(alt.rt);
        out['link:' + l.id] = pack(alt.rt);
        console.error('  ', l.id, out['link:' + l.id].km + ' km, overlap ' + Math.round(alt.sc * 100) + '%');
      }
    } catch (e) { failed.push(key); console.error('FAIL', key, e.message); }
  }
  const js = '/* Road geometry per site pair (generated by tools/build-routes.js from OSRM / OpenStreetMap).\n'
    + '   "A|B" = main route between the two site ids (sorted), pts run from A to B.\n'
    + '   "link:<id>" = physically diverse drawing for the extra fiber(s) of a protected span.\n'
    + '   km = road distance, used only as an estimate when the span length is unknown. */\n'
    + 'var NET_ROUTES = ' + JSON.stringify(out) + ';\n';
  fs.writeFileSync(path.join(path.dirname(dataFile), 'network-routes.js'), js);
  console.error('done', Object.keys(out).length, 'routes;', failed.length, 'failed', failed);
})();
