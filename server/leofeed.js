/* ═══════════════════════════════════════
   AMAZON LEO — segment feed for Power Automate (RSS, standard connector)
   GET /api/leo/feed?circuit=<id>&token=<feed token>[&at=<ISO time>]
   Returns the Zabbix alarm affecting the circuit at that moment (active, or
   ended in the 2 h before) as RSS items: title = segment ("A x B"),
   description = ready-to-send English message. No alarm → one item
   "No events on the route". Token: env FEED_TOKEN or server/data/feed-token.txt.
   ═══════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const CIRCUITS = { RJOOCR964161: 'SLZ501', SPOOCR964174: 'SLZ501', '21-90090-252671': 'CPV501', '21-90090-252668': 'CPV501' };
const LOOKBACK = 2 * 3600e3;

/* site names come from the DWDM map (assets/js/network-data.js) + a few extras */
const EXTRA = { 'PE-SNH-A01': ['Sanharó', 'PE'], 'PE-BJM-A01': ['Belo Jardim', 'PE'], 'PE-VUS-A01': ['Venturosa', 'PE'] };
let CITY = null;
function cities() {
  if (CITY) return CITY;
  CITY = {};
  try {
    const ctx = {}; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'network-data.js'), 'utf8'), ctx);
    (ctx.NET_SITES || []).forEach((s) => { CITY[s.id] = [String(s.city).replace(/\s*\(.*\)\s*/, ''), s.uf]; });
  } catch (e) { /* map unavailable — codes are used */ }
  Object.assign(CITY, EXTRA);
  return CITY;
}
function place(code) { const c = cities()[code]; return c ? c[0] + ' (' + c[1] + ')' : code; }

/* "PB-CGE-A01 x SP-SPO-A01 down!" → { codes, text: "between Campina Grande (PB) and São Paulo (SP)" } */
function segment(problem) {
  const m = /([A-Z]{2}-[A-Z]{3,4}-A\d{2})\s*(?:\([^)]*\))?\s*x\s*([A-Z]{2}-[A-Z]{3,4}-A\d{2})/i.exec(problem || '');
  if (!m) return { codes: String(problem || '').replace(/\s*down!?\s*$/i, '').trim(), text: 'on our transport network' };
  return { codes: m[1] + ' x ' + m[2], text: 'between ' + place(m[1]) + ' and ' + place(m[2]) };
}

function utc(iso) { return new Date(iso).toISOString().slice(11, 16) + ' UTC'; }

const TPL = {
  ongoing: [
    'We have identified a fiber disruption on the segment {seg}, impacting circuit {cid} since {since}. Our field team has been dispatched and is working on the restoration. We will keep you updated on the progress.',
    'Our monitoring detected a fiber cut on the segment {seg} affecting circuit {cid} (since {since}). A technical team is already working to restore the service. Further updates will follow.',
    'Please be advised that circuit {cid} is impacted by a fiber disruption on the segment {seg}, detected at {since}. Our team is actively working on the repair and we will share updates as soon as possible.',
    'We confirm an outage on the segment {seg}, which is affecting circuit {cid} since {since}. Our field operations team is engaged and working on the restoration.',
    'A fiber break has been identified on the segment {seg}, impacting circuit {cid} as of {since}. Our team has been mobilized and restoration activities are in progress.'
  ],
  resolved: [
    'We identified a fiber disruption on the segment {seg} that affected circuit {cid} from {since} to {until}. The service has been restored and the circuit is operating normally. A detailed RFO will follow.',
    'Circuit {cid} was impacted by a disruption on the segment {seg} between {since} and {until}. The segment is now restored and the service is stable. We will send the RFO with further details.'
  ],
  none: [
    'We have not identified any events along the route of circuit {cid}. Our team will start a more detailed analysis and will update you shortly.',
    'No events were identified along the route of circuit {cid}. We are starting a more detailed investigation and will keep you informed.',
    'Our initial checks did not identify any events along the route of circuit {cid}. A more in-depth analysis is now under way and we will share the results as soon as possible.',
    'At this time, no events have been detected along the route of circuit {cid}. Our team will proceed with a detailed analysis and will provide an update shortly.'
  ]
};
function pick(list, seed) { return list[crypto.createHash('md5').update(seed).digest()[0] % list.length]; }
function fill(t, v) { return t.replace(/\{(\w+)\}/g, (_, k) => v[k] || ''); }
function x(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function find(store, circuit, atMs) {
  const site = CIRCUITS[circuit];
  return store.read('leoalarms')
    .filter((a) => a.severity >= 2 && (a.circuit === circuit || (!a.circuit && a.site === site)))
    .filter((a) => {
      const s = new Date(a.start).getTime(), e = a.end ? new Date(a.end).getTime() : Infinity;
      return s <= atMs && e >= atMs - LOOKBACK;   /* active at that time, or ended shortly before */
    })
    .sort((a, b) => (a.status === 'problem' ? 0 : 1) - (b.status === 'problem' ? 0 : 1) || b.severity - a.severity || String(b.start).localeCompare(String(a.start)));
}

function feed(q, store) {
  const norm = (v) => String(v || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const circuit = Object.keys(CIRCUITS).find((c) => norm(c) === norm(q.circuit));
  if (!circuit) throw new Error('unknown circuit');
  const at = q.at && !isNaN(Date.parse(q.at)) ? Date.parse(q.at) : Date.now();
  const hits = find(store, circuit, at);
  const items = hits.length ? hits.slice(0, 5).map((a) => {
    const sg = segment(a.trigger), on = a.status === 'problem' || !a.end || Date.parse(a.end) > at;
    const msg = fill(pick(TPL[on ? 'ongoing' : 'resolved'], a.eventId + circuit), { seg: sg.text, cid: circuit, since: utc(a.start), until: a.end ? utc(a.end) : '' });
    return { title: sg.codes, desc: msg, date: a.start, guid: 'leo-' + crypto.createHash('sha1').update(String(a.eventId)).digest('hex').slice(0, 12) };
  }) : [{ title: 'No events on the route', desc: fill(pick(TPL.none, circuit + Math.floor(at / 60000)), { cid: circuit }), date: new Date(at).toISOString(), guid: 'none-' + circuit + '-' + Math.floor(at / 60000) }];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
    + '<title>Amazon Leo ' + x(circuit) + '</title><link>http://transmission-portal/</link><description>Segment in alarm for ' + x(circuit) + '</description>'
    + items.map((i) => '<item><title>' + x(i.title) + '</title><description>' + x(i.desc) + '</description><pubDate>' + new Date(i.date).toUTCString() + '</pubDate><guid isPermaLink="false">' + i.guid + '</guid></item>').join('')
    + '</channel></rss>\n';
}

function loadFeedToken(dataDir) {
  if (process.env.FEED_TOKEN) return process.env.FEED_TOKEN;
  const f = path.join(dataDir, 'feed-token.txt');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(18).toString('hex') + '\n', { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

module.exports = { feed, loadFeedToken, segment };
