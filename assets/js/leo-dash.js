/* ═══════════════════════════════
   AMAZON LEO — live dashboard
   Circuit status and network events come from Zabbix, which POSTs every
   problem / recovery to /api/zabbix/webhook (see server/zabbix.js).
   The page polls the "leoalarms" collection while it is open.
   ═══════════════════════════════ */

var LEO_SITES = {
  SLZ501: { city: 'Ocara / CE',   addr: 'Serragem, Ocara - CE',                         lat: -4.428036, lng: -38.401117 },
  CPV501: { city: 'Sanharó / PE', addr: 'Rod. Luiz Gonzaga - Sanharó, PE, 55250-000', lat: -8.369604, lng: -36.592515 }
};
var LEO_CIRCUITS = [   /* server/zabbix.js keeps the same id -> site map */
  { id: 'RJOOCR964161',    site: 'SLZ501', z: 'Equinix RJ2', zAddr: 'Estr. Adhemar Bebiano, 1380 - Del Castilho, Rio de Janeiro/RJ' },
  { id: 'SPOOCR964174',    site: 'SLZ501', z: 'Equinix RJ2', zAddr: 'Estr. Adhemar Bebiano, 1380 - Del Castilho, Rio de Janeiro/RJ' },
  { id: '21-90090-252671', site: 'CPV501', z: 'Equinix SP4', zAddr: 'Av. Ceci, 1900 - Tamboré, Barueri/SP' },
  { id: '21-90090-252668', site: 'CPV501', z: 'Equinix RJ2', zAddr: 'Estr. Adhemar Bebiano, 1380 - Del Castilho, Rio de Janeiro/RJ' }
];
/* Zabbix severities 0..5; a problem at "High" or above means the circuit is down */
var LEO_SEV = [
  { name: 'Não classificada', cls: 'sev0' }, { name: 'Informação', cls: 'sev1' }, { name: 'Atenção', cls: 'sev2' },
  { name: 'Média', cls: 'sev3' }, { name: 'Alta', cls: 'sev4' }, { name: 'Desastre', cls: 'sev5' }
];
var LEO_DOWN_SEV = 4;
var LEO_STATUS = {
  up:      { label: 'Operacional',   cls: 'up',   icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' },
  warn:    { label: 'Em alerta',     cls: 'warn', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
  down:    { label: 'Indisponível', cls: 'down', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' },
  nodata:  { label: 'Sem dados',     cls: 'nodata', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>' }
};

var leoAlarms = [], leoMeta = null, leoSite = '', leoState = 'all', leoMinSev = 0, leoTimer = 0, leoTick = 0, leoFirst = true;

function openLeoDash() {
  showPage('pg-leo-dash');
  leoRender();
  leoPoll();
  clearInterval(leoTimer); clearInterval(leoTick);
  leoTimer = setInterval(function() {
    var pg = document.getElementById('pg-leo-dash');
    if (!pg || !pg.classList.contains('active')) { clearInterval(leoTimer); clearInterval(leoTick); return; }
    leoPoll();
  }, 10000);
  leoTick = setInterval(leoTickDurations, 1000);   /* live "há 3 min" / durations */
}

function leoPoll() {
  Promise.all([_apiGet('/leoalarms'), _apiGet('/leozbxmeta')]).then(function(r) {
    var changed = JSON.stringify(r[0]) !== JSON.stringify(leoAlarms) || JSON.stringify(r[1][0] || null) !== JSON.stringify(leoMeta);
    leoAlarms = r[0] || []; leoMeta = r[1][0] || null;
    if (changed || leoFirst) leoRender();
    leoFirst = false;
  }).catch(function() {
    var pill = document.getElementById('leo-zbx');
    if (pill) { pill.className = 'leo-zbx off'; pill.innerHTML = '<i></i>Portal sem conexão com a API'; }
  });
}

/* ── helpers ── */
function leoAgo(iso) {
  var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
  if (s < 86400) return 'há ' + Math.floor(s / 3600) + 'h' + (Math.floor(s / 60) % 60 ? ' ' + Math.floor(s / 60) % 60 + 'min' : '');
  var d = Math.floor(s / 86400);
  return 'há ' + d + (d === 1 ? ' dia' : ' dias');
}
function leoDur(a, b) {
  var s = Math.max(0, ((b ? new Date(b) : new Date()) - new Date(a)) / 1000);
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.floor(s / 60) + 'min ' + String(Math.floor(s % 60)).padStart(2, '0') + 's';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + String(Math.floor(s / 60) % 60).padStart(2, '0') + 'min';
  return Math.floor(s / 86400) + 'd ' + Math.floor(s / 3600) % 24 + 'h';
}
function leoTime(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* circuit status = worst active problem mapped to it; no data until Zabbix has sent something */
function leoCircuitState(c) {
  var act = leoAlarms.filter(function(a) { return a.status === 'problem' && a.circuit === c.id; });
  /* site-level problems (no circuit id) affect both circuits of the site */
  act = act.concat(leoAlarms.filter(function(a) { return a.status === 'problem' && !a.circuit && a.site === c.site; }));
  act.sort(function(a, b) { return b.severity - a.severity || String(a.start).localeCompare(String(b.start)); });
  var last = leoAlarms.filter(function(a) { return a.circuit === c.id || (!a.circuit && a.site === c.site); })[0];
  var st = !leoMeta ? 'nodata' : !act.length ? 'up' : act[0].severity >= LEO_DOWN_SEV ? 'down' : 'warn';
  return { st: st, active: act, last: last };
}

/* ── render ── */
function leoRender() {
  leoRenderHead();
  leoRenderCircuits();
  leoRenderEvents();
}

function leoRenderHead() {
  var pill = document.getElementById('leo-zbx');
  if (pill) {
    if (!leoMeta) { pill.className = 'leo-zbx wait'; pill.innerHTML = '<i></i>Aguardando o primeiro evento do Zabbix'; }
    else {
      var stale = Date.now() - new Date(leoMeta.lastReceivedAt).getTime() > 24 * 3600 * 1000;
      pill.className = 'leo-zbx ' + (stale ? 'wait' : 'on');
      pill.innerHTML = '<i></i>Zabbix conectado · último evento <span data-ago="' + leoMeta.lastReceivedAt + '">' + leoAgo(leoMeta.lastReceivedAt) + '</span>';
    }
  }
  document.querySelectorAll('#leo-site button').forEach(function(b) { b.classList.toggle('sel', b.dataset.s === leoSite); });

  /* summary: circuits up, active alarms, events in the last 24h */
  var cs = LEO_CIRCUITS.filter(function(c) { return !leoSite || c.site === leoSite; });
  var states = cs.map(leoCircuitState);
  var nUp = states.filter(function(s) { return s.st === 'up'; }).length;
  var inSite = function(a) { return !leoSite || a.site === leoSite; };
  var active = leoAlarms.filter(function(a) { return a.status === 'problem' && inSite(a); }).length;
  var day = leoAlarms.filter(function(a) { return inSite(a) && Date.now() - new Date(a.start).getTime() < 86400000; }).length;
  var worst = states.some(function(s) { return s.st === 'down'; }) ? 'down' : states.some(function(s) { return s.st === 'warn'; }) ? 'warn' : leoMeta ? 'up' : 'nodata';
  document.getElementById('leo-summary').innerHTML =
      '<div class="leo-kpi ' + LEO_STATUS[worst].cls + '"><span class="leo-kpi-ic">' + LEO_STATUS[worst].icon + '</span><div><b>' + (leoMeta ? nUp + '/' + cs.length : '—') + '</b><span>circuitos operacionais</span></div></div>'
    + '<div class="leo-kpi"><div><b>' + active + '</b><span>' + (active === 1 ? 'alarme ativo' : 'alarmes ativos') + '</span></div></div>'
    + '<div class="leo-kpi"><div><b>' + day + '</b><span>eventos nas últimas 24h</span></div></div>';
}

function leoRenderCircuits() {
  var wrap = document.getElementById('leo-sites');
  var sites = Object.keys(LEO_SITES).filter(function(s) { return !leoSite || s === leoSite; });
  wrap.className = 'leo-sites' + (sites.length === 1 ? ' one' : '');
  wrap.innerHTML = sites.map(function(sid) {
    var site = LEO_SITES[sid], cs = LEO_CIRCUITS.filter(function(c) { return c.site === sid; });
    var states = cs.map(leoCircuitState);
    var nDown = states.filter(function(s) { return s.st === 'down'; }).length;
    var siteSt = !leoMeta ? 'nodata' : nDown === cs.length ? 'down' : nDown || states.some(function(s) { return s.st === 'warn'; }) ? 'warn' : 'up';
    var siteMsg = { nodata: 'Sem dados do Zabbix', up: 'Todos os circuitos operacionais', warn: nDown ? 'Operando com redundância — 1 circuito fora' : 'Alarme em andamento', down: 'Site indisponível — todos os circuitos fora' }[siteSt];
    return '<section class="leo-site ' + LEO_STATUS[siteSt].cls + '">'
      + '<header><div><div class="leo-site-id">' + sid + '</div><div class="leo-site-city">' + site.city + '</div></div>'
      +   '<span class="leo-badge ' + LEO_STATUS[siteSt].cls + '">' + LEO_STATUS[siteSt].icon + siteMsg + '</span></header>'
      + '<a class="leo-addr" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + site.lat + ',' + site.lng + '">'
      +   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>'
      +   esc(site.addr) + ' · ' + site.lat.toFixed(5) + ', ' + site.lng.toFixed(5) + '</a>'
      + '<div class="leo-circuits">' + cs.map(function(c, i) { return leoCircuitCard(c, states[i]); }).join('') + '</div>'
      + '</section>';
  }).join('');
}

function leoCircuitCard(c, s) {
  var S = LEO_STATUS[s.st], a = s.active[0];
  var detail = a
    ? '<div class="leo-cdetail"><span class="leo-sev ' + LEO_SEV[a.severity].cls + '">' + LEO_SEV[a.severity].name + '</span>' + esc(a.trigger)
      + '<em>desde ' + leoTime(a.start) + ' · <span data-dur="' + a.start + '">' + leoDur(a.start) + '</span></em>'
      + (s.active.length > 1 ? '<em>+' + (s.active.length - 1) + ' alarme(s) ativo(s)</em>' : '') + '</div>'
    : s.last ? '<div class="leo-cdetail quiet">Último evento: ' + esc(s.last.trigger) + ' · <span data-ago="' + (s.last.end || s.last.start) + '">' + leoAgo(s.last.end || s.last.start) + '</span></div>'
    : '<div class="leo-cdetail quiet">' + (leoMeta ? 'Nenhum evento recebido para este circuito' : 'Configure o webhook do Zabbix para ver o status') + '</div>';
  return '<div class="leo-circuit ' + S.cls + '">'
    + '<div class="leo-ctop"><span class="leo-light"><i></i></span>'
    +   '<span class="leo-cstatus">' + S.icon + S.label + '</span></div>'
    + '<div class="leo-cid">' + esc(c.id) + '</div>'
    + '<div class="leo-route"><b>' + c.site + '</b><span class="leo-route-line"><i></i></span><b>' + esc(c.z) + '</b></div>'
    + '<div class="leo-zaddr">' + esc(c.zAddr) + '</div>'
    + detail
    + '</div>';
}

function leoRenderEvents() {
  var list = leoAlarms.filter(function(a) {
    if (leoSite && a.site !== leoSite) return false;
    if (leoState === 'active' && a.status !== 'problem') return false;
    if (leoState === 'resolved' && a.status !== 'resolved') return false;
    return a.severity >= leoMinSev;
  });
  /* active problems first, then most recent */
  list.sort(function(a, b) { return (a.status === 'problem' ? 0 : 1) - (b.status === 'problem' ? 0 : 1) || String(b.start).localeCompare(String(a.start)); });
  document.querySelectorAll('#leo-state button').forEach(function(b) { b.classList.toggle('sel', b.dataset.v === leoState); });
  var el = document.getElementById('leo-events');
  document.getElementById('leo-ev-count').textContent = list.length ? list.length + (list.length === 1 ? ' evento' : ' eventos') : '';
  if (!list.length) {
    el.innerHTML = '<div class="leo-empty">' + (leoMeta ? '<b>Nenhum evento neste filtro</b><span>Os eventos do Zabbix aparecem aqui em tempo real.</span>'
      : '<b>Nenhum evento recebido ainda</b><span>Configure o webhook do Zabbix (abaixo) para os alarmes chegarem aqui automaticamente.</span>') + '</div>';
    return;
  }
  el.innerHTML = '<div class="leo-ev-head"><span>Severidade</span><span>Evento</span><span>Circuito / site</span><span>Início</span><span>Duração</span></div>'
    + list.slice(0, 200).map(function(a) {
      var act = a.status === 'problem';
      return '<div class="leo-ev ' + (act ? 'act' : 'ok') + '">'
        + '<span><span class="leo-sev ' + LEO_SEV[a.severity].cls + '">' + LEO_SEV[a.severity].name + '</span></span>'
        + '<span class="leo-ev-main"><span class="leo-ev-state">' + (act ? 'PROBLEMA' : 'RESOLVIDO') + '</span>' + esc(a.trigger)
        +   '<em>' + esc(a.host) + (a.opdata ? ' · ' + esc(a.opdata) : '') + (a.acknowledged ? ' · reconhecido' : '') + '</em></span>'
        + '<span class="leo-ev-where">' + (a.circuit ? '<b>' + esc(a.circuit) + '</b>' : '') + (a.site ? '<em>' + esc(a.site) + '</em>' : '<em class="unmapped" title="Inclua o ID do circuito ou do site no host, no trigger ou numa tag circuit / site">não mapeado</em>') + '</span>'
        + '<span class="leo-ev-time">' + leoTime(a.start) + '</span>'
        + '<span class="leo-ev-dur">' + (act ? '<span data-dur="' + a.start + '">' + leoDur(a.start) + '</span>' : leoDur(a.start, a.end)) + '</span>'
        + '</div>';
    }).join('');
}

function leoTickDurations() {
  document.querySelectorAll('#pg-leo-dash [data-dur]').forEach(function(e) { e.textContent = leoDur(e.dataset.dur); });
  document.querySelectorAll('#pg-leo-dash [data-ago]').forEach(function(e) { e.textContent = leoAgo(e.dataset.ago); });
}

/* ── filters ── */
function leoSetSite(s) { leoSite = s; leoRender(); }
function leoSetState(v) { leoState = v; leoRenderEvents(); }
function leoSetSev(v) { leoMinSev = +v; leoRenderEvents(); }

/* ── setup panel ── */
function leoCopy(id) {
  var t = document.getElementById(id).textContent;
  var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  ta.remove();
  var b = document.querySelector('[data-copy="' + id + '"]');
  if (b) { var o = b.textContent; b.textContent = 'Copiado!'; setTimeout(function() { b.textContent = o; }, 1400); }
}
function leoInitSetup() {
  var u = document.getElementById('leo-hook-url');
  if (u) u.textContent = location.protocol + '//' + location.host + '/api/zabbix/webhook';
}
