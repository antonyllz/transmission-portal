/* ═══════════════════════════════════════
   NOTIFICATION FEED — every network event the portal knows about, as one list
   of transitions (newest first) for the portal-wide alerts:

     trechos      segment alarms from Zabbix (netalarms): down / normalized
     dwdm         host group PADTEC (dwdmalarms): problem / resolved
     leo          Amazon Leo alarms (leoalarms): problem / resolved
     padtec       Padtec NMS infra alarms (energia, temperatura, resposta): new
     xc           cross-connect ports over SNMP (ifmon): down / up / flap

   GET /api/notify/feed?hours=24 → { generatedAt, events: [{ id, at, kind, level,
   title, body, route }] }. level: down | up | flap | warn. Ids are stable, so the
   browser announces each one once.
   ═══════════════════════════════════════ */
'use strict';
const netevents = require('./netevents');

const SEV = ['Não classificada', 'Informação', 'Atenção', 'Média', 'Alta', 'Desastre'];
const sevName = (e) => e.severityName || SEV[e.severity] || '';
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function feed(q, store, ifmon) {
  const hours = Math.min(72, Math.max(1, parseInt(q.hours, 10) || 24));
  const from = Date.now() - hours * 3600000;
  const out = [];
  const add = (e) => { if (e.at && Date.parse(e.at) >= from) out.push(e); };

  /* trechos */
  for (const raw of store.read('netalarms')) {
    if (!raw.host && !raw.hostName) continue;
    const e = Object.assign({}, raw, netevents.parseSegment(raw));
    const name = e.a && e.b ? e.a.key + ' × ' + e.b.key : e.a ? e.a.key : (e.hostName || e.host);
    const body = clip(e.trigger, 160);
    add({ id: 'net:' + e.eventId + ':p', at: e.start, kind: 'trechos', level: 'down',
      title: 'Trecho down · ' + name, body, route: '' });
    if (e.status !== 'problem' && e.end)
      add({ id: 'net:' + e.eventId + ':r', at: e.end, kind: 'trechos', level: 'up',
        title: 'Trecho normalizado · ' + name, body, route: '' });
  }

  /* DWDM Padtec (Zabbix) */
  for (const e of store.read('dwdmalarms')) {
    const host = e.hostName || e.host;
    add({ id: 'dwdm:' + e.eventId + ':p', at: e.start, kind: 'dwdm', level: e.severity >= 4 ? 'down' : 'warn', severity: e.severity,
      title: 'DWDM ' + sevName(e) + ' · ' + host, body: clip(e.trigger, 160), route: '' });
    if (e.status !== 'problem' && e.end)
      add({ id: 'dwdm:' + e.eventId + ':r', at: e.end, kind: 'dwdm', level: 'up',
        title: 'DWDM resolvido · ' + host, body: clip(e.trigger, 160), route: '' });
  }

  /* Amazon Leo (Zabbix) */
  for (const e of store.read('leoalarms')) {
    if (e.severity < 2) continue;
    const where = e.circuit || e.site || e.hostName || e.host;
    add({ id: 'leo:' + e.eventId + ':p', at: e.start, kind: 'leo', level: e.severity >= 4 ? 'down' : 'warn', severity: e.severity,
      title: 'Amazon Leo · ' + where, body: clip(e.trigger, 160), route: 'amazon-leo/dashboard' });
    if (e.status !== 'problem' && e.end)
      add({ id: 'leo:' + e.eventId + ':r', at: e.end, kind: 'leo', level: 'up',
        title: 'Amazon Leo normalizado · ' + where, body: clip(e.trigger, 160), route: 'amazon-leo/dashboard' });
  }

  /* Padtec NMS infra (snapshot of active alarms: only "new" is known) */
  const CAT = { energia: 'Energia', temperatura: 'Temperatura', resposta: 'Sem resposta' };
  for (const a of store.read('padtecalarms')) {
    add({ id: 'padtec:' + a.id, at: a.start, kind: 'padtec', level: a.severity === 'critical' || a.severity === 'major' ? 'down' : 'warn',
      title: 'Infra Padtec · ' + (CAT[a.category] || a.category) + ' · ' + a.site, body: clip(a.name + (a.resource ? ' — ' + a.resource : ''), 160), route: '' });
  }

  /* cross-connect */
  for (const e of ifmon.events({ hours }, store).events) {
    const what = e.type === 'down' ? (e.status === 'admin-down' ? 'desativada (admin down)' : 'caiu')
      : e.type === 'up' ? 'voltou' : 'flapou';
    add({ id: 'xc:' + e.id, at: e.at, kind: 'xc', level: e.type === 'down' ? 'down' : e.type === 'up' ? 'up' : 'flap', dur: e.dur,
      title: (e.type === 'down' ? 'DOWN' : e.type === 'up' ? 'UP' : 'FLAP') + ' · ' + e.short + ' ' + e.ifName,
      body: 'Porta ' + e.side + ' ' + what + ' — ' + e.path, route: 'amazon-leo/dashboard' });
  }

  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { generatedAt: new Date().toISOString(), events: out.slice(0, 300) };
}

module.exports = { feed };
