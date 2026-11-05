/* ═══════════════════════════════════════
   PADTEC ALARMS — home "Eventos na rede" panel (Padtec NMS API)
   Every PADTEC_INTERVAL s reads the active alarms
     GET /nms-api/v1/alarm/state?alarmIsActive=true&page=N&size=1000
   and keeps only the ones the team watches, by alarm name:
     • "Via A" / "Via B",
       "Falha interna de alimentação" → energia (power feed failure)
     • "Temperatura"         → temperatura
     • "Tempo de resposta"   → resposta     (equipment not answering the NMS)
   Snapshot stored in the "padtecalarms" collection, served by
   GET /api/network/padtec. Same NMS address / token as nms.js
   (env NMS_URL, NMS_TOKEN or server/data/nms-token.txt).
   ═══════════════════════════════════════ */
'use strict';
const nms = require('./nms');

const INTERVAL = Math.max(30, parseInt(process.env.PADTEC_INTERVAL, 10) || 60) * 1000;
const PAGE = 1000, MAX_PAGES = 20;

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* alarm name → category, or null when the alarm isn't one we show */
function category(name) {
  const n = fold(name);
  if (/\bvia [ab]\b/.test(n) || n.indexOf('falha interna de alimentacao') >= 0) return 'energia';
  if (n.indexOf('temperatura') >= 0) return 'temperatura';
  if (n.indexOf('tempo de resposta') >= 0) return 'resposta';
  return null;
}

const SEVERITY = { CRITICAL: 'critical', MAJOR: 'major', MINOR: 'minor', WARNING: 'warning' };

function pick(r) {
  const cat = category(r.alarmName);
  if (!cat || r.alarmIsActive === false) return null;
  return {
    id: String(r.alarmUid || r.alarmOid),
    name: String(r.alarmName || ''),
    category: cat,
    severity: SEVERITY[String(r.alarmSeverity || '').toUpperCase()] || 'warning',
    site: String(r.locationSite || ''),
    card: String(r.cardUid || ''),
    model: String(r.cardModel || ''),
    family: String(r.cardFamily || ''),
    resource: String(r.alarmResource || r.port || ''),
    start: nms.stamp(r.alarmStartDate) || null,
    acknowledged: !!r.alarmAckDate,
    ackAt: nms.stamp(r.alarmAckDate) || null
  };
}

async function fetchActive(token) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await nms.getJSON(nms.BASE + '/nms-api/v1/alarm/state?alarmIsActive=true&page=' + page + '&size=' + PAGE, token);
    const rows = Array.isArray(list) ? list : (list && list.content) || [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

function start(dataDir, store) {
  const token = nms.loadToken(dataDir);
  if (!token) {
    store.write('padtecmeta', [{ configured: false }]);
    console.log('Padtec alarm collector off (no NMS_TOKEN / nms-token.txt)');
    return;
  }
  let fails = 0;
  const run = () => fetchActive(token)
    .then((rows) => {
      const alarms = rows.map(pick).filter(Boolean);
      store.write('padtecalarms', alarms);
      store.write('padtecmeta', [{ configured: true, ok: true, updatedAt: new Date().toISOString(), scanned: rows.length }]);
      if (fails) console.log('Padtec alarm collector back: ' + alarms.length + ' alarms');
      fails = 0;
    })
    .catch((e) => {
      const meta = store.read('padtecmeta')[0] || {};
      store.write('padtecmeta', [Object.assign(meta, { configured: true, ok: false, error: e.message, failedAt: new Date().toISOString() })]);
      if (fails++ % 30 === 0) console.error('Padtec alarm collector: ' + e.message);
    });
  console.log('Padtec alarm collector on: ' + nms.BASE + ' every ' + INTERVAL / 1000 + ' s');
  run();
  setInterval(run, INTERVAL).unref();
}

/* GET /api/network/padtec — last snapshot (kept on failure, with ok:false + error) */
function response(store) {
  const meta = store.read('padtecmeta')[0] || { configured: false };
  return {
    configured: meta.configured !== false,
    ok: meta.ok !== false,
    error: meta.ok === false ? meta.error || 'erro' : null,
    updatedAt: meta.updatedAt || null,
    alarms: store.read('padtecalarms')
  };
}

module.exports = { start, response, category };
