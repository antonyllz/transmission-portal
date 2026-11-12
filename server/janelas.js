/* ═══════════════════════════════════════
   JANELAS PROGRAMADAS — maintenance windows, synced from the Excel sheet
   (Janelas_Programadas.xlsx, table on sheet "Janelas") by a Power Automate flow.
   The flow only has the standard RSS connector, so each row arrives as a GET:

     GET /api/janelas/sync?token=<feed token>&run=<flow run id>&row=<row as JSON>
     GET /api/janelas/sync?token=<feed token>&run=<flow run id>&end=1&count=<rows>

   `row` is the Excel row as Power Automate lists it ({"AP": …, "Cliente": …});
   header names are matched loosely (case/accents/spaces ignored). The final
   `end` call closes the run: when every row of it arrived (count matches),
   windows that are no longer in the sheet are removed. Answers are tiny RSS
   documents, so the RSS connector accepts them.
   Token: the same as the Amazon Leo feed (env FEED_TOKEN or data/feed-token.txt).
   ═══════════════════════════════════════ */
'use strict';

const TZ = '-03:00';                 /* the sheet's times are local (Brasília) wall times */
const runs = new Map();              /* run id → { aps: Set, rows, at } (in memory; a run lasts seconds) */

const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = (n) => String(n).padStart(2, '0');
const wall = (y, mo, d, h, mi, s) => `${y}-${pad(mo)}-${pad(d)}T${pad(h || 0)}:${pad(mi || 0)}:${pad(s || 0)}${TZ}`;

/* Excel serial (46343.5), ISO from Power Automate ("2026-11-17T00:00:00.000Z" — Excel has no
   time zone, so that "Z" is really local time) or "17/11/2026 00:00" → ISO with -03:00 */
function toISO(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n < 20000 || n > 80000) return null;
    const d = new Date(Math.round((n - 25569) * 86400000));
    return wall(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) return wall(+m[1], +m[2], +m[3], +m[4] || 0, +m[5] || 0, +m[6] || 0);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (m) return wall(+m[3], +m[2], +m[1], +m[4] || 0, +m[5] || 0, +m[6] || 0);
  return null;
}
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
const yes = (v) => /^(s|sim|y|yes|true|1)$/i.test(String(v ?? '').trim());
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

/* one Excel row → window record */
function normalize(row) {
  const f = {};
  Object.keys(row || {}).forEach((k) => { f[key(k)] = row[k]; });
  const ap = str(f.ap, 80);
  if (!ap) return null;
  const servicos = str(f.servicosafetados, 8000).split(/\s*[;\n]\s*/).map((s) => s.trim()).filter(Boolean);
  return {
    ap,
    cliente: str(f.cliente, 200),
    status: str(f.status, 60),
    revisao: num(f.revisao) ?? 0,
    interrupcao: yes(f.interrupcao),
    inicio: toISO(f.inicio),
    fim: toISO(f.fim),
    duracaoH: num(f.duracaoh),
    qtdServicos: num(f.qtdservicos) ?? servicos.length,
    servicos,
    descricao: str(f.descricao, 4000),
    responsavel: str(f.responsavel, 300),
    solicitacao: toISO(f.solicitacao),
    atualizadoEm: toISO(f.atualizadoem)
  };
}

function rss(title, items) {
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const now = new Date();
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>' + x(title) +
    '</title><link>http://transmission-portal/</link><description>Janelas programadas</description>' +
    items.map((i, n) => '<item><title>' + x(i) + '</title><pubDate>' + now.toUTCString() + '</pubDate><guid isPermaLink="false">jan-' +
      now.getTime() + '-' + n + '</guid></item>').join('') + '</channel></rss>\n';
}

/* GET /api/janelas/sync — returns the RSS text */
function sync(q, store) {
  const run = str(q.run, 120) || 'manual';
  const now = new Date().toISOString();
  for (const [id, r] of runs) if (Date.now() - r.at > 6 * 3600e3) runs.delete(id);   /* forget old runs */
  const r = runs.get(run) || { aps: new Set(), rows: 0, at: Date.now() };
  runs.set(run, r);
  const meta = store.read('janelasmeta')[0] || {};

  if (q.end) {                                           /* end of a run: drop windows no longer in the sheet */
    const count = parseInt(q.count, 10);
    let removed = 0;
    if (Number.isFinite(count) && count === r.rows && r.aps.size) {
      const list = store.read('janelas');
      const keep = list.filter((w) => r.aps.has(w.ap));
      removed = list.length - keep.length;
      if (removed) store.write('janelas', keep);
    }
    Object.assign(meta, { lastSyncAt: now, lastRun: run, lastCount: r.aps.size, complete: count === r.rows });
    store.write('janelasmeta', [meta]);
    console.log('janelas: run ' + run + ' ended — ' + r.rows + '/' + (q.count || '?') + ' rows, ' + r.aps.size + ' windows' + (removed ? ', removed ' + removed : ''));
    runs.delete(run);
    return rss('Janelas', ['ok: ' + r.rows + ' rows' + (removed ? ', ' + removed + ' removed' : '') +
      (Number.isFinite(count) && count !== r.rows ? ' (count mismatch: nothing removed)' : '')]);
  }

  r.rows++;
  let row;
  try { row = JSON.parse(q.row || ''); } catch (e) { throw new Error('row must be the Excel row as JSON'); }
  const w = normalize(row);
  if (!w) return rss('Janelas', ['ignored: row without AP']);
  r.aps.add(w.ap);
  const list = store.read('janelas');
  const i = list.findIndex((x) => x.ap === w.ap);
  const rec = Object.assign(i >= 0 ? list[i] : { firstSeenAt: now }, w, { syncedAt: now });
  if (i < 0) list.push(rec);
  list.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  store.write('janelas', list);
  Object.assign(meta, { lastRowAt: now });
  if (!meta.firstSyncAt) meta.firstSyncAt = now;
  store.write('janelasmeta', [meta]);
  return rss('Janelas', ['ok: ' + w.ap]);
}

/* GET /api/network/janelas — what the portal page shows */
function response(store) {
  const meta = store.read('janelasmeta')[0] || {};
  return {
    windows: store.read('janelas'),
    firstSyncAt: meta.firstSyncAt || null,
    lastSyncAt: meta.lastSyncAt || meta.lastRowAt || null,
    lastCount: meta.lastCount ?? null
  };
}

module.exports = { sync, response, normalize, toISO };
