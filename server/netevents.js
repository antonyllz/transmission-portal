/* ═══════════════════════════════════════
   NETWORK EVENTS — Zabbix events that are NOT Amazon Leo
   (route / segment alarms) and the locality lookup list.

   Every router follows the Tely naming:  UF-LOC-SITE-...  e.g.
     host     PE-AIN-A01-BHM-RT-001
     trigger  Interface XGigabitEthernet0/0/24 - Core: PE-TIU-A01-BKB-RT-001 () [10Gbps] down
   → segment PE-AIN x PE-TIU (Aliança-PE x Timbaúba-PE), interface
     XGigabitEthernet0/0/24, 10Gbps.
   UF = state, LOC = Anatel locality code. Names come from the DWDM map
   (assets/js/network-data.js) plus the entries the team adds in the
   portal ("localities" collection).
   ═══════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const MAX_EVENTS = 5000;

const UF_NAMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

/* a device / site name: UF-LOC-<more parts> (e.g. PE-TIU-A01-BKB-RT-001 or PE-TIU-BKB-RT-001);
   UF must be a real state and LOC 3–4 letters (Anatel code) */
const NODE_RE = /\b([A-Z]{2})-([A-Z]{3,4})((?:-[A-Z0-9]+)+)/g;

function nodes(text) {
  const out = [];
  const s = String(text || '').toUpperCase();
  let m;
  NODE_RE.lastIndex = 0;
  while ((m = NODE_RE.exec(s))) {
    if (!UF_NAMES[m[1]]) continue;
    const site = /^-([A-Z]\d{2})\b/.exec(m[3]);
    out.push({ uf: m[1], loc: m[2], key: m[1] + '-' + m[2], site: m[1] + '-' + m[2] + (site ? '-' + site[1] : ''), device: m[0] });
  }
  return out;
}

/* host + trigger → { a, b, key, iface, speed, role } (b null when the far end isn't named) */
function parseSegment(ev) {
  const a = nodes(ev.host)[0] || nodes(ev.hostName)[0] || null;
  const far = nodes(ev.trigger).filter((n) => !a || n.device !== a.device);
  const b = (a && far.find((n) => n.key !== a.key)) || far[0] || null;
  const t = String(ev.trigger || '');
  const iface = (/\bInterface\s+([^\s,(:]+)/i.exec(t) || [])[1] || null;
  const speed = (/\[\s*([\d.,]+\s*[KMGT]?bps)\s*\]/i.exec(t) || [])[1] || null;
  const role  = (/-\s*([A-Za-zÀ-ú ]{2,20}):\s*[A-Z]{2}-[A-Z0-9]{2,5}-/.exec(t) || [])[1] || null;
  const key = a && b ? [a.key, b.key].sort().join(' x ') : a ? a.key : null;
  return { a, b, key, iface, speed: speed ? speed.replace(/\s+/g, '') : null, role: role ? role.trim() : null };
}

/* ── localities: DWDM map + a few known extras (read-only) + manual entries ── */
const EXTRA = {
  'PE-AIN': 'Aliança', 'PE-TIU': 'Timbaúba',
  'PE-SNH': 'Sanharó', 'PE-BJM': 'Belo Jardim', 'PE-VUS': 'Venturosa'   /* same as server/leofeed.js */
};
let MAP = null;
function mapLocalities() {
  if (MAP) return MAP;
  MAP = {};
  try {
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'network-data.js'), 'utf8'), ctx);
    (ctx.NET_SITES || []).forEach((s) => {
      const n = nodes(s.id)[0];
      if (n && !MAP[n.key]) MAP[n.key] = String(s.city).replace(/\s*\(.*\)\s*/, '').trim();
    });
  } catch (e) { /* map unavailable — extras + manual entries only */ }
  Object.entries(EXTRA).forEach(([k, v]) => { if (!MAP[k]) MAP[k] = v; });
  return MAP;
}

function localities(store) {
  const items = {};
  Object.entries(mapLocalities()).forEach(([key, name]) => {
    items[key] = { key, uf: key.slice(0, 2), code: key.slice(3), name, source: 'map' };
  });
  store.read('localities').forEach((l) => {
    const uf = String(l.uf || '').toUpperCase(), code = String(l.code || '').toUpperCase();
    if (!UF_NAMES[uf] || !code || !l.name) return;
    items[uf + '-' + code] = { key: uf + '-' + code, uf, code, name: String(l.name).trim(), source: 'manual' };
  });
  return items;
}

/* GET /api/network/localities */
function localitiesResponse(store) {
  const items = localities(store);
  const seen = {};
  store.read('netalarms').forEach((raw) => {
    const e = Object.assign({}, raw, parseSegment(raw));
    [e.a, e.b].forEach((n) => {
      if (!n || items[n.key]) return;
      const s = seen[n.key] || (seen[n.key] = { key: n.key, uf: n.uf, code: n.loc, count: 0, lastSeen: null });
      s.count++;
      if (!s.lastSeen || e.start > s.lastSeen) s.lastSeen = e.start;
    });
  });
  return {
    ufs: UF_NAMES,
    items: Object.values(items).sort((x, y) => x.key.localeCompare(y.key)),
    unknown: Object.values(seen).sort((x, y) => y.count - x.count)
  };
}

/* GET /api/network/events — active segment events + the ones resolved in the last 24h */
function eventsResponse(store) {
  const meta = store.read('netzbxmeta')[0] || null;
  const since = Date.now() - 24 * 3600000;
  const pub = (raw) => { const e = Object.assign({}, raw, parseSegment(raw)); return {
    id: e.eventId, host: e.host, trigger: e.trigger,
    severity: e.severity, severityName: e.severityName,
    status: e.status === 'problem' ? 'active' : 'resolved',
    acknowledged: !!e.acknowledged,
    start: e.start, end: e.end || null,
    a: e.a || null, b: e.b || null, key: e.key || null,
    iface: e.iface || null, speed: e.speed || null, role: e.role || null
  }; };
  /* segment alarms come from a router: events without a host (Zabbix 'Test' runs, manual webhook tests
     kept from before the split) aren't segments */
  const all = store.read('netalarms').filter((e) => e.host || e.hostName);
  return {
    generatedAt: new Date().toISOString(),
    receivingSince: meta ? meta.firstReceivedAt : null,
    lastReceivedAt: meta ? meta.lastReceivedAt : null,
    active: all.filter((e) => e.status === 'problem').map(pub),
    resolved: all.filter((e) => e.status !== 'problem' && new Date(e.end || e.start).getTime() >= since).map(pub)
  };
}

module.exports = { MAX_EVENTS, parseSegment, localitiesResponse, eventsResponse, UF_NAMES };
