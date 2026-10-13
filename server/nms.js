/* ═══════════════════════════════════════
   AMAZON LEO — Rx power collector (Padtec NMS API)
   Every NMS_INTERVAL s, reads the transponders that face the Amazon Leo
   equipment and stores the "Pin (Port N)" of each circuit through
   zabbix.metric() (latest value + 24 h history → dashboard Rx panel).
   Token: env NMS_TOKEN or server/data/nms-token.txt (not versioned).
   No token → collector stays off.
   ═══════════════════════════════════════ */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), https = require('https');

const BASE     = process.env.NMS_URL || 'http://187.33.233.106:8181';
const INTERVAL = Math.max(30, parseInt(process.env.NMS_INTERVAL, 10) || 120) * 1000;
const NMS_TZ   = process.env.NMS_TZ || '-03:00';   /* NMS timestamps are local time (BRT) */

/* transponder card → { measureName: circuit } */
const CARDS = {
  'TM800G-LT#287':  { 'Pin (Port 2)': 'RJOOCR964161', 'Pin (Port 3)': 'SPOOCR964174' },       /* SLZ501 Ocara */
  'TM800G-LT#1794': { 'Pin (Port 1)': '21-90090-252671', 'Pin (Port 3)': '21-90090-252668' }  /* CPV501 Sanharó */
};

function loadToken(dataDir) {
  if (process.env.NMS_TOKEN) return process.env.NMS_TOKEN.trim();
  try { return fs.readFileSync(path.join(dataDir, 'nms-token.txt'), 'utf8').trim(); } catch (e) { return ''; }
}

function getJSON(url, token) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { accept: 'application/json', Authorization: token }, timeout: 20000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function stamp(s) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(s || '');
  return m ? new Date(m[1] + 'T' + m[2] + NMS_TZ).toISOString() : undefined;
}

async function collect(token, metric) {
  const items = [];
  for (const card of Object.keys(CARDS)) {
    const url = BASE + '/nms-api/v1/measures/state?cardFamily=transponder&cardIsUp=true&cardUid=' + encodeURIComponent(card) + '&page=0&size=300';
    const list = await getJSON(url, token);
    const rows = Array.isArray(list) ? list : (list && list.content) || [];
    rows.forEach((r) => {
      const circuit = CARDS[card][r.measureName];
      if (circuit && r.measureValue != null && r.measureValue !== '') items.push({ circuit, rx_dbm: r.measureValue, ts: stamp(r.updatedAt) });
    });
  }
  return metric({ items });
}

function start(dataDir, metric) {
  const token = loadToken(dataDir);
  if (!token) { console.log('NMS Rx collector off (no NMS_TOKEN / nms-token.txt)'); return; }
  let fails = 0;
  const run = () => collect(token, metric)
    .then((r) => { if (fails) console.log('NMS Rx collector back: ' + r.stored + ' values'); fails = 0; })
    .catch((e) => { if (fails++ % 30 === 0) console.error('NMS Rx collector: ' + e.message); });
  console.log('NMS Rx collector on: ' + BASE + ' every ' + INTERVAL / 1000 + ' s');
  run();
  setInterval(run, INTERVAL).unref();
}

module.exports = { start, collect, CARDS };
