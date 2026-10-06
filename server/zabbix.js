/* ═══════════════════════════════════════
   ZABBIX WEBHOOK — receives problem / recovery events from a Zabbix
   "Webhook" media type and keeps them in the "leoalarms" collection.
   Events are matched to the Amazon Leo sites / circuits by searching
   their ids in the host, trigger, operational data and tags.
   ═══════════════════════════════════════ */
'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

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

function handle(body, store) {
  const b = body || {};
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
    url:      String(b.event_url || '')
  };
  if (!ev.eventId) throw new Error('event_id is required');
  const value  = String(b.event_value != null ? b.event_value : b.value);   /* 1 = problem, 0 = recovery */
  const update = String(b.event_update || '0') === '1';
  const m = match(ev);

  const list = store.read('leoalarms');
  let rec = list.find((x) => x.eventId === ev.eventId);
  const startISO = toISO(b.event_ts, b.event_date, b.event_time, offset) || now;

  if (value === '0') {                                   /* recovery */
    const endISO = toISO(b.recovery_ts, b.recovery_date, b.recovery_time, offset) || now;
    if (!rec) { rec = Object.assign({}, ev, m, { status: 'problem', start: startISO }); list.push(rec); }
    rec.status = 'resolved'; rec.end = endISO;
  } else if (update && rec) {                            /* acknowledge / comment on an existing problem */
    rec.acknowledged = String(b.ack || '').toLowerCase() === 'yes' || rec.acknowledged || false;
    if (b.update_message) rec.note = String(b.update_message).slice(0, 500);
  } else {                                               /* new problem (or a repeat of one) */
    if (!rec) { rec = Object.assign({}, ev, m, { status: 'problem', start: startISO }); list.push(rec); }
    else Object.assign(rec, ev, m.site ? m : {}, { status: 'problem' });
  }
  rec.receivedAt = now;

  list.sort((a, c) => String(c.start).localeCompare(String(a.start)));
  store.write('leoalarms', list.slice(0, MAX_EVENTS));
  const meta = store.read('leozbxmeta')[0] || { received: 0 };
  meta.received = (meta.received || 0) + 1;
  meta.lastReceivedAt = now;
  meta.lastHost = ev.host;
  store.write('leozbxmeta', [meta]);
  return { ok: true, eventId: rec.eventId, status: rec.status, site: rec.site, circuit: rec.circuit };
}

module.exports = { loadToken, sameSecret, handle };
