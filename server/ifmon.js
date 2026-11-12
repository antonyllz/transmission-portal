/* ═══════════════════════════════════════
   CROSS-CONNECT MONITOR — the router ports that carry an Amazon Leo circuit
   through our network, read over SNMP v2c every minute (IFMON_INTERVAL) and
   shown on the Amazon Leo dashboard as one path.

   SLZ501 ↔ Equinix SP4 (SPOOCR964174) crosses two CCCs (circuit cross-connects):

     SLZ501 ── et-0/0/28 [PB-CGE-A01-BKB-RT-001] et-0/0/27 ══ Eletronet ══
            ══ 50|100GE0/3/0 [SP-BRE-A02-BKB-RT-001] 50|100GE0/6/0 ── AWS SP4

   Each hop is a router whose first port faces the left of the drawing (toward
   the Leo site) and the second faces the right (toward SP4). Watching every
   port pins a flap to a segment: the Amazon Leo side, the Eletronet transport
   (both Eletronet ports at once) or the AWS SP4 side.

   Per port: ifOperStatus / ifAdminStatus, ifHCIn/OutOctets (→ bps),
   ifHighSpeed, ifAlias and ifLastChange. With sysUpTime, ifLastChange gives
   the exact time of the port's last transition — so a flap shorter than the
   poll interval (down and back up between two readings) is still caught.
   ifIndex is found by name (ifName, else ifDescr) and re-checked every poll.
   Each router is polled on its own: one not answering doesn't hide the other.
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
    left:  { name: 'SLZ501', sub: 'Amazon Leo · Ocara, CE' },
    right: { name: 'Equinix SP4', sub: 'AWS SP4 infrastructure' },
    segments: ['Amazon Leo', 'Eletronet', 'AWS SP4'],          /* left end ─ hop ─ … ─ right end */
    hops: [
      {
        router: 'PB-CGE-A01-BKB-RT-001', short: 'PB-CGE', place: 'Campina Grande, PB', ip: '198.18.0.64',
        ports: [   /* keys a/b kept from the first version (history) */
          { key: 'b', ifName: 'et-0/0/28', side: 'Amazon Leo' },
          { key: 'a', ifName: 'et-0/0/27', ifIndex: 561, side: 'Eletronet' }
        ]
      },
      {
        router: 'SP-BRE-A02-BKB-RT-001', short: 'SP-BRE', place: 'São Paulo, SP', ip: '198.18.0.20',
        ports: [
          { key: 'c', ifName: '50|100GE0/3/0', side: 'Eletronet' },
          { key: 'd', ifName: '50|100GE0/6/0', side: 'AWS SP4' }
        ]
      }
    ]
  }
];

const KEEP_MS = 7 * 86400000;           /* history: 7 days at 1 min */
const MAX_EVENTS = 500;
const AGENT_GRACE = 30000;              /* ticks (5 min): an ifLastChange this close to the agent start = "before it" */
const SYS_UPTIME = '1.3.6.1.2.1.1.3.0';
const IF_NAME = '1.3.6.1.2.1.31.1.1.1.1';
const IF_DESCR = '1.3.6.1.2.1.2.2.1.2';
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
const same = (a, b) => String(a || '').replace(/\s+/g, '').toLowerCase() === String(b || '').replace(/\s+/g, '').toLowerCase();

function loadCommunity(dataDir) {
  if (process.env.SNMP_COMMUNITY) return process.env.SNMP_COMMUNITY.trim();
  const f = path.join(dataDir, 'snmp-community.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
}

const idx = {};                          /* "<path>:<port>" → ifIndex found by name */
const byDescr = new Set();               /* ports found by ifDescr (their ifName differs) */
async function resolveIndexes(p, hop, community, opts) {
  const missing = hop.ports.filter((pt) => !idx[p.id + ':' + pt.key]);
  if (!missing.length) return;
  let names = await snmp.walk(hop.ip, community, IF_NAME, opts);
  let descr = null;
  for (const pt of missing) {
    let hit = Object.keys(names).find((k) => same(names[k], pt.ifName));
    if (!hit) {                                              /* some boxes only have it in ifDescr */
      if (!descr) descr = await snmp.walk(hop.ip, community, IF_DESCR, opts);
      hit = Object.keys(descr).find((k) => same(descr[k], pt.ifName));
      if (hit) byDescr.add(p.id + ':' + pt.key);
    }
    if (hit) idx[p.id + ':' + pt.key] = +hit.split('.').pop();
    else if (pt.ifIndex) idx[p.id + ':' + pt.key] = pt.ifIndex;
    else throw new Error(pt.ifName + ' not found on ' + hop.router);
  }
}

const iso = (ms) => new Date(ms).toISOString();

async function pollHop(p, hop, community, store, opts) {
  const now = Date.now();
  const all = store.read('ifmon');
  const recOf = (pt) => {
    const id = p.id + ':' + pt.key;
    let r = all.find((x) => x.id === id);
    if (!r) { r = { id, history: [], events: [] }; all.push(r); }
    return r;
  };
  try {
    await resolveIndexes(p, hop, community, opts);
    const oids = [SYS_UPTIME];
    hop.ports.forEach((pt) => Object.values(OID).forEach((o) => oids.push(o + idx[p.id + ':' + pt.key])));
    const v = await snmp.get(hop.ip, community, oids, opts);
    const sysUp = v[SYS_UPTIME];

    for (const pt of hop.ports) {
      const i = idx[p.id + ':' + pt.key], r = recOf(pt);
      const g = Object.fromEntries(Object.keys(OID).map((k) => [k, v[OID[k] + i]]));
      if (g.oper === null || g.oper === undefined || (g.name && !same(g.name, pt.ifName) && !byDescr.has(p.id + ':' + pt.key))) {
        delete idx[p.id + ':' + pt.key]; byDescr.delete(p.id + ':' + pt.key);   /* index changed (reboot / new card): look again next time */
        throw new Error(pt.ifName + ' moved — re-resolving the ifIndex');
      }
      const status = g.admin === 2 ? 'admin-down' : OPER[g.oper] || 'unknown';
      /* when the last transition happened, from the router's own clock. sysUpTime counts from
         the start of the SNMP agent (on Junos it restarts with snmpd, e.g. after an SNMP config
         commit), so a change older than the agent shows up as ~0 ticks: then the real time is
         unknown — only "before the agent started" */
      const agentStart = typeof sysUp === 'number' ? now - sysUp * 10 : null;
      const known = typeof sysUp === 'number' && typeof g.last === 'number' && g.last > AGENT_GRACE && sysUp >= g.last;
      const changeAt = known ? now - (sysUp - g.last) * 10 : null;
      const before = !known && agentStart ? iso(agentStart) : null;

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
      const label = hop.router + ' ' + pt.ifName + ' (' + pt.side + ')';
      const sinceAgent = !r.events.length || !agentStart || Date.parse(r.events[0].at) < agentStart;
      if (r.status === undefined) {
        r.statusSince = changeAt ? iso(changeAt) : before || iso(now);   /* first reading: the router knows since when */
        r.sinceBefore = !changeAt && !!before;
      } else if (r.status !== status) {
        const ev = { at, type: status === 'up' ? 'up' : 'down', status };
        if (ev.type === 'up') { const d = r.events.find((e) => e.type === 'down'); if (d) ev.dur = Math.max(0, Date.parse(at) - Date.parse(d.at)); }
        r.events.unshift(ev);
        r.statusSince = at; r.sinceBefore = false;
        console.log('ifmon: ' + label + ' is ' + status);
      } else if (!rebooted && changeAt && (r.lastChangeAt ? Math.abs(changeAt - Date.parse(r.lastChangeAt)) > 1500 : r.lastChangeBefore)) {
        /* same status, but the port changed in between: a flap shorter than the poll */
        r.events.unshift({ at, type: 'flap', status });
        r.statusSince = at; r.sinceBefore = false;
        console.log('ifmon: ' + label + ' flapped');
      } else if (!changeAt && before && sinceAgent) {
        /* nothing happened since the agent started: the state is older than that (fixes records
           written before this check existed, which took the agent start for the last change) */
        r.statusSince = before; r.sinceBefore = true;
      }
      r.events = r.events.slice(0, MAX_EVENTS);
      Object.assign(r, {
        status, ok: true, error: null, polledAt: iso(now), sysUp,
        lastChangeAt: changeAt ? iso(changeAt) : null,
        lastChangeBefore: changeAt ? null : before,
        alias: g.alias || '', speedMbps: typeof g.speed === 'number' ? g.speed : null, ifIndex: i,
        inBps, outBps
      });
      r.history.push([iso(now), inBps, outBps, status === 'up' ? 1 : 0]);
    }
  } catch (e) {
    for (const pt of hop.ports) {
      const r = recOf(pt);
      if (r.ok !== false) console.log('ifmon: ' + hop.router + ' poll failed — ' + e.message);
      Object.assign(r, { ok: false, error: e.message, failedAt: iso(now) });
      r.history.push([iso(now), null, null, null]);
    }
  }
  for (const pt of hop.ports) { const r = recOf(pt); r.history = r.history.filter((h) => now - Date.parse(h[0]) <= KEEP_MS); }
  store.write('ifmon', all);
}

function start(dataDir, store) {
  const community = loadCommunity(dataDir);
  if (!community) { console.log('Cross-connect monitor off (no SNMP_COMMUNITY / snmp-community.txt)'); return; }
  const every = (+process.env.IFMON_INTERVAL || 60) * 1000;
  const test = process.env.IFMON_TEST_PORT;   /* tests: every router is a fake agent on 127.0.0.1:<port + hop> */
  const opts = (k) => (test ? { port: +test + k, timeout: 1500, retries: 0 } : { timeout: 4000, retries: 1 });
  const hostOf = (h) => (test ? Object.assign({}, h, { ip: '127.0.0.1' }) : h);
  /* routers one after the other (the store is a plain JSON file) */
  const run = async () => {
    for (const p of PATHS) for (let k = 0; k < p.hops.length; k++) {
      await pollHop(p, hostOf(p.hops[k]), community, store, opts(k)).catch((e) => console.log('ifmon: ' + e.message));
    }
  };
  console.log('Cross-connect monitor on: ' + PATHS.map((p) => p.hops.map((h) => h.router + ' ' + h.ports.map((x) => x.ifName).join(' ⇄ ')).join(', ')).join('; ') + ' every ' + every / 1000 + 's');
  run();
  setInterval(run, every);
}

/* GET /api/leo/ifmon?hours=24 (or ?from=&to= in epoch ms, for the chart zoom) — per path: each hop with its two ports (state, ≤ 360 averaged points, events) */
function response(q, store) {
  const hours = Math.min(168, Math.max(1, parseInt(q.hours, 10) || 24));
  /* zoom: an explicit window (?from=&to=, epoch ms) instead of the last N hours */
  const now = Date.now();
  const zf = parseInt(q.from, 10), zt = parseInt(q.to, 10);
  const zoom = zf > 0 && zt > zf;
  const from = zoom ? Math.max(zf, now - KEEP_MS) : now - hours * 3600000;
  const to = zoom ? Math.min(zt, now) : now;
  const recs = store.read('ifmon');
  const portOut = (p, hop, pt, k) => {
    const r = recs.find((x) => x.id === p.id + ':' + pt.key) || {};
    const pts = (r.history || []).filter((h) => { const t = Date.parse(h[0]); return t >= from && t <= to; });
    const step = Math.max(1, Math.ceil(pts.length / 360)), out = [];
    for (let i = 0; i < pts.length; i += step) {
      const b = pts.slice(i, i + step);
      const avg = (j) => { const v = b.map((x) => x[j]).filter((x) => x !== null); return v.length ? Math.round(v.reduce((a, c) => a + c, 0) / v.length) : null; };
      const up = b.map((x) => x[3]).filter((x) => x !== null);
      out.push([b[0][0], avg(1), avg(2), up.length ? Math.min.apply(null, up) : null]);
    }
    const peak = (j) => pts.reduce((m, x) => (x[j] !== null && x[j] > m ? x[j] : m), 0);
    return {
      key: pt.key, ifName: pt.ifName, side: pt.side, facing: k === 0 ? 'left' : 'right',
      router: hop.router, short: hop.short, ifIndex: r.ifIndex || pt.ifIndex || null,
      alias: r.alias || '', speedMbps: r.speedMbps ?? null,
      status: r.status || null, statusSince: r.statusSince || null, sinceBefore: !!r.sinceBefore,
      lastChangeAt: r.lastChangeAt || null, lastChangeBefore: r.lastChangeBefore || null,
      inBps: r.inBps ?? null, outBps: r.outBps ?? null, peakIn: peak(1), peakOut: peak(2),
      ok: r.ok !== false, error: r.error || null, polledAt: r.polledAt || null, failedAt: r.failedAt || null,
      events: (r.events || []).filter((e) => { const t = Date.parse(e.at); return t >= from && t <= to; }),
      points: out
    };
  };
  return {
    hours, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    paths: PATHS.map((p) => ({
      id: p.id, site: p.site, circuit: p.circuit, title: p.title, left: p.left, right: p.right, segments: p.segments,
      hops: p.hops.map((h) => {
        const ports = h.ports.map((pt, k) => portOut(p, h, pt, k));
        return { router: h.router, short: h.short, place: h.place, ok: ports.every((x) => x.ok), ports };
      })
    }))
  };
}

module.exports = { start, response, PATHS };
