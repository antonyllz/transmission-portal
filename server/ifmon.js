/* ═══════════════════════════════════════
   CROSS-CONNECT MONITOR — the two router ports of a CCC (circuit cross-connect)
   that carries an Amazon Leo circuit, read over SNMP v2c every minute
   (IFMON_INTERVAL) and shown on the Amazon Leo dashboard.

   SLZ501 ↔ Equinix SP4 (SPOOCR964174) crosses PB-CGE-A01-BKB-RT-001:
     Eletronet (SP4) ──► et-0/0/27 ══ CCC ══ et-0/0/28 ──► Amazon Leo SLZ501
   Watching both ports tells on which side a flap happened.

   Per port: ifOperStatus / ifAdminStatus, ifHCIn/OutOctets (→ bps),
   ifHighSpeed, ifAlias and ifLastChange. With sysUpTime, ifLastChange gives
   the exact time of the port's last transition — so a flap shorter than the
   poll interval (down and back up between two readings) is still caught.
   ifIndex is found by ifName (walk of ifName) and re-checked on every poll.
   Community: env SNMP_COMMUNITY or server/data/snmp-community.txt (never in git).
   ═══════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const snmp = require('./snmp');

const PATHS = [
  {
    id: 'slz501-sp4', site: 'SLZ501', circuit: 'SPOOCR964174',
    title: 'SLZ501 ↔ Equinix SP4',
    router: 'PB-CGE-A01-BKB-RT-001', place: 'Campina Grande, PB', ip: '198.18.0.64',
    ports: [
      { key: 'a', ifName: 'et-0/0/27', ifIndex: 561, side: 'Eletronet', to: 'Equinix SP4' },
      { key: 'b', ifName: 'et-0/0/28', side: 'Amazon Leo', to: 'SLZ501' }
    ]
  }
];

const KEEP_MS = 7 * 86400000;           /* history: 7 days at 1 min */
const MAX_EVENTS = 500;
const SYS_UPTIME = '1.3.6.1.2.1.1.3.0';
const IF_NAME = '1.3.6.1.2.1.31.1.1.1.1';
const OID = {
  oper:   '1.3.6.1.2.1.2.2.1.8.',       /* ifOperStatus  1 up, 2 down, … */
  admin:  '1.3.6.1.2.1.2.2.1.7.',       /* ifAdminStatus */
  last:   '1.3.6.1.2.1.2.2.1.9.',       /* ifLastChange (TimeTicks, sysUpTime of the last transition) */
  inO:    '1.3.6.1.2.1.31.1.1.1.6.',    /* ifHCInOctets  */
  outO:   '1.3.6.1.2.1.31.1.1.1.10.',   /* ifHCOutOctets */
  speed:  '1.3.6.1.2.1.31.1.1.1.15.',   /* ifHighSpeed (Mbps) */
  name:   '1.3.6.1.2.1.31.1.1.1.1.',    /* ifName  */
  alias:  '1.3.6.1.2.1.31.1.1.1.18.'    /* ifAlias */
};
const OPER = { 1: 'up', 2: 'down', 3: 'testing', 4: 'unknown', 5: 'dormant', 6: 'notPresent', 7: 'lowerLayerDown' };

function loadCommunity(dataDir) {
  if (process.env.SNMP_COMMUNITY) return process.env.SNMP_COMMUNITY.trim();
  const f = path.join(dataDir, 'snmp-community.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
}

const idx = {};                          /* "<path>:<port>" → ifIndex found by name */
async function resolveIndexes(p, community, opts) {
  const missing = p.ports.filter((pt) => !idx[p.id + ':' + pt.key]);
  if (!missing.length) return;
  const names = await snmp.walk(p.ip, community, IF_NAME, opts);
  for (const pt of missing) {
    const hit = Object.keys(names).find((k) => names[k] === pt.ifName);
    if (hit) idx[p.id + ':' + pt.key] = +hit.split('.').pop();
    else if (pt.ifIndex) idx[p.id + ':' + pt.key] = pt.ifIndex;
    else throw new Error(pt.ifName + ' not found on ' + p.router);
  }
}

const iso = (ms) => new Date(ms).toISOString();

async function pollPath(p, community, store, opts) {
  const now = Date.now();
  const all = store.read('ifmon');
  const recOf = (pt) => {
    const id = p.id + ':' + pt.key;
    let r = all.find((x) => x.id === id);
    if (!r) { r = { id, history: [], events: [] }; all.push(r); }
    return r;
  };
  try {
    await resolveIndexes(p, community, opts);
    const oids = [SYS_UPTIME];
    p.ports.forEach((pt) => Object.values(OID).forEach((o) => oids.push(o + idx[p.id + ':' + pt.key])));
    const v = await snmp.get(p.ip, community, oids, opts);
    const sysUp = v[SYS_UPTIME];

    for (const pt of p.ports) {
      const i = idx[p.id + ':' + pt.key], r = recOf(pt);
      const g = Object.fromEntries(Object.keys(OID).map((k) => [k, v[OID[k] + i]]));
      if (g.oper === null || g.oper === undefined || (g.name && g.name !== pt.ifName)) {
        delete idx[p.id + ':' + pt.key];                    /* index changed (reboot / new line card): look again next time */
        throw new Error(pt.ifName + ' moved — re-resolving the ifIndex');
      }
      const status = g.admin === 2 ? 'admin-down' : OPER[g.oper] || 'unknown';
      /* when the last transition happened, from the router's own clock */
      const changeAt = typeof sysUp === 'number' && typeof g.last === 'number' && g.last > 0 && sysUp >= g.last
        ? now - (sysUp - g.last) * 10 : null;

      /* traffic from the counter deltas */
      let inBps = null, outBps = null;
      const inO = typeof g.inO === 'bigint' ? g.inO : null, outO = typeof g.outO === 'bigint' ? g.outO : null;
      if (r.counters && inO !== null && outO !== null) {
        const dt = (now - r.counters.at) / 1000, dIn = inO - BigInt(r.counters.inO), dOut = outO - BigInt(r.counters.outO);
        if (dt > 2 && dt < 900 && dIn >= 0n && dOut >= 0n) { inBps = Math.round(Number(dIn) * 8 / dt); outBps = Math.round(Number(dOut) * 8 / dt); }
      }
      if (inO !== null && outO !== null) r.counters = { at: now, inO: String(inO), outO: String(outO) };

      /* transitions */
      const rebooted = r.sysUp !== undefined && typeof sysUp === 'number' && sysUp < r.sysUp;
      const at = iso(changeAt || now);
      if (r.status === undefined) {
        r.statusSince = changeAt ? iso(changeAt) : iso(now);              /* first reading: the router knows since when */
      } else if (r.status !== status) {
        const ev = { at, type: status === 'up' ? 'up' : 'down', status };
        if (ev.type === 'up') { const d = r.events.find((e) => e.type === 'down'); if (d) ev.dur = Math.max(0, Date.parse(at) - Date.parse(d.at)); }
        r.events.unshift(ev);
        r.statusSince = at;
        console.log('ifmon: ' + p.router + ' ' + pt.ifName + ' (' + pt.side + ') is ' + status);
      } else if (!rebooted && changeAt && r.lastChangeAt && Math.abs(changeAt - Date.parse(r.lastChangeAt)) > 1500) {
        /* same status, but the port changed in between: a flap shorter than the poll */
        r.events.unshift({ at, type: 'flap', status });
        r.statusSince = at;
        console.log('ifmon: ' + p.router + ' ' + pt.ifName + ' (' + pt.side + ') flapped');
      }
      r.events = r.events.slice(0, MAX_EVENTS);
      Object.assign(r, {
        status, ok: true, error: null, polledAt: iso(now), sysUp,
        lastChangeAt: changeAt ? iso(changeAt) : r.lastChangeAt || null,
        alias: g.alias || '', speedMbps: typeof g.speed === 'number' ? g.speed : null, ifIndex: i,
        inBps, outBps
      });
      r.history.push([iso(now), inBps, outBps, status === 'up' ? 1 : 0]);
    }
  } catch (e) {
    for (const pt of p.ports) {
      const r = recOf(pt);
      if (r.ok !== false) console.log('ifmon: ' + p.router + ' poll failed — ' + e.message);
      Object.assign(r, { ok: false, error: e.message, failedAt: iso(now) });
      r.history.push([iso(now), null, null, null]);
    }
  }
  for (const pt of p.ports) { const r = recOf(pt); r.history = r.history.filter((h) => now - Date.parse(h[0]) <= KEEP_MS); }
  store.write('ifmon', all);
}

function start(dataDir, store) {
  const community = loadCommunity(dataDir);
  if (!community) { console.log('Cross-connect monitor off (no SNMP_COMMUNITY / snmp-community.txt)'); return; }
  const every = (+process.env.IFMON_INTERVAL || 60) * 1000;
  const opts = process.env.IFMON_TEST_PORT ? { port: +process.env.IFMON_TEST_PORT, timeout: 1500, retries: 0 } : { timeout: 4000, retries: 1 };
  const host = (p) => (process.env.IFMON_TEST_PORT ? Object.assign({}, p, { ip: '127.0.0.1' }) : p);
  const run = () => PATHS.forEach((p) => pollPath(host(p), community, store, opts).catch((e) => console.log('ifmon: ' + e.message)));
  console.log('Cross-connect monitor on: ' + PATHS.map((p) => p.router + ' ' + p.ports.map((x) => x.ifName).join(' ⇄ ')).join(', ') + ' every ' + every / 1000 + 's');
  run();
  setInterval(run, every);
}

/* GET /api/leo/ifmon?hours=24 — per path: both ports (state, ≤ 360 averaged points, events) */
function response(q, store) {
  const hours = Math.min(168, Math.max(1, parseInt(q.hours, 10) || 24));
  const from = Date.now() - hours * 3600000;
  const recs = store.read('ifmon');
  const portOut = (p, pt) => {
    const r = recs.find((x) => x.id === p.id + ':' + pt.key) || {};
    const pts = (r.history || []).filter((h) => Date.parse(h[0]) >= from);
    const step = Math.max(1, Math.ceil(pts.length / 360)), out = [];
    for (let i = 0; i < pts.length; i += step) {
      const b = pts.slice(i, i + step);
      const avg = (k) => { const v = b.map((x) => x[k]).filter((x) => x !== null); return v.length ? Math.round(v.reduce((a, c) => a + c, 0) / v.length) : null; };
      const up = b.map((x) => x[3]).filter((x) => x !== null);
      out.push([b[0][0], avg(1), avg(2), up.length ? Math.min.apply(null, up) : null]);
    }
    const peak = (k) => pts.reduce((m, x) => (x[k] !== null && x[k] > m ? x[k] : m), 0);
    return {
      key: pt.key, ifName: pt.ifName, side: pt.side, to: pt.to, ifIndex: r.ifIndex || pt.ifIndex || null,
      alias: r.alias || '', speedMbps: r.speedMbps ?? null,
      status: r.status || null, statusSince: r.statusSince || null, lastChangeAt: r.lastChangeAt || null,
      inBps: r.inBps ?? null, outBps: r.outBps ?? null, peakIn: peak(1), peakOut: peak(2),
      ok: r.ok !== false, error: r.error || null, polledAt: r.polledAt || null, failedAt: r.failedAt || null,
      events: (r.events || []).filter((e) => Date.parse(e.at) >= from),
      points: out
    };
  };
  return {
    hours,
    paths: PATHS.map((p) => ({
      id: p.id, site: p.site, circuit: p.circuit, title: p.title, router: p.router, place: p.place,
      ports: p.ports.map((pt) => portOut(p, pt))
    }))
  };
}

module.exports = { start, response, PATHS };
