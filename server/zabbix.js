/* ═══════════════════════════════════════
   ZABBIX WEBHOOK — receives problem / recovery events from a Zabbix
   "Webhook" media type. Events are matched to the Amazon Leo sites /
   circuits by searching their ids in the host, trigger, operational data
   and tags: those go to the "leoalarms" collection (Amazon Leo dashboard);
   everything else is a route/segment event and goes to "netalarms"
   (home "Eventos na rede"), with the segment parsed from the router names
   (see netevents.js). Hosts of the Zabbix host group PADTEC (sent by the
   media type as host_groups = {TRIGGER.HOSTGROUP.NAME}) are DWDM alarms:
   they go to "dwdmalarms" (home "Alarmes DWDM Padtec") before any of that.
   ═══════════════════════════════════════ */
'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const net    = require('./netevents');

const MAX_EVENTS = 3000;

/* Amazon Leo circuits (kept in sync with assets/js/leo-data.js) */
const CIRCUITS = {
  'RJOOCR964161':    'SLZ501',
  'SPOOCR964174':    'SLZ501',
  '21-90090-252671': 'CPV501',
  '21-90090-252668': 'CPV501'
};
const SITES = ['SLZ501', 'CPV501'];
const flat = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* shared secret: env ZBX_TOKEN, else a random token created once in the data dir */
function loadToken(dataDir) {
  if (process.env.ZBX_TOKEN) return process.env.ZBX_TOKEN;
  const f = path.join(dataDir, 'zabbix-token.txt');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(24).toString('hex') + '\n', { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* tags arrive as {EVENT.TAGSJSON} ([{tag, value}]) or as "k:v, k2:v2" ({EVENT.TAGS}) */
function parseTags(t) {
  if (Array.isArray(t)) return t.map((x) => ({ tag: String(x.tag || ''), value: String(x.value || '') }));
  if (typeof t === 'string' && t.trim()) {
    try { const j = JSON.parse(t); if (Array.isArray(j)) return parseTags(j); } catch (e) { /* plain text */ }
    return t.split(',').map((p) => { const i = p.indexOf(':'); return i < 0 ? { tag: p.trim(), value: '' } : { tag: p.slice(0, i).trim(), value: p.slice(i + 1).trim() }; }).filter((x) => x.tag);
  }
  return [];
}

function match(ev) {
  const tag = (name) => (ev.tags.find((t) => t.tag.toLowerCase() === name) || {}).value;
  const hay = flat([ev.host, ev.hostName, ev.trigger, ev.opdata, ev.tags.map((t) => t.tag + ' ' + t.value).join(' ')].join(' '));
  let circuit = Object.keys(CIRCUITS).find((c) => flat(tag('circuit')) === flat(c)) || Object.keys(CIRCUITS).find((c) => hay.indexOf(flat(c)) >= 0) || null;
  let site = (circuit && CIRCUITS[circuit]) || SITES.find((s) => flat(tag('site')) === s) || SITES.find((s) => hay.indexOf(s) >= 0) || null;
  return { site, circuit };
}

/* time: unix seconds, ISO, or Zabbix "YYYY.MM.DD" + "HH:MM:SS" in the Zabbix server's offset */
function toISO(ts, date, time, offset) {
  if (ts && /^\d{9,11}$/.test(String(ts))) return new Date(+ts * 1000).toISOString();
  if (ts && !isNaN(Date.parse(ts))) return new Date(ts).toISOString();
  if (date && time && /^\d{4}\.\d{2}\.\d{2}$/.test(date)) {
    const d = new Date(date.replace(/\./g, '-') + 'T' + time + (offset || '-03:00'));
    if (!isNaN(d)) return d.toISOString();
  }
  return null;
}

/* alarms that belong to no dashboard and are dropped on arrival:
   the core interfaces facing Amazon ("Interface et-0/0/22 - Core: Amazon {SLZ501 - OCARA} down")
   carry the Leo site code but aren't a Leo circuit nor a segment */
const DISCARD = [/\bCore:\s*Amazon\b/i];
/* the host group that marks DWDM Padtec equipment; groups arrive as "A, B, C" */
const DWDM_GROUP = (process.env.DWDM_GROUP || 'PADTEC').toUpperCase();
function groupsOf(b) {
  const g = b.host_groups || b.hostgroups || b.host_group || b.groups || '';
  return (Array.isArray(g) ? g : String(g).split(/\s*,\s*/)).map((x) => String(x).trim()).filter(Boolean);
}
const isDwdm = (ev) => ev.groups.some((g) => g.toUpperCase() === DWDM_GROUP) ||
  ev.tags.some((t) => /^(host_?group|group)$/i.test(t.tag) && t.value.toUpperCase() === DWDM_GROUP);

/* collections the webhook writes to, and their meta records */
const COLLS = ['leoalarms', 'netalarms', 'dwdmalarms'];
const META = { leoalarms: 'leozbxmeta', netalarms: 'netzbxmeta', dwdmalarms: 'dwdmzbxmeta' };
const TARGET = { leoalarms: 'amazon-leo', netalarms: 'trechos', dwdmalarms: 'dwdm-padtec' };

const discarded = (ev) => DISCARD.some((re) => re.test(String(ev.trigger || '')));

/* the Zabbix 'Test' button (and some operations) leave macros unresolved, e.g. '{HOST.HOST}' */
const MACRO = /^{[A-Z0-9_.#$]+}$/;

function handle(body, store) {
  const b = {};
  Object.keys(body || {}).forEach((k) => { const v = body[k]; b[k] = typeof v === 'string' && MACRO.test(v.trim()) ? '' : v; });
  const now = new Date().toISOString();
  const offset = b.tz_offset || '-03:00';
  const ev = {
    eventId:  String(b.event_id || b.eventid || ''),
    host:     String(b.host || ''),
    hostName: String(b.host_name || b.host_visible || ''),
    hostIp:   String(b.host_ip || ''),
    trigger:  String(b.trigger || b.event_name || ''),
    opdata:   String(b.opdata || ''),
    severity: Math.max(0, Math.min(5, parseInt(b.severity, 10) || 0)),
    severityName: String(b.severity_name || ''),
    tags:     parseTags(b.tags),
    groups:   groupsOf(b),
    url:      String(b.event_url || '')
  };
  if (!ev.eventId) throw new Error('event_id is required');
  /* nothing to show: Zabbix 'Test' runs (macros unresolved → host and trigger empty) */
  if (!ev.host && !ev.hostName && !ev.trigger) return { ok: true, ignored: 'no host / trigger (test event?)' };
  if (discarded(ev)) {
    console.log('zabbix: event ' + ev.eventId + ' host=' + (ev.host || '-') + ' → discarded (' + ev.trigger + ')');
    return { ok: true, ignored: 'discarded' };
  }
  const value  = String(b.event_value != null ? b.event_value : b.value).trim();   /* 1 = problem, 0 = recovery */
  const update = String(b.event_update || '0') === '1';
  /* recovery: {EVENT.VALUE} = 0, but also accept a status text ({EVENT.STATUS} = RESOLVED) or any
     recovery macro that came resolved (in problem messages they arrive unresolved → blanked above) */
  const isRecovery = value === '0' || /^(resolved|ok|recovered|recovery)$/i.test(value) ||
    /^resolved$/i.test(String(b.event_status || b.status || '').trim()) ||
    !!(b.recovery_ts || b.recovery_date || b.recovery_id || b.event_recovery_id);
  const dwdm = isDwdm(ev);
  const m = dwdm ? { site: null, circuit: null } : match(ev);
  const isLeo = !!(m.site || m.circuit);
  /* a real segment alarm always comes from a router (host); manual/webhook tests without one are dropped */
  if (!dwdm && !isLeo && !ev.host && !ev.hostName) return { ok: true, ignored: 'segment event without host (test?)' };
  const extra = dwdm ? {} : isLeo ? m : net.parseSegment(ev);

  /* the collection this event belongs to; a recovery/update follows the problem
     wherever it was stored (e.g. received before the split existed) */
  let coll = dwdm ? 'dwdmalarms' : isLeo ? 'leoalarms' : 'netalarms';
  let list = store.read(coll);
  let rec = list.find((x) => x.eventId === ev.eventId);
  if (!rec) {
    for (const other of COLLS.filter((c) => c !== coll)) {
      const olist = store.read(other);
      const orec = olist.find((x) => x.eventId === ev.eventId);
      if (orec) { coll = other; list = olist; rec = orec; break; }
    }
  }
  /* a recovery whose id doesn't match (media type sending {EVENT.RECOVERY.ID}, for instance):
     close the open problem with the same host + trigger */
  if (!rec && isRecovery) {
    for (const c of [coll, ...COLLS.filter((x) => x !== coll)]) {
      const l = c === coll ? list : store.read(c);
      const r = l.filter((x) => x.status === 'problem' && x.host === ev.host && x.trigger === ev.trigger)
        .sort((x, y) => String(y.start).localeCompare(String(x.start)))[0];
      if (r) { coll = c; list = l; rec = r; break; }
    }
  }
  const startISO = toISO(b.event_ts, b.event_date, b.event_time, offset) || now;

  if (isRecovery) {                                      /* recovery */
    const endISO = toISO(b.recovery_ts, b.recovery_date, b.recovery_time, offset) || now;
    if (!rec) { rec = Object.assign({}, ev, extra, { status: 'problem', start: startISO }); list.push(rec); }
    rec.status = 'resolved'; rec.end = endISO;
  } else if (update && rec) {                            /* acknowledge / comment on an existing problem */
    rec.acknowledged = String(b.ack || '').toLowerCase() === 'yes' || rec.acknowledged || false;
    if (b.update_message) rec.note = String(b.update_message).slice(0, 500);
  } else {                                               /* new problem (or a repeat of one) */
    if (!rec) { rec = Object.assign({}, ev, extra, { status: 'problem', start: startISO }); list.push(rec); }
    else Object.assign(rec, ev, isLeo ? (m.site ? m : {}) : extra, { status: 'problem' });
    /* severity can change while the problem is open (Zabbix "update") */
    rec.severity = ev.severity; rec.severityName = ev.severityName;
  }
  rec.receivedAt = now;

  list.sort((a, c) => String(c.start).localeCompare(String(a.start)));
  store.write(coll, list.slice(0, coll === 'netalarms' ? net.MAX_EVENTS : MAX_EVENTS));
  const metaName = META[coll];
  const meta = store.read(metaName)[0] || { received: 0 };
  meta.received = (meta.received || 0) + 1;
  meta.lastReceivedAt = now;
  if (!meta.firstReceivedAt) meta.firstReceivedAt = now;
  meta.lastHost = ev.host;
  store.write(metaName, [meta]);
  /* one line per event, so `docker compose logs | grep zabbix:` shows what arrives and where it went */
  console.log('zabbix: event ' + ev.eventId + ' value=' + value + (update ? ' update' : '') + ' host=' + (ev.host || '-') +
    ' → ' + TARGET[coll] + ' ' + rec.status + (rec.eventId !== ev.eventId ? ' (closed ' + rec.eventId + ' by host+trigger)' : ''));
  return { ok: true, eventId: rec.eventId, status: rec.status, target: TARGET[coll],
           site: rec.site, circuit: rec.circuit, segment: rec.key || null };
}

/* Dashboard feed (GET /api/leo/status): Amazon Leo events only — no host names, IPs,
   tags or operational data. Events tied only to a site (no circuit id) count for both
   circuits of that site. Severity High+ = outage, Warning/Average = degradation;
   Information / Not classified are left out. */
const CIRCUIT_IDS = Object.keys(CIRCUITS);
function publicStatus(store) {
  const meta = store.read('leozbxmeta')[0] || null;
  const since = Date.now() - 90 * 86400000;
  const events = store.read('leoalarms')
    .filter((a) => a.severity >= 2 && ((a.circuit && CIRCUIT_IDS.indexOf(a.circuit) >= 0) || (!a.circuit && SITES.indexOf(a.site) >= 0)))
    .filter((a) => a.status === 'problem' || new Date(a.end || a.start).getTime() >= since)
    .map((a) => ({
      id: crypto.createHash('sha1').update(String(a.eventId)).digest('hex').slice(0, 10),
      circuit: a.circuit || null, site: a.circuit ? CIRCUITS[a.circuit] : a.site,
      problem: String(a.trigger || '').slice(0, 160),
      type: a.severity >= 4 ? 'outage' : 'degradation',
      status: a.status === 'problem' ? 'ongoing' : 'resolved',
      start: a.start, end: a.end || null
    }));
  const metrics = store.read('leometrics').filter((m) => CIRCUIT_IDS.indexOf(m.circuit) >= 0)
    .map((m) => ({ circuit: m.circuit, rx: m.rx === undefined ? null : m.rx, loss: !!m.loss, at: m.at }));   /* history via /api/leo/rx */
  return {
    generatedAt: new Date().toISOString(),
    monitoringSince: meta ? (meta.firstReceivedAt || meta.lastReceivedAt) : null,
    events, metrics
  };
}

/* Optical Rx power per circuit (NMS collector in nms.js, or POST /api/zabbix/metric, same token):
   { circuit, rx_dbm, ts?, loss? } or { items: [ ... ] }. loss = port without signal (rx null).
   Keeps the latest value and RX_DAYS of history: one sample per RX_STEP, plus every loss/recovery change. */
const RX_DAYS = 30, RX_STEP = 5 * 60000;
function metric(body, store) {
  const items = Array.isArray(body && body.items) ? body.items : [body || {}];
  const list = store.read('leometrics'), now = Date.now();
  let n = 0;
  items.forEach((it) => {
    const c = CIRCUIT_IDS.find((x) => flat(x) === flat(it.circuit));
    const v = parseFloat(it.rx_dbm != null ? it.rx_dbm : it.value);
    const loss = !!it.loss || !isFinite(v);
    if (!c || (!isFinite(v) && !it.loss)) return;
    const at = toISO(it.ts) || new Date().toISOString();
    let m = list.find((x) => x.circuit === c);
    if (!m) { m = { circuit: c, history: [] }; list.push(m); }
    const rx = loss ? null : Math.round(v * 100) / 100;
    const h = m.history || [], last = h[h.length - 1];
    if (!last || (last[1] === null) !== loss || new Date(at) - new Date(last[0]) >= RX_STEP) h.push([at, rx]);
    m.rx = rx; m.loss = loss; m.at = at;
    m.history = h.filter((x) => now - new Date(x[0]).getTime() < RX_DAYS * 86400000);
    n++;
  });
  store.write('leometrics', list);
  return { ok: true, stored: n };
}

/* Rx history for the dashboard chart: GET /api/leo/rx?circuit=<id>&days=<1..30> */
function rxHistory(q, store) {
  const c = CIRCUIT_IDS.find((x) => flat(x) === flat(q.circuit));
  if (!c) throw new Error('unknown circuit');
  const days = Math.min(RX_DAYS, Math.max(1, parseInt(q.days, 10) || 1)), from = Date.now() - days * 86400000;
  const m = store.read('leometrics').find((x) => x.circuit === c) || { history: [] };
  return { circuit: c, days, rx: m.rx === undefined ? null : m.rx, loss: !!m.loss, at: m.at || null,
           points: (m.history || []).filter((x) => new Date(x[0]).getTime() >= from) };
}

/* One-off at startup: events stored in "leoalarms" before the split that don't belong
   to Amazon Leo (no site / circuit) move to "netalarms", with their segment parsed. */
function migrate(store) {
  /* drop alarms that are discarded now but were stored before the rule existed */
  ['leoalarms', 'netalarms'].forEach((c) => {
    const l = store.read(c), keep = l.filter((a) => !discarded(a));
    if (keep.length !== l.length) { store.write(c, keep); console.log('zabbix: removed ' + (l.length - keep.length) + ' discarded events from ' + c); }
  });
  const leo = store.read('leoalarms');
  const move = leo.filter((a) => !a.site && !a.circuit);
  if (!move.length) return 0;
  const netList = store.read('netalarms');
  const have = new Set(netList.map((x) => x.eventId));
  move.forEach((a) => { if (!have.has(a.eventId)) netList.push(Object.assign({}, a, net.parseSegment(a))); });
  netList.sort((a, c) => String(c.start).localeCompare(String(a.start)));
  store.write('netalarms', netList.slice(0, net.MAX_EVENTS));
  store.write('leoalarms', leo.filter((a) => a.site || a.circuit));
  return move.length;
}

/* GET /api/network/dwdm — DWDM Padtec alarms (host group PADTEC): open ones and
   those resolved in the last 24 h */
function dwdmResponse(store) {
  const meta = store.read('dwdmzbxmeta')[0] || null;
  const since = Date.now() - 24 * 3600000;
  const pub = (e) => ({
    id: e.eventId, host: e.hostName || e.host, trigger: e.trigger, opdata: e.opdata || '',
    severity: e.severity, severityName: e.severityName,
    status: e.status === 'problem' ? 'active' : 'resolved',
    acknowledged: !!e.acknowledged,            /* acknowledged in Zabbix */
    ackAt: e.portalAck || null,                /* acknowledged in the portal */
    start: e.start, end: e.end || null
  });
  const all = store.read('dwdmalarms');
  return {
    group: DWDM_GROUP,
    receivingSince: meta ? meta.firstReceivedAt : null,
    lastReceivedAt: meta ? meta.lastReceivedAt : null,
    active: all.filter((e) => e.status === 'problem').map(pub),
    resolved: all.filter((e) => e.status !== 'problem' && new Date(e.end || e.start).getTime() >= since).map(pub)
  };
}

/* POST /api/network/dwdm/ack {id, ack} — acknowledge (or undo) a DWDM alarm in the portal;
   it stays acknowledged while the problem is open, even if Zabbix repeats it */
function dwdmAck(body, store) {
  const id = String((body && body.id) || '');
  const list = store.read('dwdmalarms');
  const rec = list.find((e) => e.eventId === id);
  if (!rec) throw new Error('alarm not found');
  rec.portalAck = body.ack === false ? null : new Date().toISOString();
  store.write('dwdmalarms', list);
  console.log('dwdm: alarm ' + id + (rec.portalAck ? ' acknowledged' : ' unacknowledged') + ' in the portal');
  return { ok: true, id, ackAt: rec.portalAck };
}

module.exports = { dwdmAck, dwdmResponse, loadToken, sameSecret, handle, publicStatus, metric, rxHistory, migrate };
