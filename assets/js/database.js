/* ═══════════════════════════════════
   DATABASE — synced with the shared server,
   cached locally so reads stay synchronous
   ═══════════════════════════════════ */

var API_BASE = '/api';

var _casesCache   = [];
var _demandsCache = [];
var _rmasCache    = [];
var _lambdasCache = [];
var _netposCache  = [];

(function loadLocalCache() {
  try { _casesCache   = JSON.parse(localStorage.getItem('net_cases')   || '[]'); } catch (e) { _casesCache   = []; }
  try { _demandsCache = JSON.parse(localStorage.getItem('net_demands') || '[]'); } catch (e) { _demandsCache = []; }
  try { _rmasCache    = JSON.parse(localStorage.getItem('net_rmas')    || '[]'); } catch (e) { _rmasCache    = []; }
  try { _lambdasCache = JSON.parse(localStorage.getItem('net_lambdas') || '[]'); } catch (e) { _lambdasCache = []; }
  try { _netposCache  = JSON.parse(localStorage.getItem('net_netpos')  || '[]'); } catch (e) { _netposCache  = []; }
})();

function _apiGet(path) {
  return fetch(API_BASE + path).then(function(r) {
    if (!r.ok) throw new Error('GET ' + path + ' failed: ' + r.status);
    return r.json();
  });
}
function _apiPut(path, body) {
  return fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(function(e) { console.error('Sync failed:', path, e); });
}

/* Pulls the latest cases + demands + rmas + lambdas from the server into the local cache.
   Falls back silently to whatever is already cached (e.g. offline, local dev without the API). */
function dbSync() {
  return Promise.all([
    _apiGet('/cases').then(function(a)   { _casesCache   = a; localStorage.setItem('net_cases',   JSON.stringify(a)); }),
    _apiGet('/demands').then(function(a) { _demandsCache = a; localStorage.setItem('net_demands', JSON.stringify(a)); }),
    _apiGet('/rmas').then(function(a)    { _rmasCache    = a; localStorage.setItem('net_rmas',    JSON.stringify(a)); }),
    _apiGet('/lambdas').then(function(a) { _lambdasCache = a; localStorage.setItem('net_lambdas', JSON.stringify(a)); }),
    _apiGet('/netpos').then(function(a)  { _netposCache  = a; localStorage.setItem('net_netpos',  JSON.stringify(a)); })
  ]).catch(function(e) { console.error('Server sync unavailable, using local cache:', e); });
}

/* Polls the server so changes made by other users show up without a manual reload. */
function dbStartPolling(intervalMs) {
  setInterval(function() {
    Promise.all([_apiGet('/cases'), _apiGet('/demands'), _apiGet('/rmas'), _apiGet('/lambdas'), _apiGet('/netpos')]).then(function(res) {
      var cases = res[0], demands = res[1], rmas = res[2], lambdas = res[3], netpos = res[4];
      var changed = JSON.stringify(cases) !== JSON.stringify(_casesCache) ||
                    JSON.stringify(demands) !== JSON.stringify(_demandsCache) ||
                    JSON.stringify(rmas) !== JSON.stringify(_rmasCache) ||
                    JSON.stringify(lambdas) !== JSON.stringify(_lambdasCache) ||
                    JSON.stringify(netpos) !== JSON.stringify(_netposCache);
      if (!changed) return;
      _casesCache   = cases;
      _demandsCache = demands;
      _rmasCache    = rmas;
      _lambdasCache = lambdas;
      _netposCache  = netpos;
      localStorage.setItem('net_cases',   JSON.stringify(cases));
      localStorage.setItem('net_demands', JSON.stringify(demands));
      localStorage.setItem('net_rmas',    JSON.stringify(rmas));
      localStorage.setItem('net_lambdas', JSON.stringify(lambdas));
      localStorage.setItem('net_netpos',  JSON.stringify(netpos));
      if (typeof onDbExternalUpdate === 'function') onDbExternalUpdate();
    }).catch(function() { /* offline — keep showing cached data */ });
  }, intervalMs || 8000);
}

/* ── CASES (timeline tickets) ── */
function dbGetAll() { return _casesCache; }
function dbSave(a) {
  _casesCache = a;
  localStorage.setItem('net_cases', JSON.stringify(a));
  _apiPut('/cases', a);
}
function dbGetCase(id) {
  return dbGetAll().find(function(c) { return c.ticketId === id; }) || null;
}
function dbUpsert(obj) {
  var a = dbGetAll().slice();
  var i = a.findIndex(function(c) { return c.ticketId === obj.ticketId; });
  if (i >= 0) { a[i] = obj; } else { a.unshift(obj); }
  dbSave(a);
  updateBadge();
}
function dbDelete(id) {
  dbSave(dbGetAll().filter(function(c) { return c.ticketId !== id; }));
  updateBadge();
}

/* ── DEMANDS (note board) ── */
function dmdGetAll() { return _demandsCache; }
function dmdSave(a) {
  _demandsCache = a;
  localStorage.setItem('net_demands', JSON.stringify(a));
  _apiPut('/demands', a);
}
function dmdDelete(id) {
  dmdSave(dmdGetAll().filter(function(d) { return d.id !== id; }));
}

/* ── RMAS (equipment returns) ── */
function rmaGetAll() { return _rmasCache; }
function rmaSave(a) {
  _rmasCache = a;
  localStorage.setItem('net_rmas', JSON.stringify(a));
  _apiPut('/rmas', a);
}

/* ── LAMBDAS (DWDM channels) + site position overrides ── */
function lmbGetAll() { return _lambdasCache; }
function lmbSave(a) {
  _lambdasCache = a;
  localStorage.setItem('net_lambdas', JSON.stringify(a));
  _apiPut('/lambdas', a);
}
function netposGetAll() { return _netposCache; }
function netposSave(a) {
  _netposCache = a;
  localStorage.setItem('net_netpos', JSON.stringify(a));
  _apiPut('/netpos', a);
}
